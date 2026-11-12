import { describe, expect, it } from "vitest";
import { contactMatches, findReturningGuest, registrationClash, usernameProblem, validateGuestRegistration } from "./externalRegistration";
import { dueTournamentReminder } from "./reminderSchedule";

const valid = { displayName: "Priyankar Dey", username: "Priyankar Dey", email: "P@Example.com", phone: "", countryCode: "+91", acceptRules: "yes" };

describe("guest registration form", () => {
  it("normalises a valid registration", () => {
    const check = validateGuestRegistration({ ...valid, username: "  Priyankar   Dey ", phone: "098765 43210" });
    expect(check).toEqual({
      ok: true,
      value: { displayName: "Priyankar Dey", username: "Priyankar Dey", email: "p@example.com", phone: "919876543210", countryCode: "+91" },
    });
  });

  it("keeps the phone optional", () => {
    const check = validateGuestRegistration(valid);
    expect(check.ok && check.value.phone).toBe("");
  });

  it("names the field that is wrong", () => {
    expect(validateGuestRegistration({ ...valid, displayName: "" })).toMatchObject({ ok: false, error: "name" });
    expect(validateGuestRegistration({ ...valid, username: "ab" })).toMatchObject({ ok: false, error: "username" });
    expect(validateGuestRegistration({ ...valid, email: "not-an-email" })).toMatchObject({ ok: false, error: "email" });
    expect(validateGuestRegistration({ ...valid, phone: "98765" })).toMatchObject({ ok: false, error: "phone" });
    expect(validateGuestRegistration({ ...valid, acceptRules: "" })).toMatchObject({ ok: false, error: "rules" });
  });

  it("accepts ordinary usernames and refuses odd ones", () => {
    expect(usernameProblem("knight_rider")).toBe("");
    expect(usernameProblem("priyankar01")).toBe("");
    expect(usernameProblem("_x_")).not.toBe("");
    expect(usernameProblem("a".repeat(25))).not.toBe("");
    expect(usernameProblem("<script>")).not.toBe("");
  });
});

describe("returning guests", () => {
  const guests = [
    { username: "Priyankar Dey", email: "p@example.com", phone: "919876543210", countryCode: "+91" },
    { username: "Zahra", email: "z@example.com" },
  ];

  it("matches the email in any case, or the phone with or without its code", () => {
    expect(contactMatches(guests[0], "P@EXAMPLE.com")).toBe(true);
    expect(contactMatches(guests[0], "+91 98765 43210")).toBe(true);
    expect(contactMatches(guests[0], "9876543210")).toBe(true);
    expect(contactMatches(guests[0], "09876543210")).toBe(true);
    expect(contactMatches(guests[0], "6543210")).toBe(false);
    expect(contactMatches(guests[1], "9876543210")).toBe(false);
  });

  it("needs the username and the contact to belong to the same registration", () => {
    expect(findReturningGuest(guests, { username: "priyankar  dey", contact: "p@example.com" })?.username).toBe("Priyankar Dey");
    expect(findReturningGuest(guests, { username: "Zahra", contact: "p@example.com" })).toBeNull();
    expect(findReturningGuest(guests, { username: "Nobody", contact: "p@example.com" })).toBeNull();
  });

  it("refuses a second registration with a taken username, email or phone", () => {
    const value = { displayName: "X", username: "Someone", email: "new@example.com", phone: "", countryCode: "" };
    expect(registrationClash(guests, value)).toBe("");
    expect(registrationClash(guests, { ...value, username: "ZAHRA" })).toBe("username_taken");
    expect(registrationClash(guests, { ...value, email: "z@example.com" })).toBe("email_registered");
    expect(registrationClash(guests, { ...value, phone: "919876543210" })).toBe("phone_registered");
  });
});

describe("start reminders", () => {
  const start = new Date("2026-11-18T14:30:00Z");
  const at = (minutesBefore: number) => start.getTime() - minutesBefore * 60_000;
  const none = () => false;

  it("sends the 30-minute reminder from 30 minutes out and the 10-minute one from 10", () => {
    expect(dueTournamentReminder(start, at(45), none)).toBeNull();
    expect(dueTournamentReminder(start, at(30), none)).toBe(30);
    expect(dueTournamentReminder(start, at(12), none)).toBe(30);
    expect(dueTournamentReminder(start, at(10), none)).toBe(10);
    expect(dueTournamentReminder(start, at(1), none)).toBe(10);
    expect(dueTournamentReminder(start, at(0), none)).toBeNull();
  });

  it("sends each once, and only the 10-minute one when the 30-minute window was missed", () => {
    expect(dueTournamentReminder(start, at(20), (minutes) => minutes === 30)).toBeNull();
    expect(dueTournamentReminder(start, at(8), (minutes) => minutes === 30)).toBe(10);
    expect(dueTournamentReminder(start, at(8), (minutes) => minutes === 10)).toBeNull();
    expect(dueTournamentReminder(start, at(5), none)).toBe(10);
  });
});
