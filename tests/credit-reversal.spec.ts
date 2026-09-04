import { expect, test } from "@playwright/test";
import { reverseCreditPurchase } from "../src/lib/creditReversal";
import { evaluateCreditBalance } from "../src/lib/classroomCreditAccess";

// Reversing a paid credit invoice must be the exact accounting inverse of the
// purchase that applied it. `creditBalance` has no floor (-1 is legitimate
// under the grace-class rule); `totalCreditsPurchased` keeps its floor at 0
// because it is a lifetime counter.

test("case 1: -1 -> +4 -> 3, reversed returns to -1 (not 0)", () => {
  const afterRecharge = -1 + 4;
  expect(afterRecharge).toBe(3);

  const reversal = reverseCreditPurchase({
    previousBalance: afterRecharge,
    previousPurchased: 4,
    reversedCredits: 4,
  });
  expect(reversal.balanceAfter).toBe(-1);
  expect(reversal.balanceAfter).not.toBe(0);
});

test("case 2: 0 -> +4 -> 4, reversed returns to 0", () => {
  const reversal = reverseCreditPurchase({
    previousBalance: 0 + 4,
    previousPurchased: 4,
    reversedCredits: 4,
  });
  expect(reversal.balanceAfter).toBe(0);
});

test("case 3: 2 -> +4 -> 6, reversed returns to 2", () => {
  const reversal = reverseCreditPurchase({
    previousBalance: 2 + 4,
    previousPurchased: 10,
    reversedCredits: 4,
  });
  expect(reversal.balanceAfter).toBe(2);
});

test("case 4: totalCreditsPurchased keeps its zero floor and never goes negative", () => {
  // Lifetime counter already lower than the reversed amount (legacy/imported data).
  const reversal = reverseCreditPurchase({
    previousBalance: 3,
    previousPurchased: 1,
    reversedCredits: 4,
  });
  expect(reversal.purchasedAfter).toBe(0);
  // The balance is still reversed exactly, independent of the purchased floor.
  expect(reversal.balanceAfter).toBe(-1);

  const normal = reverseCreditPurchase({ previousBalance: 6, previousPurchased: 10, reversedCredits: 4 });
  expect(normal.purchasedAfter).toBe(6);
});

test("case 5: reversing the same invoice twice deducts once, never 3 -> -1 -> -5", () => {
  // A second delete normally never reaches this code at all: the invoice is
  // hard-deleted, so the retry hits `findById -> null` and redirects before
  // touching credits. If two deletes did race, both read the same pre-reversal
  // state and both write the SAME absolute value (not $inc), so the second
  // write is a no-op rather than a second deduction.
  const snapshot = { previousBalance: 3, previousPurchased: 4, reversedCredits: 4 };
  const first = reverseCreditPurchase(snapshot);
  const second = reverseCreditPurchase(snapshot);

  expect(first.balanceAfter).toBe(-1);
  expect(second.balanceAfter).toBe(-1);
  expect(second.balanceAfter).not.toBe(-5);
  expect(second.purchasedAfter).toBe(first.purchasedAfter);
});

test("case 6: after reversal to -1 the existing classroom gate blocks the student", () => {
  const reversal = reverseCreditPurchase({ previousBalance: 3, previousPurchased: 4, reversedCredits: 4 });
  expect(evaluateCreditBalance(reversal.balanceAfter)).toBe("blocked");
  // No second grace class: the blocked state is not "final_class".
  expect(evaluateCreditBalance(reversal.balanceAfter)).not.toBe("final_class");
});

test("recharge then reversal round-trips the balance for a range of starting points", () => {
  for (const start of [-1, 0, 2, 7]) {
    const recharged = start + 4;
    const reversal = reverseCreditPurchase({ previousBalance: recharged, previousPurchased: 20, reversedCredits: 4 });
    expect(reversal.balanceAfter).toBe(start);
  }
});

test("classroom access follows the balance across recharge and reversal", () => {
  const blockedStart = -1;
  expect(evaluateCreditBalance(blockedStart)).toBe("blocked");
  const recharged = blockedStart + 4;
  expect(evaluateCreditBalance(recharged)).toBe("ok");
  const reversed = reverseCreditPurchase({ previousBalance: recharged, previousPurchased: 4, reversedCredits: 4 }).balanceAfter;
  expect(evaluateCreditBalance(reversed)).toBe("blocked");
});
