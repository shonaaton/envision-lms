"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, MessageCircle, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BranchHeader, api } from "./shared";

type Conversation = { phone: string; students: string[]; parentName: string; active: boolean; lastText: string; lastDirection: string; lastAt: string; windowOpen: boolean; messages: number };
type Thread = { phone: string; students: string[]; parentName: string; windowOpen: boolean; messages: { id: string; direction: string; text: string; status: string; at: string }[] };

const when = (value: string) => new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default function WhatsAppClient({ can }: { can: string[] }) {
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
          {open ? <ThreadView key={open} phone={open} onSent={load} /> : <div className="flex h-full items-center justify-center p-8 text-sm text-slate-500"><MessageCircle size={18} className="mr-2" /> Pick a conversation.</div>}
        </section>
      </div>
    </div>
  );
}

function ThreadView({ phone, onSent }: { phone: string; onSent: () => void }) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api<Thread>(`/api/bowbazar/whatsapp/${encodeURIComponent(phone)}`).then(setThread).catch((error) => toast.error(error.message));
  }, [phone]);
  useEffect(load, [load]);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [thread]);

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
        {thread.messages.map((message) => (
          <div key={message.id} className={cn("max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm", message.direction === "outbound" ? "ml-auto bg-emerald-100 text-emerald-950" : "bg-white text-slate-900")}>
            <div className="whitespace-pre-wrap">{message.text}</div>
            <div className="mt-0.5 text-right text-[10px] text-slate-500">{when(message.at)}{message.direction === "outbound" && message.status ? ` · ${message.status}` : ""}</div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="border-t border-slate-100 p-3">
        {thread.windowOpen ? (
          <div className="flex gap-2">
            <textarea className="input min-h-[44px] flex-1" rows={2} value={text} onChange={(event) => setText(event.target.value)} placeholder="Type a reply" />
            <button type="button" className="btn-primary h-11 px-4" disabled={sending || !text.trim()} onClick={() => void send()}>
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-500">WhatsApp allows a typed reply only within 24 hours of the family&apos;s last message. Use &quot;Open in WhatsApp&quot; to message them from your phone.</p>
        )}
      </div>
    </div>
  );
}
