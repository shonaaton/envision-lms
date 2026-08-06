import { Chess } from "chess.js";
import { chessStartFen, extractHeader, normalizePermissiveFen } from "@/lib/pgnLibrary";

export type PgnShapeColor = "green" | "red" | "yellow" | "blue";

export type PgnCommentShape = {
  color: PgnShapeColor;
  from: string;
  to: string;
};

export type PgnEvaluation = {
  pawns?: number;
  mate?: number;
  depth?: number;
};

export type ParsedPgnComment = {
  text: string;
  shapes: PgnCommentShape[];
  clock?: number;
  emt?: number;
  evaluation?: PgnEvaluation;
};

export type LichessPgnNode = {
  id: string;
  san: string;
  uci?: string;
  ply?: number;
  color?: "w" | "b";
  fenBefore?: string;
  fenAfter?: string;
  turnAfter?: "white" | "black";
  isCheck?: boolean;
  invalid?: boolean;
  nags: number[];
  startingComments: ParsedPgnComment[];
  comments: ParsedPgnComment[];
  children: LichessPgnNode[];
};

export type LichessPgnTree = {
  headers: Record<string, string>;
  initialFen: string;
  comments: ParsedPgnComment[];
  children: LichessPgnNode[];
};

export type LichessPgnLine = {
  id: string;
  label: string;
  branchAt: number;
  nodes: LichessPgnNode[];
  moves: string[];
};

type Token =
  | { kind: "open" | "close" }
  | { kind: "comment" | "word"; value: string };

type NodeParent = LichessPgnTree | LichessPgnNode;
type ParserFrame = { parent: NodeParent; lastMove?: LichessPgnNode; pendingComments: ParsedPgnComment[] };

const symbolToNag: Record<string, number> = { "!": 1, "?": 2, "!!": 3, "??": 4, "!?": 5, "?!": 6 };
const nagToSymbol: Record<number, string> = { 1: "!", 2: "?", 3: "!!", 4: "??", 5: "!?", 6: "?!" };
const shapeColors: Record<string, PgnShapeColor> = { G: "green", R: "red", Y: "yellow", B: "blue" };

function tokenize(pgn: string): Token[] {
  const body = pgn.replace(/^\s*\[[A-Za-z][A-Za-z0-9_]*\s+"(?:\\.|[^"])*"\]\s*$/gm, " ");
  const tokens: Token[] = [];
  let word = "";
  const flush = () => {
    const value = word.trim();
    if (value) tokens.push({ kind: "word", value });
    word = "";
  };

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (/\s/.test(char)) {
      flush();
      continue;
    }
    if (char === "{") {
      flush();
      const end = body.indexOf("}", index + 1);
      const finalIndex = end < 0 ? body.length : end;
      tokens.push({ kind: "comment", value: body.slice(index + 1, finalIndex).trim() });
      index = finalIndex;
      continue;
    }
    if (char === ";") {
      flush();
      const end = body.slice(index + 1).search(/[\r\n]/);
      const finalIndex = end < 0 ? body.length : index + 1 + end;
      tokens.push({ kind: "comment", value: body.slice(index + 1, finalIndex).trim() });
      index = finalIndex;
      continue;
    }
    if (char === "(" || char === ")") {
      flush();
      tokens.push({ kind: char === "(" ? "open" : "close" });
      continue;
    }
    word += char;
  }
  flush();
  return tokens;
}

