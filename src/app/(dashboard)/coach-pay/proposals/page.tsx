import Link from "next/link";
import { ArrowLeft, CheckCircle2, Inbox, XCircle } from "lucide-react";

import { DataPanel, EmptyState, PageHeader, StatCard } from "@/components/common/PageHeader";
import { PAY_KIND_LABELS } from "@/lib/coachPay";
import { resolveCoachPayViewer } from "@/lib/coachPayAccess";
import { loadProposals } from "@/lib/coachPayData";
import { formatINR } from "@/lib/utils";
import { reviewProposal } from "../actions";

export const dynamic = "force-dynamic";

const KINDS: Array<{ id: "regular" | "demo" | "demoConversionBonus" | "substitute"; label: string }> = [
  { id: "regular", label: "Regular" },
  { id: "demo", label: "Demo" },
  { id: "demoConversionBonus", label: "Conversion bonus" },
  { id: "substitute", label: "Substitution" },
];

function formatDate(date: Date | null) {
  return date ? new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-";
}

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await resolveCoachPayViewer();
  if (!viewer?.canManageRates) return <div className="p-6 text-sm text-slate-600">Forbidden</div>;

  const params = searchParams ? await searchParams : {};
  const raw = params.show;
  const show = (typeof raw === "string" ? raw : "") || "pending";
  const all = await loadProposals(show === "all" ? {} : { status: show });
  const pendingCount = show === "pending" ? all.length : (await loadProposals({ status: "pending" })).length;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Payroll workspace"
        title="Coach Submissions"
        icon={Inbox}
        subtitle="What coaches say they should be paid, waiting on an answer. Nothing here affects a coach's total until it is approved."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <StatCard label="Waiting on you" value={pendingCount} note="Across all coaches" icon={Inbox} tone="amber" />
          <StatCard
            label="Value proposed"
            value={formatINR(
              all
                .filter((proposal) => proposal.status === "pending")
                .reduce((sum, proposal) => sum + Number(proposal.amount || 0), 0)
            )}
            note="One-off substitution claims only"
            icon={CheckCircle2}
            tone="purple"
          />
        </div>
      </PageHeader>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link href="/coach-pay" className="btn-outline h-9 px-4 text-xs">
          <ArrowLeft size={14} /> Back to coach pay
        </Link>
        <form method="get" className="ml-auto flex gap-2">
          <select name="show" defaultValue={show} className="input h-9 w-auto" aria-label="Which submissions to show">
            <option value="pending">Waiting on a decision</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">Everything</option>
          </select>
          <button type="submit" className="btn-primary h-9 px-4 text-xs">
            Apply
          </button>
        </form>
      </div>

      {all.length === 0 ? (
        <DataPanel className="mt-3">
          <EmptyState
            title={show === "pending" ? "Nothing waiting on a decision" : "Nothing to show"}
            description="Coaches submit rates from their own earnings pages; anything they send lands here."
          />
        </DataPanel>
      ) : (
        <div className="mt-3 grid gap-3">
          {all.map((proposal) => (
            <DataPanel key={proposal.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-950">{proposal.coachName}</h2>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
                      {proposal.kind === "session" ? "One substitution class" : "Standing classroom rates"}
                    </span>
                    {proposal.status !== "pending" && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${
                          proposal.status === "approved"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : "bg-rose-50 text-rose-700 ring-rose-200"
                        }`}
                      >
                        {proposal.status === "approved" ? "Approved" : "Rejected"}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {proposal.classroomTitle}
                    {proposal.sessionDate ? ` - class on ${formatDate(proposal.sessionDate)}` : ""} &middot; submitted{" "}
                    {formatDate(proposal.submittedAt)}
                  </p>
                  {proposal.note && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs leading-5 text-slate-700">{proposal.note}</p>}
                  {proposal.status !== "pending" && proposal.reviewedByName && (
                    <p className="mt-2 text-xs text-slate-400">
                      {proposal.status === "approved" ? "Approved" : "Rejected"} by {proposal.reviewedByName} on{" "}
                      {formatDate(proposal.reviewedAt)}
                      {proposal.reviewNote ? ` - ${proposal.reviewNote}` : ""}
                    </p>
                  )}
                </div>

                <div className="text-right">
                  {proposal.kind === "session" ? (
                    <div>
                      <div className="text-xl font-black tabular-nums text-slate-950">{formatINR(Number(proposal.amount || 0))}</div>
                      <div className="text-xs text-slate-500">{proposal.unit === "per_hour" ? "per hour" : "per class"}</div>
                    </div>
                  ) : (
                    <div className="grid gap-0.5 text-xs">
                      {KINDS.filter((kind) => proposal.values[kind.id]?.amount !== null).map((kind) => (
                        <div key={kind.id} className="flex justify-end gap-2">
                          <span className="text-slate-500">{kind.label}</span>
                          <span className="font-bold tabular-nums text-slate-950">
                            {formatINR(Number(proposal.values[kind.id]?.amount || 0))}
                            <span className="ml-1 font-normal text-slate-400">
                              {proposal.values[kind.id]?.unit === "per_hour" ? "/hr" : "/class"}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {proposal.status === "pending" && (
                <form action={reviewProposal} className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
                  <input type="hidden" name="id" value={proposal.id} />
                  <input
                    name="reviewNote"
                    className="input h-9 min-w-0 flex-1"
                    placeholder="Optional note back to the coach"
                    aria-label="Note back to the coach"
                  />
                  {proposal.kind === "classroom_rate" && (
                    <label className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="whitespace-nowrap">Applies from</span>
                      <input
                        name="effectiveFrom"
                        type="date"
                        className="input h-9 w-36"
                        aria-label="Date this rate starts applying"
                        title="Leave blank to apply to all history. Set a date to protect months already paid out."
                      />
                    </label>
                  )}
                  <button type="submit" name="decision" value="approve" className="btn-primary h-9 px-4 text-xs">
                    <CheckCircle2 size={14} /> Approve
                  </button>
                  <button type="submit" name="decision" value="reject" className="btn-ghost h-9 px-4 text-xs text-rose-600 hover:bg-rose-50">
                    <XCircle size={14} /> Reject
                  </button>
                </form>
              )}

              {proposal.status === "approved" && proposal.kind === "session" && (
                <p className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500">
                  Applied as a {PAY_KIND_LABELS[proposal.payKind]} rate on that class.
                </p>
              )}
            </DataPanel>
          ))}
        </div>
      )}
    </div>
  );
}
