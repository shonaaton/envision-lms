import { Chess } from "chess.js";
import { chessStartFen, normalizePermissiveFen } from "@/lib/pgnLibrary";
import {
  formatPgnClock,
  parseLichessPgn,
  type LichessPgnNode,
  type LichessPgnTree,
  type ParsedPgnComment,
  type PgnShapeColor,
} from "@/lib/lichessPgn";

export type PgnEditorPath = number[];
export type PgnEditorSide = "white" | "black";
export type PgnEditorMove = { from: string; to: string; promotion?: string };

const shapeColorCodes: Record<PgnShapeColor, string> = { green: "G", red: "R", yellow: "Y", blue: "B" };

export const pgnAnnotationNags = [
  { nag: 1, label: "!", title: "Good move" },
  { nag: 2, label: "?", title: "Mistake" },
  { nag: 3, label: "!!", title: "Brilliant move" },
  { nag: 4, label: "??", title: "Blunder" },
  { nag: 5, label: "!?", title: "Interesting move" },
  { nag: 6, label: "?!", title: "Dubious move" },
];

export function loadPermissivePosition(fen?: string | null) {
  const game = new Chess();
  const candidate = String(fen || "").trim() || chessStartFen;
  try {
    game.load(candidate);
    return game;
  } catch {
    try {
      game.load(normalizePermissiveFen(candidate) || chessStartFen, { skipValidation: true });
    } catch {
      game.load(chessStartFen, { skipValidation: true });
    }
    return game;
  }
}

export function parsePgnTree(pgn: string) {
  return parseLichessPgn(pgn || "");
}

function cloneComment(comment: ParsedPgnComment): ParsedPgnComment {
  return { ...comment, shapes: comment.shapes.map((shape) => ({ ...shape })) };
}

function cloneNode(node: LichessPgnNode): LichessPgnNode {
  return {
    ...node,
    nags: [...node.nags],
    startingComments: node.startingComments.map(cloneComment),
    comments: node.comments.map(cloneComment),
    children: node.children.map(cloneNode),
  };
}

export function clonePgnTree(tree: LichessPgnTree): LichessPgnTree {
  return {
    headers: { ...tree.headers },
    initialFen: tree.initialFen,
    comments: tree.comments.map(cloneComment),
    children: tree.children.map(cloneNode),
  };
}

function markSubtreeInvalid(node: LichessPgnNode) {
  node.children.forEach((child) => {
    child.invalid = true;
    child.fenBefore = undefined;
    child.fenAfter = undefined;
    markSubtreeInvalid(child);
  });
}

export function recomputePgnTree(tree: LichessPgnTree): LichessPgnTree {
  function walk(parent: LichessPgnTree | LichessPgnNode, fen: string, ply: number, prefix: string) {
    parent.children.forEach((node, index) => {
      node.id = prefix ? `${prefix}/${index}` : String(index);
      node.invalid = false;
      const branch = loadPermissivePosition(fen);
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
        walk(node, branch.fen(), ply + 1, node.id);
      } catch {
        node.invalid = true;
        node.fenAfter = undefined;
        markSubtreeInvalid(node);
      }
    });
  }

  walk(tree, tree.initialFen, 0, "");
  return tree;
}

export function prunePgnInvalidMoves(tree: LichessPgnTree) {
  let removed = 0;

  function countNodes(node: LichessPgnNode): number {
    return 1 + node.children.reduce((total, child) => total + countNodes(child), 0);
  }

  function walk(parent: LichessPgnTree | LichessPgnNode) {
    parent.children = parent.children.filter((child) => {
      if (!child.invalid) return true;
      removed += countNodes(child);
      return false;
    });
    parent.children.forEach(walk);
  }

  walk(tree);
  return removed;
}

export function countPgnMoves(tree: LichessPgnTree) {
  function walk(parent: LichessPgnTree | LichessPgnNode): number {
    return parent.children.reduce((total, child) => total + 1 + walk(child), 0);
  }
  return walk(tree);
}

export function pgnChildrenAtPath(tree: LichessPgnTree, path: PgnEditorPath) {
  let children = tree.children;
  for (const index of path) {
    const node = children[index];
    if (!node) return [];
    children = node.children;
  }
  return children;
}

export function pgnNodeAtPath(tree: LichessPgnTree, path: PgnEditorPath): LichessPgnNode | null {
  if (!path.length) return null;
  let children = tree.children;
  let node: LichessPgnNode | null = null;
  for (const index of path) {
    node = children[index] || null;
    if (!node) return null;
    children = node.children;
  }
  return node;
}

export function pgnLineNodes(tree: LichessPgnTree, path: PgnEditorPath) {
  const nodes: LichessPgnNode[] = [];
  let children = tree.children;
  for (const index of path) {
    const node = children[index];
    if (!node) break;
    nodes.push(node);
    children = node.children;
  }
  return nodes;
}

