import { describe, expect, it } from "vitest";
import { createPreviewActions, type PreviewPaper } from "./examPreview";

const paper: PreviewPaper = {
  id: "paper1",
  levelLabel: "Beginner Level 1",
  mcqs: [
    {
      id: "m1",
      question: "Best move?",
      positionFen: "",
      topicName: "Checks",
      options: [
        { id: "a", text: "Right", correct: true },
        { id: "b", text: "Wrong", correct: false },
      ],
    },
  ],
  positions: [
    {
      id: "p1",
      topicName: "Checkmates",
      question: "White to play and mate in 1.",
      startFen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
      solution: ["Qxf7#"],
      studentColor: "white",
    },
  ],
};

describe("admin preview", () => {
  it("marks exactly like the real exam and never leaves the browser", async () => {
    const actions = createPreviewActions(paper, "/admin/exams");
    expect(actions.preview).toBe(true);
    expect((await actions.load()).exam?.status).toBe("assigned");
    const started = (await actions.call({ action: "start" })).exam;
    expect(started.positions[0]).toMatchObject({ question: "White to play and mate in 1.", available: 5 });
    expect(JSON.stringify(started)).not.toContain('"correct"');

    await actions.call({ action: "mcq", questionId: "m1", optionId: "a" });
    expect(await actions.call({ action: "move", questionId: "p1", from: "f3", to: "f6" })).toMatchObject({ correct: false, available: 4.5 });
    expect(await actions.call({ action: "hint", questionId: "p1" })).toMatchObject({ hint: { san: "Qxf7#" }, available: 2.5 });
    expect(await actions.call({ action: "move", questionId: "p1", from: "f3", to: "f7" })).toMatchObject({ correct: true, solved: true, marks: 2.5 });

    const done = (await actions.call({ action: "submit" })).exam;
    expect(done.status).toBe("submitted");
    expect(done.submitReason).toBe("completed");
    expect(done.score).toMatchObject({ mcq: 2, positions: 2.5, total: 4.5, max: 100 });
  });

  it("warns on the first leave and ends the preview on the second", async () => {
    const actions = createPreviewActions(paper, "/admin/exams");
    await actions.call({ action: "start" });
    expect(await actions.call({ action: "violation", type: "tab_hidden" })).toEqual({ outcome: "warn" });
    expect(await actions.call({ action: "violation", type: "tab_hidden" })).toEqual({ outcome: "submit" });
    const ended = (await actions.load()).exam;
    expect(ended).toMatchObject({ status: "submitted", submitReason: "tab_switch" });
  });
});
