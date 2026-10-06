/**
 * The academy's chart of accounts, kept in code so a typo can never create a
 * new category and every report adds up the same buckets.
 *
 * `income` and `expense` feed the profit and loss. `non_pl` is money that
 * moves through the bank without being earned or spent: GST and TDS paid to the
 * government (already counted when collected or withheld), the owner's own
 * money, transfers between accounts and loans. Counting those as costs would
 * charge the same rupee twice.
 */

export type AccountKind = "income" | "expense" | "non_pl";

export type AccountCategory = {
  key: string;
  label: string;
  kind: AccountKind;
  /** Fixed costs are paid whatever the student count - used for break-even. */
  fixed?: boolean;
};

export const ACCOUNT_CATEGORIES: AccountCategory[] = [
  { key: "offline_fees", label: "Offline fees (non-GST)", kind: "income" },
  { key: "other_income", label: "Other income", kind: "income" },
  // Fees paid back to families. Booked as negative income, so revenue is net of them.
  { key: "student_refunds", label: "Refunds to students", kind: "income" },

  { key: "teacher_pay", label: "Teacher pay", kind: "expense" },
  { key: "staff_salaries", label: "Admin / staff salaries", kind: "expense", fixed: true },
  { key: "sales_salaries", label: "Sales team salaries", kind: "expense", fixed: true },
  { key: "marketing", label: "Marketing / ads", kind: "expense" },
  { key: "electricity", label: "Electricity", kind: "expense", fixed: true },
  { key: "rent", label: "Rent", kind: "expense", fixed: true },
  { key: "internet_phone", label: "Internet / phone", kind: "expense", fixed: true },
  { key: "software", label: "Software / subscriptions", kind: "expense", fixed: true },
  { key: "gateway_fees", label: "Payment gateway fees", kind: "expense" },
  { key: "bank_charges", label: "Bank charges", kind: "expense", fixed: true },
  { key: "equipment", label: "Equipment", kind: "expense" },
  { key: "student_events", label: "Trophies, printing & events", kind: "expense" },
  { key: "professional_fees", label: "Professional fees (CA / legal)", kind: "expense", fixed: true },
  { key: "licences", label: "Licences & compliance", kind: "expense", fixed: true },
  { key: "misc_expense", label: "Miscellaneous", kind: "expense" },

  { key: "gst_paid", label: "GST paid to government", kind: "non_pl" },
  { key: "tds_paid", label: "TDS deposited", kind: "non_pl" },
  { key: "owner", label: "Owner drawings / capital", kind: "non_pl" },
  { key: "transfer", label: "Transfer between accounts", kind: "non_pl" },
  // Coach pay handed over (usually in cash) against a portal staff invoice. The
  // invoice is already the cost from September 2026; this only moves the money.
  { key: "staff_invoice_paid", label: "Coach pay already on a staff invoice", kind: "non_pl" },
  // Cash handed over for a fee whose portal bill is already marked paid: the
  // bill is the revenue; this only puts the cash in the cash book.
  { key: "portal_cash_fee", label: "Cash fee already paid in the portal", kind: "non_pl" },
  { key: "loan", label: "Loan", kind: "non_pl" },
];

const BY_KEY = new Map(ACCOUNT_CATEGORIES.map((category) => [category.key, category]));

export const ACCOUNT_CATEGORY_KEYS = ACCOUNT_CATEGORIES.map((category) => category.key);
export const EXPENSE_CATEGORIES = ACCOUNT_CATEGORIES.filter((category) => category.kind === "expense");
export const INCOME_CATEGORIES = ACCOUNT_CATEGORIES.filter((category) => category.kind === "income");
export const NON_PL_CATEGORIES = ACCOUNT_CATEGORIES.filter((category) => category.kind === "non_pl");

export type MoneyAccount = "bank" | "cash";

export const MONEY_ACCOUNTS: { key: MoneyAccount; label: string }[] = [
  { key: "bank", label: "HDFC bank" },
  { key: "cash", label: "Cash (with Sayantan)" },
];

