import "server-only";
import { dbConnect } from "@/lib/db";
import { academyDateKey } from "@/lib/academyTime";
import { recordActivity } from "@/lib/activity";
import { BranchCashEntry, BranchFeeBill, BranchStudent } from "@/models/Branch";
import type { BranchKey } from "./scope";
import { BranchError } from "./errors";
import { isDateKey, monthLabel, rupeesToPaise, todayKey } from "./rules";
import { isCashCategory, statementRowKeys, type CashRow } from "./statementParse";

/**
 * The branch cashbook (/bowbazar/accounts). It joins two sources:
 *  - BranchCashEntry: the old account statement, row for row, plus expenses
 *    and other income staff add by hand;
 *  - the fee payments recorded in the portal, read live from the bills. The
 *    payments the import carried over are left out, since the statement rows
 *    already hold that money.
 */

/** Collector name on the payments the import carried over (lib/branch/import.ts). */
export const CARRIED_OVER = "Earlier system";

export type CashLine = {
  id: string;
  date: string;
  kind: "income" | "expense";
  amount: number; // paise
  description: string;
  category: string;
  regNo: string;
  month: string;
  note: string;
  source: "import" | "manual" | "portal";
  receiptNo: string;
  byName: string;
};

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");

function serialize(entry: any): CashLine {
  return {
    id: id(entry),
    date: entry.date,
    kind: entry.kind,
    amount: entry.amount || 0,
    description: entry.description,
    category: entry.category,
    regNo: entry.regNo || "",
    month: entry.month || "",
    note: entry.note || "",
    source: entry.source,
    receiptNo: "",
    byName: entry.updatedByName || entry.createdByName || (entry.source === "import" ? "Account statement" : ""),
  };
}

/** Fee payments taken in the portal, as cashbook lines. */
async function portalFeeLines(branch: BranchKey): Promise<CashLine[]> {
  const bills: any[] = await BranchFeeBill.find({ branch, "payments.0": { $exists: true } }).select("student month payments").lean();
  const lines: CashLine[] = [];
  const studentIds = new Set<string>();
  for (const bill of bills) {
    for (const payment of bill.payments || []) {
      if (payment.collectedByName === CARRIED_OVER) continue;
      studentIds.add(id(bill.student));
      lines.push({
        id: `fee-${id(payment)}`,
        date: academyDateKey(payment.paidAt),
        kind: "income",
        amount: payment.amount || 0,
        description: `Fee for ${monthLabel(bill.month)}`,
        category: "fee",
        regNo: id(bill.student), // swapped for the real number below
        month: bill.month,
        note: payment.note || "",
        source: "portal",
        receiptNo: payment.receiptNo || "",
        byName: payment.collectedByName || "",
      });
    }
  }
  if (!lines.length) return lines;
  const students: any[] = await BranchStudent.find({ _id: { $in: [...studentIds] } }).select("name regNo").lean();
  const byId = new Map(students.map((student) => [id(student), student]));
  for (const line of lines) {
    const student = byId.get(line.regNo);
    line.description = `${line.description} · ${student?.name || "Removed student"}`;
    line.regNo = student?.regNo || "";
  }
  return lines;
}

export async function listCashbook(branch: BranchKey) {
  await dbConnect();
  const [entries, fees, names] = await Promise.all([
    BranchCashEntry.find({ branch }).sort({ date: -1, createdAt: -1 }).lean(),
    portalFeeLines(branch),
    BranchStudent.find({ branch, regNo: { $exists: true, $ne: "" } }).select("name regNo").lean(),
  ]);
  const lines = [...(entries as any[]).map(serialize), ...fees].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return {
    lines,
    // Registration number -> name, so statement rows can show who paid.
    names: Object.fromEntries((names as any[]).map((student) => [student.regNo, student.name])),
    importedRows: (entries as any[]).filter((entry) => entry.source === "import").length,
  };
}

type Actor = { id: string; name: string };

