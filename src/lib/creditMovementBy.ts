import { isValidObjectId } from "mongoose";
import { Activity } from "@/models/Activity";
import { Attendance } from "@/models/Attendance";
import { Payment } from "@/models/Payment";
import { User } from "@/models/User";
import { creditMovementByText, inferCreditSource, isCreditSource, type CreditSource } from "@/lib/creditMovementSource";

export type CreditMovementBy = {
  source: CreditSource;
  label: string;
  /** "Recorded by Ritu (sub-admin)"; empty when no person was involved. */
  actor: string;
  actorId: string;
};

function idOf(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value._id) return String(value._id);
  return String(value);
}

/**
 * Who or what moved each ledger row's credits, keyed by ledger id.
 *
 * Rows with a stored `source` and `performedBy` need no lookups. Older rows
 * are explained from the trail they left: the purchase activity (which saw
 * how the invoice was paid and by whom), the invoice's Payment, and the
 * attendance sheet the class deduction came from.
 */
export async function describeCreditMovements(ledgers: any[]): Promise<Map<string, CreditMovementBy>> {
  const purchaseIds: string[] = [];
  const paymentIds: string[] = [];
  const attendanceIds: string[] = [];
  for (const ledger of ledgers) {
    const complete = isCreditSource(ledger.source) && ledger.performedBy;
    if (complete) continue;
    if (ledger.type === "purchase" || ledger.sourceType === "Invoice") {
      purchaseIds.push(idOf(ledger._id));
      const paymentId = idOf(ledger.invoice?.payment);
      if (isValidObjectId(paymentId)) paymentIds.push(paymentId);
    } else if (ledger.sourceType === "Attendance" && isValidObjectId(idOf(ledger.sourceId))) {
      attendanceIds.push(idOf(ledger.sourceId));
    }
  }

  const [activities, payments, attendances] = await Promise.all([
    purchaseIds.length
      ? Activity.find({ type: "fees.credits.purchased", entityType: "CreditLedger", entityId: { $in: purchaseIds } }).select("entityId actor metadata.source").lean()
      : [],
    paymentIds.length ? Payment.find({ _id: { $in: paymentIds } }).select("razorpayPaymentId").lean() : [],
    attendanceIds.length ? Attendance.find({ _id: { $in: attendanceIds } }).select("markedBy").lean() : [],
  ]);
  const activityByLedger = new Map((activities as any[]).map((item) => [idOf(item.entityId), item]));
  const onlinePayments = new Set((payments as any[]).filter((item) => item.razorpayPaymentId).map((item) => idOf(item._id)));
  const markerByAttendance = new Map((attendances as any[]).map((item) => [idOf(item._id), idOf(item.markedBy)]));

  // Resolve each row's person first, then fetch any who were not populated.
  const actorIdByLedger = new Map<string, string>();
  for (const ledger of ledgers) {
    const ledgerId = idOf(ledger._id);
    const actorId =
      idOf(ledger.performedBy) ||
      idOf(activityByLedger.get(ledgerId)?.actor) ||
      (ledger.sourceType === "Attendance" ? markerByAttendance.get(idOf(ledger.sourceId)) || "" : "");
    if (isValidObjectId(actorId)) actorIdByLedger.set(ledgerId, actorId);
  }
  const people = new Map<string, { name: string; role: string }>();
  for (const ledger of ledgers) {
    const person = ledger.performedBy;
    if (person && typeof person === "object" && (person.name || person.username)) {
      people.set(idOf(person), { name: person.name || person.username, role: person.role || "" });
    }
  }
  const missing = Array.from(new Set(actorIdByLedger.values())).filter((id) => !people.has(id));
  if (missing.length) {
    const users = await User.find({ _id: { $in: missing } }).select("name username role").lean();
    for (const user of users as any[]) people.set(idOf(user._id), { name: user.name || user.username || "", role: user.role || "" });
  }

  const result = new Map<string, CreditMovementBy>();
  for (const ledger of ledgers) {
    const ledgerId = idOf(ledger._id);
    const source = inferCreditSource(ledger, {
      paymentSource: activityByLedger.get(ledgerId)?.metadata?.source,
      onlinePayment: onlinePayments.has(idOf(ledger.invoice?.payment)),
    });
    const actorId = actorIdByLedger.get(ledgerId) || "";
    const person = people.get(actorId);
    // A stored role is what the person was when they acted; prefer it.
    const text = creditMovementByText(source, person ? { name: person.name, role: ledger.performedByRole || person.role } : null);
    result.set(ledgerId, { source, label: text.label, actor: text.actor, actorId });
  }
  return result;
}
