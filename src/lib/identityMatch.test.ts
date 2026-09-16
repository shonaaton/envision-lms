import { describe, expect, it } from "vitest";
import { canonicalEmail, canonicalIdentityFields, canonicalPhone, duplicateReasonSummary } from "@/lib/identityMatch";

describe("canonicalEmail", () => {
  it("folds the Gmail spellings that opened a second demo account", () => {
    expect(canonicalEmail("dimple.luniya@gmail.com")).toBe("dimpleluniya@gmail.com");
    expect(canonicalEmail("dimpleluniya@gmail.com")).toBe("dimpleluniya@gmail.com");
    expect(canonicalEmail("d.i.m.p.l.e.luniya+chess@googlemail.com")).toBe("dimpleluniya@gmail.com");
  });

  it("keeps dots outside Gmail, where they are a different mailbox", () => {
    expect(canonicalEmail("first.last@outlook.com")).toBe("first.last@outlook.com");
    expect(canonicalEmail("firstlast@outlook.com")).toBe("firstlast@outlook.com");
  });

  it("strips plus-addressing everywhere", () => {
    expect(canonicalEmail("parent+demo2@outlook.com")).toBe("parent@outlook.com");
  });

  it("normalizes case and surrounding space", () => {
    expect(canonicalEmail("  Sankesh@Example.COM ")).toBe("sankesh@example.com");
  });

  it("leaves anything that is not an address alone rather than inventing a key", () => {
    expect(canonicalEmail("not-an-email")).toBe("not-an-email");
    expect(canonicalEmail("@gmail.com")).toBe("@gmail.com");
    expect(canonicalEmail("+tag@gmail.com")).toBe("+tag@gmail.com");
    expect(canonicalEmail(undefined)).toBe("");
  });
});

describe("canonicalPhone", () => {
  it("gives one key to the spellings of a single number", () => {
    const expected = "919884417455";
    expect(canonicalPhone("9884417455", "+91")).toBe(expected);
    expect(canonicalPhone("09884417455", "91")).toBe(expected);
    expect(canonicalPhone("+91 98844 17455", "+91")).toBe(expected);
    expect(canonicalPhone("988-441-7455", "91")).toBe(expected);
  });

  it("returns nothing for a blank number, so blanks never match each other", () => {
    expect(canonicalPhone("", "+91")).toBe("");
    expect(canonicalPhone(undefined, undefined)).toBe("");
    expect(canonicalPhone("0", "+91")).toBe("");
  });
});

describe("canonicalIdentityFields", () => {
  it("builds both keys from what the signup form collected", () => {
    expect(canonicalIdentityFields({ email: "Dimple.Luniya+1@gmail.com", phone: "09884417455", countryCode: "+91" })).toEqual({
      emailCanonical: "dimpleluniya@gmail.com",
      phoneCanonical: "919884417455",
    });
  });
});

describe("duplicateReasonSummary", () => {
  it("reads as a sentence on the review card", () => {
    expect(duplicateReasonSummary(["email", "phone"])).toBe("Same email inbox and same phone number");
    expect(duplicateReasonSummary(["phone"])).toBe("Same phone number");
    expect(duplicateReasonSummary([])).toBe("Matching contact details");
  });
});
