"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, Clock3, MessageCircle, RefreshCw, Send, UserRound } from "lucide-react";

type WaMessage = {
  id: string;
  phoneNumber: string;
  direction: "inbound" | "outbound";
  text: string;
  messageType: string;
  templateName?: string;
  status: string;
  createdAt: string;
  sentAt?: string;
  receivedAt?: string;
};

type Conversation = {
  phoneNumber: string;
  contactName: string;
  profileName?: string;
  matchedUser?: { name?: string; email?: string; username?: string; role?: string; phone?: string } | null;
  messages: WaMessage[];
  lastInboundAt?: string;
  lastMessageAt?: string;
  lastMessageText?: string;
  sentTemplateCount: number;
  activeUntil?: string | null;
  canReply: boolean;
};

type InboxPayload = {
  active: Conversation[];
  sentTemplates: Conversation[];
  conversations: Conversation[];
  windowHours: number;
};

const DEFAULT_NUMBERS = "8017996184, 6290349998";

export default function WhatsAppWorkspace() {
  const [tab, setTab] = useState<"active" | "sent" | "automation">("active");
  const [data, setData] = useState<InboxPayload>({ active: [], sentTemplates: [], conversations: [], windowHours: 24 });
  const [selectedPhone, setSelectedPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [templateName, setTemplateName] = useState("hello_world");
  const [language, setLanguage] = useState("en_US");
  const [recipients, setRecipients] = useState(DEFAULT_NUMBERS);
  const [notice, setNotice] = useState("");

  async function loadInbox() {
    setLoading(true);
    const res = await fetch("/api/admin/whatsapp", { cache: "no-store" });
    const payload = await res.json();
    setData(payload);
    setSelectedPhone((current) => current || payload.active?.[0]?.phoneNumber || payload.sentTemplates?.[0]?.phoneNumber || "");
    setLoading(false);
  }

  useEffect(() => {
    void loadInbox();
  }, []);

  const conversations = tab === "sent" ? data.sentTemplates : data.active;
  const selected = useMemo(
    () => data.conversations.find((conversation) => conversation.phoneNumber === selectedPhone) || conversations[0],
    [conversations, data.conversations, selectedPhone]
  );

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setSendingReply(true);
    setNotice("");
    const res = await fetch("/api/admin/whatsapp/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber: selected.phoneNumber, text: reply }),
    });
    const payload = await res.json().catch(() => ({}));
    setSendingReply(false);
    if (!res.ok || payload.error) {
      setNotice(payload.error || "Reply could not be sent.");
      return;
    }
    setReply("");
    setNotice("Reply sent.");
    await loadInbox();
  }

  async function sendTemplate() {
    setNotice("");
    const res = await fetch("/api/admin/whatsapp/template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateName,
        language,
        recipients: recipients.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean),
      }),
    });
    const payload = await res.json().catch(() => ({}));
    const sent = (payload.results || []).filter((item: any) => item.ok).length;
    const failed = (payload.results || []).filter((item: any) => !item.ok).length;
    setNotice(res.ok ? `Template sent to ${sent} contact${sent === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}.` : payload.error || "Template send failed.");
    await loadInbox();
    setTab("sent");
  }

  return (
    <div className="min-h-screen min-w-0 text-slate-950">
      <div className="mb-5 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
            <MessageCircle size={14} />
            WhatsApp
          </div>
          <h1 className="mt-3 text-3xl font-black text-slate-950">WhatsApp Inbox</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Review active 24-hour conversations, track sent templates, and launch approved template messages.</p>
        </div>
        <button onClick={loadInbox} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm">
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <TabButton active={tab === "active"} onClick={() => setTab("active")} icon={<Clock3 size={15} />} label={`Active (${data.active.length})`} />
        <TabButton active={tab === "sent"} onClick={() => setTab("sent")} icon={<CheckCircle2 size={15} />} label={`Sent Templates (${data.sentTemplates.length})`} />
        <TabButton active={tab === "automation"} onClick={() => setTab("automation")} icon={<Bot size={15} />} label="Template Automation" />
      </div>

      {notice ? <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{notice}</div> : null}

      {tab === "automation" ? (
        <section className="max-w-3xl rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Send Template</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Template name" value={templateName} onChange={setTemplateName} />
            <Field label="Language" value={language} onChange={setLanguage} />
          </div>
          <div className="mt-4">
            <Field label="Recipients" value={recipients} onChange={setRecipients} />
          </div>
          <button onClick={sendTemplate} className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-bold text-white shadow-sm">
            <Send size={16} />
            Send Template Now
          </button>
        </section>
      ) : (
        <section className="grid min-h-[640px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm xl:grid-cols-[360px_minmax(0,1fr)_320px]">
          <aside className="border-r border-slate-200">
            <div className="border-b border-slate-200 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              {tab === "active" ? "Active conversations" : "Template sends"}
            </div>
            <div className="max-h-[640px] overflow-y-auto">
              {loading ? <div className="p-5 text-sm text-slate-500">Loading WhatsApp inbox...</div> : null}
              {!loading && conversations.length === 0 ? <div className="p-5 text-sm text-slate-500">No records yet.</div> : null}
              {conversations.map((conversation) => (
                <button
                  key={conversation.phoneNumber}
                  onClick={() => setSelectedPhone(conversation.phoneNumber)}
                  className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-4 text-left transition hover:bg-slate-50 ${selected?.phoneNumber === conversation.phoneNumber ? "bg-emerald-50" : "bg-white"}`}
                >
                  <Avatar name={conversation.contactName} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black text-slate-950">{conversation.contactName}</span>
                    <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">+{conversation.phoneNumber}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">{conversation.lastMessageText || "No message preview"}</span>
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <main className="flex min-w-0 flex-col bg-[#f7f3e7]">
            <div className="flex min-h-16 items-center justify-between border-b border-teal-900/10 bg-teal-900 px-5 text-white">
              <div className="min-w-0">
                <div className="truncate text-lg font-black">{selected?.contactName || "No conversation selected"}</div>
                {selected ? <div className="text-xs font-semibold text-emerald-100">+{selected.phoneNumber}</div> : null}
              </div>
              {selected?.canReply ? <Badge text="24h active" tone="green" /> : <Badge text="Template required" tone="amber" />}
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {(selected?.messages || []).map((message) => (
                <div key={message.id} className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[78%] rounded-lg px-4 py-3 text-sm leading-6 shadow-sm ${message.direction === "outbound" ? "bg-white text-slate-800" : "bg-teal-900 text-white"}`}>
                    <div>{message.messageType === "template" ? `Template: ${message.templateName || message.text}` : message.text}</div>
                    <div className={`mt-1 text-[11px] ${message.direction === "outbound" ? "text-slate-400" : "text-teal-100"}`}>{message.status} · {new Date(message.createdAt).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-200 bg-white p-4">
              <div className="flex gap-2">
                <input
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  disabled={!selected?.canReply}
                  placeholder={selected?.canReply ? "Type a reply..." : "Outside 24-hour window. Send a template instead."}
                  className="min-h-11 flex-1 rounded-lg border border-slate-200 px-4 text-sm outline-none focus:border-emerald-500 disabled:bg-slate-50"
                />
                <button disabled={!selected?.canReply || sendingReply || !reply.trim()} onClick={sendReply} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-teal-900 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                  <Send size={16} />
                  Reply
                </button>
              </div>
            </div>
          </main>

          <aside className="hidden border-l border-slate-200 bg-white p-5 xl:block">
            <div className="text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-2xl font-black text-emerald-700">
                {initials(selected?.contactName || "?")}
              </div>
              <div className="mt-3 text-xl font-black text-slate-950">{selected?.contactName || "Contact"}</div>
              <div className="mt-1 text-sm font-semibold text-slate-500">{selected ? `+${selected.phoneNumber}` : "-"}</div>
            </div>
            <div className="mt-6 space-y-3 text-sm">
              <ProfileRow label="Status" value={selected?.canReply ? "Active 24-hour window" : "Template only"} />
              <ProfileRow label="Matched LMS user" value={selected?.matchedUser?.name || "Not matched"} />
              <ProfileRow label="Role" value={selected?.matchedUser?.role || "-"} />
              <ProfileRow label="Templates sent" value={String(selected?.sentTemplateCount || 0)} />
              <ProfileRow label="Active until" value={selected?.activeUntil ? new Date(selected.activeUntil).toLocaleString() : "-"} />
            </div>
          </aside>
        </section>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold transition ${active ? "bg-emerald-600 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
      {icon}
      {label}
    </button>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500" />
    </label>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-teal-900 text-sm font-black text-white">
      {name ? initials(name) : <UserRound size={18} />}
    </span>
  );
}

function Badge({ text, tone }: { text: string; tone: "green" | "amber" }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${tone === "green" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{text}</span>;
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-4 py-3">
      <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</div>
      <div className="mt-1 break-words font-bold text-slate-800">{value}</div>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}
