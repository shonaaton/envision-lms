/**
 * Accounting inverse of a paid credit-invoice purchase.
 *
 * A purchase applies `+credits` to both `creditBalance` and
 * `totalCreditsPurchased`. Reversing (deleting) that paid invoice must undo
 * exactly that, so the student is returned to the balance they would have had
 * if the invoice had never been paid.
 *
 * The two fields deliberately floor differently:
 *
 * - `creditBalance` has NO floor. Since the grace-class rule made -1 a
 *   legitimate balance, clamping here would fabricate credits: a student who
 *   went -1 -> +4 -> 3 must return to -1 on reversal, not to 0, or the
 *   reversal hands them another final grace class for free.
 *
 * - `totalCreditsPurchased` keeps its floor at 0. It is a lifetime counter of
 *   credits ever bought, so a negative value is meaningless. The equivalent
 *   admin flow (removeManualCredits in fees/credit-monitoring) already floors
 *   this same field at 0, and this keeps the two consistent.
 */
export function reverseCreditPurchase(input: {
  previousBalance: number;
  previousPurchased: number;
  reversedCredits: number;
}) {
  const previousBalance = Number(input.previousBalance || 0);
  const previousPurchased = Number(input.previousPurchased || 0);
  const reversedCredits = Number(input.reversedCredits || 0);
  return {
    reversedCredits,
    previousBalance,
    previousPurchased,
    balanceAfter: previousBalance - reversedCredits,
    purchasedAfter: Math.max(0, previousPurchased - reversedCredits),
  };
}
