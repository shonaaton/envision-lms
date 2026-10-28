"use client";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Send, Sparkles, ToggleLeft, ToggleRight } from "lucide-react";
import { WHATSAPP_TEMPLATE_DEFINITIONS, type WhatsAppTemplateDefinition } from "@/lib/whatsappTemplateRegistry";
import WhatsAppInbox from "./whatsapp/WhatsAppInbox";
import TemplateSendDialog from "./whatsapp/TemplateSendDialog";
import type { LibraryTemplate } from "@/lib/whatsappTemplateRules";
const TemplateManager = lazy(() => import("./whatsapp/TemplateManager"));
const BroadcastCentre = lazy(() => import("./whatsapp/BroadcastCentre"));
type RecipientMode = "manual" | "coaches" | "students" | "users";
type WhatsAppAdminTemplateDefinition = WhatsAppTemplateDefinition & {
  automationEnabled?: boolean;
  metaStatus?: string;
  metaCategory?: string;
  metaLanguage?: string;
  metaSynced?: boolean;
  requiredByLms?: boolean;
};
type TemplateAuditPayload = {
  ok?: boolean;
  source?: "local" | "meta";
  message?: string;
  requiredTemplateCount?: number;
  approvedRequiredCount?: number;
  metaTemplateCount?: number;
  missingApprovedTemplates?: WhatsAppAdminTemplateDefinition[];
};


function sendErrorText(value: any) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return String(value.message || value.error_user_msg || value.error || JSON.stringify(value));
}


