import { type ReactNode } from "react";
import AdminV2Sidebar from "./AdminV2Sidebar";

export function AdminV2Shell({
  title,
  description,
  activeHref,
  children,
}: {
  title: string;
  description: string;
  activeHref: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <AdminV2Sidebar activeHref={activeHref} />
      <div className="min-h-screen px-4 py-4 transition-[padding] duration-300 lg:pl-20">
        <div className="mx-auto max-w-[1520px] space-y-4">
          <header className="flex flex-col gap-3 border-b border-slate-200 bg-white pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-brand/70">Admin v2 pilot</div>
              <h1 className="mt-1 text-2xl font-black text-brand">{title}</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
            </div>
            <a href="/admin/users" className="btn-outline w-fit">Current Admin</a>
          </header>
          {children}
        </div>
      </div>
    </main>
  );
}
