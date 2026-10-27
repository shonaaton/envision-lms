import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { createInvoice, invoiceBreakup } from "@/lib/fees";
import { FeeAssignment, FeePlan, Invoice } from "@/models/Fee";
import { User } from "@/models/User";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ArrowLeft, MailWarning, Send } from "lucide-react";
import { InvoiceCreationForm, type CreateInvoiceResult, type CreatedInvoiceSummary } from "@/components/fees/InvoiceCreationForm";
import { getFeaturePermissionState } from "@/lib/featureAccess";
import { isFeesManager, requireFeesAccess } from "@/lib/feesAccess";

export const dynamic = "force-dynamic";

function paise(value: FormDataEntryValue | null) {
  return Math.round(Number(value || 0) * 100);
}

function queryValue(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return typeof raw === "string" ? raw : "";
}

function createdInvoiceSummary(invoice: any, alreadyCreated = false): CreatedInvoiceSummary {
  return {
    id: invoice._id.toString(),
    invoiceNumber: invoice.invoiceNumber,
    title: invoice.title,
    totalAmount: Number(invoice.totalAmount || 0),
    invoiceMode: invoice.invoiceMode || "non_gst",
    createdAt: new Date(invoice.createdAt || Date.now()).toISOString(),
    studentId: String(invoice.student?._id || invoice.student || ""),
    studentName: invoice.student?.name || "",
    alreadyCreated,
  };
}

