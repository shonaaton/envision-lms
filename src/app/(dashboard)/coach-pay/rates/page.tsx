import Link from "next/link";
import { ArrowLeft, Layers, Trash2 } from "lucide-react";

import { DataPanel, EmptyState, PageHeader } from "@/components/common/PageHeader";
import { RateCardForm } from "@/components/coach-pay/RateCardForm";
import { RATE_LADDER, RATE_SCOPE_LABELS } from "@/lib/coachPay";
import { resolveCoachPayViewer } from "@/lib/coachPayAccess";
import { listPayableCoaches } from "@/lib/coachPayData";
import { dbConnect } from "@/lib/db";
import { formatINR } from "@/lib/utils";
import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { CoachRate, type CoachRateScope } from "@/models/CoachPay";
import { deleteRateCard, saveRateCard } from "../actions";

export const dynamic = "force-dynamic";

const KINDS: Array<{ id: string; label: string }> = [
  { id: "regular", label: "Regular" },
  { id: "demo", label: "Demo" },
  { id: "demoConversionBonus", label: "Conversion bonus" },
  { id: "substitute", label: "Substitution" },
];

function rateCell(value: any) {
  const amount = value?.amount;
  if (amount === null || amount === undefined) return <span className="text-slate-300">-</span>;
  return (
    <span className="font-semibold tabular-nums text-slate-950">
      {formatINR(Number(amount))}
      <span className="ml-1 text-xs font-normal text-slate-400">{value?.unit === "per_hour" ? "/hr" : "/class"}</span>
    </span>
  );
}

function targetName(card: any) {
  const parts = [card.coach?.name, card.batch?.name, card.classroom?.title].filter(Boolean);
  return parts.join(" - ") || "Everyone";
}

export default async function CoachRatesPage() {
  const viewer = await resolveCoachPayViewer();
  if (!viewer?.canManageRates) return <div className="p-6 text-sm text-slate-600">Forbidden</div>;

  await dbConnect();
  const [cards, coaches, batches, classrooms] = await Promise.all([
    CoachRate.find({})
      .populate("coach", "name username")
      .populate("batch", "name")
      .populate("classroom", "title")
      .sort({ scope: 1, effectiveFrom: -1 })
      .lean(),
    listPayableCoaches(),
    Batch.find({}).select("name").sort({ name: 1 }).lean(),
    Classroom.find({ isSessionInstance: { $ne: true }, isTestClassroom: { $ne: true } })
      .select("title classroomType")
      .sort({ title: 1 })
      .limit(500)
      .lean(),
  ]);

  // Most specific first, so the list reads in the order the ladder is walked.
  const ordered = [...RATE_LADDER].reverse();
  const grouped = ordered.map((scope) => ({
    scope,
    cards: (cards as any[]).filter((card) => card.scope === scope),
  }));
  const hasAcademyDefault = (cards as any[]).some((card) => card.scope === "academy");

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Payroll workspace"
        title="Coach Rate Cards"
        icon={Layers}
        subtitle="What a class is worth. The most specific card that names a price wins, so an academy default is enough to start and every override narrows from there."
      />

      <div className="mt-3">
        <Link href="/coach-pay" className="btn-outline h-9 px-4 text-xs">
          <ArrowLeft size={14} /> Back to coach pay
        </Link>
      </div>

      {!hasAcademyDefault && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          <span className="font-bold">There is no academy default yet.</span> Until one exists, any class that no other card
          covers is reported as unpriced rather than being given a number nobody agreed to.
        </div>
      )}

      <DataPanel className="mt-3" title="Add or update a rate card" subtitle="Saving the same scope and start date again edits that card." icon={Layers}>
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

      <div className="mt-3 grid gap-3">
        {grouped.map(({ scope, cards: scopeCards }) => (
          <DataPanel
            key={scope}
            title={RATE_SCOPE_LABELS[scope as CoachRateScope]}
            subtitle={`${scopeCards.length} card${scopeCards.length === 1 ? "" : "s"}`}
            icon={Layers}
          >
            {scopeCards.length === 0 ? (
              <EmptyState title="No cards at this level" description="Classes fall through to the next level down." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-2 font-bold">Applies to</th>
                      {KINDS.map((kind) => (
                        <th key={kind.id} className="border-b border-slate-200 px-3 py-2 text-right font-bold">
                          {kind.label}
                        </th>
                      ))}
                      <th className="border-b border-slate-200 px-3 py-2 font-bold">In force from</th>
                      <th className="border-b border-slate-200 px-3 py-2 font-bold">Note</th>
                      <th className="border-b border-slate-200 px-3 py-2 font-bold" />
                    </tr>
                  </thead>
                  <tbody>
                    {scopeCards.map((card: any) => (
                      <tr key={String(card._id)} className="border-b border-slate-100 last:border-0 hover:bg-brand/[0.03]">
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
                        <td className="px-3 py-2 text-xs text-slate-500">{card.note || "-"}</td>
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
            )}
          </DataPanel>
        ))}
      </div>
    </div>
  );
}
