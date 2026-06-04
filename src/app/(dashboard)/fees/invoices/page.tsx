import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { createInvoice, ensureMonthlyInvoices } from "@/lib/fees";
import { formatINR } from "@/lib/utils";
import { FeePlan, Invoice } from "@/models/Fee";
import { User } from "@/models/User";
import PayButton from "@/components/PayButton";
import { revalidatePath } from "next/cache";
import { Download, Plus, Printer, Receipt } from "lucide-react";

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
    amount: plan.amount || paise(formData.get("amount")),
    dueDate: new Date(String(formData.get("dueDate"))),
    credits: plan.type === "credits" ? plan.credits : 0,
    notes: String(formData.get("notes") || ""),
  });
  revalidatePath("/fees/invoices");
}

export default async function FeeInvoicesPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  await dbConnect();
  await ensureMonthlyInvoices();
  const [invoices, students, plans] = await Promise.all([
    Invoice.find(role === "admin" ? {} : { student: userId }).populate("student plan").sort({ createdAt: -1 }).limit(300).lean(),
    User.find({ role: "student" }, { passwordHash: 0 }).sort({ name: 1 }).lean(),
    FeePlan.find({ isActive: true }).sort({ name: 1 }).lean(),
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
          <form action={createManualInvoice} className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <select name="student" required className="rounded-md border px-3 py-2 text-sm">{students.map((s: any) => <option key={s._id} value={s._id.toString()}>{s.name}</option>)}</select>
            <select name="plan" required className="rounded-md border px-3 py-2 text-sm">{plans.map((p: any) => <option key={p._id} value={p._id.toString()}>{p.name} - {p.type}</option>)}</select>
            <input name="dueDate" type="date" required className="rounded-md border px-3 py-2 text-sm" />
            <input name="title" className="rounded-md border px-3 py-2 text-sm" placeholder="Invoice title" />
            <input name="amount" type="number" min="0" className="rounded-md border px-3 py-2 text-sm" placeholder="Override amount" />
            <input name="notes" className="rounded-md border px-3 py-2 text-sm" placeholder="Notes" />
            <button className="inline-flex items-center justify-center gap-2 rounded-md bg-purple-700 px-4 py-2 text-sm font-semibold text-white"><Plus size={15} /> Generate Invoice</button>
          </form>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr className="border-b"><th className="px-3 py-3">Invoice</th>{role === "admin" && <th>Student</th>}<th>Type</th><th>Due</th><th>GST</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {invoices.map((invoice: any) => (
                <tr key={invoice._id} className="border-b last:border-0">
                  <td className="px-3 py-3 font-medium">{invoice.invoiceNumber}<div className="text-xs text-slate-500">{invoice.title}</div></td>
                  {role === "admin" && <td>{invoice.student?.name}</td>}
                  <td>{invoice.type}</td>
                  <td>{new Date(invoice.dueDate).toLocaleDateString("en-IN")}</td>
                  <td>{formatINR(invoice.gstAmount || 0)}</td>
                  <td className="font-semibold">{formatINR(invoice.totalAmount)}</td>
                  <td><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{invoice.status}</span></td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <a href={`/api/fees/invoices/${invoice._id}/pdf`} className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-xs"><Download size={14} /> PDF</a>
                      <a href={`/api/fees/invoices/${invoice._id}/pdf`} target="_blank" className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-xs"><Printer size={14} /> Print</a>
                      {role !== "admin" && invoice.status !== "paid" && <PayButton amount={invoice.totalAmount} purpose="invoice" refId={invoice._id.toString()} label="Pay" />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
