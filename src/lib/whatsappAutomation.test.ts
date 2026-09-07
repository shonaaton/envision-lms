import { afterEach, describe, expect, it } from "vitest";
import { defaultWhatsAppCountryCode, normalizeWhatsAppNumber, normalizeWhatsAppRecipient } from "@/lib/whatsappAutomation";

afterEach(() => {
  delete process.env.WHATSAPP_DEFAULT_COUNTRY_CODE;
});

describe("normalizeWhatsAppNumber", () => {
  it("keeps digits only", () => {
    expect(normalizeWhatsAppNumber("+91 91234-56789")).toBe("919123456789");
    expect(normalizeWhatsAppNumber(undefined)).toBe("");
  });
});

describe("normalizeWhatsAppRecipient", () => {
  it("dials the country code captured in the portal, not the India default", () => {
    expect(normalizeWhatsAppRecipient("4155552671", "+1")).toBe("14155552671");
    expect(normalizeWhatsAppRecipient("7911123456", "+44")).toBe("447911123456");
    expect(normalizeWhatsAppRecipient("501234567", "971")).toBe("971501234567");
    expect(normalizeWhatsAppRecipient("9123456789", "+91")).toBe("919123456789");
  });

  it("strips the national trunk prefix before applying the country code", () => {
    expect(normalizeWhatsAppRecipient("07911123456", "+44")).toBe("447911123456");
    expect(normalizeWhatsAppRecipient("09123456789", "+91")).toBe("919123456789");
  });

  it("leaves numbers that already carry a country code untouched", () => {
    expect(normalizeWhatsAppRecipient("919123456789", "+91")).toBe("919123456789");
    expect(normalizeWhatsAppRecipient("+44 7911 123456", "+44")).toBe("447911123456");
    expect(normalizeWhatsAppRecipient("14155552671", "+1")).toBe("14155552671");
  });

  it("falls back to the configured default only when no country code is on file", () => {
    expect(normalizeWhatsAppRecipient("9123456789")).toBe("919123456789");
    process.env.WHATSAPP_DEFAULT_COUNTRY_CODE = "+44";
    expect(defaultWhatsAppCountryCode()).toBe("44");
    expect(normalizeWhatsAppRecipient("7911123456")).toBe("447911123456");
    expect(normalizeWhatsAppRecipient("7911123456", "+1")).toBe("17911123456");
  });

  it("returns an empty string when there is no number to dial", () => {
    expect(normalizeWhatsAppRecipient("", "+91")).toBe("");
    expect(normalizeWhatsAppRecipient("000", "+91")).toBe("");
    expect(normalizeWhatsAppRecipient(undefined, undefined)).toBe("");
  });
});
