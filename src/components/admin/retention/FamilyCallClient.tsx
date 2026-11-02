"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarClock, CheckCircle2, Mail, MessageCircle, Phone, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CallCard, Empty, LevelBadge, daysAgo, formatDate, formatDateTime, type CallRow, type RiskLevel } from "@/components/admin/retention/shared";
import type { Question } from "@/components/admin/retention/QuestionsManager";
import { parseAcademyDateTimeLocal } from "@/lib/academyTime";
import { ACTION_LABELS, KIND_LABELS, OUTCOME_LABELS, isMissedOutcome, missedMessage, summaryMessage } from "@/lib/retention/familyRules";

type Child = {
  _id: string;
  name: string;
  isActive: boolean;
  left: { at: string | null; reason: string; note: string } | null;
  inClass: boolean;
  pausedUntil: string | null;
  classes: string[];
  coaches: string[];
  stats: {
    attended28: number;
    missed28: number;
    homeworkDue: number;
    homeworkNotDone: number;
    lastPracticeAt: string | null;
    puzzles30: number;
    lessons30: number;
    lastSeenAt: string | null;
    effort: number | null;
    exam: { label: string; availableUntil: string | null; started: boolean } | null;
  };
  fees: { planType: string | null; creditBalance: number | null; nextInvoiceDueAt: string | null };
  flag: { _id: string; level: RiskLevel; reasons: Array<{ code: string; severity: string; label: string; detail: string }>; taskHeldBackUntil: string | null } | null;
  points: Array<{ code: string; label: string; tone: "gap" | "good" }>;
};

type Family = {
  familyKey: string;
  primaryStudentId: string;
  parentName: string;
  parentEmail: string;
  phone: string;
  telHref: string;
  whatsappHref: string;
  childrenLabel: string;
  children: Child[];
  questions: Question[];
  calls: CallRow[];
  lastConnectedAt: string | null;
  calledRecently: boolean;
  pendingCallback: string | null;
  callsThisMonth: number;
};

const OUTCOMES = ["connected", "callback_requested", "no_answer", "busy", "switched_off", "wrong_number"] as const;
const KINDS = ["monthly", "risk", "callback", "renewal", "win_back", "other"] as const;
const SETTLE_OUTCOMES = [
  { key: "stayed", label: "Staying" },
  { key: "paused", label: "Pausing instead" },
  { key: "left", label: "Leaving" },
  { key: "false_alarm", label: "Not a real risk" },
];
const SATISFACTION_HINT = ["", "Very unhappy", "Unhappy", "Okay", "Happy", "Very happy"];

type Answers = Record<string, string>;
const answerKey = (questionId: string, studentId = "") => `${questionId}:${studentId}`;

