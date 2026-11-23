"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Inbox,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Send,
  Trophy,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import LocalTime, { type LocalTimeInfo } from "@/components/LocalTime";
import { Empty, Stat, formatDate, formatDateTime, monthLabel } from "@/components/admin/retention/shared";
import { INDIAN_STATES, placeIncomplete, placeLabel, suggestState } from "@/lib/retention/tournamentDetailsRules";

type SendInfo = { sentAt: string; sentByName: string; note: string };
type Row = {
  _id: string;
  name: string;
  parentName: string;
  parentEmail: string;
  phone: string;
  localTime: LocalTimeInfo;
  dial: string;
  city: string;
  state: string;
  country: string;
  suggestedState: string;
  age: number | null;
  level: string;
  paused: boolean;
  coaches: string[];
  history: Record<string, SendInfo>;
};
type Request = {
  _id: string;
  monthKey: string;
  city: string;
  state: string;
  country: string;
  place: string;
  note: string;
  studentIds: string[];
  requestedByName: string;
  status: "open" | "answered" | "cancelled";
  reply: string;
  answeredAt: string | null;
  answeredByName: string;
  createdAt: string;
};
type Board = {
  monthKey: string;
  currentMonthKey: string;
  months: string[];
  summary: { students: number; sent: number; pending: number; missingPlace: number; openRequests: number };
  rows: Row[];
  requests: Request[];
  viewer: { isOwner: boolean; isRequestOwner: boolean };
};
type View = "send" | "record" | "requests";
type Place = { city: string; state: string; country: string };

const LEVEL_LABEL: Record<string, string> = {
  absolute_beginner: "Absolute beginner",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  federated: "Federated",
};

const MISSING = "__missing__";

function placeKey(place: Place) {
  if (!place.city && !place.state && !place.country) return MISSING;
  return [place.country, place.state, place.city].map((part) => part.toLowerCase()).join("|");
}

function lastMonths(currentMonthKey: string, count = 12) {
  const [year, month] = currentMonthKey.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

function shortMonth(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
}

async function copy(text: string, what = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(what);
  } catch {
    toast.error("Could not copy - select and copy it by hand.");
  }
}

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/retention/tournaments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    toast.error(result.error || "Could not save.");
    return null;
  }
  if (result.message) toast.success(result.message);
  return result;
}

