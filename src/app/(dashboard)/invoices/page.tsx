import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { ensureMonthlyInvoices } from "@/lib/fees";
import { formatINR } from "@/lib/utils";
import { Invoice } from "@/models/Fee";
import PayButton from "@/components/PayButton";
import { Download, Receipt } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const session = await auth();
  const userId = (session?.user as any).id;
  const role = (session?.user as any).role;
  await dbConnect();
  await ensureMonthlyInvoices();

  const filter = role === "admin" ? {} : { student: userId };
  const list = await Invoice.find(filter).populate("student plan").sort({ createdAt: -1 }).limit(300).lean();

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-5 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-purple-50 text-purple-700"><Receipt size={18} /></span>
        <div>
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="text-sm text-slate-500">View, pay, and download academy invoices.</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr className="border-b">
                <th className="px-3 py-3 font-medium">Invoice</th>
                {role === "admin" && <th className="px-3 py-3 font-medium">Student</th>}
                <th className="px-3 py-3 font-medium">Plan</th>
                <th className="px-3 py-3 font-medium">Due Date</th>
                <th className="px-3 py-3 font-medium">GST</th>
                <th className="px-3 py-3 font-medium">Late Fee</th>
                <th className="px-3 py-3 font-medium">Total</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((invoice: any) => (
                <tr key={invoice._id} className="border-b last:border-0">
                  <td className="px-3 py-3">
                    <div className="font-medium text-slate-950">{invoice.invoiceNumber}</div>
                    <div className="text-xs text-slate-500">{invoice.title}</div>
                  </td>
                  {role === "admin" && <td className="px-3 py-3">{invoice.student?.name}</td>}
                  <td className="px-3 py-3">{invoice.plan?.name || invoice.type}</td>
                  <td className="px-3 py-3">{new Date(invoice.dueDate).toLocaleDateString("en-IN")}</td>
                  <td className="px-3 py-3">{formatINR(invoice.gstAmount || 0)}</td>
                  <td className="px-3 py-3">{formatINR(invoice.lateFee || 0)}</td>
                  <td className="px-3 py-3 font-semibold">{formatINR(invoice.totalAmount)}</td>
                  <td className="px-3 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{invoice.status}</span></td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <a href={`/api/fees/invoices/${invoice._id}/pdf`} className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100">
                        <Download size={14} /> PDF
                      </a>
                      {invoice.status !== "paid" && role !== "admin" && (
                        <PayButton amount={invoice.totalAmount} purpose="invoice" refId={invoice._id.toString()} label="Pay" />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.length === 0 && <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">No invoices yet.</div>}
      </div>
    </div>
  );
}
