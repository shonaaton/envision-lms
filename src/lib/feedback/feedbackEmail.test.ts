import { describe, expect, it } from "vitest";
import { feedbackEmailHtml, feedbackEmailSubject, feedbackEmailText } from "@/lib/feedback/feedbackEmail";

const view = {
  month: "2026-09",
  tier: "intermediate",
  studentName: "Aarav <script>",
  coachName: "Priya Sen",
  courseName: "Intermediate Tactics",
  levelName: "Level 2",
  stats: { classesScheduled: 8, classesAttended: 7, topicsCovered: ["Forks & pins"] },
  ratings: { tactics: 4, calculation: 3, endgames: 2, planning: 3, effort: 5 },
  highlights: ["Spots forks and pins in games"],
  focusAreas: ["King and pawn endgames"],
  parentNote: "Keep solving puzzles daily",
};

describe("parent feedback email", () => {
  it("escapes values and greets the parent", () => {
    const html = feedbackEmailHtml(view, { parentName: "Mrs Rao", portalUrl: "https://envisionchessacademy.com/feedback?month=2026-09" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("Aarav &lt;script&gt;");
    expect(html).toContain("Dear Mrs Rao");
    expect(html).toContain("September 2026");
    expect(html).toContain("Forks &amp; pins");
    expect(html).toContain("Very good");
  });

  it("has a readable subject and plain-text version", () => {
    expect(feedbackEmailSubject(view)).toBe("Aarav's chess progress report - September 2026");
    const text = feedbackEmailText(view, { parentName: "Mrs Rao" });
    expect(text).toContain("Classes attended: 7 of 8");
    expect(text).toContain("Tactics: Very good");
  });
});
