"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Clock3, GraduationCap, Loader2, MessageCircle, UserRound } from "lucide-react";
import { contactInterests, ONLINE_INTEREST } from "@/lib/contactEnquiries";
import { DEMO_AGE_GROUPS, DEMO_CHILD_LEVELS, DEMO_THANKS_PATH, DEMO_THANKS_STORAGE_KEY } from "@/lib/demoRequest";
import { trackMetaLead } from "@/lib/metaPixel";
import { DIAL_CODES, dialCodeEntry } from "@/lib/phoneCountryCodes";
import { LEGAL_LINKS } from "@/lib/publicLinks";
import { trackConversion } from "@/lib/siteAnalytics";

const CODE_LENGTH = 6;

const initialForm = {
  parentName: "",
  countryCode: "+91",
  phone: "",
  ageGroup: "",
  childLevel: "",
  interest: ONLINE_INTEREST,
  preferredTime: "",
  website: "",
};

type Step = "details" | "code";

async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, payload };
}

/**
 * The free demo form, then the WhatsApp code, then on to the thank-you page,
 * where the family picks a demo slot.
 *
 * The real rules live in `demoRequestSchema` on the server, so what this shows
 * as an error is what the server said. The details stay in state through the
 * code step, so "Change number" never makes a parent retype them.
 */