function secondsFromClock(value: string) {
  const parts = value.trim().split(":").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return undefined;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function shapesFromCommand(value: string, circle: boolean): PgnCommentShape[] {
  return value.split(",").map((part) => part.trim()).flatMap((part) => {
    const match = part.match(/^([GRYB])([a-h][1-8])([a-h][1-8])?$/i);
    if (!match) return [];
    const from = match[2].toLowerCase();
    return [{ color: shapeColors[match[1].toUpperCase()], from, to: circle ? from : (match[3] || from).toLowerCase() }];
  });
}

export function parseLichessComment(raw: string): ParsedPgnComment {
  const shapes: PgnCommentShape[] = [];
  let clock: number | undefined;
  let emt: number | undefined;
  let evaluation: PgnEvaluation | undefined;

  for (const match of raw.matchAll(/\[%\s*(csl|cal|eval|clk|emt)\s+([^\]]+)\]/gi)) {
    const command = match[1].toLowerCase();
    const value = match[2].trim();
    if (command === "csl") shapes.push(...shapesFromCommand(value, true));
    if (command === "cal") shapes.push(...shapesFromCommand(value, false));
    if (command === "clk") clock = secondsFromClock(value);
    if (command === "emt") emt = secondsFromClock(value);
    if (command === "eval") {
      const [score, depthValue] = value.split(",").map((part) => part.trim());
      const depth = Number(depthValue);
      if (/^#-?\d+$/.test(score)) evaluation = { mate: Number(score.slice(1)), ...(Number.isFinite(depth) ? { depth } : {}) };
      else {
        const pawns = Number(score);
        if (Number.isFinite(pawns)) evaluation = { pawns, ...(Number.isFinite(depth) ? { depth } : {}) };
      }
    }
  }

  return {
    text: raw.replace(/\[%\s*(?:csl|cal|eval|clk|emt)\s+[^\]]+\]/gi, " ").replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").trim(),
    shapes,
    ...(clock === undefined ? {} : { clock }),
    ...(emt === undefined ? {} : { emt }),
    ...(evaluation ? { evaluation } : {}),
  };
}

