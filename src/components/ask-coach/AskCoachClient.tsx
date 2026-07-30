"use client";

import { useSearchParams } from "next/navigation";
import type { KeyboardEvent, UIEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCheck, EyeOff, MessageSquare, Search, Send, Shield, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Role = "student" | "instructor" | "admin";
type DeliveryStatus = "sent" | "delivered" | "seen";
type UserRef = { _id?: string; name?: string; username?: string; role?: Role } | null;
type ConversationRecord = {
  _id: string;
  type?: "direct" | "batch";
  title?: string;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  unreadCount?: number;
  currentStatus?: string;
  coach?: UserRef;
  student?: UserRef;
  batch?: { name?: string } | null;
};
type ReadReceipt = { user?: string | { _id?: string }; readAt?: string };
type MessageRecord = {
  _id: string;
  conversation?: string | { _id?: string };
  sender?: UserRef;
  body?: string;
  createdAt?: string;
  flagged?: boolean;
  moderationStatus?: string;
  status?: string;
  deliveryStatus?: DeliveryStatus;
  readBy?: ReadReceipt[];
  readByCount?: number;
  recipientCount?: number;
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
  currentUser?: { id: string; role: Role };
};

const nearBottomDistance = 120;

function idOf(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const candidate = value as { _id?: string; toString?: () => string };
    return candidate._id || candidate.toString?.() || "";
  }
  return "";
}

function conversationIdOf(message: MessageRecord) {
  return typeof message.conversation === "string" ? message.conversation : message.conversation?._id || "";
}

function senderIdOf(message: MessageRecord) {
  return idOf(message.sender);
}

function readReceiptUserId(receipt: ReadReceipt) {
  return idOf(receipt.user);
}

function hasReadMessage(message: MessageRecord, userId: string) {
  return Boolean(userId && (message.readBy || []).some((receipt) => readReceiptUserId(receipt) === userId));
}

function validDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameLocalDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayLabel(value?: string) {
  const date = validDate(value);
  if (!date) return "";
  const today = startOfLocalDay(new Date());
  const messageDay = startOfLocalDay(date);
  const dayDiff = Math.round((today.getTime() - messageDay.getTime()) / 86400000);
  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff > 1 && dayDiff < 7) return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(date);
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function messageTime(value?: string) {
  const date = validDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function conversationTime(value?: string) {
  const date = validDate(value);
  if (!date) return "";
  const now = new Date();
  if (isSameLocalDay(date, now)) return messageTime(value);
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date);
}

function statusLabel(status?: DeliveryStatus) {
  if (status === "seen") return "Seen";
  if (status === "delivered") return "Delivered";
  return "Sent";
}

