import Link from "next/link";
import { BadgeIndianRupee, LineChart } from "lucide-react";

export function CoachPayTabs({ active, month }: { active: "payments" | "profitability"; month?: string }) {
  const query = month ? `?period=month&month=${encodeURIComponent(month)}` : "";
  const tabs = [
    { id: "payments", label: "Payments", href: "/coach-pay", icon: BadgeIndianRupee },
    { id: "profitability", label: "Profitability", href: "/coach-pay/profitability", icon: LineChart },
  ];
  return (
    <nav aria-label="Coach Pay" className="mb-3 flex flex-wrap gap-2">
      {tabs.map(({ id, label, href, icon: Icon }) => (
        <Link key={id} href={href + query} aria-current={active === id ? "page" : undefined}
          className={`${active === id ? "btn-primary" : "btn-outline"} h-9 px-4 text-xs`}>
          <Icon size={14} /> {label}
        </Link>
      ))}
    </nav>
  );
}
