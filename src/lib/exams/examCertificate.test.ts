import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { certificateNumberFor, nextCertificateAttemptAt, signCertificateBody, verifyCertificateSignature } from "@/lib/exams/examCertificate";

describe("certificate webhook signature", () => {
  const body = JSON.stringify({ assignmentId: "abc", url: "https://example.com/c.pdf" });

  it("signs with sha256 HMAC of the raw body, the way n8n checks it", () => {
    const expected = `sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`;
    expect(signCertificateBody(body, "s3cret")).toBe(expected);
  });

  it("accepts the right signature and refuses a wrong secret, a changed body or none", () => {
    const signature = signCertificateBody(body, "s3cret");
    expect(verifyCertificateSignature(body, signature, "s3cret")).toBe(true);
    expect(verifyCertificateSignature(body, signature, "other")).toBe(false);
    expect(verifyCertificateSignature(`${body} `, signature, "s3cret")).toBe(false);
    expect(verifyCertificateSignature(body, null, "s3cret")).toBe(false);
    expect(verifyCertificateSignature(body, signature, "")).toBe(false);
  });
});

describe("certificate queue", () => {
  it("backs off 5, 15, 45 minutes", () => {
    const now = new Date("2026-10-28T10:00:00Z");
    expect(nextCertificateAttemptAt(1, now).toISOString()).toBe("2026-10-28T10:05:00.000Z");
    expect(nextCertificateAttemptAt(2, now).toISOString()).toBe("2026-10-28T10:15:00.000Z");
    expect(nextCertificateAttemptAt(3, now).toISOString()).toBe("2026-10-28T10:45:00.000Z");
  });

  it("numbers certificates by level and sitting", () => {
    expect(certificateNumberFor({ _id: "665f0c0c0c0c0c0cabcdef12", tier: "intermediate", levelNumber: 3, submittedAt: new Date("2026-11-02T10:00:00Z") })).toBe(
      "ECA-I3-2026-ABCDEF12"
    );
  });
});
