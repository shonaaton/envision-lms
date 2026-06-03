"use client";

const palette = ["#7c3aed", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#6366f1", "#14b8a6"];

export default function Avatar({ name, size = 36 }: { name?: string | null; size?: number }) {
  const initials = (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  // stable color per name
  const hash = Array.from(name || "?").reduce((a, c) => a + c.charCodeAt(0), 0);
  const bg = palette[hash % palette.length];
  return (
    <div
      className="flex items-center justify-center rounded-full font-semibold text-white text-xs"
      style={{ width: size, height: size, background: bg }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
