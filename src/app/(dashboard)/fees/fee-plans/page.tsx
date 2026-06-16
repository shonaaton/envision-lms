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

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-semibold">Existing Plans</h2>
        <div className="space-y-3">
          {plans.map((plan: any) => (
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
          ))}
          {plans.length === 0 && <p className="text-sm text-slate-500">No plans created yet.</p>}
        </div>
      </section>
    </div>
  );
}
