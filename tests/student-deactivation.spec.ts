import { expect, test } from "@playwright/test";
import { shouldCloseGroup } from "../src/lib/studentDeactivation";

// Deactivating a student closes a batch or classroom only when that student was
// the last active member of it. Everything else in the deactivation flow hangs
// off this one decision, so it is checked on its own.

const student = "s1";

test("closes a group the student was the only member of", () => {
  expect(shouldCloseGroup([student], student, new Set())).toBe(true);
});

test("keeps a group that still has another active student", () => {
  expect(shouldCloseGroup([student, "s2"], student, new Set(["s2"]))).toBe(false);
});

test("closes a group whose other members are all deactivated too", () => {
  // s2 and s3 are on the roster but neither is in the active set.
  expect(shouldCloseGroup([student, "s2", "s3"], student, new Set())).toBe(true);
});

test("leaves a group the student never belonged to", () => {
  expect(shouldCloseGroup(["s2", "s3"], student, new Set())).toBe(false);
});

test("ignores empty roster entries left by removed references", () => {
  expect(shouldCloseGroup(["", student, ""], student, new Set())).toBe(true);
});
