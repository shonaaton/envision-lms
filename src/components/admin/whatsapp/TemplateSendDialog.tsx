"use client";
import { useEffect, useRef, useState } from "react";
import type { LibraryTemplate } from "@/lib/whatsappTemplateRules";
import WorkspaceDialog from "./WorkspaceDialog";
import TemplatePreview from "./TemplatePreview";

export default function TemplateSendDialog({ phone, actorId, initialTemplate, onClose, onSent }: { phone: string; actorId: string; initialTemplate?: LibraryTemplate; onClose: () => void; onSent: (phone: string) => void }) {
  const [templates, setTemplates] = useState<LibraryTemplate[]>(initialTemplate ? [initialTemplate] : []);
  const [templateId, setTemplateId] = useState(initialTemplate?.id || "");
  const [number, setNumber] = useState(phone);
  const [values, setValues] = useState<string[]>(initialTemplate?.variables.map(() => "") || []);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [unknown, setUnknown] = useState(false);
  const lock = useRef(false), requestRef = useRef<any>(null);
  const storageKey = `wa-chat-template-request:${actorId}:${phone || "manual"}`;
  const template = templates.find((item) => item.id === templateId);
  useEffect(() => {
    const controller = new AbortController();
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (saved?.requestId) { requestRef.current = saved; setNumber(saved.phoneNumber); setTemplateId(saved.templateId); setValues(saved.values); setUnknown(true); }
    } catch { /* Storage may be disabled. */ }
    void fetch("/api/admin/whatsapp/templates/library?approved=1&sync=1", { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Could not load approved templates.");
      setTemplates(payload.templates || []); if (payload.syncError) setError(payload.syncError);
    }).catch((err) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load templates."); });
    return () => controller.abort();
  }, [storageKey]);
  function clearCheck() { requestRef.current = null; setUnknown(false); try { sessionStorage.removeItem(storageKey); } catch { /* Storage may be disabled. */ } }
  async function send() {
    if (lock.current) return;
    const phoneNumber = number.replace(/\D/g, "");
    if (!requestRef.current && (!template || !/^\d{7,15}$/.test(phoneNumber) || template.variables.some((_, index) => !values[index]?.trim()))) { setError("Choose an approved template, enter an international number, and fill every field."); return; }
    const request = requestRef.current || { requestId: crypto.randomUUID(), templateId, contentVersion: template?.contentVersion, phoneNumber, values };
    requestRef.current = request; lock.current = true; setBusy(true); setError("");
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(request));
    } catch { /* The in-memory reservation still prevents duplicate clicks. */ }
    try {
      const response = await fetch("/api/admin/whatsapp/templates/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(40_000) });
      const payload = await response.json();
      if (!response.ok || payload.ok !== true) { setUnknown(Boolean(payload.uncertain || payload.retryable === false)); if (!payload.uncertain && payload.retryable !== false) clearCheck(); throw new Error(payload.error || "Could not send template."); }
      clearCheck(); onSent(request.phoneNumber); onClose();
    } catch (err) { if (err instanceof TypeError || err instanceof DOMException) setUnknown(true); setError(err instanceof Error ? err.message : "Send result is unconfirmed. Check the same request before sending again."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <WorkspaceDialog title="Send approved template" onClose={onClose}><div className="grid gap-5 md:grid-cols-2"><div className="space-y-3"><label className="block text-sm font-semibold">Recipient number<input aria-label="Template recipient number" disabled={Boolean(phone) || unknown || busy} value={number} onChange={(event) => setNumber(event.target.value)} placeholder="919999999999" className="mt-1 w-full rounded-lg border px-3 py-2 !text-base" /></label><label className="block text-sm font-semibold">Approved template<select aria-label="Approved chat template" disabled={unknown || busy} value={templateId} onChange={(event) => { setTemplateId(event.target.value); setValues(templates.find((item) => item.id === event.target.value)?.variables.map(() => "") || []); }} className="mt-1 w-full rounded-lg border px-3 py-2 !text-base"><option value="">Choose a template</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.language}</option>)}</select></label>{template?.variables.map((variable, index) => <label key={variable.position} className="block text-sm font-semibold">{variable.key || `Value ${variable.position}`}<input aria-label={`Template field ${variable.position}`} disabled={busy || unknown} value={values[index] || ""} onChange={(event) => setValues((current) => template.variables.map((_, i) => i === index ? event.target.value : current[i] || ""))} placeholder={variable.sample} className="mt-1 w-full rounded-lg border px-3 py-2 !text-base" /></label>)}{!templates.length ? <p className="text-sm text-slate-500">No approved templates are available. Create and submit one from Message templates.</p> : null}</div>{template ? <TemplatePreview template={template} values={values} /> : <div className="grid min-h-40 place-items-center rounded-xl bg-slate-50 text-sm text-slate-500">Choose a template to preview it.</div>}</div>{error ? <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p> : null}{unknown ? <p className="mt-3 text-sm text-amber-800">The previous result is unconfirmed. Check its status before resending. <button type="button" disabled={busy} onClick={clearCheck} className="font-bold underline">I’ve checked delivery</button></p> : null}<button type="button" disabled={busy || !unknown && (!template || values.some((value) => !value.trim()))} onClick={() => void send()} className="mt-4 rounded-lg bg-teal-900 px-4 py-2 font-bold text-white disabled:opacity-40">{busy ? "Sending…" : unknown ? "Check send result" : "Send template"}</button></WorkspaceDialog>;
}
