import { dbConnect } from "@/lib/db";
import { FeeAssignment, FeePlan, Invoice } from "@/models/Fee";
import { revalidatePath } from "next/cache";
import { Banknote } from "lucide-react";
import { FeePlansWorkspace } from "@/components/fees/FeePlanForms";
import { requireFeesAccess } from "@/lib/feesAccess";
import { redirect } from "next/navigation";

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
  redirect("/fees/fee-plans?success=created");
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
  redirect("/fees/fee-plans?success=updated");
}

async function planIsLinked(id: string) {
  const [assignment, invoice] = await Promise.all([
    FeeAssignment.exists({ plan: id }),
    Invoice.exists({ plan: id }),
  ]);
  return Boolean(assignment || invoice);
}

async function archivePlan(formData: FormData) {
  "use server";
  if (!(await requireFeesAccess("edit"))) throw new Error("Forbidden");
  await dbConnect();
  const id = String(formData.get("id") || "");
  if (await planIsLinked(id)) redirect("/fees/fee-plans?error=linked");
  await FeePlan.findByIdAndUpdate(id, { isActive: false });
  revalidatePath("/fees/fee-plans");
  redirect("/fees/fee-plans?success=archived");
}

async function deletePlan(formData: FormData) {
  "use server";
  if (!(await requireFeesAccess("edit"))) throw new Error("Forbidden");
  await dbConnect();
  const id = String(formData.get("id") || "");
  if (await planIsLinked(id)) redirect("/fees/fee-plans?error=linked");
  await FeePlan.findByIdAndDelete(id);
  revalidatePath("/fees/fee-plans");
  redirect("/fees/fee-plans?success=deleted");
}

export default async function FeePlansPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await requireFeesAccess("edit"))) return <div className="p-6">Forbidden</div>;
  await dbConnect();
  const params = searchParams ? await searchParams : {};
  const success = typeof params.success === "string" ? params.success : "";
  const error = typeof params.error === "string" ? params.error : "";
  const [plans, assignedPlanIds, invoicedPlanIds] = await Promise.all([
    FeePlan.find({}).sort({ isActive: -1, createdAt: -1 }).lean(),
    FeeAssignment.distinct("plan"),
    Invoice.distinct("plan"),
  ]);
  const linkedPlanIds = new Set([...assignedPlanIds, ...invoicedPlanIds].map((id: any) => String(id || "")));
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
      isLinked: linkedPlanIds.has(plan._id.toString()),
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

      {success && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {success === "created" ? "Fee plan created successfully." : success === "updated" ? "Fee plan updated successfully." : success === "archived" ? "Fee plan archived successfully." : "Fee plan deleted permanently."}
        </div>
      )}
      {error === "linked" && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          This plan is linked to a student assignment or invoice. Remove those links before archiving or deleting it.
        </div>
      )}

      <FeePlansWorkspace
        monthlyPlans={monthlyPlans.map(serializePlan)}
        creditPlans={creditPlans.map(serializePlan)}
        createAction={createPlan}
        updateAction={updatePlan}
        archiveAction={archivePlan}
        deleteAction={deletePlan}
        notification={success === "created" || success === "updated" || success === "archived" || success === "deleted" ? success : ""}
      />
    </div>
  );
}