export default function DemoRequestForm({ embedded = false, titleId }: { embedded?: boolean; titleId?: string } = {}) {
  // In the landing page's pop-up the page already has its h1, and the pop-up scrolls instead of the window.
  const Title = embedded ? "h2" : "h1";
  const card = useRef<HTMLElement>(null);
  const [form, setForm] = useState(initialForm);
  const [step, setStep] = useState<Step>("details");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [leadId, setLeadId] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const router = useRouter();
  const codeInput = useRef<HTMLInputElement>(null);

  const dial = dialCodeEntry(form.countryCode);
  const phonePlaceholder = dial ? `Enter ${dial.nationalLengths.join(" or ")}-digit number` : "Enter your number";

  useEffect(() => {
    if (step !== "code" || resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [step, resendIn]);

  useEffect(() => {
    if (embedded) card.current?.closest(".dform-modal-body")?.scrollTo({ top: 0 });
    else window.scrollTo({ top: 0 });
    if (step === "code") codeInput.current?.focus();
  }, [step, embedded]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  /**
   * The request id rides in sessionStorage, not the URL: it is what lets the
   * thank-you page save a slot against this request, and a URL gets shared.
   */
  function finish(id: unknown, metaEventId: unknown, verified: boolean) {
    trackConversion("demo_request");
    trackMetaLead(metaEventId);
    try {
      const firstName = form.parentName.trim().split(/\s+/)[0] || "";
      window.sessionStorage.setItem(DEMO_THANKS_STORAGE_KEY, JSON.stringify({ id: id ? String(id) : "", firstName, verified }));
    } catch {
      // Private browsing can refuse storage. The page still thanks them, without the slot picker.
    }
    router.push(DEMO_THANKS_PATH);
  }

  async function submitDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { ok, payload } = await post("/api/demo-request", { ...form, sourcePath: window.location.pathname });
      if (!ok) {
        setError(payload?.error || "Could not save your details. Please try again.");
        return;
      }
      if (!payload.otpSent) {
        finish(payload.id, payload.metaEventId, false);
        return;
      }
      setLeadId(payload.id);
      setSentTo(payload.sentTo);
      setResendIn(payload.resendInSeconds || 30);
      setCode("");
      setStep("code");
    } catch {
      setError("Could not reach us. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function checkCode(value: string) {
    if (busy || value.length !== CODE_LENGTH) return;
    setBusy(true);
    setError("");
    try {
      const { ok, payload } = await post("/api/demo-request/otp", { id: leadId, code: value });
      if (!ok) {
        setError(payload?.error || "Could not check that code. Please try again.");
        setCode("");
        codeInput.current?.focus();
        return;
      }
      finish(leadId, payload.metaEventId, true);
    } catch {
      setError("Could not reach us. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (busy || resendIn > 0) return;
    setBusy(true);
    setError("");
    try {
      const { ok, payload } = await post("/api/demo-request/otp", { id: leadId, action: "resend" });
      if (!ok) {
        setError(payload?.error || "Could not send a new code. Please try again.");
        return;
      }
      if (payload.verified) {
        finish(leadId, payload.metaEventId, true);
        return;
      }
      if (!payload.otpSent) {
        finish(leadId, payload.metaEventId, false);
        return;
      }
      setCode("");
      setResendIn(payload.resendInSeconds || 30);
      codeInput.current?.focus();
    } catch {
      setError("Could not reach us. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "code") {
    return (
      <section className="dform-card" ref={card}>
        <div className="dform-head">
          <Title id={titleId} className="dform-title">Check your WhatsApp</Title>
          <p>
            We sent a {CODE_LENGTH}-digit code to <strong>{sentTo}</strong>. Enter it here to confirm your number.
          </p>
        </div>
        <form
          className="dform-code"
          onSubmit={(event) => {
            event.preventDefault();
            void checkCode(code);
          }}
        >
          <label htmlFor="demo-code">Verification code</label>
          <input
            ref={codeInput}
            id="demo-code"
            className="dform-code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            value={code}
            aria-invalid={Boolean(error)}
            onChange={(event) => {
              const next = event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
              setCode(next);
              if (next.length === CODE_LENGTH) void checkCode(next);
            }}
          />
          {error ? (
            <p className="dform-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="dform-btn" type="submit" disabled={busy || code.length !== CODE_LENGTH}>
            {busy ? <Loader2 className="dform-spin" size={18} aria-hidden="true" /> : null}
            Verify
          </button>
        </form>
        <div className="dform-code-actions">
          <button type="button" className="dform-link" onClick={resend} disabled={busy || resendIn > 0}>
            {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
          </button>
          <button
            type="button"
            className="dform-link"
            onClick={() => {
              setError("");
              setStep("details");
            }}
          >
            Change number
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="dform-card" ref={card}>
      <div className="dform-head">
        <Title id={titleId} className="dform-title">Please share your details</Title>
        <p>Let&apos;s get your child started on their chess journey!</p>
      </div>
      <form className="dform-fields" onSubmit={submitDetails}>
        <div className="dform-field">
          <label htmlFor="demo-name">
            Parent&apos;s full name <span aria-hidden="true">*</span>
          </label>
          <div className="dform-input">
            <UserRound size={18} aria-hidden="true" />
            <input
              id="demo-name"
              required
              maxLength={80}
              autoComplete="name"
              placeholder="Enter your full name"
              value={form.parentName}
              onChange={(event) => update("parentName", event.target.value)}
            />
          </div>
        </div>

        <div className="dform-field">
          <label htmlFor="demo-phone">
            WhatsApp number <span aria-hidden="true">*</span>
          </label>
          <div className="dform-phone">
            {/* The native list shows country names, while the closed control shows only the code. */}
            <div className="dform-dial">
              <span aria-hidden="true">{form.countryCode}</span>
              <ChevronDown size={16} aria-hidden="true" />
              <select aria-label="Country code" value={form.countryCode} onChange={(event) => update("countryCode", event.target.value)}>
                {DIAL_CODES.map((entry) => (
                  <option key={entry.code} value={`+${entry.code}`}>
                    {entry.country} (+{entry.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="dform-input">
              <MessageCircle size={18} aria-hidden="true" />
              <input
                id="demo-phone"
                required
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={20}
                placeholder={phonePlaceholder}
                value={form.phone}
                onChange={(event) => update("phone", event.target.value)}
              />
            </div>
          </div>
          <small>We will send a code to this number on WhatsApp.</small>
        </div>

        <fieldset className="dform-field">
          <legend>
            Child&apos;s age <span aria-hidden="true">*</span>
          </legend>
          <div className="dform-chips">
            {DEMO_AGE_GROUPS.map((item) => (
              <label className="dform-chip" key={item.value}>
                <input type="radio" name="ageGroup" required value={item.value} checked={form.ageGroup === item.value} onChange={() => update("ageGroup", item.value)} />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="dform-field">
          <legend>
            Student level <span aria-hidden="true">*</span>
          </legend>
          <div className="dform-chips">
            {DEMO_CHILD_LEVELS.map((item) => (
              <label className="dform-chip" key={item.value}>
                <input type="radio" name="childLevel" required value={item.value} checked={form.childLevel === item.value} onChange={() => update("childLevel", item.value)} />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="dform-field">
          <label htmlFor="demo-interest">
            Class preference <span aria-hidden="true">*</span>
          </label>
          <div className="dform-input dform-select">
            <GraduationCap size={18} aria-hidden="true" />
            <select id="demo-interest" required value={form.interest} onChange={(event) => update("interest", event.target.value)}>
              {contactInterests.map((interest) => (
                <option key={interest.value} value={interest.value}>
                  {interest.label}
                </option>
              ))}
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </div>
        </div>

        <div className="dform-field">
          <label htmlFor="demo-time">
            Convenient time to connect <span aria-hidden="true">*</span>
          </label>
          <div className="dform-input">
            <Clock3 size={18} aria-hidden="true" />
            <input
              id="demo-time"
              required
              maxLength={80}
              placeholder="e.g., 4:00 PM - 5:00 PM"
              value={form.preferredTime}
              onChange={(event) => update("preferredTime", event.target.value)}
            />
          </div>
        </div>

        {/* Hidden from people; a bot that fills it is answered as a success and dropped. */}
        <div className="dform-trap" aria-hidden="true">
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => update("website", event.target.value)} />
          </label>
        </div>

        {error ? (
          <p className="dform-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="dform-submit">
          <button className="dform-btn" type="submit" disabled={busy}>
            {busy ? <Loader2 className="dform-spin" size={18} aria-hidden="true" /> : null}
            Submit details
          </button>
          <p className="dform-legal">
            By submitting, you agree to our <a href={LEGAL_LINKS.privacy}>Privacy Policy</a> and <a href={LEGAL_LINKS.terms}>Terms</a>, and to hear from us on
            WhatsApp.
          </p>
        </div>
      </form>
    </section>
  );
}
