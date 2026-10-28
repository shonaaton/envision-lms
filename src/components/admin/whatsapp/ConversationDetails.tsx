"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Conversation } from "./types";
import { replyWindow } from "./types";
import { academyDateKey, academyDateTimeLocalInput } from "@/lib/academyTime";

const inputClass = "mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 !text-base md:!text-sm";
export default function ConversationDetails({ conversation, now, canManage, onChanged }: { conversation?: Conversation; now: number; canManage: boolean; onChanged: () => void }) {
  const phone = conversation?.phoneNumber || "";
  const [context, setContext] = useState<any>(null), [staff, setStaff] = useState<any[]>([]), [notes, setNotes] = useState<any[]>([]);
  const [note, setNote] = useState(""), [noteCursor, setNoteCursor] = useState<string | null>(null), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(""), [followUpAt, setFollowUpAt] = useState(""), [followUpNote, setFollowUpNote] = useState("");
  const [search, setSearch] = useState(""), [users, setUsers] = useState<any[]>([]), [displayName, setDisplayName] = useState("");
  const noteRequest = useRef<string | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!phone) return;
    const response = await fetch(`/api/admin/whatsapp/conversation?phone=${phone}`, { signal, cache: "no-store" });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Could not load contact details.");
    setContext(payload); setDisplayName(payload.displayName || ""); setFollowUpAt(academyDateTimeLocalInput(payload.followUpAt)); setFollowUpNote(payload.followUpNote || "");
  }, [phone]);
  const loadNotes = useCallback(async (before?: string, signal?: AbortSignal) => {
    if (!phone) return;
    const response = await fetch(`/api/admin/whatsapp/conversation?phone=${phone}&notes=1${before ? `&before=${before}` : ""}`, { signal, cache: "no-store" });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Could not load private notes.");
    setNotes((current) => before ? [...current, ...(payload.notes || [])] : payload.notes || []); setNoteCursor(payload.nextCursor);
  }, [phone]);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([load(controller.signal), loadNotes(undefined, controller.signal)]).catch((err) => { if (!controller.signal.aborted) setNotice(err.message); });
    if (canManage) void fetch("/api/admin/whatsapp/conversation?staff=1", { signal: controller.signal, cache: "no-store" }).then((response) => response.json()).then((payload) => setStaff(payload.staff || [])).catch(() => {});
    return () => controller.abort();
  }, [load, loadNotes, canManage]);
  useEffect(() => {
    if (!phone || !canManage || search.trim().length < 2) { setUsers([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void fetch(`/api/admin/whatsapp/conversation?phone=${phone}&searchUsers=${encodeURIComponent(search.trim())}`, { signal: controller.signal }).then((response) => response.json()).then((payload) => setUsers(payload.users || [])).catch(() => {}); }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search, phone, canManage]);

  async function action(kind: string, payload: any) {
    if (busy || !phone) return; setBusy(kind); setNotice("");
    try {
      const response = await fetch("/api/admin/whatsapp/conversation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phoneNumber: phone, action: kind, ...payload }) });
      const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.error || "Could not update conversation.");
      if (kind === "note") { setNote((current) => current === payload.text ? "" : current); if (noteRequest.current === payload.requestId) noteRequest.current = null; await loadNotes(); } else await load();
      setNotice(kind === "note" ? "Private note added." : "Conversation updated."); onChanged();
    } catch (err) { setNotice(err instanceof Error ? err.message : "Could not save changes."); }
    finally { setBusy(""); }
  }
  if (!conversation) return <p className="text-sm text-slate-500">Select a contact to view their details.</p>;
  const profile = context?.profile;
  const due = conversation.followUpAt && new Date(conversation.followUpAt).getTime() <= now;
  return <div className="space-y-4 text-sm"><div><h3 className="text-lg font-bold">{conversation.contactName}</h3><p className="text-slate-500">+{phone}</p><p className="mt-1 text-xs text-emerald-700">{replyWindow(conversation, now).label}</p>{conversation.resolved ? <p className="mt-1 text-xs text-slate-500">Resolved</p> : conversation.needsReply ? <p className="mt-1 text-xs font-semibold text-amber-700">Needs reply</p> : null}</div>
    {notice ? <p role="status" className="rounded-lg bg-slate-100 p-2 text-xs">{notice}</p> : null}
    <section className="space-y-2 rounded-lg border border-slate-100 p-3"><h4 className="font-bold">Assigned to</h4>{canManage ? <><select aria-label="Conversation assignee" value={context?.assignedTo?.id || ""} disabled={Boolean(busy)} onChange={(event) => void action("assign", { userId: event.target.value })} className={inputClass}><option value="">Unassigned</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}</select><p className="text-xs text-slate-500">Coaches can access only the conversations assigned to them.</p></> : <p>{context?.assignedTo?.name || conversation.assignedTo?.name || "Unassigned"}</p>}</section>
    <section className={`space-y-2 rounded-lg border p-3 ${due ? "border-amber-200 bg-amber-50" : "border-slate-100"}`}><h4 className="font-bold">Follow-up reminder</h4><label className="block text-xs">Date and time (IST)<input aria-label="Follow-up time" type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} className={inputClass} /></label><input aria-label="Follow-up note" value={followUpNote} maxLength={500} onChange={(event) => setFollowUpNote(event.target.value)} placeholder="What needs following up?" className={inputClass} /><div className="flex flex-wrap gap-3 text-xs"><button type="button" disabled={Boolean(busy) || !followUpAt} onClick={() => void action("followUp", { followUpAt, note: followUpNote })} className="font-bold text-teal-800 disabled:opacity-40">Save reminder</button><button type="button" disabled={Boolean(busy)} onClick={() => { const tomorrow = `${academyDateKey(new Date(Date.now() + 86400_000))}T10:00`; setFollowUpAt(tomorrow); void action("followUp", { followUpAt: tomorrow, note: followUpNote }); }} className="text-teal-800">Tomorrow, 10 AM</button>{context?.followUpAt ? <button type="button" disabled={Boolean(busy)} onClick={() => void action("followUp", { followUpAt: null })} className="text-slate-500">Clear</button> : null}</div><p className="text-xs text-slate-500">You’ll receive an LMS notification when this reminder is due.</p></section>
    <section className="space-y-2 rounded-lg border border-slate-100 p-3"><h4 className="font-bold">LMS context</h4>{profile ? <><p className="font-semibold">{profile.name}</p><p className="break-words text-xs text-slate-500">{profile.role} · {profile.username || profile.email}</p>{profile.parentName ? <p className="text-xs">Parent: {profile.parentName}</p> : null}{profile.parentEmail ? <p className="break-all text-xs text-slate-500">{profile.parentEmail}</p> : null}{context.batches?.map((batch: any) => <div key={batch.id} className="rounded bg-slate-50 p-2 text-xs"><p className="font-semibold">{batch.name}</p><p className="text-slate-500">Coach: {batch.coachName || "Unassigned"}</p></div>)}{context.fees ? <div className="rounded-lg bg-emerald-50 p-2 text-xs"><p>{context.fees.planName || "Fee plan"}</p>{context.fees.creditBalance !== null ? <p>Credits: <strong>{context.fees.creditBalance}</strong></p> : null}<p>Outstanding: <strong>₹{Number(context.fees.outstanding).toLocaleString("en-IN")}</strong></p>{context.fees.invoices?.map((invoice: any, i: number) => <p key={i} className="mt-1">{invoice.number || "Invoice"} · ₹{invoice.totalAmount} · {invoice.status}</p>)}</div> : null}</> : <p className="text-xs text-slate-500">No LMS user linked.</p>}
      {canManage ? <details className="pt-2"><summary className="cursor-pointer text-xs font-semibold text-teal-800">Correct contact link</summary><label className="mt-2 block text-xs">Display name<input aria-label="Contact display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={inputClass} /></label><input aria-label="Find LMS contact" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, username or phone" className={inputClass} /><div className="max-h-48 overflow-y-auto">{users.map((person) => <button key={person.id} type="button" disabled={Boolean(busy)} onClick={() => void action("link", { userId: person.id, displayName })} className="mt-1 block w-full rounded border p-2 text-left text-xs"><strong>{person.name}</strong><span className="block text-slate-500">{person.role} · {person.username || person.phone}</span></button>)}</div><div className="mt-2 flex flex-wrap gap-3 text-xs"><button type="button" disabled={Boolean(busy)} onClick={() => void action("link", { userId: profile?.id || null, displayName })} className="font-semibold text-teal-800">Save display name</button><button type="button" disabled={Boolean(busy)} onClick={() => void action("link", { userId: null, displayName })} className="text-slate-500">Unlink</button><button type="button" disabled={Boolean(busy)} onClick={() => void action("link", { automatic: true, displayName })} className="text-slate-500">Use automatic matching</button></div></details> : null}
    </section>
    <section className="space-y-2 rounded-lg border border-slate-100 p-3"><h4 className="font-bold">Private staff notes</h4><p className="text-xs text-slate-500">Visible to authorised staff; never sent to WhatsApp.</p><textarea aria-label="Private conversation note" value={note} onChange={(event) => { setNote(event.target.value); noteRequest.current = null; }} rows={3} maxLength={4000} className={inputClass} placeholder="Add context for the next person…" /><button type="button" disabled={Boolean(busy) || !note.trim()} onClick={() => { const requestId = noteRequest.current || crypto.randomUUID(); noteRequest.current = requestId; void action("note", { text: note, requestId }); }} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{busy === "note" ? "Adding…" : "Add private note"}</button><div className="space-y-2">{notes.map((item) => <div key={item.id} className="rounded-lg bg-slate-50 p-2"><p className="whitespace-pre-wrap break-words text-xs">{item.body}</p><p className="mt-1 text-[10px] text-slate-500">{item.author} · {new Date(item.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p></div>)}</div>{noteCursor ? <button type="button" onClick={() => void loadNotes(noteCursor).catch((err) => setNotice(err.message))} className="text-xs font-bold text-teal-800">Older notes</button> : null}</section>
  </div>;
}
