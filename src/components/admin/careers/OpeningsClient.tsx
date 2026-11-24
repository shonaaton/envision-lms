"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Briefcase, Copy, ExternalLink, Eye, EyeOff, Pencil, Plus, Trash2, Users } from "lucide-react";
import { EMPLOYMENT_TYPES, JOB_DEPARTMENTS, WORK_MODES, labelOf } from "@/lib/careers/careersConfig";
import type { PostingView } from "@/lib/careers/careersService";

type Row = PostingView & { applicationCount: number; newCount: number; accepting: boolean };

const STATUS_STYLE: Record<string, string> = {
  open: "bg-emerald-100 text-emerald-800",
  draft: "bg-slate-100 text-slate-700",
  closed: "bg-rose-100 text-rose-700",
};

export default function OpeningsClient({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState("");

  async function reload() {
    const response = await fetch("/api/admin/careers/postings", { cache: "no-store" });
    if (response.ok) setRows((await response.json()).postings);
  }

  async function act(id: string, method: string, body?: unknown) {
    setBusy(id);
    try {
      const response = await fetch(`/api/admin/careers/postings/${id}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Could not do that.");
      return payload;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not do that.");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function setStatus(row: Row, status: string) {
    if (await act(row.id, "PATCH", { action: "status", status })) {
      toast.success(status === "open" ? "Opening is live on /careers." : status === "closed" ? "Opening closed." : "Moved to draft.");
      await reload();
    }
  }

  async function duplicate(row: Row) {
    const result = await act(row.id, "PATCH", { action: "duplicate" });
    if (result?.id) {
      toast.success("Copied as a draft.");
      router.push(`/admin/careers/openings/${result.id}`);
    }
  }

  async function remove(row: Row) {
    if (!window.confirm(`Delete "${row.title}"? This cannot be undone.`)) return;
    if (await act(row.id, "DELETE")) {
      toast.success("Opening deleted.");
      await reload();
    }
  }

  return (
    <div className="space-y-5 p-2 text-slate-950">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-violet-700">
            <Briefcase size={14} /> Careers
          </p>
          <h1 className="mt-2 text-3xl font-black text-brand">Job Openings</h1>
          <p className="mt-1 text-sm text-slate-600">
            Open roles show on the public <Link href="/careers" target="_blank" className="font-bold text-brand underline">/careers</Link> page. Each opening has its own questions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/careers/applications" className="btn-outline"><Users size={15} /> Applications</Link>
          <Link href="/admin/careers/openings/new" className="btn-primary"><Plus size={15} /> New opening</Link>
        </div>
      </header>

      <section className="grid gap-3">
        {rows.map((row) => (
          <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-black">{row.title}</h2>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-black uppercase ${STATUS_STYLE[row.status]}`}>{row.status}</span>
                  {row.status === "open" && !row.accepting ? <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-black text-amber-800">Past closing date</span> : null}
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {labelOf(JOB_DEPARTMENTS, row.department)} · {labelOf(EMPLOYMENT_TYPES, row.employmentType)} · {row.location || labelOf(WORK_MODES, row.workMode)} · {row.questions.filter((q) => q.active).length} questions · resume {row.resume}
                </p>
                <p className="mt-2 max-w-3xl text-sm text-slate-700">{row.summary}</p>
              </div>
              <Link href={`/admin/careers/applications?posting=${row.id}`} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-center hover:bg-slate-100">
                <span className="block text-xl font-black text-brand">{row.applicationCount}</span>
                <span className="block text-xs font-bold text-slate-500">applications{row.newCount ? ` · ${row.newCount} new` : ""}</span>
              </Link>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              <Link href={`/admin/careers/openings/${row.id}`} className="btn-outline h-9 px-3 text-sm"><Pencil size={14} /> Edit</Link>
              {row.status !== "open" ? (
                <button disabled={busy === row.id} onClick={() => void setStatus(row, "open")} className="btn-outline h-9 border-emerald-200 px-3 text-sm text-emerald-700"><Eye size={14} /> Publish</button>
              ) : (
                <button disabled={busy === row.id} onClick={() => void setStatus(row, "closed")} className="btn-outline h-9 px-3 text-sm"><EyeOff size={14} /> Close</button>
              )}
              {row.status === "open" ? (
                <Link href={`/careers/${row.slug}`} target="_blank" className="btn-outline h-9 px-3 text-sm"><ExternalLink size={14} /> View live</Link>
              ) : null}
              <button disabled={busy === row.id} onClick={() => void duplicate(row)} className="btn-outline h-9 px-3 text-sm"><Copy size={14} /> Duplicate</button>
              {row.applicationCount === 0 ? (
                <button disabled={busy === row.id} onClick={() => void remove(row)} className="btn-outline h-9 border-rose-200 px-3 text-sm text-rose-700"><Trash2 size={14} /> Delete</button>
              ) : null}
            </div>
          </article>
        ))}
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No openings yet. <Link href="/admin/careers/openings/new" className="font-bold text-brand underline">Create the first one</Link> - for example a chess coach or a sales counsellor.
          </div>
        ) : null}
      </section>
    </div>
  );
}
