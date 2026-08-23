"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ServerCog } from "lucide-react";
import { AdminV2Card, AdminV2Stat } from "./AdminV2Primitives";

type EngineStatus = {
  status: string;
  redis: { configured: boolean; status: string };
  queue: Record<string, number>;
  jobs: { total: number; completed: number; failed: number; cancelled: number };
  cache: { hits: number; writes: number };
  workers: { available: number; busy: number; offline: number; items: Array<{ workerId: string; workerName: string; cores: number; status: string; currentJobId?: string }> };
};

export default function AdminV2EngineClient() {
  const [data, setData] = useState<EngineStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/engine/status", { cache: "no-store" });
      if (response.ok) setData(await response.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 10_000); return () => window.clearInterval(timer); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Live queue, worker, lease, and cache health. Refreshes every 10 seconds.</p>
        <button className="btn-outline gap-2" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminV2Stat label="Workers online" value={data?.workers.available ?? "-"} tone="accent" />
        <AdminV2Stat label="Jobs queued" value={data ? Object.values(data.queue).reduce((sum, value) => sum + value, 0) : "-"} />
        <AdminV2Stat label="Failed jobs" value={data?.jobs.failed ?? "-"} />
        <AdminV2Stat label="Cache hits" value={data?.cache.hits ?? "-"} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <AdminV2Card>
          <div className="flex items-center gap-2 text-lg font-black text-brand"><ServerCog size={20} /> Workers</div>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500"><th className="px-2 py-2">Worker</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Cores</th><th className="px-2 py-2">Current job</th></tr></thead><tbody>{data?.workers.items.map((worker) => <tr key={worker.workerId} className="border-b border-slate-50"><td className="px-2 py-3 font-bold">{worker.workerName || worker.workerId}</td><td className="px-2 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${worker.status === "online" ? "bg-emerald-100 text-emerald-700" : worker.status === "busy" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{worker.status}</span></td><td className="px-2 py-3">{worker.cores}</td><td className="px-2 py-3 font-mono text-xs">{worker.currentJobId || "Idle"}</td></tr>) || <tr><td className="px-2 py-4 text-slate-500" colSpan={4}>No workers registered yet.</td></tr>}</tbody></table></div>
        </AdminV2Card>
        <AdminV2Card>
          <h2 className="text-lg font-black text-brand">Coordinator status</h2>
          <div className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate-500">MongoDB</span><strong className="text-emerald-700">Connected</strong></div><div className="flex justify-between"><span className="text-slate-500">Redis</span><strong className={data?.redis.status === "healthy" ? "text-emerald-700" : "text-amber-700"}>{data?.redis.status || "-"}</strong></div><div className="flex justify-between"><span className="text-slate-500">Completed jobs</span><strong>{data?.jobs.completed ?? "-"}</strong></div><div className="flex justify-between"><span className="text-slate-500">Cancelled jobs</span><strong>{data?.jobs.cancelled ?? "-"}</strong></div><div className="flex justify-between"><span className="text-slate-500">Cache writes</span><strong>{data?.cache.writes ?? "-"}</strong></div></div>
          <div className="mt-6 border-t border-slate-100 pt-4"><h3 className="text-sm font-black text-slate-700">Priority queues</h3><div className="mt-3 grid grid-cols-2 gap-2">{Object.entries(data?.queue || {}).map(([name, count]) => <div key={name} className="rounded-xl bg-slate-50 p-3"><div className="text-xs uppercase text-slate-500">{name}</div><div className="mt-1 text-xl font-black text-brand">{count}</div></div>)}</div></div>
        </AdminV2Card>
      </div>
    </div>
  );
}