export function moneyAccountLabel(key: string) {
  return MONEY_ACCOUNTS.find((account) => account.key === key)?.label || key;
}

/**
 * Which way money moves for a category when nobody says: income comes in, a
 * cost goes out, a refund runs the other way. For GST, TDS and transfers the
 * money leaves; owner money and loans come in.
 */
export function defaultFlow(key: string, refund = false): "in" | "out" {
  const kind = accountCategory(key)?.kind;
  let flow: "in" | "out";
  if (kind === "income") flow = "in";
  else if (kind === "expense") flow = "out";
  else flow = key === "owner" || key === "loan" || key === "portal_cash_fee" ? "in" : "out";
  if (refund) flow = flow === "in" ? "out" : "in";
  return flow;
}

/** People the academy pays, from whom 10% TDS is withheld: booked at the gross amount. */
export const PAYROLL_CATEGORIES = ["teacher_pay", "staff_salaries", "sales_salaries"];

export function isPayrollCategory(key: string) {
  return PAYROLL_CATEGORIES.includes(key);
}

export function accountCategory(key: string) {
  return BY_KEY.get(key) || null;
}

export function categoryLabel(key: string) {
  return BY_KEY.get(key)?.label || key;
}

/**
 * A category typed in an import file: the key, the label, or a loose spelling
 * of either ("Marketing", "electricity bill", "Rent ").
 */
export function resolveCategory(raw: string): AccountCategory | null {
  const text = String(raw || "").trim().toLowerCase();
  if (!text) return null;
  const exact = ACCOUNT_CATEGORIES.find((category) => category.key === text || category.label.toLowerCase() === text);
  if (exact) return exact;
  const squash = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");
  const typed = squash(text);
  const aliases: Record<string, string> = {
    teacher: "teacher_pay",
    teachers: "teacher_pay",
    coach: "teacher_pay",
    coaches: "teacher_pay",
    coachpay: "teacher_pay",
    salary: "staff_salaries",
    staffsalary: "staff_salaries",
    staffsalaries: "staff_salaries",
    admin: "staff_salaries",
    adminsalary: "staff_salaries",
    adminsalaries: "staff_salaries",
    sales: "sales_salaries",
    salessalary: "sales_salaries",
    license: "licences",
    licence: "licences",
    tradelicense: "licences",
    refund: "student_refunds",
    refunds: "student_refunds",
    salaries: "staff_salaries",
    staff: "staff_salaries",
    ads: "marketing",
    advertising: "marketing",
    facebook: "marketing",
    meta: "marketing",
    google: "marketing",
    electric: "electricity",
    electricitybill: "electricity",
    power: "electricity",
    internet: "internet_phone",
    phone: "internet_phone",
    wifi: "internet_phone",
    subscription: "software",
    subscriptions: "software",
    razorpay: "gateway_fees",
    gateway: "gateway_fees",
    bank: "bank_charges",
    ca: "professional_fees",
    legal: "professional_fees",
    accountant: "professional_fees",
    trophy: "student_events",
    trophies: "student_events",
    printing: "student_events",
    print: "student_events",
    event: "student_events",
    events: "student_events",
    staffinvoice: "staff_invoice_paid",
    staffinvoicepaid: "staff_invoice_paid",
    coachpayonstaffinvoice: "staff_invoice_paid",
    onstaffinvoice: "staff_invoice_paid",
    misc: "misc_expense",
    miscellaneous: "misc_expense",
    other: "misc_expense",
    gst: "gst_paid",
    tds: "tds_paid",
    offline: "offline_fees",
    fees: "offline_fees",
    fee: "offline_fees",
  };
  if (aliases[typed]) return BY_KEY.get(aliases[typed]) || null;
  if (typed.length < 3) return null;
  return ACCOUNT_CATEGORIES.find((category) => typed.startsWith(squash(category.label).slice(0, 6)) || squash(category.label).startsWith(typed)) || null;
}