function headersFromPgn(pgn: string) {
  const headers: Record<string, string> = {};
  for (const match of pgn.matchAll(/^\s*\[([^\s]+)\s+"((?:\\.|[^"])*)"\]\s*$/gm)) {
    headers[match[1]] = match[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return headers;
}

function initialFenFromPgn(pgn: string) {
  const headerFen = extractHeader(pgn, "FEN");
  return normalizePermissiveFen(headerFen) || headerFen || chessStartFen;
}

function normalizeMoveWord(value: string) {
  let word = value.trim();
  const inlineNags = Array.from(word.matchAll(/\$(\d+)/g)).map((match) => Number(match[1]));
  word = word.replace(/\$\d+/g, "");
  word = word.replace(/^\d+\.(?:\.\.)?/, "").replace(/^\.+/, "").trim();
  const glyph = word.match(/(!!|\?\?|!\?|\?!|!|\?)$/)?.[1];
  if (glyph) word = word.slice(0, -glyph.length);
  return { san: word, nags: [...inlineNags, ...(glyph ? [symbolToNag[glyph]] : [])] };
}

function addPositions(tree: LichessPgnTree) {
  function walk(parent: NodeParent, position: Chess, ply: number) {
    parent.children.forEach((node, childIndex) => {
      node.id = node.id || `${"id" in parent && parent.id ? `${parent.id}/` : ""}${childIndex}`;
      const branch = new Chess(position.fen());
      node.fenBefore = branch.fen();
      node.ply = ply + 1;
      try {
        const move = branch.move(node.san);
        if (!move) throw new Error("Invalid move");
        node.san = move.san;
        node.uci = `${move.from}${move.to}${move.promotion || ""}`;
        node.color = move.color;
        node.fenAfter = branch.fen();
        node.turnAfter = branch.turn() === "w" ? "white" : "black";
        node.isCheck = branch.isCheck();
        walk(node, branch, ply + 1);
      } catch {
        node.invalid = true;
      }
    });
  }

  try {
    walk(tree, new Chess(tree.initialFen), 0);
  } catch {
    const permissive = normalizePermissiveFen(tree.initialFen);
    if (!permissive) return;
    const position = new Chess();
    position.load(permissive, { skipValidation: true });
    walk(tree, position, 0);
  }
}

export function parseLichessPgn(pgn: string): LichessPgnTree {
  const tree: LichessPgnTree = { headers: headersFromPgn(pgn), initialFen: initialFenFromPgn(pgn), comments: [], children: [] };
  const stack: ParserFrame[] = [{ parent: tree, pendingComments: [] }];

  for (const token of tokenize(pgn)) {
    const frame = stack[stack.length - 1];
    if (token.kind === "open") {
      stack.push({ parent: frame.parent, pendingComments: [] });
      continue;
    }
    if (token.kind === "close") {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (token.kind === "comment") {
      const comment = parseLichessComment(token.value);
      if (frame.lastMove) frame.lastMove.comments.push(comment);
      else if (frame.parent === tree && !tree.children.length) tree.comments.push(comment);
      else frame.pendingComments.push(comment);
      continue;
    }

    if (token.kind !== "word") continue;

    if (/^\$\d+$/.test(token.value)) {
      if (frame.lastMove) frame.lastMove.nags.push(Number(token.value.slice(1)));
      continue;
    }
    const { san, nags } = normalizeMoveWord(token.value);
    if (!san || /^(?:\d+\.{1,3}|1-0|0-1|1\/2-1\/2|\*)$/.test(san)) continue;
    if (frame.lastMove) frame.parent = frame.lastMove;
    const node: LichessPgnNode = {
      id: "",
      san,
      nags,
      startingComments: frame.pendingComments.splice(0),
      comments: [],
      children: [],
    };
    frame.parent.children.push(node);
    frame.lastMove = node;
  }

  addPositions(tree);
  return tree;
}

function firstChildLine(node: LichessPgnNode) {
  const nodes: LichessPgnNode[] = [];
  let current: LichessPgnNode | undefined = node;
  while (current) {
    nodes.push(current);
    current = current.children[0];
  }
  return nodes;
}

export function lichessPgnLines(tree: LichessPgnTree): LichessPgnLine[] {
  const first = tree.children[0];
  const mainNodes = first ? firstChildLine(first) : [];
  const lines: LichessPgnLine[] = [{ id: "", label: "Main line", branchAt: 0, nodes: mainNodes, moves: mainNodes.map((node) => node.san) }];
  let variationNumber = 0;

  function visit(parent: NodeParent, prefix: LichessPgnNode[]) {
    parent.children.forEach((child, index) => {
      if (index > 0) {
        variationNumber += 1;
        const nodes = [...prefix, ...firstChildLine(child)];
        lines.push({ id: child.id, label: `Variation ${variationNumber}`, branchAt: prefix.length, nodes, moves: nodes.map((node) => node.san) });
      }
      visit(child, [...prefix, child]);
    });
  }

  visit(tree, []);
  return lines;
}

export function lichessPgnHasInvalidMoves(tree: LichessPgnTree) {
  const pending = [...tree.children];
  while (pending.length) {
    const node = pending.pop()!;
    if (node.invalid) return true;
    pending.push(...node.children);
  }
  return false;
}

export function nagLabel(nag: number) {
  return nagToSymbol[nag] || `$${nag}`;
}

export function commentMetaLabel(comment: ParsedPgnComment) {
  const parts: string[] = [];
  if (comment.evaluation?.mate !== undefined) parts.push(`Eval #${comment.evaluation.mate}${comment.evaluation.depth ? ` depth ${comment.evaluation.depth}` : ""}`);
  else if (comment.evaluation?.pawns !== undefined) parts.push(`Eval ${comment.evaluation.pawns >= 0 ? "+" : ""}${comment.evaluation.pawns.toFixed(2)}${comment.evaluation.depth ? ` depth ${comment.evaluation.depth}` : ""}`);
  if (comment.clock !== undefined) parts.push(`Clock ${formatPgnClock(comment.clock)}`);
  if (comment.emt !== undefined) parts.push(`Move time ${formatPgnClock(comment.emt)}`);
  return parts.join(" · ");
}

export function formatPgnClock(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const secondsLabel = Number.isInteger(secs) ? String(secs).padStart(2, "0") : secs.toFixed(3).padStart(6, "0");
  return `${hours}:${String(minutes).padStart(2, "0")}:${secondsLabel}`;
}

export const pgnShapeHex: Record<PgnShapeColor, string> = {
  green: "#15803d",
  red: "#dc2626",
  yellow: "#ca8a04",
  blue: "#2563eb",
};