export default function WhatsAppWorkspace({ initialPhoneNumber = "", actorId = "staff", role = "admin", canManage = true }: { initialPhoneNumber?: string; actorId?: string; role?: string; canManage?: boolean }) {
  const [tab, setTab] = useState<"inbox" | "automation" | "templates" | "broadcasts">("inbox");
  const [templateForSend, setTemplateForSend] = useState<LibraryTemplate | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [templateName, setTemplateName] = useState("hello_world_2");
  const [language, setLanguage] = useState("en");
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("manual");
  const [recipients, setRecipients] = useState("");
  const [templateVariables, setTemplateVariables] = useState("");
  const [templates, setTemplates] = useState<WhatsAppAdminTemplateDefinition[]>([...WHATSAPP_TEMPLATE_DEFINITIONS]);
  const [templateAudit, setTemplateAudit] = useState<TemplateAuditPayload>({});
  const [savingTemplateName, setSavingTemplateName] = useState("");
  const [notice, setNotice] = useState("");
  const [templateResults, setTemplateResults] = useState<any[]>([]);
  const [sendingTemplate, setSendingTemplate] = useState(false);
  const [unconfirmedTemplate, setUnconfirmedTemplate] = useState(false);
  const templateLock = useRef(false);
  const templateRequest = useRef<Record<string, unknown> | null>(null);
  const templateStorageKey = `whatsapp-template-request-v1:${actorId}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(templateStorageKey) || "null");
      if (saved && typeof saved.requestId === "string") { templateRequest.current = saved; setUnconfirmedTemplate(true); }
    } catch { /* In-memory request checks still work when storage is disabled. */ }
  }, [templateStorageKey]);
  useEffect(() => {
    if (role === "instructor") return;
    const controller = new AbortController();
    void fetch("/api/admin/whatsapp/templates", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load templates.");
      if (Array.isArray(payload.templates) && payload.templates.length) setTemplates(payload.templates);
      setTemplateAudit(payload);
    }).catch((error) => { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "Could not load templates."); });
    return () => controller.abort();
  }, [role]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 8000); return () => window.clearTimeout(timer); }, [notice]);
  const selectedTemplateDefinition = useMemo(() => findTemplateDefinition(templates, templateName), [templates, templateName]);
  const orderedTemplateVariables = useMemo(() => templateVariables.trim() ? templateVariables.split(/\r?\n/).map((item) => item.trim()) : [], [templateVariables]);
  const templateGroups = useMemo(() => templates.reduce<Record<string, WhatsAppAdminTemplateDefinition[]>>((groups, template) => { const key = template.sourceAutomation || "Manual"; (groups[key] ||= []).push(template); return groups; }, {}), [templates]);
  const enabledTemplateCount = templates.filter((template) => template.automationEnabled !== false).length;
  const missingApprovedTemplates = templateAudit.missingApprovedTemplates || [];
  const approvedRequiredCount = templateAudit.approvedRequiredCount ?? templates.filter((template) => template.requiredByLms && template.metaStatus === "APPROVED").length;
  const requiredTemplateCount = templateAudit.requiredTemplateCount ?? templates.filter((template) => template.requiredByLms !== false).length;
  function updateTemplateName(value: string) {
    setTemplateName(value);
    const definition = findTemplateDefinition(templates, value);
    if (!definition) return;
    setLanguage(definition.language);
    setTemplateVariables(templateSampleValues(definition).join("\n"));
  }

  function selectAutomationTemplate(name: string) {
    const definition = findTemplateDefinition(templates, name);
    if (!definition) return;
    const variables = templateSampleValues(definition);
    setTemplateName(definition.name);
    setLanguage(definition.language);
    setTemplateVariables(variables.join("\n"));
  }

  async function toggleTemplateAutomation(templateName: string, enabled: boolean) {
    const previousTemplates = templates;
    setNotice("");
    setSavingTemplateName(templateName);
    setTemplates((current) => current.map((template) => template.name === templateName ? { ...template, automationEnabled: enabled } : template));
    try {
      const res = await fetch("/api/admin/whatsapp/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateName, enabled }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.error) throw new Error(payload.error || "Could not save WhatsApp automation setting.");
      setTemplates((current) => current.map((template) => template.name === templateName ? { ...template, automationEnabled: payload.automationEnabled !== false } : template));
      setNotice(`${templateName} automatic WhatsApp trigger switched ${payload.automationEnabled === false ? "off" : "on"}.`);
    } catch (error) {
      setTemplates(previousTemplates);
      setNotice(error instanceof Error ? error.message : "Could not save WhatsApp automation setting.");
    } finally {
      setSavingTemplateName("");
    }
  }


  async function sendTemplate() {
    if (templateLock.current) return;
    const numbers = recipients.split(/[\s,]+/).map((number) => number.trim()).filter(Boolean);
    if (!templateRequest.current && recipientMode === "manual" && !numbers.length) { setNotice("Choose at least one recipient before sending."); return; }
    if (!templateRequest.current && selectedTemplateDefinition && (orderedTemplateVariables.length !== selectedTemplateDefinition.variables.length || orderedTemplateVariables.some((value) => !value))) { setNotice("Fill every template variable in the displayed order."); return; }
    const request = templateRequest.current || { requestId: crypto.randomUUID(), templateName, language, recipientGroup: recipientMode, recipients: recipientMode === "manual" ? numbers : [], templateVariables: orderedTemplateVariables };
    templateRequest.current = request;
    try { sessionStorage.setItem(templateStorageKey, JSON.stringify(request)); } catch { /* Retain the in-memory reservation. */ }
    templateLock.current = true;
    setSendingTemplate(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/whatsapp/template", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(40_000) });
      const payload = await response.json();
      const results = payload.results || [];
      setTemplateResults(results);
      const accepted = results.filter((item: any) => item.ok).length;
      const failed = results.filter((item: any) => !item.ok).length;
      const uncertain = Boolean(payload.uncertain || payload.retryable === false);
      setUnconfirmedTemplate(uncertain);
      if (!uncertain) { templateRequest.current = null; try { sessionStorage.removeItem(templateStorageKey); } catch { /* Storage may be unavailable. */ } }
      setNotice(response.ok && payload.ok !== false ? accepted + " recipients: accepted or queued. Delivery updates appear in the inbox." : payload.error || accepted + " accepted, " + failed + " failed. " + sendErrorText(results.find((item: any) => !item.ok)?.error));
      setRefreshKey((value) => value + 1);
    } catch {
      setUnconfirmedTemplate(true);
      setNotice("Connection interrupted. Use Check send result to check the same request without sending it twice.");
    } finally {
      templateLock.current = false;
      setSendingTemplate(false);
    }
  }
  return <div className="min-h-0 min-w-0 text-slate-950">
    <div className="mb-3 flex items-center justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-widest text-emerald-700">WhatsApp</div><h1 className="text-2xl font-bold">WhatsApp Inbox</h1></div><button type="button" aria-label="Refresh inbox" onClick={() => setRefreshKey((value) => value + 1)} className="rounded-lg border bg-white p-3 text-slate-600"><RefreshCw size={17} /></button></div>
    <div className="mb-3 flex gap-2 overflow-x-auto pb-1">{([['inbox', 'Inbox'], ['templates', 'Message templates'], ...(canManage ? [['broadcasts', 'Broadcast centre']] : []), ...(role !== "instructor" ? [['automation', 'Template Automation']] : [])] as [typeof tab, string][]).map(([value, label]) => <button type="button" key={value} onClick={() => setTab(value)} aria-pressed={tab === value} className={`shrink-0 rounded-lg px-4 py-2 text-sm font-bold ${tab === value ? "bg-teal-900 text-white" : "border bg-white"}`}>{label}</button>)}</div>
    <div className={tab === "inbox" ? "" : "hidden"}><WhatsAppInbox initialPhoneNumber={initialPhoneNumber} actorId={actorId} canManage={canManage} refreshKey={refreshKey} active={tab === "inbox"} /></div>
    {tab === "templates" ? <Suspense fallback={<p className="p-5 text-sm text-slate-500">Loading template manager…</p>}><TemplateManager canManage={canManage} onUse={setTemplateForSend} /></Suspense> : null}
    {tab === "broadcasts" && canManage ? <Suspense fallback={<p className="p-5 text-sm text-slate-500">Loading broadcasts…</p>}><BroadcastCentre /></Suspense> : null}
    {templateForSend ? <TemplateSendDialog phone="" actorId={actorId} initialTemplate={templateForSend} onClose={() => setTemplateForSend(null)} onSent={() => { setRefreshKey((current) => current + 1); setNotice("Template accepted for sending."); }} /> : null}
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
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <AutomationStat label="Templates" value={String(templates.length)} />
            <AutomationStat label="Automatic on" value={String(enabledTemplateCount)} tone="green" />
            <AutomationStat label="Automatic off" value={String(templates.length - enabledTemplateCount)} tone="slate" />
            <AutomationStat label="Missing in Meta" value={String(missingApprovedTemplates.length)} tone={missingApprovedTemplates.length ? "amber" : "green"} />
          </div>
          <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${missingApprovedTemplates.length ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-100 bg-emerald-50 text-emerald-900"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-black">
                {templateAudit.source === "meta"
                  ? `${approvedRequiredCount}/${requiredTemplateCount} LMS automation templates are approved in Meta.`
                  : "Meta template approval status is not available from this environment."}
              </span>
              {typeof templateAudit.metaTemplateCount === "number" ? <span className="text-xs font-black uppercase tracking-[0.12em]">{templateAudit.metaTemplateCount} Meta templates found</span> : null}
            </div>
            {templateAudit.message ? <p className="mt-1 leading-5">{templateAudit.message}</p> : null}
            {missingApprovedTemplates.length ? (
              <div className="mt-3 flex max-h-28 flex-wrap gap-2 overflow-y-auto">
                {missingApprovedTemplates.map((template) => (
                  <button
                    key={`${template.name}-${template.language}`}
                    type="button"
                    onClick={() => selectAutomationTemplate(template.name)}
                    className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-black text-amber-800 shadow-sm"
                    title={`Load ${template.name}`}
                  >
                    {template.name} · {template.metaStatus || "MISSING"}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <datalist id="whatsapp-template-options">
            {templates.map((template) => (
              <option key={template.name} value={template.name}>
                {template.sourceAutomation}
              </option>
            ))}
          </datalist>
          <div className="mt-4">
            <div className="mb-3 flex flex-wrap gap-2">
              <RecipientModeButton active={recipientMode === "manual"} label="Enter numbers" onClick={() => setRecipientMode("manual")} />
              <RecipientModeButton active={recipientMode === "coaches"} label="All coaches" onClick={() => setRecipientMode("coaches")} />
              <RecipientModeButton active={recipientMode === "students"} label="All students" onClick={() => setRecipientMode("students")} />
              <RecipientModeButton active={recipientMode === "users"} label="All users" onClick={() => setRecipientMode("users")} />
            </div>
            {recipientMode === "manual" ? (
              <Field label="Recipients" value={recipients} onChange={setRecipients} />
            ) : (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                This send will go to every active {recipientMode === "users" ? "user" : recipientMode.slice(0, -1)} with a saved phone number.
              </div>
            )}
          </div>
          <div className="mt-5">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">WhatsApp automation controls</h3>
                <p className="mt-1 text-sm text-slate-500">Switch automatic triggers on or off, then load any template for a manual send.</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{templates.length} templates</span>
            </div>
            <div className="max-h-[430px] space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
              {Object.entries(templateGroups).map(([groupName, groupedTemplates]) => (
                <div key={groupName} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500">{groupName}</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {groupedTemplates.map((template) => {
                      const enabled = template.automationEnabled !== false;
                      return (
                        <div
                          key={template.name}
                          className={`flex min-h-16 items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition ${templateName === template.name ? "border-emerald-300 ring-2 ring-emerald-100" : "border-slate-200 hover:border-emerald-200"}`}
                        >
                          <button type="button" onClick={() => selectAutomationTemplate(template.name)} className="min-w-0 flex-1 text-left" title={`Load ${template.name}`}>
                            <span className="block truncate font-black text-slate-900">{template.name}</span>
                            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                              <span>{template.variables.length} variable{template.variables.length === 1 ? "" : "s"}</span>
                              <span className={`rounded-full px-2 py-0.5 font-black ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{enabled ? "Auto on" : "Auto off"}</span>
                              {template.requiredByLms !== false ? <span className={templateStatusClass(template.metaStatus)}>{templateStatusLabel(template.metaStatus)}</span> : null}
                            </span>
                          </button>
                          <button
                            type="button"
                            disabled={savingTemplateName === template.name}
                            onClick={() => void toggleTemplateAutomation(template.name, !enabled)}
                            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-black transition disabled:cursor-wait disabled:opacity-60 ${enabled ? "bg-emerald-600 text-white" : "border border-slate-200 bg-white text-slate-500 hover:text-emerald-700"}`}
                            title={`${enabled ? "Switch off" : "Switch on"} automatic WhatsApp trigger`}
                          >
                            {enabled ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}
                            {enabled ? "On" : "Off"}
                          </button>
                        </div>
                      );
                    })}
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
          {unconfirmedTemplate ? <div role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">The previous send is unconfirmed. Check delivery in the inbox before starting another send. <button type="button" disabled={sendingTemplate} className="font-bold underline" onClick={() => { templateRequest.current = null; setUnconfirmedTemplate(false); try { sessionStorage.removeItem(templateStorageKey); } catch { /* Storage may be unavailable. */ } }}>Start a new send</button></div> : null}
          <button disabled={sendingTemplate} onClick={() => void sendTemplate()} className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-bold text-white shadow-sm disabled:cursor-wait disabled:opacity-50">
            <Send size={16} />
            {sendingTemplate ? "Sending…" : unconfirmedTemplate ? "Check send result" : "Send template"}
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
                        {result.ok ? (result.status || "accepted") : result.status === "unconfirmed" ? "Unconfirmed" : "Failed"}
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
    ) : null}
    {notice ? <div role="status" className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">{notice}</div> : null}
  </div>;
}

function RecipientModeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center rounded-lg px-3 text-xs font-black transition ${
        active
          ? "bg-emerald-600 text-white shadow-sm"
          : "border border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:text-emerald-700"
      }`}
    >
      {label}
    </button>
  );
}

