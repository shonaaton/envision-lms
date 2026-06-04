import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { createInvoice, ensureMonthlyInvoices } from "@/lib/fees";
import { formatINR } from "@/lib/utils";
import { FeeAssignment, FeePlan, Invoice, Notification } from "@/models/Fee";
import { User } from "@/models/User";
import PayButton from "@/components/PayButton";
import { revalidatePath } from "next/cache";
import { Download, Printer, Receipt, Send } from "lucide-react";
import { InvoiceCreationForm } from "@/components/fees/InvoiceCreationForm";

export const dynamic = "force-dynamic";

function paise(value: FormDataEntryValue | null) {
  return Math.round(Number(value || 0) * 100);
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
  });
  revalidatePath("/fees/invoices");
}

async function markInvoicePaid(formData: FormData) {
  "use server";
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") throw new Error("Forbidden");
  await dbConnect();
  await Invoice.findByIdAndUpdate(formData.get("invoice"), { status: "paid", paidAt: new Date() });
  revalidatePath("/fees/invoices");
}

async function cancelInvoice(formData: FormData) {
  "use server";
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") throw new Error("Forbidden");
  await dbConnect();
  await Invoice.findByIdAndUpdate(formData.get("invoice"), { status: "cancelled" });
  revalidatePath("/fees/invoices");
}

async function sendInvoiceToStudent(formData: FormData) {
  "use server";
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") throw new Error("Forbidden");
  await dbConnect();
  const invoice: any = await Invoice.findById(formData.get("invoice")).populate("student").lean();
  if (!invoice?.student?._id) return;
  await Notification.create({
    user: invoice.student._id,
    type: "invoice.sent",
    title: "Invoice available",
    message: `${invoice.invoiceNumber} is available for ${invoice.title}.`,
    metadata: { invoice: invoice._id.toString() },
  });
  revalidatePath("/fees/invoices");
}

export default async function FeeInvoicesPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  await dbConnect();
  await ensureMonthlyInvoices();
  const [invoices, students, plans, assignments] = await Promise.all([
    Invoice.find(role === "admin" ? {} : { student: userId }).populate("student plan").sort({ createdAt: -1 }).limit(300).lean(),
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
            plans={plans.map((plan: any) => ({ id: plan._id.toString(), name: plan.name, type: plan.type, amount: plan.amount, credits: plan.credits || 0 }))}
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
            <thead className="text-xs uppercase text-slate-500"><tr className="border-b"><th className="px-3 py-3">Invoice Number</th><th>Invoice Title</th>{role === "admin" && <th>Student Name</th>}<th>Plan Name</th><th>Invoice Type</th><th>Invoice Date</th><th>Due Date</th><th>GST Amount</th><th>Total Amount</th><th>Payment Status</th><th>Actions</th></tr></thead>
            <tbody>
              {invoices.map((invoice: any) => (
                <tr key={invoice._id} className="border-b last:border-0">
                  <td className="px-3 py-3 font-medium">{invoice.invoiceNumber}</td>
                  <td>{invoice.title}</td>
                  {role === "admin" && <td>{invoice.student?.name}</td>}
                  <td>{invoice.plan?.name || "-"}</td>
                  <td>{invoice.type === "credits" ? "Credit Plan Invoice" : invoice.type === "monthly" ? "Monthly Plan Invoice" : "Custom Invoice"}</td>
                  <td>{new Date(invoice.issueDate || invoice.createdAt).toLocaleDateString("en-IN")}</td>
                  <td>{new Date(invoice.dueDate).toLocaleDateString("en-IN")}</td>
                  <td>{formatINR(invoice.gstAmount || 0)}</td>
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
