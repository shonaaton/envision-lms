import { describe, expect, it } from "vitest";
import { callWindow, resolveFamilyTimeZone, resolveStudentTimeZone } from "@/lib/localTime/studentTimeZone";

describe("resolveStudentTimeZone", () => {
  it("trusts the device zone first", () => {
    expect(resolveStudentTimeZone({ timeZone: "America/Chicago", city: "Kolkata", countryCode: "+91" })).toMatchObject({ timeZone: "America/Chicago", source: "device" });
  });
  it("ignores a junk device zone", () => {
    expect(resolveStudentTimeZone({ timeZone: "Mars/Olympus", country: "India" })?.source).toBe("country");
  });
  it("uses the city in a multi-zone country", () => {
    expect(resolveStudentTimeZone({ city: "Seattle", country: "USA", countryCode: "+1" })).toMatchObject({ timeZone: "America/Los_Angeles", source: "city", approximate: false });
  });
  it("does not read London, Ontario as London, England", () => {
    expect(resolveStudentTimeZone({ city: "London", country: "Canada" })).toMatchObject({ timeZone: "America/Toronto", approximate: true });
  });
  it("uses the state when the city is unknown", () => {
    expect(resolveStudentTimeZone({ city: "Smalltown", state: "Texas", country: "United States" })).toMatchObject({ timeZone: "America/Chicago", source: "state" });
  });
  it("does not read TN as Tennessee on an account with no country", () => {
    expect(resolveStudentTimeZone({ state: "TN", countryCode: "+91" })).toMatchObject({ timeZone: "Asia/Kolkata", source: "phone" });
  });
  it("marks a bare US country as approximate", () => {
    expect(resolveStudentTimeZone({ country: "USA" })).toMatchObject({ timeZone: "America/New_York", approximate: true });
  });
  it("falls back to the phone code", () => {
    expect(resolveStudentTimeZone({ countryCode: "+971" })).toMatchObject({ timeZone: "Asia/Dubai", source: "phone", approximate: false });
    expect(resolveStudentTimeZone({ countryCode: "" })).toBeNull();
  });
  it("pins a +1 number to its area code's zone", () => {
    expect(resolveStudentTimeZone({ countryCode: "+1", phone: "4155550101" })).toMatchObject({ timeZone: "America/Los_Angeles", source: "area_code", approximate: false });
    expect(resolveStudentTimeZone({ countryCode: "+1", phone: "(312) 555-0101" })).toMatchObject({ timeZone: "America/Chicago", source: "area_code" });
    expect(resolveStudentTimeZone({ countryCode: "+1", phone: "4165550102", country: "Canada" })).toMatchObject({ timeZone: "America/Toronto", source: "area_code" });
    expect(resolveStudentTimeZone({ countryCode: "+1", phone: "6025550100" })?.timeZone).toBe("America/Phoenix");
  });
  it("marks a split area code approximate", () => {
    expect(resolveStudentTimeZone({ countryCode: "+1", phone: "8505550100" })).toMatchObject({ source: "area_code", approximate: true });
  });
  it("a city on the account beats the area code (families keep numbers when they move)", () => {
    expect(resolveStudentTimeZone({ countryCode: "+1", phone: "2125550100", city: "Seattle", country: "USA" })?.timeZone).toBe("America/Los_Angeles");
  });
  it("uses a staff-set zone over everything but a newer device zone", () => {
    const staff = { staffTimeZone: "America/Denver", staffTimeZoneAt: "2026-11-20T00:00:00Z", staffTimeZoneByName: "Priya", countryCode: "+1", phone: "2125550100" };
    expect(resolveStudentTimeZone(staff)).toMatchObject({ timeZone: "America/Denver", source: "staff", basis: "set by Priya" });
    expect(resolveStudentTimeZone({ ...staff, timeZone: "America/Chicago", timeZoneSeenAt: "2026-11-10T00:00:00Z" })?.source).toBe("staff");
    expect(resolveStudentTimeZone({ ...staff, timeZone: "America/Chicago", timeZoneSeenAt: "2026-11-22T00:00:00Z" })).toMatchObject({ timeZone: "America/Chicago", source: "device" });
  });
  it("any Indian city on a +91 account is IST", () => {
    expect(resolveStudentTimeZone({ city: "Durgapur", countryCode: "+91" })).toMatchObject({ timeZone: "Asia/Kolkata", source: "city" });
  });
});

describe("resolveFamilyTimeZone", () => {
  it("takes the sibling with the best evidence", () => {
    expect(resolveFamilyTimeZone([{ countryCode: "+1" }, { timeZone: "America/Denver" }])?.timeZone).toBe("America/Denver");
  });
});

describe("callWindow", () => {
  it("colours the family's clock", () => {
    // 2026-11-23 06:00 UTC = 11:30 IST, 01:00 New York.
    const now = new Date("2026-11-23T06:00:00Z");
    expect(callWindow("Asia/Kolkata", now)).toBe("good");
    expect(callWindow("America/New_York", now)).toBe("bad");
    expect(callWindow("Asia/Kolkata", new Date("2026-11-23T15:30:00Z"))).toBe("edge"); // 9pm IST
  });
});
