import Link from "next/link";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/accounts", label: "Overview" },
  { href: "/admin/accounts/ledger", label: "Costs & offline income" },
  { href: "/admin/accounts/cash", label: "Cash book" },
  { href: "/admin/accounts/receivables", label: "Receivables" },
  { href: "/admin/accounts/statements", label: "Bank statements" },
  { href: "/admin/accounts/reconcile", label: "Cross-check" },
];

export function AccountsNav({ active, query = "" }: { active: string; query?: string }) {
  return (
    <nav className="mt-3 flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-sm shadow-brand/5">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={`${tab.href}${query}`}
          className={cn(
            "rounded-md px-3 py-1.5 font-semibold transition",
            active === tab.href ? "bg-brand text-white" : "text-slate-600 hover:bg-brand-50 hover:text-brand"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

export function Forbidden() {
  return <div className="p-6 text-sm text-slate-600">Forbidden</div>;
}
