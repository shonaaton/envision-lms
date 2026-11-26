"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, Mail, MessageCircle, RotateCcw, Search, Send, Trash2, Undo2, UserPlus, X } from "lucide-react";
import { DIAL_CODES } from "@/lib/phoneCountryCodes";
import { parseInviteLines } from "@/lib/careers/inviteConfig";
import type { InviteView } from "@/lib/careers/inviteService";

type PostingOption = { id: string; title: string; accepting?: boolean };

const inputClass = "h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand";

const STATUS_CHIPS = [
  { value: "waiting", label: "Not applied" },
  { value: "invited", label: "Not opened" },
  { value: "opened", label: "Opened, not applied" },
  { value: "applied", label: "Applied" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

const STATUS_TONE: Record<string, string> = {
  invited: "bg-slate-100 text-slate-700",
  opened: "bg-amber-100 text-amber-800",
  applied: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-rose-100 text-rose-700",
};
const STATUS_LABEL: Record<string, string> = { invited: "Not opened", opened: "Opened", applied: "Applied", cancelled: "Cancelled" };

function when(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Link copied - paste it into WhatsApp.");
  } catch {
    window.prompt("Copy this link:", text);
  }
}

/**
 * The "Invited" view of /admin/careers/applications: people the team invited
 * to apply, whether they opened the link or applied, and Resend for those who
 * have not. Applying (through the link, or from the same WhatsApp number)
 * moves a row to Applied by itself.
 */
export default function InvitesPanel({
  postings,
  posting,
  canEdit,
  canDelete,
  onOpenApplication,
  inviteOpen,
  setInviteOpen,
}: {
  postings: PostingOption[];
  posting: string;
  canEdit: boolean;
  canDelete: boolean;
  onOpenApplication: (id: string) => void;
  inviteOpen: boolean;
  setInviteOpen: (open: boolean) => void;
}) {
  const [status, setStatus] = useState("waiting");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<InviteView[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/admin/careers/invites?${new URLSearchParams({ posting, status, q })}`, { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      setRows(payload.invites);
      setCounts(payload.counts);
    } else toast.error("Could not load the invites.");
    setLoading(false);
  }, [posting, status, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const resendable = useMemo(() => rows.filter((row) => row.canResend).length, [rows]);

  async function act(row: InviteView, action: "resend" | "cancel" | "restore") {
    setBusyId(row.id);
    try {
      const response = await fetch(`/api/admin/careers/invites/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(payload?.error || "Could not do that.");
      if (action === "resend") {
        const parts = [payload.sent?.whatsapp ? "WhatsApp" : "", payload.sent?.email ? "email" : ""].filter(Boolean);
        toast.success(parts.length ? `Sent again by ${parts.join(" + ")}.` : "Logged, but nothing was delivered - the WhatsApp template may still be off. Copy the link and send it yourself.");
      }
      await load();
    } finally {
      setBusyId("");
    }
  }

  async function remove(row: InviteView) {
    if (!window.confirm(`Delete the invite for ${row.name}? Their link stops filling in the form.`)) return;
    setBusyId(row.id);
    const response = await fetch(`/api/admin/careers/invites/${row.id}`, { method: "DELETE" });
    setBusyId("");
    if (!response.ok) return toast.error("Could not delete the invite.");
    await load();
  }

  async function resendAll() {
    const scope = posting ? `for ${postings.find((item) => item.id === posting)?.title || "this opening"}` : "for every opening";
    if (!window.confirm(`Send the application link again to everyone who has not applied ${scope}? Anyone messaged in the last 24 hours is skipped.`)) return;
    setBulkBusy(true);
    try {
      const response = await fetch("/api/admin/careers/invites/resend-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postingId: posting }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(payload?.error || "Could not resend.");
      toast.success(
        payload.sent
          ? `Resent to ${payload.sent} ${payload.sent === 1 ? "person" : "people"} (${payload.whatsapp} WhatsApp, ${payload.email} email).${payload.skipped ? ` ${payload.skipped} skipped.` : ""}`
          : "Nobody is due a resend right now."
      );
      await load();
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_CHIPS.map((chip) => (
          <button
            key={chip.value}
            onClick={() => setStatus(chip.value)}
            className={`rounded-full border px-3 py-1.5 text-sm font-black ${status === chip.value ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {chip.label} <span className="opacity-70">{counts[chip.value] || 0}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative"
          onSubmit={(event) => {
            event.preventDefault();
            setQ(search.trim());
          }}
        >
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={`${inputClass} w-64 pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, phone, email" />
        </form>
        {canEdit && ["waiting", "invited", "opened"].includes(status) ? (
          <button className="btn-outline h-10" onClick={resendAll} disabled={bulkBusy || !resendable}>
            {bulkBusy ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />} Resend to all not applied{resendable ? ` (${resendable})` : ""}
          </button>
        ) : null}
        <p className="text-xs text-slate-500">One automatic reminder goes 3 days after the invite. Resend waits 24 hours between messages.</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Person</th>
              <th className="px-4 py-3">Opening</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Messages</th>
              <th className="px-4 py-3">Invited</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const last = row.sends[row.sends.length - 1];
              return (
                <tr key={row.id}>
                  <td className="px-4 py-3">
                    <div className="font-black">{row.name}</div>
                    <div className="text-xs text-slate-500">{row.countryCode} {row.phone}{row.email ? ` · ${row.email}` : ""}</div>
                  </td>
                  <td className="px-4 py-3">{row.postingTitle}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-black ${STATUS_TONE[row.status]}`}>{STATUS_LABEL[row.status]}</span>
                    {row.status === "opened" && row.openedAt ? <div className="mt-1 text-xs text-slate-500">{when(row.openedAt)}</div> : null}
                    {row.status === "applied" && row.appliedAt ? <div className="mt-1 text-xs text-slate-500">{when(row.appliedAt)}</div> : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    <div>{row.sendCount} sent{last ? `, last ${when(last.at)}` : ""}</div>
                    {last ? (
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 ${last.whatsapp ? "text-emerald-700" : "text-slate-400"}`} title={last.whatsapp ? "WhatsApp delivered" : "WhatsApp not sent (template off or failed)"}><MessageCircle size={12} /> {last.whatsapp ? "WhatsApp" : "no WhatsApp"}</span>
                        <span className={`inline-flex items-center gap-1 ${last.email ? "text-emerald-700" : "text-slate-400"}`}><Mail size={12} /> {last.email ? "email" : "no email"}</span>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {when(row.createdAt)}
                    {row.createdByName ? <div>by {row.createdByName}</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      {row.status === "applied" && row.application ? (
                        <button className="btn-outline h-8 px-2.5 text-xs" onClick={() => onOpenApplication(row.application!)}>Open application</button>
                      ) : null}
                      {row.link && row.status !== "applied" && row.status !== "cancelled" ? (
                        <button className="btn-outline h-8 px-2.5 text-xs" onClick={() => copy(row.link)} title="Copy their personal form link"><Copy size={13} /> Link</button>
                      ) : null}
                      {canEdit && row.status !== "applied" && row.status !== "cancelled" ? (
                        <button
                          className="btn-outline h-8 px-2.5 text-xs"
                          disabled={busyId === row.id || !row.canResend}
                          title={row.canResend ? "Send the link again" : "Messaged in the last 24 hours"}
                          onClick={() => act(row, "resend")}
                        >
                          {busyId === row.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Resend
                        </button>
                      ) : null}
                      {canEdit && row.status !== "applied" && row.status !== "cancelled" ? (
                        <button className="btn-outline h-8 px-2.5 text-xs" disabled={busyId === row.id} onClick={() => act(row, "cancel")} title="Stop reminders for this person"><X size={13} /></button>
                      ) : null}
                      {canEdit && row.status === "cancelled" ? (
                        <button className="btn-outline h-8 px-2.5 text-xs" disabled={busyId === row.id} onClick={() => act(row, "restore")}><Undo2 size={13} /> Restore</button>
                      ) : null}
                      {canDelete && row.status !== "applied" ? (
                        <button className="btn-outline h-8 px-2.5 text-xs text-rose-700" disabled={busyId === row.id} onClick={() => remove(row)} title="Delete invite"><Trash2 size={13} /></button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No invites here.{canEdit ? " Use Invite applicants to add people." : ""}</td></tr>
            ) : null}
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400"><Loader2 className="mx-auto animate-spin" /></td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {inviteOpen ? (
        <InviteDialog
          postings={postings.filter((item) => item.accepting !== false)}
          defaultPosting={posting}
          onClose={() => setInviteOpen(false)}
          onDone={() => {
            setStatus("waiting");
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

type InviteResult = {
  invited: { name: string; phone: string; whatsapp: boolean; email: boolean }[];
  skipped: { name: string; phone: string; reason: string }[];
  problems: { line: number; text: string; error: string }[];
};

function InviteDialog({ postings, defaultPosting, onClose, onDone }: { postings: PostingOption[]; defaultPosting: string; onClose: () => void; onDone: () => void }) {
  const [postingId, setPostingId] = useState(postings.some((item) => item.id === defaultPosting) ? defaultPosting : postings[0]?.id || "");
  const [mode, setMode] = useState<"one" | "list">("one");
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [list, setList] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);

  const text = mode === "one" ? [name.trim(), phone.replace(/\D/g, ""), email.trim()].filter(Boolean).join(", ") : list;
  const preview = useMemo(() => parseInviteLines(text, countryCode), [text, countryCode]);

  async function send() {
    if (!postingId) return toast.error("Pick the opening first.");
    if (!preview.rows.length) return toast.error(preview.problems[0]?.error || "Add a name and a WhatsApp number.");
    setBusy(true);
    try {
      const response = await fetch("/api/admin/careers/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postingId, text, countryCode }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(payload?.error || "Could not send the invites.");
      setResult(payload);
      if (payload.invited?.length) toast.success(`Invited ${payload.invited.length} ${payload.invited.length === 1 ? "person" : "people"}.`);
      onDone();
      if (mode === "one" && payload.invited?.length) {
        setName("");
        setPhone("");
        setEmail("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-brand">Invite applicants</h2>
            <p className="text-sm text-slate-600">Each person gets a WhatsApp (and an email, if you add one) with their own link to the form. Their name and number are filled in for them.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
        </div>

        {postings.length === 0 ? (
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">No opening is taking applications. Open one on the Job openings page first.</p>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-bold">
              Opening
              <select className={`${inputClass} mt-1 w-full`} value={postingId} onChange={(event) => setPostingId(event.target.value)}>
                {postings.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </label>

            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-sm font-black">
              {(["one", "list"] as const).map((value) => (
                <button key={value} onClick={() => { setMode(value); setResult(null); }} className={`rounded-md px-3 py-1.5 ${mode === value ? "bg-brand text-white" : "text-slate-600"}`}>
                  {value === "one" ? "One person" : "Paste a list"}
                </button>
              ))}
            </div>

            {mode === "one" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-bold sm:col-span-2">
                  Name
                  <input className={`${inputClass} mt-1 w-full`} value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" />
                </label>
                <label className="block text-sm font-bold sm:col-span-2">
                  WhatsApp number
                  <div className="mt-1 flex gap-2">
                    <select className={`${inputClass} w-28`} value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>
                      {DIAL_CODES.map((entry) => <option key={entry.code} value={`+${entry.code}`}>+{entry.code} {entry.country}</option>)}
                    </select>
                    <input className={`${inputClass} flex-1`} value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" placeholder="98765 43210" />
                  </div>
                </label>
                <label className="block text-sm font-bold sm:col-span-2">
                  Email <span className="font-normal text-slate-500">(optional)</span>
                  <input className={`${inputClass} mt-1 w-full`} value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="name@example.com" />
                </label>
              </div>
            ) : (
              <label className="block text-sm font-bold">
                One person per line: name, WhatsApp number, email (optional)
                <textarea
                  className="mt-1 h-40 w-full rounded-lg border border-slate-200 p-3 font-mono text-xs outline-none focus:border-brand"
                  value={list}
                  onChange={(event) => setList(event.target.value)}
                  placeholder={"Priya Sen, 9123456789, priya@example.com\nRahul Das, 8123456789\nAmy Clark, +44 7911 123456"}
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Copying rows from Excel or Google Sheets works. Numbers without + use {countryCode}. {preview.rows.length} ready
                  {preview.problems.length ? `, ${preview.problems.length} need fixing` : ""}.
                </span>
              </label>
            )}

            {mode === "list" && preview.problems.length ? (
              <ul className="max-h-28 overflow-y-auto rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                {preview.problems.map((problem) => <li key={problem.line}>Line {problem.line}: {problem.error} <span className="text-amber-700">({problem.text})</span></li>)}
              </ul>
            ) : null}

            {result ? (
              <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-xs">
                {result.invited.map((row) => (
                  <div key={row.phone} className="text-emerald-800">
                    Invited {row.name} ({row.phone}) - {[row.whatsapp ? "WhatsApp" : "", row.email ? "email" : ""].filter(Boolean).join(" + ") || "nothing delivered yet (WhatsApp template off) - copy the link from the list"}
                  </div>
                ))}
                {result.skipped.map((row) => <div key={row.phone} className="text-slate-600">Skipped {row.name} ({row.phone}): {row.reason}</div>)}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-outline" onClick={onClose}>Close</button>
              <button className="btn-primary" onClick={send} disabled={busy || !preview.rows.length}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Send {preview.rows.length > 1 ? `${preview.rows.length} invites` : "invite"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
