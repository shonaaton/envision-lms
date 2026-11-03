"use client";

import { useState } from "react";

/** The weekly time-block slider. A planning aid, so the copy never promises an outcome. */
export default function ScreenTimePlanner() {
  const [minutes, setMinutes] = useState(30);
  const hours = (minutes * 7) / 60;
  const weekly = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  const note =
    minutes <= 30
      ? "A small, repeatable block of time can help establish a regular learning habit."
      : minutes <= 60
        ? "A consistent daily window can make room for practice, reading, outdoor play and other activities."
        : "A larger time window gives families flexibility. Keep a healthy balance with sleep, movement, schoolwork and offline play.";
  // Fills the track up to the thumb; the native range has no cross-browser way to do it.
  const fill = ((minutes - 10) / (120 - 10)) * 100;

  return (
    <div className="interactive">
      <div className="range-row">
        <label htmlFor="bfd-minutes">Time you would like to set aside each day</label>
        <output htmlFor="bfd-minutes">{minutes} min</output>
      </div>
      <input
        id="bfd-minutes"
        type="range"
        min={10}
        max={120}
        step={5}
        value={minutes}
        onChange={(event) => setMinutes(Number(event.target.value))}
        style={{ "--fill": `${fill}%` } as React.CSSProperties}
      />
      <div className="range-labels">
        <span>10 min</span>
        <span>60 min</span>
        <span>120 min</span>
      </div>
      <div className="insight" aria-live="polite">
        {/* Keyed on the value so the number pops each time it changes. */}
        <strong key={weekly}>{weekly} hours across a week</strong>
        <span>{note}</span>
      </div>
    </div>
  );
}