export default function FamilyCallClient({ studentId, initialKind, canManage, callerName }: { studentId: string; initialKind: string; canManage: boolean; callerName: string }) {
  const [family, setFamily] = useState<Family | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<CallRow | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/retention/family/${studentId}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return setError(body.error || "Could not load this family.");
    setFamily(body);
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <Empty title={error} />;
  if (!family) return <Empty title="Loading the family…" />;

  return (
    <div className="min-w-0 text-slate-950">
      <Link href="/admin/retention" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
        <ArrowLeft size={15} /> Retention Center
      </Link>

      <div className="mb-4 rounded-2xl border border-brand/10 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-black text-brand">{family.children.map((child) => child.name).join(", ")}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {[family.parentName && `Parent: ${family.parentName}`, family.phone, family.parentEmail].filter(Boolean).join(" · ") || "No contact details on file"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {family.telHref && <a href={family.telHref} className="btn btn-primary"><Phone size={16} /> Call {family.phone}</a>}
            {family.whatsappHref && <a href={family.whatsappHref} target="_blank" rel="noreferrer" className="btn btn-outline"><MessageCircle size={16} /> WhatsApp</a>}
            {family.parentEmail && <a href={`mailto:${family.parentEmail}`} className="btn btn-outline"><Mail size={16} /> Email</a>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
            {family.lastConnectedAt ? `Last spoke ${formatDate(family.lastConnectedAt)} (${daysAgo(family.lastConnectedAt)}d ago)` : "Never spoken to"}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">{family.callsThisMonth} call{family.callsThisMonth === 1 ? "" : "s"} this month</span>
          {family.calledRecently && <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800">Spoken to in the last 15 days: no new risk tasks for now</span>}
          {family.pendingCallback && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 font-bold text-brand"><CalendarClock size={12} /> Asked for a callback {formatDateTime(family.pendingCallback)}</span>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="min-w-0 space-y-4">
          {family.children.map((child) => <ChildCard key={child._id} child={child} />)}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Past calls</p>
            {family.calls.length ? (
              <div className="space-y-2">{family.calls.map((call) => <CallCard key={call._id} call={call} />)}</div>
            ) : (
              <Empty title="No calls yet" hint="This is the first call to this family." />
            )}
          </div>
        </div>

        <div className="min-w-0">
          {saved ? (
            <div className="space-y-3 xl:sticky xl:top-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="flex items-center gap-2 font-black text-emerald-900"><CheckCircle2 size={18} /> Call saved</p>
                <p className="mt-1 text-sm text-emerald-900">Everyone on the team can now read it in Call history and on this family&apos;s page.</p>
              </div>
              <CallCard call={saved} />
              <div className="flex gap-2">
                <Link href="/admin/retention" className="btn btn-primary flex-1">Back to today&apos;s list</Link>
                <button type="button" className="btn btn-outline flex-1" onClick={() => setSaved(null)}>Log another call</button>
              </div>
            </div>
          ) : canManage ? (
            <CallForm family={family} initialKind={initialKind} callerName={callerName} onSaved={async (call) => { setSaved(call); await load(); }} />
          ) : (
            <Empty title="You can read this family's calls but not log new ones." />
          )}
        </div>
      </div>
    </div>
  );
}

function ChildCard({ child }: { child: Child }) {
  const s = child.stats;
  const practiceDays = daysAgo(s.lastPracticeAt);
  const seenDays = daysAgo(s.lastSeenAt);
  return (
    <div className="rounded-2xl border border-brand/10 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-black text-slate-950">{child.name}</span>
        {child.flag && <LevelBadge level={child.flag.level} />}
        {child.pausedUntil && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">Paused until {formatDate(child.pausedUntil)}</span>}
        {child.left && <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700">Left {formatDate(child.left.at)}</span>}
        {!child.left && !child.inClass && !child.pausedUntil && <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800">Not in a class</span>}
      </div>
      {(child.classes.length > 0 || child.coaches.length > 0) && (
        <p className="mt-1 text-xs text-slate-500">{[child.classes.join(", "), child.coaches.length ? `Coach: ${child.coaches.join(", ")}` : ""].filter(Boolean).join(" · ")}</p>
      )}
      {child.left && <p className="mt-1 text-xs text-slate-600">Reason given: <span className="font-semibold">{child.left.reason || "Not recorded"}</span>{child.left.note ? ` - ${child.left.note}` : ""}</p>}

      {!child.left && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Metric label="Classes (4 wks)" value={s.attended28 + s.missed28 ? `${s.attended28} of ${s.attended28 + s.missed28}` : "-"} bad={s.missed28 > 0} />
          <Metric label="Homework missed" value={s.homeworkDue ? `${s.homeworkNotDone} of ${s.homeworkDue}` : "None set"} bad={s.homeworkNotDone > 0} />
          <Metric label="Last practice" value={practiceDays === null ? "Never (3 mo)" : practiceDays === 0 ? "Today" : `${practiceDays}d ago`} bad={practiceDays === null || practiceDays >= 7} />
          <Metric label="Practice (30 days)" value={`${s.puzzles30} puzzles · ${s.lessons30} lessons`} bad={s.puzzles30 + s.lessons30 === 0} />
          <Metric label="Portal last opened" value={seenDays === null ? "Not recently" : seenDays === 0 ? "Today" : `${seenDays}d ago`} bad={seenDays === null || seenDays >= 14} />
          <Metric label="Effort (coach)" value={s.effort ? `${s.effort}/5` : "-"} bad={Boolean(s.effort && s.effort <= 2)} />
          {s.exam && <Metric label="Exam" value={`${s.exam.label}${s.exam.started ? " (started)" : ""}`} bad />}
          {(child.fees.planType || child.fees.nextInvoiceDueAt) && (
            <Metric
              label="Fees"
              value={child.fees.planType === "credits" ? `${child.fees.creditBalance ?? 0} credits left` : child.fees.nextInvoiceDueAt ? `Due ${formatDate(child.fees.nextInvoiceDueAt)}` : "Monthly"}
              bad={child.fees.planType === "credits" ? (child.fees.creditBalance ?? 0) <= 2 : Boolean(child.fees.nextInvoiceDueAt)}
            />
          )}
        </div>
      )}

      {child.flag && (
        <div className="mt-3 rounded-xl bg-rose-50/60 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-rose-800">Why they are flagged</p>
          <ul className="mt-1 space-y-0.5 text-sm text-slate-800">
            {child.flag.reasons.map((reason) => <li key={reason.code}>• {reason.label} <span className="text-xs text-slate-500">{reason.detail}</span></li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${bad ? "bg-amber-50" : "bg-slate-50"}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className={`text-sm font-bold ${bad ? "text-amber-900" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function CallForm({ family, initialKind, callerName, onSaved }: { family: Family; initialKind: string; callerName: string; onSaved: (call: CallRow) => Promise<void> }) {
  const [kind, setKind] = useState<string>((KINDS as readonly string[]).includes(initialKind) ? initialKind : "monthly");
  const [outcome, setOutcome] = useState<string>("");
  const [satisfaction, setSatisfaction] = useState(0);
  const [leavingIntent, setLeavingIntent] = useState("");
  const [duration, setDuration] = useState("");
  const [answers, setAnswers] = useState<Answers>({});
  const [extra, setExtra] = useState<Array<{ question: string; answer: string }>>([]);
  const [notes, setNotes] = useState("");
  const [parentSummary, setParentSummary] = useState("");
  const [coachNote, setCoachNote] = useState("");
  const [discussed, setDiscussed] = useState<Record<string, boolean>>({});
  const [followUps, setFollowUps] = useState<Array<{ type: string; note: string }>>([]);
  const [callbackAt, setCallbackAt] = useState("");
  const [settleFlagId, setSettleFlagId] = useState("");
  const [settleOutcome, setSettleOutcome] = useState("");
  const [sendMessage, setSendMessage] = useState(true);
  const [saving, setSaving] = useState(false);

  const connected = outcome === "connected";
  const missed = isMissedOutcome(outcome);
  const flags = family.children.filter((child) => child.flag).map((child) => ({ ...child.flag!, childName: child.name }));
  const points = useMemo(
    () => family.children.flatMap((child) => child.points.map((point) => ({ ...point, studentId: child._id, childName: child.name, key: `${child._id}:${point.code}` }))),
    [family]
  );

  const preview = useMemo(() => {
    if (connected) {
      return summaryMessage({
        parentName: family.parentName,
        callerName: callerName.split(/\s+/)[0] || "our team",
        children: family.childrenLabel,
        parentSummary,
        discussed: points.filter((point) => discussed[point.key]).map((point) => point.label),
      }).email;
    }
    if (missed) return missedMessage({ parentName: family.parentName, children: family.childrenLabel }).email;
    return "";
  }, [connected, missed, family, callerName, parentSummary, discussed, points]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!outcome) return toast.error("Choose how the call went.");
    const answerRows = family.questions.flatMap((question) => (question.perStudent ? family.children.filter((child) => !child.left).map((child) => child._id) : [""]).map((childId) => ({
      questionId: question._id,
      ...(childId ? { studentId: childId } : {}),
      answer: (answers[answerKey(question._id, childId)] || "").trim(),
    }))).filter((row) => row.answer);
    const callback = callbackAt ? parseAcademyDateTimeLocal(callbackAt) : null;
    setSaving(true);
    const response = await fetch("/api/admin/retention/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: family.primaryStudentId,
        kind,
        outcome,
        durationMinutes: duration ? Number(duration) : undefined,
        satisfaction: connected && satisfaction ? satisfaction : undefined,
        leavingIntent: connected && leavingIntent ? leavingIntent : undefined,
        answers: connected ? answerRows : [],
        extraQuestions: connected ? extra.filter((row) => row.question.trim()) : [],
        notes,
        parentSummary: connected ? parentSummary : "",
        coachNote,
        talkingPoints: points.map((point) => ({ studentId: point.studentId, code: point.code, label: point.label, discussed: Boolean(discussed[point.key]) })),
        actionItems: followUps.filter((item) => item.note.trim()),
        callbackAt: callback ? callback.toISOString() : null,
        sendMessage: (connected || missed) && sendMessage,
        settleFlag: connected && settleFlagId && settleOutcome ? { flagId: settleFlagId, outcome: settleOutcome, note: "" } : null,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return toast.error(body.error || "Could not save the call.");
    toast.success("Call saved.");
    await onSaved(body);
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-brand/10 bg-white p-4 shadow-sm xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-black text-slate-950">Log this call</h2>
        <select className="input w-auto !py-1 text-sm" value={kind} onChange={(event) => setKind(event.target.value)}>
          {KINDS.map((key) => <option key={key} value={key}>{KIND_LABELS[key]}</option>)}
        </select>
      </div>

      <Field label="How did it go?">
        <div className="grid grid-cols-2 gap-1.5">
          {OUTCOMES.map((key) => (
            <button key={key} type="button" onClick={() => setOutcome(key)} className={`rounded-lg border px-2 py-2 text-xs font-bold ${outcome === key ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
              {OUTCOME_LABELS[key]}
            </button>
          ))}
        </div>
      </Field>

      {points.length > 0 && (
        <Field label="Talking points" hint="Tick what you brought up. The ticked points go in the parent's email.">
          <ul className="space-y-1">
            {points.map((point) => (
              <li key={point.key}>
                <label className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm ${point.tone === "gap" ? "bg-amber-50 text-amber-950" : "bg-emerald-50 text-emerald-950"}`}>
                  <input type="checkbox" className="mt-1" checked={Boolean(discussed[point.key])} onChange={(event) => setDiscussed({ ...discussed, [point.key]: event.target.checked })} />
                  <span>{family.children.length > 1 && <span className="font-bold">{point.childName.split(/\s+/)[0]}: </span>}{point.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </Field>
      )}

      {connected && (
        <>
          <Field label="How happy is the family?">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" onClick={() => setSatisfaction(value)} className="p-0.5" aria-label={`${value} of 5`}>
                  <Star size={24} className={value <= satisfaction ? "fill-amber-400 text-amber-400" : "text-slate-300"} />
                </button>
              ))}
              <span className="ml-2 text-xs text-slate-500">{SATISFACTION_HINT[satisfaction]}</span>
            </div>
          </Field>
          {kind !== "win_back" && (
            <Field label="Any plans to pause or stop?">
              <div className="flex gap-1.5">
                {[{ key: "no", label: "No" }, { key: "maybe", label: "Thinking about it" }, { key: "yes", label: "Yes" }].map((item) => (
                  <button key={item.key} type="button" onClick={() => setLeavingIntent(item.key)} className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold ${leavingIntent === item.key ? (item.key === "no" ? "border-emerald-600 bg-emerald-600 text-white" : "border-rose-600 bg-rose-600 text-white") : "border-slate-200 text-slate-700"}`}>
                    {item.label}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {family.questions.map((question) => (
            <Field key={question._id} label={question.text}>
              <div className="space-y-1.5">
                {(question.perStudent ? family.children.filter((child) => !child.left) : [null]).map((child) => (
                  <div key={child?._id || "family"}>
                    {child && family.children.length > 1 && <p className="text-xs font-semibold text-slate-500">{child.name.split(/\s+/)[0]}</p>}
                    <AnswerInput question={question} value={answers[answerKey(question._id, child?._id)] || ""} onChange={(value) => setAnswers({ ...answers, [answerKey(question._id, child?._id)]: value })} />
                  </div>
                ))}
              </div>
            </Field>
          ))}

          <Field label="Your own questions">
            <div className="space-y-2">
              {extra.map((row, index) => (
                <div key={index} className="space-y-1 rounded-lg bg-slate-50 p-2">
                  <div className="flex gap-1">
                    <input className="input" value={row.question} maxLength={300} placeholder="Question" onChange={(event) => setExtra(extra.map((item, i) => (i === index ? { ...item, question: event.target.value } : item)))} />
                    <button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-rose-600" onClick={() => setExtra(extra.filter((_, i) => i !== index))} aria-label="Remove"><Trash2 size={15} /></button>
                  </div>
                  <textarea className="input min-h-[50px]" value={row.answer} maxLength={1000} placeholder="Answer" onChange={(event) => setExtra(extra.map((item, i) => (i === index ? { ...item, answer: event.target.value } : item)))} />
                </div>
              ))}
              <button type="button" className="btn btn-outline w-full !py-1.5 text-xs" onClick={() => setExtra([...extra, { question: "", answer: "" }])}><Plus size={14} /> Add a question</button>
            </div>
          </Field>
        </>
      )}

      {outcome && (
        <>
          <Field label={connected ? "Notes for the team" : "Notes (optional)"} hint="Everyone on the team can read these. They are never sent to the family.">
            <textarea className="input min-h-[90px]" value={notes} maxLength={4000} onChange={(event) => setNotes(event.target.value)} placeholder={connected ? "What did the family say? e.g. finds the 7pm slot hard on school nights; wants weekend classes" : "e.g. phone rang out twice"} />
          </Field>

          {connected && (
            <Field label="What we agreed (sent to the parent)" hint="One or two lines. Goes in the thank-you WhatsApp and email.">
              <textarea className="input min-h-[60px]" value={parentSummary} maxLength={300} onChange={(event) => setParentSummary(event.target.value)} placeholder="e.g. Aarav will do 10 puzzles a week on the portal, and we will move him to the Saturday batch." />
            </Field>
          )}

          <Field label="Share a note with the coach (optional)" hint="Only this note reaches the coach. Keep it about the class: never fees or pause details.">
            <textarea className="input min-h-[50px]" value={coachNote} maxLength={1000} onChange={(event) => setCoachNote(event.target.value)} placeholder="e.g. Parent says Aarav finds the endgame homework too hard." />
          </Field>

          <Field label="Follow-ups for the team" hint="Each one becomes a task for the right person. Fee questions go to the fees owner.">
            <div className="space-y-2">
              {followUps.map((item, index) => (
                <div key={index} className="space-y-1 rounded-lg bg-slate-50 p-2">
                  <div className="flex gap-1">
                    <select className="input" value={item.type} onChange={(event) => setFollowUps(followUps.map((row, i) => (i === index ? { ...row, type: event.target.value } : row)))}>
                      {Object.entries(ACTION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                    <button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-rose-600" onClick={() => setFollowUps(followUps.filter((_, i) => i !== index))} aria-label="Remove"><Trash2 size={15} /></button>
                  </div>
                  <input className="input" value={item.note} maxLength={1000} placeholder="What needs doing?" onChange={(event) => setFollowUps(followUps.map((row, i) => (i === index ? { ...row, note: event.target.value } : row)))} />
                </div>
              ))}
              <button type="button" className="btn btn-outline w-full !py-1.5 text-xs" onClick={() => setFollowUps([...followUps, { type: kind === "win_back" ? "rejoin" : "timing_change", note: "" }])}><Plus size={14} /> Add a follow-up</button>
              {outcome === "wrong_number" && <p className="text-xs text-slate-500">A task to fix the phone number is added for the admins.</p>}
            </div>
          </Field>

          <Field label={outcome === "callback_requested" ? "When to call back" : "Call back later (optional)"} hint="You get a task at this time.">
            <input type="datetime-local" className="input" value={callbackAt} onChange={(event) => setCallbackAt(event.target.value)} required={outcome === "callback_requested"} />
          </Field>

          <Field label="Call length in minutes (optional)">
            <input type="number" min={0} max={180} className="input w-28" value={duration} onChange={(event) => setDuration(event.target.value)} />
          </Field>

          {connected && flags.length > 0 && (
            <Field label="Settle the risk flag (optional)" hint="Only if the call settled it. Otherwise the call is just added to the flag's log.">
              <div className="space-y-1.5">
                {flags.length > 1 && (
                  <select className="input" value={settleFlagId} onChange={(event) => setSettleFlagId(event.target.value)}>
                    <option value="">Which child?</option>
                    {flags.map((flag) => <option key={flag._id} value={flag._id}>{flag.childName}</option>)}
                  </select>
                )}
                <select className="input" value={settleOutcome} onChange={(event) => { setSettleOutcome(event.target.value); if (flags.length === 1) setSettleFlagId(event.target.value ? flags[0]._id : ""); }}>
                  <option value="">Leave the flag open</option>
                  {SETTLE_OUTCOMES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                </select>
              </div>
            </Field>
          )}

          {(connected || missed) ? (
            <div className="rounded-xl border border-slate-200 p-3">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <input type="checkbox" checked={sendMessage} onChange={(event) => setSendMessage(event.target.checked)} />
                {connected ? "Send the family a thank-you (WhatsApp + email)" : "Tell the family we tried to reach them (WhatsApp + email)"}
              </label>
              {sendMessage && <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 font-sans text-xs leading-5 text-slate-600">{preview}</pre>}
              {missed && sendMessage && <p className="mt-1 text-[11px] text-slate-500">Sent at most once a day per family.</p>}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No message goes to the family for this outcome.</p>
          )}
        </>
      )}

      <button type="submit" className="btn btn-primary w-full" disabled={saving || !outcome}>
        <CheckCircle2 size={16} /> {saving ? "Saving…" : "Save call"}
      </button>
    </form>
  );
}

function AnswerInput({ question, value, onChange }: { question: Question; value: string; onChange: (value: string) => void }) {
  if (question.type === "yesno" || question.type === "choice" || question.type === "rating") {
    const options = question.type === "yesno" ? ["Yes", "No"] : question.type === "rating" ? ["1", "2", "3", "4", "5"] : question.options;
    return (
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <button key={option} type="button" onClick={() => onChange(value === option ? "" : option)} className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${value === option ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
            {option}
          </button>
        ))}
      </div>
    );
  }
  return <textarea className="input min-h-[50px]" value={value} maxLength={1000} onChange={(event) => onChange(event.target.value)} />;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{label}</p>
      {children}
      {hint && <p className="mt-1 text-[11px] leading-4 text-slate-500">{hint}</p>}
    </div>
  );
}
