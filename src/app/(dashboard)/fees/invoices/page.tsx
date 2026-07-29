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
import { AlertCircle, CheckCircle2, Clock3, Download, FileText, IndianRupee, MailCheck, MailWarning, Printer, Receipt, Send, Trash2, XCircle } from "lucide-react";
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
  const invoiceId = String(formData.get("invoice") || "");
  const returnStudent = String(formData.get("studentFilter") || "");
  const returnPath = `/fees/invoices${returnStudent ? `?student=${encodeURIComponent(returnStudent)}&` : "?"}`;
  const invoice: any = await Invoice.findById(invoiceId).populate("student plan").lean();
  if (!invoice?.student?._id) redirect(`${returnPath}send=failed`);
  if (!invoice.student.email) {
    await Invoice.findByIdAndUpdate(invoice._id, { lastEmailStatus: "missing_email", lastSentAt: new Date(), lastSentTo: "" });
    revalidatePath("/fees/invoices");
    redirect(`${returnPath}send=missing_email`);
  }
  const baseUrl = appBaseUrl();
  const invoiceUrl = baseUrl ? `${baseUrl}/api/fees/invoices/${invoice._id}/pdf` : "";
  const delivery = await sendAutomationEmail({
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
  const status = delivery.delivered ? "sent" : delivery.skipped ? "not_configured" : "failed";
  await Invoice.findByIdAndUpdate(invoice._id, {
    lastSentAt: new Date(),
    lastSentTo: invoice.student.email,
    lastEmailStatus: status,
  });
  if (delivery.delivered) {
    await Notification.create({
      user: invoice.student._id,
      type: "invoice.sent",
      title: "Invoice emailed",
      message: `${invoice.invoiceNumber} has been emailed to ${invoice.student.email}.`,
      metadata: { invoice: invoice._id.toString(), email: invoice.student.email },
    });
  }
  revalidatePath("/fees/invoices");
  redirect(`${returnPath}send=${status}`);
}

function queryValue(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return typeof raw === "string" ? raw : "";
}

function statusTone(status: string) {
  if (status === "paid") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "cancelled") return "bg-rose-50 text-rose-700 ring-rose-200";
  if (status === "overdue") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function emailStatusCopy(status?: string) {
  if (status === "sent") return "Emailed";
  if (status === "not_configured") return "Email not configured";
  if (status === "missing_email") return "No student email";
  if (status === "failed") return "Email failed";
  if (status === "skipped") return "Email skipped";
  return "Not emailed";
}

function sendBanner(status: string) {
  if (status === "sent") return { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: CheckCircle2, text: "Invoice email sent to the student." };
  if (status === "not_configured") return { tone: "border-amber-200 bg-amber-50 text-amber-800", icon: MailWarning, text: "Invoice was not emailed because EMAIL_AUTOMATION_WEBHOOK_URL is not configured." };
  if (status === "missing_email") return { tone: "border-amber-200 bg-amber-50 text-amber-800", icon: MailWarning, text: "Invoice was not emailed because the student does not have an email address." };
  if (status === "failed") return { tone: "border-rose-200 bg-rose-50 text-rose-800", icon: AlertCircle, text: "Invoice email failed. Please check the email automation webhook." };
  return null;
}

function invoiceTypeLabel(type: string) {
  if (type === "credits") return "Credit Plan Invoice";
  if (type === "monthly") return "Monthly Plan Invoice";
  return "Custom Invoice";
}

function invoiceModeLabel(mode: string) {
  if (mode === "included") return "GST Included";
  if (mode === "excluded") return "GST Excluded";
  return "Non-GST";
}

function MiniMetric({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
        <span className="text-brand">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-xl font-black text-slate-950">{value}</div>
    </div>
  );
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
  const sendStatus = queryValue(params, "send");
  const banner = sendBanner(sendStatus);
  const paidCount = invoices.filter((invoice: any) => invoice.status === "paid").length;
  const unpaidCount = invoices.filter((invoice: any) => invoice.status === "unpaid" || invoice.status === "overdue").length;
  const totalValue = invoices.reduce((sum: number, invoice: any) => sum + Number(invoice.totalAmount || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <section className="mb-4 rounded-lg border border-brand/10 bg-white p-4 shadow-[0_12px_28px_rgba(90,19,114,0.08)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand"><Receipt size={21} /></span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-brand/70">Billing workspace</p>
              <h1 className="mt-1 text-3xl font-black text-slate-950">Fee Invoices</h1>
              <p className="mt-1 text-sm leading-6 text-slate-500">Create, review, email, download, print, and settle academy invoices.</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <MiniMetric label="Total Value" value={formatINR(totalValue)} icon={<IndianRupee size={15} />} />
            <MiniMetric label="Unpaid" value={unpaidCount} icon={<Clock3 size={15} />} />
            <MiniMetric label="Paid" value={paidCount} icon={<CheckCircle2 size={15} />} />
          </div>
        </div>
      </section>

      {banner && (
        <div className={`mb-4 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-semibold ${banner.tone}`}>
          <banner.icon size={18} />
          {banner.text}
        </div>
      )}

      {role === "admin" && (
        <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-950">Create Manual Invoice</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">Use the guided steps only when you need to generate a manual invoice.</p>
            </div>
            <span className="hidden rounded-full bg-brand/10 px-3 py-1 text-xs font-black text-brand sm:inline-flex">4-step flow</span>
          </div>
          <InvoiceCreationForm
            action={createManualInvoice}
            students={students.map((student: any) => ({ id: student._id.toString(), name: student.name }))}
            plans={plans.map((plan: any) => ({ id: plan._id.toString(), name: plan.name, type: plan.type, amount: plan.amount, credits: plan.credits || 0, gstMode: plan.gstMode || "non_gst", gstPercentage: plan.gstPercentage || 0 }))}
            assignments={assignments.map((assignment: any) => ({ studentId: assignment.student?.toString(), planId: assignment.plan?.toString() }))}
          />
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-950">Invoice List</h2>
            <p className="mt-1 text-sm text-slate-500">{invoices.length} invoices in the current view.</p>
          </div>
          {role === "admin" && (
            <form className="flex min-w-[260px] items-center gap-2">
              <select name="student" defaultValue={selectedStudent} className="input h-10">
                <option value="">All students</option>
                {students.map((student: any) => <option key={student._id.toString()} value={student._id.toString()}>{student.name}{student.username ? ` (${student.username})` : ""}</option>)}
              </select>
              <button className="btn-primary h-10">Filter</button>
            </form>
          )}
        </div>

        {invoices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-white text-brand shadow-sm"><FileText size={22} /></div>
            <h3 className="mt-4 font-black text-slate-950">No invoices found</h3>
            <p className="mt-1 text-sm text-slate-500">Invoices generated through portal payments or manual invoice creation will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {invoices.map((invoice: any) => {
              const invoiceId = invoice._id.toString();
              const pdfHref = `/api/fees/invoices/${invoiceId}/pdf`;
              const emailStatus = String(invoice.lastEmailStatus || "");
              return (
                <article key={invoiceId} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand/20 hover:shadow-lg hover:shadow-brand-900/8">
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-black text-slate-950">{invoice.invoiceNumber}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusTone(invoice.status)}`}>{invoice.status}</span>
                        <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-bold text-brand">{invoiceTypeLabel(invoice.type)}</span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{invoice.title}</p>
                      <div className="mt-3 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                        {role === "admin" && (
                          <div>
                            <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Student</div>
                            <div className="mt-1 font-semibold text-slate-950">{invoice.student?.name || "-"}</div>
                            <div className="text-xs text-slate-500">{invoice.student?.username || invoice.student?.email || "-"}</div>
                          </div>
                        )}
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Plan</div>
                          <div className="mt-1 font-semibold text-slate-950">{invoice.plan?.name || "-"}</div>
                          <div className="text-xs text-slate-500">{invoiceModeLabel(invoice.invoiceMode)}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Dates</div>
                          <div className="mt-1 text-slate-700">Issued {new Date(invoice.issueDate || invoice.createdAt).toLocaleDateString("en-IN")}</div>
                          <div className="text-slate-700">Due {new Date(invoice.dueDate).toLocaleDateString("en-IN")}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Email</div>
                          <div className="mt-1 flex items-center gap-1.5 font-semibold text-slate-950">
                            {emailStatus === "sent" ? <MailCheck size={15} className="text-emerald-600" /> : <MailWarning size={15} className="text-amber-600" />}
                            {emailStatusCopy(emailStatus)}
                          </div>
                          {invoice.lastSentAt && <div className="text-xs text-slate-500">{new Date(invoice.lastSentAt).toLocaleString("en-IN")}</div>}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Total</div>
                          <div className="mt-1 text-2xl font-black text-slate-950">{formatINR(invoice.totalAmount)}</div>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          GST {invoice.invoiceMode === "non_gst" ? "-" : formatINR(invoice.gstAmount || 0)}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <a href={pdfHref} target="_blank" className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:text-brand">View</a>
                        <a href={pdfHref} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:text-brand"><Download size={14} /> PDF</a>
                        <a href={pdfHref} target="_blank" className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:text-brand"><Printer size={14} /> Print</a>
                        {role !== "admin" && invoice.status !== "paid" && <PayButton amount={invoice.totalAmount} purpose="invoice" refId={invoiceId} label="Pay" />}
                      </div>
                    </div>
                  </div>

                  {role === "admin" && (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                      <form action={sendInvoiceToStudent}>
                        <input type="hidden" name="invoice" value={invoiceId} />
                        <input type="hidden" name="studentFilter" value={selectedStudent} />
                        <button className="inline-flex h-9 items-center gap-1 rounded-lg bg-brand px-3 text-xs font-bold text-white shadow-sm hover:bg-brand-700"><Send size={14} /> Send to Student</button>
                      </form>
                      <button disabled title="Parent profile is not linked yet" className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-400">Send to Parent</button>
                      {invoice.status !== "paid" && invoice.status !== "cancelled" && (
                        <form action={markInvoicePaid}><input type="hidden" name="invoice" value={invoiceId} /><button className="inline-flex h-9 items-center gap-1 rounded-lg border border-emerald-200 px-3 text-xs font-bold text-emerald-700"><CheckCircle2 size={14} /> Mark Paid</button></form>
                      )}
                      {invoice.status !== "cancelled" && (
                        <form action={cancelInvoice}><input type="hidden" name="invoice" value={invoiceId} /><button className="inline-flex h-9 items-center gap-1 rounded-lg border border-amber-200 px-3 text-xs font-bold text-amber-700"><XCircle size={14} /> Cancel</button></form>
                      )}
                      <form action={deleteInvoice}><input type="hidden" name="invoice" value={invoiceId} /><button className="inline-flex h-9 items-center gap-1 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-700"><Trash2 size={14} /> Delete</button></form>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
