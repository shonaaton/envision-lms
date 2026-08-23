import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  type LucideIcon,
} from "lucide-react";
import { AdminV2Card, AdminV2Stat } from "./AdminV2Primitives";

type Stat = {
  label: string;
  value: string | number;
  tone?: "default" | "accent";
};

type Action = {
  label: string;
  href: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
};

type Row = {
  label: string;
  detail: string;
  status: string;
};

export type AdminV2WorkspaceConfig = {
  eyebrow: string;
  heading: string;
  summary: string;
  stats: Stat[];
  primaryAction: Action;
  actions: Action[];
  rows: Row[];
  notes: string[];
};

export default function AdminV2WorkspacePage({ config }: { config: AdminV2WorkspaceConfig }) {
  const PrimaryIcon = config.primaryAction.icon;

  return (
    <div className="space-y-5">
      <AdminV2Card>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-brand/70">{config.eyebrow}</div>
            <h2 className="mt-1 text-2xl font-black text-brand">{config.heading}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{config.summary}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href={config.primaryAction.href} className="btn-primary">
                <PrimaryIcon size={16} />
                {config.primaryAction.label}
              </Link>
              <Link href="/admin-v2/directory" className="btn-outline">
                <ArrowUpRight size={16} />
                Directory
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {config.stats.map((stat) => (
              <AdminV2Stat key={stat.label} label={stat.label} value={stat.value} tone={stat.tone} />
            ))}
          </div>
        </div>
      </AdminV2Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-4 md:grid-cols-2">
          {config.actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.href} href={action.href} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand/20 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
                    <Icon size={19} />
                  </span>
                  {action.badge ? <span className="rounded-full bg-accent/25 px-2 py-1 text-[11px] font-black text-brand">{action.badge}</span> : null}
                </div>
                <div className="mt-4 flex items-center gap-2 font-black text-brand">
                  {action.label}
                  <ArrowUpRight size={15} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{action.description}</p>
              </Link>
            );
          })}
        </div>

        <div className="space-y-4">
          <AdminV2Card>
            <div className="flex items-center gap-2 text-sm font-black text-brand">
              <Clock3 size={17} />
              Today Focus
            </div>
            <div className="mt-4 space-y-3">
              {config.rows.map((row) => (
                <div key={row.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-black text-slate-900">{row.label}</div>
                      <div className="mt-1 text-sm leading-5 text-slate-600">{row.detail}</div>
                    </div>
                    <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-600 ring-1 ring-slate-200">{row.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </AdminV2Card>

          <AdminV2Card>
            <div className="flex items-center gap-2 text-sm font-black text-brand">
              <CalendarDays size={17} />
              Admin Checks
            </div>
            <div className="mt-4 space-y-2">
              {config.notes.map((note) => (
                <div key={note} className="flex items-start gap-2 text-sm leading-6 text-slate-600">
                  <CheckCircle2 size={16} className="mt-1 shrink-0 text-brand" />
                  <span>{note}</span>
                </div>
              ))}
            </div>
          </AdminV2Card>
        </div>
      </div>
    </div>
  );
}
