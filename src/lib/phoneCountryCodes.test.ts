import { describe, expect, it } from "vitest";
import { carriesCountryCode, dialCodeForCountryName, splitInternationalNumber } from "@/lib/phoneCountryCodes";

describe("carriesCountryCode", () => {
  it("does not mistake an Indian mobile starting with 9 for a +91 prefix", () => {
    expect(carriesCountryCode("9123456789", "91")).toBe(false);
    expect(carriesCountryCode("919123456789", "91")).toBe(true);
  });

  it("recognises short-national countries where code plus number is only 10 digits", () => {
    expect(carriesCountryCode("6581234567", "65")).toBe(true);
    expect(carriesCountryCode("81234567", "65")).toBe(false);
    expect(carriesCountryCode("97412345678", "974")).toBe(true);
  });

  it("falls back to a length heuristic for codes outside the portal list", () => {
    expect(carriesCountryCode("8801712345678", "880")).toBe(true);
    expect(carriesCountryCode("1712345678", "880")).toBe(false);
  });
});

describe("splitInternationalNumber", () => {
  it("splits numbers that already carry a dialling code", () => {
    expect(splitInternationalNumber("919123456789")).toEqual({ code: "91", country: "India", national: "9123456789" });
    expect(splitInternationalNumber("447911123456")?.code).toBe("44");
    expect(splitInternationalNumber("971501234567")?.code).toBe("971");
    expect(splitInternationalNumber("14155552671")?.code).toBe("1");
  });

  it("returns null for a bare national number", () => {
    expect(splitInternationalNumber("9123456789")).toBeNull();
    expect(splitInternationalNumber("")).toBeNull();
  });
});

describe("dialCodeForCountryName", () => {
  it("maps portal country names and common aliases", () => {
    expect(dialCodeForCountryName("India")?.code).toBe("91");
    expect(dialCodeForCountryName("united kingdom")?.code).toBe("44");
    expect(dialCodeForCountryName("UAE")?.code).toBe("971");
    expect(dialCodeForCountryName("USA")?.code).toBe("1");
    expect(dialCodeForCountryName("Canada")?.code).toBe("1");
  });

  it("refuses to guess for blank or 'Other'", () => {
    expect(dialCodeForCountryName("Other")).toBeNull();
    expect(dialCodeForCountryName("")).toBeNull();
    expect(dialCodeForCountryName("Atlantis")).toBeNull();
  });
});
