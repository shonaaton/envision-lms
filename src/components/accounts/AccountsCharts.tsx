import { rupees, shortMonth } from "@/components/accounts/format";

type Point = { month: string; revenue: number; cost: number; profit: number };

/**
 * Revenue beside cost for each month. Two series, so a legend names them and
 * every bar carries its value on hover; the P&L table below is the table view.
 */
export function RevenueCostChart({ points }: { points: Point[] }) {
  const peak = Math.max(1, ...points.map((point) => Math.max(point.revenue, point.cost)));
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs font-semibold text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand" /> Revenue (net of GST)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-slate-400" /> Total cost
        </span>
      </div>
      <div className="flex h-48 items-end gap-3 border-b border-slate-200">
        {points.map((point) => (
          <div key={point.month} className="flex h-full min-w-0 flex-1 items-end justify-center gap-[2px]">
            <div
              className="w-full max-w-[22px] rounded-t bg-brand transition hover:brightness-125"
              style={{ height: `${(Math.max(0, point.revenue) / peak) * 100}%` }}
              title={`${shortMonth(point.month)} revenue: ${rupees(point.revenue)}`}
            />
            <div
              className="w-full max-w-[22px] rounded-t bg-slate-400 transition hover:bg-slate-500"
              style={{ height: `${(Math.max(0, point.cost) / peak) * 100}%` }}
              title={`${shortMonth(point.month)} cost: ${rupees(point.cost)}`}
            />
          </div>
        ))}
      </div>
      <MonthAxis points={points} />
    </div>
  );
}

/** Profit above the line, loss below it, from one shared zero. */
export function ProfitChart({ points }: { points: Point[] }) {
  const peak = Math.max(1, ...points.map((point) => Math.abs(point.profit)));
  const hasLoss = points.some((point) => point.profit < 0);
  const hasProfit = points.some((point) => point.profit > 0);
  const upShare = hasLoss && hasProfit ? 50 : hasLoss ? 0 : 100;
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs font-semibold text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /> Profit
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-rose-600" /> Loss
        </span>
      </div>
      <div className="flex h-48 gap-3">
        {points.map((point) => {
          const height = `${(Math.abs(point.profit) / peak) * 100}%`;
          const label = `${shortMonth(point.month)} ${point.profit >= 0 ? "profit" : "loss"}: ${rupees(Math.abs(point.profit))}`;
          return (
            <div key={point.month} className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-end justify-center border-b border-slate-300" style={{ height: `${upShare}%` }}>
                {point.profit > 0 && <div className="w-full max-w-[30px] rounded-t bg-emerald-600" style={{ height }} title={label} />}
              </div>
              <div className="flex items-start justify-center" style={{ height: `${100 - upShare}%` }}>
                {point.profit < 0 && <div className="w-full max-w-[30px] rounded-b bg-rose-600" style={{ height }} title={label} />}
              </div>
            </div>
          );
        })}
      </div>
      <MonthAxis points={points} />
    </div>
  );
}

function MonthAxis({ points }: { points: Point[] }) {
  return (
    <div className="mt-1.5 flex gap-3 text-[11px] font-semibold text-slate-500">
      {points.map((point) => (
        <span key={point.month} className="min-w-0 flex-1 truncate text-center">
          {shortMonth(point.month)}
        </span>
      ))}
    </div>
  );
}

/** Where the money went: each cost category's share of the period's total. */
export function CostMix({ rows }: { rows: { label: string; value: number }[] }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const peak = Math.max(1, ...rows.map((row) => row.value));
  if (!rows.length) return <p className="text-sm text-slate-500">No costs recorded for this period yet.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-slate-700">{row.label}</span>
            <span className="shrink-0 font-bold tabular-nums text-slate-950">
              {rupees(row.value)}
              <span className="ml-1.5 font-semibold text-slate-500">{total ? Math.round((row.value / total) * 100) : 0}%</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand" style={{ width: `${(row.value / peak) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