export default function TournamentDetailsBoard({ canManage }: { canManage: boolean }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [month, setMonth] = useState("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>("send");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"pending" | "sent" | "all">("pending");
  const [country, setCountry] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openStudent, setOpenStudent] = useState<string>("");
  const [bulk, setBulk] = useState<{ ids: string[]; title: string } | null>(null);
  const [requestFor, setRequestFor] = useState<{ place: Place; studentIds: string[] } | null>(null);
  const [focusRequest, setFocusRequest] = useState("");

  const load = useCallback(async (monthKey: string) => {
    setLoading(true);
    const response = await fetch(`/api/admin/retention/tournaments${monthKey ? `?month=${monthKey}` : ""}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) return toast.error(body.error || "Could not load tournament details.");
    setBoard(body);
  }, []);

  useEffect(() => {
    let initialMonth = "";
    try {
      const params = new URL(window.location.href).searchParams;
      initialMonth = params.get("month") || "";
      const request = params.get("request") || "";
      if (request) {
        setFocusRequest(request);
        setView("requests");
      }
    } catch {
      // Opens on this month.
    }
    setMonth(initialMonth);
    load(initialMonth);
  }, [load]);

  function changeMonth(next: string) {
    setMonth(next);
    setSelected(new Set());
    load(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("month", next);
      window.history.replaceState(null, "", url.toString());
    } catch {
      // Only the shareable URL is skipped.
    }
  }

  const monthKey = board?.monthKey || month;
  const reload = useCallback(() => load(monthKey), [load, monthKey]);

  const countries = useMemo(() => Array.from(new Set((board?.rows || []).map((row) => row.country).filter(Boolean))).sort(), [board]);
  const states = useMemo(
    () => Array.from(new Set((board?.rows || []).filter((row) => !country || row.country === country).map((row) => row.state).filter(Boolean))).sort(),
    [board, country]
  );

  const filtered = useMemo(() => {
    if (!board) return [];
    const term = search.trim().toLowerCase();
    return board.rows.filter((row) => {
      const sent = Boolean(row.history[board.monthKey]);
      if (view === "send" && status === "pending" && sent) return false;
      if (view === "send" && status === "sent" && !sent) return false;
      if (country && row.country !== country) return false;
      if (stateFilter && row.state !== stateFilter) return false;
      if (onlyMissing && !placeIncomplete(row)) return false;
      if (term && ![row.name, row.parentName, row.phone, row.city, row.state, row.country].join(" ").toLowerCase().includes(term)) return false;
      return true;
    });
  }, [board, view, status, country, stateFilter, onlyMissing, search]);

  /** Answered requests for this month, by place: the tournaments to send are right in the group. */
  const answers = useMemo(() => {
    const map = new Map<string, Request>();
    (board?.requests || []).forEach((request) => {
      if (request.monthKey !== board?.monthKey || request.status === "cancelled") return;
      const key = placeKey(request);
      const known = map.get(key);
      if (!known || (request.status === "answered" && known.status !== "answered")) map.set(key, request);
    });
    return map;
  }, [board]);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; place: Place; rows: Row[] }>();
    filtered.forEach((row) => {
      const place = { city: row.city, state: row.state, country: row.country };
      const key = placeKey(place);
      const group = map.get(key) || { key, place, rows: [] };
      group.rows.push(row);
      map.set(key, group);
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.key === MISSING) return -1;
      if (b.key === MISSING) return 1;
      return b.rows.length - a.rows.length || placeLabel(a.place).localeCompare(placeLabel(b.place));
    });
  }, [filtered]);

  const student = board?.rows.find((row) => row._id === openStudent) || null;
  const isCurrent = board ? board.monthKey === board.currentMonthKey : true;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function quickMark(id: string) {
    if (await post({ action: "mark_sent", monthKey, studentIds: [id] })) reload();
  }

  if (!board) return <Empty title={loading ? "Loading tournament details…" : "Could not load tournament details."} />;

  const percent = board.summary.students ? Math.round((board.summary.sent / board.summary.students) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Month, progress and the three views */}
      <div className="rounded-2xl border border-brand/10 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Trophy size={18} className="text-amber-500" />
              <h2 className="text-lg font-black text-slate-950">Tournament details · {monthLabel(board.monthKey)}</h2>
              <select className="input w-auto !py-1 text-sm" value={board.monthKey} onChange={(event) => changeMonth(event.target.value)} aria-label="Month">
                {lastMonths(board.currentMonthKey).map((key) => <option key={key} value={key}>{monthLabel(key)}</option>)}
              </select>
              <button type="button" className="btn btn-outline !py-1" onClick={reload} disabled={loading}>
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Each month, send every family the chess tournaments near them. Students are grouped by place, so one list goes to a whole city at once.
              {board.viewer.isOwner && isCurrent ? " This is your monthly task; it closes by itself once everyone is ticked off." : ""}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-2.5 w-full max-w-md overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
              </div>
              <span className="text-sm font-bold tabular-nums text-slate-700">{board.summary.sent}/{board.summary.students} sent · {percent}%</span>
            </div>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[440px]">
            <Stat label="To send" value={board.summary.pending} icon={<Send size={15} />} />
            <Stat label="Sent" value={board.summary.sent} icon={<CheckCircle2 size={15} />} />
            <button type="button" className="text-left" onClick={() => { setView("send"); setOnlyMissing((value) => !value); setStatus("all"); }}>
              <Stat label="No place" value={board.summary.missingPlace} icon={<MapPin size={15} />} hint={onlyMissing ? "showing these" : "tap to show"} />
            </button>
            <button type="button" className="text-left" onClick={() => setView("requests")}>
              <Stat label="Requests" value={board.summary.openRequests} icon={<Inbox size={15} />} hint="open, to Saptarshi" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-brand/10 bg-white p-1 shadow-sm">
          {([
            ["send", "Send this month"],
            ["record", "Monthly record"],
            ["requests", `Requests${board.summary.openRequests ? ` (${board.summary.openRequests})` : ""}`],
          ] as Array<[View, string]>).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${view === key ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {canManage && (
          <button type="button" className="btn btn-outline ml-auto" onClick={() => setRequestFor({ place: { city: "", state: "", country: "India" }, studentIds: [] })}>
            <Inbox size={15} /> Request tournaments from Saptarshi
          </button>
        )}
      </div>

      {view !== "requests" && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input !pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student, parent, phone or place" />
          </label>
          {view === "send" && (
            <select className="input w-auto" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="Status">
              <option value="pending">Not sent yet</option>
              <option value="sent">Sent</option>
              <option value="all">Everyone</option>
            </select>
          )}
          <select className="input w-auto" value={country} onChange={(event) => { setCountry(event.target.value); setStateFilter(""); }} aria-label="Country">
            <option value="">All countries</option>
            {countries.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <select className="input w-auto" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)} aria-label="State">
            <option value="">All states</option>
            {states.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          {onlyMissing && (
            <button type="button" className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800" onClick={() => setOnlyMissing(false)}>
              Place missing only <X size={12} />
            </button>
          )}
        </div>
      )}

      {view === "send" && canManage && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm">
          <span className="font-bold text-emerald-900">{selected.size} selected</span>
          <button type="button" className="btn btn-primary !py-1" onClick={() => setBulk({ ids: Array.from(selected), title: `${selected.size} selected students` })}>
            <Check size={14} /> Mark as sent
          </button>
          <button type="button" className="text-xs font-semibold text-slate-600 hover:underline" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {view === "send" && (
        groups.length ? (
          <div className="space-y-3">
            {groups.map((group) => {
              const missing = group.key === MISSING;
              const pendingIds = group.rows.filter((row) => !row.history[board.monthKey]).map((row) => row._id);
              const sentHere = group.rows.length - pendingIds.length;
              const answer = missing ? undefined : answers.get(group.key);
              return (
                <section key={group.key} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${missing ? "border-amber-200" : "border-brand/10"}`}>
                  <header className={`flex flex-wrap items-center gap-2 px-4 py-3 ${missing ? "bg-amber-50" : "bg-slate-50"}`}>
                    {missing ? <AlertTriangle size={16} className="text-amber-600" /> : <MapPin size={16} className="text-brand" />}
                    <div className="min-w-0">
                      <h3 className="font-black text-slate-900">{missing ? "Place not on file" : placeLabel(group.place)}</h3>
                      <p className="text-xs text-slate-500">
                        {missing
                          ? "Ask the parent where they live and fill it in from the student's pop-up."
                          : `${group.rows.length} student${group.rows.length === 1 ? "" : "s"} · ${sentHere} sent`}
                      </p>
                    </div>
                    {canManage && !missing && (
                      <div className="ml-auto flex flex-wrap gap-1.5">
                        {pendingIds.length > 0 && (
                          <>
                            <button type="button" className="btn btn-outline !py-1 text-xs" onClick={() => setSelected((current) => new Set([...Array.from(current), ...pendingIds]))}>
                              Select {pendingIds.length} not sent
                            </button>
                            <button type="button" className="btn btn-primary !py-1 text-xs" onClick={() => setBulk({ ids: pendingIds, title: placeLabel(group.place) })}>
                              <Check size={13} /> Mark all sent
                            </button>
                          </>
                        )}
                        {!answer && (
                          <button type="button" className="btn btn-outline !py-1 text-xs" onClick={() => setRequestFor({ place: group.place, studentIds: group.rows.map((row) => row._id) })}>
                            <Inbox size={13} /> No tournaments? Request
                          </button>
                        )}
                      </div>
                    )}
                  </header>
                  {answer && (
                    <div className={`border-t px-4 py-2.5 text-sm ${answer.status === "answered" ? "border-emerald-100 bg-emerald-50/60" : "border-brand/10 bg-brand/5"}`}>
                      {answer.status === "answered" ? (
                        <div className="flex flex-wrap items-start gap-2">
                          <Trophy size={15} className="mt-0.5 text-emerald-700" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-emerald-800">Tournaments from {answer.answeredByName || "Saptarshi"} · {formatDate(answer.answeredAt)}</p>
                            <p className="whitespace-pre-line text-slate-800">{answer.reply}</p>
                          </div>
                          <button type="button" className="btn btn-outline !py-1 text-xs" onClick={() => copy(answer.reply, "Tournament list copied")}>
                            <Copy size={13} /> Copy
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs font-semibold text-brand">Asked Saptarshi on {formatDate(answer.createdAt)} - waiting for the tournament list.</p>
                      )}
                    </div>
                  )}
                  <ul className="divide-y divide-slate-100">
                    {group.rows.map((row) => {
                      const sent = row.history[board.monthKey];
                      return (
                        <li key={row._id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                          {canManage && !sent && (
                            <input type="checkbox" className="h-4 w-4 accent-brand" checked={selected.has(row._id)} onChange={() => toggle(row._id)} aria-label={`Select ${row.name}`} />
                          )}
                          <button type="button" className="min-w-[160px] flex-1 text-left" onClick={() => setOpenStudent(row._id)}>
                            <span className="font-bold text-slate-900 hover:text-brand hover:underline">{row.name}</span>
                            {row.paused && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">Paused</span>}
                            <span className="block text-xs text-slate-500">
                              {row.parentName ? `Parent: ${row.parentName}` : "Parent name missing"}
                              {!missing && placeIncomplete(row) ? ` · ${row.city ? "state" : "city"} missing` : ""}
                            </span>
                          </button>
                          <div className="flex items-center gap-1.5 text-xs text-slate-600">
                            {row.phone ? (
                              <>
                                <span className="tabular-nums">{row.phone}</span>
                                <button type="button" className="rounded p-1 hover:bg-slate-100" onClick={() => copy(row.phone, "Number copied")} title="Copy number"><Copy size={13} /></button>
                                {row.dial && (
                                  <a className="rounded p-1 text-emerald-600 hover:bg-emerald-50" href={`https://wa.me/${row.dial}`} target="_blank" rel="noreferrer" title="Open WhatsApp chat">
                                    <MessageCircle size={14} />
                                  </a>
                                )}
                              </>
                            ) : (
                              <span className="text-amber-700">No phone</span>
                            )}
                            <LocalTime info={row.localTime} edit={{ target: "user", id: row._id }} />
                          </div>
                          <div className="flex min-w-[130px] items-center justify-end gap-2">
                            {sent ? (
                              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800" title={sent.note || undefined}>
                                Sent {formatDate(sent.sentAt)}
                              </span>
                            ) : canManage ? (
                              <button type="button" className="btn btn-outline !py-1 text-xs" onClick={() => quickMark(row._id)}>
                                <Check size={13} /> Sent
                              </button>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">Not sent</span>
                            )}
                            <button type="button" className="text-xs font-semibold text-brand hover:underline" onClick={() => setOpenStudent(row._id)}>Details</button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : (
          <Empty
            title={status === "pending" && !search && !country && !stateFilter && !onlyMissing ? `Everyone has this month's tournament details.` : "No students match."}
            hint={status === "pending" ? "Switch the filter to \"Sent\" or \"Everyone\" to see them." : undefined}
          />
        )
      )}

      {view === "record" && <MonthlyRecord rows={filtered} months={board.months} onOpen={setOpenStudent} />}

      {view === "requests" && (
        <Requests requests={board.requests} canManage={canManage} highlight={board.viewer.isRequestOwner} focusId={focusRequest} onChanged={reload} />
      )}

      {student && (
        <StudentPopup
          row={student}
          monthKey={board.monthKey}
          months={board.months}
          canManage={canManage}
          answer={answers.get(placeKey(student))}
          onClose={() => setOpenStudent("")}
          onChanged={reload}
          onRequest={(place) => {
            setOpenStudent("");
            setRequestFor({ place, studentIds: [student._id] });
          }}
        />
      )}

      {bulk && (
        <BulkSentDialog
          title={bulk.title}
          count={bulk.ids.length}
          monthKey={board.monthKey}
          onClose={() => setBulk(null)}
          onSave={async (note) => {
            if (await post({ action: "mark_sent", monthKey: board.monthKey, studentIds: bulk.ids, note })) {
              setBulk(null);
              setSelected((current) => new Set(Array.from(current).filter((id) => !bulk.ids.includes(id))));
              reload();
            }
          }}
        />
      )}

      {requestFor && (
        <RequestDialog
          initial={requestFor.place}
          studentCount={requestFor.studentIds.length}
          monthKey={board.monthKey}
          onClose={() => setRequestFor(null)}
          onSave={async (place, note) => {
            if (await post({ action: "request", monthKey: board.monthKey, ...place, note, studentIds: requestFor.studentIds })) {
              setRequestFor(null);
              reload();
            }
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Modal({ title, subtitle, onClose, children, wide = false }: { title: React.ReactNode; subtitle?: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className={`mt-8 w-full ${wide ? "max-w-2xl" : "max-w-lg"} rounded-2xl border border-brand/10 bg-white p-5 shadow-2xl`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-slate-950">{title}</h2>
            {subtitle && <div className="mt-1 text-xs leading-5 text-slate-600">{subtitle}</div>}
          </div>
          <button type="button" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StudentPopup({
  row,
  monthKey,
  months,
  canManage,
  answer,
  onClose,
  onChanged,
  onRequest,
}: {
  row: Row;
  monthKey: string;
  months: string[];
  canManage: boolean;
  answer?: Request;
  onClose: () => void;
  onChanged: () => void;
  onRequest: (place: Place) => void;
}) {
  const [place, setPlace] = useState<Place>({ city: row.city, state: row.state, country: row.country || "India" });
  const [note, setNote] = useState(row.history[monthKey]?.note || "");
  const [busy, setBusy] = useState(false);
  const sent = row.history[monthKey];
  const placeChanged = place.city !== row.city || place.state !== row.state || place.country !== row.country;
  const hint = !place.state ? suggestState(place.city, place.country) : "";
  const india = !place.country || place.country.toLowerCase() === "india";

  async function run(body: Record<string, unknown>) {
    setBusy(true);
    const result = await post(body);
    setBusy(false);
    if (result) onChanged();
    return result;
  }

  const contact = [
    row.name,
    row.parentName ? `Parent: ${row.parentName}` : "",
    row.phone ? `Phone: ${row.phone}` : "",
    placeLabel(place) ? `Place: ${placeLabel(place)}` : "",
  ].filter(Boolean).join("\n");

  return (
    <Modal
      wide
      onClose={onClose}
      title={<span className="flex flex-wrap items-center gap-2">{row.name}{row.paused && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">Paused</span>}</span>}
      subtitle={[row.age ? `${row.age} yrs` : "", LEVEL_LABEL[row.level] || "", row.coaches.length ? `Coach: ${row.coaches.join(", ")}` : ""].filter(Boolean).join(" · ")}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Family contact</h3>
            <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline" onClick={() => copy(contact, "Details copied")}>
              <Copy size={12} /> Copy all
            </button>
          </div>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Parent</dt>
              <dd className="font-semibold text-slate-900">{row.parentName || <span className="text-amber-700">Not on file</span>}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Phone</dt>
              <dd className="flex flex-wrap items-center gap-2 font-semibold tabular-nums text-slate-900">
                {row.phone || <span className="text-amber-700">Not on file</span>}
                {row.phone && (
                  <span className="flex gap-1">
                    <button type="button" className="rounded-lg border border-slate-200 p-1 hover:bg-slate-50" onClick={() => copy(row.phone, "Number copied")} title="Copy"><Copy size={13} /></button>
                    <a className="rounded-lg border border-slate-200 p-1 hover:bg-slate-50" href={`tel:${row.dial ? `+${row.dial}` : row.phone}`} title="Call"><Phone size={13} /></a>
                    {row.dial && <a className="rounded-lg border border-emerald-200 p-1 text-emerald-600 hover:bg-emerald-50" href={`https://wa.me/${row.dial}`} target="_blank" rel="noreferrer" title="WhatsApp"><MessageCircle size={13} /></a>}
                  </span>
                )}
                <LocalTime info={row.localTime} edit={{ target: "user", id: row._id }} />
              </dd>
            </div>
            {row.parentEmail && (
              <div>
                <dt className="text-xs text-slate-500">Email</dt>
                <dd className="break-all text-slate-800">{row.parentEmail}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Where they live</h3>
          <div className="space-y-2">
            <input className="input" value={place.city} disabled={!canManage} onChange={(event) => setPlace({ ...place, city: event.target.value })} placeholder="City" aria-label="City" />
            <input className="input" value={place.state} disabled={!canManage} list={india ? "tournament-indian-states" : undefined} onChange={(event) => setPlace({ ...place, state: event.target.value })} placeholder="State" aria-label="State" />
            {hint && canManage && (
              <button type="button" className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-bold text-brand" onClick={() => setPlace({ ...place, state: hint })}>
                Use {hint}?
              </button>
            )}
            <input className="input" value={place.country} disabled={!canManage} onChange={(event) => setPlace({ ...place, country: event.target.value })} placeholder="Country" aria-label="Country" />
            <datalist id="tournament-indian-states">{INDIAN_STATES.map((name) => <option key={name} value={name} />)}</datalist>
            {canManage && placeChanged && (
              <button type="button" className="btn btn-primary w-full !py-1.5" disabled={busy} onClick={() => run({ action: "location", studentId: row._id, ...place })}>
                Save place
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={`mt-3 rounded-xl border p-3 ${sent ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-black text-slate-900">{monthLabel(monthKey)}</h3>
          {sent ? (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">Sent {formatDateTime(sent.sentAt)}{sent.sentByName ? ` by ${sent.sentByName}` : ""}</span>
          ) : (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">Not sent yet</span>
          )}
        </div>
        {answer?.status === "answered" && (
          <div className="mt-2 rounded-lg bg-white p-2.5 text-sm">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-emerald-800">Tournaments for {answer.place}</span>
              <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline" onClick={() => copy(answer.reply, "Tournament list copied")}><Copy size={12} /> Copy</button>
            </div>
            <p className="whitespace-pre-line text-slate-800">{answer.reply}</p>
          </div>
        )}
        {canManage && (
          <>
            <textarea className="input mt-2 min-h-[70px]" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Which tournaments did you send? (optional)" maxLength={1000} />
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run({ action: "mark_sent", monthKey, studentIds: [row._id], note })}>
                <Check size={15} /> {sent ? "Update note" : "Mark as sent"}
              </button>
              {sent && (
                <button type="button" className="btn btn-outline" disabled={busy} onClick={() => run({ action: "unmark_sent", monthKey, studentId: row._id })}>
                  <Undo2 size={15} /> Not sent
                </button>
              )}
              {!answer && (
                <button type="button" className="btn btn-outline ml-auto" onClick={() => onRequest(place)}>
                  <Inbox size={15} /> No tournaments here? Ask Saptarshi
                </button>
              )}
            </div>
          </>
        )}
        {!canManage && sent?.note && <p className="mt-2 text-sm text-slate-700">{sent.note}</p>}
      </div>

      <div className="mt-3">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Last {months.length} months</h3>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {months.map((key) => {
            const entry = row.history[key];
            return (
              <div key={key} className={`rounded-xl border px-2 py-2 text-center ${entry ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`} title={entry?.note || undefined}>
                <div className="text-[11px] font-bold text-slate-500">{shortMonth(key)}</div>
                <div className={`mt-0.5 flex justify-center ${entry ? "text-emerald-600" : "text-slate-300"}`}>{entry ? <CheckCircle2 size={18} /> : <X size={18} />}</div>
                <div className="text-[10px] text-slate-500">{entry ? formatDate(entry.sentAt).replace(/ \d{4}$/, "") : "not sent"}</div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

function BulkSentDialog({ title, count, monthKey, onClose, onSave }: { title: string; count: number; monthKey: string; onClose: () => void; onSave: (note: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal onClose={onClose} title={`Mark ${count} student${count === 1 ? "" : "s"} as sent`} subtitle={`${title} · ${monthLabel(monthKey)}`}>
      <textarea className="input min-h-[90px]" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Which tournaments did you send? (optional, saved on each student)" maxLength={1000} />
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); await onSave(note); setBusy(false); }}>
          <Check size={15} /> Mark sent
        </button>
      </div>
    </Modal>
  );
}

function RequestDialog({ initial, studentCount, monthKey, onClose, onSave }: { initial: Place; studentCount: number; monthKey: string; onClose: () => void; onSave: (place: Place, note: string) => Promise<void> }) {
  const [place, setPlace] = useState<Place>(initial);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const india = !place.country || place.country.toLowerCase() === "india";
  const empty = !place.city.trim() && !place.state.trim() && !place.country.trim();
  return (
    <Modal
      onClose={onClose}
      title="Request tournament details"
      subtitle={`Saptarshi gets a task to find the tournaments for this place (${monthLabel(monthKey)}). His reply shows up here, on the city's group.${studentCount ? ` ${studentCount} student${studentCount === 1 ? "" : "s"} attached.` : ""}`}
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <input className="input" value={place.city} onChange={(event) => setPlace({ ...place, city: event.target.value })} placeholder="City" aria-label="City" />
        <input className="input" value={place.state} list={india ? "tournament-request-states" : undefined} onChange={(event) => setPlace({ ...place, state: event.target.value })} placeholder="State" aria-label="State" />
        <input className="input" value={place.country} onChange={(event) => setPlace({ ...place, country: event.target.value })} placeholder="Country" aria-label="Country" />
        <datalist id="tournament-request-states">{INDIAN_STATES.map((name) => <option key={name} value={name} />)}</datalist>
      </div>
      <textarea className="input mt-2 min-h-[80px]" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything Saptarshi should know? (age groups, online/offline, dates…)" maxLength={1000} />
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={busy || empty} onClick={async () => { setBusy(true); await onSave(place, note); setBusy(false); }}>
          <Send size={15} /> Send request
        </button>
      </div>
    </Modal>
  );
}

function MonthlyRecord({ rows, months, onOpen }: { rows: Row[]; months: string[]; onOpen: (id: string) => void }) {
  const ordered = [...months].reverse();
  if (!rows.length) return <Empty title="No students match." />;
  return (
    <div className="overflow-x-auto rounded-2xl border border-brand/10 bg-white shadow-sm">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
          <tr>
            <th className="px-4 py-2.5">Student</th>
            <th className="px-3 py-2.5">Place</th>
            {ordered.map((key) => <th key={key} className="px-2 py-2.5 text-center">{shortMonth(key)}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row._id} className="hover:bg-slate-50/70">
              <td className="px-4 py-2">
                <button type="button" className="font-bold text-slate-900 hover:text-brand hover:underline" onClick={() => onOpen(row._id)}>{row.name}</button>
                {row.parentName && <span className="block text-xs text-slate-500">{row.parentName}</span>}
              </td>
              <td className="px-3 py-2 text-xs text-slate-600">{placeLabel(row) || <span className="text-amber-700">missing</span>}</td>
              {ordered.map((key) => {
                const entry = row.history[key];
                return (
                  <td key={key} className="px-2 py-2 text-center" title={entry ? `${formatDate(entry.sentAt)}${entry.sentByName ? ` · ${entry.sentByName}` : ""}${entry.note ? `\n${entry.note}` : ""}` : "Not sent"}>
                    {entry ? <CheckCircle2 size={17} className="mx-auto text-emerald-600" /> : <span className="text-slate-300">–</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-slate-50 text-xs font-bold text-slate-600">
          <tr>
            <td className="px-4 py-2" colSpan={2}>Sent ({rows.length} students shown)</td>
            {ordered.map((key) => <td key={key} className="px-2 py-2 text-center tabular-nums">{rows.filter((row) => row.history[key]).length}</td>)}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Requests({ requests, canManage, highlight, focusId, onChanged }: { requests: Request[]; canManage: boolean; highlight: boolean; focusId: string; onChanged: () => void }) {
  if (!requests.length) return <Empty title="No tournament requests yet." hint="When a city has no tournament details, request them from its group and Saptarshi gets a task." />;
  const ordered = [...requests].sort((a, b) => Number(b.status === "open") - Number(a.status === "open"));
  return (
    <div className="space-y-3">
      {ordered.map((request) => <RequestCard key={request._id} request={request} canManage={canManage} highlight={highlight} focused={request._id === focusId} onChanged={onChanged} />)}
    </div>
  );
}

function RequestCard({ request, canManage, highlight, focused, onChanged }: { request: Request; canManage: boolean; highlight: boolean; focused: boolean; onChanged: () => void }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const open = request.status === "open";

  useEffect(() => {
    if (focused) document.getElementById(`tournament-request-${request._id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focused, request._id]);

  async function run(body: Record<string, unknown>) {
    setBusy(true);
    const result = await post(body);
    setBusy(false);
    if (result) onChanged();
  }

  return (
    <div id={`tournament-request-${request._id}`} className={`rounded-2xl border bg-white p-4 text-sm shadow-sm ${focused ? "ring-2 ring-brand" : ""} ${open ? "border-brand/20" : "border-slate-200"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <MapPin size={15} className="text-brand" />
        <span className="font-black text-slate-900">{request.place}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{monthLabel(request.monthKey)}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${open ? "bg-amber-100 text-amber-800" : request.status === "answered" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
          {open ? "Waiting for Saptarshi" : request.status === "answered" ? "Answered" : "Withdrawn"}
        </span>
        <span className="ml-auto text-xs text-slate-500">
          {request.requestedByName ? `${request.requestedByName} · ` : ""}{formatDateTime(request.createdAt)}
          {request.studentIds.length ? ` · ${request.studentIds.length} student${request.studentIds.length === 1 ? "" : "s"}` : ""}
        </span>
      </div>
      {request.note && <p className="mt-2 text-slate-700"><span className="font-semibold">Note:</span> {request.note}</p>}
      {request.status === "answered" && (
        <div className="mt-2 rounded-xl bg-emerald-50 p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-emerald-800">{request.answeredByName || "Saptarshi"} · {formatDateTime(request.answeredAt)}</span>
            <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline" onClick={() => copy(request.reply, "Tournament list copied")}><Copy size={12} /> Copy</button>
          </div>
          <p className="whitespace-pre-line text-slate-800">{request.reply}</p>
        </div>
      )}
      {open && canManage && (
        <div className={`mt-3 rounded-xl p-3 ${highlight ? "bg-brand/5" : "bg-slate-50"}`}>
          <textarea
            className="input min-h-[90px] bg-white"
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            placeholder={"Reply with the tournaments: name, date, venue or link, age groups, entry fee…"}
            maxLength={4000}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" disabled={busy || reply.trim().length < 3} onClick={() => run({ action: "answer_request", requestId: request._id, reply })}>
              <Send size={15} /> Send reply
            </button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => run({ action: "cancel_request", requestId: request._id })}>
              Withdraw request
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
