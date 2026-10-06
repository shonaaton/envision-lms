/**
 * The academy's own notes beside each bank row ("teacher fees previous month",
 * "meta ads", "student fees") read as bookings. Pure.
 *
 * Rulings (user, 2026-10-06):
 * - "previous month" means the money is for the month before it moved: teachers,
 *   admin staff and GST are paid around the 7th for last month. It is booked to
 *   the month the work was done.
 * - A credit labelled with fees is a student fee, even "teacher fees this
 *   financial year" (a Google Pay fee settlement).
 * - "loan taken" is the founders' investment: not profit or loss.
 */

export type LabelBooking = {
  /** A category key, or "student_fees": a fee, found in the portal or else offline. */
  category: string;
  /** -1 when the label says the money is for the previous month. */
  monthShift: 0 | -1;
};

/** `previous`: always for the month before it was paid, label or not (sales salary, user 2026-10-07). */
type Rule = { test: RegExp; debit?: string; credit?: string; previous?: boolean };

// First match wins, so the specific phrases sit above the general words.
const RULES: Rule[] = [
  { test: /refund.*(tech|software|crm|subscription)|(tech|software).*refund/, debit: "software", credit: "software" },
  { test: /refund/, debit: "student_refunds", credit: "other_income" },
  { test: /\b(loan|investment|invested|capital)\b/, debit: "loan", credit: "loan" },
  { test: /\bgst\b/, debit: "gst_paid" },
  { test: /\btds\b/, debit: "tds_paid" },
  { test: /sales\s*(person|team|executive)?\s*(salary|salaries|pay)/, debit: "sales_salaries", previous: true },
  { test: /\b(teacher|teachers|coach|coaches|trainer)\b/, debit: "teacher_pay", credit: "student_fees" },
  { test: /\b(admin|office staff|staff salary|salary|salaries)\b/, debit: "staff_salaries" },
  { test: /\b(meta|facebook|fb|instagram|google ads|ads|advert|marketing|agency|seo|promotion)\b/, debit: "marketing" },
  { test: /\b(crm|subscription|software|tech|website|hosting|domain|zoom|app)\b/, debit: "software" },
  { test: /\b(mobile|phone|internet|wifi|broadband|recharge)\b/, debit: "internet_phone" },
  { test: /electric/, debit: "electricity" },
  { test: /\brent\b/, debit: "rent" },
  { test: /\b(licen[cs]e|mca|roc|affiliation|registration|compliance|trade)\b/, debit: "licences" },
  { test: /\b(ca|audit|accountant|legal|lawyer)\b/, debit: "professional_fees" },
  { test: /bank|charge/, debit: "bank_charges" },
  { test: /\b(equipment|board|boards|chess set|clock|furniture|laptop)\b/, debit: "equipment" },
  { test: /\b(fee|fees|student|tuition|admission|class)\b/, credit: "student_fees" },
  { test: /\binterest\b/, credit: "other_income" },
  { test: /\b(transfer|self|own account)\b/, debit: "transfer", credit: "transfer" },
];

export function readLabel(label: string, direction: "debit" | "credit"): LabelBooking | null {
  const text = String(label || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return null;
  const monthShift: 0 | -1 = /\b(previous|prev|last) month\b/.test(text) ? -1 : 0;
  for (const rule of RULES) {
    if (!rule.test.test(text)) continue;
    const category = direction === "debit" ? rule.debit : rule.credit;
    if (category) return { category, monthShift: rule.previous ? -1 : monthShift };
  }
  return null;
}
