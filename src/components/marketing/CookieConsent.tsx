"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Cookie, X } from "lucide-react";
import {
  CONSENT_EVENT,
  type ConsentState,
  consentAllOn,
  consentEssentialOnly,
  cookiePurposes,
  readConsent,
  writeConsent,
} from "@/lib/cookieConsent";

/**
 * The consent banner and its settings panel.
 *
 * Nothing that depends on consent runs until a decision exists, so the default
 * state is "no non-essential cookies". Choosing is a deliberate act: closing the
 * panel without picking does not count as agreement, which is why there is no
 * dismiss-without-deciding control on the banner itself.
 *
 * Other components listen for `CONSENT_EVENT` rather than reloading the page.
 */
export default function CookieConsent() {
  // `null` means "not yet read" - the banner stays hidden through the first
  // paint so it never flashes at someone who already decided.
  const [decision, setDecision] = useState<ConsentState | null | undefined>(undefined);
  const [panelOpen, setPanelOpen] = useState(false);
  const [draft, setDraft] = useState({ analytics: false, marketing: false });

  useEffect(() => {
    const existing = readConsent();
    setDecision(existing);
    if (existing) setDraft({ analytics: existing.analytics, marketing: existing.marketing });
  }, []);

  // The footer link reopens the panel through this event.
  useEffect(() => {
    const open = () => {
      const existing = readConsent();
      if (existing) setDraft({ analytics: existing.analytics, marketing: existing.marketing });
      setPanelOpen(true);
    };
    window.addEventListener("envision:open-cookie-settings", open);
    return () => window.removeEventListener("envision:open-cookie-settings", open);
  }, []);

  const commit = useCallback((state: ConsentState) => {
    writeConsent(state);
    setDecision(state);
    setPanelOpen(false);
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: state }));
  }, []);

  const acceptAll = () => commit(consentAllOn());
  const rejectAll = () => commit(consentEssentialOnly());
  const saveChoices = () =>
    commit({ ...consentEssentialOnly(), analytics: draft.analytics, marketing: draft.marketing });

  if (decision === undefined) return null;
  const bannerVisible = decision === null && !panelOpen;
  if (!bannerVisible && !panelOpen) return null;

  return (
    <>
      {/* ------------------------------------------------------------ banner */}
      {bannerVisible ? (
        <div
          role="dialog"
          aria-label="Cookie consent"
          className="fixed inset-x-0 bottom-0 z-[100] border-t border-brand/15 bg-white p-4 shadow-[0_-10px_40px_rgba(90,19,114,0.14)] sm:p-5"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-3">
              <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-accent sm:grid">
                <Cookie size={20} />
              </span>
              <p className="text-sm leading-6 text-brand-900/75">
                We use strictly necessary cookies to run the site and keep you signed in. With your permission we also use
                analytics and marketing cookies to measure our adverts and improve the site. Read our{" "}
                <Link href="/privacy" className="font-bold text-brand hover:underline">
                  privacy policy
                </Link>
                .
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
              <button type="button" onClick={() => setPanelOpen(true)} className="btn border border-brand/25 bg-white text-brand hover:border-brand/50 hover:bg-brand-50">
                Cookie settings
              </button>
              <button type="button" onClick={rejectAll} className="btn border border-brand/25 bg-white text-brand hover:border-brand/50 hover:bg-brand-50">
                Reject non-essential
              </button>
              <button type="button" onClick={acceptAll} className="btn-accent">
                Accept all
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------------------- panel */}
      {panelOpen ? (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-brand-900/45 p-0 sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-settings-title"
            className="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border border-brand/15 bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-brand/10 bg-brand-50 p-5">
              <div>
                <h2 id="cookie-settings-title" className="text-lg font-black text-brand-900">
                  Cookie settings
                </h2>
                <p className="mt-1 text-sm leading-6 text-brand-900/70">
                  Choose which purposes you allow. You can change this at any time from the link in the footer.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="Close cookie settings"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-brand/15 bg-white text-brand hover:bg-brand-50"
              >
                <X size={17} />
              </button>
            </div>

            <div className="divide-y divide-brand/10">
              {cookiePurposes.map((purpose) => {
                const enabled = purpose.locked ? true : draft[purpose.id as "analytics" | "marketing"];
                return (
                  <div key={purpose.id} className="flex gap-4 p-5">
                    <div className="flex-1">
                      <h3 className="text-sm font-black text-brand-900">{purpose.title}</h3>
                      <p className="mt-1.5 text-sm leading-6 text-brand-900/70">{purpose.detail}</p>
                      <p className="mt-2 text-xs font-semibold text-brand-900/55">{purpose.examples}</p>
                    </div>
                    <div className="shrink-0 pt-1">
                      {purpose.locked ? (
                        <span className="inline-flex rounded-full bg-brand-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.1em] text-brand">
                          Always on
                        </span>
                      ) : (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={enabled}
                          aria-label={`${purpose.title} cookies`}
                          onClick={() => setDraft((current) => ({ ...current, [purpose.id]: !enabled }))}
                          className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${enabled ? "bg-brand" : "bg-brand-100"}`}
                        >
                          <span
                            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${enabled ? "left-[22px]" : "left-0.5"}`}
                          />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-2 border-t border-brand/10 bg-brand-50 p-5 sm:flex-row sm:justify-end">
              <button type="button" onClick={rejectAll} className="btn border border-brand/25 bg-white text-brand hover:border-brand/50 hover:bg-brand-50">
                Reject non-essential
              </button>
              <button type="button" onClick={saveChoices} className="btn border border-brand/25 bg-white text-brand hover:border-brand/50 hover:bg-brand-50">
                Save my choices
              </button>
              <button type="button" onClick={acceptAll} className="btn-accent">
                Accept all
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
