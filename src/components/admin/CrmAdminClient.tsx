"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Upload } from "lucide-react";
import { STAGE_GROUP_LABELS, type StageEntry, type StageGroup } from "@/lib/crm/stageGroups";

type Health = {
  stageGroups: StageGroup[];
  catalogue: StageEntry[];
  mirror: { leads: number };
  config: {
    outboundConfigured: boolean;
    inboundConfigured: boolean;
    endpoint: string | null;
    webhookPath: string;
    callLoggingConfigured: boolean;
    callsEndpoint: string | null;
    stageLabels: Record<string, string>;
  };
  observedStages: Array<{ stage: string; seen: number; lastSeen: string }>;
  unmatchedStageLabels: string[];
  counts: { total: number; failing: number };
};

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
        ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
      }`}
    >
      {ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
      {label}
    </span>
  );
}

export function CrmAdminClient({ initial }: { initial: Health }) {
  const [health, setHealth] = useState<Health>(initial);
  const [mapping, setMapping] = useState<Record<string, StageGroup>>(
    () => Object.fromEntries(initial.catalogue.map((entry) => [entry.stage, entry.group])) as Record<string, StageGroup>,
  );
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/crm", { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load CRM status.");
      const data: Health = await response.json();
      setHealth(data);
      setMapping(Object.fromEntries(data.catalogue.map((entry) => [entry.stage, entry.group])) as Record<string, StageGroup>);
    } catch (issue: any) {
      toast.error(issue?.message || "Unable to load CRM status.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    setMapping(Object.fromEntries(health.catalogue.map((entry) => [entry.stage, entry.group])) as Record<string, StageGroup>);
  }, [health.catalogue]);

  async function saveMapping() {
    setBusy(true);
    try {
      const entries = health.catalogue.map((entry, index) => ({
        stage: entry.stage,
        group: mapping[entry.stage] || entry.group,
        order: index,
      }));
      const response = await fetch("/api/admin/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stageMapping", entries }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.error || "Could not save the mapping.");
      toast.success("Stage mapping saved.");
      await load();
    } catch (issue: any) {
      toast.error(issue?.message || "Could not save the mapping.");
    } finally {
      setBusy(false);
    }
  }

  async function importCsv(file: File) {
    setImporting(true);
    try {
      const csv = await file.text();
      const response = await fetch("/api/admin/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import", csv }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "The import failed.");
      toast.success(`${data.created} leads added, ${data.updated} updated, ${data.skipped} skipped.`);
      if (Array.isArray(data.errors) && data.errors.length) {
        toast.error(data.errors.slice(0, 3).join(" | "));
      }
      await load();
    } catch (issue: any) {
      toast.error(issue?.message || "The import failed.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 pb-10 pt-4 text-slate-950 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-brand to-brand-400 px-5 py-4 text-white">
          <div>
            <h1 className="text-lg font-bold">CRM Sync &amp; Settings</h1>
            <p className="text-xs text-white/80">Connection health, pipeline stage mapping, and lead import.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/15 px-3 text-xs font-bold text-white transition hover:bg-white/25"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 p-4">
          <StatusPill ok={health.config.outboundConfigured} label={health.config.outboundConfigured ? "Outbound configured" : "Outbound not configured"} />
          <StatusPill ok={health.config.inboundConfigured} label={health.config.inboundConfigured ? "Webhook secret set" : "Webhook secret missing"} />
          <StatusPill
            ok={health.config.callLoggingConfigured}
            label={health.config.callLoggingConfigured ? "Call logging on" : "Call logging off"}
          />
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
            {health.mirror.leads} leads mirrored
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
            {health.counts.total} synced demos - {health.counts.failing} failing
          </span>
        </div>

        <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
          <div>
            Webhook URL to configure in the CRM: <code className="rounded bg-slate-100 px-1.5 py-0.5">{health.config.webhookPath}</code>
          </div>
          {health.config.endpoint ? (
            <div className="mt-1">
              Leads endpoint: <code className="rounded bg-slate-100 px-1.5 py-0.5">{health.config.endpoint}</code>
            </div>
          ) : null}
          {health.config.callsEndpoint ? (
            <div className="mt-1">
              Calls endpoint: <code className="rounded bg-slate-100 px-1.5 py-0.5">{health.config.callsEndpoint}</code>
            </div>
          ) : (
            <div className="mt-1 text-amber-700">
              Calls endpoint is not configured, so calls logged by the sales team stay in the portal. Set
              <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5">KRAYA_CALLS_API_URL</code>
              to the Calls API URL from the CRM integration settings.
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-950">Pipeline stages</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Every stage the CRM has actually sent. Map each one to a group - the sales counters read groups, never stage
            names, so renaming a stage in the CRM only needs a change here.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-bold">Stage name in the CRM</th>
                <th className="px-4 py-2.5 font-bold">Counts as</th>
                <th className="px-4 py-2.5 font-bold">Leads seen</th>
                <th className="px-4 py-2.5 font-bold">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {health.catalogue.length ? (
                health.catalogue.map((entry) => (
                  <tr key={entry.stage} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 font-bold text-slate-900">{entry.stage}</td>
                    <td className="px-4 py-2.5">
                      <select
                        value={mapping[entry.stage] || entry.group}
                        onChange={(event) => setMapping((current) => ({ ...current, [entry.stage]: event.target.value as StageGroup }))}
                        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 focus:border-brand focus:outline-none"
                      >
                        {health.stageGroups.map((group) => (
                          <option key={group} value={group}>
                            {STAGE_GROUP_LABELS[group]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{entry.seen}</td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {entry.lastSeen ? new Date(entry.lastSeen).toLocaleString("en-IN") : "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-500">
                    No stages seen yet. They appear as soon as the CRM sends its first webhook, or after an import.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {health.catalogue.length ? (
          <div className="flex justify-end border-t border-slate-100 px-4 py-3">
            <button
              type="button"
              onClick={() => void saveMapping()}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-xs font-bold text-white transition hover:bg-brand-600 disabled:opacity-60"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              Save mapping
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-950">Import existing leads</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            The CRM has no endpoint for reading leads, so leads created before the sync went live only appear here once
            somebody edits them. Export them from the CRM and upload the CSV to seed the history. Columns are matched by
            name (lead id, name, phone, email, stage, pipeline, notes, created at) and anything unrecognised is kept as a
            lead attribute. An import never overwrites a stage the webhook has already delivered.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importCsv(file);
            }}
            className="text-xs"
          />
          {importing ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-brand">
              <Loader2 size={14} className="animate-spin" /> Importing
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <Upload size={14} /> CSV only
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
