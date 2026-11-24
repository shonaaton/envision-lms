import { afterEach, describe, expect, it } from "vitest";
import { isCareersAudience, isCareersReviewer } from "@/lib/careers/careersReviewerIds";

describe("careers reviewers", () => {
  afterEach(() => {
    delete process.env.CAREERS_REVIEWER_EMAILS;
  });

  it("are Sayan Bose and Dhritabrata Kundu by default", () => {
    expect(isCareersReviewer({ email: "sayanthsbose@gmail.com" })).toBe(true);
    expect(isCareersReviewer({ email: "DhritabrataKundu06@gmail.com" })).toBe(true);
    expect(isCareersReviewer({ email: "sales.person@gmail.com" })).toBe(false);
  });

  it("let admins and the two reviewers in, and keep other sub-admins out", () => {
    expect(isCareersAudience({ role: "admin", email: "anyone@example.com" })).toBe(true);
    expect(isCareersAudience({ role: "sub-admin", email: "sayanthsbose@gmail.com" })).toBe(true);
    expect(isCareersAudience({ role: "sub-admin", email: "sales.person@gmail.com" })).toBe(false);
    expect(isCareersAudience({ role: "instructor", email: "sayanthsbose@gmail.com" })).toBe(false);
  });

  it("follow CAREERS_REVIEWER_EMAILS when it is set", () => {
    process.env.CAREERS_REVIEWER_EMAILS = "someone@example.com";
    expect(isCareersReviewer({ email: "someone@example.com" })).toBe(true);
    expect(isCareersReviewer({ email: "sayanthsbose@gmail.com" })).toBe(false);
  });
});
