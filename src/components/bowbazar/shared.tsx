"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { feeForSlots } from "@/lib/branch/rules";

/** The monthly fee the slot rule gives for these slots, as a form patch; nothing when the rule doesn't say. */
export function slotFee(slotIds: string[]): { monthlyFee: string } | Record<string, never> {
  const fee = feeForSlots(slotIds.length);
  return fee === null ? {} : { monthlyFee: String(fee) };
}

export const rupees = (paise: number) => `₹${Math.round((paise || 0) / 100).toLocaleString("en-IN")}`;

export async function api<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Something went wrong.");
  return data as T;
}

const TABS = [
  { href: "/bowbazar", label: "Overview", need: "view" },
  { href: "/bowbazar/attendance", label: "Attendance", need: "attendance" },
  { href: "/bowbazar/online", label: "Online classes", need: "attendance" },
  { href: "/bowbazar/homework", label: "Homework templates", need: "attendance" },
  { href: "/bowbazar/slots", label: "Slots", need: "view" },
  { href: "/bowbazar/students", label: "Students", need: "view" },
  { href: "/bowbazar/leads", label: "Lead Center", need: "students" },
  { href: "/bowbazar/admissions", label: "Admissions", need: "students" },
  { href: "/bowbazar/waitlist", label: "Waitlist", need: "view" },
  { href: "/bowbazar/changes", label: "Time changes", need: "students" },
  { href: "/bowbazar/messages", label: "Messages", need: "messages" },
  { href: "/bowbazar/exams", label: "Exams", need: "exams" },
  { href: "/bowbazar/achievements", label: "Achievements", need: "achievements" },
  { href: "/bowbazar/whatsapp", label: "WhatsApp", need: "whatsapp" },
  { href: "/bowbazar/activity", label: "Activity", need: "activity" },
  { href: "/bowbazar/fees", label: "Fees", need: "fees" },
  { href: "/bowbazar/accounts", label: "Accounts", need: "fees" },
  { href: "/bowbazar/users", label: "Users", need: "staff" },
  { href: "/bowbazar/access", label: "Feature access", need: "staff" },
  { href: "/bowbazar/settings", label: "Settings", need: "fees" },
];

/** Keyframes the portal's panels and pop-ups use; rendered with each open layer, harmless when repeated. */
const LAYER_CSS = `
@keyframes bb-fade{from{opacity:0}to{opacity:1}}
@keyframes bb-slide-right{from{transform:translateX(100%)}to{transform:translateX(0)}}
@keyframes bb-slide-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes bb-pop{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}
.bb-backdrop{animation:bb-fade .18s ease-out}
.bb-sheet{animation:bb-slide-up .24s cubic-bezier(.2,.8,.2,1)}
.bb-pop{animation:bb-pop .18s ease-out}
@media (min-width:640px){.bb-sheet{animation:bb-slide-right .26s cubic-bezier(.2,.8,.2,1)}.bb-sheet.bb-center{animation:bb-pop .2s ease-out}}
@media (prefers-reduced-motion:reduce){.bb-backdrop,.bb-sheet,.bb-sheet.bb-center,.bb-pop{animation:none}}
`;

/** Open panels and pop-ups, newest last: Esc closes only the top one. */
const openLayers: symbol[] = [];

/** Esc closes the top layer, and the page behind stops scrolling while any layer is open. */
function useLayer(onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const me = Symbol("layer");
    openLayers.push(me);
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && openLayers[openLayers.length - 1] === me) closeRef.current();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      openLayers.splice(openLayers.indexOf(me), 1);
      if (!openLayers.length) document.body.style.overflow = "";
    };
  }, []);
}

export function BranchHeader({ title, subtitle, can, actions }: { title: string; subtitle?: string; can: string[]; actions?: ReactNode }) {
  const pathname = usePathname() || "";
  const navRef = useRef<HTMLElement>(null);
  // On a phone the tab bar scrolls sideways; keep the current page's tab in view.
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>("[data-active='true']");
    if (nav && active) nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }, [pathname]);
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border border-brand/10 bg-gradient-to-br from-white via-white to-brand-50 p-4 shadow-md shadow-brand-900/5 sm:p-5">
        <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-brand/10 blur-2xl" aria-hidden />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-brand">Bowbazar branch</div>
            <h1 className="text-xl font-black text-slate-950 sm:text-2xl">{title}</h1>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2 [&>*]:grow sm:[&>*]:grow-0">{actions}</div>}
        </div>
      </div>
      <div className="relative">
        <nav
          ref={navRef}
          className="flex gap-1 overflow-x-auto rounded-xl border border-brand/10 bg-white p-1 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TABS.filter((tab) => can.includes(tab.need)).map((tab) => {
            const active = tab.href === "/bowbazar" ? pathname === tab.href : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                data-active={active}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-bold transition",
                  active ? "bg-brand text-white shadow-md shadow-brand-900/20" : "text-slate-600 hover:bg-brand-50 hover:text-brand"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <div className="pointer-events-none absolute inset-y-px right-px w-8 rounded-r-xl bg-gradient-to-l from-white to-transparent sm:hidden" aria-hidden />
      </div>
    </div>
  );
}

