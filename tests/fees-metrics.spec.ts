import { expect, test } from "@playwright/test";
import {
  isGstInvoice,
  joinedAt,
  leftAt,
  matchesGst,
  mergeLostInvoices,
  monthlyCyclesInRange,
  monthlyDueDate,
  pauseHoldWindow,
  planMatchesGst,
  rate,
  resolveRange,
  retentionBucket,
  unbilledPauseCycles,
} from "../src/lib/feesMetrics";

// The finance dashboard reports money, so every definition behind a KPI is
// pinned here: what counts as GST, when a monthly plan bills, and whether an
// unpaid invoice was actually missed or is simply not due yet.

const day = (value: string) => new Date(value);

test("GST classification follows the invoice mode, not just the tax amount", () => {
  expect(isGstInvoice({ invoiceMode: "excluded", gstAmount: 1800, gstPercentage: 18 })).toBe(true);
  expect(isGstInvoice({ invoiceMode: "included", gstAmount: 0, gstPercentage: 18 })).toBe(true);
  // A non-GST invoice stays non-GST even if stale tax fields linger on the row.
  expect(isGstInvoice({ invoiceMode: "non_gst", gstAmount: 1800, gstPercentage: 18 })).toBe(false);
  expect(isGstInvoice({ invoiceMode: "excluded", gstAmount: 0, gstPercentage: 0 })).toBe(false);
});

test("the GST selector splits invoices into two non-overlapping sets", () => {
  const gstInvoice = { invoiceMode: "excluded", gstAmount: 1800, gstPercentage: 18 };
  const plainInvoice = { invoiceMode: "non_gst", gstAmount: 0, gstPercentage: 0 };

  for (const invoice of [gstInvoice, plainInvoice]) {
    expect(matchesGst(invoice, "all")).toBe(true);
    // Exactly one of the two filters claims each invoice.
    expect(matchesGst(invoice, "gst") !== matchesGst(invoice, "non_gst")).toBe(true);
  }
  expect(matchesGst(gstInvoice, "gst")).toBe(true);
  expect(matchesGst(plainInvoice, "non_gst")).toBe(true);
});

test("plan level GST filtering matches the invoice level rule", () => {
  const taxedPlan = { gstMode: "excluded", gstPercentage: 18 };
  const plainPlan = { gstMode: "non_gst", gstPercentage: 0 };
  expect(planMatchesGst(taxedPlan, "gst")).toBe(true);
  expect(planMatchesGst(taxedPlan, "non_gst")).toBe(false);
  expect(planMatchesGst(plainPlan, "non_gst")).toBe(true);
  expect(planMatchesGst(plainPlan, "all")).toBe(true);
});

test("retention splits an existing student's invoices into collected, missed and pending", () => {
  const now = day("2026-09-06T12:00:00");
  expect(retentionBucket({ status: "paid", dueDate: day("2026-09-01") }, now)).toBe("collected");
  // Due date has passed and it is still open: that is money genuinely missed.
  expect(retentionBucket({ status: "unpaid", dueDate: day("2026-09-01") }, now)).toBe("missed");
  expect(retentionBucket({ status: "overdue", dueDate: day("2026-08-20") }, now)).toBe("missed");
  // Not due yet, so it must not drag the retention rate down.
  expect(retentionBucket({ status: "unpaid", dueDate: day("2026-09-30") }, now)).toBe("pending");
  // Cancelled invoices are never billed, so they sit outside the rate entirely.
  expect(retentionBucket({ status: "cancelled", dueDate: day("2026-09-01") }, now)).toBe("excluded");
});

test("a paid invoice counts as collected even when it was paid late", () => {
  const now = day("2026-09-06T12:00:00");
  expect(retentionBucket({ status: "paid", dueDate: day("2026-07-01") }, now)).toBe("collected");
});

test("monthly billing cycles inside a range are anchored to the first due date", () => {
  const anchor = day("2026-01-10T00:00:00");
  const cycles = monthlyCyclesInRange(anchor, day("2026-03-01T00:00:00"), day("2026-05-31T23:59:59.999"));
  expect(cycles.length).toBe(3);
  expect(cycles.map((date) => date.getMonth())).toEqual([2, 3, 4]);
  // Each due date ends its day, exactly like the generated invoices.
  expect(cycles[0].getHours()).toBe(23);
  expect(cycles[0].getDate()).toBe(10);
});

