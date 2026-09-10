import Link from "next/link";
import { ArrowLeft, Inbox, Layers, Repeat, Trash2, UserCog } from "lucide-react";

import { DataPanel, EmptyState, PageHeader } from "@/components/common/PageHeader";
import { CoachRateMatrix, type MatrixRow } from "@/components/coach-pay/CoachRateMatrix";
import { RateCardForm } from "@/components/coach-pay/RateCardForm";
import { RATE_SCOPE_LABELS, type ResolvedRate } from "@/lib/coachPay";
import { resolveCoachPayViewer } from "@/lib/coachPayAccess";
import { countPendingProposals, listPayableCoaches, loadCoachAssignments, type CoachAssignmentRow } from "@/lib/coachPayData";
import { dbConnect } from "@/lib/db";
import { formatINR } from "@/lib/utils";
import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { CoachRate, type CoachRateScope } from "@/models/CoachPay";
import { deleteRateCard, saveCoachClassroomRates, saveRateCard, submitClassroomRateProposal, withdrawProposal } from "../actions";

export const dynamic = "force-dynamic";

// The coach-wise grid owns `classroom_coach`, so the fallback list below shows
// only the rungs it does not - otherwise the same card appears in two places
// with two different editors.
const FALLBACK_SCOPES: CoachRateScope[] = ["classroom", "batch_coach", "batch", "coach", "academy"];

const KINDS = [
  { id: "regular", label: "Regular" },
  { id: "demo", label: "Demo" },
  { id: "demoConversionBonus", label: "Conversion bonus" },
  { id: "substitute", label: "Substitution" },
];

function value(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return (typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "") || "";
}

function rateCell(entry: any) {
  const amount = entry?.amount;
  if (amount === null || amount === undefined) return <span className="text-slate-300">-</span>;
  return (
    <span className="font-semibold tabular-nums text-slate-950">
      {formatINR(Number(amount))}
      <span className="ml-1 text-xs font-normal text-slate-400">{entry?.unit === "per_hour" ? "/hr" : "/class"}</span>
    </span>
  );
}

function targetName(card: any) {
  return [card.coach?.name, card.batch?.name, card.classroom?.title].filter(Boolean).join(" - ") || "Everyone";
}

function toMatrixRows(rows: CoachAssignmentRow[]): MatrixRow[] {
  const label = (resolved: ResolvedRate | null) =>
    resolved ? { amount: resolved.amount, unit: resolved.unit, sourceLabel: RATE_SCOPE_LABELS[resolved.source] } : null;
  return rows.map((row) => ({
    classroomId: row.classroomId,
    classroomTitle: row.classroomTitle,
    classroomType: row.classroomType,
    batchName: row.batchName,
    isActive: row.isActive,
    ownValues: row.card ? row.card.values : null,
    effective: {
      regular: label(row.effective.regular),
      demo: label(row.effective.demo),
      demoConversionBonus: label(row.effective.demoConversionBonus),
      substitute: label(row.effective.substitute),
    },
    pendingProposal: row.pendingProposal
      ? {
          id: row.pendingProposal.id,
          values: row.pendingProposal.values,
          note: row.pendingProposal.note,
          submittedAtLabel: row.pendingProposal.submittedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
        }
      : null,
  }));
}