function MessageStatus({ message }: { message: MessageRecord }) {
  const title = `${statusLabel(message.deliveryStatus)}${
    message.recipientCount ? ` - read by ${message.readByCount || 0} of ${message.recipientCount}` : ""
  }`;
  if (message.deliveryStatus === "seen") {
    return <CheckCheck size={15} className="text-sky-500" aria-label="Seen" />;
  }
  if (message.deliveryStatus === "delivered") {
    return <CheckCheck size={15} className="text-slate-500" aria-label="Delivered" />;
  }
  return <Check size={15} className="text-slate-500" aria-label={title} />;
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
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const previousLastMessageRef = useRef("");
  const initialScrollConversationRef = useRef("");
  const readPendingRef = useRef<Set<string>>(new Set());

  const currentUserId = data.currentUser?.id || "";

  const load = useCallback(async (nextConversationId?: string) => {
    const params = new URLSearchParams();
    const requestedConversation = nextConversationId || activeId || searchParams?.get("conversation") || "";
    if (query) params.set("q", query);
    if (requestedConversation) params.set("conversation", requestedConversation);
    const res = await fetch(`/api/ask-coach${params.toString() ? `?${params.toString()}` : ""}`, { cache: "no-store" });
    if (!res.ok) return;
    const next: AskCoachResponse = await res.json();
    setData(next);

    const requestedFromUrl = searchParams?.get("conversation");
    if (requestedFromUrl && next.conversations.some((conversation) => conversation._id === requestedFromUrl)) {
      setActiveId(requestedFromUrl);
      return;
    }
    if (requestedConversation && next.conversations.some((conversation) => conversation._id === requestedConversation)) {
      setActiveId(requestedConversation);
      return;
    }
    if (!activeId && next.conversations[0]?._id) {
      setActiveId(next.conversations[0]._id);
      return;
    }
    if (activeId && !next.conversations.some((conversation) => conversation._id === activeId) && next.conversations[0]?._id) {
      setActiveId(next.conversations[0]._id);
    }
  }, [activeId, query, searchParams]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [load]);

  const conversations = data.conversations;
  const activeConversation = conversations.find((conversation) => conversation._id === activeId) || conversations[0];
  const activeMessages = useMemo(
    () => data.messages.filter((item) => conversationIdOf(item) === activeConversation?._id),
    [data.messages, activeConversation?._id]
  );
  const firstUnreadIncomingId = useMemo(
    () => activeMessages.find((item) => senderIdOf(item) !== currentUserId && !hasReadMessage(item, currentUserId))?._id || "",
    [activeMessages, currentUserId]
  );

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    window.requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior, block: "end" });
    });
  }, []);

  const markConversationRead = useCallback(async (conversationId: string) => {
    const conversation = data.conversations.find((item) => item._id === conversationId);
    if (!conversation?.unreadCount || readPendingRef.current.has(conversationId) || !currentUserId) return;

    readPendingRef.current.add(conversationId);
    try {
      const res = await fetch("/api/ask-coach", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) return;
      const readAt = new Date().toISOString();
      setData((current) => ({
        ...current,
        conversations: current.conversations.map((item) =>
          item._id === conversationId ? { ...item, unreadCount: 0, currentStatus: "Up to date" } : item
        ),
        messages: current.messages.map((item) => {
          if (conversationIdOf(item) !== conversationId || senderIdOf(item) === currentUserId || hasReadMessage(item, currentUserId)) return item;
          return { ...item, readBy: [...(item.readBy || []), { user: currentUserId, readAt }] };
        }),
      }));
    } finally {
      readPendingRef.current.delete(conversationId);
    }
  }, [currentUserId, data.conversations]);

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const near = element.scrollHeight - element.scrollTop - element.clientHeight <= nearBottomDistance;
    nearBottomRef.current = near;
    setIsNearBottom(near);
    if (near) {
      setHasNewMessages(false);
      if (activeConversation?._id) void markConversationRead(activeConversation._id);
    }
  }, [activeConversation?._id, markConversationRead]);

  useEffect(() => {
    const conversationId = activeConversation?._id;
    if (!conversationId) return;

    const requestedMessage = searchParams?.get("message");
    const lastMessage = activeMessages[activeMessages.length - 1];
    const firstOpenForConversation = initialScrollConversationRef.current !== conversationId;
    const lastChanged = Boolean(lastMessage?._id && previousLastMessageRef.current && previousLastMessageRef.current !== lastMessage._id);

    if (requestedMessage && activeMessages.some((item) => item._id === requestedMessage)) {
      window.requestAnimationFrame(() => {
        document.getElementById(`ask-coach-message-${requestedMessage}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      initialScrollConversationRef.current = conversationId;
    } else if (firstOpenForConversation) {
      scrollToBottom("auto");
      initialScrollConversationRef.current = conversationId;
      nearBottomRef.current = true;
      setIsNearBottom(true);
      setHasNewMessages(false);
      window.setTimeout(() => void markConversationRead(conversationId), 120);
    } else if (lastChanged) {
      const sentByMe = lastMessage ? senderIdOf(lastMessage) === currentUserId : false;
      if (nearBottomRef.current || sentByMe) {
        scrollToBottom(sentByMe ? "auto" : "smooth");
        setHasNewMessages(false);
        window.setTimeout(() => void markConversationRead(conversationId), 160);
      } else {
        setHasNewMessages(true);
      }
    }

    previousLastMessageRef.current = lastMessage?._id || "";
  }, [activeConversation?._id, activeMessages, currentUserId, markConversationRead, scrollToBottom, searchParams]);

  useEffect(() => {
    if (activeConversation?._id && activeConversation.unreadCount && nearBottomRef.current) {
      void markConversationRead(activeConversation._id);
    }
  }, [activeConversation?._id, activeConversation?.unreadCount, markConversationRead]);

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
    const created: MessageRecord = await res.json();
    const nextConversationId = conversationIdOf(created) || activeConversation?._id || "";
    setMessage("");
    setBatch("");
    setReceiver("");
    setHasNewMessages(false);
    nearBottomRef.current = true;
    toast.success("Message sent");
    if (nextConversationId) setActiveId(nextConversationId);
    await load(nextConversationId);
    scrollToBottom("auto");
  }

  function handleMessageKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void sendMessage();
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

  function jumpToNewMessages() {
    if (firstUnreadIncomingId) {
      document.getElementById(`ask-coach-message-${firstUnreadIncomingId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      scrollToBottom("smooth");
    }
    setHasNewMessages(false);
    if (activeConversation?._id) window.setTimeout(() => void markConversationRead(activeConversation._id), 220);
  }

  const flaggedMessages = data.messages.filter((item) => item.flagged || item.moderationStatus === "pending");
  const canSendBatch = role === "admin" || role === "instructor";

  return (
    <div className="flex h-[calc(100dvh-88px)] min-h-[560px] flex-col overflow-hidden rounded-2xl border border-white/70 bg-slate-100 shadow-[0_28px_80px_rgba(47,23,65,0.18)] ring-1 ring-brand/10 max-lg:min-h-[calc(100dvh-88px)] lg:h-[calc(100vh-92px)]">
      <div className="flex-none border-b border-white/70 bg-white/90 px-4 py-2.5 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-white shadow-lg shadow-brand/20">
              <MessageSquare size={19} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-brand/70">
                <Shield size={12} />
                Safe Academy Messaging
              </div>
              <h1 className="truncate text-xl font-black text-slate-950">Ask Coach</h1>
            </div>
          </div>
          <div className="relative w-full lg:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void load()} className="h-9 w-full rounded-full border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm shadow-inner outline-none transition focus:border-brand/40 focus:bg-white focus:ring-4 focus:ring-brand/10" placeholder="Search messages" />
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-px overflow-hidden bg-slate-200/80 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        <aside className="order-1 max-h-44 min-h-0 overflow-auto bg-slate-50 p-3 lg:max-h-none">
          <div className="mb-3 flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2 text-sm font-black text-slate-950"><MessageSquare size={16} className="text-brand" /> Conversations</div>
            {conversations.some((conversation) => (conversation.unreadCount || 0) > 0) && (
              <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-black text-white">
                {conversations.reduce((total, conversation) => total + (conversation.unreadCount || 0), 0)}
              </span>
            )}
          </div>
          <div className="space-y-2">
            {conversations.length ? conversations.map((conversation) => (
              <button key={conversation._id} onClick={() => setActiveId(conversation._id)} className={cn(
                "w-full rounded-2xl border p-3 text-left shadow-sm transition hover:-translate-y-0.5",
                activeConversation?._id === conversation._id ? "border-brand/25 bg-white shadow-[0_12px_30px_rgba(90,19,114,0.12)]" : "border-white bg-white/75 hover:bg-white hover:shadow-md"
              )}>
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black",
                      activeConversation?._id === conversation._id ? "bg-brand text-white" : "bg-slate-200 text-slate-600"
                    )}>
                      {conversationTitle(conversation).slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 truncate text-sm font-black text-slate-950">{conversationTitle(conversation)}</div>
                  </div>
                  <div className="shrink-0 text-[11px] font-semibold text-slate-400">{conversationTime(conversation.lastMessageAt)}</div>
                </div>
                <div className="mt-2 flex min-w-0 items-center gap-2 pl-10">
                  <div className={cn("min-w-0 flex-1 truncate text-xs", (conversation.unreadCount || 0) > 0 ? "font-bold text-slate-800" : "text-slate-500")}>
                    {conversation.lastMessagePreview || (conversation.type === "batch" ? "Batch conversation" : "Direct conversation")}
                  </div>
                  {(conversation.unreadCount || 0) > 0 && (
                    <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-black text-white">
                      {(conversation.unreadCount || 0) > 9 ? "9+" : conversation.unreadCount}
                    </span>
                  )}
                </div>
                <div className="mt-2 pl-10 text-[11px] font-semibold text-slate-400">{conversation.currentStatus || "Up to date"}</div>
              </button>
            )) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">No conversations yet.</div>}
          </div>
        </aside>

        <main className="order-2 flex min-h-0 flex-col bg-white">
          <div className="flex-none border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-sm font-black text-brand">
                  {(activeConversation ? conversationTitle(activeConversation) : "N").slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-black text-slate-950">{activeConversation ? conversationTitle(activeConversation) : "New Message"}</h2>
                  <p className="text-xs text-slate-500">{activeConversation?.type === "batch" ? "Batch chat" : "Individual chat"}</p>
                </div>
              </div>
              {activeConversation?.unreadCount ? (
                <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-black text-brand">{activeConversation.unreadCount} unread</span>
              ) : null}
            </div>
          </div>
          <div
            ref={scrollerRef}
            onScroll={handleScroll}
            className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[radial-gradient(circle_at_20%_0%,rgba(90,19,114,0.09),transparent_30%),linear-gradient(180deg,#fbf7ff_0%,#eef2f7_100%)] p-3 sm:p-5"
          >
            <div className="mx-auto max-w-3xl space-y-3">
              {activeMessages.length ? activeMessages.map((item, index) => {
                const mine = senderIdOf(item) === currentUserId;
                const previous = activeMessages[index - 1];
                const showDay = !previous || dayLabel(previous.createdAt) !== dayLabel(item.createdAt);
                const showUnreadMarker = firstUnreadIncomingId === item._id;
                return (
                  <div key={item._id}>
                    {showDay && (
                      <div className="sticky top-2 z-10 my-3 flex justify-center">
                        <span className="rounded-full border border-slate-200 bg-white/95 px-3 py-1 text-[11px] font-black text-slate-500 shadow-sm backdrop-blur">
                          {dayLabel(item.createdAt)}
                        </span>
                      </div>
                    )}
                    {showUnreadMarker && (
                      <div className="my-3 flex items-center gap-3" aria-label="Unread messages start">
                        <div className="h-px flex-1 bg-brand/20" />
                        <span className="rounded-full bg-brand px-3 py-1 text-[11px] font-black text-white shadow-sm">New messages</span>
                        <div className="h-px flex-1 bg-brand/20" />
                      </div>
                    )}
                    <div id={`ask-coach-message-${item._id}`} className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
                      {!mine && (
                        <span className="mb-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-xs font-black text-brand shadow-sm ring-1 ring-slate-200">
                          {(item.sender?.name || "U").slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <div className={cn(
                        "max-w-[min(82%,42rem)] rounded-[20px] border px-3.5 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)]",
                        mine ? "rounded-br-md border-brand/20 bg-gradient-to-br from-brand to-purple-700 text-white" : "rounded-bl-md border-white bg-white text-slate-900",
                        item.flagged ? "border-amber-300 ring-2 ring-amber-100" : ""
                      )}>
                        <div className={cn("mb-1 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold", mine ? "text-white/75" : "text-slate-500")}>
                          <span className="min-w-0 truncate">{mine ? "You" : item.sender?.name || "User"}</span>
                          {item.flagged && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700"><AlertTriangle size={13} /> Flagged</span>}
                        </div>
                        <div className={cn("break-words text-sm leading-relaxed", item.status === "hidden" && role !== "admin" ? "italic opacity-70" : "")}>
                          {item.status === "hidden" && role !== "admin" ? "Hidden pending admin review" : item.body}
                        </div>
                        {item.flagReasons?.length ? <div className={cn("mt-2 text-xs", mine ? "text-amber-100" : "text-amber-700")}>Reasons: {item.flagReasons.join(", ")}</div> : null}
                        <div className={cn("mt-2 flex items-center justify-end gap-1 text-[11px] font-semibold", mine ? "text-white/75" : "text-slate-500")}>
                          <span>{messageTime(item.createdAt)}</span>
                          {mine && <span title={statusLabel(item.deliveryStatus)} className="inline-flex"><MessageStatus message={item} /></span>}
                        </div>
                        {role === "admin" && (item.flagged || item.moderationStatus !== "none") && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button onClick={() => moderate(item._id, "approve")} className="inline-flex h-8 items-center gap-1 rounded-md border bg-white px-2 text-xs text-slate-700"><Check size={13} /> Approve</button>
                            <button onClick={() => moderate(item._id, "hide")} className="inline-flex h-8 items-center gap-1 rounded-md border bg-white px-2 text-xs text-slate-700"><EyeOff size={13} /> Hide</button>
                            <button onClick={() => moderate(item._id, "delete")} className="inline-flex h-8 items-center gap-1 rounded-md border bg-white px-2 text-xs text-red-600"><Trash2 size={13} /> Delete</button>
                            <button onClick={() => moderate(item._id, "warn")} className="inline-flex h-8 items-center gap-1 rounded-md border bg-white px-2 text-xs text-amber-700"><Shield size={13} /> Warn</button>
                            <button onClick={() => moderate(item._id, "review")} className="inline-flex h-8 items-center gap-1 rounded-md border bg-white px-2 text-xs text-slate-700">Reviewed</button>
                          </div>
                        )}
                      </div>
                      {mine && (
                        <span className="mb-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-xs font-black text-white shadow-sm ring-2 ring-white">
                          Y
                        </span>
                      )}
                    </div>
                  </div>
                );
              }) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Select a conversation or send a new message.</div>}
              <div ref={bottomRef} />
            </div>
            {hasNewMessages && !isNearBottom && (
              <button
                type="button"
                onClick={jumpToNewMessages}
                className="sticky bottom-3 left-1/2 z-20 mx-auto mt-3 flex -translate-x-0 items-center justify-center rounded-full bg-brand px-4 py-2 text-xs font-black text-white shadow-lg shadow-brand/20"
              >
                New Messages
              </button>
            )}
          </div>
          <div className="sticky bottom-0 z-10 flex-none border-t border-slate-200 bg-white/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-12px_28px_rgba(15,23,42,0.06)] backdrop-blur lg:static">
            <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-end">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={handleMessageKeyDown}
                className="min-h-12 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-inner outline-none transition focus:border-brand/40 focus:bg-white focus:ring-4 focus:ring-brand/10"
                placeholder="Type your message. Press Enter to send, Shift+Enter for a new line."
                rows={2}
              />
              <button disabled={loading || !message.trim()} onClick={sendMessage} className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-brand px-5 text-sm font-black text-white shadow-lg shadow-brand/25 transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"><Send size={16} /> Send</button>
            </div>
          </div>
        </main>

        <aside className="order-3 min-h-0 overflow-auto bg-slate-50 p-3">
          <div className="space-y-4">
            <section className="rounded-2xl border border-white bg-white p-3 shadow-[0_12px_32px_rgba(15,23,42,0.08)] sm:p-4">
              <h3 className="flex items-center gap-2 font-black text-slate-950"><Users size={16} className="text-brand" /> New Message</h3>
              {role !== "student" && (
                <div className="mt-3 space-y-2">
                  <label className="block text-xs font-semibold text-slate-500">Student / Coach</label>
                  <select value={receiver} onChange={(event) => { setReceiver(event.target.value); setBatch(""); }} className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm shadow-inner">
                    <option value="">Select person</option>
                    {(data.targets.students || []).map((student) => <option key={student._id} value={student._id}>{student.name} - Student</option>)}
                    {role === "admin" && (data.targets.coaches || []).map((coach) => <option key={coach._id} value={coach._id}>{coach.name} - Coach</option>)}
                  </select>
                </div>
              )}
              {canSendBatch && (
                <div className="mt-3 space-y-2">
                  <label className="block text-xs font-semibold text-slate-500">Batch Message</label>
                  <select value={batch} onChange={(event) => { setBatch(event.target.value); setReceiver(""); }} className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm shadow-inner">
                    <option value="">Select batch</option>
                    {(data.targets.batches || []).map((batchItem) => <option key={batchItem._id} value={batchItem._id}>{batchItem.name}</option>)}
                  </select>
                </div>
              )}
              {role === "student" && <p className="mt-3 text-sm text-slate-500">Messages are sent to your assigned coach. Batch announcements from your coach appear in conversations.</p>}
            </section>

            {role === "admin" && (
              <section className="rounded-2xl border border-amber-200 bg-gradient-to-b from-amber-50 to-white p-4 shadow-[0_12px_32px_rgba(146,64,14,0.10)]">
                <h3 className="flex items-center gap-2 font-semibold text-amber-900"><AlertTriangle size={16} /> Flagged Messages</h3>
                <div className="mt-3 space-y-2">
                  {flaggedMessages.length ? flaggedMessages.slice(0, 8).map((item) => (
                    <button key={item._id} onClick={() => setActiveId(conversationIdOf(item))} className="w-full rounded-xl bg-white p-2 text-left text-xs text-amber-900 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
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
