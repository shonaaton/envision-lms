"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, FileUp, Loader2, MessageCircle, ShieldCheck, Star, X } from "lucide-react";
import {
  BASIC_FIELDS,
  RESUME_ACCEPT,
  RESUME_MAX_BYTES,
  defaultBasicFields,
  validateApplication,
  type BasicFieldModes,
  type JobQuestion,
} from "@/lib/careers/careersConfig";
import { DIAL_CODES } from "@/lib/phoneCountryCodes";

type PostingLike = {
  id: string;
  title: string;
  basicFields: Partial<BasicFieldModes>;
  resume: "off" | "optional" | "required" | string;
  questions: JobQuestion[];
};

type Phase = "form" | "code" | "done";
type Page = { key: string; title: string; kind: "details" | "questions" | "resume"; questions: JobQuestion[] };

const CODE_LENGTH = 6;
/** Any button on the page can open the form with `window.dispatchEvent(new Event(OPEN_EVENT))`. */
export const OPEN_APPLY_EVENT = "careers:open-apply";

const inputClass =
  "h-11 w-full rounded-xl border border-brand/15 bg-white px-3 text-sm text-brand-900 shadow-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10";

/** Splits the questions into short pages: a paragraph answer counts double, about four slots a page. */
function questionPages(questions: JobQuestion[]): JobQuestion[][] {
  const pages: JobQuestion[][] = [];
  let current: JobQuestion[] = [];
  let weight = 0;
  for (const question of questions) {
    const cost = question.type === "longtext" ? 2 : question.type === "consent" ? 4 : 1;
    // The confirmation gets a page to itself, so nobody ticks it in passing.
    if (current.length && (weight + cost > 4 || question.type === "consent")) {
      pages.push(current);
      current = [];
      weight = 0;
    }
    current.push(question);
    weight += cost;
    if (question.type === "consent") {
      pages.push(current);
      current = [];
      weight = 0;
    }
  }
  if (current.length) pages.push(current);
  return pages;
}

/**
 * The application form for /careers/[slug], as short steps instead of one
 * long page: your details, then the questions a few at a time, then the
 * resume, then the WhatsApp code - the code is what submits the application.
 *
 * `variant="modal"` (the public page) shows a small "Apply" card and opens
 * the steps in a pop-up - full screen on a phone. `variant="inline"` (the
 * admin editor's preview) shows the steps in place. `preview` sends nothing.
 *
 * Each step is checked with the same validateApplication the API runs, so a
 * step only moves on when the server would accept it.
 */
/** From an invite link: the details the team entered, filled in for them. */
export type InvitePrefill = { token: string; name: string; email: string; countryCode: string; phone: string };

