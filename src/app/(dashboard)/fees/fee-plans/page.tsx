import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { formatINR } from "@/lib/utils";
import { FeePlan } from "@/models/Fee";
import { revalidatePath } from "next/cache";
import { Archive, Banknote, Plus, Save } from "lucide-react";

export const dynamic = "force-dynamic";

function paise(value: FormDataEntryValue | null) {
  return Math.round(Number(value || 0) * 100);
}

async function requireAdmin() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") throw new Error("Forbidden");
}

async function createPlan(formData: FormData) {
  "use server";
  await requireAdmin();
  await dbConnect();
  const type = String(formData.get("type")) as "monthly" | "credits";
  await FeePlan.create({
    name: formData.get("name"),
    type,
    amount: paise(formData.get("amount")),
    credits: type === "credits" ? Number(formData.get("credits") || 0) : 0,
    billingCycle: "monthly",
    billingDay: Number(formData.get("billingDay") || 1),
    dueAfterDays: Number(formData.get("dueAfterDays") || 0),
    lateFeeAmount: paise(formData.get("lateFeeAmount") || "500"),
    lateFeeAfterDays: Number(formData.get("lateFeeAfterDays") || 10),
    creditValidityDays: Number(formData.get("creditValidityDays") || 0),
  });
  revalidatePath("/fees/fee-plans");
}

async function updatePlan(formData: FormData) {
  "use server";
  await requireAdmin();
  await dbConnect();
  const id = String(formData.get("id"));
  const type = String(formData.get("type")) as "monthly" | "credits";
  await FeePlan.findByIdAndUpdate(id, {
    name: formData.get("name"),
    type,
    amount: paise(formData.get("amount")),
    credits: type === "credits" ? Number(formData.get("credits") || 0) : 0,
    billingDay: Number(formData.get("billingDay") || 1),
    dueAfterDays: Number(formData.get("dueAfterDays") || 0),
    lateFeeAmount: paise(formData.get("lateFeeAmount") || "500"),
    lateFeeAfterDays: Number(formData.get("lateFeeAfterDays") || 10),
    creditValidityDays: Number(formData.get("creditValidityDays") || 0),
  });
  revalidatePath("/fees/fee-plans");
}

async function archivePlan(formData: FormData) {
  "use server";
  await requireAdmin();
  await dbConnect();
  await FeePlan.findByIdAndUpdate(formData.get("id"), { isActive: false });
  revalidatePath("/fees/fee-plans");
}

export default async function FeePlansPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return <div className="p-6">Forbidden</div>;
  await dbConnect();
  const plans = await FeePlan.find({}).sort({ isActive: -1, createdAt: -1 }).lean();

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-5 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-purple-50 text-purple-700"><Banknote size={18} /></span>
        <div>
          <h1 className="text-2xl font-semibold">Fee Plans</h1>
          <p className="text-sm text-slate-500">Create, edit, archive, and prepare plans for assignment.</p>
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-semibold">Create Plan</h2>
        <form action={createPlan} className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input name="name" required className="rounded-md border px-3 py-2 text-sm" placeholder="Plan Name" />
          <select name="type" className="rounded-md border px-3 py-2 text-sm"><option value="monthly">Monthly</option><option value="credits">Credit-Based</option></select>
          <input name="amount" type="number" min="0" required className="rounded-md border px-3 py-2 text-sm" placeholder="Fee Amount" />
          <input name="credits" type="number" min="0" className="rounded-md border px-3 py-2 text-sm" placeholder="Credits" />
          <input name="billingDay" type="number" min="1" max="28" className="rounded-md border px-3 py-2 text-sm" placeholder="Billing Day" />
          <input name="dueAfterDays" type="number" min="0" className="rounded-md border px-3 py-2 text-sm" placeholder="Due After Days" />
          <input name="lateFeeAmount" type="number" min="0" defaultValue={500} className="rounded-md border px-3 py-2 text-sm" placeholder="Late Fee" />
          <input name="lateFeeAfterDays" type="number" min="0" defaultValue={10} className="rounded-md border px-3 py-2 text-sm" placeholder="Late Fee After Days" />
          <input name="creditValidityDays" type="number" min="0" className="rounded-md border px-3 py-2 text-sm" placeholder="Credit Validity Days" />
          <button className="inline-flex items-center justify-center gap-2 rounded-md bg-purple-700 px-4 py-2 text-sm font-semibold text-white"><Plus size={15} /> Create</button>
        </form>
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-semibold">Existing Plans</h2>
        <div className="space-y-3">
          {plans.map((plan: any) => (
            <form key={plan._id} action={updatePlan} className="grid grid-cols-1 items-center gap-2 rounded-md border border-slate-100 p-3 md:grid-cols-10">
              <input type="hidden" name="id" value={plan._id.toString()} />
              <input name="name" defaultValue={plan.name} className="rounded-md border px-2 py-2 text-sm md:col-span-2" />
              <select name="type" defaultValue={plan.type} className="rounded-md border px-2 py-2 text-sm"><option value="monthly">Monthly</option><option value="credits">Credits</option></select>
              <input name="amount" type="number" defaultValue={plan.amount / 100} className="rounded-md border px-2 py-2 text-sm" />
              <input name="credits" type="number" defaultValue={plan.credits || 0} className="rounded-md border px-2 py-2 text-sm" />
              <input name="billingDay" type="number" defaultValue={plan.billingDay || 1} className="rounded-md border px-2 py-2 text-sm" />
              <input name="dueAfterDays" type="number" defaultValue={plan.dueAfterDays || 0} className="rounded-md border px-2 py-2 text-sm" />
              <input name="lateFeeAmount" type="number" defaultValue={(plan.lateFeeAmount || 50000) / 100} className="rounded-md border px-2 py-2 text-sm" />
              <button className="inline-flex items-center justify-center gap-1 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white"><Save size={13} /> Save</button>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-1 text-xs ${plan.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{plan.isActive ? "Active" : "Archived"}</span>
                <button formAction={archivePlan} className="inline-flex items-center gap-1 rounded-md border px-2 py-2 text-xs"><Archive size={13} /> Archive</button>
              </div>
            </form>
          ))}
          {plans.length === 0 && <p className="text-sm text-slate-500">No plans created yet.</p>}
        </div>
      </section>
    </div>
  );
}
