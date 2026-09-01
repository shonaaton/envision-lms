import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<{ size?: number | string; className?: string }>;
type Tone = "purple" | "green" | "amber" | "blue" | "rose";

const statTones: Record<Tone, string> = {
  purple: "bg-purple-50 text-purple-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  blue: "bg-sky-50 text-sky-700",
  rose: "bg-rose-50 text-rose-700",
};

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  icon: Icon,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  icon?: IconComponent;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-brand/10 bg-white p-4 text-slate-950 shadow-sm shadow-brand/10", className)}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="inline-flex h-7 items-center gap-2 rounded-full bg-brand-50 px-3 text-[10px] font-black uppercase tracking-[0.14em] text-brand">
            {Icon && <Icon size={13} />}
            {eyebrow}
          </div>
          <h1 className="mt-2 text-xl font-black tracking-normal text-slate-950 sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600 sm:text-sm">{subtitle}</p>}
        </div>
        {children && <div className="w-full xl:max-w-5xl">{children}</div>}
      </div>
    </section>
  );
}

export function DataPanel({
  children,
  title,
  subtitle,
  icon: Icon,
  action,
  className,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  icon?: IconComponent;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-brand/5", className)}>
      {(title || subtitle || Icon || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {Icon && (
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-50 text-purple-700 shadow-sm shadow-purple-900/10">
                <Icon size={15} />
              </span>
            )}
            <div>
              {title && <h2 className="text-sm font-semibold text-slate-950">{title}</h2>}
              {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  note,
  icon: Icon,
  tone = "purple",
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon: IconComponent;
  tone?: Tone;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm shadow-brand/5 transition hover:border-brand/20 hover:shadow-md hover:shadow-brand/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-500">{label}</div>
          <div className="mt-1 truncate text-xl font-semibold text-slate-950">{value}</div>
          {note && <div className="mt-1 text-xs text-slate-500">{note}</div>}
        </div>
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", statTones[tone])}>
          <Icon size={15} />
        </span>
      </div>
    </div>
  );
}

export function FilterBar({
  children,
  className,
  method,
}: {
  children: ReactNode;
  className?: string;
  method?: "get" | "post";
}) {
  const classes = cn("grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 shadow-inner shadow-white", className);
  if (method) {
    return (
      <form method={method} className={classes}>
        {children}
      </form>
    );
  }
  return <div className={classes}>{children}</div>;
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-[180px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center", className)}>
      <div className="text-sm font-semibold text-slate-950">{title}</div>
      {description && <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
