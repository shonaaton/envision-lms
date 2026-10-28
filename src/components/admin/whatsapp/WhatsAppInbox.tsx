"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, Bot, CheckCircle2, FileText, Info, Paperclip, Search, Send, X } from "lucide-react";
import { MessageMedia, MessageStatus, MessageText } from "./MessageContent";
import { replyWindow, type Conversation, type WaMessage } from "./types";
import { threadKey, useWhatsAppInbox } from "./useWhatsAppInbox";
import SavedRepliesDialog from "./SavedRepliesDialog";
import TemplateSendDialog from "./TemplateSendDialog";
import AttachmentDialog from "./AttachmentDialog";
import ConversationDetails from "./ConversationDetails";

type Filter = "all" | "unread" | "needsReply" | "open" | "expired" | "resolved" | "templates" | "followUps" | "expiring" | "mine";
type Pending = { requestId: string; phone: string; text: string; createdAt: string; status: "sending" | "failed" | "unconfirmed"; error?: string; messageId?: string };
const filters: [Filter, string][] = [["all", "All chats"], ["unread", "Unread"], ["needsReply", "Needs reply"], ["mine", "Assigned to me"], ["followUps", "Follow-ups"], ["expiring", "Expiring soon"], ["open", "Window open"], ["expired", "Window expired"], ["resolved", "Resolved"], ["templates", "Template sends"]];

