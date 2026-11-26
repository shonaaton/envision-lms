"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarClock,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  Search,
  ShieldAlert,
  Star,
  Trash2,
  UserCheck,
  UserPlus,
  X,
  XCircle,
} from "lucide-react";
import { APPLICATION_STAGES, BASIC_FIELDS, HIRE_ACCOUNT_ROLES, answerText, stageLabel } from "@/lib/careers/careersConfig";
import type { ApplicationView } from "@/lib/careers/careersService";
import InvitesPanel from "@/components/admin/careers/InvitesPanel";

type PostingOption = { id: string; title: string; hireRole: string; hireAccessRole: string | null; accepting?: boolean };

const TONE: Record<string, string> = {
  sky: "bg-sky-100 text-sky-800",
  violet: "bg-violet-100 text-violet-800",
  amber: "bg-amber-100 text-amber-800",
  teal: "bg-teal-100 text-teal-800",
  emerald: "bg-emerald-100 text-emerald-800",
  rose: "bg-rose-100 text-rose-700",
  slate: "bg-slate-100 text-slate-700",
};
const stageTone = (stage: string) => TONE[APPLICATION_STAGES.find((item) => item.value === stage)?.tone || "slate"];
const inputClass = "h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand";

function when(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export default function ApplicationsClient({
  postings,
  accessRoles,
  canEdit,
  canHire,
  canDelete,
  canExport,
  isSuperAdmin,
}: {
  postings: PostingOption[];
  accessRoles: { id: string; name: string }[];
  canEdit: boolean;
  canHire: boolean;
  canDelete: boolean;
  canExport: boolean;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const rawSearchParams = useSearchParams();
  const searchParams = useMemo(() => rawSearchParams ?? new URLSearchParams(), [rawSearchParams]);
  const filters = useMemo(
    () => ({ posting: searchParams.get("posting") || "", stage: searchParams.get("stage") || "active", q: searchParams.get("q") || "", from: searchParams.get("from") || "", to: searchParams.get("to") || "" }),
    [searchParams]
  );
  const openId = searchParams.get("id") || "";
  const view = searchParams.get("view") === "invites" ? "invites" : "applications";
  const [inviteOpen, setInviteOpen] = useState(false);
  const [rows, setRows] = useState<ApplicationView[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(filters.q);
  const [open, setOpen] = useState<ApplicationView | null>(null);

  const query = useCallback((next: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    return `${pathname}?${params.toString()}`;
  }, [pathname, searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ ...filters, stage: filters.stage === "all" ? "" : filters.stage });
    const response = await fetch(`/api/admin/careers/applications?${params}`, { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      setRows(payload.applications);
      setCounts(payload.stageCounts);
    } else toast.error("Could not load applications.");
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!openId) return setOpen(null);
    const local = rows.find((row) => row.id === openId);
    if (local) return setOpen(local);
    void fetch(`/api/admin/careers/applications/${openId}`, { cache: "no-store" }).then(async (response) => {
      if (response.ok) setOpen((await response.json()).application);
    });
  }, [openId, rows]);

  function replaceRow(application: ApplicationView) {
    setRows((current) => current.map((row) => (row.id === application.id ? application : row)));
    setOpen(application);
  }

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const active = ["new", "shortlisted", "interview", "offered"].reduce((sum, key) => sum + (counts[key] || 0), 0);

  return (
    <div className="space-y-4 p-2 text-slate-950">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin/careers" className="text-xs font-black text-brand hover:underline">Job openings</Link>
          <h1 className="text-3xl font-black text-brand">Applications</h1>
          <p className="text-sm text-slate-600">Only applications whose WhatsApp code was entered (or could not be sent) appear here.</p>
        </div>
        <div className="flex flex-wrap gap-2">
        {canEdit ? (
          <button
            className="btn-primary"
            onClick={() => {
              if (view !== "invites") router.replace(query({ view: "invites", id: "" }));
              setInviteOpen(true);
            }}
          >
            <UserPlus size={15} /> Invite applicants
          </button>
        ) : null}
        {canExport && view === "applications" ? (
          <a href={`/api/admin/careers/applications/export?${new URLSearchParams({ ...filters, stage: filters.stage === "all" ? "" : filters.stage })}`} className="btn-outline">
            <Download size={15} /> Excel
          </a>
        ) : null}
        </div>
      </header>

      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-sm font-black">
        {([["applications", "Applications"], ["invites", "Invited"]] as const).map(([value, label]) => (
          <button
            key={value}
            onClick={() => router.replace(query({ view: value === "invites" ? "invites" : "", id: "" }))}
            className={`rounded-lg px-4 py-1.5 ${view === value ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "invites" ? (
        <>
          <select className={inputClass} value={filters.posting} onChange={(event) => router.replace(query({ posting: event.target.value }))}>
            <option value="">All openings</option>
            {postings.map((posting) => <option key={posting.id} value={posting.id}>{posting.title}</option>)}
          </select>
          <InvitesPanel
            postings={postings}
            posting={filters.posting}
            canEdit={canEdit}
            canDelete={canDelete}
            inviteOpen={inviteOpen}
            setInviteOpen={setInviteOpen}
            onOpenApplication={(id) => router.replace(query({ view: "", stage: "all", id }))}
          />
        </>
      ) : (
      <>

      <div className="flex flex-wrap gap-2">
        {[{ value: "active", label: "In progress", count: active }, ...APPLICATION_STAGES.map((stage) => ({ value: stage.value, label: stage.label, count: counts[stage.value] || 0 })), { value: "all", label: "All", count: total }].map((chip) => (
          <button
            key={chip.value}
            onClick={() => router.replace(query({ stage: chip.value, id: "" }))}
            className={`rounded-full border px-3 py-1.5 text-sm font-black ${filters.stage === chip.value ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {chip.label} <span className="opacity-70">{chip.count}</span>
          </button>
        ))}
      </div>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          router.replace(query({ q: search.trim(), id: "" }));
        }}
      >
        <select className={inputClass} value={filters.posting} onChange={(event) => router.replace(query({ posting: event.target.value, id: "" }))}>
          <option value="">All openings</option>
          {postings.map((posting) => <option key={posting.id} value={posting.id}>{posting.title}</option>)}
        </select>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={`${inputClass} w-64 pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, phone, email, city" />
        </div>
        <input type="date" className={inputClass} value={filters.from} onChange={(event) => router.replace(query({ from: event.target.value }))} aria-label="From" />
        <input type="date" className={inputClass} value={filters.to} onChange={(event) => router.replace(query({ to: event.target.value }))} aria-label="To" />
        <button className="btn-outline h-10">Search</button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Applicant</th>
              <th className="px-4 py-3">Opening</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Rating</th>
              <th className="px-4 py-3">Applied</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} onClick={() => router.replace(query({ id: row.id }))} className={`cursor-pointer hover:bg-violet-50/50 ${openId === row.id ? "bg-violet-50" : ""}`}>
                <td className="px-4 py-3">
                  <div className="font-black">{row.name}</div>
                  <div className="text-xs text-slate-500">{[row.city, row.experienceYears != null ? `${row.experienceYears} yrs` : "", row.chessRating ? `Rating ${row.chessRating}` : ""].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="px-4 py-3">{row.postingTitle}</td>
                <td className="px-4 py-3 text-xs">
                  <div className="flex items-center gap-1">{row.countryCode} {row.phone}{row.whatsappVerified ? <CheckCircle2 size={13} className="text-emerald-600" aria-label="WhatsApp verified" /> : <ShieldAlert size={13} className="text-amber-600" aria-label="Not verified" />}</div>
                  <div className="text-slate-500">{row.email}</div>
                </td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-black ${stageTone(row.stage)}`}>{stageLabel(row.stage)}</span></td>
                <td className="px-4 py-3"><Stars value={row.rating} /></td>
                <td className="px-4 py-3 text-xs text-slate-500">{when(row.createdAt)}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No applications match.</td></tr>
            ) : null}
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400"><Loader2 className="mx-auto animate-spin" /></td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      </>
      )}

      {open ? (
        <Drawer
          application={open}
          posting={postings.find((posting) => posting.id === open.posting)}
          accessRoles={accessRoles}
          canEdit={canEdit}
          canHire={canHire}
          canDelete={canDelete}
          isSuperAdmin={isSuperAdmin}
          onClose={() => router.replace(query({ id: "" }))}
          onChange={replaceRow}
          onDeleted={() => {
            setRows((current) => current.filter((row) => row.id !== open.id));
            router.replace(query({ id: "" }));
          }}
        />
      ) : null}
    </div>
  );
}

