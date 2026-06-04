import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { createInvoice, ensureMonthlyInvoices, getAcademySettings } from "@/lib/fees";
import { formatINR } from "@/lib/utils";
import { AcademySettings, CreditLedger, FeeAssignment, FeePlan, Invoice } from "@/models/Fee";
import { User } from "@/models/User";
import PayButton from "@/components/PayButton";
import { revalidatePath } from "next/cache";
import { Banknote, ClipboardList, FileDown, Receipt, Settings, WalletCards } from "lucide-react";

export const dynamic = "force-dynamic";

function toPaise(value: FormDataEntryValue | null) {
  return Math.round(Number(value || 0) * 100);
}

function toDate(value: FormDataEntryValue | null) {
  return value ? new Date(String(value)) : new Date();
}

async function requireAdmin() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") throw new Error("Forbidden");
  return session;
}

async function saveSettings(formData: FormData) {
  "use server";
  await requireAdmin();
  await dbConnect();
  await AcademySettings.findOneAndUpdate(
    {},
    {
      academyName: formData.get("academyName"),
      registeredAddress: formData.get("registeredAddress"),
      gstNumber: formData.get("gstNumber"),
      logoUrl: formData.get("logoUrl"),
      phone: formData.get("phone"),
      authorizedSignatory: formData.get("authorizedSignatory"),
      invoiceMode: formData.get("invoiceMode"),
      gstPercentage: Number(formData.get("gstPercentage") || 0),
      invoicePrefix: formData.get("invoicePrefix") || "INV",
    },
    { upsert: true, new: true }
  );
  revalidatePath("/fees");
  revalidatePath("/invoices");
}

async function createPlan(formData: FormData) {
  "use server";
  await requireAdmin();
  await dbConnect();
  const type = String(formData.get("type")) as "monthly" | "credits";
  await FeePlan.create({
    name: formData.get("name"),
    type,
    amount: toPaise(formData.get("amount")),
    credits: type === "credits" ? Number(formData.get("credits") || 0) : 0,
    billingDay: Number(formData.get("billingDay") || 1),
  });
  revalidatePath("/fees");
}

async function assignPlan(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  await dbConnect();
  const plan: any = await FeePlan.findById(formData.get("plan"));
  if (!plan) return;
  const student = String(formData.get("student"));
  const existing: any = await FeeAssignment.findOne({ student });
  const history = {
    plan: plan._id,
    type: plan.type,
    changedAt: new Date(),
    changedBy: (session!.user as any).id,
    note: formData.get("note") || "Fee structure assigned",
  };
  await FeeAssignment.findOneAndUpdate(
    { student },
    {
      student,
      plan: plan._id,
      type: plan.type,
      billingStartDate: toDate(formData.get("billingStartDate")),
      creditBalance: existing?.creditBalance ?? 0,
      totalCreditsPurchased: existing?.totalCreditsPurchased ?? 0,
      totalCreditsConsumed: existing?.totalCreditsConsumed ?? 0,
      $push: { history },
    },
    { upsert: true, new: true }
  );
  await ensureMonthlyInvoices();
  revalidatePath("/fees");
}

async function createStudentInvoice(formData: FormData) {
  "use server";
  await requireAdmin();
  await dbConnect();
  const student = String(formData.get("student"));
  const plan: any = await FeePlan.findById(formData.get("plan"));
  const type = (plan?.type || formData.get("type") || "manual") as "monthly" | "credits" | "manual";
  await createInvoice({
    student,
    plan: plan?._id?.toString(),
    type,
    title: String(formData.get("title") || plan?.name || "Fee Invoice"),
    amount: plan?.amount ?? toPaise(formData.get("amount")),
    dueDate: toDate(formData.get("dueDate")),
    credits: type === "credits" ? Number(plan?.credits || formData.get("credits") || 0) : 0,
    notes: String(formData.get("notes") || ""),
  });
  revalidatePath("/fees");
  revalidatePath("/invoices");
}