export default function WhatsAppInbox({ initialPhoneNumber, actorId, refreshKey, active, canManage }: {
  initialPhoneNumber: string; actorId: string; refreshKey: number; active: boolean; canManage: boolean;
}) {
  const inbox = useWhatsAppInbox(initialPhoneNumber, refreshKey);
  const { conversations, setConversations, selectedPhone, setSelectedPhone, query, setQuery, thread, loadList, loadThread } = inbox;
  const [filter, setFilter] = useState<Filter>("all");
  const [contactSearch, setContactSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [mobilePane, setMobilePane] = useState<"list" | "chat">(initialPhoneNumber ? "chat" : "list");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending[]>([]);
  const [atBottom, setAtBottom] = useState(true);
  const [newMessages, setNewMessages] = useState(0);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [triageBusy, setTriageBusy] = useState(false);
  const [viewport, setViewport] = useState<{ top: number; height: number } | null>(null);
  const [tool, setTool] = useState<"saved" | "template" | "attachment" | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const messageArea = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const details = useRef<HTMLDialogElement>(null);
  const hydrated = useRef(false);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const pendingHydrated = useRef(false);
  const mounted = useRef(true);
  const activePhone = useRef(selectedPhone);
  activePhone.current = selectedPhone;
  const sendLocks = useRef(new Set<string>());
  const readWatermarks = useRef(new Map<string, string>());
  const scrollPositions = useRef(new Map<string, number>());
  const nearBottom = useRef(true);
  const view = useRef({ key: "", lastId: "", firstId: "" });
  const prepend = useRef<{ key: string; height: number; top: number } | null>(null);
  const forceBottom = useRef("");
  const storageKey = `whatsapp-drafts-v1:${actorId}`;
  const pendingStorageKey = `whatsapp-pending-v1:${actorId}`;
  const selected = conversations.find((conversation) => conversation.phoneNumber === selectedPhone);
  const selectedWindow = selected ? replyWindow(selected, now) : { open: false, label: "" };
  const draft = drafts[selectedPhone] || "";
  const sending = pending.some((item) => item.phone === selectedPhone && item.status === "sending");
  const unconfirmed = pending.find((item) => item.phone === selectedPhone && item.status === "unconfirmed");
  const localMessages = pending.filter((item) => item.phone === selectedPhone && !thread.messages.some((message) => message.id === item.messageId));
  const key = threadKey(selectedPhone, query);
  const lastId = `${thread.messages.at(-1)?.id || ""}:${localMessages.at(-1)?.requestId || ""}`;
  const firstId = thread.messages[0]?.id || "";

  useEffect(() => {
    mounted.current = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "{}");
      if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        draftsRef.current = Object.fromEntries(Object.entries(saved).filter((entry) => typeof entry[1] === "string")) as Record<string, string>;
        setDrafts(draftsRef.current);
      }
    } catch { /* Storage may be unavailable; in-memory drafts still work. */ }
    try {
      const saved: Pending[] = JSON.parse(sessionStorage.getItem(pendingStorageKey) || "[]");
      if (Array.isArray(saved)) {
        pendingRef.current = saved.filter((item) => item && typeof item.requestId === "string" && typeof item.text === "string" && /^\d{7,15}$/.test(item.phone)).map((item) => item.status === "sending" ? { ...item, status: "unconfirmed", error: "The page closed before the send was confirmed. Check the same request below." } : item);
        setPending(pendingRef.current);
      }
    } catch { /* Request checks remain available until the page closes. */ }
    const flush = () => { try { sessionStorage.setItem(storageKey, JSON.stringify(draftsRef.current)); sessionStorage.setItem(pendingStorageKey, JSON.stringify(pendingRef.current)); } catch { /* Storage may be unavailable. */ } };
    window.addEventListener("pagehide", flush);
    return () => { flush(); window.removeEventListener("pagehide", flush); mounted.current = false; };
  }, [storageKey, pendingStorageKey]);
  useEffect(() => {
    if (!hydrated.current) { hydrated.current = true; return; }
    try { sessionStorage.setItem(storageKey, JSON.stringify(drafts)); } catch { /* Preserve the in-memory draft. */ }
  }, [drafts, storageKey]);
  useEffect(() => {
    if (!pendingHydrated.current) { pendingHydrated.current = true; return; }
    try { sessionStorage.setItem(pendingStorageKey, JSON.stringify(pending)); } catch { /* Keep the in-memory request reservation. */ }
  }, [pending, pendingStorageKey]);
  useEffect(() => { const timer = window.setTimeout(() => setQuery(messageSearch.trim()), 300); return () => window.clearTimeout(timer); }, [messageSearch, setQuery]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow((current) => {
      const next = Date.now();
      const expires = new Date(selected?.activeUntil || 0).getTime();
      return expires > next && expires - next < 120_000 || next - current >= 15_000 ? next : current;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [selected?.activeUntil]);
  useEffect(() => {
    const update = () => {
      if (window.innerWidth >= 768 || !window.visualViewport) { setViewport(null); return; }
      setViewport({ top: window.visualViewport.offsetTop + 56, height: Math.max(0, window.visualViewport.height - 56) });
    };
    update();
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => { window.visualViewport?.removeEventListener("resize", update); window.visualViewport?.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const scrollToLatest = useCallback(() => {
    const area = messageArea.current;
    if (area) area.scrollTop = area.scrollHeight;
    nearBottom.current = true;
    setAtBottom(true);
    setNewMessages(0);
  }, []);

  // Only message identity changes can advance the viewport. Delivery receipts,
  // polling and countdowns never scroll the page or the surrounding dashboard.
  useLayoutEffect(() => {
    const area = messageArea.current;
    if (!active || !area || !thread.loaded || mobilePane !== "chat" && window.innerWidth < 768) return;
    if (view.current.key !== key) {
      area.scrollTop = scrollPositions.current.get(key) ?? area.scrollHeight;
      nearBottom.current = area.scrollHeight - area.scrollTop - area.clientHeight < 80;
      setAtBottom(nearBottom.current);
      setNewMessages(0);
    } else if (prepend.current?.key === key && view.current.firstId !== firstId) {
      area.scrollTop = prepend.current.top + area.scrollHeight - prepend.current.height;
      prepend.current = null;
    } else if (view.current.lastId !== lastId) {
      if (nearBottom.current || forceBottom.current === selectedPhone) scrollToLatest();
      else setNewMessages((count) => count + 1);
    }
    forceBottom.current = "";
    view.current = { key, lastId, firstId };
  }, [key, lastId, firstId, thread.loaded, selectedPhone, mobilePane, scrollToLatest, active]);

  useEffect(() => {
    const area = messageArea.current;
    if (!area) return;
    const observer = new ResizeObserver(() => { if (nearBottom.current) area.scrollTop = area.scrollHeight; });
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const watermark = selected?.lastInboundId;
    if (!active || !watermark || !selected.unreadCount || !thread.loaded || query || !atBottom || document.visibilityState !== "visible" || mobilePane !== "chat" && window.innerWidth < 768 || !thread.messages.some((message) => message.id === watermark) || readWatermarks.current.get(selectedPhone) === watermark) return;
    readWatermarks.current.set(selectedPhone, watermark);
    void fetch("/api/admin/whatsapp", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phoneNumber: selectedPhone, action: "read", lastInboundId: watermark }) }).then(async (response) => {
      if (!response.ok) throw new Error("Could not mark the conversation read.");
      setConversations((current) => current.map((conversation) => conversation.phoneNumber === selectedPhone && conversation.lastInboundId === watermark ? { ...conversation, unreadCount: 0 } : conversation));
    }).catch(() => { readWatermarks.current.delete(selectedPhone); });
  }, [selected?.lastInboundId, selected?.unreadCount, selectedPhone, thread.loaded, thread.messages, query, atBottom, mobilePane, setConversations, active]);

  function chooseConversation(conversation: Conversation) {
    if (messageArea.current) scrollPositions.current.set(key, messageArea.current.scrollTop);
    setSelectedPhone(conversation.phoneNumber);
    setMobilePane("chat");
    setMessageSearch("");
    setQuery("");
    setNotice("");
    window.history.replaceState(null, "", conversation.chatPath || `/admin/whatsapp/${encodeURIComponent(conversation.phoneNumber)}`);
  }

  async function sendReply(retry?: Pending, existingMessage?: WaMessage) {
    const phone = retry?.phone || selectedPhone;
    const text = retry?.text || existingMessage?.text || (drafts[phone] || "").trim();
    if (!phone || !text || sendLocks.current.has(phone)) return;
    // Pressing Send again after a lost response checks the original request;
    // it must not silently create a second send for the same draft.
    if (!retry && !existingMessage) {
      const unconfirmed = pending.find((entry) => entry.phone === phone && entry.text === text && entry.status === "unconfirmed");
      if (unconfirmed) { await sendReply(unconfirmed); return; }
    }
    const uncertainReplay = retry?.status === "unconfirmed";
    const requestId = uncertainReplay ? retry.requestId : crypto.randomUUID();
    const item: Pending = { phone, text, requestId, createdAt: retry?.createdAt || new Date().toISOString(), status: "sending" };
    sendLocks.current.add(phone);
    setPending((current) => [...current.filter((entry) => entry.requestId !== retry?.requestId), item]);
    forceBottom.current = phone;
    if (activePhone.current === phone) { setMessageSearch(""); setQuery(""); }
    try {
      const response = await fetch("/api/admin/whatsapp/reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phoneNumber: phone, text, requestId }), signal: AbortSignal.timeout(40_000) });
      const payload = await response.json();
      if (!response.ok || payload.ok !== true || payload.error) {
        const error = payload.message || payload.error || payload.result?.errorMessage || "Reply could not be sent.";
        setPending((current) => current.map((entry) => entry.requestId === requestId ? { ...entry, status: payload.uncertain || payload.retryable === false ? "unconfirmed" : "failed", messageId: payload.messageId, error: String(error) } : entry));
        return;
      }
      setDrafts((current) => (current[phone] || "").trim() === text ? { ...current, [phone]: "" } : current);
      await loadThread(phone);
      setPending((current) => current.filter((entry) => entry.requestId !== requestId));
      if (activePhone.current === phone) { setNotice("Reply accepted for sending."); composer.current?.focus({ preventScroll: true }); }
    } catch {
      setPending((current) => current.map((entry) => entry.requestId === requestId ? { ...entry, status: "unconfirmed", error: "Connection interrupted. Check the send result before sending again." } : entry));
    } finally {
      sendLocks.current.delete(phone);
      if (mounted.current) { void loadList(); void loadThread(phone); }
    }
  }

  async function loadOlder() {
    if (!thread.nextCursor || loadingOlder) return;
    const area = messageArea.current;
    if (area) prepend.current = { key, height: area.scrollHeight, top: area.scrollTop };
    setLoadingOlder(true);
    try { await loadThread(selectedPhone, query, thread.nextCursor); }
    finally { setLoadingOlder(false); window.requestAnimationFrame(() => { prepend.current = null; }); }
  }

  async function toggleResolved() {
    if (!selected || triageBusy) return;
    setTriageBusy(true);
    try {
      const response = await fetch("/api/admin/whatsapp", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phoneNumber: selectedPhone, action: selected.resolved ? "reopen" : "resolve", lastInboundId: selected.lastInboundId }) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error("Could not update the conversation.");
      await loadList();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not update the conversation."); }
    finally { setTriageBusy(false); }
  }

  function toolSent(phone: string) {
    forceBottom.current = phone;
    void loadThread(phone); void loadList();
    if (activePhone.current === phone) { setMessageSearch(""); setQuery(""); setNotice("Message accepted for sending."); }
  }

  function matchesFilter(conversation: Conversation, item: Filter) {
    if (item === "mine") return conversation.assignedTo?.id === actorId;
    if (item === "followUps") return Boolean(conversation.followUpAt);
    if (item === "expiring") { const expiry = new Date(conversation.activeUntil || 0).getTime(); return expiry > now && expiry - now <= 2 * 3600_000; }
    if (item === "unread") return conversation.unreadCount > 0;
    if (item === "needsReply") return conversation.needsReply;
    if (item === "resolved") return conversation.resolved;
    if (item === "templates") return conversation.sentTemplateCount > 0;
    if (item === "open") return replyWindow(conversation, now).open;
    if (item === "expired") return !replyWindow(conversation, now).open;
    return true;
  }
  const search = contactSearch.trim().toLowerCase();
  const visible = conversations.filter((conversation) => matchesFilter(conversation, filter) && (!search || `${conversation.contactName} ${conversation.phoneNumber} ${conversation.profileName || ""} ${conversation.matchedUser?.email || ""} ${conversation.matchedUser?.username || ""}`.toLowerCase().includes(search) || conversation.phoneNumber.includes(search.replace(/\D/g, "")) && /\d/.test(search)));

  return <>
    <div className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Conversation filters">{filters.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold ${filter === value ? "bg-teal-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>{label} ({conversations.filter((conversation) => matchesFilter(conversation, value)).length})</button>)}</div>
    {inbox.connectionError ? <div role="alert" className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{inbox.connectionError} <button type="button" className="font-bold underline" onClick={() => { void loadList(); void loadThread(selectedPhone, query); }}>Reconnect</button></div> : null}
    <section data-testid="whatsapp-inbox" style={viewport && mobilePane === "chat" ? { top: viewport.top, height: viewport.height } : undefined} className={`grid h-[calc(100dvh-225px)] min-h-0 grid-rows-[minmax(0,1fr)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg md:h-[calc(100dvh-190px)] md:min-h-[360px] md:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_270px] ${mobilePane === "chat" ? "fixed inset-x-0 z-20 rounded-none md:static md:z-auto md:rounded-xl" : ""}`}>
      <aside className={`min-h-0 flex-col border-r border-slate-200 md:flex ${mobilePane === "list" ? "flex" : "hidden"}`}>
        <label className="flex shrink-0 items-center gap-2 border-b p-3 text-slate-400"><Search size={17} /><input aria-label="Search contacts" placeholder="Search name or number" value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent !text-base text-slate-900 outline-none md:!text-sm" /></label>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {inbox.loading ? <p className="p-4 text-sm text-slate-500">Loading inbox…</p> : !visible.length ? <p className="p-4 text-sm text-slate-500">No conversations match this view.</p> : null}
          {visible.map((conversation) => <button key={conversation.phoneNumber} type="button" onClick={() => chooseConversation(conversation)} aria-label={`Open chat with ${conversation.contactName}`} className={`w-full border-b border-slate-100 px-4 py-3 text-left ${selectedPhone === conversation.phoneNumber ? "bg-emerald-50" : "hover:bg-slate-50"}`}>
            <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold">{conversation.contactName}</span>{conversation.unreadCount > 0 ? <span aria-label={`${conversation.unreadCount} unread`} className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">{conversation.unreadCount}</span> : null}</span>
            <span className="mt-1 block text-xs text-slate-500">+{conversation.phoneNumber}</span>
            <span className="mt-1 block truncate text-xs text-slate-600">{conversation.lastMessageText || "Attachment"}</span>
            {conversation.assignedTo ? <span className="mt-1 block truncate text-[11px] text-slate-500">Assigned: {conversation.assignedTo.name}</span> : null}
            {matchesFilter(conversation, "expiring") ? <span className="mt-1 block text-[11px] font-bold text-amber-700">Reply window expiring soon</span> : null}
            {conversation.followUpAt ? <span className={`mt-1 block text-[11px] ${new Date(conversation.followUpAt).getTime() <= now ? "font-bold text-rose-700" : "text-amber-800"}`}>{new Date(conversation.followUpAt).getTime() <= now ? "Follow-up overdue" : `Follow-up: ${new Date(conversation.followUpAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}</span> : null}
            <span className="mt-2 flex flex-wrap gap-2 text-[11px]"><span className={replyWindow(conversation, now).open ? "text-emerald-700" : "text-slate-500"}>{replyWindow(conversation, now).label}</span>{conversation.resolved ? <span className="text-slate-500">Resolved</span> : conversation.needsReply ? <span className="font-bold text-amber-700">Needs reply</span> : null}</span>
          </button>)}
        </div>
      </aside>
      <div className={`relative min-h-0 min-w-0 flex-col bg-[#f7f3e7] md:flex ${mobilePane === "chat" ? "flex" : "hidden"}`}>
        <div className="flex min-h-16 shrink-0 items-center gap-2 bg-teal-900 px-3 py-2 text-white">
          <button type="button" aria-label="Back to chats" onClick={() => { composer.current?.blur(); setMobilePane("list"); }} className="rounded-lg p-2 md:hidden"><ArrowLeft size={19} /></button>
          <div className="min-w-0 flex-1"><div className="truncate font-bold">{selected?.contactName || "Select a conversation"}</div><div className="text-xs text-teal-100">{selected ? `+${selectedPhone}` : ""}</div></div>
          {selected ? <><button type="button" aria-label={selected.resolved ? "Reopen conversation" : "Resolve conversation"} disabled={triageBusy} onClick={() => void toggleResolved()} className="rounded-lg bg-white/10 p-2 text-xs disabled:opacity-50"><CheckCircle2 size={17} /><span className="sr-only">{selected.resolved ? "Reopen" : "Resolve"}</span></button><button type="button" aria-label="Contact details" onClick={() => { setDetailsOpen(true); details.current?.showModal(); }} className="rounded-lg bg-white/10 p-2 xl:hidden"><Info size={18} /></button></> : null}
        </div>
        {selected ? <label className="flex shrink-0 items-center gap-2 border-b bg-white px-3 py-2 text-slate-400"><Search size={15} /><input aria-label="Search this conversation" value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} placeholder="Search this conversation" className="min-w-0 flex-1 !text-base text-slate-900 outline-none md:!text-sm" />{messageSearch ? <button type="button" aria-label="Clear message search" onClick={() => setMessageSearch("")}><X size={16} /></button> : null}</label> : null}
        <div ref={messageArea} data-testid="message-scroll-area" role="region" aria-label="Messages" onScroll={() => {
          const area = messageArea.current;
          if (!area) return;
          nearBottom.current = area.scrollHeight - area.scrollTop - area.clientHeight < 80;
          setAtBottom(nearBottom.current);
          if (nearBottom.current) setNewMessages(0);
          scrollPositions.current.set(key, area.scrollTop);
        }} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 [overflow-anchor:none] lg:p-4">
          {!selected ? <p className="py-12 text-center text-sm text-slate-500">Choose a contact to open their messages.</p> : !thread.loaded ? <p className="text-center text-sm text-slate-500">Loading conversation…</p> : <>
            {thread.hasMore ? <div className="text-center"><button type="button" disabled={loadingOlder} onClick={() => void loadOlder()} className="rounded-full bg-white px-4 py-2 text-xs font-bold text-teal-800 shadow disabled:opacity-50">{loadingOlder ? "Loading…" : query ? "More search results" : "Load older messages"}</button></div> : null}
            {query ? <p role="status" className="text-center text-xs text-slate-600">{thread.messages.length} matching messages{thread.hasMore ? " loaded" : ""}</p> : null}
            {!thread.messages.length ? <p className="text-center text-sm text-slate-500">{query ? "No matching messages." : "No messages yet."}</p> : null}
            {thread.messages.map((message, index) => <Fragment key={message.id}>
              {index === 0 || dayKey(message.createdAt) !== dayKey(thread.messages[index - 1].createdAt) ? <div className="flex justify-center"><span className="rounded-full bg-white/90 px-3 py-1 text-[11px] text-slate-500 shadow-sm">{new Date(message.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}</span></div> : null}
              <div data-message-id={message.id} className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}><div className={`min-w-0 max-w-[88%] rounded-xl px-3 py-2 text-sm shadow-sm lg:max-w-[80%] ${message.direction === "outbound" ? "bg-emerald-100" : "bg-white"}`}>
                <MessageMedia message={message} /><MessageText text={message.text || ""} />
                {message.templateName ? <div className="mt-1 text-[10px] text-emerald-800">{message.templateName}</div> : null}
                <div className="mt-1 flex flex-wrap items-center justify-end gap-2 text-[10px] text-slate-500"><time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}>{new Date(message.createdAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}</time>{message.direction === "outbound" ? <MessageStatus message={message} /> : null}</div>
                {message.reactions?.length ? <div className="mt-1 flex gap-1">{message.reactions.map((reaction, i) => <span key={i} className="rounded-full bg-white px-2 shadow-sm">{reaction.emoji}</span>)}</div> : null}
                {message.status === "failed" || message.uncertain ? <div className="mt-2 text-xs text-rose-800">{message.error || "Message could not be sent."}{message.uncertain ? <p>Check delivery before sending again.</p> : message.messageType === "text" ? <button type="button" disabled={!selectedWindow.open || sending} onClick={() => void sendReply(undefined, message)} className="ml-2 font-bold underline disabled:opacity-40">Retry message</button> : null}</div> : null}
              </div></div>
            </Fragment>)}
          </>}
          {!query ? localMessages.map((item) => <div key={item.requestId} className="flex justify-end"><div className="max-w-[88%] rounded-xl bg-emerald-100 px-3 py-2 text-sm shadow-sm"><MessageText text={item.text} /><p className="mt-1 text-right text-[11px] text-slate-600">{item.status === "sending" ? "Sending…" : item.error}</p>{item.status !== "sending" ? <button type="button" disabled={sending || item.status !== "unconfirmed" && !selectedWindow.open} onClick={() => void sendReply(item)} className="mt-1 text-xs font-bold text-teal-900 underline disabled:opacity-40">{item.status === "unconfirmed" ? "Check send result" : "Retry message"}</button> : null}</div></div>) : null}
        </div>
        {!atBottom && !query ? <button type="button" onClick={scrollToLatest} className="absolute bottom-40 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-teal-900 px-4 py-2 text-xs font-bold text-white shadow-lg"><ArrowDown size={15} />{newMessages ? "New messages" : "Latest messages"} ↓</button> : null}
        <div className="shrink-0 border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mb-2 flex gap-3 text-xs text-slate-600"><button type="button" disabled={!selectedWindow.open} onClick={() => setTool("saved")} className="inline-flex items-center gap-1 disabled:opacity-40"><FileText size={14} />Saved replies</button><button type="button" disabled={!selectedWindow.open} onClick={() => setTool("attachment")} className="inline-flex items-center gap-1 disabled:opacity-40"><Paperclip size={14} />Attach file</button><button type="button" disabled={!selected} onClick={() => setTool("template")} className="inline-flex items-center gap-1 font-semibold text-teal-800 disabled:opacity-40"><Bot size={14} />Templates</button></div>
          {unconfirmed ? <div className="mb-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">A previous send is unconfirmed. Check delivery before resending. <button type="button" className="font-bold underline" onClick={() => setPending((current) => current.filter((item) => item.requestId !== unconfirmed.requestId))}>I’ve checked delivery</button></div> : null}
          <div className="mb-2 flex items-center justify-between gap-2 text-[11px]"><span className={selectedWindow.open ? "text-emerald-700" : "text-slate-500"}>{selectedWindow.label}</span><span className="hidden text-slate-400 sm:inline">Enter to send · Shift+Enter for a new line</span></div>
          <div className="flex items-end gap-2"><textarea ref={composer} aria-label="Message reply" rows={2} maxLength={4096} value={draft} onChange={(event) => setDrafts((current) => ({ ...current, [selectedPhone]: event.target.value }))} onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && selectedWindow.open) { event.preventDefault(); void sendReply(); }
          }} disabled={!selectedWindow.open} placeholder={selectedWindow.open ? "Type a reply…" : "Reply window expired · send a template"} className="max-h-36 min-h-12 min-w-0 flex-1 resize-y rounded-lg border border-slate-200 px-3 py-2 !text-base outline-none focus:border-emerald-600 disabled:bg-slate-50 md:!text-sm" />
            {selectedWindow.open ? <button type="button" aria-label="Send reply" disabled={sending || !draft.trim()} onClick={() => void sendReply()} className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-teal-900 text-white disabled:opacity-40"><Send size={18} /></button> : selected ? <button type="button" onClick={() => setTool("template")} className="h-12 rounded-lg bg-teal-900 px-3 text-xs font-bold text-white">Template</button> : null}
          </div>
        </div>
      </div>
      <aside className="hidden min-h-0 overflow-y-auto border-l bg-white p-4 xl:block"><ConversationDetails key={selectedPhone} conversation={selected} now={now} canManage={canManage} onChanged={() => void loadList()} /></aside>
    </section>
    <dialog ref={details} aria-label="Contact details" onClose={() => setDetailsOpen(false)} className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-80 max-w-full border-l bg-white p-5 shadow-xl backdrop:bg-black/30"><div className="mb-5 flex items-center justify-between"><h2 className="font-bold">Contact details</h2><button type="button" aria-label="Close contact details" onClick={() => details.current?.close()} className="rounded-lg p-2"><X size={20} /></button></div>{detailsOpen ? <ConversationDetails key={selectedPhone} conversation={selected} now={now} canManage={canManage} onChanged={() => void loadList()} /> : null}</dialog>
    {tool === "saved" && selected ? <SavedRepliesDialog contactName={selected.contactName} onClose={() => setTool(null)} onUse={(text) => { setDrafts((current) => ({ ...current, [selectedPhone]: current[selectedPhone] ? `${current[selectedPhone]}\n${text}` : text })); window.requestAnimationFrame(() => composer.current?.focus({ preventScroll: true })); }} /> : null}
    {tool === "template" && selected ? <TemplateSendDialog phone={selectedPhone} actorId={actorId} onClose={() => setTool(null)} onSent={toolSent} /> : null}
    {tool === "attachment" && selected ? <AttachmentDialog phone={selectedPhone} actorId={actorId} onClose={() => setTool(null)} onSent={toolSent} /> : null}
    {notice ? <div role="status" className="pointer-events-none fixed bottom-5 right-5 z-50 max-w-sm rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">{notice}</div> : null}
  </>;
}

function dayKey(date: string) { return new Date(date).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); }
