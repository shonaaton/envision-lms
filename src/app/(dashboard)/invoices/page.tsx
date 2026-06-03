import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Payment } from "@/models/Payment";
import { formatINR } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const session = await auth();
  const userId = (session?.user as any).id;
  const role = (session?.user as any).role;
  await dbConnect();
  const filter = role === "admin" ? {} : { user: userId };
  const list = await Payment.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-accent">Invoices</h1>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-400">
            <tr><th className="py-2 text-left">Invoice</th><th className="text-left">Purpose</th><th className="text-left">Amount</th><th className="text-left">Status</th><th className="text-left">Date</th></tr>
          </thead>
          <tbody>
            {list.map((p: any) => (
              <tr key={p._id} className="border-t border-ink-700">
                <td className="py-2 text-white">{p.invoiceNumber || "—"}</td>
                <td>{p.purpose}</td>
                <td>{formatINR(p.amount)}</td>
                <td><span className="chip">{p.status}</span></td>
                <td>{new Date(p.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <div className="text-sm text-gray-400">No invoices yet.</div>}
      </div>
    </div>
  );
}