function readFields(input: any, partial: boolean) {
  const out: Record<string, unknown> = {};
  if (!partial || input?.date !== undefined) {
    if (!isDateKey(input?.date)) throw new BranchError("Choose the date.");
    if (input.date > todayKey()) throw new BranchError("The date can't be in the future.");
    out.date = input.date;
  }
  if (!partial || input?.kind !== undefined) {
    if (input?.kind !== "income" && input?.kind !== "expense") throw new BranchError("Choose expense or income.");
    out.kind = input.kind;
  }
  if (!partial || input?.amount !== undefined) {
    const amount = rupeesToPaise(input?.amount);
    if (amount === null || amount <= 0) throw new BranchError("Enter an amount above ₹0.");
    if (amount > 1_00_00_000_00) throw new BranchError("That amount is too large.");
    out.amount = amount;
  }
  if (!partial || input?.description !== undefined) {
    const description = String(input?.description || "").trim().slice(0, 200);
    if (!description) throw new BranchError("Say what it was for.");
    out.description = description;
  }
  if (!partial || input?.category !== undefined) {
    if (!isCashCategory(input?.category)) throw new BranchError("Choose a category.");
    out.category = input.category;
  }
  if (input?.note !== undefined) out.note = String(input.note || "").trim().slice(0, 500);
  return out;
}

export async function addCashEntry(branch: BranchKey, input: any, actor: Actor) {
  await dbConnect();
  const fields = readFields(input, false);
  const entry: any = await BranchCashEntry.create({ ...fields, branch, source: "manual", createdBy: actor.id, createdByName: actor.name });
  void recordActivity({
    actor: actor.id,
    type: "branch.cash.add",
    label: `Added ${fields.kind} ₹${Number(fields.amount) / 100}: ${fields.description}`,
    entityType: "BranchCashEntry",
    entityId: id(entry),
  });
  return serialize(entry.toObject());
}

/** Lines typed in by staff can change in full; statement lines only take a category and a note. */
export async function updateCashEntry(branch: BranchKey, entryId: string, input: any, actor: Actor) {
  await dbConnect();
  const entry: any = await BranchCashEntry.findOne({ _id: entryId, branch }).lean().catch(() => null);
  if (!entry) throw new BranchError("That line is no longer in the cashbook.", 404);
  let fields = readFields(input, true);
  if (entry.source === "import") {
    fields = Object.fromEntries(Object.entries(fields).filter(([key]) => key === "category" || key === "note"));
  }
  if (!Object.keys(fields).length) throw new BranchError("Nothing to change.");
  const updated: any = await BranchCashEntry.findOneAndUpdate({ _id: entryId, branch }, { $set: { ...fields, updatedByName: actor.name } }, { new: true }).lean();
  void recordActivity({ actor: actor.id, type: "branch.cash.edit", label: `Edited cashbook line: ${updated.description}`, entityType: "BranchCashEntry", entityId: entryId });
  return serialize(updated);
}

export async function deleteCashEntry(branch: BranchKey, entryId: string, actor: Actor) {
  await dbConnect();
  const entry: any = await BranchCashEntry.findOne({ _id: entryId, branch }).lean().catch(() => null);
  if (!entry) throw new BranchError("That line is no longer in the cashbook.", 404);
  if (entry.source === "import") throw new BranchError("Lines from the account statement are kept as they were. Change the category or add a note instead.");
  await BranchCashEntry.deleteOne({ _id: entryId, branch });
  void recordActivity({
    actor: actor.id,
    type: "branch.cash.delete",
    label: `Deleted ${entry.kind} ₹${entry.amount / 100} from ${entry.date}: ${entry.description}`,
    entityType: "BranchCashEntry",
    entityId: entryId,
  });
  return { ok: true };
}

/** Writes every statement row once; rows already imported are left alone. */
export async function importCashRows(branch: BranchKey, rows: CashRow[], actor: Actor) {
  if (!rows.length) return { added: 0, kept: 0 };
  const keys = statementRowKeys(rows);
  const write = await BranchCashEntry.bulkWrite(
    rows.map((row, index) => ({
      updateOne: {
        filter: { branch, sourceKey: keys[index] },
        update: {
          $setOnInsert: {
            branch,
            sourceKey: keys[index],
            source: "import",
            date: row.date,
            kind: row.kind,
            amount: Math.max(0, Math.round(row.amount * 100)),
            description: row.description,
            category: row.category,
            ...(row.regNo ? { regNo: row.regNo } : {}),
            ...(row.month ? { month: row.month } : {}),
            createdBy: actor.id,
            createdByName: "Account statement",
          },
        },
        upsert: true,
      },
    })),
    { ordered: false }
  );
  return { added: write.upsertedCount, kept: rows.length - write.upsertedCount };
}

export async function importedCashCount(branch: BranchKey) {
  return BranchCashEntry.countDocuments({ branch, source: "import" });
}
