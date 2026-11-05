"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A class already in a coach's week, naming its batch on hover, or on tap and
 * keyboard focus. The label goes on `document.body` because the profile table
 * scrolls sideways and would clip anything positioned inside it.
 */
export function TakenSlotChip({ time, batches }: { time: string; batches: string[] }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const label = `${batches.length > 1 ? "Batches" : "Batch"}: ${batches.join(", ")}`;

  const open = () => {
    const box = ref.current?.getBoundingClientRect();
    if (box) setPosition({ left: box.left + box.width / 2, top: box.top - 6 });
  };
  const close = () => setPosition(null);

  useEffect(() => {
    if (!position) return;
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [position]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={`${time}, taken. ${label}`}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        className="cursor-help whitespace-nowrap rounded bg-slate-200 px-1.5 py-0.5 text-slate-500 line-through decoration-slate-400"
      >
        {time}
      </button>
      {position &&
        createPortal(
          <span
            role="tooltip"
            style={{ left: position.left, top: position.top }}
            className="pointer-events-none fixed z-[70] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white shadow-lg"
          >
            {label}
          </span>,
          document.body,
        )}
    </>
  );
}
