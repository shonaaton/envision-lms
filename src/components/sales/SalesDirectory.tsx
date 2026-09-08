"use client";

import { useMemo, useState } from "react";
import { GraduationCap, Phone, Search, Users, UserRound } from "lucide-react";
import type { DirectoryContact, DirectoryPayload } from "@/lib/salesDirectory";

type TabId = "students" | "coaches" | "demos";

const TABS: Array<{ id: TabId; label: string; icon: any }> = [
  { id: "students", label: "Students", icon: Users },
  { id: "coaches", label: "Coaches", icon: GraduationCap },
  { id: "demos", label: "Demo accounts", icon: UserRound },
];

const TONES: Record<DirectoryContact["statusTone"], string> = {
  active: "bg-emerald-50 text-emerald-700",
  paused: "bg-amber-50 text-amber-700",
  left: "bg-slate-100 text-slate-500",
  demo: "bg-sky-50 text-sky-700",
};

/** A `tel:` href needs the digits and a leading +, nothing else. */
function dialHref(phone: string) {
  const cleaned = phone.replace(/[^\d+]/g, "");
  return cleaned ? `tel:${cleaned}` : "";
}

function StatusChip({ contact }: { contact: DirectoryContact }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${TONES[contact.statusTone]}`}>
      {contact.status}
    </span>
  );
}

function ContactRow({ contact, showParent }: { contact: DirectoryContact; showParent: boolean }) {
  const href = dialHref(contact.phone);
  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
      <td className="px-3 py-2.5">
        <div className="font-bold text-slate-950">{contact.name}</div>
        <div className="text-xs text-slate-500">{contact.email || "No email"}</div>
      </td>
      {showParent ? (
        <td className="px-3 py-2.5 text-slate-700">{contact.parentName || <span className="text-slate-400">Not recorded</span>}</td>
      ) : null}
      <td className="px-3 py-2.5">
        {href ? (
          <a
            href={href}
            className="inline-flex items-center gap-1.5 font-bold text-brand transition hover:underline"
          >
            <Phone size={13} /> {contact.phone}
          </a>
        ) : (
          <span className="text-slate-400">No phone</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-slate-700">
        {contact.batches.length ? contact.batches.join(", ") : <span className="text-slate-400">-</span>}
      </td>
      <td className="px-3 py-2.5 text-slate-700">
        {contact.coaches.length ? contact.coaches.join(", ") : <span className="text-slate-400">-</span>}
      </td>
      <td className="px-3 py-2.5 text-slate-700">
        <div>{contact.courseTier || contact.level || <span className="text-slate-400">-</span>}</div>
        {contact.course ? <div className="text-xs text-slate-500">{contact.course}</div> : null}
        {contact.completedLevels.length ? (
          <div className="text-xs text-emerald-700" title={contact.completedLevels.join(", ")}>
            {contact.completedLevels.length} completed
          </div>
        ) : null}
        {contact.courseTier && contact.level ? <div className="text-xs text-slate-400">Assessed: {contact.level}</div> : null}
      </td>
      <td className="px-3 py-2.5 text-slate-600">{contact.detail}</td>
      <td className="px-3 py-2.5">
        <StatusChip contact={contact} />
      </td>
    </tr>
  );
}

export function SalesDirectory({ data }: { data: DirectoryPayload }) {
  const [tab, setTab] = useState<TabId>("students");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const source = data[tab];

  const statuses = useMemo(
    () => Array.from(new Set(source.map((contact) => contact.status))).sort(),
    [source],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return source.filter((contact) => {
      if (status !== "all" && contact.status !== status) return false;
      if (!needle) return true;
      return [contact.name, contact.parentName, contact.phone, contact.email, contact.batches.join(" "), contact.coaches.join(" "), contact.course, contact.courseTier]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [source, query, status]);

  const showParent = tab !== "coaches";

  return (
    <div className="min-h-screen bg-slate-50 px-4 pb-10 pt-4 text-slate-950 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-r from-brand to-brand-400 px-5 py-4 text-white">
          <h1 className="text-lg font-bold">Contact Directory</h1>
          <p className="text-xs text-white/80">Students, parents, coaches and demo accounts - for calling.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          {TABS.map((item) => {
            const Icon = item.icon;
            const count = data[item.id].length;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setStatus("all");
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  tab === item.id ? "bg-brand text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-brand"
                }`}
              >
                <Icon size={14} /> {item.label}
                <span className={tab === item.id ? "text-white/70" : "text-slate-400"}>{count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <label className="relative flex h-9 min-w-[240px] flex-1 items-center sm:max-w-sm">
            <Search size={15} className="pointer-events-none absolute left-3 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, parent, phone, email, batch"
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-950 placeholder-slate-400 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
            />
          </label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 focus:border-brand focus:outline-none"
          >
            <option value="all">All statuses</option>
            {statuses.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <span className="ml-auto text-xs font-semibold text-slate-500">
            {rows.length} of {source.length}
          </span>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-bold">Name</th>
                {showParent ? <th className="px-3 py-2.5 font-bold">Parent</th> : null}
                <th className="px-3 py-2.5 font-bold">Phone</th>
                <th className="px-3 py-2.5 font-bold">{tab === "coaches" ? "Batches" : "Batch"}</th>
                <th className="px-3 py-2.5 font-bold">Coach</th>
                <th className="px-3 py-2.5 font-bold">{tab === "demos" ? "Level" : "Level / Course"}</th>
                <th className="px-3 py-2.5 font-bold">{tab === "demos" ? "Demo" : tab === "coaches" ? "Load" : "Plan"}</th>
                <th className="px-3 py-2.5 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((contact) => <ContactRow key={contact.id} contact={contact} showParent={showParent} />)
              ) : (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-sm text-slate-500">
                    Nobody matches this search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
