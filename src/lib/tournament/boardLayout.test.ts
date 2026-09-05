import { describe, expect, it } from "vitest";
import { BOARD_MIN_SIZE, computeBoardSize, isLandscapePhone, plyIndex, toMoveRows } from "./boardLayout";
import { buildBoardSquareStyles, findKingSquare } from "./boardTheme";

/** The widths the brief calls out, plus a couple of real device sizes. */
const PHONE_WIDTHS = [320, 360, 375, 390, 412];

describe("computeBoardSize", () => {
  it("gives the board almost the whole width on every phone size", () => {
    for (const width of PHONE_WIDTHS) {
      const size = computeBoardSize({ viewportWidth: width, viewportHeight: 800, containerWidth: width - 16, chromeHeight: 300 });
      expect(size, `${width}px`).toBeGreaterThanOrEqual(width - 32);
      expect(size, `${width}px`).toBeLessThanOrEqual(width);
    }
  });

  it("never exceeds the viewport width, so the page cannot scroll sideways", () => {
    for (const width of [320, 360, 768, 1024, 1280, 1920]) {
      const size = computeBoardSize({ viewportWidth: width, viewportHeight: 900, containerWidth: 5000, chromeHeight: 200 });
      expect(size, `${width}px`).toBeLessThan(width);
    }
  });

  it("shrinks to fit a short viewport rather than pushing the board off-screen", () => {
    const tall = computeBoardSize({ viewportWidth: 390, viewportHeight: 900, containerWidth: 374, chromeHeight: 300 });
    const short = computeBoardSize({ viewportWidth: 390, viewportHeight: 620, containerWidth: 374, chromeHeight: 300 });
    expect(short).toBeLessThan(tall);
  });

  it("keeps a usable board even when the space is absurdly small", () => {
    const size = computeBoardSize({ viewportWidth: 280, viewportHeight: 320, containerWidth: 100, chromeHeight: 300 });
    expect(size).toBe(BOARD_MIN_SIZE);
  });

  it("caps the board on a large desktop so it does not dominate the page", () => {
    const size = computeBoardSize({ viewportWidth: 2560, viewportHeight: 1440, containerWidth: 1400, chromeHeight: 200 });
    expect(size).toBeLessThanOrEqual(720);
  });

  it("gives a tablet more board than a phone and less than a desktop", () => {
    const phone = computeBoardSize({ viewportWidth: 390, viewportHeight: 844, containerWidth: 374, chromeHeight: 280 });
    const tablet = computeBoardSize({ viewportWidth: 768, viewportHeight: 1024, containerWidth: 700, chromeHeight: 280 });
    const desktop = computeBoardSize({ viewportWidth: 1440, viewportHeight: 900, containerWidth: 800, chromeHeight: 220 });
    expect(tablet).toBeGreaterThan(phone);
    expect(desktop).toBeGreaterThan(tablet);
  });

  it("follows height on a phone in landscape, where width is plentiful", () => {
    const size = computeBoardSize({ viewportWidth: 844, viewportHeight: 390, containerWidth: 500, chromeHeight: 300 });
    // Ignores the tall chrome reserve and uses the height it actually has.
    expect(size).toBeGreaterThan(300);
    expect(size).toBeLessThan(390);
  });

  it("returns whole pixels, so the square grid stays crisp", () => {
    const size = computeBoardSize({ viewportWidth: 377, viewportHeight: 811, containerWidth: 361, chromeHeight: 291 });
    expect(Number.isInteger(size)).toBe(true);
  });

  it("copes with a container that has not been measured yet", () => {
    const size = computeBoardSize({ viewportWidth: 390, viewportHeight: 844, containerWidth: 0, chromeHeight: 280 });
    expect(size).toBeGreaterThan(BOARD_MIN_SIZE);
    expect(size).toBeLessThan(390);
  });
});

