"use client";

import { useMemo, useState } from "react";
import { BarChart3, CalendarDays, ExternalLink, Link2, RefreshCw, Search, ShieldCheck, TrendingUp, Unlink } from "lucide-react";
import { DataPanel, EmptyState, PageHeader, StatCard } from "@/components/common/PageHeader";

type Dashboard = any;
type StudentRow = {
  id: string;
  name: string;
  username: string;
  rapidRating: number | null;
  ratingChange30: number | null;
  games30: number;
  connectionStatus: string;
  syncStatus: string;
};

const periods = [
  ["7d", "7 Days"],
  ["30d", "30 Days"],
  ["3m", "3 Months"],
  ["6m", "6 Months"],
  ["1y", "1 Year"],
  ["all", "All Time"],
];
const timeControls = ["all", "rapid", "blitz", "bullet", "classical", "correspondence"];

export function ChessDashboardClient({ initialDashboard, selectedStudentId, viewerMode }: { initialDashboard: Dashboard; selectedStudentId?: string; viewerMode: "student" | "teacher" | "admin" }) {
  const [dashboard, setDashboard] = useState<Dashboard>(initialDashboard);
  const [period, setPeriod] = useState("30d");
  const [platform, setPlatform] = useState("ALL");
  const [timeControl, setTimeControl] = useState("all");
  const [loading, setLoading] = useState(false);
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState({ chessCom: "", lichess: "" });
  const canManage = viewerMode === "student" || viewerMode === "admin";

  async function reload(next = { period, platform, timeControl }) {
    setLoading(true);
    const params = new URLSearchParams({ period: next.period, platform: next.platform, timeControl: next.timeControl });
    if (selectedStudentId) params.set("studentId", selectedStudentId);
    const response = await fetch(`/api/chess/profile?${params.toString()}`, { cache: "no-store" });
    if (response.ok) setDashboard(await response.json());
    setLoading(false);
  }

  async function linkAccount(platformValue: "CHESS_COM" | "LICHESS", username: string) {
    if (!username.trim()) return;
    setLoading(true);
    const response = await fetch("/api/chess/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: platformValue, username, studentId: selectedStudentId }),
    });
    if (response.ok) {
      await reload();
      setAccountForm({ chessCom: "", lichess: "" });
    } else {
      alert((await response.json().catch(() => ({}))).error || "Could not link account.");
    }
    setLoading(false);
  }

  async function syncNow(accountId: string) {
    setLoading(true);
    setSyncingAccountId(accountId);
    const response = await fetch("/api/chess/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, studentId: selectedStudentId }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(body.error || "Could not sync this chess account.");
    } else if (body.status === "COMPLETED") {
      const imported = Number(body.gamesImported || 0);
      const duplicates = Number(body.duplicatesSkipped || 0);
      if (imported || duplicates) alert(`Sync completed. Imported ${imported} game${imported === 1 ? "" : "s"} and skipped ${duplicates} duplicate${duplicates === 1 ? "" : "s"}.`);
    } else if (body.status === "SYNCING") {
      alert("A sync is already running for this account. Please try refreshing in a minute.");
    }
    await reload();
    setSyncingAccountId(null);
    setLoading(false);
  }

  async function unlink(accountId: string) {
    setLoading(true);
    const params = new URLSearchParams({ accountId });
    if (selectedStudentId) params.set("studentId", selectedStudentId);
    await fetch(`/api/chess/accounts?${params.toString()}`, { method: "DELETE" });
    await reload();
    setLoading(false);
  }

  const currentRatings = useMemo(() => latestRatings(dashboard.ratingSeries || []), [dashboard.ratingSeries]);

  if (!dashboard.connected) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="Player Analytics" title={viewerMode === "student" ? "Track Your Chess Progress" : "Chess Profile Not Connected"} icon={BarChart3} subtitle={viewerMode === "student" ? "Connect the accounts you use to play online. We will collect public games and build your performance dashboard." : `${dashboard.student.name} has not linked a Chess.com or Lichess account yet.`} />
        {canManage ? (
          <AccountLinkPanel accountForm={accountForm} setAccountForm={setAccountForm} onLink={linkAccount} loading={loading} />
        ) : (
          <EmptyState title="No chess accounts connected" description="The student needs to connect their Chess.com or Lichess account before progress analytics can appear." />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Chess Profile" title={dashboard.student.name} icon={ShieldCheck} subtitle={<span>Connected accounts stay tied to this LMS student record. Ratings are shown separately by platform.</span>}>
        <div className="grid gap-2 md:grid-cols-3">
          <select className="input" value={period} onChange={(event) => { setPeriod(event.target.value); void reload({ period: event.target.value, platform, timeControl }); }}>
            {periods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select className="input" value={platform} onChange={(event) => { setPlatform(event.target.value); void reload({ period, platform: event.target.value, timeControl }); }}>
            <option value="ALL">All Accounts</option>
            <option value="CHESS_COM">Chess.com</option>
            <option value="LICHESS">Lichess</option>
          </select>
          <select className="input" value={timeControl} onChange={(event) => { setTimeControl(event.target.value); void reload({ period, platform, timeControl: event.target.value }); }}>
            {timeControls.map((value) => <option key={value} value={value}>{labelFor(value)}</option>)}
          </select>
        </div>
      </PageHeader>

      <DataPanel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {dashboard.accounts.map((account: any) => (
              <div key={account.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{platformLabel(account.platform)}</div>
                <div className="mt-1 font-semibold text-slate-950">{account.username}</div>
                <div className="mt-2 text-xs text-slate-500">Last sync: {account.lastSyncedAt ? formatRelative(account.lastSyncedAt) : "Not synced yet"}</div>
                {account.lastError && <div className="mt-2 rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-700">{account.lastError}</div>}
                <div className="mt-3 flex gap-2">
                  <button className="btn-outline inline-flex items-center gap-2" onClick={() => syncNow(account.id)} disabled={loading}>
                    <RefreshCw size={14} className={syncingAccountId === account.id ? "animate-spin" : ""} /> {syncingAccountId === account.id ? "Syncing..." : "Sync"}
                  </button>
                  {canManage && <button className="btn-outline inline-flex items-center gap-2" onClick={() => unlink(account.id)} disabled={loading}><Unlink size={14} /> Remove</button>}
                </div>
              </div>
            ))}
          </div>
          <div className="grid min-w-[240px] gap-2 rounded-lg border border-brand/10 bg-brand-50 p-3 text-sm">
            {["rapid", "blitz", "bullet"].map((ratingType) => (
              <div key={ratingType} className="flex justify-between gap-3">
                <span className="font-medium text-brand">{labelFor(ratingType)}</span>
                <span className="text-right text-slate-700">{formatRatingPair(currentRatings, ratingType)}</span>
              </div>
            ))}
          </div>
        </div>
      </DataPanel>

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Games" value={dashboard.summary.gamesPlayed} note={`${dashboard.summary.wins}W / ${dashboard.summary.draws}D / ${dashboard.summary.losses}L`} icon={CalendarDays} />
        <StatCard label="Win Rate" value={`${dashboard.summary.winPercentage}%`} note="Selected range" icon={TrendingUp} tone="green" />
        <StatCard label="Active Days" value={dashboard.heatmapSummary.activeDays} note={`${dashboard.heatmapSummary.gamesThisMonth} games this month`} icon={BarChart3} tone="blue" />
        <StatCard label="Current Form" value={dashboard.form.last10.join(" ") || "-"} note={dashboard.form.currentStreak || "No streak"} icon={RefreshCw} tone="amber" />
      </div>

      {dashboard.coachInsights.length > 0 && (
        <DataPanel title="Coach Insight" subtitle="Only shown when there is enough calculated data" icon={ShieldCheck}>
          <div className="grid gap-3 md:grid-cols-4">
            {dashboard.coachInsights.map((item: any) => (
              <div key={item.label} className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{item.label}</div>
                <div className="mt-1 font-semibold text-slate-950">{item.value}</div>
                <div className="mt-1 text-xs text-slate-500">{item.note}</div>
              </div>
            ))}
          </div>
        </DataPanel>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <RatingChart series={dashboard.ratingSeries || []} />
        <ActivityHeatmap days={dashboard.heatmap || []} summary={dashboard.heatmapSummary} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ResultsPanel summary={dashboard.summary} />
        <OpponentPanel data={dashboard.opponentAnalytics} form={dashboard.form} />
      </div>

      <OpeningPanel openings={dashboard.openings} />
      <RecentGames games={dashboard.recentGames || []} />
    </div>
  );
}

export function StudentSelectorClient({ students, mode }: { students: StudentRow[]; mode: "teacher" | "admin" }) {
  const [query, setQuery] = useState("");
  const filtered = students.filter((student) => `${student.name} ${student.username} ${student.connectionStatus}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="space-y-4">
      <PageHeader eyebrow={mode === "teacher" ? "My Students" : "Player Analytics"} title={mode === "teacher" ? "My Students" : "Select Student"} icon={Search} subtitle={mode === "teacher" ? "Only students assigned to you appear here." : "Search active students and open their chess progress profile."}>
        <input className="input" placeholder="Search students..." value={query} onChange={(event) => setQuery(event.target.value)} />
      </PageHeader>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((student) => (
          <a key={student.id} href={`${mode === "teacher" ? "/instructor/students" : "/admin/player-analytics"}?studentId=${student.id}`} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand/30 hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-950">{student.name}</div>
                <div className="text-xs text-slate-500">{student.connectionStatus}</div>
              </div>
              <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${student.syncStatus === "FAILED" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{student.syncStatus}</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <Metric label="Rapid" value={student.rapidRating || "-"} />
              <Metric label="30d" value={student.ratingChange30 === null ? "-" : signed(student.ratingChange30)} />
              <Metric label="Games" value={student.games30} />
            </div>
            <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand">View Progress <ExternalLink size={12} /></div>
          </a>
        ))}
      </div>
      {!filtered.length && <EmptyState title="No students found" description="Try another search or clear the filter." />}
    </div>
  );
}

function AccountLinkPanel({ accountForm, setAccountForm, onLink, loading }: any) {
  return (
    <DataPanel title="Connect accounts" icon={Link2}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="font-semibold text-slate-950">Lichess</div>
          <input className="input mt-3" placeholder="Lichess username" value={accountForm.lichess} onChange={(event) => setAccountForm({ ...accountForm, lichess: event.target.value })} />
          <button className="btn-primary mt-3" disabled={loading} onClick={() => onLink("LICHESS", accountForm.lichess)}>Connect Lichess</button>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="font-semibold text-slate-950">Chess.com</div>
          <input className="input mt-3" placeholder="Chess.com username" value={accountForm.chessCom} onChange={(event) => setAccountForm({ ...accountForm, chessCom: event.target.value })} />
          <button className="btn-primary mt-3" disabled={loading} onClick={() => onLink("CHESS_COM", accountForm.chessCom)}>Link Chess.com</button>
        </div>
      </div>
    </DataPanel>
  );
}

function RatingChart({ series }: { series: any[] }) {
  const [ratingType, setRatingType] = useState("rapid");
  const filtered = series.filter((point) => point.ratingType === ratingType);
  const min = Math.min(...filtered.map((point) => point.rating), 0);
  const max = Math.max(...filtered.map((point) => point.rating), 1);
  const grouped = ["CHESS_COM", "LICHESS"].map((platform) => ({ platform, points: filtered.filter((point) => point.platform === platform) }));
  return (
    <DataPanel title="Rating Progress" subtitle="Platform ratings stay separate" icon={TrendingUp} action={<select className="input h-9" value={ratingType} onChange={(event) => setRatingType(event.target.value)}>{["rapid", "blitz", "bullet", "classical"].map((value) => <option key={value} value={value}>{labelFor(value)}</option>)}</select>}>
      <div className="h-72 rounded-lg bg-slate-50 p-3">
        {filtered.length < 1 ? <EmptyState title="No rating snapshots yet" description="Sync an account to begin rating history." className="h-full min-h-0" /> : (
          <svg viewBox="0 0 640 260" className="h-full w-full" role="img" aria-label="Rating progress chart">
            {[0, 1, 2, 3].map((line) => <line key={line} x1="36" x2="620" y1={30 + line * 55} y2={30 + line * 55} stroke="#e2e8f0" />)}
            {grouped.map((group) => <polyline key={group.platform} fill="none" stroke={group.platform === "CHESS_COM" ? "#7c3aed" : "#059669"} strokeWidth="3" points={pointsFor(group.points, min, max)} />)}
            {grouped.map((group) => group.points.map((point: any, index: number) => <circle key={`${group.platform}-${point.id}`} cx={xFor(index, group.points.length)} cy={yFor(point.rating, min, max)} r="4" fill={group.platform === "CHESS_COM" ? "#7c3aed" : "#059669"}><title>{`${platformLabel(point.platform)} ${labelFor(point.ratingType)} ${point.rating} on ${formatDate(point.recordedAt)}`}</title></circle>))}
          </svg>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="font-semibold text-purple-700">Chess.com {labelFor(ratingType)}</span>
        <span className="font-semibold text-emerald-700">Lichess {labelFor(ratingType)}</span>
        <span>High {max || "-"}</span>
        <span>Low {min || "-"}</span>
      </div>
    </DataPanel>
  );
}

function ActivityHeatmap({ days, summary }: { days: any[]; summary: any }) {
  const map = new Map(days.map((day) => [day.date, day.count]));
  const today = new Date();
  const cells = Array.from({ length: 365 }, (_, index) => {
    const date = new Date(today.getTime() - (364 - index) * 24 * 60 * 60 * 1000);
    const key = date.toISOString().slice(0, 10);
    return { date: key, count: map.get(key) || 0 };
  });
  return (
    <DataPanel title="Games Played" subtitle={`${summary.longestActiveStreak} day longest streak`} icon={CalendarDays}>
      <div className="grid grid-cols-[repeat(31,minmax(0,1fr))] gap-1 rounded-lg bg-slate-50 p-3">
        {cells.map((cell) => <span key={cell.date} title={`${cell.date}: ${cell.count} games`} className={`aspect-square rounded-sm ${heatColor(cell.count)}`} />)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        <Metric label="This Month" value={summary.gamesThisMonth} />
        <Metric label="Active Days" value={summary.activeDays} />
        <Metric label="Avg / Day" value={summary.averageGamesPerDay} />
        <Metric label="Current Streak" value={summary.currentStreak} />
      </div>
    </DataPanel>
  );
}

function ResultsPanel({ summary }: { summary: any }) {
  return (
    <DataPanel title="Results Analytics" icon={BarChart3}>
      <div className="grid gap-2 sm:grid-cols-3">
        <Metric label="Wins" value={`${summary.wins} (${summary.winPercentage}%)`} />
        <Metric label="Draws" value={summary.draws} />
        <Metric label="Losses" value={summary.losses} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Metric label="As White" value={`${summary.byColor.white.wins}W / ${summary.byColor.white.draws}D / ${summary.byColor.white.losses}L`} />
        <Metric label="As Black" value={`${summary.byColor.black.wins}W / ${summary.byColor.black.draws}D / ${summary.byColor.black.losses}L`} />
      </div>
    </DataPanel>
  );
}

function OpponentPanel({ data, form }: { data: any; form: any }) {
  return (
    <DataPanel title="Opponent & Form" icon={TrendingUp}>
      <div className="grid gap-2 sm:grid-cols-2">
        <Metric label="Average Opponent" value={data.averageOpponent || "-"} />
        <Metric label="Average Length" value={`${form.last25.averageGameLength || 0} moves`} />
        <Metric label="100+ Below" value={`${data.weaker.winPercentage}% from ${data.weaker.games}`} />
        <Metric label="+/- 100" value={`${data.similar.winPercentage}% from ${data.similar.games}`} />
        <Metric label="100+ Above" value={`${data.stronger.winPercentage}% from ${data.stronger.games}`} />
        <Metric label="Last 25 Rating" value={signed(form.last25.ratingChange || 0)} />
      </div>
    </DataPanel>
  );
}

function OpeningPanel({ openings }: { openings: any }) {
  return (
    <DataPanel title="Opening Performance" subtitle="Rows become meaningful after 5 games" icon={BarChart3}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Opening</th><th>Colour</th><th>Games</th><th>Win %</th><th>Draw %</th><th>Loss %</th><th>Avg Opp</th></tr></thead>
          <tbody>
            {openings.rows.slice(0, 12).map((row: any) => (
              <tr key={`${row.opening}-${row.color}`} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-950">{row.opening}<div className="text-xs text-slate-500">{row.eco || "No ECO"}{!row.meaningful ? " · small sample" : ""}</div></td>
                <td>{labelFor(row.color)}</td><td>{row.games}</td><td>{row.winPercentage}%</td><td>{row.drawPercentage}%</td><td>{row.lossPercentage}%</td><td>{row.averageOpponent || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!openings.rows.length && <EmptyState title="No opening data yet" description="Imported PGNs need opening/ECO tags before this panel can calculate trends." />}
      </div>
    </DataPanel>
  );
}

function RecentGames({ games }: { games: any[] }) {
  return (
    <DataPanel title="Recent Games" icon={CalendarDays}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Result</th><th>Opponent</th><th>Rating</th><th>Opening</th><th>Platform</th><th>Date</th><th></th></tr></thead>
          <tbody>
            {games.map((game) => (
              <tr key={game.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-black">{resultText(game.result)}</td>
                <td>{game.opponentUsername}<div className="text-xs text-slate-500">As {game.studentColor}</div></td>
                <td>{game.studentRating || "-"} <span className={Number(game.ratingChange) >= 0 ? "text-emerald-600" : "text-rose-600"}>{game.ratingChange ? signed(game.ratingChange) : ""}</span><div className="text-xs text-slate-500">Opp {game.opponentRating || "-"}</div></td>
                <td>{game.opening}<div className="text-xs text-slate-500">{game.eco} · {labelFor(game.timeControlCategory)}</div></td>
                <td>{platformLabel(game.platform)}</td>
                <td>{formatDate(game.playedAt)}</td>
                <td>{game.gameUrl && <a className="text-brand" href={game.gameUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /></a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!games.length && <EmptyState title="No games imported yet" description="Use Sync Now after connecting a chess account." />}
      </div>
    </DataPanel>
  );
}

function Metric({ label, value }: { label: string; value: any }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div><div className="mt-1 font-semibold text-slate-950">{value}</div></div>;
}

function latestRatings(series: any[]) {
  const map = new Map<string, any>();
  for (const point of series) map.set(`${point.platform}:${point.ratingType}`, point);
  return map;
}

function formatRatingPair(map: Map<string, any>, type: string) {
  const cc = map.get(`CHESS_COM:${type}`)?.rating;
  const li = map.get(`LICHESS:${type}`)?.rating;
  return [cc ? `Chess.com ${cc}` : null, li ? `Lichess ${li}` : null].filter(Boolean).join(" · ") || "-";
}

function pointsFor(points: any[], min: number, max: number) {
  return points.map((point, index) => `${xFor(index, points.length)},${yFor(point.rating, min, max)}`).join(" ");
}

function xFor(index: number, length: number) {
  return 36 + (length <= 1 ? 0 : (index / (length - 1)) * 584);
}

function yFor(value: number, min: number, max: number) {
  const span = Math.max(1, max - min);
  return 230 - ((value - min) / span) * 200;
}

function heatColor(count: number) {
  if (!count) return "bg-slate-200";
  if (count < 3) return "bg-emerald-200";
  if (count < 6) return "bg-emerald-400";
  if (count < 12) return "bg-emerald-600";
  return "bg-emerald-800";
}

function platformLabel(platform: string) {
  return platform === "CHESS_COM" ? "Chess.com" : platform === "LICHESS" ? "Lichess" : platform;
}

function labelFor(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function resultText(result: string) {
  return result === "win" ? "W" : result === "draw" ? "D" : "L";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatRelative(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return formatDate(value);
}
