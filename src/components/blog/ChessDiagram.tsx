import type { DiagramBlock } from "@/lib/blog/types";
import { parsePlacement, pieceKey, squareCoords } from "@/lib/blog/fen";
import { PIECE_SVG } from "@/components/blog/pieceSvg";

const SQ = 45;
const LIGHT = "#f0d9b5";
const DARK = "#b58863";

/**
 * A chess diagram rendered on the server as inline SVG.
 *
 * Diagrams used to mean screenshots, which arrive as an image with no text a
 * crawler can read and go stale the moment the board style changes. This one
 * is in the HTML itself: `role="img"` plus the author's alt text describe it,
 * the caption is a real `<figcaption>`, and there is no file to forget to
 * compress. It has no client JavaScript.
 */
export default function ChessDiagram({ diagram }: { diagram: DiagramBlock }) {
  return (
    <figure className="my-8">
      <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-xl border border-brand/15 shadow-lg shadow-brand-900/10">
        <BoardSvg diagram={diagram} />
      </div>
      <figcaption className="mx-auto mt-3 max-w-[420px] text-center text-xs leading-5 text-brand-900/65">{diagram.caption}</figcaption>
    </figure>
  );
}

/**
 * The board alone. `decorative` is for card thumbnails, where the post title
 * beside it already says what it is, so the board is hidden from screen readers
 * instead of announcing a second, longer description.
 */
export function BoardSvg({ diagram, decorative = false, className = "" }: { diagram: Pick<DiagramBlock, "fen" | "alt" | "highlight" | "dots" | "arrows" | "flipped">; decorative?: boolean; className?: string }) {
  const board = parsePlacement(diagram.fen);
  const flipped = Boolean(diagram.flipped);

  /** Top-left pixel of a square, in board space. */
  const origin = (square: string) => {
    const coords = squareCoords(square);
    if (!coords) return null;
    const [file, rank] = coords;
    const col = flipped ? 7 - file : file;
    const row = flipped ? rank : 7 - rank;
    return { x: col * SQ, y: row * SQ };
  };
  const centre = (square: string) => {
    const at = origin(square);
    return at ? { x: at.x + SQ / 2, y: at.y + SQ / 2 } : null;
  };

  const squares = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      squares.push(<rect key={`${row}-${col}`} x={col * SQ} y={row * SQ} width={SQ} height={SQ} fill={(row + col) % 2 === 0 ? LIGHT : DARK} />);
    }
  }

  const files = flipped ? "hgfedcba" : "abcdefgh";
  const ranks = flipped ? "12345678" : "87654321";

  return (
    <svg
      viewBox={`0 0 ${SQ * 8} ${SQ * 8}`}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": diagram.alt })}
      className={`block h-auto w-full ${className}`}
    >
      {decorative ? null : <title>{diagram.alt}</title>}
      {squares}

      {(diagram.highlight ?? []).map((square) => {
        const at = origin(square);
        return at ? <rect key={`h-${square}`} x={at.x} y={at.y} width={SQ} height={SQ} fill="#fde75a" opacity={0.55} /> : null;
      })}

      {/* Coordinates inside the edge squares, the way a printed diagram has them. */}
      {Array.from(files).map((file, col) => (
        <text key={`f-${file}`} x={col * SQ + SQ - 4} y={SQ * 8 - 3} textAnchor="end" fontSize="9" fontWeight="700" fill={col % 2 === 0 ? LIGHT : DARK} fontFamily="system-ui, sans-serif">
          {file}
        </text>
      ))}
      {Array.from(ranks).map((rank, row) => (
        <text key={`r-${rank}`} x={3} y={row * SQ + 11} fontSize="9" fontWeight="700" fill={row % 2 === 0 ? DARK : LIGHT} fontFamily="system-ui, sans-serif">
          {rank}
        </text>
      ))}

      {Array.from(board.entries()).map(([square, piece]) => {
        const at = origin(square);
        const art = PIECE_SVG[pieceKey(piece)];
        if (!at || !art) return null;
        return <g key={`p-${square}`} transform={`translate(${at.x} ${at.y})`} dangerouslySetInnerHTML={{ __html: art }} />;
      })}

      {(diagram.dots ?? []).map((square) => {
        const at = centre(square);
        if (!at) return null;
        return board.has(square) ? (
          <circle key={`d-${square}`} cx={at.x} cy={at.y} r={SQ / 2 - 3} fill="none" stroke="#5a1372" strokeWidth={3} opacity={0.75} />
        ) : (
          <circle key={`d-${square}`} cx={at.x} cy={at.y} r={7} fill="#5a1372" opacity={0.6} />
        );
      })}

      {(diagram.arrows ?? []).map((arrow) => {
        const from = centre(arrow.slice(0, 2));
        const to = centre(arrow.slice(2, 4));
        if (!from || !to) return null;
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const head = 13;
        // Stop the shaft short of the head so the tip stays sharp.
        const shaftEnd = { x: to.x - Math.cos(angle) * head * 0.8, y: to.y - Math.sin(angle) * head * 0.8 };
        const left = { x: to.x - Math.cos(angle - 0.5) * head, y: to.y - Math.sin(angle - 0.5) * head };
        const right = { x: to.x - Math.cos(angle + 0.5) * head, y: to.y - Math.sin(angle + 0.5) * head };
        return (
          <g key={`a-${arrow}`} opacity={0.82}>
            <line x1={from.x} y1={from.y} x2={shaftEnd.x} y2={shaftEnd.y} stroke="#15803d" strokeWidth={6} strokeLinecap="round" />
            <polygon points={`${to.x},${to.y} ${left.x},${left.y} ${right.x},${right.y}`} fill="#15803d" />
          </g>
        );
      })}
    </svg>
  );
}
