import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isSealedTempPassword, openTempPassword, sealTempPassword, withOpenTempPassword } from "./tempPasswords";

const SECRET = "test-secret-for-temp-passwords-0123456789";

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET;
});

afterEach(() => {
  process.env.AUTH_SECRET = SECRET;
});

describe("sealTempPassword / openTempPassword", () => {
  it("round-trips, and the stored form does not contain the password", () => {
    const sealed = sealTempPassword("Envision@4821") as string;
    expect(isSealedTempPassword(sealed)).toBe(true);
    expect(sealed).not.toContain("Envision@4821");
    expect(openTempPassword(sealed)).toBe("Envision@4821");
  });

  it("uses a fresh IV each time, so equal passwords do not look equal", () => {
    expect(sealTempPassword("same")).not.toBe(sealTempPassword("same"));
  });

  it("never seals twice, so re-saving a record is harmless", () => {
    const sealed = sealTempPassword("abc") as string;
    expect(sealTempPassword(sealed)).toBe(sealed);
  });

  it("passes empty values through", () => {
    expect(sealTempPassword("")).toBe("");
    expect(sealTempPassword(undefined)).toBeUndefined();
    expect(sealTempPassword(null)).toBeNull();
  });

  it("still opens a plain value written before encryption", () => {
    expect(openTempPassword("LegacyPass1")).toBe("LegacyPass1");
  });

  it("refuses a tampered value instead of returning garbage", () => {
    const sealed = sealTempPassword("abc") as string;
    const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA");
    expect(openTempPassword(tampered)).toBeUndefined();
    expect(openTempPassword("enc:v1:not.valid")).toBeUndefined();
  });

  it("cannot open values sealed under a different secret", () => {
    const sealed = sealTempPassword("abc") as string;
    process.env.AUTH_SECRET = "a-completely-different-secret";
    expect(openTempPassword(sealed)).toBeUndefined();
  });
});

describe("withOpenTempPassword", () => {
  it("opens the field for an admin response and leaves the rest alone", () => {
    const user = { _id: "u1", name: "Asha", tempPassword: sealTempPassword("Pass#1") };
    expect(withOpenTempPassword(user)).toEqual({ _id: "u1", name: "Asha", tempPassword: "Pass#1" });
    expect(isSealedTempPassword(user.tempPassword)).toBe(true);
  });

  it("drops a password that cannot be opened rather than showing the sealed text", () => {
    const user = { name: "Asha", tempPassword: "enc:v1:broken" };
    expect(withOpenTempPassword(user)).toEqual({ name: "Asha" });
  });

  it("leaves records without the field untouched", () => {
    const user = { name: "Asha" };
    expect(withOpenTempPassword(user)).toBe(user);
  });
});
