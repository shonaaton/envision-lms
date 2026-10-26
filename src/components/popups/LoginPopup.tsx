"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Award, BookOpenCheck, CalendarCheck, FileText, Megaphone, X } from "lucide-react";

export type PopupKind = "campaign_high" | "feedback" | "badge" | "homework" | "recap" | "campaign";
export type PopupPayload = { key: string; kind: PopupKind; title: string; body: string; imageUrl?: string; ctaLabel?: string; ctaHref?: string };

// Asked once per browser session, so moving between pages never pops it again.
const CHECKED_KEY = "lms-popup-checked";
// The pop-up on screen, until it is closed. Survives the frame remounting.
let shownPopup: PopupPayload | null = null;

const ICONS: Record<PopupKind, typeof Megaphone> = {
  campaign_high: Megaphone,
  campaign: Megaphone,
  feedback: FileText,
  badge: Award,
  homework: BookOpenCheck,
  recap: CalendarCheck,
};

/**
 * The one pop-up a student sees when they open the portal: an admin
 * announcement or a personal nudge (lib/popups). Shown on the dashboard only,
 * never over a class or a game.
 */
export default function LoginPopup() {
  const pathname = usePathname();
  const router = useRouter();
  const [popup, setPopup] = useState<PopupPayload | null>(() => shownPopup);

  useEffect(() => {
    if (pathname !== "/dashboard") return;
    try {
      if (window.sessionStorage.getItem(CHECKED_KEY)) return;
      window.sessionStorage.setItem(CHECKED_KEY, "1");
    } catch {
      // Storage blocked: still show it, at worst once per dashboard visit.
    }
    // Not cancelled on unmount: the answer is kept at module level, so a frame
    // that remounts (a router refresh, React's dev double-run) shows it anyway.
    fetch("/api/popups", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data?.popup) return;
        shownPopup = data.popup;
        setPopup(data.popup);
      })
      .catch(() => undefined);
  }, [pathname]);

  useEffect(() => {
    if (!popup) return;
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && close("dismiss");
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  });

  function close(action: "dismiss" | "click") {
    if (!popup) return;
    const { key, ctaHref } = popup;
    shownPopup = null;
    setPopup(null);
    void fetch("/api/popups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, action }),
      keepalive: true,
    }).catch(() => undefined);
    if (action === "click" && ctaHref) {
      if (ctaHref.startsWith("/")) router.push(ctaHref);
      else window.open(ctaHref, "_blank", "noopener,noreferrer");
    }
  }

  if (!popup) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-sm"
      onMouseDown={(event) => event.target === event.currentTarget && close("dismiss")}
    >
      <PopupCard popup={popup} onDismiss={() => close("dismiss")} onAction={() => close("click")} />
    </div>
  );
}

/** The pop-up itself, shared with the admin preview so it shows exactly what students see. */
export function PopupCard({ popup, onDismiss, onAction }: { popup: PopupPayload; onDismiss?: () => void; onAction?: () => void }) {
  const Icon = ICONS[popup.kind] || Megaphone;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="login-popup-title" className="relative w-full max-w-md overflow-hidden rounded-2xl border border-brand/10 bg-white text-left shadow-2xl">
      <button type="button" onClick={onDismiss} className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-1.5 text-slate-500 shadow-sm hover:bg-slate-100" aria-label="Close">
        <X size={16} />
      </button>
      {popup.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={popup.imageUrl} alt="" className="max-h-56 w-full object-cover" />
      ) : (
        <div className="flex items-center gap-3 bg-gradient-to-br from-brand to-brand-700 px-5 pb-5 pt-6 text-white">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <Icon size={22} />
          </span>
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-white/80">{kindLabel(popup.kind)}</span>
        </div>
      )}
      <div className="p-5">
        <h2 id="login-popup-title" className="break-words text-lg font-black leading-snug text-slate-950">{popup.title || "Pop-up title"}</h2>
        <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-slate-600">{popup.body || "Your message appears here."}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn border border-slate-200 bg-white text-slate-700" onClick={onDismiss}>
            {popup.ctaLabel ? "Maybe later" : "Got it"}
          </button>
          {popup.ctaLabel && popup.ctaHref ? (
            <button type="button" className="btn-primary" onClick={onAction}>
              {popup.ctaLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function kindLabel(kind: PopupKind) {
  switch (kind) {
    case "feedback":
      return "Progress report";
    case "badge":
      return "Achievement";
    case "homework":
      return "Homework";
    case "recap":
      return "Last week";
    default:
      return "From the academy";
  }
}
