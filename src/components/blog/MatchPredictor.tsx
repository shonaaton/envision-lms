"use client";

import { useId, useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { matchOdds } from "@/lib/blog/matchOdds";
import type { MatchPredictorBlock } from "@/lib/blog/types";

const pct = (value: number) => `${Math.round(value * 100)}%`;

function formatScore(aPoints: number, games: number) {
  const half = (value: number) => `${Math.floor(value)}${value % 1 ? "½" : ""}`.replace(/^0½$/, "½");
  return `${half(aPoints)}–${half(games - aPoints)}`;
}

/**
 * Per-game chances in, match chances out. The maths runs in the browser on
 * every slider move; it is a 14-step sum, so there is nothing to debounce.
 */
export default function MatchPredictor({ block }: { block: MatchPredictorBlock }) {
  const id = useId();
  const [nameA, nameB] = block.players;
  const first = block.presets[0];
  const [aWin, setAWin] = useState(first?.aWin ?? 20);
  const [bWin, setBWin] = useState(first?.bWin ?? 20);
  const [tiebreakA, setTiebreakA] = useState(50);
  const [presetIndex, setPresetIndex] = useState<number | null>(first ? 0 : null);

  const draw = Math.max(0, 100 - aWin - bWin);
  const odds = useMemo(
    () => matchOdds(aWin / 100, bWin / 100, { games: block.games, tiebreakA: tiebreakA / 100 }),
    [aWin, bWin, tiebreakA, block.games],
  );
  const likely = odds.scores[0];

  // The two win chances share 100% with the draw, so moving one past the
  // limit pulls the other down rather than letting the sum go over.
  const changeA = (value: number) => {
    setAWin(value);
    if (value + bWin > 100) setBWin(100 - value);
    setPresetIndex(null);
  };
  const changeB = (value: number) => {
    setBWin(value);
    if (value + aWin > 100) setAWin(100 - value);
    setPresetIndex(null);
  };

  return (
    <section aria-labelledby={`${id}-title`} className="mt-8 rounded-2xl border-2 border-brand/15 bg-brand-50/60 p-5 sm:p-6">
      <p id={`${id}-title`} className="flex items-center gap-2 text-lg font-black leading-snug text-brand-900">
        <Calculator size={19} className="text-brand" /> {block.heading}
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Start from a prediction">
        {block.presets.map((preset, index) => (
          <button
            key={preset.label}
            type="button"
            aria-pressed={presetIndex === index}
            onClick={() => {
              setAWin(preset.aWin);
              setBWin(preset.bWin);
              setPresetIndex(index);
            }}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-extrabold transition ${
              presetIndex === index ? "border-brand bg-brand text-white" : "border-brand/25 bg-white text-brand-900 hover:border-brand"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {presetIndex !== null && block.presets[presetIndex] ? (
        <p className="mt-2 text-sm leading-6 text-brand-900/70">{block.presets[presetIndex].note}</p>
      ) : (
        <p className="mt-2 text-sm leading-6 text-brand-900/70">Your own prediction. Pick a button above to go back to one of ours.</p>
      )}

      <div className="mt-5 grid gap-4">
        <Slider id={`${id}-a`} label={`${nameA} wins a game`} value={aWin} onChange={changeA} />
        <Slider id={`${id}-b`} label={`${nameB} wins a game`} value={bWin} onChange={changeB} />
        <p className="text-sm font-bold text-brand-900/70">
          Draw in a game: <span className="font-black text-brand-900">{draw}%</span>
        </p>
        <Slider id={`${id}-tb`} label={`${nameA} wins the tiebreak, if it comes to that`} value={tiebreakA} onChange={setTiebreakA} />
      </div>

      <div className="mt-6 rounded-xl bg-white p-4 shadow-sm shadow-brand-900/5" aria-live="polite">
        <div className="flex items-end justify-between gap-3 text-sm font-black text-brand-900">
          <span>{nameA} <span className="block text-3xl leading-none text-brand">{pct(odds.a)}</span></span>
          <span className="text-right">{nameB} <span className="block text-3xl leading-none text-brand-900">{pct(odds.b)}</span></span>
        </div>
        <div className="mt-3 flex h-4 overflow-hidden rounded-full bg-brand-100" role="img" aria-label={`${nameA} ${pct(odds.a)}, ${nameB} ${pct(odds.b)} to win the match`}>
          <div className="bg-brand transition-[width] duration-300" style={{ width: `${odds.a * 100}%` }} />
          <div className="bg-accent transition-[width] duration-300" style={{ width: `${odds.b * 100}%` }} />
        </div>
        <ul className="mt-3 space-y-1 text-sm leading-6 text-brand-900/75">
          <li>Chance the {block.games} classical games end level and go to tiebreaks: <strong className="font-black text-brand-900">{pct(odds.tiebreak)}</strong></li>
          {likely ? (
            <li>
              Most likely final classical score: <strong className="font-black text-brand-900">{formatScore(likely.aPoints, block.games)}</strong> ({nameA} first), at {pct(likely.chance)}
            </li>
          ) : null}
        </ul>
      </div>
      <p className="mt-3 text-xs leading-5 text-brand-900/55">
        A simple model: every game has the same chances, whoever has white. It counts all {block.games} games; a match that is decided early ends the same way.
      </p>
    </section>
  );
}

function Slider({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <label htmlFor={id} className="flex items-center justify-between text-sm font-bold text-brand-900">
        {label} <span className="font-black text-brand">{value}%</span>
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1.5 w-full accent-[#5a1372]"
      />
    </div>
  );
}
