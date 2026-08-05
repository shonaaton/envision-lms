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
};

export default function AssignmentChessboard({
  maxWidth,
  boardOrientation = "white",
  coordinatesClassName = "text-slate-600",
  ...boardProps
}: AssignmentChessboardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function measure() {
      const availableWidth = container?.clientWidth || 0;
      setBoardWidth(Math.max(0, Math.floor(Math.min(maxWidth, availableWidth - coordinateGutter))));
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [maxWidth]);

  const files = boardOrientation === "black" ? [...whiteFiles].reverse() : whiteFiles;
  const ranks = boardOrientation === "black" ? [...whiteRanks].reverse() : whiteRanks;
  return (
    <div
      ref={containerRef}
      data-assignment-chessboard
      className="w-full"
      style={{ maxWidth: maxWidth + coordinateGutter }}
    >
      {boardWidth > 0 ? (
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
              boardOrientation={boardOrientation}
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
      ) : (
        <div aria-hidden="true" className="aspect-square w-full" />
      )}
    </div>
  );
}
