"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowLeft, ArrowUp, Eye, Loader2, Plus, Save, Trash2, Wand2 } from "lucide-react";
import ApplyForm from "@/components/careers/ApplyForm";
import JobDescription from "@/components/careers/JobDescription";
import {
  BASIC_FIELDS,
  CHOICE_TYPES,
  EMPLOYMENT_TYPES,
  FIELD_MODES,
  HIRE_ACCOUNT_ROLES,
  JOB_DEPARTMENTS,
  OPENING_PRESETS,
  QUESTION_TEMPLATES,
  QUESTION_TYPES,
  WORK_MODES,
  defaultBasicFields,
  newQuestionId,
  slugify,
  type BasicFieldModes,
  type JobQuestion,
} from "@/lib/careers/careersConfig";
import type { PostingView } from "@/lib/careers/careersService";

type Draft = Omit<PostingView, "id" | "publishedAt" | "updatedAt" | "createdAt" | "basicFields"> & { basicFields: BasicFieldModes };

const BLANK: Draft = {
  title: "",
  slug: "",
  department: "coaching",
  employmentType: "part_time",
  workMode: "remote",
  location: "",
  summary: "",
  description: "",
  payNote: "",
  status: "draft",
  closesAt: null,
  order: 100,
  basicFields: defaultBasicFields("coaching"),
  resume: "optional",
  questions: [],
  hireRole: "instructor",
  hireAccessRole: null,
};

const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10";
const MODE_LABEL: Record<string, string> = { off: "Hidden", optional: "Optional", required: "Required" };

/** IST calendar day of a stored closing date, for the date input. */
function toDateInput(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));
}

