"use client";

import { Fragment } from "react";

/**
 * Renders the three marks opening text may use (see lib/openings/types.ts):
 * **bold**, {Nf3} as a move chip, and [f7] as a square chip that lights the
 * square on the board while hovered or focused.
 */
const TOKEN = /(\*\*[^*]+\*\*|\{[^}]+\}|\[[a-h][1-8]\])/g;

export default function RichText({
  text,
  onSquareHover,
  className = "",
}: {
  text: string;
  onSquareHover?: (square: string | null) => void;
  className?: string;
}) {
  const paragraphs = text.split(/\n\s*\n/).filter((paragraph) => paragraph.trim());
  return (
    <div className={`space-y-3 ${className}`}>
      {paragraphs.map((paragraph, index) => (
        <p key={index}>
          {paragraph.split(TOKEN).map((part, partIndex) => {
            if (!part) return null;
            if (part.startsWith("**") && part.endsWith("**")) {
              return (
                <strong key={partIndex} className="font-bold text-slate-950">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            if (part.startsWith("{") && part.endsWith("}")) {
              return (
                <span key={partIndex} className="mx-0.5 inline-flex rounded-md bg-brand-50 px-1.5 py-px font-mono text-[0.92em] font-bold text-brand">
                  {part.slice(1, -1)}
                </span>
              );
            }
            if (/^\[[a-h][1-8]\]$/.test(part)) {
              const square = part.slice(1, -1);
              return (
                <button
                  key={partIndex}
                  type="button"
                  onMouseEnter={() => onSquareHover?.(square)}
                  onMouseLeave={() => onSquareHover?.(null)}
                  onFocus={() => onSquareHover?.(square)}
                  onBlur={() => onSquareHover?.(null)}
                  className="mx-0.5 inline-flex rounded-md border border-amber-300 bg-amber-50 px-1.5 py-px font-mono text-[0.92em] font-bold text-amber-800 hover:bg-amber-100"
                >
                  {square}
                </button>
              );
            }
            return <Fragment key={partIndex}>{part}</Fragment>;
          })}
        </p>
      ))}
    </div>
  );
}
