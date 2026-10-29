import { describe, expect, it } from "vitest";
import { campaignIsLive, campaignMatches, choosePopup, isHandled, safePopupHref, type PopupCandidate } from "./popupRules";

const candidate = (key: string, kind: PopupCandidate["kind"], createdAt?: string): PopupCandidate => ({
  key,
  kind,
  title: key,
  body: key,
  createdAt: createdAt ? new Date(createdAt) : null,
});

describe("choosePopup", () => {
  const all = [
    candidate("campaign:normal", "campaign"),
    candidate("auto:recap:w", "recap"),
    candidate("auto:homework:h", "homework"),
    candidate("auto:badge:b", "badge"),
    candidate("auto:feedback:f", "feedback"),
    candidate("campaign:high", "campaign_high"),
  ];

  it("follows the priority order, one at a time as each is closed", () => {
    const views = new Map<string, any>();
    const order: string[] = [];
    for (let index = 0; index < all.length; index += 1) {
      const next = choosePopup(all, views);
      if (!next) break;
      order.push(next.key);
      views.set(next.key, { seenCount: 1, dismissedAt: new Date() });
    }
    expect(order).toEqual(["campaign:high", "auto:feedback:f", "auto:badge:b", "auto:homework:h", "auto:recap:w", "campaign:normal"]);
    expect(choosePopup(all, views)).toBeNull();
  });

  it("keeps showing an unclosed pop-up, but a recap only once", () => {
    const views = new Map<string, any>([["auto:badge:b", { seenCount: 3 }], ["auto:recap:w", { seenCount: 1 }]]);
    expect(choosePopup([candidate("auto:badge:b", "badge")], views)?.key).toBe("auto:badge:b");
    expect(choosePopup([candidate("auto:recap:w", "recap")], views)).toBeNull();
  });

  it("a click counts as handled", () => {
    expect(isHandled({ kind: "campaign" }, { clickedAt: new Date() })).toBe(true);
  });

  it("shows the newest of two campaigns of the same priority first", () => {
    const next = choosePopup([candidate("campaign:old", "campaign", "2026-10-01"), candidate("campaign:new", "campaign", "2026-10-20")], new Map());
    expect(next?.key).toBe("campaign:new");
  });
});

describe("campaignMatches", () => {
  const student = { id: "s1", accountStatus: "enrolled", batchIds: ["b1"], courseIds: ["c1"] };
  const demo = { id: "d1", accountStatus: "demo", batchIds: [], courseIds: [] };

  it("targets batches, courses and single students", () => {
    expect(campaignMatches({ audience: "batch", targetIds: ["b1"] }, student)).toBe(true);
    expect(campaignMatches({ audience: "batch", targetIds: ["b2"] }, student)).toBe(false);
    expect(campaignMatches({ audience: "course", targetIds: ["c1"] }, student)).toBe(true);
    expect(campaignMatches({ audience: "student", targetIds: ["s1"] }, student)).toBe(true);
    expect(campaignMatches({ audience: "student", targetIds: ["s2"] }, student)).toBe(false);
  });

  it("keeps demo and enrolled audiences apart", () => {
    expect(campaignMatches({ audience: "all_students" }, student)).toBe(true);
    expect(campaignMatches({ audience: "all_students" }, demo)).toBe(false);
    expect(campaignMatches({ audience: "demo_students" }, demo)).toBe(true);
    expect(campaignMatches({ audience: "demo_students" }, student)).toBe(false);
  });
});

describe("campaignIsLive", () => {
  const now = new Date("2026-10-26T10:00:00Z");
  it("respects status and the start/end window", () => {
    expect(campaignIsLive({ audience: "all_students", status: "active", startsAt: new Date("2026-10-25"), endsAt: null }, now)).toBe(true);
    expect(campaignIsLive({ audience: "all_students", status: "draft", startsAt: new Date("2026-10-25") }, now)).toBe(false);
    expect(campaignIsLive({ audience: "all_students", status: "active", startsAt: new Date("2026-10-27") }, now)).toBe(false);
    expect(campaignIsLive({ audience: "all_students", status: "active", startsAt: new Date("2026-10-20"), endsAt: new Date("2026-10-26T09:00:00Z") }, now)).toBe(false);
  });
});

describe("safePopupHref", () => {
  it("allows portal paths and https links only", () => {
    expect(safePopupHref("/learn")).toBe("/learn");
    expect(safePopupHref("https://youtube.com/watch?v=1")).toBe("https://youtube.com/watch?v=1");
    expect(safePopupHref("javascript:alert(1)")).toBe("");
    expect(safePopupHref("//evil.example")).toBe("");
    expect(safePopupHref("http://plain.example")).toBe("");
  });
});

describe("branch pop-ups", () => {
  const online = { id: "s1", batchIds: [], courseIds: [] };
  const branchStudent = { id: "s2", batchIds: [], courseIds: [], branch: "bowbazar", slotIds: ["slotA"] };

  it("keeps a branch's pop-ups to its students and the academy's away from them", () => {
    expect(campaignMatches({ audience: "branch_all", branch: "bowbazar" }, branchStudent)).toBe(true);
    expect(campaignMatches({ audience: "branch_all", branch: "bowbazar" }, online)).toBe(false);
    expect(campaignMatches({ audience: "all_students" }, branchStudent)).toBe(false);
    expect(campaignMatches({ audience: "all_students" }, online)).toBe(true);
  });

  it("aims at one class", () => {
    expect(campaignMatches({ audience: "branch_slot", branch: "bowbazar", targetIds: ["slotA"] }, branchStudent)).toBe(true);
    expect(campaignMatches({ audience: "branch_slot", branch: "bowbazar", targetIds: ["slotB"] }, branchStudent)).toBe(false);
  });
});