test("a plan that starts after the range bills nothing inside it", () => {
  const anchor = day("2026-11-05T00:00:00");
  expect(monthlyCyclesInRange(anchor, day("2026-09-01"), day("2026-09-30T23:59:59.999")).length).toBe(0);
});

test("a single month range yields exactly one billing cycle", () => {
  const anchor = day("2025-04-15T00:00:00");
  const cycles = monthlyCyclesInRange(anchor, day("2026-09-01T00:00:00"), day("2026-09-30T23:59:59.999"));
  expect(cycles.length).toBe(1);
  expect(cycles[0].getDate()).toBe(15);
});

test("monthlyDueDate is the shared anchor used by both billing and forecasting", () => {
  const due = monthlyDueDate(day("2026-01-31T09:00:00"), 1);
  expect(due.getHours()).toBe(23);
  expect(due.getMinutes()).toBe(59);
});

test("conversion and retention rates round to one decimal and never divide by zero", () => {
  expect(rate(1, 3)).toBe(33.3);
  expect(rate(2, 4)).toBe(50);
  expect(rate(0, 0)).toBe(0);
  expect(rate(5, 0)).toBe(0);
  expect(rate(4, 4)).toBe(100);
});

test("a converted demo student's join date is the conversion date, not the demo signup", () => {
  const student = {
    createdAt: day("2026-01-05"),
    conversionSetup: { convertedAt: day("2026-03-20") },
  };
  expect(joinedAt(student).getMonth()).toBe(2);
  // A directly enrolled student still falls back to account creation.
  expect(joinedAt({ createdAt: day("2026-02-02") }).getMonth()).toBe(1);
});

test("students deactivated before deactivatedAt existed fall back to updatedAt", () => {
  expect(leftAt({ deactivatedAt: day("2026-05-01"), updatedAt: day("2026-08-01") })?.getMonth()).toBe(4);
  expect(leftAt({ updatedAt: day("2026-08-01") })?.getMonth()).toBe(7);
  expect(leftAt({})).toBe(null);
});

// A paused student is a temporary revenue loss and it lands on the books twice:
// invoices already raised for the window get voided, and monthly billing skips
// the student so later cycles are never raised at all. Both must be counted,
// and neither may be counted twice.

test("a pause only costs the part of its window that falls inside the range", () => {
  const window = pauseHoldWindow(day("2026-08-20"), day("2026-10-15"), day("2026-09-01"), day("2026-09-30T23:59:59.999"));
  expect(window).not.toBe(null);
  expect(window!.holdFrom.getMonth()).toBe(8);
  expect(window!.holdFrom.getDate()).toBe(1);
  expect(window!.holdTo.getDate()).toBe(30);
});

test("a pause that ended before the range costs the range nothing", () => {
  expect(pauseHoldWindow(day("2026-05-01"), day("2026-06-01"), day("2026-09-01"), day("2026-09-30"))).toBe(null);
  expect(pauseHoldWindow(day("2026-11-01"), day("2026-12-01"), day("2026-09-01"), day("2026-09-30"))).toBe(null);
});

test("cycles never billed during a pause are counted, voided ones are not double counted", () => {
  const anchor = day("2026-01-06T00:00:00");
  const holdFrom = day("2026-09-01T00:00:00");
  const holdTo = day("2026-11-30T23:59:59.999");

  // Nothing voided: all three cycles in the window were simply never raised.
  expect(unbilledPauseCycles(anchor, holdFrom, holdTo, []).length).toBe(3);

  // September was already voided, so only October and November are unbilled.
  const withVoided = unbilledPauseCycles(anchor, holdFrom, holdTo, [day("2026-09-06T23:59:59.999")]);
  expect(withVoided.length).toBe(2);
  expect(withVoided.map((date) => date.getMonth())).toEqual([9, 10]);
});

test("a voided invoice matches its cycle regardless of the time on the timestamp", () => {
  const anchor = day("2026-01-06T00:00:00");
  // The stored invoice ends the day; the generated cycle must still match it.
  const cycles = unbilledPauseCycles(anchor, day("2026-09-01"), day("2026-09-30T23:59:59.999"), [day("2026-09-06T00:00:01")]);
  expect(cycles.length).toBe(0);
});

