import { dbConnect } from "@/lib/db";
import { FeeAssignment, FeePlan, Invoice } from "@/models/Fee";
import { revalidatePath } from "next/cache";
import { Banknote } from "lucide-react";
import { FeePlansWorkspace } from "@/components/fees/FeePlanForms";
import { requireFeesAccess } from "@/lib/feesAccess";
import { redirect } from "next/navigation";
import { recordActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

function paise(value: FormDataEntryValue | null) {
  return Math.round(Number(value || 0) * 100);
}

function overdueDays(value: FormDataEntryValue | null) {
  return Math.min(7, Math.max(0, Number(value || 7)));
}

function taxDetails(formData: FormData) {
  const gstMode = String(formData.get("gstMode") || "non_gst");
  const normalizedMode = gstMode === "included" || gstMode === "excluded" ? gstMode : "non_gst";
  const gstPercentage = Math.min(100, Math.max(0, Number(formData.get("gstPercentage") || 0)));
  return {
    gstMode: normalizedMode,
    gstPercentage: normalizedMode === "non_gst" ? 0 : gstPercentage,
  };
}

async function createPlan(formData: FormData) {
  "use server";
  const session = await requireFeesAccess("edit", "feePlans");
  if (!session) throw new Error("Forbidden");
  await dbConnect();
  const type = String(formData.get("type")) as "monthly" | "credits";
  const tax = taxDetails(formData);
  const plan = await FeePlan.create({
    name: formData.get("name"),
    type,
    amount: paise(formData.get("amount")),
    gstMode: tax.gstMode,
    gstPercentage: tax.gstPercentage,
    credits: type === "credits" ? Number(formData.get("credits") || 0) : 0,
    billingCycle: "monthly",
    billingDay: Number(formData.get("billingDay") || 1),
    dueAfterDays: Number(formData.get("dueAfterDays") || 0),
    lateFeeAmount: paise(formData.get("lateFeeAmount") || "500"),
    lateFeeAfterDays: overdueDays(formData.get("lateFeeAfterDays")),
    creditValidityDays: Number(formData.get("creditValidityDays") || 0),
  });
  await recordActivity({
    actor: (session.user as any).id,
    type: "fees.plan.created",
    label: `Created ${type} fee plan ${plan.name}`,
    entityType: "FeePlan",
    entityId: plan._id.toString(),
    metadata: { planName: plan.name, planType: type, amount: plan.amount, credits: plan.credits || 0, source: "manual_admin" },
  });
  revalidatePath("/fees/fee-plans");
  redirect("/fees/fee-plans?success=created");
}

async function updatePlan(formData: FormData) {
  "use server";
  const session = await requireFeesAccess("edit", "feePlans");
  if (!session) throw new Error("Forbidden");
  await dbConnect();
  const id = String(formData.get("id"));
  const type = String(formData.get("type")) as "monthly" | "credits";
  const tax = taxDetails(formData);
  const before: any = await FeePlan.findById(id).lean();
  const plan: any = await FeePlan.findByIdAndUpdate(id, {
    name: formData.get("name"),
    type,
    amount: paise(formData.get("amount")),
    gstMode: tax.gstMode,
    gstPercentage: tax.gstPercentage,
    credits: type === "credits" ? Number(formData.get("credits") || 0) : 0,
    billingDay: Number(formData.get("billingDay") || 1),
    dueAfterDays: Number(formData.get("dueAfterDays") || 0),
    lateFeeAmount: paise(formData.get("lateFeeAmount") || "500"),
    lateFeeAfterDays: overdueDays(formData.get("lateFeeAfterDays")),
    creditValidityDays: Number(formData.get("creditValidityDays") || 0),
  }, { new: true });
  if (plan) {
    await recordActivity({
      actor: (session.user as any).id,
      type: "fees.plan.updated",
      label: `Updated fee plan ${plan.name}`,
      entityType: "FeePlan",
      entityId: plan._id.toString(),
      metadata: {
        planName: plan.name,
        planType: plan.type,
        previousAmount: before?.amount,
        amount: plan.amount,
        previousCredits: before?.credits || 0,
        credits: plan.credits || 0,
        source: "manual_admin",
      },
    });
  }
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
  const session = await requireFeesAccess("edit", "feePlans");
  if (!session) throw new Error("Forbidden");
  await dbConnect();
  const id = String(formData.get("id") || "");
  if (await planIsLinked(id)) redirect("/fees/fee-plans?error=linked");
  const plan: any = await FeePlan.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (plan) {
    await recordActivity({
      actor: (session.user as any).id,
      type: "fees.plan.archived",
      label: `Archived fee plan ${plan.name}`,
      entityType: "FeePlan",
      entityId: plan._id.toString(),
      metadata: { planName: plan.name, planType: plan.type, source: "manual_admin" },
    });
  }
  revalidatePath("/fees/fee-plans");
  redirect("/fees/fee-plans?success=archived");
}

async function deletePlan(formData: FormData) {
  "use server";
  const session = await requireFeesAccess("delete", "feePlans");
  if (!session) throw new Error("Forbidden");
  await dbConnect();
  const id = String(formData.get("id") || "");
  if (await planIsLinked(id)) redirect("/fees/fee-plans?error=linked");
  const plan: any = await FeePlan.findByIdAndDelete(id).lean();
  if (plan) {
    await recordActivity({
      actor: (session.user as any).id,
      type: "fees.plan.deleted",
      label: `Deleted fee plan ${plan.name}`,
      entityType: "FeePlan",
      entityId: plan._id.toString(),
      metadata: { planName: plan.name, planType: plan.type, amount: plan.amount, credits: plan.credits || 0, source: "manual_admin" },
    });
  }
  revalidatePath("/fees/fee-plans");
  redirect("/fees/fee-plans?success=deleted");
}

export default async function FeePlansPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await requireFeesAccess("view", "feePlans"))) return <div className="p-6">Forbidden</div>;
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
      gstPercentage: plan.gstMode === "non_gst" ? 0 : plan.gstPercentage || 0,
      credits: plan.credits || 0,
      lateFeeAmount: plan.lateFeeAmount || 50000,
      lateFeeAfterDays: Math.min(plan.lateFeeAfterDays || 7, 7),
      isActive: plan.isActive !== false,
      isLinked: linkedPlanIds.has(plan._id.toString()),
    };
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(253,231,90,0.22),transparent_28%),linear-gradient(180deg,#fff_0%,#f8fafc_46%,#f5f3f8_100%)] px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-4 overflow-hidden rounded-lg border border-brand/15 bg-white shadow-sm shadow-brand-900/5">
        <div className="flex flex-col gap-4 border-b border-slate-200 bg-gradient-to-r from-brand-50 via-white to-accent/20 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-brand text-white shadow-sm shadow-brand/20"><Banknote size={19} /></span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand/70">Fees</p>
              <h1 className="text-2xl font-bold text-slate-950">Fee Plans</h1>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-right">
            <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Monthly</div>
              <div className="text-lg font-bold text-slate-950">{monthlyPlans.length}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Credits</div>
              <div className="text-lg font-bold text-slate-950">{creditPlans.length}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Active</div>
              <div className="text-lg font-bold text-slate-950">{plans.filter((plan: any) => plan.isActive !== false).length}</div>
            </div>
          </div>
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