export default function ApplyForm({
  posting,
  preview = false,
  variant = "modal",
  invite = null,
}: {
  posting: PostingLike;
  preview?: boolean;
  variant?: "modal" | "inline";
  invite?: InvitePrefill | null;
}) {
  const modes = useMemo(() => ({ ...defaultBasicFields(), ...posting.basicFields }) as BasicFieldModes, [posting.basicFields]);
  const questions = useMemo(() => posting.questions.filter((question) => question.active !== false), [posting.questions]);
  const pages = useMemo<Page[]>(() => {
    const chunks = questionPages(questions);
    return [
      { key: "details", title: "Your details", kind: "details", questions: [] },
      ...chunks.map((chunk, index) => ({
        key: `q${index}`,
        title: chunk.length === 1 && chunk[0].type === "consent" ? "Role terms" : chunks.length > 1 ? `Questions (${index + 1} of ${chunks.length})` : "A few questions",
        kind: "questions" as const,
        questions: chunk,
      })),
      ...(posting.resume !== "off" ? [{ key: "resume", title: "Resume", kind: "resume" as const, questions: [] }] : []),
    ];
  }, [questions, posting.resume]);

  const [open, setOpen] = useState(variant === "inline");
  const [phase, setPhase] = useState<Phase>("form");
  const [pageIndex, setPageIndex] = useState(0);
  const [basics, setBasics] = useState<Record<string, string>>(() =>
    invite
      ? { name: invite.name, countryCode: invite.countryCode || "+91", phone: invite.phone, ...(invite.email ? { email: invite.email } : {}) }
      : { name: "", countryCode: "+91", phone: "" }
  );
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
  const bodyRef = useRef<HTMLDivElement>(null);

  const page = pages[Math.min(pageIndex, pages.length - 1)];
  const isLastPage = pageIndex >= pages.length - 1;
  const totalSteps = pages.length + 1; // + the WhatsApp code
  const stepNumber = phase === "form" ? pageIndex + 1 : totalSteps;

  // Opening from anywhere on the page, or straight from a link ending in ?apply=1 / #apply.
  useEffect(() => {
    if (variant !== "modal") return;
    const show = () => setOpen(true);
    window.addEventListener(OPEN_APPLY_EVENT, show);
    if (new URLSearchParams(window.location.search).get("apply") === "1" || window.location.hash === "#apply") setOpen(true);
    return () => window.removeEventListener(OPEN_APPLY_EVENT, show);
  }, [variant]);

  // While the pop-up is open the page behind it does not scroll, and Escape closes it.
  useEffect(() => {
    if (variant !== "modal" || !open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, variant]);

  useEffect(() => {
    if (phase !== "code" || resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [phase, resendIn]);
  useEffect(() => {
    if (phase === "code") codeInput.current?.focus();
  }, [phase]);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [pageIndex, phase]);

  function setBasic(key: string, value: string) {
    setBasics((current) => ({ ...current, [key]: value }));
  }
  function setAnswer(id: string, value: unknown) {
    setAnswers((current) => ({ ...current, [id]: value }));
  }
  const fail = useCallback((message: string, field = "") => {
    setError(message);
    setErrorField(field);
  }, []);

  /** The step that holds a field the server (or a check) complained about. */
  function pageOfField(field: string) {
    if (field === "resume") return pages.findIndex((item) => item.kind === "resume");
    if (field.startsWith("q:")) return pages.findIndex((item) => item.questions.some((question) => `q:${question.id}` === field));
    return 0;
  }

  /** Checks one step with the API's own rules. */
  function checkPage(target: Page) {
    if (target.kind === "resume") {
      if (posting.resume === "required" && !resume) return { field: "resume", error: "Please attach your resume." };
      return null;
    }
    const result = validateApplication(
      { basicFields: target.kind === "details" ? modes : Object.fromEntries(BASIC_FIELDS.map((field) => [field.key, "off"])), resume: "off", questions: target.questions },
      { ...basics, answers }
    );
    return result.ok ? null : { field: result.field, error: result.error };
  }

  function next() {
    const problem = checkPage(page);
    if (problem) return fail(problem.error, problem.field);
    fail("");
    if (isLastPage) void submit();
    else setPageIndex((value) => value + 1);
  }

  function back() {
    fail("");
    setPageIndex((value) => Math.max(0, value - 1));
  }

  async function submit() {
    for (let index = 0; index < pages.length; index += 1) {
      const problem = checkPage(pages[index]);
      if (problem) {
        setPageIndex(index);
        return fail(problem.error, problem.field);
      }
    }
    if (preview) return fail("This is a preview - nothing is sent.");
    setBusy(true);
    fail("");
    try {
      const body = new FormData();
      body.set("payload", JSON.stringify({ ...basics, answers, postingId: posting.id, website, sourcePath: window.location.pathname, ...(invite ? { inviteToken: invite.token } : {}) }));
      if (resume) body.set("resume", resume);
      const response = await fetch("/api/careers/apply", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const field = String(payload?.field || "");
        if (field) setPageIndex(Math.max(0, pageOfField(field)));
        return fail(payload?.error || "Could not send your application. Please try again.", field);
      }
      if (!payload.otpSent) {
        setUnverified(true);
        setPhase("done");
        return;
      }
      setApplicationId(payload.id);
      setSentTo(payload.sentTo || "your WhatsApp");
      setResendIn(Number(payload.resendInSeconds) || 30);
      setCode("");
      setPhase("code");
    } catch {
      fail("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function postCode(body: Record<string, unknown>) {
    const response = await fetch("/api/careers/apply/otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: applicationId, ...body }) });
    return { ok: response.ok, payload: await response.json().catch(() => ({})) };
  }

  async function checkCode() {
    setBusy(true);
    fail("");
    try {
      const { ok, payload } = await postCode({ code });
      if (!ok) {
        fail(payload?.error || "Could not check that code. Please try again.");
        setCode("");
        codeInput.current?.focus();
        return;
      }
      setPhase("done");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    fail("");
    try {
      const { ok, payload } = await postCode({ action: "resend" });
      if (!ok) return fail(payload?.error || "Could not send a new code. Please try again.");
      if (!payload.otpSent) {
        setUnverified(true);
        setPhase("done");
        return;
      }
      setResendIn(Number(payload.resendInSeconds) || 30);
      codeInput.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  const fieldError = (key: string) => (errorField === key ? "border-rose-400 ring-2 ring-rose-100" : "");
  const errorBox = error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p> : null;

  // ------------------------------------------------------------------ body
  let body: React.ReactNode;
  let footer: React.ReactNode = null;

  if (phase === "done") {
    body = (
      <div className="py-6 text-center">
        <CheckCircle2 className="mx-auto text-emerald-600" size={44} />
        <h3 className="mt-3 text-xl font-black">Application received</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-brand-900/70">
          Thank you for applying for <strong>{posting.title}</strong>. Our team will review it and contact you on WhatsApp or by email about the next step.
          {unverified ? " We could not send a WhatsApp code just now, so we may call to confirm your number." : ""}
        </p>
        <Link href="/careers" className="btn-outline mt-5 inline-flex">See other openings</Link>
      </div>
    );
  } else if (phase === "code") {
    body = (
      <form
        id="career-code-form"
        onSubmit={(event) => {
          event.preventDefault();
          void checkCode();
        }}
        className="space-y-4"
      >
        <p className="text-sm leading-6 text-brand-900/70">
          We sent a {CODE_LENGTH}-digit code to <strong>{sentTo}</strong> on WhatsApp. Your application is submitted once you enter it.
        </p>
        <div>
          <label htmlFor="career-code" className="block text-xs font-black uppercase text-brand-900/55">Verification code</label>
          <input
            ref={codeInput}
            id="career-code"
            className={`${inputClass} mt-1.5 h-14 text-center text-2xl font-black tracking-[0.5em]`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
          />
        </div>
        {errorBox}
        <div className="flex items-center justify-between text-sm">
          <button type="button" className="font-bold text-brand disabled:text-brand-900/40" disabled={busy || resendIn > 0} onClick={() => void resend()}>
            {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
          </button>
          <button type="button" className="font-bold text-brand-900/60 hover:text-brand" onClick={() => { setPhase("form"); setPageIndex(0); fail(""); }}>
            Change number
          </button>
        </div>
      </form>
    );
    footer = (
      <button form="career-code-form" className="btn-primary h-12 w-full justify-center" disabled={busy || code.length !== CODE_LENGTH}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : null} Submit application
      </button>
    );
  } else {
    body = (
      <form
        id="career-step-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          next();
        }}
        className="space-y-5"
      >
        {/* Honeypot: hidden from people, filled by bots. */}
        <input type="text" name="website" value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

        {page.kind === "details" ? (
          <>
            <Field label="Full name" required>
              <input className={`${inputClass} ${fieldError("name")}`} value={basics.name} onChange={(event) => setBasic("name", event.target.value)} autoComplete="name" maxLength={80} />
            </Field>
            <Field label="WhatsApp number" required help="We send a code here to confirm it is you.">
              <div className="grid grid-cols-[120px_1fr] gap-2">
                <select aria-label="Country code" className={inputClass} value={basics.countryCode} onChange={(event) => setBasic("countryCode", event.target.value)}>
                  {DIAL_CODES.map((entry) => <option key={entry.code} value={`+${entry.code}`}>{entry.country} (+{entry.code})</option>)}
                </select>
                <input className={`${inputClass} ${fieldError("phone")}`} value={basics.phone} onChange={(event) => setBasic("phone", event.target.value)} inputMode="tel" autoComplete="tel-national" maxLength={20} />
              </div>
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              {BASIC_FIELDS.filter((field) => modes[field.key] !== "off").map((field) => (
                <div key={field.key} className={field.input === "link" || field.key === "currentRole" || field.key === "languages" || field.input === "email" ? "sm:col-span-2" : ""}>
                  <Field label={field.label} required={modes[field.key] === "required"}>
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
                </div>
              ))}
            </div>
          </>
        ) : null}

        {page.kind === "questions"
          ? page.questions.map((question) =>
              question.type === "consent" ? (
                <label key={question.id} className={`flex items-start gap-3 rounded-xl border p-4 text-sm leading-6 ${errorField === `q:${question.id}` ? "border-rose-400 bg-rose-50" : "border-brand/15 bg-[#fbf8fc]"}`}>
                  <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[#5a1372]" checked={answers[question.id] === true} onChange={(event) => setAnswer(question.id, event.target.checked)} />
                  <span>
                    <span className="font-bold text-brand-900">{question.text}</span>
                    <span className="text-rose-600"> *</span>
                    {question.help ? <span className="mt-1 block text-xs text-brand-900/55">{question.help}</span> : null}
                  </span>
                </label>
              ) : (
                <Field key={question.id} label={question.text} required={question.required} help={question.help}>
                  <QuestionInput question={question} value={answers[question.id]} onChange={(value) => setAnswer(question.id, value)} invalid={errorField === `q:${question.id}`} />
                </Field>
              )
            )
          : null}

        {page.kind === "resume" ? (
          <Field label="Resume / CV (PDF or Word, up to 10 MB)" required={posting.resume === "required"} help={posting.resume === "required" ? undefined : "Optional, but it helps us know you better."}>
            {resume ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-brand/15 bg-[#fbf8fc] px-3 py-3 text-sm">
                <span className="min-w-0 truncate font-bold">{resume.name}</span>
                <button type="button" aria-label="Remove file" className="text-brand-900/60 hover:text-rose-600" onClick={() => setResume(null)}><X size={16} /></button>
              </div>
            ) : (
              <label className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-brand/25 bg-[#fbf8fc] px-3 py-8 text-sm font-bold text-brand hover:bg-[#f5edf8] ${fieldError("resume")}`}>
                <FileUp size={22} /> Choose a file
                <span className="text-xs font-normal text-brand-900/55">PDF, DOC or DOCX</span>
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
      </form>
    );
    // The error sits above the buttons, so it is seen even when the step is long and scrolled.
    footer = (
      <div className="space-y-3">
        {errorBox}
      <div className="flex items-center gap-3">
        {pageIndex > 0 ? (
          <button type="button" onClick={back} disabled={busy} className="btn-outline h-12 px-4">
            <ArrowLeft size={16} /> Back
          </button>
        ) : null}
        <button form="career-step-form" className="btn-primary h-12 flex-1 justify-center" disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : null}
          {isLastPage ? (preview ? "Submit (preview)" : "Submit & verify WhatsApp") : <>Next <ArrowRight size={16} /></>}
        </button>
      </div>
      </div>
    );
  }

  const heading = phase === "done" ? "All done" : phase === "code" ? "Verify your WhatsApp" : page.title;
  const progress = phase === "done" ? 100 : Math.round((stepNumber / totalSteps) * 100);

  const panel = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-brand/10 px-5 pb-4 pt-5 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-black uppercase tracking-[0.12em] text-brand-900/50">Apply · {posting.title}</p>
            <h2 className="mt-1 text-xl font-black text-brand-900">{heading}</h2>
          </div>
          {variant === "modal" ? (
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-brand-900/60 hover:bg-brand/5">
              <X size={22} />
            </button>
          ) : null}
        </div>
        {phase !== "done" ? (
          <div className="mt-3">
            <div className="mb-1.5 flex justify-between text-[11px] font-black uppercase text-brand-900/45">
              <span>Step {stepNumber} of {totalSteps}</span>
              <span>{phase === "code" ? "Last step" : `${totalSteps - stepNumber} to go`}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-brand/10">
              <div className="h-full rounded-full bg-brand transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}
      </div>
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{body}</div>
      {footer ? <div className="shrink-0 border-t border-brand/10 bg-white px-5 py-4 sm:px-6">{footer}</div> : null}
    </div>
  );

  if (variant === "inline") {
    return <div className="flex h-[640px] flex-col overflow-hidden rounded-2xl border border-brand/10 bg-white shadow-lg shadow-brand-900/5">{panel}</div>;
  }

  return (
    <>
      <div className="rounded-2xl border border-brand/10 bg-white p-6 shadow-lg shadow-brand-900/5">
        <h2 className="text-xl font-black">Apply for this role</h2>
        <ul className="mt-3 space-y-2 text-sm text-brand-900/70">
          <li className="flex items-center gap-2"><Clock3 size={15} className="text-brand" /> {pages.length + 1} short steps, about {Math.max(3, Math.round(questions.length * 0.8) + 2)} minutes</li>
          <li className="flex items-center gap-2"><MessageCircle size={15} className="text-brand" /> We confirm your WhatsApp number with a code</li>
          <li className="flex items-center gap-2"><ShieldCheck size={15} className="text-brand" /> Your details are seen only by our hiring team</li>
        </ul>
        <button type="button" onClick={() => setOpen(true)} className="btn-primary mt-5 h-12 w-full justify-center">
          {phase === "done" ? "Application sent" : pageIndex > 0 || phase === "code" ? "Continue application" : "Apply now"} <ArrowRight size={16} />
        </button>
      </div>

      {/* Rendered on <body>: the sticky column it sits in would otherwise trap it under the site header. Above the cookie banner (100), below its settings dialog (110). */}
      {open && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[105] flex items-stretch justify-center bg-brand-900/55 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={`Apply for ${posting.title}`} className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-[min(88vh,720px)] sm:max-w-2xl sm:rounded-2xl">
            {panel}
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}

/** Opens the application pop-up from anywhere on the page (e.g. the hero). */
export function ApplyNowButton({ className = "", children }: { className?: string; children?: React.ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_APPLY_EVENT))}>
      {children || "Apply now"}
    </button>
  );
}

function Field({ label, required, help, children }: { label: string; required?: boolean; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-bold leading-6 text-brand-900">{label}{required ? <span className="text-rose-600"> *</span> : null}</p>
      {help ? <p className="-mt-1 mb-2 text-xs text-brand-900/55">{help}</p> : null}
      {children}
    </div>
  );
}

function QuestionInput({ question, value, onChange, invalid }: { question: JobQuestion; value: unknown; onChange: (value: unknown) => void; invalid: boolean }) {
  const ring = invalid ? "border-rose-400 ring-2 ring-rose-100" : "";
  const pill = (active: boolean) =>
    `rounded-full border px-4 py-2 text-sm font-bold transition ${active ? "border-brand bg-brand text-white" : "border-brand/15 bg-white text-brand-900 hover:border-brand/40"}`;
  switch (question.type) {
    case "longtext":
      return <textarea className={`${inputClass} h-32 py-2.5 ${ring}`} value={String(value || "")} onChange={(event) => onChange(event.target.value)} maxLength={4000} />;
    case "yesno":
      return (
        <div className={`flex gap-2 rounded-xl ${invalid ? "ring-2 ring-rose-100" : ""}`}>
          {(["yes", "no"] as const).map((option) => (
            <button key={option} type="button" className={pill(value === option)} onClick={() => onChange(option)}>{option === "yes" ? "Yes" : "No"}</button>
          ))}
        </div>
      );
    case "choice":
      return (
        <div className={`flex flex-wrap gap-2 rounded-xl ${invalid ? "ring-2 ring-rose-100" : ""}`}>
          {question.options.map((option) => <button key={option} type="button" className={pill(value === option)} onClick={() => onChange(option)}>{option}</button>)}
        </div>
      );
    case "multichoice": {
      const list = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className={`flex flex-wrap gap-2 rounded-xl ${invalid ? "ring-2 ring-rose-100" : ""}`}>
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
              <Star size={26} className={Number(value) >= n ? "fill-accent text-accent-600" : "text-brand-900/25"} />
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
