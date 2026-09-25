"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BookOpen, CalendarCheck2, History, Lock, Plus, RotateCcw, Save, SkipForward, Sparkles, Target, X } from "lucide-react";
import { toast } from "sonner";

import {
  CUSTOM_CHIP_MAX,
  EFFORT_SKILL,
  INTERNAL_NOTE_MAX,
  MAX_FOCUS_AREAS,
  MAX_HIGHLIGHTS,
  PARENT_NOTE_MAX,
  PARENT_NOTE_MIN,
  RATING_SCALE,
  questionSetFor,
} from "@/lib/feedback/feedbackQuestions";
import { SKIP_REASONS, isParentNoteComplete } from "@/lib/feedback/feedbackRules";
import { Avatar, ParentReportCard, StatusBadge, patchFeedback, type FeedbackItem } from "@/components/feedback/feedbackUi";

const EDITABLE = ["pending", "draft", "changes_requested"];

type Props = {
  item: FeedbackItem;
  previous?: Record<string, number>;
  position?: { index: number; total: number };
  onClose: () => void;
  onSaved: (item: FeedbackItem, advance: boolean) => void;
};

function ChipToggle({ label, active, onClick, disabled }: { label: string; active: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled && !active}
      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "border-brand bg-brand text-white shadow-sm shadow-brand/30" : "border-brand/15 bg-white text-slate-700 hover:border-brand/40 hover:bg-brand-50"
      }`}
    >
      {label}
    </button>
  );
}

function ChipPicker({
  title,
  icon: Icon,
  options,
  value,
  max,
  onChange,
  tone,
}: {
  title: string;
  icon: any;
  options: string[];
  value: string[];
  max: number;
  onChange: (value: string[]) => void;
  tone: string;
}) {
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState("");
  const extras = value.filter((entry) => !options.includes(entry));
  const full = value.length >= max;
  const toggle = (entry: string) => onChange(value.includes(entry) ? value.filter((row) => row !== entry) : full ? value : [...value, entry]);
  const addCustom = () => {
    const text = custom.trim().slice(0, CUSTOM_CHIP_MAX);
    if (text && !value.includes(text) && !full) onChange([...value, text]);
    setCustom("");
    setAdding(false);
  };
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className={`flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] ${tone}`}>
          <Icon size={13} />
          {title}
        </h3>
        <span className="text-[11px] font-semibold text-slate-400">
          {value.length}/{max}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <ChipToggle key={option} label={option} active={value.includes(option)} onClick={() => toggle(option)} disabled={full} />
        ))}
        {extras.map((entry) => (
          <ChipToggle key={entry} label={`${entry} ✕`} active onClick={() => toggle(entry)} />
        ))}
        {adding ? (
          <span className="inline-flex items-center gap-1">
            <input
              autoFocus
              className="input h-8 w-48 !py-1 text-xs"
              maxLength={CUSTOM_CHIP_MAX}
              value={custom}
              placeholder="Type and press Enter"
              onChange={(event) => setCustom(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addCustom();
                }
                if (event.key === "Escape") setAdding(false);
              }}
              onBlur={addCustom}
            />
          </span>
        ) : (
          !full && (
            <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-brand/30 px-3 py-1.5 text-xs font-bold text-brand hover:bg-brand-50">
              <Plus size={12} />
              Add your own
            </button>
          )
        )}
      </div>
    </section>
  );
}

export default function FeedbackForm({ item, previous, position, onClose, onSaved }: Props) {
  const editable = EDITABLE.includes(item.status);
  const set = useMemo(() => questionSetFor(item.tier), [item.tier]);
  const rows = useMemo(() => [...set.skills, EFFORT_SKILL], [set]);

  const hasOwnRatings = Object.keys(item.ratings || {}).length > 0;
  const prefilled = !hasOwnRatings && previous && Object.keys(previous).length > 0;
  const [ratings, setRatings] = useState<Record<string, number>>(() => (hasOwnRatings ? { ...item.ratings } : prefilled ? { ...previous } : {}));
  const [highlights, setHighlights] = useState<string[]>(item.highlights || []);
  const [focusAreas, setFocusAreas] = useState<string[]>(item.focusAreas || []);
  const [parentNote, setParentNote] = useState(item.parentNote || "");
  const [internalNote, setInternalNote] = useState(item.internalNote || "");
  const [activeRow, setActiveRow] = useState(0);
  const [busy, setBusy] = useState<"" | "draft" | "submit" | "skip">("");
  const [skipOpen, setSkipOpen] = useState(false);
  const [skipReason, setSkipReason] = useState<string>(SKIP_REASONS[0].value);
  const [skipNote, setSkipNote] = useState("");
  const dirty = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const touch = () => {
    dirty.current = true;
  };
  const ratingsDone = rows.every((row) => ratings[row.key]);
  const noteDone = isParentNoteComplete(parentNote);
  const complete = ratingsDone && noteDone;
  const ratedCount = rows.filter((row) => ratings[row.key]).length;

  const content = () => ({ ratings, highlights, focusAreas, parentNote, internalNote });

  async function save(action: "save_draft" | "submit", advance: boolean) {
    setBusy(action === "submit" ? "submit" : "draft");
    try {
      const saved = await patchFeedback(item.id, { action, ...content() });
      dirty.current = false;
      if (action === "submit") toast.success(`${item.studentName.split(" ")[0]}'s feedback submitted`);
      else toast.success("Draft saved");
      onSaved(saved, advance);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy("");
    }
  }

  async function skip() {
    setBusy("skip");
    try {
      const saved = await patchFeedback(item.id, { action: "skip", reason: skipReason, note: skipNote });
      dirty.current = false;
      toast.success("Student skipped for this month");
      onSaved(saved, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not skip");
    } finally {
      setBusy("");
    }
  }

  /** Closing never loses taps: unsaved work is kept as a draft. */
  async function close() {
    if (editable && dirty.current && !busy) {
      try {
        const saved = await patchFeedback(item.id, { action: "save_draft", ...content() });
        onSaved(saved, false);
        toast("Saved as draft");
      } catch {
        /* closing anyway */
      }
    }
    onClose();
  }

  // Keys 1-5 rate the highlighted row and move on; Ctrl/Cmd+Enter submits.
  useEffect(() => {
    if (!editable) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const typing = target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.tagName === "SELECT");
      if (event.key === "Escape") {
        void close();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        if (complete) void save("submit", true);
        return;
      }
      if (typing || skipOpen) return;
      const value = Number(event.key);
      if (value >= 1 && value <= 5) {
        const row = rows[activeRow];
        if (!row) return;
        setRatings((current) => ({ ...current, [row.key]: value }));
        touch();
        setActiveRow((index) => Math.min(index + 1, rows.length - 1));
      }
      if (event.key === "ArrowDown") setActiveRow((index) => Math.min(index + 1, rows.length - 1));
      if (event.key === "ArrowUp") setActiveRow((index) => Math.max(index - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, activeRow, rows, complete, skipOpen, ratings, highlights, focusAreas, parentNote, internalNote]);

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [item.id]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && void close()}>
      <div ref={panelRef} className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-[#fbf7ff] shadow-2xl" role="dialog" aria-modal="true" aria-label={`Feedback for ${item.studentName}`}>
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-brand/10 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex items-start gap-3">
            <Avatar name={item.studentName} size={44} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-black text-slate-950">{item.studentName}</h2>
                <StatusBadge status={item.status} />
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                <span className="rounded-full bg-accent px-2 py-0.5 font-black text-[#3d0c4e]">{set.tierLabel}</span>
                {item.courseName && <span className="truncate">{item.courseName}</span>}
                {position && <span className="text-slate-400">· {position.index + 1} of {position.total}</span>}
              </div>
            </div>
            <button type="button" onClick={() => void close()} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close">
              <X size={18} />
            </button>
          </div>
          {editable && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-brand/10">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(ratedCount / rows.length) * 100}%` }} />
            </div>
          )}
        </div>

        <div className="flex-1 space-y-5 px-5 py-5">
          {item.status === "changes_requested" && item.reviewNote && (
            <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <RotateCcw size={16} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-black">Admin asked for changes</div>
                <div className="mt-0.5">{item.reviewNote}</div>
              </div>
            </div>
          )}

          {/* Auto context - nothing to type */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-brand/10 bg-white p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                <CalendarCheck2 size={13} />
                Attendance
              </div>
              <div className="mt-1 text-xl font-black text-slate-900">
                {item.stats.classesAttended}
                <span className="text-sm font-bold text-slate-400"> / {item.stats.classesScheduled}</span>
              </div>
            </div>
            <div className="rounded-xl border border-brand/10 bg-white p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                <BookOpen size={13} />
                Topics covered
              </div>
              <div className="mt-1 line-clamp-2 text-xs font-semibold leading-4 text-slate-700" title={item.stats.topicsCovered.join(", ")}>
                {item.stats.topicsCovered.length ? item.stats.topicsCovered.join(" · ") : <span className="text-slate-400">None recorded</span>}
              </div>
            </div>
          </div>

          {!editable ? (
            <>
              <ParentReportCard item={item} />
              {item.internalNote && (
                <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/70 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-amber-700">
                    <Lock size={12} />
                    Internal note · academy only
                  </div>
                  <p className="mt-1 text-sm text-slate-800">{item.internalNote}</p>
                </div>
              )}
              {item.status === "skipped" && item.skipReason && <p className="text-sm text-slate-600">Skipped: {item.skipReason}</p>}
            </>
          ) : (
            <>
              {/* Ratings */}
              <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.14em] text-brand">How did the month go?</h3>
                  {prefilled && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                      <History size={11} />
                      Started from last month - tap what changed
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {rows.map((row, index) => {
                    const value = ratings[row.key] || 0;
                    const fromLastMonth = prefilled && previous?.[row.key] === value && !dirty.current;
                    return (
                      <div
                        key={row.key}
                        onClick={() => setActiveRow(index)}
                        className={`rounded-xl border bg-white p-3 transition ${activeRow === index ? "border-brand/40 ring-2 ring-brand/10" : "border-brand/10"} ${row.key === EFFORT_SKILL.key ? "bg-gradient-to-r from-white to-accent/10" : ""}`}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-900">{row.label}</div>
                            <div className="truncate text-[11px] text-slate-500">{row.hint}</div>
                          </div>
                          {fromLastMonth && <span className="shrink-0 text-[10px] font-semibold text-sky-600">last month</span>}
                        </div>
                        <div className="mt-2 grid grid-cols-5 gap-1">
                          {RATING_SCALE.map((step) => {
                            const active = value === step.value;
                            return (
                              <button
                                key={step.value}
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setRatings((current) => ({ ...current, [row.key]: step.value }));
                                  touch();
                                  setActiveRow(Math.min(index + 1, rows.length - 1));
                                }}
                                className={`flex flex-col items-center rounded-lg border px-1 py-1.5 text-center transition active:scale-95 ${
                                  active
                                    ? "border-brand bg-brand text-white shadow-md shadow-brand/30"
                                    : step.value <= value
                                      ? "border-brand/20 bg-brand-50 text-brand"
                                      : "border-slate-200 bg-white text-slate-500 hover:border-brand/40 hover:bg-brand-50"
                                }`}
                                aria-pressed={active}
                                title={`${step.value} - ${step.label}`}
                              >
                                <span className="text-sm font-black leading-4">{step.value}</span>
                                <span className="mt-0.5 text-[9px] font-semibold leading-3 sm:text-[10px]">{step.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 hidden text-[11px] text-slate-400 sm:block">Tip: press 1–5 to rate the highlighted row, Ctrl+Enter to submit.</p>
              </section>

              <ChipPicker
                title="Highlights this month"
                icon={Sparkles}
                tone="text-emerald-700"
                options={set.highlights}
                value={highlights}
                max={MAX_HIGHLIGHTS}
                onChange={(value) => {
                  setHighlights(value);
                  touch();
                }}
              />
              <ChipPicker
                title="Focus next month"
                icon={Target}
                tone="text-amber-700"
                options={set.focusAreas}
                value={focusAreas}
                max={MAX_FOCUS_AREAS}
                onChange={(value) => {
                  setFocusAreas(value);
                  touch();
                }}
              />

              <section>
                <div className="mb-1.5 flex items-center justify-between">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                    Note for parents <span className="text-rose-500">*</span>
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {parentNote.length}/{PARENT_NOTE_MAX}
                  </span>
                </div>
                <textarea
                  className={`input min-h-[72px] resize-y text-sm ${ratingsDone && !noteDone ? "border-rose-300 ring-2 ring-rose-100" : ""}`}
                  maxLength={PARENT_NOTE_MAX}
                  placeholder="One or two lines the family will read - what went well, and one thing to practise at home."
                  value={parentNote}
                  onChange={(event) => {
                    setParentNote(event.target.value);
                    touch();
                  }}
                />
                {!noteDone && (
                  <p className={`mt-1 text-[11px] ${ratingsDone ? "font-bold text-rose-600" : "text-slate-400"}`}>
                    Required - at least {PARENT_NOTE_MIN} characters. The admin can polish it before it is sent.
                  </p>
                )}
              </section>

              <section className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/60 p-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-amber-800">
                    <Lock size={12} />
                    Internal note · academy only
                  </h3>
                  <span className="text-[11px] text-amber-700/70">
                    {internalNote.length}/{INTERNAL_NOTE_MAX}
                  </span>
                </div>
                <textarea
                  className="input min-h-[60px] resize-y border-amber-200 bg-white/80 text-sm"
                  maxLength={INTERNAL_NOTE_MAX}
                  placeholder="Concerns, fee or behaviour issues, batch-change ideas…"
                  value={internalNote}
                  onChange={(event) => {
                    setInternalNote(event.target.value);
                    touch();
                  }}
                />
                <p className="mt-1 text-[11px] font-semibold text-amber-800/80">Never sent to parents or shown to the student.</p>
              </section>

              {skipOpen && (
                <section className="rounded-xl border border-slate-200 bg-white p-3">
                  <h3 className="mb-2 text-sm font-black text-slate-900">Skip {item.studentName.split(" ")[0]} this month?</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {SKIP_REASONS.map((reason) => (
                      <ChipToggle key={reason.value} label={reason.label} active={skipReason === reason.value} onClick={() => setSkipReason(reason.value)} />
                    ))}
                  </div>
                  <input className="input mt-2 text-sm" maxLength={200} placeholder="Anything the admin should know (optional)" value={skipNote} onChange={(event) => setSkipNote(event.target.value)} />
                  <div className="mt-2 flex justify-end gap-2">
                    <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => setSkipOpen(false)}>
                      Cancel
                    </button>
                    <button type="button" className="btn btn-outline px-3 py-1.5 text-xs" disabled={busy === "skip"} onClick={() => void skip()}>
                      {busy === "skip" ? "Skipping…" : "Confirm skip"}
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {editable && (
          <div className="sticky bottom-0 flex items-center gap-2 border-t border-brand/10 bg-white/95 px-5 py-3 backdrop-blur">
            <button type="button" className="btn btn-ghost px-3 py-2 text-xs" onClick={() => setSkipOpen((open) => !open)} disabled={Boolean(busy)}>
              <SkipForward size={14} />
              Skip
            </button>
            <button type="button" className="btn btn-outline px-3 py-2 text-xs" onClick={() => void save("save_draft", false)} disabled={Boolean(busy)}>
              <Save size={14} />
              {busy === "draft" ? "Saving…" : "Draft"}
            </button>
            <button
              type="button"
              className="btn btn-primary ml-auto px-4 py-2 text-sm disabled:opacity-50"
              onClick={() => void save("submit", true)}
              disabled={!complete || Boolean(busy)}
              title={complete ? "" : !ratingsDone ? "Rate every row to submit" : "Write the note for parents to submit"}
            >
              {busy === "submit" ? "Submitting…" : position && position.index + 1 < position.total ? "Submit & next" : "Submit"}
              <ArrowRight size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
