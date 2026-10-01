"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Calendar, MessageSquareHeart, X } from "lucide-react";
import { toast } from "sonner";
import { LocalTime } from "@/components/common/LocalTime";
import { LeadMeetJoinButton } from "@/components/sales/LeadMeetJoinButton";
import { academyDateTimeLocalInput, parseAcademyDateTimeLocal } from "@/lib/academyTime";
import { canGiveFeedback, ptmYearOf, type PtmViewer } from "@/lib/ptm/ptmRules";

type Item = Record<string, any>;
type List = { ptms: Item[]; credits?: { total: number; used: number; held: number; remaining: number; nextEligibleAt: string | null; openRequest: string | boolean | null }; coaches?: { id: string; name: string }[] };
const field = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100";
const button = "inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "rounded-lg border border-brand/20 bg-white px-3 py-2 text-sm font-semibold text-brand hover:bg-purple-50 disabled:opacity-50";
const titles: Record<string, string> = { requested: "Requested", approved: "To schedule", scheduled: "Scheduled", completed: "Completed", rejected: "Rejected", cancelled: "Cancelled" };
const colors: Record<string, string> = { requested: "bg-amber-50 text-amber-800", approved: "bg-blue-50 text-blue-800", scheduled: "bg-purple-50 text-purple-800", completed: "bg-emerald-50 text-emerald-800", rejected: "bg-rose-50 text-rose-800", cancelled: "bg-slate-100 text-slate-600" };

export function PtmJoin({ item }: { item: Item }) {
  if (!item.scheduledAt || !["scheduled", "completed"].includes(item.status)) return null;
  return <LeadMeetJoinButton noun="PTM" href={item.hasMeeting ? `/api/ptm/${item._id}/join` : undefined} startAt={item.scheduledAt} endAt={new Date(new Date(item.scheduledAt).getTime() + (item.durationMinutes || 30) * 60_000).toISOString()} />;
}
export function UpcomingPtm({ item, role }: { item: Item; role: PtmViewer["role"] }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand/15 bg-white p-4"><div><h2 className="font-bold text-brand">Upcoming PTM</h2><p className="text-sm text-slate-600">{role === "student" ? item.coachName : item.studentName} · <LocalTime value={item.scheduledAt} role={role} /></p></div><PtmJoin item={item} /></div>;
}

