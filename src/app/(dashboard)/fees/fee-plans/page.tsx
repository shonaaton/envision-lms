import { dbConnect } from "@/lib/db";
import { FeePlan } from "@/models/Fee";
import { revalidatePath } from "next/cache";
import { Banknote } from "lucide-react";
import { FeePlansWorkspace } from "@/components/fees/FeePlanForms";
import { requireFeesAccess } from "@/lib/feesAccess";

export const dynamic = "force-dynamic";

function paise(value: FormDataEntryValue | null) {
  return Math.round(Number(value || 0) * 100);
}

async function createPlan(formData: FormData) {
  "use server";
  if (!(await requireFeesAccess("edit"))) throw new Error("Forbidden");
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
  if (!(await requireFeesAccess("edit"))) throw new Error("Forbidden");
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
  if (!(await requireFeesAccess("edit"))) throw new Error("Forbidden");
  await dbConnect();
  await FeePlan.findByIdAndUpdate(formData.get("id"), { isActive: false });
  revalidatePath("/fees/fee-plans");
}

export default async function FeePlansPage() {
  if (!(await requireFeesAccess("edit"))) return <div className="p-6">Forbidden</div>;
  await dbConnect();
  const plans = await FeePlan.find({}).sort({ isActive: -1, createdAt: -1 }).lean();
  const monthlyPlans = plans.filter((plan: any) => plan.type === "monthly");
  const creditPlans = plans.filter((plan: any) => plan.type === "credits");

  function serializePlan(plan: any) {
    return {
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
    };
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

      <FeePlansWorkspace
        monthlyPlans={monthlyPlans.map(serializePlan)}
        creditPlans={creditPlans.map(serializePlan)}
        createAction={createPlan}
        updateAction={updatePlan}
        archiveAction={archivePlan}
      />
    </div>
  );
}
