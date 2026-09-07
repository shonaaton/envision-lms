import { describe, expect, it } from "vitest";
import { resolveAudienceEmails, resolveStudentContact } from "@/lib/studentContact";

const studentSend = { to: "aarav@example.com", subject: "Invoice", message: "student wording" };
const parentSend = { to: "aarav@example.com", subject: "Invoice", message: "parent wording" };

describe("resolveAudienceEmails", () => {
  it("sends one copy when both audiences share an inbox, preferring the parent wording", () => {
    const sends = resolveAudienceEmails(studentSend, parentSend);
    expect(sends).toHaveLength(1);
    expect(sends[0].message).toBe("parent wording");
  });

  it("ignores case and surrounding space when deciding the inbox is the same", () => {
    const sends = resolveAudienceEmails(studentSend, { ...parentSend, to: "  Aarav@Example.COM " });
    expect(sends).toHaveLength(1);
    expect(sends[0].message).toBe("parent wording");
  });

  it("sends both when the family genuinely keeps two addresses", () => {
    const sends = resolveAudienceEmails(studentSend, { ...parentSend, to: "parent@example.com" });
    expect(sends.map((send) => send.message)).toEqual(["student wording", "parent wording"]);
  });

  it("sends the student copy alone when no parent address is stored", () => {
    const sends = resolveAudienceEmails(studentSend, null);
    expect(sends).toEqual([studentSend]);
  });

  it("sends the parent copy alone when the student has no address", () => {
    const sends = resolveAudienceEmails(null, parentSend);
    expect(sends).toEqual([parentSend]);
  });

  it("treats a blank address as absent rather than as an inbox", () => {
    expect(resolveAudienceEmails({ ...studentSend, to: "   " }, parentSend)).toEqual([parentSend]);
    expect(resolveAudienceEmails(null, null)).toEqual([]);
  });
});

describe("resolveStudentContact", () => {
  it("prefers the parent address and name when both are stored", () => {
    const contact = resolveStudentContact({
      name: "Aarav",
      email: "aarav@example.com",
      parentName: "Meera",
      parentEmail: "Meera@Example.com",
    });
    expect(contact).toMatchObject({ email: "meera@example.com", emailSource: "parent", contactName: "Meera" });
  });

  it("falls back to the student when no parent details exist", () => {
    const contact = resolveStudentContact({ name: "Aarav", email: "aarav@example.com" });
    expect(contact).toMatchObject({ email: "aarav@example.com", emailSource: "student", contactName: "Aarav" });
  });

  it("reports a missing address rather than inventing one", () => {
    expect(resolveStudentContact({ name: "Aarav" }).emailSource).toBe("missing");
  });
});