export default function PtmClient({ viewer, initialTab = "", initialId = "", join = "" }: { viewer: PtmViewer; initialTab?: string; initialId?: string; join?: string }) {
  const staff = ["admin", "sub-admin"].includes(viewer.role);
  const student = viewer.role === "student";
  const [data, setData] = useState<List>({ ptms: [] });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [coachFilter, setCoachFilter] = useState("");
  const [tab, setTab] = useState(initialTab || (staff ? "requested" : "all"));
  const [drawer, setDrawer] = useState<{ mode: string; item?: Item } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [now, setNow] = useState(new Date());
  const openedInitial = useRef(false);
  const loadGeneration = useRef(0);
  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    try {
      const params = new URLSearchParams(); if (staff && q) params.set("q", q); if (staff && coachFilter) params.set("coach", coachFilter);
      const response = await fetch(`/api/ptm?${params}`, { cache: "no-store" });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      if (generation === loadGeneration.current) { setData(result); setError(""); setLoaded(true); }
    } catch (e) { if (generation === loadGeneration.current) { setError(e instanceof Error ? e.message : "Could not load PTMs."); setLoaded(true); } }
  }, [staff, q, coachFilter]);
  useEffect(() => { void load(); const timer = window.setInterval(() => { setNow(new Date()); if (document.visibilityState === "visible") void load(); }, 30_000); return () => window.clearInterval(timer); }, [load]);
  useEffect(() => { if (!initialId || !loaded || openedInitial.current) return; openedInitial.current = true; const item = data.ptms.find(p => p._id === initialId); if (item && staff && viewer.canEdit && ["requested", "approved"].includes(item.status)) setDrawer({ mode: "schedule", item }); }, [initialId, loaded, staff, viewer.canEdit, data.ptms]);
  const open = (mode: string, item?: Item) => { setFormError(""); setDrawer({ mode, item }); };
  const run = async (item: Item | undefined, body: Item) => {
    setBusy(true); setFormError("");
    try {
      const response = await fetch(item ? `/api/ptm/${item._id}` : "/api/ptm", { method: item ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      toast.success(body.action === "feedback" ? "Thank you. Your feedback is private to academy admins." : "PTM updated.");
      setDrawer(null); await load(); window.dispatchEvent(new Event("ptm-updated"));
    } catch (e) { const message = e instanceof Error ? e.message : "Could not save PTM."; setFormError(message); toast.error(message); }
    finally { setBusy(false); }
  };
  const tabs = staff ? [["requested", "Requested"], ["to_schedule", "To schedule"], ["scheduled", "Scheduled"], ["completed", "Completed"], ["closed", "Closed"]] : [["all", "All PTMs"], ["requested", "Requests"], ["scheduled", "Upcoming"], ["history", "History"]];
  const matches = (p: Item, t: string) => {
    const ended = p.scheduledAt && new Date(p.scheduledAt).getTime() + p.durationMinutes * 60_000 <= now.getTime();
    if (t === "all") return true;
    if (t === "to_schedule") return p.status === "approved" || (p.status === "requested" && now.getTime() - new Date(p.createdAt).getTime() >= 48 * 3600_000);
    if (t === "closed") return ["rejected", "cancelled"].includes(p.status);
    if (t === "history") return ["completed", "rejected", "cancelled"].includes(p.status) || (p.status === "scheduled" && ended);
    if (t === "requested" && !staff) return ["requested", "approved"].includes(p.status);
    if (t === "scheduled" && !staff) return p.status === "scheduled" && !ended;
    return p.status === t;
  };
  const rows = data.ptms.filter(p => matches(p, tab));
  const credits = data.credits;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!drawer) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const mode = drawer.mode;
    if (mode === "request") return run(undefined, { ...values, preferredAt: parseAcademyDateTimeLocal(String(values.preferredAt)).toISOString() });
    if (["schedule", "reschedule"].includes(mode)) return run(drawer.item, { ...values, action: mode, scheduledAt: parseAcademyDateTimeLocal(String(values.scheduledAt)).toISOString(), durationMinutes: Number(values.durationMinutes) });
    if (mode === "feedback") return run(drawer.item, { ...values, action: mode, rating: Number(values.rating), preparedness: Number(values.preparedness), clarity: Number(values.clarity) });
    return run(drawer.item, { ...values, action: mode });
  }
  return <div className="space-y-5 text-slate-950">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-brand"><MessageSquareHeart size={22} /><h1 className="text-2xl font-black">Parent–teacher meetings</h1></div><p className="mt-1 text-sm text-slate-500">{student ? "A focused conversation between your family and your coach." : staff ? "Review requests, confirm timing, and follow up on private feedback." : "Review family requests and join your scheduled PTMs."}</p></div>{student && viewer.canCreate && <button className={button} disabled={!loaded || !credits || credits.remaining === 0 || Boolean(credits.openRequest) || !data.coaches?.length} onClick={() => open("request")}><Calendar size={16} />Request a PTM</button>}</div>
    {join && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{join === "early" ? "Your PTM opens 10 minutes before its confirmed time." : "The join window for this PTM has ended."}</p>}
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-700">{error} <button onClick={() => void load()} className="underline">Retry</button></p>}
    {credits && <section className="rounded-xl border border-brand/10 bg-gradient-to-br from-purple-50 to-white p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-brand">PTM credits · {ptmYearOf(now)}</p><p className="mt-2 text-3xl font-black text-brand">{credits.remaining} <span className="text-base font-semibold text-slate-500">remaining</span></p></div><div className="flex gap-6 text-center">{[["Yearly", credits.total], ["Used", credits.used], ["Held", credits.held]].map(([label, value]) => <div key={label}><p className="text-xl font-bold">{value}</p><p className="text-xs text-slate-500">{label}</p></div>)}</div></div><p className="mt-3 text-xs text-slate-600">12 each year, 1 Oct–30 Sep (IST). Requests hold a credit; scheduling spends it, including no-shows. Rejection or cancellation returns it.</p>{credits.nextEligibleAt && <p className="mt-2 text-sm font-semibold text-brand">Next PTM can be from <LocalTime value={credits.nextEligibleAt} role={viewer.role} options={{ hour: undefined, minute: undefined }} /></p>}{credits.openRequest && <p className="mt-2 text-sm text-amber-800">Your current request is being reviewed. Only one pending request is allowed.</p>}{!data.coaches?.length && <p className="mt-2 text-sm text-slate-500">A coach in a running classroom is needed to request a PTM.</p>}</section>}
    {staff && <div className="flex flex-wrap gap-3"><label className="flex-1 text-xs font-semibold text-slate-500">Search student or coach<input className={field} value={q} onChange={e => setQ(e.target.value)} placeholder="Search PTMs" /></label><label className="text-xs font-semibold text-slate-500">Coach<select className={field} value={coachFilter} onChange={e => setCoachFilter(e.target.value)}><option value="">All coaches</option>{[...new Map(data.ptms.map(p => [p.coach, p.coachName])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label></div>}
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="PTM status">{tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={id === tab} className={id === tab ? button : secondary} onClick={() => setTab(id)}>{label} <span className="text-xs opacity-70">{data.ptms.filter(p => matches(p, id)).length}</span></button>)}</div>
    {!loaded ? <p className="p-8 text-center text-sm text-slate-500">Loading PTMs…</p> : !rows.length ? <div className="rounded-xl border border-dashed border-brand/20 bg-white p-10 text-center"><MessageSquareHeart className="mx-auto text-purple-300" size={30} /><p className="mt-3 font-bold">No PTMs here yet</p><p className="mt-1 text-sm text-slate-500">{student ? "Request a meeting when you want to discuss your progress with your coach." : "Requests and scheduled meetings will appear here."}</p></div> : <div className="space-y-3">{rows.map(p => <article key={p._id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold">{student ? `Coach ${p.coachName}` : staff ? `${p.studentName} · ${p.coachName}` : p.studentName}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${colors[p.status]}`}>{titles[p.status]}</span></div><p className="mt-2 text-sm text-slate-600">{p.scheduledAt ? "Confirmed" : "Preferred"}: <LocalTime value={p.scheduledAt || p.preferredAt} role={viewer.role} />{p.scheduledAt && ` · ${p.durationMinutes} min`}</p><p className="mt-2 whitespace-pre-wrap text-sm">{p.reason}</p>{p.preferredNote && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">Alternative slots: {p.preferredNote}</p>}{p.rejectionReason && <p className="mt-2 text-sm text-rose-700">Reason: {p.rejectionReason}</p>}{p.cancelReason && <p className="mt-2 text-sm text-slate-500">Cancelled: {p.cancelReason}</p>}</div><div className="flex flex-wrap items-center gap-2"><PtmJoin item={p} />{viewer.canApprove && p.status === "requested" && <><button className={button} disabled={busy} onClick={() => void run(p, { action: "approve" })}>Approve</button><button className={secondary} onClick={() => open("reject", p)}>Reject</button></>}{staff && viewer.canEdit && ["requested", "approved"].includes(p.status) && <button className={button} onClick={() => open("schedule", p)}>Confirm timing & link</button>}{staff && viewer.canEdit && p.status === "scheduled" && new Date(p.scheduledAt) > now && <button className={secondary} onClick={() => open("reschedule", p)}>Reschedule</button>}{((student && viewer.canCreate && ["requested", "approved"].includes(p.status)) || (staff && viewer.canEdit && ["requested", "approved", "scheduled"].includes(p.status) && (!p.scheduledAt || new Date(p.scheduledAt) > now))) && <button className={secondary} onClick={() => open("cancel", p)}>Cancel</button>}{student && viewer.canCreate && canGiveFeedback({ ...p, status: p.status, feedback: p.feedbackSubmitted ? { submittedAt: true } : undefined }, now) && <button className={button} onClick={() => open("feedback", p)}>Rate this PTM</button>}{student && p.feedbackSubmitted && <span className="text-xs text-emerald-700">Feedback submitted privately</span>}</div></div>{staff && p.feedback && <div className="mt-4 rounded-lg bg-purple-50 p-3 text-sm"><p className="font-semibold text-brand">Private feedback · {p.feedback.rating}/5 overall · Preparedness {p.feedback.preparedness}/5 · Clarity {p.feedback.clarity}/5</p><p className="mt-1 whitespace-pre-wrap text-slate-600">{p.feedback.comments || "No comments added."}</p></div>}</article>)}</div>}
    <Dialog.Root open={Boolean(drawer)} onOpenChange={value => { if (!value && !busy) { setDrawer(null); setFormError(""); } }}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm" /><Dialog.Content className="fixed bottom-0 right-0 top-0 z-50 w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><Dialog.Title className="text-xl font-black text-brand">{drawer?.mode === "request" ? "Request a PTM" : drawer?.mode === "feedback" ? "Rate this PTM" : ["schedule", "reschedule"].includes(drawer?.mode || "") ? "Confirm PTM timing & Meet link" : drawer?.mode === "reject" ? "Reject PTM request" : "Cancel PTM"}</Dialog.Title><Dialog.Close disabled={busy} aria-label="Close" className="rounded-lg p-1 hover:bg-slate-100"><X size={20} /></Dialog.Close></div><Dialog.Description className="mt-2 text-sm text-slate-500">{drawer?.mode === "feedback" ? "Only admins and sub-admins can see your ratings and comments." : drawer?.item ? `${drawer.item.studentName} with ${drawer.item.coachName}. All entered times are IST.` : "Choose a preferred time in IST. The academy will confirm the final slot."}</Dialog.Description>
    <form key={`${drawer?.mode}-${drawer?.item?._id || "new"}`} onSubmit={submit} className="mt-6 space-y-4">
      {drawer?.mode === "request" && <><label className="block text-sm font-semibold">Coach<select name="coach" className={field} required defaultValue={data.coaches?.length === 1 ? data.coaches[0].id : ""}><option value="" disabled>Choose coach</option>{data.coaches?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="block text-sm font-semibold">Preferred date & time (IST)<input name="preferredAt" type="datetime-local" className={field} required min={academyDateTimeLocalInput(new Date(Math.max(now.getTime() + 60_000, credits?.nextEligibleAt ? new Date(credits.nextEligibleAt).getTime() : 0)))} /></label><label className="block text-sm font-semibold">Alternative slots (optional)<textarea name="preferredNote" className={field} maxLength={2000} placeholder="Other times that work for your family" /></label><label className="block text-sm font-semibold">What would you like to discuss?<textarea name="reason" className={field} required minLength={10} maxLength={2000} placeholder="Progress, practice routine, or any questions for your coach" /></label></>}
      {["schedule", "reschedule"].includes(drawer?.mode || "") && <><div className="rounded-lg bg-purple-50 p-3 text-sm">Preferred: <LocalTime value={drawer?.item?.preferredAt} role={viewer.role} /><p className="mt-1">{drawer?.item?.preferredNote}</p></div><label className="block text-sm font-semibold">Final date & time (IST)<input name="scheduledAt" type="datetime-local" className={field} required min={academyDateTimeLocalInput(now)} defaultValue={academyDateTimeLocalInput(drawer?.item?.scheduledAt || drawer?.item?.preferredAt)} /></label><label className="block text-sm font-semibold">Duration (minutes)<input name="durationMinutes" type="number" className={field} min={5} max={120} required defaultValue={drawer?.item?.durationMinutes || 30} /></label><label className="block text-sm font-semibold">Google Meet room link<input name="meetingUrl" className={field} required defaultValue={drawer?.item?.meetingUrl || ""} placeholder="https://meet.google.com/abc-defg-hij" /></label><p className="text-xs text-slate-500">The family and coach will receive a confirmation. Their Join button opens 10 minutes before the PTM.</p></>}
      {drawer?.mode === "feedback" && <>{[["rating", "Overall experience"], ["preparedness", "Coach preparedness"], ["clarity", "Clarity of guidance"]].map(([name, label]) => <label key={name} className="block text-sm font-semibold">{label}<select name={name} className={field} required defaultValue=""><option value="" disabled>Choose a rating</option>{[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} / 5{n === 5 ? " — Excellent" : n === 1 ? " — Needs improvement" : ""}</option>)}</select></label>)}<label className="block text-sm font-semibold">Comments (optional)<textarea name="comments" className={field} maxLength={2000} /></label></>}
      {["cancel", "reject"].includes(drawer?.mode || "") && <label className="block text-sm font-semibold">Reason<textarea className={field} name={drawer?.mode === "reject" ? "rejectionReason" : "cancelReason"} required maxLength={2000} /></label>}
      {formError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{formError}</p>}
      <div className="flex gap-2 pt-2"><button disabled={busy} className={button} type="submit">{busy ? "Saving…" : drawer?.mode === "request" ? "Send request" : drawer?.mode === "feedback" ? "Submit private feedback" : ["schedule", "reschedule"].includes(drawer?.mode || "") ? "Confirm & notify" : "Confirm"}</button><Dialog.Close disabled={busy} className={secondary} type="button">Back</Dialog.Close></div>
    </form></Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
