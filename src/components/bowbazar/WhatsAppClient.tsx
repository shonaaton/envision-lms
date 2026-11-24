"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, MessageCircle, Paperclip, Search, Send } from "lucide-react";
import { toast } from "sonner";
import AttachmentDialog from "@/components/admin/whatsapp/AttachmentDialog";
import { MessageMedia, MessageStatus, MessageText } from "@/components/admin/whatsapp/MessageContent";
import type { WaMessage } from "@/components/admin/whatsapp/types";
import { cn } from "@/lib/utils";
import { BranchHeader, api } from "./shared";

type Conversation = { phone: string; students: string[]; parentName: string; active: boolean; lastText: string; lastDirection: string; lastAt: string; windowOpen: boolean; messages: number };
// Messages come in the online inbox's own shape, so its ticks, media and link rendering apply as they are.
type Thread = { phone: string; students: string[]; parentName: string; windowOpen: boolean; messages: WaMessage[] };
const POLL_MS = 10_000;
const dayKey = (value: string) => new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const when = (value: string) => new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default function WhatsAppClient({ can, actorId }: { can: string[]; actorId: string }) {
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string>("");

  const load = useCallback(() => {
    api<{ conversations: Conversation[] }>("/api/bowbazar/whatsapp").then((data) => setConversations(data.conversations)).catch((error) => toast.error(error.message));
  }, []);
  useEffect(load, [load]);

  const shown = (conversations || []).filter((conversation) => {
    const q = query.trim().toLowerCase();
    return !q || [conversation.phone, conversation.parentName, ...conversation.students].some((value) => value.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-4">
      <BranchHeader title="WhatsApp" subtitle="Messages with Bowbazar families on the academy's WhatsApp number. Only this centre's families are shown." can={can} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <section className="space-y-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input h-10 !pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search student, parent or number" />
          </div>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-brand/10 bg-white shadow-sm">
            {!conversations ? (
              <div className="flex items-center gap-2 p-4 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Loading...</div>
            ) : !shown.length ? (
              <div className="p-6 text-center text-sm text-slate-500">No WhatsApp messages with Bowbazar families yet.</div>
            ) : (
              shown.map((conversation) => (
                <button
                  key={conversation.phone}
                  type="button"
                  onClick={() => setOpen(conversation.phone)}
                  className={cn("block w-full px-3 py-2.5 text-left hover:bg-slate-50", open === conversation.phone && "bg-brand-50")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-bold text-slate-900">{conversation.students.join(", ")}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">{when(conversation.lastAt)}</span>
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {conversation.lastDirection === "outbound" ? "You: " : ""}
                    {conversation.lastText || "(no text)"}
                  </div>
                  {conversation.windowOpen && <span className="mt-0.5 inline-block rounded-full bg-emerald-100 px-1.5 text-[10px] font-bold text-emerald-800">Can reply</span>}
                </button>
              ))
            )}
          </div>
        </section>
        <section className="min-h-[24rem] rounded-lg border border-brand/10 bg-white shadow-sm">
          {open ? <ThreadView key={open} phone={open} actorId={actorId} onSent={load} /> : <div className="flex h-full items-center justify-center p-8 text-sm text-slate-500"><MessageCircle size={18} className="mr-2" /> Pick a conversation.</div>}
        </section>
      </div>
    </div>
  );
}

function ThreadView({ phone, actorId, onSent }: { phone: string; actorId: string; onSent: () => void }) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const lastId = useRef("");

  const load = useCallback(
    (quiet = false) => {
      api<Thread>(`/api/bowbazar/whatsapp/${encodeURIComponent(phone)}`)
        .then(setThread)
        .catch((error) => {
          if (!quiet) toast.error(error.message);
        });
    },
    [phone]
  );
  useEffect(() => load(), [load]);
  // Ticks move from sent to delivered to read, and replies arrive: check again every few seconds.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load(true);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);
  // Scroll only when a new message arrives, not on every tick update.
  useEffect(() => {
    const newest = thread?.messages.at(-1)?.id || "";
    if (newest && newest !== lastId.current) end.current?.scrollIntoView({ block: "end" });
    lastId.current = newest;
  }, [thread]);

  async function send() {
    setSending(true);
    try {
      await api(`/api/bowbazar/whatsapp/${encodeURIComponent(phone)}`, { method: "POST", json: { text } });
      setText("");
      load();
      onSent();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSending(false);
    }
  }

  if (!thread) return <div className="flex items-center gap-2 p-5 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Loading...</div>;

  return (
    <div className="flex h-full max-h-[70vh] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <div className="font-black text-slate-950">{thread.students.join(", ")}</div>
          <div className="text-xs text-slate-500">{[thread.parentName, `+${thread.phone}`].filter(Boolean).join(" · ")}</div>
        </div>
        <a href={`https://wa.me/${thread.phone}`} target="_blank" rel="noreferrer" className="btn-outline h-8 px-2 text-xs">
          <ExternalLink size={13} /> Open in WhatsApp
        </a>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 px-4 py-3">
        {!thread.messages.length && <p className="py-8 text-center text-sm text-slate-500">No messages yet.</p>}
        {thread.messages.map((message, index) => (
          <Fragment key={message.id}>
            {(index === 0 || dayKey(message.createdAt) !== dayKey(thread.messages[index - 1].createdAt)) && (
              <div className="flex justify-center">
                <span className="rounded-full bg-white px-3 py-1 text-[11px] text-slate-500 shadow-sm">
                  {new Date(message.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>
            )}
            <div className={cn("flex", message.direction === "outbound" ? "justify-end" : "justify-start")}>
              <div className={cn("min-w-0 max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm", message.direction === "outbound" ? "bg-emerald-100 text-emerald-950" : "bg-white text-slate-900")}>
                <MessageMedia message={message} />
                <MessageText text={message.text || ""} />
                {message.templateButtons?.length ? (
                  <div className="-mx-3 mt-2 divide-y divide-emerald-200 border-t border-emerald-200">
                    {message.templateButtons.map((label) => (
                      <div key={label} className="px-3 py-1.5 text-center text-sm font-semibold text-sky-700">{label}</div>
                    ))}
                  </div>
                ) : null}
                <div className="mt-1 flex flex-wrap items-center justify-end gap-2 text-[10px] text-slate-500">
                  <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}>
                    {new Date(message.createdAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}
                  </time>
                  {message.direction === "outbound" ? <MessageStatus message={message} /> : null}
                </div>
                {message.reactions?.length ? (
                  <div className="mt-1 flex gap-1">
                    {message.reactions.map((reaction, i) => (
                      <span key={i} className="rounded-full bg-white px-2 shadow-sm">{reaction.emoji}</span>
                    ))}
                  </div>
                ) : null}
                {message.status === "failed" || message.uncertain ? (
                  <div className="mt-1 text-xs text-rose-800">
                    {message.error || "Message could not be sent."}
                    {message.uncertain ? " Check delivery before sending again." : ""}
                  </div>
                ) : null}
              </div>
            </div>
          </Fragment>
        ))}
        <div ref={end} />
      </div>
      <div className="border-t border-slate-100 p-3">
        {thread.windowOpen ? (
          <div className="flex gap-2">
            <button type="button" className="btn-outline h-11 px-3" title="Send a photo or document" aria-label="Send a photo or document" onClick={() => setAttaching(true)}>
              <Paperclip size={16} />
            </button>
            <textarea className="input min-h-[44px] flex-1" rows={2} value={text} onChange={(event) => setText(event.target.value)} placeholder="Type a reply" />
            <button type="button" className="btn-primary h-11 px-4" disabled={sending || !text.trim()} onClick={() => void send()}>
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            WhatsApp allows a typed reply or a file only within 24 hours of the family&apos;s last message. Use &quot;Open in WhatsApp&quot; to message them from your phone.
          </p>
        )}
      </div>
      {attaching && (
        <AttachmentDialog
          phone={thread.phone}
          actorId={actorId}
          endpoint="/api/bowbazar/whatsapp/media/send"
          onClose={() => setAttaching(false)}
          onSent={() => {
            load();
            onSent();
          }}
        />
      )}
    </div>
  );
}
