/**
 * The academy's cash, which Sayantan holds. Pure: movements in, a running
 * balance out.
 *
 * Cash is counted by the day it changed hands, not by the month a cost
 * belongs to: March's teacher pay handed over in April left the cash box in
 * April, even though the P&L books it to March. A balance below zero means the
 * holder has paid academy costs from his own pocket and is owed that much.
 */

export type CashMovement = {
  /** Academy month the cash moved in, "YYYY-MM". */
  month: string;
  flow: "in" | "out";
  amount: number;
  /** "fees" (portal or offline student fees), "other_in", or a cost category key. */
  group: string;
  /** For the month's detail list. */
  date?: Date;
  label?: string;
  category?: string;
  source?: "portal" | "ledger";
};

export type CashMonth = {
  month: string;
  opening: number;
  feesIn: number;
  otherIn: number;
  out: number;
  outByGroup: Record<string, number>;
  closing: number;
};

export function buildCashBook(openingCash: number, movements: CashMovement[], months: string[]) {
  const first = months[0];
  // Everything before the first month shown rolls into its opening balance.
  let balance = openingCash;
  for (const move of movements) {
    if (move.month < first) balance += move.flow === "in" ? Math.abs(move.amount) : -Math.abs(move.amount);
  }
  const rows: CashMonth[] = [];
  for (const month of months) {
    const row: CashMonth = { month, opening: balance, feesIn: 0, otherIn: 0, out: 0, outByGroup: {}, closing: 0 };
    for (const move of movements) {
      if (move.month !== month) continue;
      const amount = Math.abs(move.amount);
      if (move.flow === "in") {
        if (move.group === "fees") row.feesIn += amount;
        else row.otherIn += amount;
      } else {
        row.out += amount;
        row.outByGroup[move.group] = (row.outByGroup[move.group] || 0) + amount;
      }
    }
    balance += row.feesIn + row.otherIn - row.out;
    row.closing = balance;
    rows.push(row);
  }
  return { rows, closing: balance };
}
