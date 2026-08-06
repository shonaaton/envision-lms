import { expect, test } from "@playwright/test";
import { lichessPgnLines, parseLichessComment, parseLichessPgn } from "../src/lib/lichessPgn";

const annotatedPgn = `[Event "Training Example"]
[Result "*"]

{Opening lesson}
1. e4 $1
{Controls the centre.
[%csl Ge4,Rd5]
[%cal Ge2e4]
[%eval 0.35,18]
[%clk 0:09:55]}
1... e5
(1... c5 $5
  {The Sicilian Defence. [%csl Gc5]}
  2. Nf3
  (2. Nc3 {The Closed Sicilian.}))
2. Nf3 2... Nc6 *`;

test("parses Lichess nested variations as sibling branches", () => {
  const lines = lichessPgnLines(parseLichessPgn(annotatedPgn));

  expect(lines.map((line) => line.moves)).toEqual([
    ["e4", "e5", "Nf3", "Nc6"],
    ["e4", "c5", "Nf3"],
    ["e4", "c5", "Nc3"],
  ]);
  expect(lines.map((line) => line.branchAt)).toEqual([0, 1, 2]);
});

test("extracts Lichess comments, NAGs, shapes, evaluation, and clock", () => {
  const tree = parseLichessPgn(annotatedPgn);
  const e4 = tree.children[0];
  const comment = e4.comments[0];

  expect(tree.comments[0].text).toBe("Opening lesson");
  expect(e4.nags).toEqual([1]);
  expect(comment.text).toBe("Controls the centre.");
  expect(comment.shapes).toEqual([
    { color: "green", from: "e4", to: "e4" },
    { color: "red", from: "d5", to: "d5" },
    { color: "green", from: "e2", to: "e4" },
  ]);
  expect(comment.evaluation).toEqual({ pawns: 0.35, depth: 18 });
  expect(comment.clock).toBe(595);
});

test("supports symbolic NAGs, mate evaluations, and fractional elapsed time", () => {
  const tree = parseLichessPgn(`1. e4!? {[%eval #-4,22] [%emt 0:00:05.250]} *`);
  const comment = tree.children[0].comments[0];

  expect(tree.children[0].nags).toEqual([5]);
  expect(comment.evaluation).toEqual({ mate: -4, depth: 22 });
  expect(comment.emt).toBe(5.25);
  expect(parseLichessComment("[%clk 1:02:03.500]").clock).toBe(3723.5);
});
