"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { computeBoardSize } from "@/lib/tournament/boardLayout";

/**
 * Size the board from the space actually left over, not from a guess.
 *
 * The width budget is the column's, which never depends on the board, and the
 * chrome is what sits between the column's top and the board plus what sits
 * between the board and `footerRef` — the two player bars, the status line, the
 * controls. Those heights do not depend on the board either, so measuring can
 * never feed back into itself.
 *
 * Only what must stay on screen with the board counts. On narrow screens the
 * moves, standings and boards panels stack below in the same column; counting
 * them as chrome shrank the phone board to its minimum. Without a footer the
 * column's bottom is used.
 *
 * `boardColumnStyle` sizes the column's children to the board and centres them,
 * so the board, its bars and its controls read as one block rather than a small
 * board adrift in a full-width square.
 */
export function useBoardSizing() {
  const columnRef = useRef<HTMLDivElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState(360);

  const measure = () => {
    const column = columnRef.current;
    const area = areaRef.current;
    if (!column || !area) return;

    const columnRect = column.getBoundingClientRect();
    const areaRect = area.getBoundingClientRect();
    const footerRect = footerRef.current?.getBoundingClientRect();
    const above = Math.max(0, areaRect.top - columnRect.top);
    const below = Math.max(0, (footerRect ? footerRect.bottom : columnRect.bottom) - areaRect.bottom);
    // Whatever sits above the column on the page, plus the must-see chrome.
    const chromeHeight = Math.max(0, columnRect.top) + above + below + 16;

    setSize(
      computeBoardSize({
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        containerWidth: columnRect.width,
        chromeHeight,
      })
    );
  };

  useLayoutEffect(() => {
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const observer = new ResizeObserver(() => measure());
    if (columnRef.current) observer.observe(columnRef.current);
    if (areaRef.current) observer.observe(areaRef.current);
    if (footerRef.current) observer.observe(footerRef.current);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const boardColumnStyle = { "--board-size": `${size}px` } as React.CSSProperties;
  return { columnRef, areaRef, footerRef, size, boardColumnStyle, remeasure: measure };
}
