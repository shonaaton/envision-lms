import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { OPENINGS } from "./content";
import { ecoAt } from "./eco";
import { answersQuiz, buildChapterTimeline } from "./engine";
import { OPENING_TOTAL_PAISE, rupees } from "./pricing";

/**
 * The guard rail for opening content. Every opening is hand-written, so this
 * replays every chapter: a typo in a move, a quiz answer that is not legal, or
 * an arrow to a square that does not exist fails `npm test` instead of a lesson.
 */

describe("opening content", () => {
  it("has unique opening slugs", () => {
    const slugs = OPENINGS.map((opening) => opening.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  for (const opening of OPENINGS) {
    describe(opening.name, () => {
      it("has exactly one preview chapter and unique chapter slugs", () => {
        expect(opening.chapters.filter((chapter) => chapter.preview)).toHaveLength(1);
        const slugs = opening.chapters.map((chapter) => chapter.slug);
        expect(new Set(slugs).size).toBe(slugs.length);
      });

      it("is named the way lichess names its defining position", () => {
        const game = new Chess();
        for (const san of opening.definingMoves) game.move(san);
        const named = ecoAt(game.fen());
        expect(named, `lichess has no name after ${opening.definingMoves.join(" ")}`).not.toBeNull();
        expect(named!.name.startsWith(opening.name)).toBe(true);
        expect(opening.eco).toContain(named!.eco);
      });

      for (const chapter of opening.chapters) {
        describe(chapter.title, () => {
          const timeline = buildChapterTimeline(chapter, ecoAt);

          it("replays every move and quiz answer legally", () => {
            expect(timeline.error).toBeUndefined();
            expect(timeline.frames).toHaveLength(chapter.steps.length);
          });

          it("opens with an intro, so the starting position is shown before anything moves", () => {
            expect(chapter.steps[0]?.kind).toBe("intro");
          });

          it("ends with a summary", () => {
            expect(chapter.steps[chapter.steps.length - 1]?.kind).toBe("summary");
          });

          it("accepts every listed quiz answer, with or without check marks", () => {
            for (const frame of timeline.frames.filter((item) => item.quiz)) {
              for (const answer of frame.quiz!.answers) {
                expect(answersQuiz(frame, answer)).toBe(true);
                expect(answersQuiz(frame, `${answer}+`)).toBe(true);
              }
            }
          });

          // Early moves carry broader names ("King's Pawn Game"); where the
          // chapter ends up must be this opening and one of its listed codes.
          it("ends in a position named as this opening, under one of its ECO codes", () => {
            const last = timeline.frames[timeline.frames.length - 1]?.opening;
            expect(last?.name.startsWith(opening.name)).toBe(true);
            expect(opening.eco).toContain(last?.eco);
          });
        });
      }
    });
  }
});

describe("buildChapterTimeline", () => {
  it("reports an illegal move instead of stopping silently", () => {
    const timeline = buildChapterTimeline({
      slug: "x",
      title: "x",
      summary: "x",
      steps: [
        { kind: "intro", text: "start" },
        { kind: "move", move: "e4", text: "" },
        { kind: "move", move: "e4", text: "" },
      ],
    });
    expect(timeline.error).toMatch(/Step 3 \(move\): e4 is not legal/);
    expect(timeline.frames).toHaveLength(2);
  });

  it("reports a quiz answer that is not legal", () => {
    const timeline = buildChapterTimeline({
      slug: "x",
      title: "x",
      summary: "x",
      steps: [{ kind: "quiz", prompt: "?", answer: ["e4", "Qh5"], text: "" }],
    });
    expect(timeline.error).toMatch(/answer Qh5 is not legal/);
  });

  it("reports an arrow off the board", () => {
    const timeline = buildChapterTimeline({
      slug: "x",
      title: "x",
      summary: "x",
      steps: [{ kind: "intro", text: "", arrows: [["e2", "e9"]] }],
    });
    expect(timeline.error).toMatch(/arrow e2-e9/);
  });

  it("plays setup moves before step one and numbers moves from there", () => {
    const timeline = buildChapterTimeline({
      slug: "x",
      title: "x",
      summary: "x",
      setupMoves: ["e4", "e5"],
      steps: [
        { kind: "intro", text: "" },
        { kind: "move", move: "Nf3", text: "" },
        { kind: "move", move: "Nc6", text: "" },
      ],
    });
    expect(timeline.setup.map((move) => move.label)).toEqual(["1. e4", "1... e5"]);
    expect(timeline.frames[1].move?.label).toBe("2. Nf3");
    expect(timeline.frames[2].move?.label).toBe("2... Nc6");
  });

  it("keeps the last opening name on positions lichess does not name", () => {
    const timeline = buildChapterTimeline(
      {
        slug: "x",
        title: "x",
        summary: "x",
        setupMoves: ["e4", "e5", "Nf3", "Nc6", "Bc4"],
        steps: [{ kind: "intro", text: "" }],
      },
      ecoAt
    );
    expect(timeline.frames[0].opening?.name).toBe("Italian Game");
  });
});

describe("opening price", () => {
  it("is ₹49 plus 18% GST", () => {
    expect(OPENING_TOTAL_PAISE).toBe(5782);
    expect(rupees(OPENING_TOTAL_PAISE)).toBe("₹57.82");
  });
});
