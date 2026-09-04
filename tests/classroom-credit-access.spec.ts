import { expect, test } from "@playwright/test";
import { evaluateCreditBalance } from "../src/lib/classroomCreditAccess";

// Business rule: positive credits -> 0 -> -1 -> blocked.
// A student on exactly 0 credits gets ONE final grace class; once the balance
// reaches -1 they are blocked until they recharge.

test("positive balances join normally", () => {
  expect(evaluateCreditBalance(10)).toBe("ok");
  expect(evaluateCreditBalance(3)).toBe("ok");
  expect(evaluateCreditBalance(2)).toBe("ok");
  expect(evaluateCreditBalance(1)).toBe("ok");
});

test("exactly zero is the final grace class, not a block", () => {
  expect(evaluateCreditBalance(0)).toBe("final_class");
});

test("minus one and below are blocked", () => {
  expect(evaluateCreditBalance(-1)).toBe("blocked");
  expect(evaluateCreditBalance(-2)).toBe("blocked");
  expect(evaluateCreditBalance(-25)).toBe("blocked");
});

test("the boundary walks positive -> zero -> minus one -> blocked", () => {
  const walk = [2, 1, 0, -1].map(evaluateCreditBalance);
  expect(walk).toEqual(["ok", "ok", "final_class", "blocked"]);
});

test("only the zero balance asks for a warning", () => {
  const warned = [3, 2, 1, 0, -1, -2].filter((balance) => evaluateCreditBalance(balance) === "final_class");
  expect(warned).toEqual([0]);
});

test("blocked never overlaps with joinable states", () => {
  for (const balance of [5, 1, 0, -1, -10]) {
    const state = evaluateCreditBalance(balance);
    const joinable = state === "ok" || state === "final_class";
    expect(joinable).toBe(balance >= 0);
  }
});