async function createManualInvoice(formData: FormData): Promise<CreateInvoiceResult> {
  "use server";
  const session = await requireFeesAccess("invoice", "invoices");
  if (!session) return { status: "error", error: "You do not have permission to create invoices." };
  await dbConnect();

  // The same submission arriving twice (double click, slow network retry)
  // gets back the invoice it already made.
  const creationKey = String(formData.get("creationKey") || "").trim().slice(0, 80);
  if (creationKey) {
    const existing: any = await Invoice.findOne({ creationKey }).lean();
    if (existing) return { status: "created", invoice: createdInvoiceSummary(existing, true) };
  }

  const studentId = String(formData.get("student") || "");
  const student: any = studentId ? await User.findOne({ _id: studentId, role: "student" }).select("_id name").lean().catch(() => null) : null;
  if (!student) return { status: "error", error: "Choose a student first." };

  const planId = String(formData.get("plan") || "");
  const plan: any = planId ? await FeePlan.findById(planId).lean().catch(() => null) : null;
  if (planId && !plan) return { status: "error", error: "That fee plan no longer exists. Pick another or create a custom invoice." };
  const invoiceType: "monthly" | "credits" | "manual" = plan ? plan.type : "manual";

  const amount = paise(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return { status: "error", error: "Enter an amount greater than zero." };
  const title = String(formData.get("title") || "").trim() || plan?.name || "Custom Invoice";
  const issueDate = new Date(String(formData.get("invoiceDate") || ""));
  const dueDate = new Date(String(formData.get("dueDate") || ""));
  if (Number.isNaN(issueDate.getTime()) || Number.isNaN(dueDate.getTime())) return { status: "error", error: "Enter a valid invoice date and due date." };
  if (dueDate < issueDate) return { status: "error", error: "The due date cannot be before the invoice date." };
  const rawMode = String(formData.get("invoiceMode") || "non_gst");
  const invoiceMode: "included" | "excluded" | "non_gst" = rawMode === "included" || rawMode === "excluded" ? rawMode : "non_gst";
  const gstPercentage = invoiceMode === "non_gst" ? 0 : Number(formData.get("gstPercentage") || 0);
  if (invoiceMode !== "non_gst" && (!Number.isFinite(gstPercentage) || gstPercentage <= 0 || gstPercentage > 100)) {
    return { status: "error", error: "Enter a GST rate between 0 and 100, or choose No GST." };
  }

  // A matching invoice for the same student in the last day is almost always
  // an accidental repeat. Ask before making another one.
  if (String(formData.get("confirmDuplicate") || "") !== "1") {
    const expectedTotal = invoiceBreakup(amount, 0, {}, { gstMode: invoiceMode, gstPercentage }).totalAmount;
    const recent: any[] = await Invoice.find({
      student: student._id,
      status: { $ne: "cancelled" },
      totalAmount: expectedTotal,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }).sort({ createdAt: -1 }).limit(5).lean();
    if (recent.length) return { status: "duplicate", matches: recent.map((invoice) => createdInvoiceSummary(invoice)) };
  }

  try {
    const invoice: any = await createInvoice({
      student: student._id.toString(),
      plan: plan?._id?.toString(),
      type: invoiceType,
      title,
      amount,
      issueDate,
      dueDate,
      referenceNumber: String(formData.get("referenceNumber") || ""),
      credits: invoiceType === "credits" ? Number(plan?.credits || 0) : 0,
      notes: String(formData.get("notes") || "").trim(),
      invoiceMode,
      gstPercentage,
      creationKey: creationKey || undefined,
      activity: {
        actor: (session.user as any).id,
        source: "manual_admin",
        label: `Created ${invoiceType === "manual" ? "custom" : invoiceType} invoice`,
      },
    });
    revalidatePath("/fees/invoices");
    return { status: "created", invoice: createdInvoiceSummary(invoice) };
  } catch (error: any) {
    if (error?.code === 11000 && error?.keyPattern?.creationKey && creationKey) {
      const existing: any = await Invoice.findOne({ creationKey }).lean();
      if (existing) return { status: "created", invoice: createdInvoiceSummary(existing, true) };
    }
    console.error("Manual invoice creation failed", error);
    return { status: "error", error: "The invoice could not be created. Check the invoice list before trying again." };
  }
}

export default async function NewInvoicePage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) redirect("/login");
  const permissions = await getFeaturePermissionState("invoices", session!.user as any, ["view", "invoice"]);
  if (!permissions.view || !permissions.invoice || !isFeesManager((session!.user as any)?.role)) redirect("/fees/invoices");
  await dbConnect();
  const params = searchParams ? await searchParams : {};
  // The form lands on ?created= after saving, so the confirmation survives the
  // page refresh that follows the save.
  const createdInvoiceId = queryValue(params, "created");
  const [createdInvoiceDoc, students, plans, assignments] = await Promise.all([
    /^[a-f0-9]{24}$/i.test(createdInvoiceId) ? Invoice.findById(createdInvoiceId).populate("student", "name").lean() : Promise.resolve(null),
    User.find({ role: "student" }, { name: 1, username: 1, isActive: 1 }).sort({ name: 1 }).lean(),
    FeePlan.find({ isActive: true }).sort({ name: 1 }).lean(),
    FeeAssignment.find({}, { student: 1, plan: 1 }).lean(),
  ]);
  const createdInvoice = createdInvoiceDoc ? createdInvoiceSummary(createdInvoiceDoc) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 text-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <a href="/fees/invoices" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-brand"><ArrowLeft size={14} /> All invoices</a>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Create invoice</h1>
        </div>
        <a href="/fees/reminders" className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100">
          <MailWarning size={14} className="text-amber-700" /> Bulk reminders <Send size={13} />
        </a>
      </div>
      <InvoiceCreationForm
        key={createdInvoice?.id || "new"}
        action={createManualInvoice}
        createdInvoice={createdInvoice}
        initialStudentId={queryValue(params, "for")}
        students={students.map((student: any) => ({ id: student._id.toString(), name: student.name, username: student.username || "", isActive: student.isActive !== false }))}
        plans={plans.map((plan: any) => ({ id: plan._id.toString(), name: plan.name, type: plan.type, amount: plan.amount, credits: plan.credits || 0, gstMode: plan.gstMode || "non_gst", gstPercentage: plan.gstPercentage || 0 }))}
        assignments={assignments.map((assignment: any) => ({ studentId: assignment.student?.toString(), planId: assignment.plan?.toString() }))}
      />
    </div>
  );
}
