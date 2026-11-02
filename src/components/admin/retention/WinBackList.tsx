"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Phone } from "lucide-react";
import { toast } from "sonner";
import { Empty, formatDate } from "@/components/admin/retention/shared";

type Leaver = {
  _id: string;
  name: string;
  parentName: string;
  phone: string;
  leftAt: string;
  daysSinceLeft: number;
  bucket: 0 | 30 | 60 | 90;
  reason: string;
  reasonNote: string;
  lastCall: { at: string; outcome: string; kind: string } | null;
  due: boolean;
};

const BUCKETS = [
  { key: "due", label: "Due a call" },
  { key: "30", label: "Left 30+ days ago" },
  { key: "60", label: "60+ days" },
  { key: "90", label: "90+ days" },
  { key: "all", label: "Everyone (4 months)" },
];

/** Students who left in the last four months: a month on, a friendly call asking whether they would come back. */
export default function WinBackList({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<Leaver[] | null>(null);
  const [bucket, setBucket] = useState("due");

  useEffect(() => {
    fetch("/api/admin/retention/winback", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Could not load the win-back list.");
        setRows(body.rows);
      })
      .catch((error) => toast.error(error.message));
  }, []);

  const shown = useMemo(() => {
    if (!rows) return [];
    if (bucket === "due") return rows.filter((row) => row.due);
    if (bucket === "all") return rows;
    return rows.filter((row) => row.bucket === Number(bucket));
  }, [rows, bucket]);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-brand/10 bg-brand/5 p-4 text-sm leading-6 text-slate-700">
        A month after a student leaves, call to ask how they are and whether they would like to come back. If they want to rejoin, add a
        &ldquo;Wants to rejoin&rdquo; follow-up on the call and the admins get a task.
      </div>
      <div className="flex flex-wrap gap-1 rounded-xl border border-brand/10 bg-white p-1 shadow-sm">
        {BUCKETS.map((item) => (
          <button key={item.key} type="button" onClick={() => setBucket(item.key)} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${bucket === item.key ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            {item.label}
            {rows && item.key === "due" ? ` (${rows.filter((row) => row.due).length})` : ""}
          </button>
        ))}
      </div>
      {!rows && <Empty title="Loading…" />}
      {rows && !shown.length && <Empty title="Nobody here" hint="Students who left in the last four months show up here." />}
      {shown.map((row) => (
        <div key={row._id} className="rounded-2xl border border-brand/10 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-black text-slate-950">{row.name}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">Left {row.daysSinceLeft}d ago</span>
            {row.due && <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-bold text-brand">Due a call</span>}
            <span className="ml-auto flex items-center gap-2">
              {row.phone && <span className="text-xs text-slate-500">{row.phone}</span>}
              {canManage && (
                <Link href={`/admin/retention/call/${row._id}?kind=win_back`} className="btn btn-primary !px-3 !py-1.5 text-xs">
                  <Phone size={14} /> Call
                </Link>
              )}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>Left on {formatDate(row.leftAt)}</span>
            <span>Reason: <span className="font-semibold text-slate-700">{row.reason}</span>{row.reasonNote ? ` - ${row.reasonNote}` : ""}</span>
            {row.parentName && <span>Parent: {row.parentName}</span>}
            <span>{row.lastCall ? `Last call ${formatDate(row.lastCall.at)}: ${row.lastCall.kind}, ${row.lastCall.outcome.toLowerCase()}` : "No call since"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
