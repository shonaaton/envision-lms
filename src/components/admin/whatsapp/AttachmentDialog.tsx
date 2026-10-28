"use client";
import { useEffect, useRef, useState } from "react";
import WorkspaceDialog from "./WorkspaceDialog";

export default function AttachmentDialog({ phone, actorId, onClose, onSent }: { phone: string; actorId: string; onClose: () => void; onSent: (phone: string) => void }) {
  const [file, setFile] = useState<File | null>(null), [caption, setCaption] = useState(""), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [unknown, setUnknown] = useState(false);
  const lock = useRef(false), previous = useRef<any>(null);
  const storageKey = `wa-attachment-request:${actorId}:${phone}`;
  useEffect(() => { try { const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null"); if (saved?.requestId) { previous.current = saved; setCaption(saved.caption || ""); setUnknown(true); setError(`Reselect ${saved.filename} to check the previous send, or review delivery in the inbox.`); } } catch { /* Storage may be disabled. */ } }, [storageKey]);
  function clearCheck() { previous.current = null; setUnknown(false); try { sessionStorage.removeItem(storageKey); } catch { /* Storage may be disabled. */ } }
  async function send() {
    if (!file || lock.current) return;
    if (file.size > 10 * 1024 * 1024) { setError("Files must be 10 MB or smaller; images must be 5 MB or smaller."); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      if (previous.current && (previous.current.hash !== hash || previous.current.filename !== file.name || previous.current.caption !== caption)) throw new Error("Reselect the original file with the original caption to check its result, or clear the check after reviewing delivery.");
      const request = previous.current || { requestId: crypto.randomUUID(), hash, filename: file.name, caption };
      previous.current = request; try { sessionStorage.setItem(storageKey, JSON.stringify(request)); } catch { /* The in-memory reservation remains. */ }
      const form = new FormData(); form.set("file", file); form.set("phoneNumber", phone); form.set("caption", caption); form.set("requestId", request.requestId);
      const response = await fetch("/api/admin/whatsapp/media/send", { method: "POST", body: form, signal: AbortSignal.timeout(70_000) });
      const payload = await response.json();
      if (!response.ok || payload.ok !== true) { setUnknown(Boolean(payload.uncertain || payload.retryable === false)); if (!payload.uncertain && payload.retryable !== false) clearCheck(); throw new Error(payload.error || "Could not send attachment."); }
      clearCheck(); onSent(phone); onClose();
    } catch (err) { if (previous.current) setUnknown(true); setError(err instanceof Error ? err.message : "Send result is unconfirmed. Check delivery before sending again."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <WorkspaceDialog title="Send attachment" onClose={onClose}><div className="space-y-4"><p className="text-sm text-slate-600">Send to +{phone}. JPEG and PNG images: up to 5 MB. PDF, PGN and text files: up to 10 MB.</p><label className="block rounded-lg border border-dashed p-4 text-sm font-semibold">Choose attachment<input aria-label="Choose WhatsApp attachment" type="file" accept=".jpg,.jpeg,.png,.pdf,.pgn,.txt" disabled={busy} onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-2 block w-full text-sm" /></label>{file ? <p className="text-sm">{file.name} · {(file.size / 1024).toFixed(1)} KB</p> : null}<label className="block text-sm font-semibold">Caption (optional)<textarea aria-label="Attachment caption" rows={3} maxLength={1024} disabled={busy} value={caption} onChange={(event) => setCaption(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 !text-base" /></label>{error ? <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p> : null}{unknown ? <p className="text-sm text-amber-800">An earlier send is unconfirmed. <button type="button" disabled={busy} onClick={clearCheck} className="font-bold underline">I’ve checked delivery</button></p> : null}<button type="button" disabled={!file || busy} onClick={() => void send()} className="rounded-lg bg-teal-900 px-4 py-2 font-bold text-white disabled:opacity-40">{busy ? "Sending…" : unknown ? "Check attachment result" : "Send attachment"}</button></div></WorkspaceDialog>;
}
