import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { createInvoice, ensureMonthlyInvoices, markInvoicePaid as applyInvoicePayment } from "@/lib/fees";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { formatINR } from "@/lib/utils";
import { CreditLedger, FeeAssignment, FeePlan, Invoice, Notification } from "@/models/Fee";
import { User } from "@/models/User";
import PayButton from "@/components/PayButton";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Download, Printer, Receipt, Send } from "lucide-react";
import { InvoiceCreationForm } from "@/components/fees/InvoiceCreationForm";

export const dynamic = "force-dynamic";

function paise(value: FormDataEntryValue | null) {
  return Math.round(Number(value || 0) * 100);
}

function appBaseUrl() {
  const raw = process.env.NEXTAUTH_URL || process.env.LMS_HOST || "";
  if (!raw) return "";
  return raw.startsWith("http") ? raw.replace(/\/$/, "") : `https://${raw.replace(/\/$/, "")}`;
}

async function createManualInvoice(formData: FormData) {
  "use server";
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") throw new Error("Forbidden");
  await dbConnect();
  const plan: any = await FeePlan.findById(formData.get("plan"));
  if (!plan) return;
  await createInvoice({
    student: String(formData.get("student")),
    plan: plan._id.toString(),
    type: plan.type,
    title: String(formData.get("title") || plan.name),
    amount: formData.get("amount") ? paise(formData.get("amount")) : plan.amount,
    dueDate: new Date(String(formData.get("dueDate"))),
    credits: plan.type === "credits" ? plan.credits : 0,
    notes: String(formData.get("notes") || ""),
    invoiceMode: String(formData.get("invoiceMode") || plan.gstMode || "non_gst") as any,
    gstPercentage: Number(formData.get("gstPercentage") || plan.gstPercentage || 0),
  });
  revalidatePath("/fees/invoices");
}

async function markInvoicePaid(formData: FormData) {
  "use server";
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") throw new Error("Forbidden");
  await dbConnect();
  await applyInvoicePayment(String(formData.get("invoice") || ""));
  revalidatePath("/fees/invoices");
  revalidatePath("/fees/student-fees");
  revalidatePath("/fees");
}

async function cancelInvoice(formData: FormData) {
  "use server";
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") throw new Error("Forbidden");
  await dbConnect();
  await Invoice.findByIdAndUpdate(formData.get("invoice"), { status: "cancelled" });
  revalidatePath("/fees/invoices");
}

async function deleteInvoice(formData: FormData) {
  "use server";
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") throw new Error("Forbidden");
  await dbConnect();
  const invoiceId = String(formData.get("invoice") || "");
  const invoice: any = await Invoice.findById(invoiceId).lean();
  if (!invoice) return;
  if (invoice.type === "credits" && invoice.status === "paid" && invoice.credits) {
    const assignment: any = await FeeAssignment.findOne({ student: invoice.student, type: "credits" });
    if (assignment) {
      await FeeAssignment.findByIdAndUpdate(assignment._id, {
        creditBalance: Math.max(0, Number(assignment.creditBalance || 0) - Number(invoice.credits || 0)),
        totalCreditsPurchased: Math.max(0, Number(assignment.totalCreditsPurchased || 0) - Number(invoice.credits || 0)),
      });
    }
  }
  await Promise.all([
    CreditLedger.deleteMany({ invoice: invoice._id }),
    Invoice.findByIdAndDelete(invoice._id),
  ]);
  revalidatePath("/fees/invoices");
  revalidatePath("/fees/student-fees");
  revalidatePath("/fees");
}

