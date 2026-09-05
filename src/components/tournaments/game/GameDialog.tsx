"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * The one dialog used for the game's key moments — confirming a resignation,
 * accepting a draw, and the post-game result.
 *
 * Deliberately the only modal in the playing experience: anything that covers
 * the board during a game is a liability, so the standings, move list and live
 * boards stay inline where they can be read without a tap.
 *
 * Focus moves in on open and returns to whatever opened it on close, Escape
 * dismisses, and focus is trapped while it is up.
 */
export function GameDialog({
  open,
  title,
  description,
  onClose,
  children,
  tone = "default",
  dismissible = true,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children?: ReactNode;
  tone?: "default" | "danger" | "success";
  dismissible?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') || []).filter(
        (element) => !element.hasAttribute("disabled")
      );
    focusable()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissible) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;

  const accent =
    tone === "danger" ? "before:bg-red-500" : tone === "success" ? "before:bg-emerald-500" : "before:bg-brand";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-[2px] sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby={description ? "game-dialog-description" : undefined}
        className={`relative w-full max-w-sm overflow-hidden rounded-xl bg-white p-5 shadow-2xl shadow-ink/30 before:absolute before:inset-x-0 before:top-0 before:h-1 ${accent}`}
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          {dismissible ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X size={16} aria-hidden />
            </button>
          ) : null}
        </div>
        {description ? (
          <p id="game-dialog-description" className="text-sm leading-relaxed text-slate-600">
            {description}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