export function pgnMainlinePath(tree: LichessPgnTree) {
  const path: PgnEditorPath = [];
  let children = tree.children;
  while (children.length) {
    path.push(0);
    children = children[0].children;
  }
  return path;
}

export function pgnPositionAtPath(tree: LichessPgnTree, path: PgnEditorPath) {
  const node = pgnNodeAtPath(tree, path);
  return node?.fenAfter || node?.fenBefore || tree.initialFen;
}

export function isPgnVariationPath(path: PgnEditorPath) {
  return path.some((index) => index > 0);
}

export function pgnSideToMoveAt(fen: string): PgnEditorSide {
  return String(fen).split(/\s+/)[1] === "b" ? "black" : "white";
}

function textComment(text: string): ParsedPgnComment {
  return { text, shapes: [] };
}

function isMetaComment(comment: ParsedPgnComment) {
  return Boolean(comment.shapes.length || comment.clock !== undefined || comment.emt !== undefined || comment.evaluation);
}

export function appendPgnMove(tree: LichessPgnTree, path: PgnEditorPath, move: PgnEditorMove) {
  const position = loadPermissivePosition(pgnPositionAtPath(tree, path));
  let san = "";
  try {
    const played = position.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
    if (!played) return null;
    san = played.san;
  } catch {
    return null;
  }

  const siblings = pgnChildrenAtPath(tree, path);
  const existing = siblings.findIndex((child) => child.san === san);
  if (existing >= 0) return { tree, path: [...path, existing], created: false };

  const next = clonePgnTree(tree);
  pgnChildrenAtPath(next, path).push({
    id: "",
    san,
    nags: [],
    startingComments: [],
    comments: [],
    children: [],
  });
  recomputePgnTree(next);
  return { tree: next, path: [...path, siblings.length], created: true };
}

export function deletePgnNode(tree: LichessPgnTree, path: PgnEditorPath) {
  if (!path.length) return { tree, path };
  const next = clonePgnTree(tree);
  const parentPath = path.slice(0, -1);
  pgnChildrenAtPath(next, parentPath).splice(path[path.length - 1], 1);
  recomputePgnTree(next);
  return { tree: next, path: parentPath };
}

export function promotePgnLine(tree: LichessPgnTree, path: PgnEditorPath) {
  if (!isPgnVariationPath(path)) return { tree, path };
  const next = clonePgnTree(tree);
  const promoted: PgnEditorPath = [];

  path.forEach((index) => {
    if (index > 0) {
      const siblings = pgnChildrenAtPath(next, promoted);
      const [node] = siblings.splice(index, 1);
      siblings.unshift(node);
      promoted.push(0);
      return;
    }
    promoted.push(index);
  });

  recomputePgnTree(next);
  return { tree: next, path: promoted };
}

export function readPgnComment(tree: LichessPgnTree, path: PgnEditorPath) {
  const comments = path.length ? pgnNodeAtPath(tree, path)?.comments : tree.comments;
  return (comments || []).map((comment) => comment.text.trim()).filter(Boolean).join(" ");
}

export function setPgnComment(tree: LichessPgnTree, path: PgnEditorPath, text: string) {
  const next = clonePgnTree(tree);
  const trimmed = text.trim();

  if (!path.length) {
    const kept = next.comments.filter(isMetaComment).map((comment) => ({ ...comment, text: "" }));
    next.comments = trimmed ? [textComment(trimmed), ...kept] : kept;
    return next;
  }

  const node = pgnNodeAtPath(next, path);
  if (!node) return next;
  const kept = node.comments.filter(isMetaComment).map((comment) => ({ ...comment, text: "" }));
  node.comments = trimmed ? [textComment(trimmed), ...kept] : kept;
  return next;
}

export function togglePgnNag(tree: LichessPgnTree, path: PgnEditorPath, nag: number) {
  const next = clonePgnTree(tree);
  const node = pgnNodeAtPath(next, path);
  if (!node) return next;
  const others = node.nags.filter((value) => value > 6);
  node.nags = node.nags.includes(nag) ? others : [...others, nag];
  return next;
}

export function setPgnInitialFen(tree: LichessPgnTree, fen: string) {
  const normalized = normalizePermissiveFen(fen);
  if (!normalized) return null;
  const next = clonePgnTree(tree);
  next.initialFen = normalized;
  recomputePgnTree(next);
  const removedMoves = prunePgnInvalidMoves(next);
  recomputePgnTree(next);
  return { tree: next, path: [] as PgnEditorPath, removedMoves };
}

export function setPgnStartSide(tree: LichessPgnTree, side: PgnEditorSide) {
  const parts = (normalizePermissiveFen(tree.initialFen) || chessStartFen).split(" ");
  parts[1] = side === "black" ? "b" : "w";
  parts[3] = "-";
  return setPgnInitialFen(tree, parts.join(" "));
}

