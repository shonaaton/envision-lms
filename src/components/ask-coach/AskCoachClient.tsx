"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, EyeOff, MessageSquare, Search, Send, Shield, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

type Role = "student" | "instructor" | "admin";
type ConversationRecord = {
  _id: string;
  type?: "direct" | "batch";
  title?: string;
  lastMessagePreview?: string;
  coach?: { name?: string } | null;
  student?: { name?: string } | null;
  batch?: { name?: string } | null;
};
type MessageRecord = {
  _id: string;
  conversation?: string | { _id?: string };
  sender?: { name?: string } | null;
  body?: string;
  createdAt?: string;
  flagged?: boolean;
  moderationStatus?: string;
  status?: string;
  flagReasons?: string[];
};
type TargetRecord = { _id: string; name?: string };
type AskCoachResponse = {
  conversations: ConversationRecord[];
  messages: MessageRecord[];
  targets: {
    students?: TargetRecord[];
    coaches?: TargetRecord[];
    batches?: TargetRecord[];
  };
};

function conversationIdOf(message: MessageRecord) {
  return typeof message.conversation === "string" ? message.conversation : message.conversation?._id || "";
}

export default function AskCoachClient({ role }: { role: Role }) {
  const searchParams = useSearchParams();
  const [data, setData] = useState<AskCoachResponse>({ conversations: [], messages: [], targets: {} });
  const [activeId, setActiveId] = useState("");
  const [message, setMessage] = useState("");
  const [receiver, setReceiver] = useState("");
  const [batch, setBatch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (nextConversationId?: string) => {
    const params = new URLSearchParams();
    const requestedConversation = nextConversationId || activeId || searchParams.get("conversation") || "";
    if (query) params.set("q", query);
    if (requestedConversation) params.set("conversation", requestedConversation);
    const res = await fetch(`/api/ask-coach${params.toString() ? `?${params.toString()}` : ""}`, { cache: "no-store" });
    if (!res.ok) return;
    const next: AskCoachResponse = await res.json();
    setData(next);
    const requestedFromUrl = searchParams.get("conversation");
    if (requestedFromUrl && next.conversations.some((conversation) => conversation._id === requestedFromUrl)) {
      setActiveId(requestedFromUrl);
      return;
    }
    if (!activeId && next.conversations[0]?._id) setActiveId(next.conversations[0]._id);
  }, [activeId, query, searchParams]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!activeId) return;
    void load(activeId);
  }, [activeId, load]);

  const conversations = data.conversations;
  const activeConversation = conversations.find((conversation) => conversation._id === activeId) || conversations[0];
  const activeMessages = useMemo(
    () => data.messages.filter((item) => conversationIdOf(item) === activeConversation?._id),
    [data.messages, activeConversation?._id]
  );

  useEffect(() => {
    const requestedMessage = searchParams.get("message");
    if (!requestedMessage || !activeMessages.length) return;
    document.getElementById(`ask-coach-message-${requestedMessage}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeMessages, searchParams]);

  const flaggedMessages = data.messages.filter((item) => item.flagged || item.moderationStatus === "pending");
  const canSendBatch = role === "admin" || role === "instructor";

  async function sendMessage() {
    if (!message.trim()) return;
    setLoading(true);
    const startNewThread = Boolean(batch || receiver);
    const payload: Record<string, string> = { message };
    if (!startNewThread && activeConversation?._id) payload.conversationId = activeConversation._id;
    if (batch) payload.batch = batch;
    else if (receiver) payload.receiver = receiver;
    const res = await fetch("/api/ask-coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      toast.error(error.error || "Could not send message");
      return;
    }
    setMessage("");
    setBatch("");
    setReceiver("");
    toast.success("Message sent");
    await load(activeConversation?._id);
  }

  async function moderate(messageId: string, action: string) {
    const res = await fetch("/api/ask-coach/moderation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, action, note: action === "warn" ? "Please do not share contact details or inappropriate content." : "" }),
    });
    if (!res.ok) return toast.error("Moderation action failed");
    toast.success("Moderation updated");
    await load(activeConversation?._id);
  }

  function conversationTitle(conversation: ConversationRecord) {
    if (conversation.type === "batch") return conversation.batch?.name || conversation.title || "Batch Chat";
    if (role === "student") return conversation.coach?.name || "Coach";
    if (role === "instructor") return conversation.student?.name || "Student";
    return conversation.title || conversation.student?.name || conversation.coach?.name || "Conversation";
  }

  return (
    <div className="flex h-[calc(100vh-92px)] min-h-[620px] flex-col overflow-hidden rounded-[28px] border border-brand/10 bg-white shadow-[0_24px_70px_rgba(90,19,114,0.14)]">
      <div className="flex-none border-b border-brand/10 bg-gradient-to-r from-white via-purple-50/60 to-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-brand/70">
              <Shield size={14} />
              Safe Academy Messaging
            </div>
            <h1 className="mt-1 text-2xl font-black text-brand">Ask Coach</h1>
            <p className="mt-1 text-sm text-slate-600">Focused student-coach conversations with moderation and alerts built in.</p>
          </div>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-3 text-slate-400" size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void load()} className="h-10 w-full rounded-xl border border-brand/10 bg-white pl-9 pr-3 text-sm shadow-sm outline-none transition focus:border-brand/40 focus:ring-4 focus:ring-brand/10" placeholder="Search messages" />
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        <aside className="min-h-0 overflow-auto border-b border-brand/10 bg-slate-50/70 p-3 lg:border-b-0 lg:border-r">
          <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-950"><MessageSquare size={16} className="text-brand" /> Conversations</div>
          <div className="space-y-2">
            {conversations.length ? conversations.map((conversation) => (
              <button key={conversation._id} onClick={() => setActiveId(conversation._id)} className={`w-full rounded-2xl border p-3 text-left shadow-sm transition hover:-translate-y-0.5 ${activeConversation?._id === conversation._id ? "border-brand/30 bg-white shadow-brand/10" : "border-slate-200 bg-white/80 hover:bg-white"}`}>
                <div className="text-sm font-black text-slate-950">{conversationTitle(conversation)}</div>
                <div className="mt-1 truncate text-xs text-slate-500">{conversation.lastMessagePreview || (conversation.type === "batch" ? "Batch conversation" : "Direct conversation")}</div>
              </button>
            )) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">No conversations yet.</div>}
          </div>
        </aside>

        <main className="flex min-h-0 flex-col">
          <div className="flex-none border-b border-brand/10 bg-white p-3">
            <h2 className="text-lg font-black text-slate-950">{activeConversation ? conversationTitle(activeConversation) : "New Message"}</h2>
            <p className="text-xs text-slate-500">{activeConversation?.type === "batch" ? "Batch chat" : "Individual chat"}</p>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-auto bg-[radial-gradient(circle_at_top,rgba(90,19,114,0.07),transparent_34%),#f8fafc] p-4">
            {activeMessages.length ? activeMessages.map((item) => (
              <div id={`ask-coach-message-${item._id}`} key={item._id} className={`rounded-2xl border bg-white p-3 shadow-sm ${item.flagged ? "border-amber-300 ring-2 ring-amber-100" : "border-slate-200"}`}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-500">{item.sender?.name || "User"} • {new Date(item.createdAt || "").toLocaleString()}</div>
                  {item.flagged && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700"><AlertTriangle size={13} /> Flagged</span>}
                </div>
                <div className={`text-sm text-slate-800 ${item.status === "hidden" && role !== "admin" ? "italic text-slate-400" : ""}`}>
                  {item.status === "hidden" && role !== "admin" ? "Hidden pending admin review" : item.body}
                </div>
                {item.flagReasons?.length ? <div className="mt-2 text-xs text-amber-700">Reasons: {item.flagReasons.join(", ")}</div> : null}
                {role === "admin" && (item.flagged || item.moderationStatus !== "none") && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => moderate(item._id, "approve")} className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs"><Check size={13} /> Approve</button>
                    <button onClick={() => moderate(item._id, "hide")} className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs"><EyeOff size={13} /> Hide</button>
                    <button onClick={() => moderate(item._id, "delete")} className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs text-red-600"><Trash2 size={13} /> Delete</button>
                    <button onClick={() => moderate(item._id, "warn")} className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs text-amber-700"><Shield size={13} /> Warn</button>
                    <button onClick={() => moderate(item._id, "review")} className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs">Reviewed</button>
                  </div>
                )}
              </div>
            )) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Select a conversation or send a new message.</div>}
          </div>
          <div className="flex-none border-t border-brand/10 bg-white p-3">
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} className="min-h-16 w-full rounded-2xl border border-brand/10 px-3 py-2 text-sm outline-none transition focus:border-brand/40 focus:ring-4 focus:ring-brand/10" placeholder="Type your message. Contact details and restricted content will be flagged." />
            <div className="mt-2 flex justify-end">
              <button disabled={loading} onClick={sendMessage} className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-black text-white shadow-lg shadow-brand/20 disabled:opacity-60"><Send size={16} /> Send</button>
            </div>
          </div>
        </main>

        <aside className="min-h-0 overflow-auto border-t border-brand/10 bg-white p-3 lg:border-l lg:border-t-0">
          <div className="space-y-4">
            <section className="rounded-2xl border border-brand/10 bg-slate-50 p-4 shadow-sm">
              <h3 className="flex items-center gap-2 font-black text-slate-950"><Users size={16} className="text-brand" /> New Message</h3>
              {role !== "student" && (
                <div className="mt-3 space-y-3">
                  <label className="block text-xs font-semibold text-slate-500">Student / Coach</label>
                  <select value={receiver} onChange={(event) => { setReceiver(event.target.value); setBatch(""); }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
                    <option value="">Select person</option>
                    {(data.targets.students || []).map((student) => <option key={student._id} value={student._id}>{student.name} • Student</option>)}
                    {role === "admin" && (data.targets.coaches || []).map((coach) => <option key={coach._id} value={coach._id}>{coach.name} • Coach</option>)}
                  </select>
                </div>
              )}
              {canSendBatch && (
                <div className="mt-3 space-y-3">
                  <label className="block text-xs font-semibold text-slate-500">Batch Message</label>
                  <select value={batch} onChange={(event) => { setBatch(event.target.value); setReceiver(""); }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
                    <option value="">Select batch</option>
                    {(data.targets.batches || []).map((batchItem) => <option key={batchItem._id} value={batchItem._id}>{batchItem.name}</option>)}
                  </select>
                </div>
              )}
              {role === "student" && <p className="mt-3 text-sm text-slate-500">Messages are sent to your assigned coach. Batch announcements from your coach appear in conversations.</p>}
            </section>

            {role === "admin" && (
              <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h3 className="flex items-center gap-2 font-semibold text-amber-900"><AlertTriangle size={16} /> Flagged Messages</h3>
                <div className="mt-3 space-y-2">
                  {flaggedMessages.length ? flaggedMessages.slice(0, 8).map((item) => (
                    <button key={item._id} onClick={() => setActiveId(conversationIdOf(item))} className="w-full rounded-md bg-white p-2 text-left text-xs text-amber-900">
                      <div className="font-semibold">{item.sender?.name}</div>
                      <div className="truncate">{item.body}</div>
                    </button>
                  )) : <div className="text-sm text-amber-800">No flagged messages.</div>}
                </div>
              </section>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
