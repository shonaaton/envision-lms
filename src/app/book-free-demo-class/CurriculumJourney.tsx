"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, type CSSProperties } from "react";

export type JourneyStage = {
  id: string;
  icon: string;
  name: string;
  /** The board square the stage sits on. The pawn starts on e2, opens with the double step to e4, and promotes on e8. */
  square: string;
  /** The stage's place on the road, in the academy's own words ("Start playing tournaments"). */
  goal: string;
  milestone: string;
  outcome: string;
  syllabusHref?: string;
  levels: { name: string; sessions: number; topics: string[]; more: number }[];
};

/**
 * The curriculum as one file of a chessboard. Each stage stands on a square
 * from e2 upwards, a pawn token walks the file as the reader scrolls, and on
 * the last rank it promotes: the FIDE-rated player the ladder is built for.
 *
 * Everything is server-rendered and readable without JavaScript; the effect
 * only moves the token and lights the squares it has passed. Level topics use
 * <details>, so they open with no script at all.
 */
export default function CurriculumJourney({
  stages,
  demoHref,
}: {
  stages: JourneyStage[];
  demoHref: string;
}) {
  const climbRef = useRef<HTMLDivElement>(null);
  const pawnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const climb = climbRef.current;
    const pawn = pawnRef.current;
    if (!climb || !pawn) return;
    const rungs = Array.from(
      climb.querySelectorAll<HTMLElement>("[data-rung]"),
    );
    let frame = 0;

    const update = () => {
      frame = 0;
      const centres = rungs.map(
        (rung) => rung.offsetTop + rung.offsetHeight / 2,
      );
      // The token follows a line a little above the middle of the screen.
      const anchor =
        window.innerHeight * 0.55 - climb.getBoundingClientRect().top;
      const y = Math.max(
        centres[0],
        Math.min(centres[centres.length - 1], anchor),
      );
      pawn.style.transform = `translate(-50%, ${y - pawn.offsetHeight / 2}px)`;
      rungs.forEach((rung, index) =>
        rung.classList.toggle("reached", centres[index] <= y + 24),
      );
      climb.classList.toggle("promoted", y >= centres[centres.length - 1] - 24);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    climb.classList.add("live");
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // Opening a level's topics changes the rung heights under the token.
    climb.addEventListener("toggle", schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      climb.removeEventListener("toggle", schedule, true);
    };
  }, []);

  return (
    <div className="climb" ref={climbRef}>
      <div className="climb-pawn" ref={pawnRef} aria-hidden="true">
        <span className="as-pawn">♟&#xFE0E;</span>
        <span className="as-queen">♛</span>
      </div>
      <ol className="climb-list">
        {stages.map((stage, index) => (
          <Fragment key={stage.id}>
            {/* From e2 the pawn opens with the double step, so e3 is passed over rather than stood on. */}
            {stage.square === "e4" ? (
              <li className="rung skip" aria-hidden="true">
                <div className="rung-square dark">
                  <span>e3</span>
                </div>
                <div className="skip-note">1. e4 · two squares at once</div>
              </li>
            ) : null}
            <li className={`rung ${index % 2 ? "right" : "left"}`} data-rung>
              <div
                className={`rung-square ${Number(stage.square.slice(1)) % 2 ? "dark" : "light"}`}
                aria-hidden="true"
              >
                <span>{stage.square}</span>
              </div>
              <article className="rung-card">
                <div className="rung-top">
                  <span className="rung-no">
                    Stage {String(index + 1).padStart(2, "0")} ·{" "}
                    <i>{stage.square}</i>
                  </span>
                  <span className="rung-tag">{stage.milestone}</span>
                </div>
                <h3>
                  <span className="rung-icon" aria-hidden="true">
                    {stage.icon}
                  </span>
                  {stage.name}
                </h3>
                <p className="rung-goal">
                  <mark>{stage.goal}</mark>
                </p>
                <p className="rung-outcome">{stage.outcome}</p>
                <div className="rung-levels">
                  {stage.levels.map((level) => (
                    <details key={level.name}>
                      <summary>
                        <b>{level.name}</b>
                        <small>{level.sessions} sessions</small>
                      </summary>
                      <ul>
                        {level.topics.map((topic, topicIndex) => (
                          <li
                            key={topic}
                            style={{ "--t": topicIndex } as CSSProperties}
                          >
                            {topic}
                          </li>
                        ))}
                        {level.more ? (
                          <li className="more">+{level.more} more</li>
                        ) : null}
                      </ul>
                    </details>
                  ))}
                </div>
                {stage.syllabusHref ? (
                  <Link className="rung-link" href={stage.syllabusHref}>
                    Full {stage.name} syllabus →
                  </Link>
                ) : null}
              </article>
            </li>
          </Fragment>
        ))}

        <li className="rung promotion">
          {/* The token stops on the square itself, not halfway down the finish card. */}
          <div className="rung-square crown" aria-hidden="true" data-rung>
            <span>e8</span>
          </div>
          <div className="promo-card">
            <div className="promo-burst" aria-hidden="true">
              ♛
            </div>
            <div className="eyebrow">
            <i>e8</i> = ♛ · Promotion
          </div>
            <h3>FIDE glory</h3>
            <p>
              A rated player, still climbing. Every stage before this one is a
              step up the board.
            </p>
            <Link className="btn shine" href={demoHref}>
              Make the first move: book a free demo
            </Link>
          </div>
        </li>
      </ol>
    </div>
  );
}
