"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { TEMPLATE_LANGUAGES, validateTemplateDraft, variablePositions, type LibraryTemplate, type TemplateDraft } from "@/lib/whatsappTemplateRules";
import TemplatePreview from "./TemplatePreview";

const emptyDraft = (): TemplateDraft => ({ name: "", language: "en", category: "UTILITY", body: "", header: "", footer: "", variables: [], buttons: [] });
const fieldClass = "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 !text-base outline-none focus:border-emerald-600 md:!text-sm";
export function templateStatusClass(status: string) {
  return status === "APPROVED" ? "bg-emerald-100 text-emerald-800" : ["REJECTED", "SUBMISSION_FAILED", "DISABLED", "PAUSED"].includes(status) ? "bg-rose-100 text-rose-800" : ["PENDING", "SUBMITTING", "SUBMISSION_UNKNOWN"].includes(status) ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600";
}

export default function TemplateManager({ canManage, onUse }: { canManage: boolean; onUse: (template: LibraryTemplate) => void }) {
  const [templates, setTemplates] = useState<LibraryTemplate[]>([]);
  const [selected, setSelected] = useState<LibraryTemplate | null>(null);
  const [draft, setDraft] = useState<TemplateDraft>(emptyDraft);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [connectionReady, setConnectionReady] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const operationLock = useRef(false);
  const selectedId = useRef("");
  const selectedRef = useRef<LibraryTemplate | null>(null);
  const dirtyRef = useRef(false);
  const dirty = Boolean(selected) && JSON.stringify(draft) !== savedSnapshot;
  const editable = canManage && (!selected || ["DRAFT", "SUBMISSION_FAILED"].includes(selected.status));
  selectedRef.current = selected;
  dirtyRef.current = dirty;

  const edit = useCallback((template: LibraryTemplate, clearNotice = true) => {
    const values: TemplateDraft = { name: template.name, language: template.language, category: template.category, body: template.body, header: template.header || "", footer: template.footer || "", variables: template.variables.map(({ position, key, sample }) => ({ position, key, sample })), buttons: template.buttons || [] };
    selectedId.current = template.id; selectedRef.current = template; dirtyRef.current = false;
    setSelected(template); setDraft(values); setSavedSnapshot(JSON.stringify(values)); if (clearNotice) setNotice("");
  }, []);

  const refresh = useCallback(async (sync = true) => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/whatsapp/templates/library${sync ? "?sync=1" : ""}`, { cache: "no-store", signal: request.signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load templates.");
      if (request.signal.aborted || controller.current !== request) return;
      setTemplates(payload.templates || []); setConnectionReady(Boolean(payload.connectionReady));
      const current = selectedRef.current;
      const updated = payload.templates?.find((item: LibraryTemplate) => item.id === current?.id);
      if (current && updated) {
        if (dirtyRef.current && ["DRAFT", "SUBMISSION_FAILED"].includes(current.status) && ["DRAFT", "SUBMISSION_FAILED"].includes(updated.status)) {
          // Keep the original revision with unsaved edits. Adopting a newer
          // revision here would let this editor overwrite another staff edit.
          if (updated.revision !== current.revision) setNotice("This draft changed elsewhere. Reload it from the template list before saving.");
        } else edit(updated, false);
      }
      if (payload.syncError) setNotice(payload.syncError);
    } catch (error) { if (!request.signal.aborted) setNotice(error instanceof Error ? error.message : "Could not refresh templates."); }
    finally { if (!request.signal.aborted) setLoading(false); }
  }, [edit]);
  useEffect(() => { void refresh(); const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(true); }, 60_000); return () => { window.clearInterval(interval); controller.current?.abort(); }; }, [refresh]);

  function newDraft() { selectedId.current = ""; selectedRef.current = null; setSelected(null); setDraft(emptyDraft()); setSavedSnapshot(""); setNotice(""); }
  function copy(template: LibraryTemplate) { edit(template); selectedId.current = ""; selectedRef.current = null; setSelected(null); setDraft((current) => ({ ...current, name: `${current.name.slice(0, 490)}_copy` })); setSavedSnapshot(""); }
  function updateBody(body: string) { setDraft((current) => ({ ...current, body, variables: variablePositions(body).map((position) => current.variables.find((item) => item.position === position) || { position, key: `value_${position}`, sample: "" }) })); }

  async function save() {
    if (operationLock.current) return;
    const validated = validateTemplateDraft(draft);
    if (!validated.draft) { setNotice(validated.error || "Check the template fields."); return; }
    operationLock.current = true; setBusy("save"); setNotice("");
    try {
      const response = await fetch("/api/admin/whatsapp/templates/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...validated.draft, ...(selected ? { id: selected.id, revision: selected.revision } : {}) }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Could not save draft.");
      edit(payload.template); setNotice("Draft saved. Review the preview, then submit it to Meta."); await refresh(false);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save draft."); }
    finally { operationLock.current = false; setBusy(""); }
  }
  async function submit() {
    if (!selected || dirty || operationLock.current) return;
    operationLock.current = true;
    const id = selected.id; setBusy("submit"); setNotice("");
    try {
      const response = await fetch(`/api/admin/whatsapp/templates/library/${id}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: selected.revision }), signal: AbortSignal.timeout(30_000) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Submission could not be confirmed. Refresh Meta status.");
      if (selectedId.current === id) edit(payload.template);
      setNotice(payload.message || "Submitted to Meta for review.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Submission could not be confirmed. Refresh Meta status before trying again."); }
    finally { operationLock.current = false; setBusy(""); await refresh(false); }
  }
  async function deleteDraft() {
    if (!selected || operationLock.current) return;
    operationLock.current = true; setBusy("delete");
    try { const response = await fetch(`/api/admin/whatsapp/templates/library/${selected.id}`, { method: "DELETE" }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); newDraft(); await refresh(false); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not delete draft."); }
    finally { operationLock.current = false; setBusy(""); }
  }
  const visible = templates.filter((template) => (filter === "ALL" || template.status === filter) && `${template.name} ${template.body}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Message templates</h2><p className="mt-1 text-sm text-slate-500">Draft a message, submit it to Meta, then use it once approved.</p></div><div className="flex gap-2"><button type="button" disabled={loading} onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} />Refresh Meta status</button>{canManage ? <button type="button" onClick={newDraft} className="inline-flex items-center gap-2 rounded-lg bg-teal-900 px-3 py-2 text-sm font-bold text-white"><Plus size={15} />New template</button> : null}</div></div>
    {!connectionReady ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Meta connection is unavailable. Drafts can be saved; submission needs the business account and access token configured on the server.</p> : null}
    {notice ? <p role="status" className="mt-3 rounded-lg bg-slate-100 p-3 text-sm">{notice}</p> : null}
    <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside><input aria-label="Search message templates" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search templates" className={fieldClass} /><select aria-label="Filter template status" value={filter} onChange={(event) => setFilter(event.target.value)} className={fieldClass}>{["ALL", "DRAFT", "PENDING", "APPROVED", "REJECTED", "PAUSED", "DISABLED", "SUBMISSION_FAILED", "SUBMISSION_UNKNOWN"].map((status) => <option key={status}>{status}</option>)}</select>
        <div className="mt-3 max-h-[680px] space-y-2 overflow-y-auto">{visible.map((template) => <button key={template.id} type="button" onClick={() => edit(template)} className={`w-full rounded-lg border p-3 text-left ${selected?.id === template.id ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}><span className="block truncate text-sm font-bold">{template.name}</span><span className="mt-1 block text-xs text-slate-500">{template.language} · {template.category}</span><span className={`mt-2 inline-block rounded-full px-2 py-1 text-[11px] font-semibold ${templateStatusClass(template.status)}`}>{template.status.replace(/_/g, " ")}</span></button>)}{!loading && !visible.length ? <p className="py-8 text-center text-sm text-slate-500">No templates in this view.</p> : null}</div>
      </aside>
      <div className="min-w-0"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{selected ? selected.name : "Create a template"}</h3>{selected ? <span className={`rounded-full px-3 py-1 text-xs font-bold ${templateStatusClass(selected.status)}`}>{selected.status.replace(/_/g, " ")}</span> : null}</div>
        {selected?.rejectionReason ? <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">Meta’s reason: {selected.rejectionReason}</p> : null}{selected?.submissionError ? <p role="alert" className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{selected.submissionError}</p> : null}
        {selected?.lastSyncedAt ? <p className="mb-3 text-xs text-slate-500">Status checked {new Date(selected.lastSyncedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p> : null}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(260px,1fr)]"><fieldset disabled={!editable || Boolean(busy)} className="min-w-0 space-y-3 disabled:opacity-80">
          <label className="block text-sm font-semibold">Template name<input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="class_schedule_update" className={fieldClass} /></label>
          <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold">Language<select aria-label="Template language" value={draft.language} onChange={(event) => setDraft((current) => ({ ...current, language: event.target.value }))} className={fieldClass}>{TEMPLATE_LANGUAGES.map(([code, label]) => <option value={code} key={code}>{label}</option>)}</select></label><label className="text-sm font-semibold">Category<select aria-label="Template category" value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as TemplateDraft["category"] }))} className={fieldClass}><option value="UTILITY">Utility</option><option value="MARKETING">Marketing</option></select></label></div>
          <p className="text-xs text-slate-500">Utility: updates about an existing class, account or payment. Marketing: announcements, promotions and offers.</p>
          <label className="block text-sm font-semibold">Header (optional)<input maxLength={60} value={draft.header} onChange={(event) => setDraft((current) => ({ ...current, header: event.target.value }))} className={fieldClass} /></label>
          <label className="block text-sm font-semibold">Message body<textarea aria-label="Template message body" rows={7} maxLength={1024} value={draft.body} onChange={(event) => updateBody(event.target.value)} placeholder="Hello {{1}}, your class starts at {{2}}. See you there!" className={fieldClass} /></label><p className="text-right text-xs text-slate-400">{draft.body.length}/1024</p>
          {draft.variables.map((variable, index) => <div key={variable.position} className="rounded-lg bg-slate-50 p-3"><div className="mb-2 text-xs font-bold">{`Variable {{${variable.position}}}`}</div><label className="block text-xs">Field label<input value={variable.key} onChange={(event) => setDraft((current) => ({ ...current, variables: current.variables.map((item, i) => i === index ? { ...item, key: event.target.value } : item) }))} className={fieldClass} /></label><label className="mt-2 block text-xs">Example for Meta review<input aria-label={`Example for variable ${variable.position}`} value={variable.sample} onChange={(event) => setDraft((current) => ({ ...current, variables: current.variables.map((item, i) => i === index ? { ...item, sample: event.target.value } : item) }))} placeholder={variable.position === 1 ? "Aarav" : "Wednesday, 6:00 PM"} className={fieldClass} /></label></div>)}
          <label className="block text-sm font-semibold">Footer (optional)<input maxLength={60} value={draft.footer} onChange={(event) => setDraft((current) => ({ ...current, footer: event.target.value }))} className={fieldClass} /></label>
          <div className="space-y-2"><div className="flex items-center justify-between"><span className="text-sm font-semibold">Buttons (optional)</span><button type="button" disabled={draft.buttons.length >= 3} onClick={() => setDraft((current) => ({ ...current, buttons: [...current.buttons, { type: "URL", text: "", url: "" }] }))} className="text-xs font-bold text-teal-800 disabled:opacity-40">+ Add button</button></div>{draft.buttons.map((button, index) => <div key={index} className="rounded-lg border p-3"><div className="flex gap-2"><select aria-label={`Button ${index + 1} type`} value={button.type} onChange={(event) => setDraft((current) => ({ ...current, buttons: current.buttons.map((item, i) => i === index ? { type: event.target.value as any, text: item.text } : item) }))} className={fieldClass}><option value="URL">Website</option><option value="PHONE_NUMBER">Phone</option><option value="QUICK_REPLY">Quick reply</option></select><button type="button" aria-label={`Remove button ${index + 1}`} onClick={() => setDraft((current) => ({ ...current, buttons: current.buttons.filter((_, i) => i !== index) }))}><Trash2 size={16} /></button></div><input aria-label={`Button ${index + 1} label`} value={button.text} maxLength={25} onChange={(event) => setDraft((current) => ({ ...current, buttons: current.buttons.map((item, i) => i === index ? { ...item, text: event.target.value } : item) }))} placeholder="Button label" className={fieldClass} />{button.type !== "QUICK_REPLY" ? <input aria-label={`Button ${index + 1} destination`} value={button.type === "URL" ? button.url || "" : button.phone_number || ""} onChange={(event) => setDraft((current) => ({ ...current, buttons: current.buttons.map((item, i) => i === index ? { ...item, [button.type === "URL" ? "url" : "phone_number"]: event.target.value } : item) }))} placeholder={button.type === "URL" ? "https://envisionchessacademy.com" : "+919999999999"} className={fieldClass} /> : null}</div>)}</div>
        </fieldset><div className="min-w-0"><TemplatePreview template={draft} />{selected?.unsupportedReason ? <p className="mt-3 text-sm text-amber-800">{selected.unsupportedReason}</p> : null}</div></div>
        <div className="mt-5 flex flex-wrap gap-2">{editable ? <><button type="button" disabled={Boolean(busy)} onClick={() => void save()} className="rounded-lg border border-teal-900 px-4 py-2 text-sm font-bold text-teal-900 disabled:opacity-50">{busy === "save" ? "Saving…" : "Save draft"}</button><button type="button" disabled={!selected || dirty || Boolean(busy) || !connectionReady} onClick={() => void submit()} className="inline-flex items-center gap-2 rounded-lg bg-teal-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"><Send size={15} />{busy === "submit" ? "Submitting…" : "Submit to Meta"}</button>{selected ? <button type="button" disabled={Boolean(busy)} onClick={() => void deleteDraft()} className="rounded-lg px-3 py-2 text-sm text-rose-700">Delete draft</button> : null}</> : null}
          {selected && canManage ? <button type="button" onClick={() => copy(selected)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold"><Copy size={15} />Copy and revise</button> : null}{selected?.sendable ? <button type="button" onClick={() => onUse(selected)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white">Use approved template</button> : null}</div>
        {dirty ? <p className="mt-2 text-xs text-amber-800">Save your changes before submitting.</p> : null}{selected && !editable && !selected.sendable ? <p className="mt-3 text-sm text-slate-500">Templates can be used after Meta approves them. To change this version, copy it into a new draft.</p> : null}
      </div>
    </div>
  </section>;
}
