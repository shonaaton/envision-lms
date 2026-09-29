import { describe, expect, it } from "vitest";

import { buildAcademyRankRows, buildLeaderboardRow, rankFromRows, type StudentActivityTotals } from "./studentRankings";

const A = "aaaaaaaaaaaaaaaaaaaaaaa1";
const B = "aaaaaaaaaaaaaaaaaaaaaaa2";
const C = "aaaaaaaaaaaaaaaaaaaaaaa3";
const D = "aaaaaaaaaaaaaaaaaaaaaaa4";
const BATCH_1 = "bbbbbbbbbbbbbbbbbbbbbbb1";
const BATCH_2 = "bbbbbbbbbbbbbbbbbbbbbbb2";
const CLASS_1 = "ccccccccccccccccccccccc1";
const CLASS_2 = "ccccccccccccccccccccccc2";

function totals(): StudentActivityTotals {
  return {
    homework: new Map([
      [A, { count: 2, scoreSum: 30, accuracySum: 150 }],
      [B, { count: 1, scoreSum: 10, accuracySum: 40 }],
    ]),
    live: new Map([
      [A, [
        { classroom: CLASS_1, count: 3, scoreSum: 9, correctCount: 2 },
        { classroom: CLASS_2, count: 1, scoreSum: -1, correctCount: 0 },
      ]],
    ]),
    rewards: new Map([
      [A, { liveQuestionXp: 12, tournamentXp: 20, bonusXp: 5, coins: 7, badges: 2 }],
      [C, { liveQuestionXp: 0, tournamentXp: 40, bonusXp: 0, coins: 3, badges: 0 }],
    ]),
    attendance: new Map([[A, { records: 4, attended: 3 }]]),
  };
}

describe("academy rank", () => {
  const students = [
    { _id: D, batches: [BATCH_2] },
    { _id: A, batches: [BATCH_1] },
    { _id: B, batches: [BATCH_1, BATCH_2] },
    { _id: C, batches: [] },
  ];

  it("totals homework score plus every reward's XP and coins", () => {
    const rows = buildAcademyRankRows(students, totals());
    expect(rows.map((row) => [row.id, row.total])).toEqual([
      [A, 30 + 12 + 20 + 5 + 7],
      [C, 43],
      [B, 10],
      [D, 0],
    ]);
  });

  it("keeps listing order between equal totals, as the old sort did", () => {
    const rows = buildAcademyRankRows([{ _id: C }, { _id: D }, { _id: B }], { homework: new Map(), rewards: new Map() });
    expect(rows.map((row) => row.id)).toEqual([C, D, B]);
  });

  it("ranks within the academy and among students sharing a batch", () => {
    const rows = buildAcademyRankRows(students, totals());
    expect(rankFromRows(rows, B)).toEqual({ academyRank: 3, batchRank: 2 });
    expect(rankFromRows(rows, D)).toEqual({ academyRank: 4, batchRank: 2 });
  });

  it("shows '-' for a student with no batch or not ranked", () => {
    const rows = buildAcademyRankRows(students, totals());
    expect(rankFromRows(rows, C)).toEqual({ academyRank: 2, batchRank: "-" });
    expect(rankFromRows(rows, "ddddddddddddddddddddddd9")).toEqual({ academyRank: "-", batchRank: "-" });
  });
});

describe("buildLeaderboardRow", () => {
  const student = { _id: A, name: "Asha", username: "Asha@ENV", batches: [{ name: "Evening" }, { name: "Weekend" }] };

  it("adds everything up on the academy board", () => {
    const row = buildLeaderboardRow(student, totals(), "academy", new Set());
    expect(row).toMatchObject({
      id: A,
      batchNames: "Evening, Weekend",
      totalPoints: 30 + 12 + 20 + 5,
      xp: 67,
      homeworkCompleted: 2,
      quizScore: 8,
      tournamentPoints: 20,
      // (150 + 2 correct x 100) / (2 homework + 4 answers)
      accuracy: Math.round(350 / 6),
      attendance: 75,
      coins: 7,
      badges: 2,
      bonusXp: 5,
      liveRewardXp: 12,
    });
  });

  it("counts only the chosen classrooms' quiz answers, and no tournaments, on class boards", () => {
    for (const scope of ["class", "course", "level"]) {
      const row = buildLeaderboardRow(student, totals(), scope, new Set([CLASS_1]));
      expect(row.quizScore).toBe(9);
      expect(row.tournamentPoints).toBe(0);
      expect(row.totalPoints).toBe(30 + 12 + 5);
      expect(row.accuracy).toBe(Math.round(350 / 5));
    }
  });

  it("ignores the classroom filter on batch and academy boards", () => {
    expect(buildLeaderboardRow(student, totals(), "batch", new Set([CLASS_1])).quizScore).toBe(8);
  });

  it("gives zeros, not errors, to a student with no activity", () => {
    const row = buildLeaderboardRow({ _id: D, name: "Dev" }, totals(), "academy", new Set());
    expect(row).toMatchObject({ totalPoints: 0, accuracy: 0, attendance: 0, coins: 0, badges: 0, homeworkCompleted: 0, batchNames: "", username: "", email: "" });
  });
});
