"use client";

import Link from "next/link";
import { useRef, useState, type CSSProperties, type KeyboardEvent, type TouchEvent } from "react";

export type JourneyStage = {
  id: string;
  icon: string;
  name: string;
  /** The stage's place on the road, in the academy's own words ("Start playing tournaments"). */
  goal: string;
  audience: string;
  outcome: string;
  syllabusHref?: string;
  levels: { name: string; sessions: number; topics: string[]; more: number }[];
};

/**
 * The five-stage road from first move to a FIDE rating: stage tabs, one
 * detail card, and a progress track that fills up to the chosen stage.
 *
 * Every stage's panel is in the server HTML (inactive ones `hidden`), so the
 * whole syllabus summary is readable without JavaScript and by crawlers.
 */
export default function CurriculumJourney({ stages, demoHref }: { stages: JourneyStage[]; demoHref: string }) {
  const [active, setActive] = useState(0);
  const [level, setLevel] = useState(0);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const touchX = useRef<number | null>(null);

  const go = (index: number, focus = false) => {
    const next = (index + stages.length) % stages.length;
    if (next === active) return;
    setDirection(next > active ? "next" : "prev");
    setActive(next);
    setLevel(0);
    if (focus) tabRefs.current[next]?.focus();
  };

  const onTabKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowRight") go(active + 1, true);
    else if (event.key === "ArrowLeft") go(active - 1, true);
    else return;
    event.preventDefault();
  };

  // A horizontal swipe on the card moves one stage; vertical scrolling is left alone.
  const onTouchStart = (event: TouchEvent) => (touchX.current = event.touches[0].clientX);
  const onTouchEnd = (event: TouchEvent) => {
    if (touchX.current === null) return;
    const delta = event.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(delta) > 60) go(active + (delta < 0 ? 1 : -1));
  };

  // The track has one node per stage plus the trophy; the last stage fills it to the trophy.
  const reached = active === stages.length - 1 ? stages.length : active;
  const progress = (reached / stages.length) * 100;

  return (
    <div className="journey">
      <div className="journey-tabs" role="tablist" aria-label="Curriculum stages" onKeyDown={onTabKey}>
        {stages.map((stage, index) => (
          <button
            key={stage.id}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`journey-tab-${stage.id}`}
            aria-controls={`journey-panel-${stage.id}`}
            aria-selected={index === active}
            tabIndex={index === active ? 0 : -1}
            className={`journey-tab${index === active ? " on" : ""}${index < active ? " done" : ""}`}
            onClick={() => go(index)}
          >
            <span className="jt-icon" aria-hidden="true">
              {stage.icon}
            </span>
            <span className="jt-no">Stage {index + 1}</span>
            <span className="jt-name">{stage.name}</span>
          </button>
        ))}
      </div>

      <div className="journey-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <button type="button" className="journey-arrow prev" aria-label="Previous stage" onClick={() => go(active - 1)}>
          ‹
        </button>
        {stages.map((stage, index) => (
          <article
            key={stage.id}
            id={`journey-panel-${stage.id}`}
            role="tabpanel"
            aria-labelledby={`journey-tab-${stage.id}`}
            hidden={index !== active}
            className={`journey-card ${direction}`}
          >
            <div className="jc-side">
              <div className="jc-icon" aria-hidden="true">
                {stage.icon}
              </div>
              <div className="jc-badge">Stage {index + 1}</div>
              <div className="jc-audience">{stage.audience}</div>
              <div className="jc-outcome">
                <span>◎ Outcome</span>
                <strong>{stage.outcome}</strong>
              </div>
              <Link className="btn jc-cta" href={demoHref}>
                Start with a free demo <span aria-hidden="true">→</span>
              </Link>
            </div>
            <div className="jc-main">
              <h3>
                <span aria-hidden="true">{stage.icon}</span> {stage.name} <em>· {stage.goal}</em>
              </h3>
              <div className="jc-levels" role="group" aria-label={`${stage.name} levels`}>
                {stage.levels.map((item, levelIndex) => (
                  <button
                    key={item.name}
                    type="button"
                    className={levelIndex === level ? "on" : undefined}
                    aria-pressed={levelIndex === level}
                    onClick={() => setLevel(levelIndex)}
                  >
                    {item.name}
                    <small>{item.sessions} sessions</small>
                  </button>
                ))}
              </div>
              <div className="jc-label">Key topics</div>
              {stage.levels.map((item, levelIndex) => (
                <ul key={item.name} className="jc-topics" hidden={levelIndex !== level}>
                  {item.topics.map((topic, topicIndex) => (
                    <li key={topic} style={{ "--t": topicIndex } as CSSProperties}>
                      {topic}
                    </li>
                  ))}
                </ul>
              ))}
              {stage.syllabusHref ? (
                <Link className="jc-more" href={stage.syllabusHref}>
                  {stage.levels[level]?.more ? `+ ${stage.levels[level].more} more sessions · ` : ""}See the full {stage.name}{" "}
                  syllabus →
                </Link>
              ) : null}
            </div>
          </article>
        ))}
        <button type="button" className="journey-arrow next" aria-label="Next stage" onClick={() => go(active + 1)}>
          ›
        </button>
      </div>

      <div className="journey-track" style={{ "--p": `${progress}%` } as CSSProperties}>
        <div className="jtr-line" aria-hidden="true">
          <span />
        </div>
        {stages.map((stage, index) => (
          <button
            key={stage.id}
            type="button"
            className={`jtr-node${index <= active ? " lit" : ""}${index === active ? " on" : ""}`}
            onClick={() => go(index)}
            aria-label={`Go to stage ${index + 1}, ${stage.name}`}
          >
            <span aria-hidden="true">{stage.icon}</span>
            <small>{stage.name}</small>
          </button>
        ))}
        <div className={`jtr-node glory${active === stages.length - 1 ? " lit on" : ""}`} aria-hidden="true">
          <span>🏆</span>
          <small>FIDE glory</small>
        </div>
      </div>
    </div>
  );
}