function Stars({ value, onChange }: { value: number; onChange?: (value: number) => void }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onChange} onClick={(event) => { event.stopPropagation(); onChange?.(n === value ? 0 : n); }} aria-label={`${n} stars`} className={onChange ? "p-0.5" : "cursor-default"}>
          <Star size={onChange ? 18 : 13} className={value >= n ? "fill-amber-400 text-amber-500" : "text-slate-300"} />
        </button>
      ))}
    </span>
  );
}

function Drawer({
  application,
  posting,
  accessRoles,
  canEdit,
  canHire,
  canDelete,
  isSuperAdmin,
  onClose,
  onChange,
  onDeleted,
}: {
  application: ApplicationView;
  posting?: PostingOption;
  accessRoles: { id: string; name: string }[];
  canEdit: boolean;
  canHire: boolean;
  canDelete: boolean;
  isSuperAdmin: boolean;
  onClose: () => void;
  onChange: (application: ApplicationView) => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [panel, setPanel] = useState<"" | "interview" | "hire" | "reject">("");
  const [notify, setNotify] = useState(true);
  const [interview, setInterview] = useState({ date: "", time: "16:00", link: "", note: "" });
  const [hire, setHire] = useState({ accountRole: posting?.hireRole || "instructor", accessRole: posting?.hireAccessRole || "", email: application.email });

  useEffect(() => {
    setPanel("");
    setNote("");
    setNotify(true);
    setHire({ accountRole: posting?.hireRole || "instructor", accessRole: posting?.hireAccessRole || "", email: application.email });
  }, [application.id, application.email, posting?.hireRole, posting?.hireAccessRole]);

  async function patch(body: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/careers/applications/${application.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Could not save.");
      if (payload.application) onChange(payload.application);
      if (success) toast.success(payload.note ? `${success} ${payload.note}.` : success);
      setPanel("");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Permanently delete ${application.name}'s application and resume? This cannot be undone.`)) return;
    setBusy(true);
    const response = await fetch(`/api/admin/careers/applications/${application.id}`, { method: "DELETE" });
    setBusy(false);
    if (response.ok) {
      toast.success("Application deleted.");
      onDeleted();
    } else toast.error("Could not delete it.");
  }

  const closed = ["hired", "rejected", "withdrawn"].includes(application.stage);
  const basics = BASIC_FIELDS.map((field) => ({ label: field.label, value: (application as any)[field.key] })).filter((item) => item.value !== null && item.value !== undefined && item.value !== "");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" onClick={onClose}>
      <aside className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">{application.postingTitle}</p>
            <h2 className="text-2xl font-black">{application.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-black ${stageTone(application.stage)}`}>{stageLabel(application.stage)}</span>
              {canEdit ? <Stars value={application.rating} onChange={(rating) => void patch({ action: "rating", rating }, "")} /> : <Stars value={application.rating} />}
              {!application.whatsappVerified ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-800">WhatsApp not verified</span> : null}
            </div>
          </div>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="flex flex-wrap gap-2 text-sm">
            <a className="btn-outline h-9 px-3" href={`https://wa.me/${`${application.countryCode}${application.phone}`.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><MessageCircle size={14} /> WhatsApp</a>
            <a className="btn-outline h-9 px-3" href={`tel:${application.countryCode}${application.phone}`}><Phone size={14} /> {application.countryCode} {application.phone}</a>
            {application.email ? <a className="btn-outline h-9 px-3" href={`mailto:${application.email}`}><Mail size={14} /> Email</a> : null}
            {application.resume ? (
              <a className="btn-outline h-9 border-violet-200 px-3 text-violet-700" href={`/api/admin/careers/applications/${application.id}/resume`} target="_blank" rel="noreferrer">
                <FileText size={14} /> Resume ({Math.max(1, Math.round(application.resume.size / 1024))} KB)
              </a>
            ) : null}
          </div>

          {application.interviewAt ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <CalendarClock size={14} className="mr-1 inline" /> Interview: <strong>{when(application.interviewAt)} IST</strong>
              {application.interviewLink ? <> · <a href={application.interviewLink} target="_blank" rel="noreferrer" className="underline">{application.interviewLink}</a></> : null}
            </p>
          ) : null}

          {canEdit && !closed ? (
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Move forward</p>
              <div className="flex flex-wrap gap-2">
                {application.stage === "new" ? <button disabled={busy} className="btn-outline h-9 px-3 text-sm" onClick={() => void patch({ action: "stage", stage: "shortlisted", notify: true }, "Shortlisted - applicant messaged.")}>Shortlist</button> : null}
                <button disabled={busy} className="btn-outline h-9 px-3 text-sm" onClick={() => setPanel(panel === "interview" ? "" : "interview")}><CalendarClock size={14} /> {application.interviewAt ? "Reschedule interview" : "Schedule interview"}</button>
                {application.stage !== "offered" ? <button disabled={busy} className="btn-outline h-9 px-3 text-sm" onClick={() => void patch({ action: "stage", stage: "offered", notify: false }, "Marked offered.")}>Mark offered</button> : null}
                {canHire ? <button disabled={busy} className="btn-primary h-9 px-3 text-sm" onClick={() => setPanel(panel === "hire" ? "" : "hire")}><UserCheck size={14} /> Hire</button> : null}
                <button disabled={busy} className="btn-outline h-9 border-rose-200 px-3 text-sm text-rose-700" onClick={() => setPanel(panel === "reject" ? "" : "reject")}><XCircle size={14} /> Reject</button>
              </div>

              {panel === "interview" ? (
                <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" className={inputClass} value={interview.date} onChange={(event) => setInterview({ ...interview, date: event.target.value })} />
                    <input type="time" className={inputClass} value={interview.time} onChange={(event) => setInterview({ ...interview, time: event.target.value })} />
                  </div>
                  <input className={inputClass} placeholder="Meet / Zoom link or address" value={interview.link} onChange={(event) => setInterview({ ...interview, link: event.target.value })} />
                  <input className={inputClass} placeholder="Note for the applicant (optional)" value={interview.note} onChange={(event) => setInterview({ ...interview, note: event.target.value })} />
                  <NotifyBox checked={notify} onChange={setNotify} />
                  <button
                    disabled={busy || !interview.date || !interview.time}
                    className="btn-primary h-9 justify-center text-sm"
                    onClick={() => void patch({ action: "interview", at: new Date(`${interview.date}T${interview.time}:00+05:30`).toISOString(), link: interview.link, note: interview.note, notify }, "Interview saved.")}
                  >
                    Save interview (IST)
                  </button>
                </div>
              ) : null}

              {panel === "reject" ? (
                <div className="mt-3 grid gap-2 rounded-lg bg-rose-50 p-3">
                  <NotifyBox checked={notify} onChange={setNotify} label="Send a polite “not moving forward” message" />
                  <button disabled={busy} className="btn-primary h-9 justify-center bg-rose-600 text-sm hover:bg-rose-700" onClick={() => void patch({ action: "stage", stage: "rejected", notify }, "Rejected.")}>Confirm reject</button>
                </div>
              ) : null}

              {panel === "hire" ? (
                <div className="mt-3 grid gap-2 rounded-lg bg-emerald-50 p-3">
                  <select className={inputClass} value={hire.accountRole} onChange={(event) => setHire({ ...hire, accountRole: event.target.value })}>
                    {HIRE_ACCOUNT_ROLES.map((item) => <option key={item.value} value={item.value} disabled={item.value === "sub-admin" && !isSuperAdmin}>{item.label}{item.value === "sub-admin" && !isSuperAdmin ? " (Super Admin only)" : ""}</option>)}
                  </select>
                  {hire.accountRole === "sub-admin" ? (
                    <select className={inputClass} value={hire.accessRole} onChange={(event) => setHire({ ...hire, accessRole: event.target.value })}>
                      <option value="">Plain sub-admin</option>
                      {accessRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                    </select>
                  ) : null}
                  {hire.accountRole !== "none" ? (
                    <input className={inputClass} type="email" placeholder="Login email" value={hire.email} onChange={(event) => setHire({ ...hire, email: event.target.value })} />
                  ) : null}
                  <p className="text-xs text-emerald-900/80">
                    {hire.accountRole === "none" ? "Marks the applicant hired. No portal login is created." : "Creates the login with a temporary password and sends the welcome email + WhatsApp. An email already on file is linked instead."}
                  </p>
                  <NotifyBox checked={notify} onChange={setNotify} label="Send the congratulations message" />
                  <button disabled={busy} className="btn-primary h-9 justify-center text-sm" onClick={() => void patch({ action: "hire", accountRole: hire.accountRole, accessRole: hire.accessRole || null, email: hire.email, notify }, "Hired.")}>
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />} Confirm hire
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {canEdit && closed && application.stage !== "hired" ? (
            <button disabled={busy} className="btn-outline h-9 px-3 text-sm" onClick={() => void patch({ action: "stage", stage: "shortlisted", notify: false }, "Moved back to Shortlisted.")}>Reopen (move to Shortlisted)</button>
          ) : null}
          {application.convertedUser ? (
            <Link href={`/admin/users?highlight=${application.convertedUser}`} className="inline-flex items-center gap-1 text-sm font-black text-emerald-700 underline"><UserCheck size={14} /> Portal account created</Link>
          ) : null}

          <section>
            <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-slate-500">Details</h3>
            <dl className="grid gap-2 sm:grid-cols-2">
              {basics.map((item) => (
                <div key={item.label} className="rounded-lg bg-slate-50 px-3 py-2">
                  <dt className="text-xs font-bold text-slate-500">{item.label}</dt>
                  <dd className="break-words text-sm font-bold">{/^https?:\/\//.test(String(item.value)) ? <a href={String(item.value)} target="_blank" rel="noreferrer" className="text-brand underline">{String(item.value)}</a> : String(item.value)}</dd>
                </div>
              ))}
            </dl>
          </section>

          {application.answers.length ? (
            <section>
              <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-slate-500">Answers</h3>
              <div className="space-y-2">
                {application.answers.map((answer) => (
                  <div key={answer.questionId} className="rounded-lg border border-slate-200 px-3 py-2">
                    <p className="text-xs font-bold text-slate-500">{answer.question}</p>
                    <p className="whitespace-pre-wrap break-words text-sm">{answer.type === "link" ? <a href={String(answer.answer)} target="_blank" rel="noreferrer" className="text-brand underline">{String(answer.answer)}</a> : answer.type === "consent" ? "✓ Agreed" : answerText(answer.answer)}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-slate-500">Notes &amp; history</h3>
            {canEdit ? (
              <div className="mb-3 flex gap-2">
                <input className={`${inputClass} flex-1`} placeholder="Add an internal note" value={note} onChange={(event) => setNote(event.target.value)} />
                <button disabled={busy || !note.trim()} className="btn-outline h-10" onClick={() => void patch({ action: "note", text: note }, "Note added.").then((ok) => ok && setNote(""))}>Add</button>
              </div>
            ) : null}
            <ol className="space-y-2">
              {application.log.map((entry) => (
                <li key={entry.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <p className="whitespace-pre-wrap">{entry.text}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{entry.byName} · {when(entry.at)}</p>
                </li>
              ))}
            </ol>
          </section>

          {canDelete ? (
            <button disabled={busy} onClick={() => void remove()} className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:underline"><Trash2 size={13} /> Delete application permanently</button>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function NotifyBox({ checked, onChange, label = "Message the applicant (email + WhatsApp)" }: { checked: boolean; onChange: (value: boolean) => void; label?: string }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm font-bold">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> {label}
    </label>
  );
}