export function countPgnMovesLostBySideChange(tree: LichessPgnTree, side: PgnEditorSide) {
  if (pgnSideToMoveAt(tree.initialFen) === side) return 0;
  const preview = setPgnStartSide(tree, side);
  return preview ? countPgnMoves(tree) - countPgnMoves(preview.tree) : 0;
}

function escapeHeaderValue(value: string) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function serializeComment(comment: ParsedPgnComment) {
  const parts: string[] = [];
  const text = comment.text.replace(/[{}]/g, " ").replace(/\s+/g, " ").trim();
  if (text) parts.push(text);

  const circles = comment.shapes.filter((shape) => shape.from === shape.to);
  const arrows = comment.shapes.filter((shape) => shape.from !== shape.to);
  if (circles.length) parts.push(`[%csl ${circles.map((shape) => `${shapeColorCodes[shape.color]}${shape.from}`).join(",")}]`);
  if (arrows.length) parts.push(`[%cal ${arrows.map((shape) => `${shapeColorCodes[shape.color]}${shape.from}${shape.to}`).join(",")}]`);

  if (comment.evaluation) {
    const score = comment.evaluation.mate !== undefined ? `#${comment.evaluation.mate}` : String(comment.evaluation.pawns ?? 0);
    parts.push(`[%eval ${score}${comment.evaluation.depth ? `,${comment.evaluation.depth}` : ""}]`);
  }
  if (comment.clock !== undefined) parts.push(`[%clk ${formatPgnClock(comment.clock)}]`);
  if (comment.emt !== undefined) parts.push(`[%emt ${formatPgnClock(comment.emt)}]`);

  return parts.join(" ").trim();
}

function moveNumberToken(node: LichessPgnNode, force: boolean) {
  const parts = String(node.fenBefore || "").split(/\s+/);
  const fullMove = parts[5] && /^\d+$/.test(parts[5]) ? parts[5] : "1";
  if (parts[1] !== "b") return `${fullMove}.`;
  return force ? `${fullMove}...` : "";
}

function writeMoveTokens(siblings: LichessPgnNode[], tokens: string[], forceNumber: boolean) {
  let current = siblings;
  let force = forceNumber;

  while (current.length) {
    const node = current[0];
    if (node.invalid) return;

    node.startingComments.forEach((comment) => {
      const text = serializeComment(comment);
      if (!text) return;
      tokens.push(`{ ${text} }`);
      force = true;
    });

    const numberToken = moveNumberToken(node, force);
    tokens.push(numberToken ? `${numberToken} ${node.san}` : node.san);
    force = false;

    node.nags.forEach((nag) => {
      tokens.push(`$${nag}`);
      force = true;
    });
    node.comments.forEach((comment) => {
      const text = serializeComment(comment);
      if (!text) return;
      tokens.push(`{ ${text} }`);
      force = true;
    });

    current.slice(1).forEach((alternative) => {
      tokens.push("(");
      writeMoveTokens([alternative], tokens, true);
      tokens.push(")");
      force = true;
    });

    current = node.children;
  }
}

function mergeParenTokens(tokens: string[]) {
  const merged: string[] = [];
  tokens.forEach((token) => {
    const last = merged[merged.length - 1];
    if (token === ")") {
      if (merged.length) merged[merged.length - 1] = `${last})`;
      else merged.push(")");
      return;
    }
    if (last?.endsWith("(")) {
      merged[merged.length - 1] = `${last}${token}`;
      return;
    }
    merged.push(token);
  });
  return merged;
}

function wrapTokens(tokens: string[], width = 80) {
  const lines: string[] = [];
  let line = "";
  tokens.forEach((token) => {
    if (!line) {
      line = token;
      return;
    }
    if (line.length + 1 + token.length > width) {
      lines.push(line);
      line = token;
      return;
    }
    line += ` ${token}`;
  });
  if (line) lines.push(line);
  return lines;
}

export function serializePgnTree(tree: LichessPgnTree) {
  const headerLines = Object.entries(tree.headers)
    .filter(([key]) => key !== "FEN" && key !== "SetUp")
    .map(([key, value]) => `[${key} "${escapeHeaderValue(value)}"]`);

  const normalizedStart = normalizePermissiveFen(tree.initialFen) || tree.initialFen;
  if (normalizedStart !== chessStartFen) headerLines.push('[SetUp "1"]', `[FEN "${normalizedStart}"]`);

  const tokens: string[] = [];
  tree.comments.forEach((comment) => {
    const text = serializeComment(comment);
    if (text) tokens.push(`{ ${text} }`);
  });
  writeMoveTokens(tree.children, tokens, true);
  tokens.push(tree.headers.Result || "*");

  const movetext = wrapTokens(mergeParenTokens(tokens)).join("\n");
  return `${headerLines.join("\n")}${headerLines.length ? "\n\n" : ""}${movetext}\n`;
}
