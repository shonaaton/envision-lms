import { describe, expect, it } from "vitest";
import { demoLeadOwnerForTurn, demoLeadRotationNames, resolveDemoLeadRotation } from "@/lib/demoLeadRotation";
import { demoLeadStage, demoLeadStageLabel } from "@/lib/demoRequest";

const staff = [
  { userId: "admin", name: "Sayan Bose", email: "admin@x.com", isSales: false },
  { userId: "moh", name: "Mohammed Shahzib", email: "shazib@x.com", isSales: true },
  { userId: "say", name: "Sayandeb Halder", email: "sayan@x.com", isSales: true },
];

describe("demo lead rotation", () => {
  it("gives the first lead to Mohammed, the second to Sayandeb, then round again", () => {
    const rotation = resolveDemoLeadRotation(demoLeadRotationNames(""), staff);
    expect(rotation.map((owner) => owner.userId)).toEqual(["moh", "say"]);
    expect([1, 2, 3, 4].map((turn) => demoLeadOwnerForTurn(turn, rotation)?.userId)).toEqual(["moh", "say", "moh", "say"]);
  });

  it("does not hand Sayandeb's turn to somebody who is only called Sayan", () => {
    expect(resolveDemoLeadRotation(["sayandeb"], [staff[0]])).toEqual([]);
  });

  it("picks the salesperson when two accounts share the first name, and nobody when it cannot tell", () => {
    const twoMohammeds = [...staff, { userId: "coach", name: "Mohammed Ali", email: "ali@x.com", isSales: false }];
    expect(resolveDemoLeadRotation(["mohammed"], twoMohammeds)[0].userId).toBe("moh");
    const bothSales = [...staff, { userId: "moh2", name: "Mohammed Ali", email: "ali@x.com", isSales: true }];
    expect(resolveDemoLeadRotation(["mohammed", "sayandeb"], bothSales).map((owner) => owner.userId)).toEqual(["say"]);
  });

  it("reads the order, and emails, from the environment setting", () => {
    expect(demoLeadRotationNames(" Sayandeb , shazib@x.com ")).toEqual(["sayandeb", "shazib@x.com"]);
    expect(resolveDemoLeadRotation(["sayandeb", "shazib@x.com"], staff).map((owner) => owner.userId)).toEqual(["say", "moh"]);
  });

  it("leaves a lead unassigned when the rotation is empty", () => {
    expect(demoLeadOwnerForTurn(1, [])).toBeNull();
  });

  it("reads a lead with no stage as new", () => {
    expect(demoLeadStage(undefined)).toBe("new");
    expect(demoLeadStageLabel("demo_taken")).toBe("Demo taken");
  });
});
