"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ComponentProps } from "react";

const Chessboard = dynamic(() => import("react-chessboard").then((module) => module.Chessboard), { ssr: false });

const coordinateGutter = 18;
const whiteFiles = ["a", "b", "c", "d", "e", "f", "g", "h"];
const whiteRanks = ["8", "7", "6", "5", "4", "3", "2", "1"];
type ChessboardProps = ComponentProps<(typeof import("react-chessboard"))["Chessboard"]>;

type AssignmentChessboardProps = Omit<ChessboardProps, "boardWidth" | "showBoardNotation"> & {
  maxWidth: number;
  coordinatesClassName?: string;
  /** Fixed number of pixels to keep free below the viewport top. Prefer viewportBottomReserve. */
  viewportHeightOffset?: number;
  /**
   * Pixels to keep free *below* the board (buttons, panel padding). The space above is
   * measured from where the board actually sits, so the fit survives a header that wraps
   * on a phone or a different breakpoint's padding, which a fixed offset cannot.
   */
  viewportBottomReserve?: number;
  /** The built-in "White to move" bar. Off for positions where nobody is to move. */
  showSideToMove?: boolean;
};

const sideToMoveBarHeight = 34;

/**
 * Distance from the top of the scrollable content to this element, i.e. what
 * getBoundingClientRect would report with everything scrolled to the top. Measuring the
 * raw rect would grow the board every time someone resized the window mid-scroll.
 */
function unscrolledTop(element: HTMLElement) {
  let offset = element.getBoundingClientRect().top + window.scrollY;
  let node = element.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    offset += node.scrollTop;
    node = node.parentElement;
  }
  return offset;
}

function positionSideToMove(position: ChessboardProps["position"]): "white" | "black" | null {
  if (position === "start") return "white";
  if (typeof position !== "string") return null;
  const activeColor = position.trim().split(/\s+/)[1];
  if (activeColor === "b") return "black";
  if (activeColor === "w") return "white";
  return null;
}

export default function AssignmentChessboard({
  maxWidth,
  boardOrientation,
  coordinatesClassName = "text-slate-600",
  viewportHeightOffset,
  viewportBottomReserve,
  showSideToMove = true,
  position,
  ...boardProps
}: AssignmentChessboardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState(0);

  // Orientation still follows the position even when the bar itself is hidden.
  const positionSide = positionSideToMove(position);
  const sideToMove = showSideToMove ? positionSide : null;
  // The squares are not the whole component: the coordinate row sits under them and the
  // to-move bar above, so both have to come out of the height budget.
  const selfChrome = coordinateGutter + (sideToMove ? sideToMoveBarHeight : 0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function measure() {
      if (!container) return;
      const availableWidth = container.clientWidth || 0;
      let availableHeight: number;
      if (typeof viewportBottomReserve === "number") {
        availableHeight = window.innerHeight - unscrolledTop(container) - viewportBottomReserve - selfChrome;
      } else if (viewportHeightOffset) {
        // Left exactly as it was: the homework board is tuned to this number and is not
        // what this change is about.
        availableHeight = window.innerHeight - viewportHeightOffset;
      } else {
        availableHeight = maxWidth;
      }
      // A board below this is unusable on any device, so let the page scroll instead.
      availableHeight = Math.max(240, availableHeight);
      setBoardWidth(Math.max(0, Math.floor(Math.min(maxWidth, availableWidth - coordinateGutter, availableHeight))));
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [maxWidth, viewportHeightOffset, viewportBottomReserve, selfChrome]);

  const resolvedOrientation = boardOrientation || positionSide || "white";
  const files = resolvedOrientation === "black" ? [...whiteFiles].reverse() : whiteFiles;
  const ranks = resolvedOrientation === "black" ? [...whiteRanks].reverse() : whiteRanks;
  return (
    <div
      ref={containerRef}
      data-assignment-chessboard
      className="w-full"
      style={{ maxWidth: maxWidth + coordinateGutter }}
    >
      {boardWidth > 0 ? (
        <>
          {sideToMove ? (
            <div
              className="mb-1.5 flex h-7 items-center justify-center rounded-md border border-slate-200 bg-white/95 px-2 text-xs font-bold text-slate-800 shadow-sm"
              style={{ marginLeft: coordinateGutter, width: boardWidth }}
              data-side-to-move={sideToMove}
              aria-live="polite"
            >
              <span
                aria-hidden="true"
                className={`mr-2 h-2.5 w-2.5 rounded-full border ${sideToMove === "black" ? "border-slate-900 bg-slate-900" : "border-slate-400 bg-white"}`}
              />
              {sideToMove === "black" ? "Black to move" : "White to move"}
            </div>
          ) : null}
          <div
            className="grid"
            style={{
              gridTemplateColumns: `${coordinateGutter}px ${boardWidth}px`,
              gridTemplateRows: `${boardWidth}px ${coordinateGutter}px`,
              width: boardWidth + coordinateGutter,
            }}
          >
            <div aria-hidden="true" className={`grid grid-rows-8 select-none ${coordinatesClassName}`}>
              {ranks.map((rank) => (
                <span key={rank} className="grid place-items-center text-[10px] font-bold leading-none sm:text-[11px]">
                  {rank}
                </span>
              ))}
            </div>

            <div className="overflow-hidden rounded-md">
              <Chessboard
                {...boardProps}
                position={position}
                boardOrientation={resolvedOrientation}
                boardWidth={boardWidth}
                showBoardNotation={false}
              />
            </div>

            <div aria-hidden="true" className={`col-start-2 grid grid-cols-8 select-none ${coordinatesClassName}`}>
              {files.map((file) => (
                <span key={file} className="grid place-items-center text-[10px] font-bold leading-none sm:text-[11px]">
                  {file}
                </span>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div aria-hidden="true" className="aspect-square w-full" />
      )}
    </div>
  );
}