async function sendInvoiceToStudent(formData: FormData) {
  "use server";
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") throw new Error("Forbidden");
  await dbConnect();
  const invoice: any = await Invoice.findById(formData.get("invoice")).populate("student plan").lean();
  if (!invoice?.student?._id) return;
  const baseUrl = appBaseUrl();
  const invoiceUrl = baseUrl ? `${baseUrl}/api/fees/invoices/${invoice._id}/pdf` : "";
  await Notification.create({
    user: invoice.student._id,
    type: "invoice.sent",
    title: "Invoice available",
    message: `${invoice.invoiceNumber} is available for ${invoice.title}.`,
    metadata: { invoice: invoice._id.toString() },
  });
  await sendAutomationEmail({
    to: invoice.student.email,
    subject: `Invoice ${invoice.invoiceNumber} from Envisions Chess Academy LLP`,
    message: [
      `Hello ${invoice.student.name},`,
      `Your invoice ${invoice.invoiceNumber} for ${invoice.title} is now available.`,
      `Total amount: ${formatINR(invoice.totalAmount)}.`,
      invoiceUrl ? `Download invoice: ${invoiceUrl}` : "Please log in to your student portal to download the invoice.",
    ].join("\n\n"),
    htmlBody: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033">
        <h2 style="color:#5a1372;margin:0 0 12px">Invoice ${invoice.invoiceNumber}</h2>
        <p>Hello ${invoice.student.name},</p>
        <p>Your invoice for <strong>${invoice.title}</strong> is now available.</p>
        <p><strong>Total amount:</strong> ${formatINR(invoice.totalAmount)}</p>
        ${invoiceUrl ? `<p><a href="${invoiceUrl}" style="display:inline-block;background:#5a1372;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Download Invoice PDF</a></p>` : "<p>Please log in to your student portal to download the invoice.</p>"}
        <p style="color:#64748b;font-size:13px">Envisions Chess Academy LLP</p>
      </div>
    `,
    metadata: {
      kind: "invoice",
      invoiceId: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
      studentId: invoice.student.username || invoice.student._id.toString(),
      studentObjectId: invoice.student._id.toString(),
      invoiceUrl,
      previewText: "Your academy invoice is ready.",
    },
  });
  revalidatePath("/fees/invoices");
}

function queryValue(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return typeof raw === "string" ? raw : "";
}

export default async function FeeInvoicesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  if (role === "instructor") redirect("/dashboard");
  await dbConnect();
  await ensureMonthlyInvoices();
  const params = searchParams ? await searchParams : {};
  const selectedStudent = queryValue(params, "student");
  const invoiceFilter = role === "admin"
    ? selectedStudent ? { student: selectedStudent } : {}
    : { student: userId };
  const [invoices, students, plans, assignments] = await Promise.all([
    Invoice.find(invoiceFilter).populate("student plan").sort({ createdAt: -1 }).limit(300).lean(),
    User.find({ role: "student" }, { passwordHash: 0 }).sort({ name: 1 }).lean(),
    FeePlan.find({ isActive: true }).sort({ name: 1 }).lean(),
    FeeAssignment.find({}).lean(),
  ]);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-5 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-purple-50 text-purple-700"><Receipt size={18} /></span>
        <div><h1 className="text-2xl font-semibold">Fee Invoices</h1><p className="text-sm text-slate-500">Automatic and manual invoices with PDF download and print access.</p></div>
      </div>

      {role === "admin" && (
        <section className="mb-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-semibold">Manual Invoice Creation</h2>
          <InvoiceCreationForm
            action={createManualInvoice}
            students={students.map((student: any) => ({ id: student._id.toString(), name: student.name }))}
            plans={plans.map((plan: any) => ({ id: plan._id.toString(), name: plan.name, type: plan.type, amount: plan.amount, credits: plan.credits || 0, gstMode: plan.gstMode || "non_gst", gstPercentage: plan.gstPercentage || 0 }))}
            assignments={assignments.map((assignment: any) => ({ studentId: assignment.student?.toString(), planId: assignment.plan?.toString() }))}
          />
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        {invoices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6">
            <h3 className="font-semibold text-slate-950">No Invoices Found</h3>
            <p className="mt-1 text-sm text-slate-500">Invoices generated through portal payments or manual invoice creation will appear here.</p>
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr className="border-b"><th className="px-3 py-3">Invoice Number</th><th>Invoice Title</th>{role === "admin" && <th>Student Name</th>}{role === "admin" && <th>Student ID</th>}<th>Plan Name</th><th>Invoice Type</th><th>Invoice Date</th><th>Due Date</th><th>Tax Mode</th><th>GST Amount</th><th>Total Amount</th><th>Payment Status</th><th>Actions</th></tr></thead>
            <tbody>
              {invoices.map((invoice: any) => (
                <tr key={invoice._id} className="border-b last:border-0">
                  <td className="px-3 py-3 font-medium">{invoice.invoiceNumber}</td>
                  <td>{invoice.title}</td>
                  {role === "admin" && <td>{invoice.student?.name}</td>}
                  {role === "admin" && <td>{invoice.student?.username || invoice.student?._id?.toString?.() || "-"}</td>}
                  <td>{invoice.plan?.name || "-"}</td>
                  <td>{invoice.type === "credits" ? "Credit Plan Invoice" : invoice.type === "monthly" ? "Monthly Plan Invoice" : "Custom Invoice"}</td>
                  <td>{new Date(invoice.issueDate || invoice.createdAt).toLocaleDateString("en-IN")}</td>
                  <td>{new Date(invoice.dueDate).toLocaleDateString("en-IN")}</td>
                  <td>{invoice.invoiceMode === "included" ? "GST Included" : invoice.invoiceMode === "excluded" ? "GST Excluded" : "Non-GST"}</td>
                  <td>{invoice.invoiceMode === "non_gst" ? "-" : formatINR(invoice.gstAmount || 0)}</td>
                  <td className="font-semibold">{formatINR(invoice.totalAmount)}</td>
                  <td><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{invoice.status}</span></td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <a href={`/api/fees/invoices/${invoice._id}/pdf`} target="_blank" className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-xs">View Invoice</a>
                      <a href={`/api/fees/invoices/${invoice._id}/pdf`} className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-xs"><Download size={14} /> PDF</a>
                      <a href={`/api/fees/invoices/${invoice._id}/pdf`} target="_blank" className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-xs"><Printer size={14} /> Print</a>
                      {role === "admin" && (
                        <>
                          <form action={sendInvoiceToStudent}><input type="hidden" name="invoice" value={invoice._id.toString()} /><button className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-xs"><Send size={14} /> Send to Student</button></form>
                          <button disabled title="Parent profile is not linked yet" className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-xs text-slate-400">Send to Parent</button>
                          {invoice.status !== "paid" && invoice.status !== "cancelled" && <form action={markInvoicePaid}><input type="hidden" name="invoice" value={invoice._id.toString()} /><button className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-xs">Mark as Paid</button></form>}
                          {invoice.status !== "cancelled" && <form action={cancelInvoice}><input type="hidden" name="invoice" value={invoice._id.toString()} /><button className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-xs text-rose-700">Cancel</button></form>}
                          <form action={deleteInvoice}><input type="hidden" name="invoice" value={invoice._id.toString()} /><button className="inline-flex h-9 items-center gap-1 rounded-md border border-rose-200 px-3 text-xs text-rose-700">Delete</button></form>
                        </>
                      )}
                      {role !== "admin" && invoice.status !== "paid" && <PayButton amount={invoice.totalAmount} purpose="invoice" refId={invoice._id.toString()} label="Pay" />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </section>
    </div>
  );
}
