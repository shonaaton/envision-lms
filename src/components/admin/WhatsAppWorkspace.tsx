"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, CheckCircle2, Clock3, MessageCircle, RefreshCw, Send, Sparkles, UserRound } from "lucide-react";
import { WHATSAPP_TEMPLATE_DEFINITIONS, getWhatsAppTemplateDefinition, templateSampleValues } from "@/lib/whatsappTemplateRegistry";

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
  chatPath?: string;
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
  whatsapp?: {
    last_customer_message_at?: string | null;
    window_expires_at?: string | null;
    window_open: boolean;
    expiring_soon: boolean;
    remaining_seconds: number;
    free_form_allowed: boolean;
    template_required: boolean;
  };
};

type InboxPayload = {
  active: Conversation[];
  closed: Conversation[];
  sentTemplates: Conversation[];
  conversations: Conversation[];
  windowHours: number;
};

const DEFAULT_NUMBERS = "918017996184, 916290349998";

export default function WhatsAppWorkspace({ initialPhoneNumber = "" }: { initialPhoneNumber?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"all" | "active" | "closed" | "sent" | "automation">("all");
  const [data, setData] = useState<InboxPayload>({ active: [], closed: [], sentTemplates: [], conversations: [], windowHours: 24 });
  const [selectedPhone, setSelectedPhone] = useState(initialPhoneNumber);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [templateName, setTemplateName] = useState("hello_world_2");
  const [language, setLanguage] = useState("en");
  const [recipients, setRecipients] = useState(DEFAULT_NUMBERS);
  const [templateVariables, setTemplateVariables] = useState("");
  const [notice, setNotice] = useState("");
  const [templateResults, setTemplateResults] = useState<any[]>([]);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/whatsapp", { cache: "no-store" });
    const payload = await res.json();
    setData(payload);
    setSelectedPhone((current) => current || initialPhoneNumber || payload.conversations?.[0]?.phoneNumber || payload.sentTemplates?.[0]?.phoneNumber || "");
    setLoading(false);
  }, [initialPhoneNumber]);

  useEffect(() => {
    void loadInbox();
    const interval = window.setInterval(() => void loadInbox(), 30000);
    return () => window.clearInterval(interval);
  }, [loadInbox]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const liveConversations = useMemo(() => data.conversations.map((conversation) => withLiveWindow(conversation, now)), [data.conversations, now]);
  const conversations = tab === "sent"
    ? liveConversations.filter((conversation) => conversation.sentTemplateCount > 0)
    : tab === "closed"
      ? liveConversations.filter((conversation) => !conversation.canReply)
      : tab === "active"
        ? liveConversations.filter((conversation) => conversation.canReply)
        : liveConversations;
  const selected = useMemo(
    () => liveConversations.find((conversation) => conversation.phoneNumber === selectedPhone) || (!selectedPhone ? conversations[0] : undefined),
    [conversations, liveConversations, selectedPhone]
  );
  const selectedTemplateDefinition = useMemo(() => getWhatsAppTemplateDefinition(templateName), [templateName]);
  const orderedTemplateVariables = useMemo(
    () => templateVariables.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
    [templateVariables]
  );
  const templateGroups = useMemo(() => {
    return WHATSAPP_TEMPLATE_DEFINITIONS.reduce<Record<string, typeof WHATSAPP_TEMPLATE_DEFINITIONS[number][]>>((groups, template) => {
      const key = template.sourceAutomation || "Manual";
      groups[key] = groups[key] || [];
      groups[key].push(template);
      return groups;
    }, {});
  }, []);

  function updateTemplateName(value: string) {
    setTemplateName(value);
    const definition = getWhatsAppTemplateDefinition(value);
    if (!definition) return;
    setLanguage(definition.language);
    setTemplateVariables(templateSampleValues(value).join("\n"));
  }

  function selectAutomationTemplate(name: string) {
    const definition = getWhatsAppTemplateDefinition(name);
    if (!definition) return;
    const variables = templateSampleValues(name);
    setTemplateName(definition.name);
    setLanguage(definition.language);
    setTemplateVariables(variables.join("\n"));
  }

  function openConversation(phoneNumber: string) {
    const conversation = data.conversations.find((item) => item.phoneNumber === phoneNumber);
    setSelectedPhone(phoneNumber);
    router.push(conversation?.chatPath || `/admin/whatsapp/${encodeURIComponent(phoneNumber)}`);
  }

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
      setNotice(payload.message || payload.error || "Reply could not be sent.");
      return;
    }
    setReply("");
    setNotice("Reply sent.");
    await loadInbox();
  }

  async function sendTemplate() {
    await sendTemplateRequest(templateName, language, orderedTemplateVariables);
  }

  async function sendTemplateRequest(nextTemplateName: string, nextLanguage: string, nextTemplateVariables: string[]) {
    setNotice("");
    const res = await fetch("/api/admin/whatsapp/template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateName: nextTemplateName,
        language: nextLanguage,
        recipients: recipients.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean),
        templateVariables: nextTemplateVariables,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    const results = payload.results || [];
    setTemplateResults(results);
    const sent = results.filter((item: any) => item.ok).length;
    const failed = results.filter((item: any) => !item.ok).length;
    setNotice(res.ok ? `${nextTemplateName} sent to ${sent} contact${sent === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}.` : payload.error || "Template send failed.");
    await loadInbox();
    if (sent > 0 && failed === 0) setTab("sent");
  }

  function prepareTemplateForSelectedContact() {
    if (!selected) return;
    setRecipients(selected.phoneNumber);
    setTab("automation");
  }

  return (
    <div className="min-h-0 min-w-0 text-slate-950">
      <div className="mb-3 flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-teal-900 text-white shadow-lg shadow-teal-950/15">
              <MessageCircle size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">WhatsApp</div>
              <h1 className="truncate text-2xl font-black text-slate-950">WhatsApp Inbox</h1>
            </div>
          </div>
        </div>
        <button onClick={loadInbox} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm shadow-slate-200/70 transition hover:border-emerald-200 hover:text-emerald-700">
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <TabButton active={tab === "all"} onClick={() => setTab("all")} icon={<MessageCircle size={15} />} label={`All Chats (${liveConversations.length})`} />
        <TabButton active={tab === "active"} onClick={() => setTab("active")} icon={<Clock3 size={15} />} label={`Active (${liveConversations.filter((conversation) => conversation.canReply).length})`} />
        <TabButton active={tab === "closed"} onClick={() => setTab("closed")} icon={<CheckCircle2 size={15} />} label={`Closed (${liveConversations.filter((conversation) => !conversation.canReply).length})`} />
        <TabButton active={tab === "sent"} onClick={() => setTab("sent")} icon={<CheckCircle2 size={15} />} label={`Sent Templates (${liveConversations.filter((conversation) => conversation.sentTemplateCount > 0).length})`} />
        <TabButton active={tab === "automation"} onClick={() => setTab("automation")} icon={<Bot size={15} />} label="Template Automation" />
      </div>

      {notice ? <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{notice}</div> : null}

      {tab === "automation" ? (
        <section className="max-w-3xl rounded-lg border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/70">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-950">Manual Automation Sender</h2>
              <p className="text-sm text-slate-500">Choose an approved automation, review the details, then send it manually.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Template name" value={templateName} onChange={updateTemplateName} listId="whatsapp-template-options" />
            <Field label="Language" value={language} onChange={setLanguage} />
          </div>
          <datalist id="whatsapp-template-options">
            {WHATSAPP_TEMPLATE_DEFINITIONS.map((template) => (
              <option key={template.name} value={template.name}>
                {template.sourceAutomation}
              </option>
            ))}
          </datalist>
          <div className="mt-4">
            <Field label="Recipients" value={recipients} onChange={setRecipients} />
          </div>
          <div className="mt-5">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">Manual automation controls</h3>
                <p className="mt-1 text-sm text-slate-500">Pick an automation to load its approved template and sample variables.</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{WHATSAPP_TEMPLATE_DEFINITIONS.length} templates</span>
            </div>
            <div className="max-h-[430px] space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
              {Object.entries(templateGroups).map(([groupName, templates]) => (
                <div key={groupName} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500">{groupName}</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {templates.map((template) => (
                      <button
                        key={template.name}
                        onClick={() => selectAutomationTemplate(template.name)}
                        className={`flex min-h-12 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm font-bold transition ${templateName === template.name ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-800 hover:border-emerald-200 hover:bg-emerald-50"}`}
                        title={`Load ${template.name}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{template.name}</span>
                          <span className="mt-0.5 block text-xs font-semibold text-slate-500">{template.variables.length} variable{template.variables.length === 1 ? "" : "s"}</span>
                        </span>
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-600 text-white">
                          <Bot size={14} />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Body variables in Meta order</span>
              <textarea
                value={templateVariables}
                onChange={(event) => setTemplateVariables(event.target.value)}
                rows={Math.max(4, selectedTemplateDefinition?.variables.length || 0)}
                placeholder="One value per line. Leave blank for hello_world_2."
                className="mt-2 min-h-28 w-full resize-y rounded-lg border border-slate-200 px-3 py-3 text-sm outline-none focus:border-emerald-500"
              />
            </label>
            {selectedTemplateDefinition?.variables.length ? (
              <div className="mt-3 grid gap-2 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-900">
                {selectedTemplateDefinition.variables.map((variable) => (
                  <div key={`${selectedTemplateDefinition.name}-${variable.position}`} className="flex flex-wrap gap-2">
                    <span className="font-black">{`{{${variable.position}}}`}</span>
                    <span>{variable.key}</span>
                    {variable.sample ? <span className="text-emerald-700">Sample: {variable.sample}</span> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <button onClick={sendTemplate} className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-bold text-white shadow-sm">
            <Send size={16} />
            Fire Automation Now
          </button>
          {templateResults.length ? (
            <div className="mt-5 overflow-hidden rounded-lg border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">Last send debug</div>
              <div className="divide-y divide-slate-100">
                {templateResults.map((result, index) => (
                  <div key={`${result.phoneNumber}-${index}`} className="grid gap-2 p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-black text-slate-950">+{result.phoneNumber}{result.name ? ` · ${result.name}` : ""}</div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black ${result.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                        {result.ok ? "Sent" : `Failed${result.status ? ` ${result.status}` : ""}`}
                      </span>
                    </div>
                    {result.error ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{result.error}</div> : null}
                    <div className="grid gap-1 text-xs leading-5 text-slate-500">
                      <div><span className="font-bold text-slate-700">Endpoint:</span> {result.debug?.endpoint || "-"}</div>
                      <div><span className="font-bold text-slate-700">Template:</span> {result.debug?.templateName || "-"} / {result.debug?.templateLanguage || "-"}</div>
                      <div><span className="font-bold text-slate-700">Meta code:</span> {result.metaError?.code || "-"} {result.metaError?.type ? `(${result.metaError.type})` : ""}</div>
                      <div><span className="font-bold text-slate-700">Trace:</span> {result.metaError?.fbtrace_id || "-"}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="grid h-[calc(100dvh-190px)] min-h-[500px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-200/70 xl:grid-cols-[330px_minmax(0,1fr)_300px] 2xl:grid-cols-[360px_minmax(0,1fr)_320px]">
          <aside className="min-h-0 border-r border-slate-200 bg-white">
            <div className="flex h-12 items-center justify-between border-b border-slate-200 bg-slate-50 px-4 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              {tab === "active" ? "Active conversations" : tab === "closed" ? "Closed conversations" : tab === "all" ? "All chats" : "Template sends"}
              <span className="rounded-full bg-white px-2 py-1 text-[11px] text-slate-500 shadow-sm">{conversations.length}</span>
            </div>
            <div className="h-[calc(100%-3rem)] overflow-y-auto">
              {loading ? <div className="p-5 text-sm text-slate-500">Loading WhatsApp inbox...</div> : null}
              {!loading && conversations.length === 0 ? (
                <EmptyPanel
                  title={tab === "active" ? "No active chats" : tab === "closed" ? "No closed chats" : tab === "all" ? "No WhatsApp chats" : "No templates sent"}
                  text={tab === "active" ? "Replies will appear here after a contact messages the business." : tab === "closed" ? "Closed chats remain here until the customer replies again." : tab === "all" ? "Inbound replies and sent messages will appear here." : "Template messages you send will appear in this tab."}
                />
              ) : null}
              {conversations.map((conversation) => (
                <button
                  key={conversation.phoneNumber}
                  onClick={() => openConversation(conversation.phoneNumber)}
                  className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-4 text-left transition hover:bg-slate-50 ${selected?.phoneNumber === conversation.phoneNumber ? "bg-emerald-50" : "bg-white"}`}
                >
                  <Avatar name={conversation.contactName} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black text-slate-950">{conversation.contactName}</span>
                    <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">+{conversation.phoneNumber}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">{conversation.lastMessageText || "No message preview"}</span>
                    <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-black ${conversation.canReply ? (conversation.whatsapp?.expiring_soon ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700") : "bg-slate-100 text-slate-500"}`}>
                      {windowLabel(conversation)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <main className="flex min-h-0 min-w-0 flex-col bg-[#f7f3e7]">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-teal-900/10 bg-teal-900 px-5 text-white">
              <div className="min-w-0">
                <div className="truncate text-lg font-black">{selected?.contactName || "No conversation selected"}</div>
                {selected ? <div className="text-xs font-semibold text-emerald-100">+{selected.phoneNumber}</div> : null}
              </div>
              {selected ? <Badge text={windowLabel(selected)} tone={selected.canReply && !selected.whatsapp?.expiring_soon ? "green" : "amber"} /> : null}
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
              {!selected ? (
                <div className="grid h-full place-items-center">
                  <div className="max-w-sm text-center">
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-white text-emerald-700 shadow-sm">
                      <MessageCircle size={24} />
                    </div>
                    <div className="mt-4 text-lg font-black text-slate-950">No conversation selected</div>
                    <p className="mt-1 text-sm leading-6 text-slate-500">Incoming WhatsApp replies and sent template records will show here after the webhook starts receiving events.</p>
                  </div>
                </div>
              ) : (
                selected.messages.map((message) => (
                  <div key={message.id} className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[78%] whitespace-pre-line rounded-lg px-4 py-3 text-sm leading-6 shadow-md ${message.direction === "outbound" ? "bg-white text-slate-800 shadow-slate-300/50" : "bg-teal-900 text-white shadow-teal-950/20"}`}>
                      <div>{message.text}</div>
                      {message.messageType === "template" && message.templateName ? (
                        <div className={`mt-2 text-[11px] font-semibold ${message.direction === "outbound" ? "text-emerald-600" : "text-teal-100"}`}>{message.templateName}</div>
                      ) : null}
                      <div className={`mt-1 text-[11px] ${message.direction === "outbound" ? "text-slate-400" : "text-teal-100"}`}>{message.status} · {new Date(message.createdAt).toLocaleString()}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="shrink-0 border-t border-slate-200 bg-white p-3">
              {selected ? (
                <div className={`mb-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold ${selected.canReply ? (selected.whatsapp?.expiring_soon ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800") : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                  <Clock3 size={14} />
                  <span>{windowDescription(selected)}</span>
                </div>
              ) : null}
              <div className="flex gap-2">
                <input
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  disabled={!selected?.canReply}
                  placeholder={selected?.canReply ? "Type a reply..." : "24-hour window closed. Send a template instead."}
                  className="min-h-11 flex-1 rounded-lg border border-slate-200 px-4 text-sm outline-none focus:border-emerald-500 disabled:bg-slate-50"
                />
                <button disabled={!selected?.canReply || sendingReply || !reply.trim()} onClick={sendReply} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-teal-900 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                  <Send size={16} />
                  Reply
                </button>
                {selected && !selected.canReply ? (
                  <button onClick={prepareTemplateForSelectedContact} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white">
                    <Bot size={16} />
                    Template
                  </button>
                ) : null}
              </div>
            </div>
          </main>

          <aside className="hidden min-h-0 overflow-y-auto border-l border-slate-200 bg-white p-4 xl:block">
            <div className="rounded-lg bg-gradient-to-b from-emerald-50 to-white p-4 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white text-xl font-black text-emerald-700 shadow-sm">
                {initials(selected?.contactName || "?")}
              </div>
              <div className="mt-3 text-lg font-black text-slate-950">{selected?.contactName || "Contact"}</div>
              <div className="mt-1 text-sm font-semibold text-slate-500">{selected ? `+${selected.phoneNumber}` : "-"}</div>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <ProfileRow label="WhatsApp window" value={selected ? windowDescription(selected) : "-"} />
              <ProfileRow label="Matched LMS user" value={selected?.matchedUser?.name || "Not matched"} />
              <ProfileRow label="Role" value={selected?.matchedUser?.role || "-"} />
              <ProfileRow label="Templates sent" value={String(selected?.sentTemplateCount || 0)} />
              <ProfileRow label="Closes at" value={selected?.activeUntil ? new Date(selected.activeUntil).toLocaleString() : "No customer reply recorded"} />
              <ProfileRow label="Latest customer reply" value={selected?.lastInboundAt ? new Date(selected.lastInboundAt).toLocaleString() : "-"} />
            </div>
          </aside>
        </section>
      )}
    </div>
  );
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="p-4">
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-white text-slate-400 shadow-sm">
          <MessageCircle size={18} />
        </div>
        <div className="mt-3 text-sm font-black text-slate-800">{title}</div>
        <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
      </div>
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

function Field({ label, value, onChange, listId }: { label: string; value: string; onChange: (value: string) => void; listId?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <input list={listId} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500" />
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

function formatRemaining(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  if (safeSeconds <= 0) return "closed";
  if (safeSeconds < 60) return `${safeSeconds}s`;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.ceil((safeSeconds % 3600) / 60);
  if (hours > 0) return minutes >= 60 ? `${hours + 1}h` : minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

function withLiveWindow(conversation: Conversation, now: number): Conversation {
  const expiry = conversation.whatsapp?.window_expires_at ? new Date(conversation.whatsapp.window_expires_at).getTime() : 0;
  const remainingSeconds = expiry ? Math.max(0, Math.floor((expiry - now) / 1000)) : 0;
  const windowOpen = remainingSeconds > 0;
  return {
    ...conversation,
    canReply: windowOpen,
    whatsapp: conversation.whatsapp
      ? {
          ...conversation.whatsapp,
          window_open: windowOpen,
          expiring_soon: windowOpen && remainingSeconds <= 2 * 60 * 60,
          remaining_seconds: remainingSeconds,
          free_form_allowed: windowOpen,
          template_required: !windowOpen,
        }
      : conversation.whatsapp,
  };
}

function windowLabel(conversation: Conversation) {
  if (!conversation.canReply) return "Closed · 24h window";
  return `${conversation.whatsapp?.expiring_soon ? "Closing soon" : "Open"} · ${formatRemaining(conversation.whatsapp?.remaining_seconds || 0)} left`;
}

function windowDescription(conversation: Conversation) {
  if (!conversation.canReply) return "Closed · 24-hour window ended. The customer must reply again before a free-form message can be sent.";
  return `${conversation.whatsapp?.expiring_soon ? "Closing soon" : "Open"} · ${formatRemaining(conversation.whatsapp?.remaining_seconds || 0)} remaining from the latest customer reply.`;
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm shadow-slate-100">
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
