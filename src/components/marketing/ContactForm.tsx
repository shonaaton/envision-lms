"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, GraduationCap, Loader2, Mail, MapPin, MessageCircle, Send, UserRound } from "lucide-react";
import { contactInterests, ONLINE_INTEREST } from "@/lib/contactEnquiries";
import { DIAL_CODES } from "@/lib/phoneCountryCodes";
import { LEGAL_LINKS } from "@/lib/publicLinks";
import { trackConversion } from "@/lib/siteAnalytics";

/** Shared input styling; the portal has no `.input-field` utility to lean on. */
const fieldClass =
  "w-full rounded-lg border border-brand/15 bg-white px-3 py-2.5 text-sm text-brand-900 shadow-sm outline-none transition placeholder:text-brand-900/40 focus:border-brand focus:ring-4 focus:ring-brand/10";

const initialForm = {
  name: "",
  email: "",
  address: "",
  countryCode: "+91",
  phone: "",
  interest: ONLINE_INTEREST,
  message: "",
  website: "",
};

const onlineOption = contactInterests.find((interest) => interest.value === ONLINE_INTEREST);
const centreOptions = contactInterests.filter((interest) => interest.value !== ONLINE_INTEREST);

/**
 * The public contact form.
 *
 * Client-side validation is kept to what the browser does for free plus a
 * required-fields check; the real rules live in `contactMessageSchema` on the
 * server, so a stale bundle can never accept something the API rejects. The
 * error the server returns is what the reader is shown.
 */
export default function ContactForm() {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const selectedInterest = contactInterests.find((interest) => interest.value === form.interest);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          sourcePath: typeof window === "undefined" ? "" : window.location.pathname,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload?.error || "Could not send your message. Please try again.");
        return;
      }
      trackConversion("contact_form_submit");
      setSent(true);
      setForm(initialForm);
      toast.success("Message sent. Our team will get back to you.");
    } catch {
      toast.error("Could not send your message. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-brand/10 bg-white p-8 text-center shadow-xl shadow-brand-900/10">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand text-accent shadow-sm shadow-brand-900/20">
          <CheckCircle2 size={26} />
        </span>
        <h2 className="mt-5 text-xl font-black text-brand-900">Thank you - your message is with us.</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-brand-900/70">
          Our team will reply on WhatsApp or email, usually the same day. If it is urgent, call the centre directly using the numbers on this
          page.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/register" className="btn-accent">Book a free demo class <ArrowRight size={16} /></Link>
          <button type="button" onClick={() => setSent(false)} className="btn border border-brand/25 bg-white text-brand hover:border-brand/50 hover:bg-brand-50">
            Send another message
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-brand/10 bg-white p-6 shadow-xl shadow-brand-900/10 sm:p-8">
      <h2 className="text-xl font-black text-brand-900 sm:text-2xl">Send us a message</h2>
      <p className="mt-2 text-sm leading-6 text-brand-900/70">
        Tell us whether you want online classes or a Kolkata centre, and we will reply with batch timings, availability and the current fee
        structure.
      </p>

      <div className="mt-6 grid gap-4">
        <Field label="Full name" icon={UserRound} htmlFor="contact-name">
          <input
            id="contact-name"
            name="name"
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            placeholder="Parent or student name"
            className={fieldClass}
          />
        </Field>

        <Field label="Email address" icon={Mail} htmlFor="contact-email">
          <input
            id="contact-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(event) => update("email", event.target.value)}
            placeholder="you@example.com"
            className={fieldClass}
          />
        </Field>

        <Field label="WhatsApp number" icon={MessageCircle} htmlFor="contact-phone" hint="We reply on WhatsApp first.">
          <div className="flex gap-2">
            <select
              aria-label="Country code"
              name="countryCode"
              value={form.countryCode}
              onChange={(event) => update("countryCode", event.target.value)}
              className={`${fieldClass} w-[7.5rem] shrink-0`}
            >
              {DIAL_CODES.map((entry) => (
                <option key={entry.code} value={`+${entry.code}`}>
                  +{entry.code} {entry.country.split(" / ")[0]}
                </option>
              ))}
            </select>
            <input
              id="contact-phone"
              name="phone"
              type="tel"
              required
              inputMode="tel"
              autoComplete="tel-national"
              value={form.phone}
              onChange={(event) => update("phone", event.target.value)}
              placeholder="98312 48613"
              className={`${fieldClass} flex-1`}
            />
          </div>
        </Field>

        <Field label="Address" icon={MapPin} htmlFor="contact-address" hint="Optional - helps us suggest the nearest centre.">
          <textarea
            id="contact-address"
            name="address"
            rows={2}
            maxLength={300}
            autoComplete="street-address"
            value={form.address}
            onChange={(event) => update("address", event.target.value)}
            placeholder="Area, city and PIN code"
            className={`${fieldClass} resize-y`}
          />
        </Field>

        {/*
          One dropdown rather than five radios: online and the four centres are
          the same question - where do you want to be taught - and the chosen
          option is what routes the enquiry to the right centre in-charge.
        */}
        <Field label="I am interested in" icon={GraduationCap} htmlFor="contact-interest">
          <select
            id="contact-interest"
            name="interest"
            required
            value={form.interest}
            onChange={(event) => update("interest", event.target.value)}
            className={fieldClass}
          >
            <option value={ONLINE_INTEREST}>{onlineOption?.label || "Online classes"}</option>
            <optgroup label="Kolkata centres">
              {centreOptions.map((interest) => (
                <option key={interest.value} value={interest.value}>
                  {interest.label}
                </option>
              ))}
            </optgroup>
          </select>
          <p className="mt-2 text-xs leading-5 text-brand-900/60">{selectedInterest?.detail}</p>
        </Field>

        <Field label="Your message" icon={Send} htmlFor="contact-message" hint="Optional - the student's age and level help us answer properly.">
          <textarea
            id="contact-message"
            name="message"
            rows={4}
            maxLength={2000}
            value={form.message}
            onChange={(event) => update("message", event.target.value)}
            placeholder="For example: my daughter is 8, has never played, and we are free on weekends."
            className={`${fieldClass} resize-y`}
          />
        </Field>

        {/* Honeypot. Hidden from people and from screen readers; bots fill it. */}
        <div className="hidden" aria-hidden>
          <label htmlFor="contact-website">Website</label>
          <input
            id="contact-website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(event) => update("website", event.target.value)}
          />
        </div>
      </div>

      <button type="submit" disabled={loading} className="btn-accent mt-6 w-full justify-center disabled:opacity-70">
        {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        {loading ? "Sending..." : "Send message"}
      </button>

      <p className="mt-4 text-xs leading-5 text-brand-900/60">
        By sending this form you agree to our{" "}
        <Link href={LEGAL_LINKS.privacy} className="font-bold text-brand hover:underline">Privacy Policy</Link>. We use your number to reply
        about classes, and nothing else.
      </p>
    </form>
  );
}

function Field({
  label,
  icon: Icon,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  icon: typeof UserRound;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.12em] text-brand-900/60">
        <Icon size={14} className="text-brand" /> {label}
      </label>
      <div className="mt-2">{children}</div>
      {hint ? <p className="mt-1.5 text-xs text-brand-900/50">{hint}</p> : null}
    </div>
  );
}
