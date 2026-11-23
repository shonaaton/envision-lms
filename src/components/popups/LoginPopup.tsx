"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Award, BookOpenCheck, CalendarCheck, FileText, Medal, Megaphone, Trophy, X } from "lucide-react";

export type PopupKind = "tournament" | "campaign_high" | "feedback" | "achievement" | "badge" | "homework" | "recap" | "campaign";
export type PopupPayload = { key: string; kind: PopupKind; title: string; body: string; imageUrl?: string; ctaLabel?: string; ctaHref?: string };

// The full check (personal pop-ups too) runs once per browser session.
const CHECKED_KEY = "lms-popup-checked";
// While the portal is open, ask every two minutes for a newly published admin pop-up.
const LIVE_CHECK_MS = 2 * 60_000;
const FIRST_LIVE_CHECK_MS = 4_000;
// The pop-up on screen, until it is closed. Survives the frame remounting.
let shownPopup: PopupPayload | null = null;
let checking = false;

const ICONS: Record<PopupKind, typeof Megaphone> = {
  tournament: Trophy,
  campaign_high: Megaphone,
  campaign: Megaphone,
  feedback: FileText,
  achievement: Medal,
  badge: Award,
  homework: BookOpenCheck,
  recap: CalendarCheck,
};

/**
 * Never put a pop-up over a classroom page, a game, an exam or a quiz. (While
 * the account's own class is on, the server sends none anywhere.)
 */
export function popupCanInterrupt(pathname: string) {
  if (pathname === "/classrooms" || pathname.startsWith("/classrooms/")) return false;
  if (/^\/(tournaments|exams|quizzes)\/[^/]+/.test(pathname) && !/^\/tournaments\/new(\/|$)/.test(pathname)) return false;
  return !["/play", "/king-hunt", "/square-trainer", "/tactics-trainer", "/analysis"].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * The pop-up an account sees in the portal: an admin announcement or, for
 * students, a personal nudge (lib/popups). Students get the full check when
 * they open the dashboard; after that, and for every role, the frame asks every
 * two minutes, so a pop-up published while someone is already signed in still
 * reaches them. Never shown over a class or a game.
 */
export default function LoginPopup() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [popup, setPopup] = useState<PopupPayload | null>(() => shownPopup);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const ask = useCallback((live: boolean) => {
    if (checking || shownPopup) return;
    checking = true;
    // Not cancelled on unmount: the answer is kept at module level, so a frame
    // that remounts (a router refresh, React's dev double-run) shows it anyway.
    fetch(live ? "/api/popups?live=1" : "/api/popups", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data?.popup) return;
        shownPopup = data.popup;
        setPopup(data.popup);
      })
      .catch(() => undefined)
      .finally(() => {
        checking = false;
      });
  }, []);

  useEffect(() => {
    if (pathname !== "/dashboard") return;
    try {
      if (window.sessionStorage.getItem(CHECKED_KEY)) return;
      window.sessionStorage.setItem(CHECKED_KEY, "1");
    } catch {
      // Storage blocked: still show it, at worst once per dashboard visit.
    }
    ask(false);
  }, [pathname, ask]);

  useEffect(() => {
    function liveCheck() {
      if (document.visibilityState !== "visible" || !popupCanInterrupt(pathRef.current)) return;
      ask(true);
    }
    const first = window.setTimeout(liveCheck, FIRST_LIVE_CHECK_MS);
    const timer = window.setInterval(liveCheck, LIVE_CHECK_MS);
    document.addEventListener("visibilitychange", liveCheck);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", liveCheck);
    };
  }, [ask]);

  useEffect(() => {
    if (!popup || !popupCanInterrupt(pathname)) return;
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

  // Kept for later if the account moved into a class or a game meanwhile.
  if (!popup || !popupCanInterrupt(pathname)) return null;
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
export function PopupCard({ popup, onDismiss, onAction, onImageError }: { popup: PopupPayload; onDismiss?: () => void; onAction?: () => void; onImageError?: () => void }) {
  const Icon = ICONS[popup.kind] || Megaphone;
  const [brokenImage, setBrokenImage] = useState("");
  const showImage = Boolean(popup.imageUrl) && brokenImage !== popup.imageUrl;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="login-popup-title" className="relative w-full max-w-md overflow-hidden rounded-2xl border border-brand/10 bg-white text-left shadow-2xl">
      <button type="button" onClick={onDismiss} className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-1.5 text-slate-500 shadow-sm hover:bg-slate-100" aria-label="Close">
        <X size={16} />
      </button>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={popup.imageUrl}
          alt=""
          className="max-h-56 w-full object-cover"
          onError={() => {
            // A link to a web page rather than a picture: show the usual header instead of a broken image.
            setBrokenImage(popup.imageUrl || "");
            onImageError?.();
          }}
        />
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
    case "tournament":
      return "Tournament";
    case "feedback":
      return "Progress report";
    case "achievement":
      return "Academy achievement";
    case "badge":
      return "New badge";
    case "homework":
      return "Homework";
    case "recap":
      return "Last week";
    default:
      return "From the academy";
  }
}