test("a pause with every cycle already voided adds no second charge", () => {
  const anchor = day("2026-03-10T00:00:00");
  const voided = [day("2026-09-10T23:59:59.999"), day("2026-10-10T23:59:59.999")];
  expect(unbilledPauseCycles(anchor, day("2026-09-01"), day("2026-10-31T23:59:59.999"), voided).length).toBe(0);
});

// An invoice can leave the ledger by more than one route - the pause voids it,
// an admin deletes it, and the cancelled row may still be sitting there - so
// the merge has to find all of them exactly once.

test("an invoice both voided by the pause and later deleted is counted once", () => {
  const from = day("2026-09-01");
  const to = day("2026-09-30T23:59:59.999");
  const merged = mergeLostInvoices(
    [
      { invoice: "ENV/26-27/031", due: day("2026-09-10"), total: 354000, source: "Deleted" },
      { invoice: "ENV/26-27/031", due: day("2026-09-10"), total: 354000, source: "Voided by pause" },
      { invoice: "ENV/26-27/031", due: day("2026-09-10"), total: 354000, source: "Cancelled" },
    ],
    from,
    to
  );
  expect(merged.length).toBe(1);
  expect(merged[0].total).toBe(354000);
  // Deletion is the most final state, so it is the one reported.
  expect(merged[0].source).toBe("Deleted");
});

test("an invoice that was only deleted still counts - this is what read as zero before", () => {
  const merged = mergeLostInvoices(
    [{ invoice: "ENV/26-27/044", due: day("2026-09-10"), total: 708000, source: "Deleted" }],
    day("2026-09-01"),
    day("2026-09-30T23:59:59.999")
  );
  expect(merged.length).toBe(1);
  expect(merged[0].total).toBe(708000);
});

test("distinct invoices for the same student are all kept", () => {
  const merged = mergeLostInvoices(
    [
      { invoice: "ENV/26-27/031", due: day("2026-09-10"), total: 354000, source: "Deleted" },
      { invoice: "ENV/26-27/032", due: day("2026-09-20"), total: 354000, source: "Voided by pause" },
    ],
    day("2026-09-01"),
    day("2026-09-30T23:59:59.999")
  );
  expect(merged.length).toBe(2);
  expect(merged.reduce((total, row) => total + row.total, 0)).toBe(708000);
});

test("archived rows with no invoice number fall back to the due date as their key", () => {
  const merged = mergeLostInvoices(
    [
      { due: day("2026-09-10"), total: 354000, source: "Deleted" },
      { invoice: "-", due: day("2026-09-10"), total: 354000, source: "Voided by pause" },
    ],
    day("2026-09-01"),
    day("2026-09-30T23:59:59.999")
  );
  expect(merged.length).toBe(1);
});

test("invoices due outside the range belong to another period and are dropped", () => {
  const merged = mergeLostInvoices(
    [
      { invoice: "A", due: day("2026-09-10"), total: 100, source: "Deleted" },
      { invoice: "B", due: day("2026-10-10"), total: 200, source: "Deleted" },
      { invoice: "C", due: day("2026-08-10"), total: 300, source: "Deleted" },
    ],
    day("2026-09-01"),
    day("2026-09-30T23:59:59.999")
  );
  expect(merged.map((row) => row.invoice)).toEqual(["A"]);
});

test("a cycle already covered by a lost invoice is not billed again as never billed", () => {
  const anchor = day("2026-01-10T00:00:00");
  const lost = mergeLostInvoices(
    [{ invoice: "ENV/26-27/031", due: day("2026-09-10T23:59:59.999"), total: 354000, source: "Deleted" }],
    day("2026-09-01"),
    day("2026-09-30T23:59:59.999")
  );
  const unbilled = unbilledPauseCycles(anchor, day("2026-09-06"), day("2026-09-30T23:59:59.999"), lost.map((row) => row.due));
  expect(unbilled.length).toBe(0);
});

test("an inverted date range is corrected rather than returning nothing", () => {
  const range = resolveRange("2026-09-30", "2026-09-01");
  expect(range.from.getTime()).toBeLessThan(range.to.getTime());
  expect(range.from.getDate()).toBe(1);
  // The end of the range covers the whole final day.
  expect(range.to.getHours()).toBe(23);
});

test("a missing range defaults to the current calendar month", () => {
  const now = new Date();
  const range = resolveRange(null, null);
  expect(range.from.getDate()).toBe(1);
  expect(range.from.getMonth()).toBe(now.getMonth());
  expect(range.to.getMonth()).toBe(now.getMonth());
});
