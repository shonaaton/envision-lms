"use client";

import { useEffect, useState } from "react";
import { Archive, ArrowLeft, Banknote, CreditCard, Eye, FilePenLine, Plus, Save, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";

type PlanType = "monthly" | "credits";
type GstMode = "included" | "excluded" | "non_gst";
type FeePlanView = {
  id: string;
  name: string;
  type: PlanType;
  amount: number;
  gstMode: GstMode;
  gstPercentage: number;
  credits: number;
  lateFeeAmount: number;
  lateFeeAfterDays: number;
  isActive: boolean;
  isLinked: boolean;
};
type ServerAction = (formData: FormData) => Promise<void>;
type WorkspaceMode = "home" | "create" | "manage";

function rupees(value: number) {
  return `INR ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format((value || 0) / 100)}`;
}

function gstLabel(mode: GstMode) {
  if (mode === "included") return "GST included";
  if (mode === "excluded") return "GST excluded";
  return "Non-GST";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10 ${props.className || ""}`} />;
}

function TypeControl({ value, onChange }: { value: PlanType; onChange: (value: PlanType) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-md bg-slate-100 p-1">
      {[
        ["monthly", "Monthly"],
        ["credits", "Credit-Based"],
      ].map(([type, label]) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type as PlanType)}
          className={`h-9 rounded px-3 text-sm font-medium ${value === type ? "bg-white text-purple-700 shadow-sm" : "text-slate-600"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function GstControl({ value, onChange }: { value: GstMode; onChange: (value: GstMode) => void }) {
  return (
    <div className="grid grid-cols-1 gap-2 rounded-md bg-slate-100 p-1 md:grid-cols-3">
      {[
        ["included", "GST Included"],
        ["excluded", "GST Excluded"],
        ["non_gst", "Non-GST Plan"],
      ].map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode as GstMode)}
          className={`h-9 rounded px-3 text-sm font-medium ${value === mode ? "bg-white text-purple-700 shadow-sm" : "text-slate-600"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function CreateFeePlanForm({ action }: { action: ServerAction }) {
  const [type, setType] = useState<PlanType>("monthly");
  const [gstMode, setGstMode] = useState<GstMode>("non_gst");

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="gstMode" value={gstMode} />
      <input type="hidden" name="billingDay" value="1" />
      <input type="hidden" name="dueAfterDays" value="0" />
      <input type="hidden" name="creditValidityDays" value="0" />

      <div className="grid gap-4 lg:grid-cols-[0.72fr_1fr]">
        <StepPanel step="1" title="Plan Type" description="Choose how students will be billed.">
          <TypeControl value={type} onChange={setType} />
        </StepPanel>
        <StepPanel step="2" title="Tax Mode" description="Select the GST behavior for invoices.">
          <GstControl value={gstMode} onChange={setGstMode} />
        </StepPanel>
      </div>

      <StepPanel step="3" title="Plan Details" description={type === "monthly" ? "Set the recurring amount and late-fee rules." : "Set credits, amount, and tax percentage."}>
        {type === "monthly" ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Plan Name">
              <Input name="name" required placeholder="Monthly Regular" />
            </Field>
            <Field label="Monthly Fee Amount">
              <Input name="amount" type="number" min="0" required placeholder="Amount in rupees" />
            </Field>
            <Field label="Billing Cycle">
              <Input value="30 days" readOnly className="bg-slate-50 text-slate-500" />
            </Field>
            <Field label="Late Fee After">
              <Input name="lateFeeAfterDays" type="number" min="0" defaultValue={10} />
            </Field>
            <Field label="Late Fee Amount">
              <Input name="lateFeeAmount" type="number" min="0" defaultValue={500} />
            </Field>
            <Field label="GST Percentage">
              <Input name="gstPercentage" type="number" min="0" defaultValue={18} disabled={gstMode === "non_gst"} />
            </Field>
            <input type="hidden" name="credits" value="0" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Plan Name">
              <Input name="name" required placeholder="10 Credit Pack" />
            </Field>
            <Field label="Credits">
              <Input name="credits" type="number" min="1" required placeholder="Number of credits" />
            </Field>
            <Field label="Fee Amount">
              <Input name="amount" type="number" min="0" required placeholder="Amount in rupees" />
            </Field>
            <Field label="Validity">
              <Input value="Unlimited until credits are used" readOnly className="bg-slate-50 text-slate-500" />
            </Field>
            <Field label="GST Percentage">
              <Input name="gstPercentage" type="number" min="0" defaultValue={18} disabled={gstMode === "non_gst"} />
            </Field>
            <input type="hidden" name="lateFeeAfterDays" value="0" />
            <input type="hidden" name="lateFeeAmount" value="0" />
          </div>
        )}
      </StepPanel>

      <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-purple-700 px-4 text-sm font-semibold text-white hover:bg-purple-800">
        <Plus size={15} /> Create Plan
      </button>
    </form>
  );
}

export function FeePlanEditor({ plan, updateAction, archiveAction, deleteAction }: { plan: FeePlanView; updateAction: ServerAction; archiveAction: ServerAction; deleteAction: ServerAction }) {
  const [gstMode, setGstMode] = useState<GstMode>(plan.gstMode);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-slate-950">{plan.name}</div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-purple-50 px-2 py-1 font-semibold text-purple-700">
              {plan.type === "monthly" ? "Monthly plan" : "Credit-based plan"}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
              {plan.gstMode === "included" ? "GST included" : plan.gstMode === "excluded" ? "GST excluded" : "Non-GST"}
            </span>
          </div>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs ${plan.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {plan.isActive ? "Active" : "Archived"}
        </span>
      </div>

      <form action={updateAction} className="space-y-3">
        <input type="hidden" name="id" value={plan.id} />
        <input type="hidden" name="type" value={plan.type} />
        <input type="hidden" name="gstMode" value={gstMode} />
        <input type="hidden" name="billingDay" value="1" />
        <input type="hidden" name="dueAfterDays" value="0" />
        <input type="hidden" name="creditValidityDays" value="0" />
        <GstControl value={gstMode} onChange={setGstMode} />

        {plan.type === "monthly" ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Plan Name"><Input name="name" defaultValue={plan.name} /></Field>
            <Field label="Monthly Fee"><Input name="amount" type="number" defaultValue={plan.amount / 100} /></Field>
            <Field label="Late Fee After"><Input name="lateFeeAfterDays" type="number" defaultValue={plan.lateFeeAfterDays || 10} /></Field>
            <Field label="Late Fee Amount"><Input name="lateFeeAmount" type="number" defaultValue={(plan.lateFeeAmount || 50000) / 100} /></Field>
            <Field label="GST Percentage"><Input name="gstPercentage" type="number" defaultValue={plan.gstPercentage || 18} disabled={gstMode === "non_gst"} /></Field>
            <input type="hidden" name="credits" value="0" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Plan Name"><Input name="name" defaultValue={plan.name} /></Field>
            <Field label="Credits"><Input name="credits" type="number" defaultValue={plan.credits || 0} /></Field>
            <Field label="Fee Amount"><Input name="amount" type="number" defaultValue={plan.amount / 100} /></Field>
            <Field label="GST Percentage"><Input name="gstPercentage" type="number" defaultValue={plan.gstPercentage || 18} disabled={gstMode === "non_gst"} /></Field>
            <input type="hidden" name="lateFeeAfterDays" value="0" />
            <input type="hidden" name="lateFeeAmount" value="0" />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button className="inline-flex h-9 items-center gap-1 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white">
            <Save size={13} /> Save
          </button>
          {plan.isActive && <button formAction={archiveAction} formNoValidate disabled={plan.isLinked} onClick={(event) => { if (!window.confirm(`Archive ${plan.name}?`)) event.preventDefault(); }} title={plan.isLinked ? "This plan is linked to a student or invoice" : "Archive plan"} className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 px-3 text-xs font-medium disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">
              <Archive size={13} /> Archive
            </button>}
          <button formAction={deleteAction} formNoValidate disabled={plan.isLinked} onClick={(event) => { if (!window.confirm(`Permanently delete ${plan.name}? This cannot be undone.`)) event.preventDefault(); }} title={plan.isLinked ? "This plan is linked to a student or invoice" : "Delete plan permanently"} className="inline-flex h-9 items-center gap-1 rounded-md border border-rose-200 px-3 text-xs font-medium text-rose-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400">
            <Trash2 size={13} /> Delete
          </button>
        </div>
        {plan.isLinked && <p className="text-xs font-semibold text-amber-700">Archive and delete are disabled because this plan is linked to a student assignment or invoice.</p>}
      </form>
    </div>
  );
}

function StepPanel({ step, title, description, children }: { step: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand text-xs font-bold text-white">{step}</span>
        <div>
          <h3 className="text-sm font-bold text-slate-950">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ActionCard({
  title,
  description,
  icon,
  onClick,
  tone = "light",
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: "light" | "brand";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-3 text-left shadow-sm transition hover:border-brand/25 ${
        tone === "brand" ? "border-brand bg-brand text-white shadow-brand/15 hover:bg-brand-700" : "border-slate-200 bg-white text-slate-950 hover:bg-slate-50"
      }`}
    >
      <span className={`mb-3 grid h-9 w-9 place-items-center rounded-md ${tone === "brand" ? "bg-accent text-brand" : "bg-brand/10 text-brand"}`}>
        {icon}
      </span>
      <span className="block text-sm font-bold">{title}</span>
      <span className={`mt-1 block text-xs leading-5 ${tone === "brand" ? "text-white/76" : "text-slate-600"}`}>{description}</span>
    </button>
  );
}

function PlanSummaryCard({
  plan,
  isEditing,
  onEdit,
  updateAction,
  archiveAction,
  deleteAction,
}: {
  plan: FeePlanView;
  isEditing: boolean;
  onEdit: () => void;
  updateAction: ServerAction;
  archiveAction: ServerAction;
  deleteAction: ServerAction;
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-950">{plan.name}</h3>
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${plan.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              {plan.isActive ? "Active" : "Archived"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-brand/10 px-2.5 py-1 text-brand">{plan.type === "monthly" ? "Monthly" : "Credit-based"}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{gstLabel(plan.gstMode)}</span>
            {plan.type === "credits" && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{plan.credits} credits</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-right">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Amount</div>
            <div className="text-sm font-bold text-slate-950">{rupees(plan.amount)}</div>
          </div>
          <button type="button" onClick={onEdit} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 hover:border-brand/30 hover:text-brand">
            <FilePenLine size={15} />
            {isEditing ? "Close" : "Edit"}
          </button>
        </div>
      </div>

      {isEditing && (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <FeePlanEditor plan={plan} updateAction={updateAction} archiveAction={archiveAction} deleteAction={deleteAction} />
        </div>
      )}
    </article>
  );
}

function PlanGroup({
  title,
  description,
  plans,
  editingId,
  setEditingId,
  updateAction,
  archiveAction,
  deleteAction,
}: {
  title: string;
  description: string;
  plans: FeePlanView[];
  editingId: string;
  setEditingId: (id: string) => void;
  updateAction: ServerAction;
  archiveAction: ServerAction;
  deleteAction: ServerAction;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-950">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{plans.length} plans</span>
      </div>
      <div className="space-y-3">
        {plans.map((plan) => (
          <PlanSummaryCard
            key={plan.id}
            plan={plan}
            isEditing={editingId === plan.id}
            onEdit={() => setEditingId(editingId === plan.id ? "" : plan.id)}
            updateAction={updateAction}
            archiveAction={archiveAction}
            deleteAction={deleteAction}
          />
        ))}
        {plans.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No plans created yet.</p>}
      </div>
    </section>
  );
}

export function FeePlansWorkspace({
  monthlyPlans,
  creditPlans,
  createAction,
  updateAction,
  archiveAction,
  deleteAction,
  notification,
}: {
  monthlyPlans: FeePlanView[];
  creditPlans: FeePlanView[];
  createAction: ServerAction;
  updateAction: ServerAction;
  archiveAction: ServerAction;
  deleteAction: ServerAction;
  notification?: "created" | "updated" | "archived" | "deleted" | "";
}) {
  const [mode, setMode] = useState<WorkspaceMode>("home");
  const [editingId, setEditingId] = useState("");
  const totalPlans = monthlyPlans.length + creditPlans.length;

  useEffect(() => {
    if (!notification) return;
    const messages = {
      created: { title: "Fee plan created successfully", description: "The new fee plan is ready and can now be assigned to students." },
      updated: { title: "Fee plan updated successfully", description: "Your changes have been saved." },
      archived: { title: "Fee plan archived successfully", description: "The fee plan is no longer active." },
      deleted: { title: "Fee plan deleted permanently", description: "The unlinked fee plan has been removed." },
    } as const;
    const message = messages[notification];
    toast.success(message.title, {
      id: `fee-plan-${notification}`,
      description: message.description,
      duration: 6000,
      className: "!w-[min(420px,calc(100vw-2rem))] !border-emerald-200 !bg-emerald-50 !p-5 !text-base !shadow-2xl",
    });
    const url = new URL(window.location.href);
    url.searchParams.delete("success");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [notification]);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand/70">Choose an action</p>
            <h2 className="text-base font-bold text-slate-950">Plan Workspace</h2>
          </div>
          {mode !== "home" && (
            <button type="button" onClick={() => setMode("home")} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:text-brand">
              <ArrowLeft size={16} />
              Back to choices
            </button>
          )}
        </div>
      </section>

      {mode === "home" && (
        <>
          <div className="grid gap-3 lg:grid-cols-3">
            <ActionCard title="Create Plan" description="Monthly or credit recharge pack." icon={<Plus size={18} />} onClick={() => setMode("create")} tone="brand" />
            <ActionCard title="View Plans" description={`${totalPlans} existing plans.`} icon={<Eye size={18} />} onClick={() => setMode("manage")} />
            <ActionCard title="Edit Plans" description="Update, archive, or delete." icon={<Settings2 size={18} />} onClick={() => setMode("manage")} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <MiniStat label="Monthly Plans" value={monthlyPlans.length} icon={<Banknote size={17} />} />
            <MiniStat label="Credit Plans" value={creditPlans.length} icon={<CreditCard size={17} />} />
            <MiniStat label="Active Plans" value={[...monthlyPlans, ...creditPlans].filter((plan) => plan.isActive).length} icon={<Save size={17} />} />
          </div>
        </>
      )}

      {mode === "create" && (
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base font-bold text-slate-950">Create Plan</h2>
            <p className="mt-1 text-xs text-slate-500">Choose monthly or credit-based in step 1.</p>
          </div>
          <CreateFeePlanForm action={createAction} />
        </section>
      )}

      {mode === "manage" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <PlanGroup title="Monthly Plans" description="Recurring fee plans. Type is locked after creation." plans={monthlyPlans} editingId={editingId} setEditingId={setEditingId} updateAction={updateAction} archiveAction={archiveAction} deleteAction={deleteAction} />
          <PlanGroup title="Credit Plans" description="Recharge packs. Type is locked after creation." plans={creditPlans} editingId={editingId} setEditingId={setEditingId} updateAction={updateAction} archiveAction={archiveAction} deleteAction={deleteAction} />
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <span className="grid h-9 w-9 place-items-center rounded-md bg-brand/10 text-brand">{icon}</span>
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div>
        <div className="mt-1 text-xl font-bold text-slate-950">{value}</div>
      </div>
    </div>
  );
}
