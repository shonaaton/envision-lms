"use client";

/** Reopens the consent panel, so a decision is always changeable from the footer. */
export default function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("envision:open-cookie-settings"))}
      className={className}
    >
      Cookie Settings
    </button>
  );
}