function AutomationStat({ label, value, tone = "slate" }: { label: string; value: string; tone?: "green" | "slate" | "amber" }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${tone === "green" ? "border-emerald-100 bg-emerald-50" : tone === "amber" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
      <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-black ${tone === "green" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-slate-950"}`}>{value}</div>
    </div>
  );
}

function templateStatusLabel(status?: string) {
  const clean = String(status || "UNKNOWN").toUpperCase();
  if (clean === "APPROVED") return "Meta approved";
  if (clean === "MISSING") return "Missing in Meta";
  if (clean === "NOT_SYNCED") return "Not synced";
  if (clean === "SYNC_FAILED") return "Sync failed";
  return `Meta ${clean.toLowerCase()}`;
}

function templateStatusClass(status?: string) {
  const clean = String(status || "UNKNOWN").toUpperCase();
  if (clean === "APPROVED") return "rounded-full bg-emerald-50 px-2 py-0.5 font-black text-emerald-700";
  if (clean === "PENDING" || clean === "IN_APPEAL") return "rounded-full bg-amber-50 px-2 py-0.5 font-black text-amber-700";
  if (clean === "MISSING" || clean === "REJECTED" || clean === "PAUSED" || clean === "DISABLED") return "rounded-full bg-rose-50 px-2 py-0.5 font-black text-rose-700";
  return "rounded-full bg-slate-100 px-2 py-0.5 font-black text-slate-500";
}

function Field({ label, value, onChange, listId }: { label: string; value: string; onChange: (value: string) => void; listId?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <input list={listId} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500" />
    </label>
  );
}

function findTemplateDefinition(templates: WhatsAppAdminTemplateDefinition[], name?: string) {
  const cleanName = String(name || "").trim();
  return templates.find((template) => template.name === cleanName) || null;
}

function templateSampleValues(template: WhatsAppTemplateDefinition) {
  return (template.variables || [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((variable) => variable.sample)
    .filter(Boolean);
}
