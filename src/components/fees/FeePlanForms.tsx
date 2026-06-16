"use client";

import { useState } from "react";
import { Archive, Plus, Save } from "lucide-react";

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
};
type ServerAction = (formData: FormData) => Promise<void>;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`h-10 w-full rounded-md border border-slate-200 px-3 text-sm ${props.className || ""}`} />;
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
    <form action={action} className="space-y-4">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="gstMode" value={gstMode} />
      <input type="hidden" name="billingDay" value="1" />
      <input type="hidden" name="dueAfterDays" value="0" />
      <input type="hidden" name="creditValidityDays" value="0" />

      <TypeControl value={type} onChange={setType} />
      <GstControl value={gstMode} onChange={setGstMode} />

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

      <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-purple-700 px-4 text-sm font-semibold text-white hover:bg-purple-800">
        <Plus size={15} /> Create Plan
      </button>
    </form>
  );
}

export function FeePlanEditor({ plan, updateAction, archiveAction }: { plan: FeePlanView; updateAction: ServerAction; archiveAction: ServerAction }) {
  const [type, setType] = useState<PlanType>(plan.type);
  const [gstMode, setGstMode] = useState<GstMode>(plan.gstMode);

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-slate-950">{plan.name}</div>
          <div className="text-xs text-slate-500">{plan.type === "monthly" ? "Monthly plan" : "Credit-based plan"}</div>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs ${plan.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {plan.isActive ? "Active" : "Archived"}
        </span>
      </div>

      <form action={updateAction} className="space-y-3">
        <input type="hidden" name="id" value={plan.id} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="gstMode" value={gstMode} />
        <input type="hidden" name="billingDay" value="1" />
        <input type="hidden" name="dueAfterDays" value="0" />
        <input type="hidden" name="creditValidityDays" value="0" />
        <TypeControl value={type} onChange={setType} />
        <GstControl value={gstMode} onChange={setGstMode} />

        {type === "monthly" ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Field label="Plan Name"><Input name="name" defaultValue={plan.name} /></Field>
            <Field label="Monthly Fee"><Input name="amount" type="number" defaultValue={plan.amount / 100} /></Field>
            <Field label="Billing Cycle"><Input value="30 days" readOnly className="bg-slate-50 text-slate-500" /></Field>
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
            <Field label="Validity"><Input value="Unlimited until credits are used" readOnly className="bg-slate-50 text-slate-500" /></Field>
            <Field label="GST Percentage"><Input name="gstPercentage" type="number" defaultValue={plan.gstPercentage || 18} disabled={gstMode === "non_gst"} /></Field>
            <input type="hidden" name="lateFeeAfterDays" value="0" />
            <input type="hidden" name="lateFeeAmount" value="0" />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button className="inline-flex h-9 items-center gap-1 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white">
            <Save size={13} /> Save
          </button>
          <button formAction={archiveAction} className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 px-3 text-xs font-medium">
            <Archive size={13} /> Archive
          </button>
        </div>
      </form>
    </div>
  );
}
