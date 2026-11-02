"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Empty } from "@/components/admin/retention/shared";

export type Question = { _id: string; text: string; type: "text" | "yesno" | "choice" | "rating"; options: string[]; perStudent: boolean; order: number; active: boolean };

const TYPES = [
  { key: "text", label: "Written answer" },
  { key: "yesno", label: "Yes / No" },
  { key: "choice", label: "Pick one option" },
  { key: "rating", label: "Rating 1-5" },
];

const BLANK = { text: "", type: "text" as Question["type"], options: "", perStudent: false };

/** The set questions asked on every call. Editing one never changes what an old call recorded. */
export default function QuestionsManager({ canManage }: { canManage: boolean }) {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/retention/questions?all=1", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(body.error || "Could not load the questions.");
    setQuestions(body.questions);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(id: string | null, payload: Record<string, unknown>, success: string) {
    setSaving(true);
    const response = await fetch(id ? `/api/admin/retention/questions/${id}` : "/api/admin/retention/questions", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      toast.error(body.error || "Could not save.");
      return false;
    }
    if (success) toast.success(success);
    await load();
    return true;
  }

  const payloadOf = (question: Question, changes: Partial<Question> = {}) => ({ ...question, ...changes });
  const active = (questions || []).filter((question) => question.active);

  async function move(question: Question, direction: -1 | 1) {
    const index = active.findIndex((row) => row._id === question._id);
    const other = active[index + direction];
    if (!other) return;
    await save(question._id, payloadOf(question, { order: other.order }), "");
    await save(other._id, payloadOf(other, { order: question.order }), "Moved.");
  }

  function startEdit(question?: Question) {
    setEditing(question ? question._id : "new");
    setForm(question ? { text: question.text, type: question.type, options: question.options.join("\n"), perStudent: question.perStudent } : BLANK);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-2">
        {!questions && <Empty title="Loading…" />}
        {questions?.map((question) => (
          <div key={question._id} className={`flex items-start gap-3 rounded-2xl border border-brand/10 bg-white p-4 shadow-sm ${question.active ? "" : "opacity-60"}`}>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-900">{question.text}</p>
              <p className="mt-1 text-xs text-slate-500">
                {TYPES.find((type) => type.key === question.type)?.label}
                {question.type === "choice" ? `: ${question.options.join(" / ")}` : ""}
                {question.perStudent ? " · asked for each child" : " · once per family"}
                {question.active ? "" : " · switched off"}
              </p>
            </div>
            {canManage && (
              <div className="flex shrink-0 items-center gap-1">
                {question.active && (
                  <>
                    <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => move(question, -1)} disabled={saving} aria-label="Move up"><ArrowUp size={15} /></button>
                    <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => move(question, 1)} disabled={saving} aria-label="Move down"><ArrowDown size={15} /></button>
                  </>
                )}
                <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => startEdit(question)} aria-label="Edit"><Pencil size={15} /></button>
                <button type="button" className="btn btn-outline !px-2 !py-1 text-xs" disabled={saving} onClick={() => save(question._id, payloadOf(question, { active: !question.active }), question.active ? "Switched off." : "Switched on.")}>
                  {question.active ? "Switch off" : "Switch on"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl border border-brand/10 bg-brand/5 p-4 text-sm leading-6 text-slate-700">
          These questions appear on every call screen. The caller can also add their own questions on a call. Answers are saved with the
          question as it was asked, so editing or switching off a question never changes old calls.
        </div>
        {canManage && editing === null && (
          <button type="button" className="btn btn-primary w-full" onClick={() => startEdit()}>
            <Plus size={16} /> Add a question
          </button>
        )}
        {canManage && editing !== null && (
          <form
            className="space-y-2 rounded-2xl border border-brand/10 bg-white p-4 shadow-sm"
            onSubmit={async (event) => {
              event.preventDefault();
              const current = questions?.find((question) => question._id === editing);
              const payload = {
                text: form.text,
                type: form.type,
                options: form.options.split("\n").map((option) => option.trim()).filter(Boolean),
                perStudent: form.perStudent,
                ...(current ? { active: current.active, order: current.order } : {}),
              };
              if (await save(editing === "new" ? null : editing, payload, editing === "new" ? "Question added." : "Question saved.")) setEditing(null);
            }}
          >
            <p className="text-sm font-black text-slate-900">{editing === "new" ? "New question" : "Edit question"}</p>
            <textarea className="input min-h-[70px]" value={form.text} maxLength={300} onChange={(event) => setForm({ ...form, text: event.target.value })} placeholder="e.g. Does your child talk about chess at home?" required />
            <select className="input" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as Question["type"] })}>
              {TYPES.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
            </select>
            {form.type === "choice" && (
              <textarea className="input min-h-[80px]" value={form.options} onChange={(event) => setForm({ ...form, options: event.target.value })} placeholder={"One option per line\nLoves it\nIt's fine\nNot really"} />
            )}
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.perStudent} onChange={(event) => setForm({ ...form, perStudent: event.target.checked })} />
              Ask it for each child (siblings get one answer each)
            </label>
            <div className="flex gap-2">
              <button type="button" className="btn btn-outline flex-1" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary flex-1" disabled={saving}>Save</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
