"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { CalendarOff, CalendarPlus, CheckCircle2, Clock, Coins, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { academyDateKey, academyDateTime } from "@/lib/academyTime";
import { creditCost, formatCredits, leaveDayLabel, type LeaveViewer, type SerializedLeave } from "@/lib/leave/leaveRules";
import LeaveCreditsPanel from "./LeaveCreditsPanel";
import { Drawer, StatusChip, TypeChip, button, danger, dateTime, field, secondary, sendJson, timeOnly } from "./leaveUi";

type Credits = { limited: boolean; balance: number; held: number; available: number } | null;
type Rules = { fullDayNoticeHours: number; halfDayNoticeHours: number; maxHalfDayClasses: number; maxDaysAhead: number };
type Data = { mine: SerializedLeave[]; leaves: SerializedLeave[]; credits: Credits; rules: Rules; today: string };
type TeachingClass = { classroom: string; sessionId: string; title: string; start: string; end: string; studentCount: number };
type Drawer = { mode: "apply" } | { mode: "reject" | "cancel"; leave: SerializedLeave } | null;

const DEFAULT_RULES: Rules = { fullDayNoticeHours: 24, halfDayNoticeHours: 3, maxHalfDayClasses: 2, maxDaysAhead: 180 };

export default function LeaveClient({ viewer, initialId = "", initialTab = "" }: { viewer: LeaveViewer; initialId?: string; initialTab?: string }) {
  const [data, setData] = useState<Data>({ mine: [], leaves: [], credits: null, rules: DEFAULT_RULES, today: academyDateKey(new Date()) });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState(initialTab || (viewer.isApprover ? "pending" : "mine"));
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [highlight, setHighlight] = useState(initialId);
  const loadGeneration = useRef(0);
  const placedInitial = useRef(false);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    try {
      const response = await fetch("/api/leave", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load leave.");
      if (generation === loadGeneration.current) { setData(result); setError(""); setLoaded(true); }
    } catch (e) {
      if (generation === loadGeneration.current) { setError(e instanceof Error ? e.message : "Could not load leave."); setLoaded(true); }
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const today = data.today;
  const pending = data.leaves.filter((leave) => leave.status === "requested");
  const upcoming = data.leaves.filter((leave) => leave.status === "approved" && leave.dateKey >= today);
  const history = data.leaves.filter((leave) => !pending.includes(leave) && !upcoming.includes(leave)).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  const tabs = useMemo(() => {
    const list: [string, string, number | null][] = [];
    if (viewer.isApprover) list.push(["pending", "Pending", pending.length], ["upcoming", "Upcoming", upcoming.length], ["history", "History", null]);
    if (viewer.canApply) list.push(["mine", "My leave", null]);
    if (viewer.canManageCredits) list.push(["credits", "Credits", null]);
    return list;
  }, [viewer, pending.length, upcoming.length]);

  // A link from a notice or task (`?id=`) opens the tab that holds that leave.
  useEffect(() => {
    if (!initialId || !loaded || placedInitial.current) return;
    placedInitial.current = true;
    const where = pending.some((l) => l._id === initialId) ? "pending" : upcoming.some((l) => l._id === initialId) ? "upcoming" : history.some((l) => l._id === initialId) ? "history" : data.mine.some((l) => l._id === initialId) ? "mine" : "";
    if (where && tabs.some(([id]) => id === where)) setTab(where);
    window.setTimeout(() => document.getElementById(`leave-${initialId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
    window.setTimeout(() => setHighlight(""), 6000);
  }, [initialId, loaded, pending, upcoming, history, data.mine, tabs]);

  async function act(leave: SerializedLeave, body: Record<string, unknown>, success: string) {
    setBusy(true); setFormError("");
    try {
      await sendJson(`/api/leave/${leave._id}`, "PATCH", body);
      toast.success(success);
      setDrawer(null);
      await load();
      window.dispatchEvent(new Event("leave-updated"));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not update the leave.";
      setFormError(message); toast.error(message);
    } finally { setBusy(false); }
  }

  const rows = tab === "pending" ? pending : tab === "upcoming" ? upcoming : tab === "history" ? history : tab === "mine" ? data.mine : [];
  const credits = data.credits;

  return (
    <div className="space-y-5 text-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-brand"><CalendarOff size={22} /><h1 className="text-2xl font-black">Leave</h1></div>
          <p className="mt-1 text-sm text-slate-500">
            {viewer.isApprover ? "Approve staff leave, and make sure every class on an approved leave has a substitute." : "Apply for a full or half day off. You will be told as soon as it is reviewed."}
          </p>
        </div>
        {viewer.canApply && <button className={button} onClick={() => { setFormError(""); setDrawer({ mode: "apply" }); }}><CalendarPlus size={16} />Apply for leave</button>}
      </div>

      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-700">{error} <button onClick={() => void load()} className="underline">Retry</button></p>}

      {viewer.canApply && credits && (
        <section className="rounded-xl border border-brand/10 bg-gradient-to-br from-purple-50 to-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand"><Coins size={14} />Your leave credits</p>
              {credits.limited
                ? <p className="mt-2 text-3xl font-black text-brand">{formatCredits(credits.available)} <span className="text-base font-semibold text-slate-500">available</span></p>
                : <p className="mt-2 text-2xl font-black text-brand">No limit</p>}
            </div>
            {credits.limited && <div className="flex gap-6 text-center">{[["Balance", credits.balance], ["Held by requests", credits.held]].map(([label, value]) => <div key={String(label)}><p className="text-xl font-bold">{formatCredits(Number(value))}</p><p className="text-xs text-slate-500">{label}</p></div>)}</div>}
          </div>
          <p className="mt-3 text-xs text-slate-600">
            {credits.limited
              ? "A full day uses 1 credit and a half day 0.5, taken when the leave is approved. Pending requests hold their credits; a rejected or cancelled leave gives them back."
              : "An admin has not set a credit limit for you, so leave does not use credits."}
            {" "}Full day: apply at least {data.rules.fullDayNoticeHours} hours before the day starts. Half day: at least {data.rules.halfDayNoticeHours} hours before your first chosen class, at most {data.rules.maxHalfDayClasses} classes.
          </p>
        </section>
      )}

      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Leave">
          {tabs.map(([id, label, count]) => <button key={id} role="tab" aria-selected={id === tab} className={id === tab ? button : secondary} onClick={() => setTab(id)}>{label}{count !== null && <span className="text-xs opacity-70">{count}</span>}</button>)}
        </div>
      )}

      {tab === "credits" ? <LeaveCreditsPanel /> : !loaded ? <p className="p-8 text-center text-sm text-slate-500">Loading leave…</p> : !rows.length ? (
        <div className="rounded-xl border border-dashed border-brand/20 bg-white p-10 text-center">
          <CalendarOff className="mx-auto text-purple-300" size={30} />
          <p className="mt-3 font-bold">{tab === "pending" ? "No leave waiting for approval" : tab === "upcoming" ? "No upcoming approved leave" : "No leave here yet"}</p>
          <p className="mt-1 text-sm text-slate-500">{tab === "mine" ? "Use “Apply for leave” to ask for a day off." : "Requests from coaches and sub-admins will appear here."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((leave) => <LeaveCard key={leave._id} leave={leave} viewer={viewer} today={today} busy={busy} highlighted={highlight === leave._id} showApplicant={tab !== "mine"}
            onApprove={() => void act(leave, { action: "approve" }, `Leave approved for ${leave.applicantName}.`)}
            onReject={() => { setFormError(""); setDrawer({ mode: "reject", leave }); }}
            onCancel={() => { setFormError(""); setDrawer({ mode: "cancel", leave }); }} />)}
        </div>
      )}

      <Drawer open={drawer?.mode === "apply"} busy={busy} onClose={() => setDrawer(null)} title="Apply for leave" description="All dates and times are IST.">
        {drawer?.mode === "apply" && <ApplyForm rules={data.rules} credits={credits} today={today} busy={busy} setBusy={setBusy} onDone={async () => { setDrawer(null); setTab("mine"); await load(); window.dispatchEvent(new Event("leave-updated")); }} />}
      </Drawer>

      <Drawer open={drawer?.mode === "reject" || drawer?.mode === "cancel"} busy={busy} onClose={() => setDrawer(null)}
        title={drawer?.mode === "reject" ? "Reject leave" : "Cancel leave"}
        description={drawer && drawer.mode !== "apply" ? `${drawer.leave.applicantName} · ${leaveDayLabel(drawer.leave.dateKey)}` : undefined}>
        {drawer && drawer.mode !== "apply" && (
          <form className="space-y-4" onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const reason = String(new FormData(event.currentTarget).get("reason") || "");
            void act(drawer.leave, { action: drawer.mode, reason }, drawer.mode === "reject" ? "Leave rejected." : "Leave cancelled.");
          }}>
            {drawer.mode === "cancel" && drawer.leave.status === "approved" && drawer.leave.sessions.length > 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Substitutes already assigned stay in place. Change them on the classroom if the coach will now teach.</p>}
            {drawer.mode === "cancel" && drawer.leave.creditCharged > 0 && <p className="rounded-lg bg-purple-50 p-3 text-sm text-brand">{formatCredits(drawer.leave.creditCharged)} credit will be returned.</p>}
            <label className="block text-sm font-semibold">Reason{drawer.mode === "cancel" ? " (optional)" : ""}<textarea name="reason" className={field} required={drawer.mode === "reject"} maxLength={1000} rows={3} /></label>
            {formError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{formError}</p>}
            <div className="flex gap-2"><button disabled={busy} className={button} type="submit">{busy ? "Saving…" : drawer.mode === "reject" ? "Reject and notify" : "Cancel leave"}</button><button type="button" className={secondary} disabled={busy} onClick={() => setDrawer(null)}>Back</button></div>
          </form>
        )}
      </Drawer>
    </div>
  );
}

function LeaveCard({ leave, viewer, today, busy, highlighted, showApplicant, onApprove, onReject, onCancel }: {
  leave: SerializedLeave; viewer: LeaveViewer; today: string; busy: boolean; highlighted: boolean; showApplicant: boolean;
  onApprove: () => void; onReject: () => void; onCancel: () => void;
}) {
  const own = leave.applicant === viewer.id;
  const started = leave.startsAt ? new Date(leave.startsAt).getTime() <= Date.now() : false;
  const canDecide = viewer.isApprover && !own && leave.status === "requested" && leave.dateKey >= today;
  const canCancel = (own && (leave.status === "requested" || (leave.status === "approved" && !started))) || (viewer.isApprover && leave.status === "approved" && leave.dateKey >= today);
  const watchCover = leave.status === "approved" && leave.dateKey >= today && leave.sessions.length > 0;
  const uncovered = leave.sessions.filter((session) => session.covered === false && (!session.end || new Date(session.end).getTime() > Date.now())).length;
  return (
    <article id={`leave-${leave._id}`} className={`rounded-xl border bg-white p-4 shadow-sm transition ${highlighted ? "border-brand ring-2 ring-purple-200" : "border-slate-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold">{showApplicant ? `${leave.applicantName}${own ? " (you)" : ""}` : leaveDayLabel(leave.dateKey)}</h2>
            <TypeChip type={leave.type} />
            <StatusChip status={leave.status} />
            {showApplicant && <span className="text-xs text-slate-500">{leave.applicantRole === "instructor" ? "Coach" : "Sub-admin"}</span>}
          </div>
          {showApplicant && <p className="mt-1 text-sm font-semibold text-slate-700">{leaveDayLabel(leave.dateKey)}</p>}
          <p className="mt-2 whitespace-pre-wrap text-sm">{leave.reason}</p>
          <p className="mt-1 text-xs text-slate-500">
            Applied {dateTime(leave.createdAt)} IST{leave.creditCharged > 0 ? ` · ${formatCredits(leave.creditCharged)} credit${leave.creditCharged === 1 ? "" : "s"} used` : ""}
          </p>
          {leave.decidedByName && leave.status !== "requested" && leave.status !== "expired" && <p className="mt-1 text-xs text-slate-500">{leave.status === "rejected" ? "Rejected" : "Approved"} by {leave.decidedByName}{leave.decidedAt ? ` · ${dateTime(leave.decidedAt)} IST` : ""}</p>}
          {leave.rejectionReason && <p className="mt-2 text-sm text-rose-700">Reason: {leave.rejectionReason}</p>}
          {leave.status === "cancelled" && <p className="mt-2 text-sm text-slate-500">Cancelled {dateTime(leave.cancelledAt)} IST{leave.cancelReason ? `: ${leave.cancelReason}` : ""}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canDecide && <><button className={button} disabled={busy} onClick={onApprove}><CheckCircle2 size={16} />Approve</button><button className={secondary} disabled={busy} onClick={onReject}>Reject</button></>}
          {canCancel && <button className={danger} disabled={busy} onClick={onCancel}>Cancel leave</button>}
        </div>
      </div>
      {leave.sessions.length > 0 && (
        <div className="mt-4 rounded-lg bg-slate-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Classes on this leave</p>
            {watchCover && (uncovered > 0
              ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{uncovered} need{uncovered === 1 ? "s" : ""} a substitute</span>
              : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">All covered</span>)}
          </div>
          <ul className="mt-2 space-y-1.5">
            {leave.sessions.map((session) => (
              <li key={`${session.classroom}:${session.sessionId}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2"><Clock size={14} className="text-slate-400" /><span className="font-semibold">{timeOnly(session.start)}</span> {session.title}{session.studentCount ? <span className="text-xs text-slate-500">· {session.studentCount} student{session.studentCount === 1 ? "" : "s"}</span> : null}</span>
                {watchCover && (session.covered
                  ? <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700"><UserRoundCheck size={14} />{session.substituteName ? `Substitute: ${session.substituteName}` : "Covered"}</span>
                  : viewer.isApprover
                    ? <Link className="text-xs font-semibold text-brand underline" href={`/classrooms/${session.classroom}`}>Assign substitute</Link>
                    : <span className="text-xs text-amber-700">Substitute being arranged</span>)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function ApplyForm({ rules, credits, today, busy, setBusy, onDone }: { rules: Rules; credits: Credits; today: string; busy: boolean; setBusy: (value: boolean) => void; onDone: () => Promise<void> }) {
  const [type, setType] = useState<"full_day" | "half_day">("full_day");
  const [date, setDate] = useState("");
  const [classes, setClasses] = useState<TeachingClass[] | null>(null);
  const [classesError, setClassesError] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    setChosen([]); setClasses(null); setClassesError("");
    if (!date) return;
    let alive = true;
    fetch(`/api/leave/classes?date=${encodeURIComponent(date)}`, { cache: "no-store" })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); if (alive) setClasses(result.classes || []); })
      .catch((e) => { if (alive) setClassesError(e instanceof Error ? e.message : "Could not load your classes."); });
    return () => { alive = false; };
  }, [date]);

  const maxDate = academyDateKey(new Date(now + rules.maxDaysAhead * 86400_000));
  const selected = (classes || []).filter((item) => chosen.includes(item.sessionId));
  const cost = creditCost(type);
  const notice = (() => {
    if (!date) return null;
    if (type === "full_day") {
      const deadline = academyDateTime(date, "00:00").getTime() - rules.fullDayNoticeHours * 3600_000;
      return now > deadline ? `Full-day leave needs ${rules.fullDayNoticeHours} hours' notice before the day starts. For ${leaveDayLabel(date)} it had to be applied for by ${dateTime(new Date(deadline))} IST.` : null;
    }
    if (!selected.length) return null;
    const first = Math.min(...selected.map((item) => new Date(item.start).getTime()));
    const deadline = first - rules.halfDayNoticeHours * 3600_000;
    return now > deadline ? `Half-day leave needs ${rules.halfDayNoticeHours} hours' notice before your first chosen class (by ${dateTime(new Date(deadline))} IST).` : null;
  })();
  const needsClasses = type === "half_day" && Boolean(classes?.length);
  const creditProblem = credits?.limited && credits.available + 1e-9 < cost ? `You have ${formatCredits(credits.available)} credit(s) available and this leave needs ${formatCredits(cost)}.` : null;
  const canSubmit = Boolean(date) && classes !== null && !notice && !creditProblem && reason.trim().length >= 5 && (!needsClasses || (selected.length >= 1 && selected.length <= rules.maxHalfDayClasses));

  function toggle(sessionId: string) {
    setChosen((current) => current.includes(sessionId) ? current.filter((id) => id !== sessionId) : current.length >= rules.maxHalfDayClasses ? current : [...current, sessionId]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await sendJson("/api/leave", "POST", { type, date, sessionIds: type === "half_day" ? chosen : [], reason });
      toast.success("Leave request sent for approval.");
      await onDone();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not send the request.";
      setError(message); toast.error(message);
    } finally { setBusy(false); }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <fieldset>
        <legend className="text-sm font-semibold">Leave type</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {([["full_day", "Full day", `1 credit · ${rules.fullDayNoticeHours}h notice`], ["half_day", "Half day", `0.5 credit · up to ${rules.maxHalfDayClasses} classes`]] as const).map(([value, label, hint]) => (
            <label key={value} className={`cursor-pointer rounded-lg border p-3 text-sm ${type === value ? "border-brand bg-purple-50" : "border-slate-200"}`}>
              <input type="radio" name="type" value={value} checked={type === value} onChange={() => { setType(value); setChosen([]); }} className="sr-only" />
              <span className="block font-bold text-brand">{label}</span>
              <span className="text-xs text-slate-500">{hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm font-semibold">Date<input type="date" className={field} required min={today} max={maxDate} value={date} onChange={(e) => setDate(e.target.value)} /></label>

      {date && (
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-sm font-semibold">{type === "half_day" && classes?.length ? `Choose the class${rules.maxHalfDayClasses > 1 ? "es" : ""} you will miss (up to ${rules.maxHalfDayClasses})` : "Your classes that day"}</p>
          {classesError ? <p className="mt-2 text-sm text-rose-700">{classesError}</p> : classes === null ? <p className="mt-2 text-sm text-slate-500">Loading your classes…</p> : !classes.length ? (
            <p className="mt-2 text-sm text-slate-500">You have no classes on {leaveDayLabel(date)}.{type === "half_day" ? " No class needs to be chosen." : ""}</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {classes.map((item) => {
                const checked = chosen.includes(item.sessionId);
                const disabled = type === "full_day" || (!checked && chosen.length >= rules.maxHalfDayClasses);
                return (
                  <li key={item.sessionId}>
                    <label className={`flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm ${type === "half_day" ? "cursor-pointer hover:bg-purple-50" : ""} ${disabled && type === "half_day" ? "opacity-50" : ""}`}>
                      {type === "half_day" ? <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(item.sessionId)} className="h-4 w-4 accent-[#5a1372]" /> : <Clock size={14} className="text-slate-400" />}
                      <span className="font-semibold">{timeOnly(item.start)}–{timeOnly(item.end)}</span>
                      <span className="min-w-0 truncate">{item.title}</span>
                      <span className="ml-auto text-xs text-slate-500">{item.studentCount} student{item.studentCount === 1 ? "" : "s"}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {type === "full_day" && Boolean(classes?.length) && <p className="mt-2 text-xs text-slate-500">All of these classes will need a substitute.</p>}
        </div>
      )}

      <label className="block text-sm font-semibold">Reason<textarea className={field} required minLength={5} maxLength={1000} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why you need the leave" /></label>

      {(notice || creditProblem) && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{notice || creditProblem}</p>}
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <p className="text-xs text-slate-500">{credits?.limited ? `Uses ${formatCredits(cost)} credit when approved.` : "No credit limit applies to you."} Your approvers are told by email and WhatsApp.</p>
      <button className={button} type="submit" disabled={busy || !canSubmit}>{busy ? "Sending…" : "Send for approval"}</button>
    </form>
  );
}