function AdminCard({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-purple-50 text-purple-700"><Icon size={16} /></span>
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default async function FeesPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  const role = (session?.user as any)?.role;
  await dbConnect();
  await ensureMonthlyInvoices();

  const settings: any = await getAcademySettings();

  if (role !== "admin") {
    const [assignmentResult, invoices, ledger] = await Promise.all([
      FeeAssignment.findOne({ student: userId }).populate("plan").lean(),
      Invoice.find({ student: userId }).sort({ dueDate: -1 }).limit(50).lean(),
      CreditLedger.find({ student: userId }).sort({ createdAt: -1 }).limit(20).lean(),
    ]);
    const assignment: any = assignmentResult;
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold">Fee Collection</h1>
        <p className="mt-1 text-sm text-slate-500">View your plan, credits, invoices, and late fees.</p>
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <AdminCard title="Current Fee Plan" icon={WalletCards}>
            {assignment ? (
              <div className="space-y-2 text-sm">
                <div className="text-xl font-semibold text-slate-950">{(assignment as any).plan?.name}</div>
                <div className="text-slate-500">{assignment.type === "credits" ? "Credit-based plan" : "Monthly plan"}</div>
                {assignment.type === "credits" && (
                  <div className="rounded-md bg-purple-50 p-3 text-purple-900">
                    Remaining credits: <b>{assignment.creditBalance}</b>
                  </div>
                )}
              </div>
            ) : <p className="text-sm text-slate-500">No fee plan assigned yet.</p>}
          </AdminCard>
          <AdminCard title="Open Invoices" icon={Receipt}>
            <div className="space-y-3">
              {invoices.filter((invoice: any) => invoice.status !== "paid").map((invoice: any) => (
                <div key={invoice._id} className="rounded-md border border-slate-100 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{invoice.invoiceNumber}</div>
                      <div className="text-xs text-slate-500">{invoice.title}</div>
                      {invoice.lateFee > 0 && <div className="mt-1 text-xs font-medium text-rose-600">Late fee applied: {formatINR(invoice.lateFee)}</div>}
                    </div>
                    <PayButton amount={invoice.totalAmount} purpose="invoice" refId={invoice._id.toString()} label={`Pay ${formatINR(invoice.totalAmount)}`} />
                  </div>
                </div>
              ))}
              {invoices.filter((invoice: any) => invoice.status !== "paid").length === 0 && <p className="text-sm text-slate-500">No open invoices.</p>}
            </div>
          </AdminCard>
          <AdminCard title="Credit History" icon={ClipboardList}>
            <div className="space-y-2 text-sm">
              {ledger.map((item: any) => (
                <div key={item._id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                  <span>{item.note || item.type}</span>
                  <b className={item.credits > 0 ? "text-emerald-700" : "text-rose-700"}>{item.credits > 0 ? "+" : ""}{item.credits}</b>
                </div>
              ))}
              {ledger.length === 0 && <p className="text-sm text-slate-500">No credit activity yet.</p>}
            </div>
          </AdminCard>
        </div>
      </div>
    );
  }

  const [students, plans, assignments, invoices, ledgers] = await Promise.all([
    User.find({ role: "student" }, { passwordHash: 0 }).sort({ name: 1 }).lean(),
    FeePlan.find({ isActive: true }).sort({ createdAt: -1 }).lean(),
    FeeAssignment.find({}).populate("student plan").sort({ creditBalance: 1 }).lean(),
    Invoice.find({}).populate("student plan").sort({ createdAt: -1 }).limit(100).lean(),
    CreditLedger.find({}).populate("student").sort({ createdAt: -1 }).limit(30).lean(),
  ]);

  const totals = {
    outstanding: invoices.filter((i: any) => i.status !== "paid").reduce((sum: number, i: any) => sum + i.totalAmount, 0),
    paid: invoices.filter((i: any) => i.status === "paid").reduce((sum: number, i: any) => sum + i.totalAmount, 0),
    gst: invoices.reduce((sum: number, i: any) => sum + (i.gstAmount || 0), 0),
    late: invoices.reduce((sum: number, i: any) => sum + (i.lateFee || 0), 0),
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fee Management</h1>
          <p className="mt-1 text-sm text-slate-500">Academy setup, monthly fees, credit plans, GST invoices, reports, and credit monitoring.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {["fee", "transaction", "gst", "payment", "collection"].map((type) => (
            <a key={type} href={`/api/fees/reports?type=${type}`} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100">
              <FileDown size={15} /> {type[0].toUpperCase() + type.slice(1)} Report
            </a>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-lg border bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">Outstanding</div><div className="mt-1 text-xl font-semibold">{formatINR(totals.outstanding)}</div></div>
        <div className="rounded-lg border bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">Collected</div><div className="mt-1 text-xl font-semibold">{formatINR(totals.paid)}</div></div>
        <div className="rounded-lg border bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">GST Collected</div><div className="mt-1 text-xl font-semibold">{formatINR(totals.gst)}</div></div>
        <div className="rounded-lg border bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">Late Fees</div><div className="mt-1 text-xl font-semibold">{formatINR(totals.late)}</div></div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <AdminCard title="Academy & Invoice Setup" icon={Settings}>
          <form action={saveSettings} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input name="academyName" defaultValue={settings.academyName} className="rounded-md border px-3 py-2 text-sm" placeholder="Academy name" />
            <input name="phone" defaultValue={settings.phone} className="rounded-md border px-3 py-2 text-sm" placeholder="Phone number" />
            <input name="gstNumber" defaultValue={settings.gstNumber} className="rounded-md border px-3 py-2 text-sm" placeholder="GST number" />
            <input name="logoUrl" defaultValue={settings.logoUrl} className="rounded-md border px-3 py-2 text-sm" placeholder="Logo URL" />
            <input name="authorizedSignatory" defaultValue={settings.authorizedSignatory} className="rounded-md border px-3 py-2 text-sm" placeholder="Authorized signatory" />
            <input name="invoicePrefix" defaultValue={settings.invoicePrefix} className="rounded-md border px-3 py-2 text-sm" placeholder="Invoice prefix" />
            <select name="invoiceMode" defaultValue={settings.invoiceMode} className="rounded-md border px-3 py-2 text-sm">
              <option value="non_gst">Non-GST Invoice</option>
              <option value="gst">GST Invoice</option>
            </select>
            <input name="gstPercentage" defaultValue={settings.gstPercentage} type="number" min="0" step="0.01" className="rounded-md border px-3 py-2 text-sm" placeholder="GST %" />
            <textarea name="registeredAddress" defaultValue={settings.registeredAddress} className="md:col-span-2 rounded-md border px-3 py-2 text-sm" placeholder="Registered address" />
            <button className="md:col-span-2 rounded-md bg-purple-700 px-4 py-2 text-sm font-semibold text-white">Save invoice setup</button>
          </form>
        </AdminCard>

        <AdminCard title="Create Fee Plan" icon={Banknote}>
          <form action={createPlan} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input name="name" required className="rounded-md border px-3 py-2 text-sm" placeholder="Plan name" />
            <select name="type" className="rounded-md border px-3 py-2 text-sm">
              <option value="monthly">Monthly Plan</option>
              <option value="credits">Credit-Based Plan</option>
            </select>
            <input name="amount" required type="number" min="0" className="rounded-md border px-3 py-2 text-sm" placeholder="Amount in rupees" />
            <input name="credits" type="number" min="0" className="rounded-md border px-3 py-2 text-sm" placeholder="Credits for credit plan" />
            <input name="billingDay" type="number" min="1" max="28" className="rounded-md border px-3 py-2 text-sm" placeholder="Billing day" />
            <button className="rounded-md bg-purple-700 px-4 py-2 text-sm font-semibold text-white">Create plan</button>
          </form>
        </AdminCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <AdminCard title="Assign Fee Structure" icon={WalletCards}>
          <form action={assignPlan} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <select name="student" required className="rounded-md border px-3 py-2 text-sm">
              {students.map((student: any) => <option key={student._id} value={student._id.toString()}>{student.name} ({student.username})</option>)}
            </select>
            <select name="plan" required className="rounded-md border px-3 py-2 text-sm">
              {plans.map((plan: any) => <option key={plan._id} value={plan._id.toString()}>{plan.name} - {plan.type}</option>)}
            </select>
            <input name="billingStartDate" type="date" required className="rounded-md border px-3 py-2 text-sm" />
            <input name="note" className="rounded-md border px-3 py-2 text-sm" placeholder="Change note" />
            <button className="md:col-span-2 rounded-md bg-purple-700 px-4 py-2 text-sm font-semibold text-white">Assign / Update student plan</button>
          </form>
        </AdminCard>

        <AdminCard title="Create Student Invoice" icon={Receipt}>
          <form action={createStudentInvoice} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <select name="student" required className="rounded-md border px-3 py-2 text-sm">
              {students.map((student: any) => <option key={student._id} value={student._id.toString()}>{student.name}</option>)}
            </select>
            <select name="plan" className="rounded-md border px-3 py-2 text-sm">
              <option value="">Manual invoice</option>
              {plans.map((plan: any) => <option key={plan._id} value={plan._id.toString()}>{plan.name}</option>)}
            </select>
            <input name="title" className="rounded-md border px-3 py-2 text-sm" placeholder="Invoice title" />
            <input name="amount" type="number" min="0" className="rounded-md border px-3 py-2 text-sm" placeholder="Manual amount in rupees" />
            <input name="credits" type="number" min="0" className="rounded-md border px-3 py-2 text-sm" placeholder="Manual credits" />
            <input name="dueDate" type="date" required className="rounded-md border px-3 py-2 text-sm" />
            <textarea name="notes" className="md:col-span-2 rounded-md border px-3 py-2 text-sm" placeholder="Invoice notes" />
            <button className="md:col-span-2 rounded-md bg-purple-700 px-4 py-2 text-sm font-semibold text-white">Create invoice</button>
          </form>
        </AdminCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <AdminCard title="Credit Monitoring" icon={WalletCards}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-2">Student</th><th>Plan</th><th>Purchased</th><th>Consumed</th><th>Remaining</th></tr></thead>
              <tbody>
                {assignments.filter((a: any) => a.type === "credits").map((a: any) => (
                  <tr key={a._id} className="border-t">
                    <td className="py-2 font-medium">{a.student?.name}</td>
                    <td>{a.plan?.name}</td>
                    <td>{a.totalCreditsPurchased}</td>
                    <td>{a.totalCreditsConsumed}</td>
                    <td><span className={a.creditBalance <= 3 ? "font-semibold text-rose-600" : "font-semibold text-emerald-700"}>{a.creditBalance}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminCard>

        <AdminCard title="Recent Invoices" icon={Receipt}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-2">Invoice</th><th>Student</th><th>Total</th><th>Status</th><th>Download</th></tr></thead>
              <tbody>
                {invoices.map((invoice: any) => (
                  <tr key={invoice._id} className="border-t">
                    <td className="py-2 font-medium">{invoice.invoiceNumber}</td>
                    <td>{invoice.student?.name}</td>
                    <td>{formatINR(invoice.totalAmount)}</td>
                    <td><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{invoice.status}</span></td>
                    <td><a className="text-purple-700 underline" href={`/api/fees/invoices/${invoice._id}/pdf`}>PDF</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminCard>
      </div>
    </div>
  );
}
