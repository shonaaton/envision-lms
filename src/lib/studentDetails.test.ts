import { describe, expect, it } from "vitest";
import { missingStudentDetails, needsStudentDetails, parseStudentDetails, studentDetailsDefaults } from "./studentDetails";

const complete = { role: "student", accountStatus: "enrolled", firstName: "Riya", lastName: "Das", age: 9, parentName: "Mita Das", country: "India", city: "Kolkata" };

describe("who is asked", () => {
  it("asks an old student who only has a name", () => {
    expect(missingStudentDetails({ role: "student", accountStatus: "enrolled", name: "Riya Das", parentName: "Mita", city: "Kolkata", country: "India" })).toEqual(["firstName", "lastName", "age"]);
  });
  it("asks a new demo sign-up too", () => {
    expect(needsStudentDetails({ role: "student", accountStatus: "demo", name: "Aarav", parentName: "P", city: "Pune", country: "India" })).toBe(true);
  });
  it("leaves a complete record alone", () => {
    expect(needsStudentDetails(complete)).toBe(false);
  });
  it("never asks staff or offline-branch students", () => {
    expect(needsStudentDetails({ role: "instructor", name: "Coach" })).toBe(false);
    expect(needsStudentDetails({ role: "admin", name: "Admin" })).toBe(false);
    expect(needsStudentDetails({ role: "student", branch: "bowbazar", name: "Offline Kid" })).toBe(false);
  });
  it("does not need a parent for an adult student", () => {
    expect(needsStudentDetails({ ...complete, age: 32, parentName: "" })).toBe(false);
    expect(missingStudentDetails({ ...complete, age: 12, parentName: " " })).toEqual(["parentName"]);
  });
  it("treats blank strings as missing", () => {
    expect(missingStudentDetails({ ...complete, city: "  ", lastName: "" })).toEqual(["lastName", "city"]);
  });
});

describe("form defaults", () => {
  it("splits the old name and guesses India from +91", () => {
    expect(studentDetailsDefaults({ name: "Riya  Das Gupta", countryCode: "+91" })).toMatchObject({ firstName: "Riya", lastName: "Das Gupta", country: "India", age: "" });
  });
  it("prefers saved split names and country", () => {
    expect(studentDetailsDefaults({ name: "x y", firstName: "Adhvik", lastName: "", country: "Qatar", countryCode: "+91", age: 8 })).toMatchObject({ firstName: "Adhvik", lastName: "", country: "Qatar", age: "8" });
  });
});

describe("parseStudentDetails", () => {
  const good = { firstName: " Riya ", lastName: "Das  Gupta", age: "9", parentName: "Mita", parentEmail: "MITA@Mail.com", country: "India", city: "Kolkata" };
  it("accepts and tidies a full form", () => {
    const result = parseStudentDetails(good);
    expect(result).toEqual({ ok: true, update: { firstName: "Riya", lastName: "Das Gupta", name: "Riya Das Gupta", age: 9, parentName: "Mita", parentEmail: "mita@mail.com", country: "India", city: "Kolkata" } });
  });
  it.each([
    [{ firstName: "" }, "first name"],
    [{ lastName: " " }, "last name"],
    [{ age: "" }, "age"],
    [{ age: "7.5" }, "age"],
    [{ age: "150" }, "age"],
    [{ parentName: "" }, "parent"],
    [{ parentEmail: "not-an-email" }, "email"],
    [{ country: "" }, "country"],
    [{ city: "" }, "city"],
  ])("refuses %o", (change, word) => {
    const result = parseStudentDetails({ ...good, ...change });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.toLowerCase()).toContain(word);
  });
  it("lets an adult leave the parent blank", () => {
    expect(parseStudentDetails({ ...good, age: "25", parentName: "", parentEmail: "" }).ok).toBe(true);
  });
});