describe("isLandscapePhone", () => {
  it("recognises a phone turned sideways", () => {
    expect(isLandscapePhone(844, 390)).toBe(true);
  });

  it("does not mistake a portrait phone for landscape", () => {
    expect(isLandscapePhone(390, 844)).toBe(false);
  });

  it("does not mistake a desktop for a phone", () => {
    expect(isLandscapePhone(1440, 900)).toBe(false);
  });
});

describe("toMoveRows", () => {
  it("pairs plies into numbered moves", () => {
    expect(toMoveRows(["e4", "e5", "Nf3", "Nc6"])).toEqual([
      { number: 1, white: "e4", black: "e5" },
      { number: 2, white: "Nf3", black: "Nc6" },
    ]);
  });

  it("leaves Black's cell empty when White has just moved", () => {
    expect(toMoveRows(["e4", "e5", "Nf3"])).toEqual([
      { number: 1, white: "e4", black: "e5" },
      { number: 2, white: "Nf3", black: "" },
    ]);
  });

  it("handles a game with no moves", () => {
    expect(toMoveRows([])).toEqual([]);
    expect(toMoveRows(undefined)).toEqual([]);
  });

  it("maps a cell back to its ply, for highlighting the latest move", () => {
    expect(plyIndex(1, "white")).toBe(0);
    expect(plyIndex(1, "black")).toBe(1);
    expect(plyIndex(3, "white")).toBe(4);
  });
});

describe("buildBoardSquareStyles", () => {
  it("tints both squares of the last move", () => {
    const styles = buildBoardSquareStyles({ lastMoveUci: "e2e4" });
    expect(styles.e2).toBeDefined();
    expect(styles.e4).toBeDefined();
  });

  it("ignores a malformed last move rather than throwing", () => {
    expect(buildBoardSquareStyles({ lastMoveUci: "e2" })).toEqual({});
    expect(buildBoardSquareStyles({ lastMoveUci: null })).toEqual({});
  });

  it("draws an empty target as a dot and a capture as a ring", () => {
    const styles = buildBoardSquareStyles({ targets: ["e4", "d5"], occupied: new Set(["d5"]) });
    expect(styles.e4.backgroundImage).toContain("radial-gradient");
    expect(styles.d5.boxShadow).toBeDefined();
    expect(styles.d5.backgroundImage).toBeUndefined();
  });

  it("marks both ends of a queued premove", () => {
    const styles = buildBoardSquareStyles({ premove: { from: "g1", to: "f3" } });
    expect(styles.g1.boxShadow).toBeDefined();
    expect(styles.f3.boxShadow).toBeDefined();
  });

  it("keeps the premove distinct from the last move", () => {
    const styles = buildBoardSquareStyles({ lastMoveUci: "e7e5", premove: { from: "g1", to: "f3" } });
    expect(styles.e5.backgroundColor).not.toBe(styles.f3.backgroundColor);
  });

  it("layers a premove over the square the last move landed on", () => {
    const styles = buildBoardSquareStyles({ lastMoveUci: "e2e4", premove: { from: "e4", to: "e5" } });
    // Both marks are present; the premove ring is what the player acts on.
    expect(styles.e4.boxShadow).toBeDefined();
    expect(styles.e4.backgroundColor).toBeDefined();
  });

  it("glows the checked king", () => {
    const styles = buildBoardSquareStyles({ checkSquare: "e1" });
    expect(styles.e1.backgroundImage).toContain("radial-gradient");
  });

  it("returns nothing to draw for a quiet board", () => {
    expect(buildBoardSquareStyles({})).toEqual({});
  });
});

describe("findKingSquare", () => {
  const empty = () => Array.from({ length: 8 }, () => new Array(8).fill(null));

  it("locates the white king", () => {
    const board = empty();
    board[7][4] = { type: "k", color: "w" };
    expect(findKingSquare(board, "w")).toBe("e1");
  });

  it("locates the black king", () => {
    const board = empty();
    board[0][4] = { type: "k", color: "b" };
    expect(findKingSquare(board, "b")).toBe("e8");
  });

  it("returns nothing when that king is not on the board", () => {
    expect(findKingSquare(empty(), "w")).toBeNull();
  });
});
