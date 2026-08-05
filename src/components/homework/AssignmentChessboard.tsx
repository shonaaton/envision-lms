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
  viewportHeightOffset?: number;
};

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
  position,
  ...boardProps
}: AssignmentChessboardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function measure() {
      const availableWidth = container?.clientWidth || 0;
      const availableHeight = viewportHeightOffset
        ? Math.max(160, window.innerHeight - viewportHeightOffset)
        : maxWidth;
      setBoardWidth(Math.max(0, Math.floor(Math.min(maxWidth, availableWidth - coordinateGutter, availableHeight))));
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [maxWidth, viewportHeightOffset]);

  const sideToMove = positionSideToMove(position);
  const resolvedOrientation = boardOrientation || sideToMove || "white";
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
