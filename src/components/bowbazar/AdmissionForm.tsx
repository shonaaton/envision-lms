"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, ImagePlus, Loader2, Upload } from "lucide-react";
import {
  ADMISSION_ACCEPT,
  ADMISSION_MAX_FILE_BYTES,
  checkAdmissionFile,
  formatKb,
  readAdmissionForm,
  type AdmissionFileKind,
} from "@/lib/branch/admissionRules";
import { cn } from "@/lib/utils";

type Prefill = { name: string; parentName: string; phone: string; email: string };
type Picked = { file: File; preview: string; note: string };

/**
 * Phone cameras take 2-5 MB pictures, and the centre keeps files under 500 KB.
 * A picture is redrawn smaller and re-encoded as JPEG until it fits, so a
 * parent never has to resize it themselves. PDFs can't be shrunk here.
 */
async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size <= ADMISSION_MAX_FILE_BYTES) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  let edge = 1600;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (blob && blob.size <= ADMISSION_MAX_FILE_BYTES) {
      return new File([blob], file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg", { type: "image/jpeg" });
    }
    edge = Math.round(edge * 0.75);
  }
  return file;
}

export default function AdmissionForm({
  token,
  prefill,
  branchLabel,
  turnstileSiteKey,
}: {
  token: string;
  prefill: Prefill;
  branchLabel: string;
  turnstileSiteKey: string;
}) {
  const previews = useRef<string[]>([]);
  const [files, setFiles] = useState<Partial<Record<AdmissionFileKind, Picked>>>({});
  const [fileErrors, setFileErrors] = useState<Partial<Record<AdmissionFileKind, string>>>({});
  const [busy, setBusy] = useState<"" | AdmissionFileKind | "send">("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  // Preview URLs are released when the form goes away.
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  async function pick(kind: AdmissionFileKind, chosen: File | undefined) {
    setFileErrors((current) => ({ ...current, [kind]: "" }));
    if (!chosen) return;
    setBusy(kind);
    try {
      const file = await shrinkImage(chosen);
      const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      // The type is read from the first bytes; a probe of the file's length (capped
      // just past the limit) lets the same rule judge the size without reading it all.
      const probe = new Uint8Array(Math.min(file.size, ADMISSION_MAX_FILE_BYTES + 1));
      probe.set(head);
      const result = checkAdmissionFile(kind, probe);
      if ("error" in result) {
        setFileErrors((current) => ({ ...current, [kind]: result.error }));
        setFiles((current) => ({ ...current, [kind]: undefined }));
        return;
      }
      const note = file === chosen ? formatKb(file.size) : `Made smaller for you: ${formatKb(chosen.size)} → ${formatKb(file.size)}`;
      const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : "";
      if (preview) previews.current.push(preview);
      setFiles((current) => ({ ...current, [kind]: { file, note, preview } }));
    } finally {
      setBusy("");
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const read = readAdmissionForm(Object.fromEntries(Array.from(data.entries()).filter(([, value]) => typeof value === "string")));
    if ("error" in read) return setError(read.error);
    if (!files.photo) return setError("Add the student's photo.");
    if (!files.idDocument) return setError("Add the identity document.");
    data.set("photo", files.photo.file);
    data.set("idDocument", files.idDocument.file);
    setBusy("send");
    try {
      const response = await fetch(`/api/admission/${encodeURIComponent(token)}`, { method: "POST", body: data });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || "Something went wrong. Please try again.");
        (window as any).turnstile?.reset?.();
        return;
      }
      setDone(payload.studentName || read.form.name);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Couldn't reach the academy. Check your internet connection and try again.");
    } finally {
      setBusy("");
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
        <CheckCircle2 size={40} className="mx-auto text-emerald-600" />
        <h1 className="mt-3 text-xl font-black text-slate-950">Thank you!</h1>
        <p className="mt-2 text-sm text-slate-600">
          {done}&apos;s admission form has reached the {branchLabel} centre. Once the centre confirms the place, you will get the login details on
          WhatsApp{prefill.email ? " and email" : ""}.
        </p>
      </div>
    );
  }

  const input = "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-950 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

  return (
    <form onSubmit={submit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" noValidate>
      <div>
        <h1 className="text-xl font-black text-slate-950">Admission form</h1>
        <p className="mt-1 text-sm text-slate-600">
          Please fill in the details below{prefill.name ? ` for ${prefill.name}` : ""}. Fields marked * are needed.
        </p>
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-xs font-black uppercase tracking-wide text-brand">Student</legend>
        <Label text="Student's full name *">
          <input name="name" defaultValue={prefill.name} className={input} autoComplete="off" required />
        </Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label text="Date of birth">
            <input name="dateOfBirth" type="date" className={input} />
          </Label>
          <Label text="School">
            <input name="school" className={input} />
          </Label>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-xs font-black uppercase tracking-wide text-brand">Family</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label text="Father's name">
            <input name="fatherName" className={input} autoComplete="off" />
          </Label>
          <Label text="Mother's name">
            <input name="motherName" className={input} autoComplete="off" />
          </Label>
        </div>
        <Label text="Parent or guardian to contact">
          <input name="parentName" defaultValue={prefill.parentName} className={input} autoComplete="name" />
        </Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label text="Mobile number (WhatsApp) *">
            <input name="phone" type="tel" inputMode="numeric" defaultValue={prefill.phone} className={input} autoComplete="tel-national" required />
          </Label>
          <Label text="Email">
            <input name="email" type="email" defaultValue={prefill.email} className={input} autoComplete="email" />
          </Label>
        </div>
        <Label text="Home address *">
          <textarea name="address" rows={3} className={cn(input, "h-auto py-2")} autoComplete="street-address" required />
        </Label>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-xs font-black uppercase tracking-wide text-brand">Documents</legend>
        <FilePick
          kind="photo"
          title="Student's photo *"
          hint="A clear photo of the student's face. Big phone photos are made smaller for you."
          icon={<ImagePlus size={20} />}
          picked={files.photo}
          error={fileErrors.photo}
          busy={busy === "photo"}
          onPick={(file) => void pick("photo", file)}
        />
        <FilePick
          kind="idDocument"
          title="Identity document *"
          hint="Birth certificate, Aadhaar or school ID: a photo or a PDF under 500 KB."
          icon={<FileText size={20} />}
          picked={files.idDocument}
          error={fileErrors.idDocument}
          busy={busy === "idDocument"}
          onPick={(file) => void pick("idDocument", file)}
        />
      </fieldset>

      {turnstileSiteKey ? <div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-theme="light" /> : null}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}

      <button
        type="submit"
        disabled={Boolean(busy)}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand text-base font-black text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
      >
        {busy === "send" && <Loader2 size={18} className="animate-spin" />}
        Send to the centre
      </button>
      <p className="text-center text-xs text-slate-500">Your details are seen only by the academy&apos;s staff.</p>
    </form>
  );
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-bold text-slate-700">{text}</span>
      {children}
    </label>
  );
}

function FilePick({
  kind,
  title,
  hint,
  icon,
  picked,
  error,
  busy,
  onPick,
}: {
  kind: AdmissionFileKind;
  title: string;
  hint: string;
  icon: React.ReactNode;
  picked?: Picked;
  error?: string;
  busy: boolean;
  onPick: (file: File | undefined) => void;
}) {
  return (
    <div className={cn("rounded-lg border-2 border-dashed p-3", error ? "border-red-300 bg-red-50/50" : picked ? "border-emerald-300 bg-emerald-50/40" : "border-slate-300")}>
      <label className="flex cursor-pointer items-center gap-3">
        {picked?.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={picked.preview} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand">
            {busy ? <Loader2 size={20} className="animate-spin" /> : picked ? <CheckCircle2 size={20} /> : icon}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-slate-900">{title}</span>
          <span className="block truncate text-xs text-slate-500">{picked ? `${picked.file.name} · ${picked.note}` : hint}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700">
          <Upload size={14} /> {picked ? "Change" : "Choose"}
        </span>
        <input
          type="file"
          accept={ADMISSION_ACCEPT[kind]}
          className="sr-only"
          onChange={(event) => {
            onPick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      {error && <p className="mt-2 text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}
