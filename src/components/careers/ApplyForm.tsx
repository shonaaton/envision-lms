"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileUp, Loader2, MessageCircle, Star, X } from "lucide-react";
import { BASIC_FIELDS, RESUME_ACCEPT, RESUME_MAX_BYTES, defaultBasicFields, type BasicFieldModes, type JobQuestion } from "@/lib/careers/careersConfig";
import { DIAL_CODES } from "@/lib/phoneCountryCodes";

type PostingLike = {
  id: string;
  title: string;
  basicFields: Partial<BasicFieldModes>;
  resume: "off" | "optional" | "required" | string;
  questions: JobQuestion[];
};

type Step = "details" | "code" | "done";
const CODE_LENGTH = 6;

const inputClass =
  "h-11 w-full rounded-xl border border-brand/15 bg-white px-3 text-sm text-brand-900 shadow-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10";

/**
 * The application form on /careers/[slug], and its live preview in the admin
 * editor (`preview`: nothing is sent). Details + questions + resume, then the
 * WhatsApp code - the code is what submits the application.
 */
export default function ApplyForm({ posting, preview = false }: { posting: PostingLike; preview?: boolean }) {
  const modes = { ...defaultBasicFields(), ...posting.basicFields } as BasicFieldModes;
  const questions = posting.questions.filter((question) => question.active !== false);
  const [step, setStep] = useState<Step>("details");
  const [basics, setBasics] = useState<Record<string, string>>({ name: "", countryCode: "+91", phone: "" });
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [resume, setResume] = useState<File | null>(null);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [unverified, setUnverified] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step !== "code" || resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [step, resendIn]);
  useEffect(() => {
    if (step === "code") codeInput.current?.focus();
  }, [step]);

  function setBasic(key: string, value: string) {
    setBasics((current) => ({ ...current, [key]: value }));
  }
  function setAnswer(id: string, value: unknown) {
    setAnswers((current) => ({ ...current, [id]: value }));
  }
  function fail(message: string, field = "") {
    setError(message);
    setErrorField(field);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (preview) return fail("This is a preview - nothing is sent.");
    if (posting.resume === "required" && !resume) return fail("Please attach your resume.", "resume");
    setBusy(true);
    fail("");
    try {
      const body = new FormData();
      body.set("payload", JSON.stringify({ ...basics, answers, postingId: posting.id, website, sourcePath: window.location.pathname }));
      if (resume) body.set("resume", resume);
      const response = await fetch("/api/careers/apply", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return fail(payload?.error || "Could not send your application. Please try again.", payload?.field || "");
      if (!payload.otpSent) {
        setUnverified(true);
        setStep("done");
        return;
      }
      setApplicationId(payload.id);
      setSentTo(payload.sentTo || "your WhatsApp");
      setResendIn(Number(payload.resendInSeconds) || 30);
      setCode("");
      setStep("code");
    } catch {
      fail("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/careers/apply/otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: applicationId, ...body }) });
    return { ok: response.ok, payload: await response.json().catch(() => ({})) };
  }

  async function checkCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    fail("");
    try {
      const { ok, payload } = await post({ code });
      if (!ok) {
        fail(payload?.error || "Could not check that code. Please try again.");
        setCode("");
        codeInput.current?.focus();
        return;
      }
      setStep("done");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    fail("");
    try {
      const { ok, payload } = await post({ action: "resend" });
      if (!ok) return fail(payload?.error || "Could not send a new code. Please try again.");
      if (!payload.otpSent) {
        setUnverified(true);
        setStep("done");
        return;
      }
      setResendIn(Number(payload.resendInSeconds) || 30);
      codeInput.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  const card = "rounded-2xl border border-brand/10 bg-white p-5 shadow-lg shadow-brand-900/5 sm:p-6";
  const errorBox = error ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p> : null;

  if (step === "done") {
    return (
      <div className={`${card} text-center`}>
        <CheckCircle2 className="mx-auto text-emerald-600" size={36} />
        <h2 className="mt-3 text-xl font-black">Application received</h2>
        <p className="mt-2 text-sm leading-6 text-brand-900/70">
          Thank you for applying for <strong>{posting.title}</strong>. Our team will review it and contact you on WhatsApp or by email about the next step.
          {unverified ? " We could not send a WhatsApp code just now, so we may call to confirm your number." : ""}
        </p>
        <Link href="/careers" className="btn-outline mt-5 inline-flex">See other openings</Link>
      </div>
    );
  }

  if (step === "code") {
    return (
      <form onSubmit={checkCode} className={card}>
        <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.12em] text-emerald-700"><MessageCircle size={14} /> Verify on WhatsApp</p>
        <h2 className="mt-2 text-xl font-black">Enter your code</h2>
        <p className="mt-2 text-sm leading-6 text-brand-900/70">
          We sent a {CODE_LENGTH}-digit code to <strong>{sentTo}</strong>. Your application is submitted once you enter it.
        </p>
        <label htmlFor="career-code" className="mt-4 block text-xs font-black uppercase text-brand-900/55">Verification code</label>
        <input
          ref={codeInput}
          id="career-code"
          className={`${inputClass} mt-1.5 text-center text-xl font-black tracking-[0.5em]`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={CODE_LENGTH}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
        />
        {errorBox}
        <button className="btn-primary mt-4 w-full justify-center" disabled={busy || code.length !== CODE_LENGTH}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : null} Submit application
        </button>
        <div className="mt-3 flex items-center justify-between text-sm">
          <button type="button" className="font-bold text-brand disabled:text-brand-900/40" disabled={busy || resendIn > 0} onClick={() => void resend()}>
            {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
          </button>
          <button type="button" className="font-bold text-brand-900/60 hover:text-brand" onClick={() => { setStep("details"); fail(""); }}>
            Change number
          </button>
        </div>
      </form>
    );
  }

  const fieldError = (key: string) => (errorField === key ? "border-rose-400 ring-2 ring-rose-100" : "");

  return (
    <form onSubmit={submit} className={card} noValidate>
      <h2 className="text-xl font-black">Apply for this role</h2>
      <p className="mt-1 text-xs text-brand-900/60">Fields marked * are required. We verify your WhatsApp number with a code.</p>

      {/* Honeypot: hidden from people, filled by bots. */}
      <input type="text" name="website" value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

      <div className="mt-5 grid gap-4">
        <Field label="Full name" required>
          <input className={`${inputClass} ${fieldError("name")}`} value={basics.name} onChange={(event) => setBasic("name", event.target.value)} autoComplete="name" maxLength={80} />
        </Field>
        <Field label="WhatsApp number" required>
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <select aria-label="Country code" className={inputClass} value={basics.countryCode} onChange={(event) => setBasic("countryCode", event.target.value)}>
              {DIAL_CODES.map((entry) => <option key={entry.code} value={`+${entry.code}`}>{entry.country} (+{entry.code})</option>)}
            </select>
            <input className={`${inputClass} ${fieldError("phone")}`} value={basics.phone} onChange={(event) => setBasic("phone", event.target.value)} inputMode="tel" autoComplete="tel-national" maxLength={20} />
          </div>
        </Field>
        {BASIC_FIELDS.filter((field) => modes[field.key] !== "off").map((field) => (
          <Field key={field.key} label={field.label} required={modes[field.key] === "required"}>
            <input
              className={`${inputClass} ${fieldError(field.key)}`}
              type={field.input === "email" ? "email" : field.input === "number" ? "number" : field.input === "link" ? "url" : "text"}
              inputMode={field.input === "number" ? "numeric" : undefined}
              value={basics[field.key] || ""}
              onChange={(event) => setBasic(field.key, event.target.value)}
              autoComplete={field.input === "email" ? "email" : field.key === "city" ? "address-level2" : "off"}
              placeholder={field.input === "link" ? "https://" : undefined}
              maxLength={200}
            />
          </Field>
        ))}

        {questions.map((question) => question.type === "consent" ? (
          <label key={question.id} className={`flex items-start gap-3 rounded-xl border p-3 text-sm leading-6 ${errorField === `q:${question.id}` ? "border-rose-400 bg-rose-50" : "border-brand/15 bg-[#fbf8fc]"}`}>
            <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[#5a1372]" checked={answers[question.id] === true} onChange={(event) => setAnswer(question.id, event.target.checked)} />
            <span>
              <span className="font-bold text-brand-900">{question.text}</span><span className="text-rose-600"> *</span>
              {question.help ? <span className="mt-0.5 block text-xs text-brand-900/55">{question.help}</span> : null}
            </span>
          </label>
        ) : (
          <Field key={question.id} label={question.text} required={question.required} help={question.help}>
            <QuestionInput question={question} value={answers[question.id]} onChange={(value) => setAnswer(question.id, value)} invalid={errorField === `q:${question.id}`} />
          </Field>
        ))}

        {posting.resume !== "off" ? (
          <Field label="Resume / CV (PDF or Word, up to 10 MB)" required={posting.resume === "required"}>
            {resume ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-brand/15 bg-[#fbf8fc] px-3 py-2.5 text-sm">
                <span className="min-w-0 truncate font-bold">{resume.name}</span>
                <button type="button" aria-label="Remove file" className="text-brand-900/60 hover:text-rose-600" onClick={() => setResume(null)}><X size={16} /></button>
              </div>
            ) : (
              <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-brand/25 bg-[#fbf8fc] px-3 py-4 text-sm font-bold text-brand hover:bg-[#f5edf8] ${fieldError("resume")}`}>
                <FileUp size={17} /> Choose file
                <input
                  type="file"
                  accept={RESUME_ACCEPT}
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    event.target.value = "";
                    if (!file) return;
                    if (!/\.(pdf|docx?)$/i.test(file.name)) return fail("Please upload your resume as a PDF or Word file.", "resume");
                    if (file.size > RESUME_MAX_BYTES) return fail("The resume must be 10 MB or smaller.", "resume");
                    fail("");
                    setResume(file);
                  }}
                />
              </label>
            )}
          </Field>
        ) : null}
      </div>

      {errorBox}
      <button className="btn-primary mt-5 w-full justify-center" disabled={busy}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : null} {preview ? "Submit (preview)" : "Continue - verify WhatsApp"}
      </button>
    </form>
  );
}

function Field({ label, required, help, children }: { label: string; required?: boolean; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-bold text-brand-900">{label}{required ? <span className="text-rose-600"> *</span> : null}</p>
      {help ? <p className="-mt-1 mb-1.5 text-xs text-brand-900/55">{help}</p> : null}
      {children}
    </div>
  );
}

function QuestionInput({ question, value, onChange, invalid }: { question: JobQuestion; value: unknown; onChange: (value: unknown) => void; invalid: boolean }) {
  const ring = invalid ? "border-rose-400 ring-2 ring-rose-100" : "";
  const pill = (active: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-sm font-bold transition ${active ? "border-brand bg-brand text-white" : "border-brand/15 bg-white text-brand-900 hover:border-brand/40"}`;
  switch (question.type) {
    case "longtext":
      return <textarea className={`${inputClass} h-28 py-2 ${ring}`} value={String(value || "")} onChange={(event) => onChange(event.target.value)} maxLength={4000} />;
    case "yesno":
      return (
        <div className="flex gap-2">
          {(["yes", "no"] as const).map((option) => (
            <button key={option} type="button" className={pill(value === option)} onClick={() => onChange(option)}>{option === "yes" ? "Yes" : "No"}</button>
          ))}
        </div>
      );
    case "choice":
      return (
        <div className="flex flex-wrap gap-2">
          {question.options.map((option) => <button key={option} type="button" className={pill(value === option)} onClick={() => onChange(option)}>{option}</button>)}
        </div>
      );
    case "multichoice": {
      const list = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-2">
          {question.options.map((option) => (
            <button key={option} type="button" aria-pressed={list.includes(option)} className={pill(list.includes(option))} onClick={() => onChange(list.includes(option) ? list.filter((item) => item !== option) : [...list, option])}>
              {option}
            </button>
          ))}
        </div>
      );
    }
    case "rating":
      return (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-label={`${n} of 5`} onClick={() => onChange(n)} className="p-1">
              <Star size={24} className={Number(value) >= n ? "fill-accent text-accent-600" : "text-brand-900/25"} />
            </button>
          ))}
        </div>
      );
    case "number":
      return <input className={`${inputClass} ${ring}`} type="number" inputMode="numeric" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />;
    case "link":
      return <input className={`${inputClass} ${ring}`} type="url" placeholder="https://" value={String(value || "")} onChange={(event) => onChange(event.target.value)} maxLength={500} />;
    default:
      return <input className={`${inputClass} ${ring}`} value={String(value || "")} onChange={(event) => onChange(event.target.value)} maxLength={500} />;
  }
}
