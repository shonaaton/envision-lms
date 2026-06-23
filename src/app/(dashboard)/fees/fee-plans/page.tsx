import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { FeePlan } from "@/models/Fee";
import { revalidatePath } from "next/cache";
import { Banknote } from "lucide-react";
import { CreateFeePlanForm, FeePlanEditor } from "@/components/fees/FeePlanForms";

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
    gstMode: formData.get("gstMode") || "non_gst",
    gstPercentage: Number(formData.get("gstPercentage") || 0),
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
    gstMode: formData.get("gstMode") || "non_gst",
    gstPercentage: Number(formData.get("gstPercentage") || 0),
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
  const monthlyPlans = plans.filter((plan: any) => plan.type === "monthly");
  const creditPlans = plans.filter((plan: any) => plan.type === "credits");

  function renderPlan(plan: any) {
    return (
      <FeePlanEditor
        key={plan._id.toString()}
        plan={{
          id: plan._id.toString(),
          name: plan.name,
          type: plan.type,
          amount: plan.amount,
          gstMode: plan.gstMode || "non_gst",
          gstPercentage: plan.gstPercentage || 0,
          credits: plan.credits || 0,
          lateFeeAmount: plan.lateFeeAmount || 50000,
          lateFeeAfterDays: plan.lateFeeAfterDays || 10,
          isActive: plan.isActive !== false,
        }}
        updateAction={updatePlan}
        archiveAction={archivePlan}
      />
    );
  }

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
        <CreateFeePlanForm action={createPlan} />
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 font-semibold">Monthly Plans</h2>
          <p className="mb-4 text-sm text-slate-500">Recurring fee plans. Type is locked after creation.</p>
          <div className="space-y-3">
            {monthlyPlans.map(renderPlan)}
            {monthlyPlans.length === 0 && <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">No monthly plans created yet.</p>}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 font-semibold">Credit Plans</h2>
          <p className="mb-4 text-sm text-slate-500">Recharge packs. Type is locked after creation.</p>
          <div className="space-y-3">
            {creditPlans.map(renderPlan)}
            {creditPlans.length === 0 && <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">No credit plans created yet.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
