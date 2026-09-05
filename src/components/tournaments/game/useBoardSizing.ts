"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { computeBoardSize } from "@/lib/tournament/boardLayout";

/**
 * Size the board from the space actually left over, not from a guess.
 *
 * The board is rendered inside a square area whose height never depends on the
 * board, so measuring cannot feed back into itself. Everything else in the
 * column — the two player bars, the status line, the controls — is measured as
 * chrome and subtracted.
 */
export function useBoardSizing() {
  const columnRef = useRef<HTMLDivElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState(360);

  const measure = () => {
    const column = columnRef.current;
    const area = areaRef.current;
    if (!column || !area) return;

    const columnRect = column.getBoundingClientRect();
    const areaRect = area.getBoundingClientRect();
    // Everything in the column that is not the board, plus whatever sits above
    // the column on the page.
    const chromeHeight = Math.max(0, columnRect.height - areaRect.height) + Math.max(0, columnRect.top) + 16;

    setSize(
      computeBoardSize({
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        containerWidth: areaRect.width || columnRect.width,
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
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { columnRef, areaRef, size, remeasure: measure };
}
