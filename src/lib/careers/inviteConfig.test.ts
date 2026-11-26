import { describe, expect, it } from "vitest";
import { canResendNow, inviteStatus, istHour, parseInviteLines } from "@/lib/careers/inviteConfig";

describe("parseInviteLines", () => {
  it("reads name, number and email in any order, from commas or tabs", () => {
    const result = parseInviteLines("Priya Sen, 9123456789, Priya@Example.com\n8123456789\tRahul Das\n\nname, phone");
    expect(result.problems).toEqual([]);
    expect(result.rows).toEqual([
      { line: 1, name: "Priya Sen", countryCode: "+91", phone: "9123456789", email: "priya@example.com" },
      { line: 2, name: "Rahul Das", countryCode: "+91", phone: "8123456789", email: "" },
    ]);
  });

  it("takes the country code from a + or 00 number and strips a leading 91", () => {
    const result = parseInviteLines("Amy, +44 7911 123456\nBen, 0044 7911 123457\nCara, 919123456780");
    expect(result.rows.map((row) => `${row.countryCode} ${row.phone}`)).toEqual(["+44 7911123456", "+44 7911123457", "+91 9123456780"]);
  });

  it("reports lines it cannot use and keeps a repeated number once", () => {
    const result = parseInviteLines("Priya, 12345\nNo number here\n9123456789\nPriya, 9123456789\nPriya again, +91 91234 56789");
    expect(result.rows).toHaveLength(1);
    expect(result.problems.map((problem) => problem.line)).toEqual([1, 2, 3]);
  });
});

describe("invite status + resend", () => {
  it("applied wins over cancelled and opened", () => {
    expect(inviteStatus({ appliedAt: new Date(), cancelledAt: new Date() })).toBe("applied");
    expect(inviteStatus({ cancelledAt: new Date(), openedAt: new Date() })).toBe("cancelled");
    expect(inviteStatus({ openedAt: new Date() })).toBe("opened");
    expect(inviteStatus({})).toBe("invited");
  });

  it("allows a resend only after 24 hours", () => {
    const now = new Date("2026-11-27T12:00:00Z");
    expect(canResendNow(new Date("2026-11-26T13:00:00Z"), now)).toBe(false);
    expect(canResendNow(new Date("2026-11-26T12:00:00Z"), now)).toBe(true);
    expect(canResendNow(null, now)).toBe(true);
  });

  it("reads the IST hour, midnight as 0", () => {
    expect(istHour(new Date("2026-11-27T18:30:00Z"))).toBe(0);
    expect(istHour(new Date("2026-11-27T04:30:00Z"))).toBe(10);
  });
});