/**
 * A window for an action or a record. By default it is a centred pop-up on a computer
 * (actions: add, edit, collect, send); with `side` it slides in from the right instead
 * (records you read: class history, a bill, a user). On a phone both rise from the bottom.
 * Esc or a tap outside closes it.
 */
export function Drawer({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
  side,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  side?: boolean;
}) {
  useLayer(onClose);
  return (
    <div
      className={cn(
        "bb-backdrop fixed inset-0 z-50 flex items-end bg-slate-950/45 backdrop-blur-[2px]",
        side ? "justify-end sm:items-stretch" : "justify-center sm:items-center sm:p-6"
      )}
      onClick={onClose}
    >
      <style>{LAYER_CSS}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-2xl shadow-slate-950/30",
          side
            ? cn("bb-sheet sm:h-full sm:max-h-none sm:rounded-none sm:rounded-l-2xl", wide ? "sm:max-w-2xl" : "sm:max-w-xl")
            : cn("bb-sheet bb-center sm:max-h-[88dvh] sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-xl")
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5 sm:py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black text-slate-950">{title}</h2>
            {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && (
          <div
            className={cn(
              "flex justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] [&>*]:grow sm:[&>*]:grow-0",
              !side && "sm:rounded-b-2xl"
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** A centred pop-up for a short question or a small form (a bottom sheet on a phone). */
export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useLayer(onClose);
  return (
    <div className="bb-backdrop fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/45 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <style>{LAYER_CSS}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bb-pop w-full max-w-md rounded-t-2xl bg-white shadow-2xl shadow-slate-950/30 sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <h2 className="text-lg font-black text-slate-950">{title}</h2>
          <button type="button" onClick={onClose} className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3 px-5 py-3 text-sm text-slate-600">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 [&>*]:grow sm:[&>*]:grow-0">{footer}</div>}
      </div>
    </div>
  );
}

type ConfirmOptions = { title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean };

/**
 * A pop-up in place of the browser's plain confirm box:
 * `const [confirm, confirmDialog] = useConfirm();`, render `{confirmDialog}`, then `if (!(await confirm({ title }))) return;`.
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })), []);
  const finish = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };
  const dialog = pending ? (
    <Modal
      title={pending.title}
      onClose={() => finish(false)}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={() => finish(false)}>Cancel</button>
          <button type="button" autoFocus className={cn("btn-primary h-10", pending.danger && "bg-red-700 hover:bg-red-800")} onClick={() => finish(true)}>
            {pending.confirmLabel || "Yes, go ahead"}
          </button>
        </>
      }
    >
      {pending.message && <div>{pending.message}</div>}
    </Modal>
  ) : null;
  return [confirm, dialog];
}

type MenuItem = { label: string; onClick: () => void; icon?: ReactNode; danger?: boolean };

/** A "⋯" button that opens a short list of actions; falsy entries are skipped. */
export function MoreMenu({ items, label = "More actions" }: { items: (MenuItem | false | null | undefined)[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent | TouchEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const shown = items.filter(Boolean) as MenuItem[];
  if (!shown.length) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="btn-outline h-9 px-2.5"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div role="menu" className="bb-pop absolute right-0 top-full z-40 mt-1.5 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl shadow-slate-950/15">
          <style>{LAYER_CSS}</style>
          {shown.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-semibold",
                item.danger ? "text-red-700 hover:bg-red-50" : "text-slate-700 hover:bg-slate-50"
              )}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.icon && <span className="shrink-0 opacity-70">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const BADGE_TONES = {
  good: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warn: "bg-amber-50 text-amber-900 ring-amber-200",
  bad: "bg-red-50 text-red-800 ring-red-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  brand: "bg-brand-50 text-brand ring-brand/15",
  muted: "bg-slate-100 text-slate-600 ring-slate-200",
} as const;
export type BadgeTone = keyof typeof BADGE_TONES;

/** A small coloured status label. */
export function Badge({ tone = "muted", children, dot, className }: { tone?: BadgeTone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ring-1", BADGE_TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/** A raised card section with an optional title row. */
export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-md shadow-brand-900/5", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-base font-black text-slate-950">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** What a list shows when nothing is in it. */
export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon && <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand">{icon}</div>}
      <div className="text-sm font-black text-slate-800">{title}</div>
      {hint && <div className="max-w-sm text-xs text-slate-500">{hint}</div>}
      {action}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className="text-xs font-bold text-slate-600">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

const STAT_TONES = {
  default: { value: "text-slate-950", bar: "bg-brand/30", icon: "bg-brand-50 text-brand" },
  good: { value: "text-emerald-700", bar: "bg-emerald-400", icon: "bg-emerald-50 text-emerald-700" },
  warn: { value: "text-amber-700", bar: "bg-amber-400", icon: "bg-amber-50 text-amber-700" },
  bad: { value: "text-red-700", bar: "bg-red-400", icon: "bg-red-50 text-red-700" },
} as const;

/** A summary number. With `onClick` or `href` it is a button (a filter or a shortcut); `active` marks the chosen filter. */
export function Stat({
  label,
  value,
  tone = "default",
  hint,
  icon,
  onClick,
  href,
  active,
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
  hint?: string;
  icon?: ReactNode;
  onClick?: () => void;
  href?: string;
  active?: boolean;
}) {
  const colours = STAT_TONES[tone];
  const body = (
    <>
      <span className={cn("absolute inset-x-0 top-0 h-1", colours.bar)} aria-hidden />
      <span className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
        {icon && <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", colours.icon)}>{icon}</span>}
      </span>
      <span className={cn("block text-2xl font-black leading-tight", colours.value)}>{value}</span>
      {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
    </>
  );
  const base = cn(
    "relative block overflow-hidden rounded-xl border bg-white p-4 pt-5 text-left shadow-md shadow-brand-900/5",
    active ? "border-brand ring-2 ring-brand/20" : "border-slate-200/80"
  );
  const interactive = "transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-900/10 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/20";
  if (href) return <Link href={href} className={cn(base, interactive)}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} aria-pressed={active} className={cn(base, interactive, "w-full")}>{body}</button>;
  return <div className={base}>{body}</div>;
}

export function ModeBadge({ mode }: { mode: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-black uppercase",
        mode === "online" ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-900"
      )}
    >
      {mode}
    </span>
  );
}

/** Shown once after an account is created or its password reset. */
export function CredentialsNote({ username, password, note }: { username: string; password: string; note?: string }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
      <div className="font-black">Login details</div>
      <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <span className="text-emerald-700">User ID</span>
        <span className="font-mono font-bold">{username}</span>
        <span className="text-emerald-700">Password</span>
        <span className="font-mono font-bold">{password}</span>
      </div>
      {note && <div className="mt-1 text-xs">{note}</div>}
      <button
        type="button"
        className="mt-2 text-xs font-bold text-emerald-800 underline"
        onClick={() => navigator.clipboard?.writeText(`User ID: ${username}\nPassword: ${password}\nLogin: ${window.location.origin}/login`)}
      >
        Copy for WhatsApp
      </button>
    </div>
  );
}

type PickerSlot = { id: string; label: string; mode: string; isActive: boolean; free: number };

/** Open slots with their free seats; a full slot can't be picked unless the student already sits in it. */
export function SlotPicker({
  slots,
  value,
  onChange,
  seatedIn = [],
}: {
  slots: PickerSlot[];
  value: string[];
  onChange: (value: string[]) => void;
  seatedIn?: string[];
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-bold text-slate-600">Slots</div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {slots.filter((slot) => slot.isActive).map((slot) => {
          const chosen = value.includes(slot.id);
          const full = slot.free === 0 && !seatedIn.includes(slot.id);
          return (
            <label
              key={slot.id}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm",
                chosen ? "border-brand bg-brand-50" : "border-slate-200",
                full && !chosen && "cursor-not-allowed opacity-50"
              )}
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={chosen}
                  disabled={full && !chosen}
                  onChange={() => onChange(chosen ? value.filter((entry) => entry !== slot.id) : [...value, slot.id])}
                />
                <span className="font-semibold">{slot.label}</span>
                {slot.mode === "online" && <ModeBadge mode="online" />}
              </span>
              <span className={cn("text-xs font-bold", slot.free ? "text-emerald-700" : "text-red-700")}>{slot.free ? `${slot.free} free` : "Full"}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
