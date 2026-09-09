import { afterEach, describe, expect, it } from "vitest";
import { emailDedupeKey, emailDedupeWindowMs } from "@/lib/emailDedupe";

afterEach(() => {
  delete process.env.EMAIL_DEDUPE_WINDOW_MINUTES;
});

const base = {
  to: "sayanenvisionchess@gmail.com",
  subject: "Demo assessment submitted: Asha Roy",
  message: "Hello Sayandeb,\n\nDhritabrata Kundu has submitted the demo assessment for Asha Roy.",
  metadata: { kind: "demo_feedback_submitted", event: "DEMO_FEEDBACK_SUBMITTED", bookingId: "b1" },
};

describe("emailDedupeKey", () => {
  it("matches a re-send of the exact same notification", () => {
    expect(emailDedupeKey(base)).toBe(emailDedupeKey({ ...base }));
  });

  it("ignores incidental whitespace and address casing", () => {
    expect(emailDedupeKey({ ...base, to: "  SayanEnvisionChess@Gmail.com ", subject: `${base.subject}  ` })).toBe(emailDedupeKey(base));
  });

  it("separates the same notification sent to different people", () => {
    expect(emailDedupeKey({ ...base, to: "mohammedshazib@gmail.com" })).not.toBe(emailDedupeKey(base));
  });

  it("lets a genuine resend through when the message itself changed", () => {
    // A demo re-approved at a new time, or a reminder quoting a new balance,
    // must never be swallowed by the safety net.
    expect(emailDedupeKey({ ...base, message: `${base.message} Rescheduled to 6:30 pm.` })).not.toBe(emailDedupeKey(base));
    expect(emailDedupeKey({ ...base, subject: "Demo assessment submitted: Someone Else" })).not.toBe(emailDedupeKey(base));
  });

  it("separates identical text sent about different records", () => {
    expect(emailDedupeKey({ ...base, metadata: { ...base.metadata, bookingId: "b2" } })).not.toBe(emailDedupeKey(base));
  });
});

describe("emailDedupeWindowMs", () => {
  it("defaults to ten minutes", () => {
    expect(emailDedupeWindowMs()).toBe(600_000);
  });

  it("is configurable, and zero turns the net off", () => {
    process.env.EMAIL_DEDUPE_WINDOW_MINUTES = "2";
    expect(emailDedupeWindowMs()).toBe(120_000);
    process.env.EMAIL_DEDUPE_WINDOW_MINUTES = "0";
    expect(emailDedupeWindowMs()).toBe(0);
  });

  it("ignores nonsense rather than dropping the window", () => {
    process.env.EMAIL_DEDUPE_WINDOW_MINUTES = "not-a-number";
    expect(emailDedupeWindowMs()).toBe(600_000);
  });
});
