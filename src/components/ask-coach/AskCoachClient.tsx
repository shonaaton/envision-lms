"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, EyeOff, MessageSquare, Search, Send, Shield, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

type Role = "student" | "instructor" | "admin";

export default function AskCoachClient({ role }: { role: Role }) {
  const searchParams = useSearchParams();
  const [data, setData] = useState<any>({ conversations: [], messages: [], targets: {} });
  const [activeId, setActiveId] = useState("");
  const [message, setMessage] = useState("");
  const [receiver, setReceiver] = useState("");
  const [batch, setBatch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch(`/api/ask-coach${query ? `?q=${encodeURIComponent(query)}` : ""}`, { cache: "no-store" });
    if (!res.ok) return;
    const next = await res.json();
    setData(next);
    const requestedConversation = searchParams.get("conversation");
    if (requestedConversation && next.conversations?.some((conversation: any) => conversation._id === requestedConversation)) {
      setActiveId(requestedConversation);
      return;
    }
    if (!activeId && next.conversations?.[0]?._id) setActiveId(next.conversations[0]._id);
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, []);

  const conversations = data.conversations || [];
  const activeConversation = conversations.find((conversation: any) => conversation._id === activeId) || conversations[0];
  const activeMessages = useMemo(
    () => (data.messages || []).filter((item: any) => item.conversation === activeConversation?._id || item.conversation?._id === activeConversation?._id),
    [data.messages, activeConversation?._id]
  );
  const flaggedMessages = (data.messages || []).filter((item: any) => item.flagged || item.moderationStatus === "pending");
  const canSendBatch = role === "admin" || role === "instructor";

  async function sendMessage() {
    if (!message.trim()) return;
    setLoading(true);
    const payload: any = { message, conversationId: activeConversation?._id || undefined };
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
    await load();
  }

  async function moderate(messageId: string, action: string) {
    const res = await fetch("/api/ask-coach/moderation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, action, note: action === "warn" ? "Please do not share contact details or inappropriate content." : "" }),
    });
    if (!res.ok) return toast.error("Moderation action failed");
    toast.success("Moderation updated");
    await load();
  }

  function conversationTitle(conversation: any) {
    if (conversation.type === "batch") return conversation.batch?.name || conversation.title || "Batch Chat";
    if (role === "student") return conversation.coach?.name || "Coach";
    if (role === "instructor") return conversation.student?.name || "Student";
    return conversation.title || conversation.student?.name || conversation.coach?.name || "Conversation";
  }

  return (
    <div className="flex h-[calc(100vh-92px)] min-h-[620px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-brand/10">
      <div className="flex-none border-b border-slate-200 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">Ask Coach</h1>
            <p className="mt-1 text-sm text-slate-500">Safe, monitored student-coach communication inside the academy.</p>
          </div>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-3 text-slate-400" size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && load()} className="h-10 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm" placeholder="Search messages" />
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        <aside className="min-h-0 overflow-auto border-b border-slate-200 p-3 lg:border-b-0 lg:border-r">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950"><MessageSquare size={16} /> Conversations</div>
          <div className="space-y-2">
            {conversations.length ? conversations.map((conversation: any) => (
              <button key={conversation._id} onClick={() => setActiveId(conversation._id)} className={`w-full rounded-md border p-3 text-left ${activeConversation?._id === conversation._id ? "border-purple-300 bg-purple-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                <div className="text-sm font-semibold text-slate-950">{conversationTitle(conversation)}</div>
                <div className="mt-1 truncate text-xs text-slate-500">{conversation.lastMessagePreview || (conversation.type === "batch" ? "Batch conversation" : "Direct conversation")}</div>
              </button>
            )) : <div className="rounded-md border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">No conversations yet.</div>}
          </div>
        </aside>

        <main className="flex min-h-0 flex-col">
          <div className="flex-none border-b border-slate-200 p-3">
            <h2 className="text-lg font-semibold text-slate-950">{activeConversation ? conversationTitle(activeConversation) : "New Message"}</h2>
            <p className="text-xs text-slate-500">{activeConversation?.type === "batch" ? "Batch chat" : "Individual chat"}</p>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-auto bg-slate-50 p-3">
            {activeMessages.length ? activeMessages.map((item: any) => (
              <div key={item._id} className={`rounded-lg border bg-white p-3 ${item.flagged ? "border-amber-300" : "border-slate-200"}`}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-500">{item.sender?.name || "User"} · {new Date(item.createdAt).toLocaleString()}</div>
                  {item.flagged && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700"><AlertTriangle size={13} /> Flagged</span>}
                </div>
                <div className={`text-sm text-slate-800 ${item.status === "hidden" ? "italic text-slate-400" : ""}`}>{item.status === "hidden" ? "Hidden by admin" : item.body}</div>
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
            )) : <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Select a conversation or send a new message.</div>}
          </div>
          <div className="flex-none border-t border-slate-200 p-3">
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} className="min-h-16 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" placeholder="Type your message. Contact details and restricted content will be flagged." />
            <div className="mt-2 flex justify-end">
              <button disabled={loading} onClick={sendMessage} className="inline-flex h-10 items-center gap-2 rounded-md bg-purple-700 px-4 text-sm font-semibold text-white disabled:opacity-60"><Send size={16} /> Send</button>
            </div>
          </div>
        </main>

        <aside className="min-h-0 overflow-auto border-t border-slate-200 p-3 lg:border-l lg:border-t-0">
          <div className="space-y-4">
            <section className="rounded-lg border border-slate-200 p-4">
              <h3 className="flex items-center gap-2 font-semibold text-slate-950"><Users size={16} /> New Message</h3>
              {role !== "student" && (
                <div className="mt-3 space-y-3">
                  <label className="block text-xs font-semibold text-slate-500">Student / Coach</label>
                  <select value={receiver} onChange={(event) => { setReceiver(event.target.value); setBatch(""); }} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm">
                    <option value="">Select person</option>
                    {(data.targets?.students || []).map((student: any) => <option key={student._id} value={student._id}>{student.name} · Student</option>)}
                    {role === "admin" && (data.targets?.coaches || []).map((coach: any) => <option key={coach._id} value={coach._id}>{coach.name} · Coach</option>)}
                  </select>
                </div>
              )}
              {canSendBatch && (
                <div className="mt-3 space-y-3">
                  <label className="block text-xs font-semibold text-slate-500">Batch Message</label>
                  <select value={batch} onChange={(event) => { setBatch(event.target.value); setReceiver(""); }} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm">
                    <option value="">Select batch</option>
                    {(data.targets?.batches || []).map((batchItem: any) => <option key={batchItem._id} value={batchItem._id}>{batchItem.name}</option>)}
                  </select>
                </div>
              )}
              {role === "student" && <p className="mt-3 text-sm text-slate-500">Messages are sent to your assigned coach. Batch announcements from your coach appear in conversations.</p>}
            </section>

            {role === "admin" && (
              <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h3 className="flex items-center gap-2 font-semibold text-amber-900"><AlertTriangle size={16} /> Flagged Messages</h3>
                <div className="mt-3 space-y-2">
                  {flaggedMessages.length ? flaggedMessages.slice(0, 8).map((item: any) => (
                    <button key={item._id} onClick={() => setActiveId(item.conversation?._id || item.conversation)} className="w-full rounded-md bg-white p-2 text-left text-xs text-amber-900">
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
