import { describe, expect, it } from "vitest";

import { emptyMatchContext, narrationHas, suggestFor, type MatchContext } from "@/lib/accounts/match";

const at = (day: string) => new Date(`${day}T12:00:00+05:30`);

function context(patch: Partial<MatchContext> = {}): MatchContext {
  return { ...emptyMatchContext(), ...patch };
}

const coach = {
  staffId: "c1",
  name: "Dhritabrata Sen",
  names: ["Dhritabrata Sen"],
  invoices: [{ id: "si-sep", month: "2026-09", total: 2_000_000 }],
};

describe("suggestFor - credits", () => {
  it("matches a portal payment by its UTR anywhere in the narration", () => {
    const portalRefs = new Map([["412345678901", { invoices: ["inv1"], payments: [], label: "ENV/26-27/014" }]]);
    const suggestion = suggestFor(
      { date: at("2026-04-02"), month: "2026-04", narration: "UPI-RAVI KUMAR-412345678901", reference: "", debit: 0, credit: 300_000 },
      context({ portalRefs })
    );
    expect(suggestion).toMatchObject({ type: "portal", invoices: ["inv1"] });
  });

  it("treats a Razorpay credit as a settlement already counted in the portal", () => {
    const suggestion = suggestFor(
      { date: at("2026-04-03"), month: "2026-04", narration: "NEFT CR-RAZORPAY SOFTWARE PVT LTD-SETTLEMENT", reference: "", debit: 0, credit: 980_000 },
      context()
    );
    expect(suggestion.type).toBe("razorpay");
  });

  it("treats a credit beside a portal payment of the same amount as a fee receipt", () => {
    const manualPayments = [{ invoiceId: "inv2", amount: 450_000, date: at("2026-05-10"), label: "ENV/26-27/020" }];
    const tx = { date: at("2026-05-12"), month: "2026-05", narration: "IMPS FROM PARENT", reference: "", debit: 0, credit: 450_000 };
    expect(suggestFor(tx, context({ manualPayments }))).toMatchObject({ type: "fee_receipt", invoices: ["inv2"] });
    const two = [...manualPayments, { invoiceId: "inv3", amount: 450_000, date: at("2026-05-11"), label: "ENV/26-27/021" }];
    expect(suggestFor(tx, context({ manualPayments: two }))).toMatchObject({ type: "fee_receipt", invoices: undefined });
    expect(suggestFor({ ...tx, date: at("2026-05-20") }, context({ manualPayments })).type).toBe("none");
  });

  it("leaves an unknown, unlabelled credit for the admin", () => {
    expect(suggestFor({ date: at("2026-05-12"), month: "2026-05", narration: "CASH DEPOSIT", reference: "", debit: 0, credit: 100_000 }, context()).type).toBe("none");
  });
});

describe("suggestFor - debits", () => {
  it("matches a September coach payout of 90% to their staff invoice", () => {
    const suggestion = suggestFor(
      { date: at("2026-10-04"), month: "2026-10", narration: "NEFT DR-DHRITABRATA SEN-HDFC", reference: "", debit: 1_800_000, credit: 0 },
      context({ coaches: [coach] })
    );
    expect(suggestion).toMatchObject({ type: "staff_invoice", staffInvoice: "si-sep" });
  });

  it("flags a portal-era coach payout that matches no invoice instead of adding a cost", () => {
    const suggestion = suggestFor(
      { date: at("2026-10-04"), month: "2026-10", narration: "NEFT DR-DHRITABRATA SEN-HDFC", reference: "", debit: 777_700, credit: 0 },
      context({ coaches: [coach] })
    );
    expect(suggestion.type).toBe("coach_unmatched");
  });

  it("books a pre-September coach payout as teacher pay", () => {
    const suggestion = suggestFor(
      { date: at("2026-06-03"), month: "2026-06", narration: "UPI/DR/1234/DHRITABRATA SEN/SBIN", reference: "", debit: 900_000, credit: 0 },
      context({ coaches: [coach] })
    );
    expect(suggestion).toMatchObject({ type: "category", category: "teacher_pay" });
  });

  it("links a cost already typed into the ledger rather than adding it twice", () => {
    const ledger = [{ id: "e1", category: "rent", amount: 2_500_000, date: at("2026-06-01"), label: "Rent June" }];
    const suggestion = suggestFor({ date: at("2026-06-03"), month: "2026-06", narration: "NEFT DR-LANDLORD", reference: "", debit: 2_500_000, credit: 0 }, context({ ledger }));
    expect(suggestion).toMatchObject({ type: "ledger", entry: "e1" });
  });

  it("uses the admin's rules before the built-in ones", () => {
    const rules = [{ pattern: "cesc", direction: "debit" as const, category: "misc_expense" }];
    const tx = { date: at("2026-06-03"), month: "2026-06", narration: "UPI/DR/1/CESC LIMITED/YESB", reference: "", debit: 125_000, credit: 0 };
    expect(suggestFor(tx, context()).category).toBe("electricity");
    expect(suggestFor(tx, context({ rules })).category).toBe("misc_expense");
  });
});

describe("narrationHas", () => {
  it("matches whole words only", () => {
    expect(narrationHas("ACH D- CURRENT ACCOUNT", "rent")).toBe(false);
    expect(narrationHas("OFFICE RENT JUNE", "rent")).toBe(true);
  });
});