export default function OpeningEditor({ posting, accessRoles }: { posting: PostingView | null; accessRoles: { id: string; name: string }[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => (posting ? { ...BLANK, ...posting, basicFields: { ...defaultBasicFields(), ...posting.basicFields } } : BLANK));
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"edit" | "preview">("edit");

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const setQuestion = (index: number, patch: Partial<JobQuestion>) =>
    setDraft((current) => ({ ...current, questions: current.questions.map((question, i) => (i === index ? { ...question, ...patch } : question)) }));
  const moveQuestion = (index: number, delta: number) =>
    setDraft((current) => {
      const list = [...current.questions];
      const target = index + delta;
      if (target < 0 || target >= list.length) return current;
      [list[index], list[target]] = [list[target], list[index]];
      return { ...current, questions: list };
    });

  function addQuestion() {
    set("questions", [...draft.questions, { id: newQuestionId(), text: "", help: "", type: "text", options: [], required: false, active: true }]);
  }
  function loadTemplate(key: string) {
    const template = QUESTION_TEMPLATES[key];
    if (!template) return;
    if (draft.questions.length && !window.confirm(`Add the ${template.label} questions to the ${draft.questions.length} already here?`)) return;
    set("questions", [...draft.questions, ...template.questions.map((question) => ({ ...question, options: [...question.options], id: newQuestionId() + Math.random().toString(36).slice(2, 4) }))]);
  }

  function startFromPreset(key: string) {
    const preset = OPENING_PRESETS[key];
    if (!preset) return;
    if ((draft.title || draft.questions.length) && !window.confirm(`Replace what is in the form with the ${preset.label} template?`)) return;
    setDraft({
      ...BLANK,
      ...preset.posting,
      slug: preset.posting.slug || "",
      closesAt: null,
      basicFields: { ...preset.posting.basicFields },
      questions: preset.posting.questions.map((question, index) => ({ ...question, options: [...question.options], id: `${newQuestionId()}${index}` })),
    });
  }

  const previewPosting = useMemo(() => ({ id: "preview", title: draft.title || "Untitled opening", basicFields: draft.basicFields, resume: draft.resume, questions: draft.questions.filter((q) => q.text.trim()) }), [draft]);

  async function save(statusOverride?: Draft["status"]) {
    setSaving(true);
    try {
      const body = {
        ...draft,
        status: statusOverride || draft.status,
        // End of the chosen day in India.
        closesAt: draft.closesAt ? new Date(`${toDateInput(draft.closesAt) || draft.closesAt}T23:59:59+05:30`).toISOString() : null,
        hireAccessRole: draft.hireRole === "sub-admin" ? draft.hireAccessRole : null,
        questions: draft.questions.map((question) => ({ ...question, options: CHOICE_TYPES.includes(question.type) ? question.options.map((o) => o.trim()).filter(Boolean) : [] })),
      };
      const response = await fetch(posting ? `/api/admin/careers/postings/${posting.id}` : "/api/admin/careers/postings", {
        method: posting ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Could not save.");
      toast.success(body.status === "open" ? "Saved - live on /careers." : "Saved.");
      if (!posting) router.replace(`/admin/careers/openings/${payload.posting.id}`);
      else setDraft((current) => ({ ...current, ...payload.posting }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 p-2 text-slate-950">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin/careers" className="inline-flex items-center gap-1 text-xs font-black text-brand hover:underline"><ArrowLeft size={13} /> Job openings</Link>
          <h1 className="mt-1 text-2xl font-black text-brand">{posting ? `Edit: ${posting.title}` : "New opening"}</h1>
          <p className="text-sm text-slate-500">Status: <strong>{draft.status}</strong>{posting?.status === "open" ? <> · <Link className="text-brand underline" target="_blank" href={`/careers/${posting.slug}`}>/careers/{posting.slug}</Link></> : null}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-lg bg-slate-100 p-1">
            {(["edit", "preview"] as const).map((value) => (
              <button key={value} onClick={() => setTab(value)} className={`rounded-md px-3 py-1.5 text-sm font-black ${tab === value ? "bg-white text-brand shadow" : "text-slate-600"}`}>
                {value === "edit" ? "Edit" : <span className="inline-flex items-center gap-1"><Eye size={14} /> Preview</span>}
              </button>
            ))}
          </div>
          <button className="btn-outline" disabled={saving} onClick={() => void save()}>{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save</button>
          {draft.status !== "open" ? <button className="btn-primary" disabled={saving} onClick={() => void save("open")}>Save &amp; publish</button> : null}
        </div>
      </header>

      {!posting ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm">
          <Wand2 size={16} className="text-violet-700" />
          <span className="font-bold text-violet-900">Start from a ready-made opening:</span>
          {Object.entries(OPENING_PRESETS).map(([key, preset]) => (
            <button key={key} type="button" className="btn-outline h-9 border-violet-300 px-3 text-sm text-violet-800" onClick={() => startFromPreset(key)}>{preset.label}</button>
          ))}
          <span className="text-xs text-violet-800/70">Fills everything in as a draft - check it, then publish.</span>
        </div>
      ) : null}

      {tab === "preview" ? (
        <div className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-5 lg:grid-cols-[1fr_420px]">
          <div>
            <h2 className="text-2xl font-black">{draft.title || "Untitled opening"}</h2>
            <p className="mt-2 text-sm text-slate-600">{draft.summary}</p>
            <JobDescription text={draft.description} className="mt-4" />
          </div>
          <ApplyForm posting={previewPosting} preview />
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-black">Details</h2>
            <L label="Job title *"><input className={inputClass} value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="Online Chess Coach" /></L>
            <L label="Page address" hint={`/careers/${draft.slug || slugify(draft.title || "opening")}`}>
              <input className={inputClass} value={draft.slug} onChange={(e) => set("slug", slugify(e.target.value))} placeholder="leave blank to use the title" />
            </L>
            <div className="grid gap-3 sm:grid-cols-3">
              <L label="Team">
                <select className={inputClass} value={draft.department} onChange={(e) => set("department", e.target.value)}>
                  {JOB_DEPARTMENTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </L>
              <L label="Type">
                <select className={inputClass} value={draft.employmentType} onChange={(e) => set("employmentType", e.target.value)}>
                  {EMPLOYMENT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </L>
              <L label="Work mode">
                <select className={inputClass} value={draft.workMode} onChange={(e) => set("workMode", e.target.value)}>
                  {WORK_MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </L>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <L label="Location label" hint="Shown instead of the work mode, e.g. Bowbazar, Kolkata"><input className={inputClass} value={draft.location} onChange={(e) => set("location", e.target.value)} /></L>
              <L label="Pay (optional)" hint="e.g. ₹300-500 per class"><input className={inputClass} value={draft.payNote} onChange={(e) => set("payNote", e.target.value)} /></L>
            </div>
            <L label="Summary *" hint="One or two lines on the openings list"><textarea className={`${inputClass} h-20 py-2`} value={draft.summary} onChange={(e) => set("summary", e.target.value)} maxLength={400} /></L>
            <L label="Full description" hint='Blank line = new paragraph. "Responsibilities:" on its own line = heading. Lines starting with "-" = bullets.'>
              <textarea className={`${inputClass} h-56 py-2 font-mono text-[13px]`} value={draft.description} onChange={(e) => set("description", e.target.value)} />
            </L>
            <div className="grid gap-3 sm:grid-cols-2">
              <L label="Closes on (optional)"><input type="date" className={inputClass} value={toDateInput(draft.closesAt)} onChange={(e) => set("closesAt", e.target.value ? new Date(`${e.target.value}T12:00:00+05:30`).toISOString() : null)} /></L>
              <L label="Sort order" hint="Lower shows first"><input type="number" className={inputClass} value={draft.order} onChange={(e) => set("order", Number(e.target.value) || 0)} /></L>
            </div>

            <h2 className="pt-2 text-lg font-black">When you click Hire</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <L label="Create">
                <select className={inputClass} value={draft.hireRole} onChange={(e) => set("hireRole", e.target.value as Draft["hireRole"])}>
                  {HIRE_ACCOUNT_ROLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </L>
              {draft.hireRole === "sub-admin" ? (
                <L label="Named role (optional)" hint="Staff accounts need a Super Admin to hire">
                  <select className={inputClass} value={draft.hireAccessRole || ""} onChange={(e) => set("hireAccessRole", e.target.value || null)}>
                    <option value="">Plain sub-admin</option>
                    {accessRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                  </select>
                </L>
              ) : null}
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-black">Basic details asked</h2>
              <p className="text-sm text-slate-500">Name and WhatsApp number are always asked (the WhatsApp code submits the form).</p>
              <div className="mt-3 divide-y divide-slate-100">
                {BASIC_FIELDS.map((field) => (
                  <div key={field.key} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-sm font-bold">{field.label}</span>
                    <Segmented value={draft.basicFields[field.key]} onChange={(mode) => set("basicFields", { ...draft.basicFields, [field.key]: mode })} />
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm font-bold">Resume / CV upload</span>
                  <Segmented value={draft.resume as any} onChange={(mode) => set("resume", mode)} />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-black">Questionnaire ({draft.questions.length})</h2>
                <div className="flex flex-wrap gap-2">
                  <select className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold" value="" onChange={(e) => loadTemplate(e.target.value)}>
                    <option value="">Load starter set…</option>
                    {Object.entries(QUESTION_TEMPLATES).map(([key, template]) => <option key={key} value={key}>{template.label}</option>)}
                  </select>
                  <button className="btn-outline h-9 px-3 text-sm" onClick={addQuestion}><Plus size={14} /> Add question</button>
                </div>
              </div>
              <div className="mt-3 space-y-3">
                {draft.questions.map((question, index) => (
                  <div key={question.id} className={`rounded-xl border p-3 ${question.active ? "border-slate-200 bg-slate-50" : "border-dashed border-slate-300 bg-white opacity-60"}`}>
                    <div className="flex items-start gap-2">
                      <span className="mt-2 w-6 shrink-0 text-xs font-black text-slate-400">{index + 1}</span>
                      <div className="min-w-0 flex-1 space-y-2">
                        <input className={inputClass} value={question.text} onChange={(e) => setQuestion(index, { text: e.target.value })} placeholder="Question" />
                        <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
                          <select className={inputClass} value={question.type} onChange={(e) => setQuestion(index, { type: e.target.value as JobQuestion["type"] })}>
                            {QUESTION_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                          </select>
                          <input className={inputClass} value={question.help} onChange={(e) => setQuestion(index, { help: e.target.value })} placeholder="Help text (optional)" />
                        </div>
                        {CHOICE_TYPES.includes(question.type) ? (
                          <textarea
                            className={`${inputClass} h-24 py-2`}
                            value={question.options.join("\n")}
                            onChange={(e) => setQuestion(index, { options: e.target.value.split("\n") })}
                            placeholder={"One option per line\nOption A\nOption B"}
                          />
                        ) : null}
                        <div className="flex flex-wrap items-center gap-4 text-sm">
                          <label className="inline-flex items-center gap-1.5 font-bold"><input type="checkbox" checked={question.required} onChange={(e) => setQuestion(index, { required: e.target.checked })} /> Required</label>
                          <label className="inline-flex items-center gap-1.5 font-bold"><input type="checkbox" checked={question.active} onChange={(e) => setQuestion(index, { active: e.target.checked })} /> Shown</label>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <IconButton label="Move up" onClick={() => moveQuestion(index, -1)}><ArrowUp size={14} /></IconButton>
                        <IconButton label="Move down" onClick={() => moveQuestion(index, 1)}><ArrowDown size={14} /></IconButton>
                        <IconButton label="Remove" onClick={() => set("questions", draft.questions.filter((_, i) => i !== index))} danger><Trash2 size={14} /></IconButton>
                      </div>
                    </div>
                  </div>
                ))}
                {draft.questions.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                    <Wand2 size={14} className="mr-1 inline" /> No questions yet. Add your own, or load a starter set and edit it.
                  </p>
                ) : null}
              </div>
              <p className="mt-3 text-xs text-slate-500">Editing or removing a question later never changes answers already received - each application keeps the question as it was asked.</p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function L({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

function Segmented({ value, onChange }: { value: (typeof FIELD_MODES)[number]; onChange: (mode: (typeof FIELD_MODES)[number]) => void }) {
  return (
    <div className="flex shrink-0 rounded-lg bg-slate-100 p-0.5">
      {FIELD_MODES.map((mode) => (
        <button key={mode} type="button" onClick={() => onChange(mode)} className={`rounded-md px-2.5 py-1 text-xs font-black ${value === mode ? "bg-white text-brand shadow" : "text-slate-500"}`}>
          {MODE_LABEL[mode]}
        </button>
      ))}
    </div>
  );
}

function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={`grid h-7 w-7 place-items-center rounded-md border bg-white ${danger ? "border-rose-200 text-rose-600 hover:bg-rose-50" : "border-slate-200 text-slate-600 hover:bg-slate-100"}`}>
      {children}
    </button>
  );
}