export default async function CoachRatesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await resolveCoachPayViewer();
  if (!viewer) return <div className="p-6 text-sm text-slate-600">Forbidden</div>;

  const params = searchParams ? await searchParams : {};
  await dbConnect();

  // A coach sees exactly one grid: their own, in propose mode.
  if (!viewer.canManageRates) {
    const rows = await loadCoachAssignments(viewer.userId);
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="My earnings"
          title="My Class Rates"
          icon={Layers}
          subtitle="What each of your classes pays today, and where that number comes from. You can put forward a different rate for any of them; an admin approves it before it takes effect."
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/coach-pay" className="btn-outline h-9 px-4 text-xs">
            <ArrowLeft size={14} /> Back to my earnings
          </Link>
          <Link href="/coach-pay/substitutions" className="btn-outline h-9 px-4 text-xs">
            <Repeat size={14} /> My substitutions
          </Link>
        </div>
        <DataPanel className="mt-3" title="Your classes" subtitle="One row per classroom you are assigned to" icon={Layers}>
          <CoachRateMatrix
            coachId={viewer.userId}
            coachName={viewer.name}
            rows={toMatrixRows(rows)}
            mode="propose"
            action={submitClassroomRateProposal}
            withdrawAction={withdrawProposal}
          />
        </DataPanel>
      </div>
    );
  }

  const coaches = await listPayableCoaches();
  const selectedCoach = value(params, "coach") || String((coaches as any[])[0]?._id || "");
  const selected = (coaches as any[]).find((coach) => String(coach._id) === selectedCoach);

  const [assignments, cards, batches, classrooms, pendingProposals] = await Promise.all([
    selectedCoach ? loadCoachAssignments(selectedCoach) : Promise.resolve([]),
    CoachRate.find({ scope: { $in: FALLBACK_SCOPES } })
      .populate("coach", "name username")
      .populate("batch", "name")
      .populate("classroom", "title")
      .sort({ scope: 1, effectiveFrom: -1 })
      .lean(),
    Batch.find({}).select("name").sort({ name: 1 }).lean(),
    Classroom.find({ isSessionInstance: { $ne: true }, isTestClassroom: { $ne: true } })
      .select("title classroomType")
      .sort({ title: 1 })
      .limit(500)
      .lean(),
    countPendingProposals(),
  ]);

  const hasAcademyDefault = (cards as any[]).some((card) => card.scope === "academy");

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Payroll workspace"
        title="Coach Rate Cards"
        icon={Layers}
        subtitle="Rates are set per coach, per class. Pick a coach to price the classes they teach; the fallback cards further down catch anything not priced that way."
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/coach-pay" className="btn-outline h-9 px-4 text-xs">
          <ArrowLeft size={14} /> Back to coach pay
        </Link>
        <Link href="/coach-pay/substitutions" className="btn-outline h-9 px-4 text-xs">
          <Repeat size={14} /> Substitutions
        </Link>
        <Link href="/coach-pay/proposals" className="btn-outline h-9 px-4 text-xs">
          <Inbox size={14} /> Coach submissions
          {pendingProposals > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">{pendingProposals}</span>
          )}
        </Link>
      </div>

      {!hasAcademyDefault && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          <span className="font-bold">There is no academy default yet.</span> Any class not priced for its coach below is
          reported as unpriced rather than being given a number nobody agreed to.
        </div>
      )}

      <DataPanel className="mt-3" title="Rates by coach" subtitle="Each class this coach teaches, priced for them" icon={UserCog}>
        <form method="get" className="mb-3 flex flex-wrap gap-2">
          <select name="coach" defaultValue={selectedCoach} className="input h-10 w-auto min-w-[220px]" aria-label="Coach">
            {(coaches as any[]).map((coach) => (
              <option key={String(coach._id)} value={String(coach._id)}>
                {coach.name || coach.username}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary h-10 px-5">
            Show classes
          </button>
        </form>

        {selectedCoach ? (
          <CoachRateMatrix
            coachId={selectedCoach}
            coachName={selected?.name || selected?.username || "This coach"}
            rows={toMatrixRows(assignments)}
            mode="manage"
            action={saveCoachClassroomRates}
          />
        ) : (
          <EmptyState title="No coaches yet" description="Add a coach account to start setting rates." />
        )}
      </DataPanel>

      <DataPanel
        className="mt-3"
        title="Fallback rates"
        subtitle="Used only where a class has no rate for its coach. An academy default means nothing is ever unpriced."
        icon={Layers}
      >
        <RateCardForm
          action={saveRateCard}
          coaches={(coaches as any[]).map((coach) => ({ id: String(coach._id), name: coach.name || coach.username || "Coach" }))}
          batches={(batches as any[]).map((batch) => ({ id: String(batch._id), name: batch.name }))}
          classrooms={(classrooms as any[]).map((classroom) => ({
            id: String(classroom._id),
            name: `${classroom.title}${classroom.classroomType === "demo" ? " (demo)" : ""}`,
          }))}
        />
      </DataPanel>

      {(cards as any[]).length > 0 && (
        <DataPanel className="mt-3" title="Fallback cards in place" subtitle={`${(cards as any[]).length} card(s)`} icon={Layers}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Level</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Applies to</th>
                  {KINDS.map((kind) => (
                    <th key={kind.id} className="border-b border-slate-200 px-3 py-2 text-right font-bold">
                      {kind.label}
                    </th>
                  ))}
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">In force from</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold" />
                </tr>
              </thead>
              <tbody>
                {(cards as any[]).map((card) => (
                  <tr key={String(card._id)} className="border-b border-slate-100 last:border-0 hover:bg-brand/[0.03]">
                    <td className="px-3 py-2 text-xs font-semibold text-slate-500">{RATE_SCOPE_LABELS[card.scope as CoachRateScope]}</td>
                    <td className="px-3 py-2 font-semibold text-slate-950">{targetName(card)}</td>
                    {KINDS.map((kind) => (
                      <td key={kind.id} className="px-3 py-2 text-right">
                        {rateCell(card[kind.id])}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                      {new Date(card.effectiveFrom || 0).getTime() <= 0
                        ? "All history"
                        : new Date(card.effectiveFrom).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <form action={deleteRateCard}>
                        <input type="hidden" name="id" value={String(card._id)} />
                        <button type="submit" className="btn-ghost h-8 px-2 text-xs text-rose-600 hover:bg-rose-50" title="Delete this rate card">
                          <Trash2 size={13} />
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataPanel>
      )}
    </div>
  );
}
