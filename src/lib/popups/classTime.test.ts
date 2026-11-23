import { describe, expect, it } from "vitest";
import { academyDateTime } from "@/lib/academyTime";
import { sessionHoldsPopups } from "@/lib/popups/classTime";
import { choosePopup } from "@/lib/popups/popupRules";
import { popupCanInterrupt } from "@/components/popups/LoginPopup";

const day = "2026-11-23";
const session = (extra: Record<string, unknown> = {}) => ({ scheduledFor: academyDateTime(day, "00:00"), startTime: "17:00", durationMinutes: 60, status: "scheduled", ...extra });
const at = (time: string) => academyDateTime(day, time);

describe("no pop-ups during the account's own class", () => {
  it("holds from the room opening to the scheduled end", () => {
    expect(sessionHoldsPopups(session(), at("16:40"))).toBe(false);
    expect(sessionHoldsPopups(session(), at("16:46"))).toBe(true);
    expect(sessionHoldsPopups(session(), at("17:30"))).toBe(true);
    expect(sessionHoldsPopups(session(), at("18:01"))).toBe(false);
  });

  it("keeps holding while a started class runs over, but not once it is ended", () => {
    expect(sessionHoldsPopups(session({ status: "ongoing", actualStartedAt: at("17:05") }), at("18:20"))).toBe(true);
    expect(sessionHoldsPopups(session({ status: "completed", actualStartedAt: at("17:05"), actualEndedAt: at("18:10") }), at("18:20"))).toBe(false);
  });

  it("lets a class stuck on ongoing go after four hours", () => {
    expect(sessionHoldsPopups(session({ status: "ongoing", actualStartedAt: at("17:00") }), at("21:30"))).toBe(false);
  });

  it("ignores cancelled and rescheduled classes", () => {
    expect(sessionHoldsPopups(session({ status: "cancelled" }), at("17:30"))).toBe(false);
    expect(sessionHoldsPopups(session({ status: "rescheduled" }), at("17:30"))).toBe(false);
  });
});

describe("pop-ups stay off classroom pages", () => {
  it("blocks every classroom page, not only the live room", () => {
    expect(popupCanInterrupt("/classrooms")).toBe(false);
    expect(popupCanInterrupt("/classrooms/abc")).toBe(false);
    expect(popupCanInterrupt("/classrooms/abc/live")).toBe(false);
    expect(popupCanInterrupt("/dashboard")).toBe(true);
  });
});

describe("achievement pop-ups", () => {
  it("come after the monthly report and before a badge", () => {
    const views = new Map();
    const chosen = choosePopup(
      [
        { key: "auto:badge:b", kind: "badge", title: "", body: "" },
        { key: "auto:achievement:a", kind: "achievement", title: "", body: "" },
      ],
      views
    );
    expect(chosen?.key).toBe("auto:achievement:a");
  });
});
