"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Coins, History } from "lucide-react";
import { toast } from "sonner";
import { formatCredits } from "@/lib/leave/leaveRules";
import { Drawer, button, danger, dateTime, field, secondary, sendJson } from "./leaveUi";

type StaffRow = { userId: string; name: string; email: string; role: string; limited: boolean; balance: number | null; totalGranted: number | null; held: number };
type Entry = { _id: string; type: string; amount: number; balanceAfter: number | null; byName: string; note: string; createdAt: string | null };
type Panel = { mode: "adjust" | "history" | "remove"; row: StaffRow } | null;

const entryLabels: Record<string, string> = { grant: "Credits given", adjustment: "Credits removed", deduction: "Leave approved", refund: "Leave cancelled (refund)", limit_removed: "Limit removed" };

/** Admins: who has a credit limit, their balances, and the ledger behind them. */
export default function LeaveCreditsPanel() {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await sendJson("/api/leave/credits", "GET");
      setRows(result.staff || []); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load credits."); }
    finally { setLoaded(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function openHistory(row: StaffRow) {
    setPanel({ mode: "history", row }); setEntries(null);
    try { setEntries((await sendJson(`/api/leave/credits?user=${row.userId}`, "GET")).entries || []); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not load the history."); setEntries([]); }
  }

  async function submit(body: Record<string, unknown>, success: string) {
    setBusy(true); setFormError("");
    try {
      await sendJson("/api/leave/credits", "POST", body);
      toast.success(success);
      setPanel(null);
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not update credits.";
      setFormError(message); toast.error(message);
    } finally { setBusy(false); }
  }

  const visible = rows.filter((row) => !q || `${row.name} ${row.email}`.toLowerCase().includes(q.toLowerCase()));
  const open = (mode: "adjust" | "remove", row: StaffRow) => { setFormError(""); setPanel({ mode, row }); };

  return (
    <section className="space-y-3">
      <div className="rounded-lg bg-purple-50 p-3 text-sm text-brand">
        Staff without a credit limit can always apply for leave. Once you give someone credits, they can only apply while credits remain: an approved full day uses 1, a half day 0.5. The balance never resets.
      </div>
      <label className="block max-w-sm text-xs font-semibold text-slate-500">Search staff<input className={field} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email" /></label>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
      {!loaded ? <p className="p-8 text-center text-sm text-slate-500">Loading credits…</p> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr><th className="px-4 py-3">Staff member</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Credits</th><th className="px-4 py-3">Held</th><th className="px-4 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.userId} className="border-t border-slate-100">
                  <td className="px-4 py-3"><p className="font-semibold">{row.name}</p><p className="text-xs text-slate-500">{row.email}</p></td>
                  <td className="px-4 py-3 text-slate-600">{row.role === "instructor" ? "Coach" : "Sub-admin"}</td>
                  <td className="px-4 py-3">{row.limited ? <span className="font-bold text-brand">{formatCredits(row.balance || 0)}</span> : <span className="text-slate-500">No limit</span>}</td>
                  <td className="px-4 py-3 text-slate-600">{row.held ? formatCredits(row.held) : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button className={secondary} onClick={() => open("adjust", row)}><Coins size={14} />{row.limited ? "Adjust" : "Give credits"}</button>
                      <button className={secondary} onClick={() => void openHistory(row)} aria-label={`Credit history for ${row.name}`}><History size={14} /></button>
                      {row.limited && <button className={danger} onClick={() => open("remove", row)}>Remove limit</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!visible.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No staff match.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={panel?.mode === "adjust"} busy={busy} onClose={() => setPanel(null)} title={panel?.row.limited ? "Adjust leave credits" : "Give leave credits"}
        description={panel ? `${panel.row.name} · ${panel.row.limited ? `balance ${formatCredits(panel.row.balance || 0)}` : "no limit today"}` : undefined}>
        {panel?.mode === "adjust" && (
          <form className="space-y-4" onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            const amount = Number(values.get("amount")) * (values.get("direction") === "remove" ? -1 : 1);
            void submit({ action: "adjust", userId: panel.row.userId, amount, note: String(values.get("note") || "") }, "Leave credits updated.");
          }}>
            {!panel.row.limited && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Giving credits sets a limit: from now on {panel.row.name} can only apply for leave while credits remain.</p>}
            {panel.row.limited && (
              <fieldset className="flex gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="radio" name="direction" value="add" defaultChecked className="accent-[#5a1372]" />Add</label>
                <label className="flex items-center gap-2"><input type="radio" name="direction" value="remove" className="accent-[#5a1372]" />Take away</label>
              </fieldset>
            )}
            <label className="block text-sm font-semibold">Credits<input name="amount" type="number" className={field} min={0.5} max={365} step={0.5} required defaultValue={panel.row.limited ? 1 : 12} /></label>
            <label className="block text-sm font-semibold">Note (optional)<input name="note" className={field} maxLength={500} placeholder="e.g. Yearly allowance 2026-27" /></label>
            {formError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{formError}</p>}
            <div className="flex gap-2"><button className={button} disabled={busy} type="submit">{busy ? "Saving…" : "Save and notify"}</button><button type="button" className={secondary} disabled={busy} onClick={() => setPanel(null)}>Back</button></div>
          </form>
        )}
      </Drawer>

      <Drawer open={panel?.mode === "remove"} busy={busy} onClose={() => setPanel(null)} title="Remove credit limit" description={panel?.row.name}>
        {panel?.mode === "remove" && (
          <form className="space-y-4" onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            void submit({ action: "remove_limit", userId: panel.row.userId, note: String(new FormData(event.currentTarget).get("note") || "") }, "Credit limit removed.");
          }}>
            <p className="text-sm text-slate-600">{panel.row.name} will be able to apply for leave without credits. The remaining balance of {formatCredits(panel.row.balance || 0)} is discarded; the history is kept.</p>
            <label className="block text-sm font-semibold">Note (optional)<input name="note" className={field} maxLength={500} /></label>
            {formError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{formError}</p>}
            <div className="flex gap-2"><button className={button} disabled={busy} type="submit">{busy ? "Saving…" : "Remove limit"}</button><button type="button" className={secondary} disabled={busy} onClick={() => setPanel(null)}>Back</button></div>
          </form>
        )}
      </Drawer>

      <Drawer open={panel?.mode === "history"} onClose={() => setPanel(null)} title="Credit history" description={panel?.row.name}>
        {entries === null ? <p className="text-sm text-slate-500">Loading…</p> : !entries.length ? <p className="text-sm text-slate-500">No credit changes yet.</p> : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li key={entry._id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{entryLabels[entry.type] || entry.type}</span>
                  {entry.type !== "limit_removed" && <span className={`font-bold ${entry.amount < 0 ? "text-rose-700" : "text-emerald-700"}`}>{entry.amount > 0 ? "+" : ""}{formatCredits(entry.amount)}</span>}
                </div>
                <p className="mt-1 text-xs text-slate-500">{dateTime(entry.createdAt)} IST{entry.byName ? ` · ${entry.byName}` : ""}{entry.balanceAfter !== null ? ` · balance ${formatCredits(entry.balanceAfter)}` : ""}</p>
                {entry.note && <p className="mt-1 text-xs text-slate-600">{entry.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </Drawer>
    </section>
  );
}
