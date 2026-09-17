import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Home } from "lucide-react";
import RelatedLinks from "@/components/marketing/RelatedLinks";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import {
  centreHubLink,
  centreLinks,
  contactLink,
  courseHubLink,
  courseLinks,
  demoLink,
  successStoriesLink,
} from "@/lib/internalLinks";

export const metadata: Metadata = {
  title: "Page Not Found | Envision Chess Academy",
  description: "That page is off the board. Find our chess courses, Kolkata centres and free demo class here.",
  // A 404 body should never be indexed in its own right. Next already sends the
  // 404 status, which is what actually keeps it out; this is the belt to that
  // pair of braces. `follow` stays on so the links below still pass a crawler
  // through to the pages that do exist.
  robots: { index: false, follow: true },
};

/**
 * The 404 page.
 *
 * This is not decoration. The Wix site this app replaced had about 130 URLs and
 * roughly a hundred of them - the whole blog - have no successor here, so they
 * are left to 404 on purpose rather than redirected into a soft 404. Google will
 * drop them over the next few weeks, but in the meantime every one of those
 * results is a real person arriving on a dead link. Landing them on the bare
 * Next.js 404 wastes the visit; the two link blocks below are the actual point
 * of the page.
 *
 * The board is inline SVG rather than an image so it scales with the viewBox and
 * costs no request. The knight is the `♞` glyph, which is how every other
 * board in this codebase draws pieces - see `components/pgn/MiniFenBoard`.
 */

const CELL = 64;
const BOARD_ORIGIN = 4;

/** The 4x4 board, as squares. The knight stands on the bottom-right one. */
const squares = Array.from({ length: 16 }, (_, index) => {
  const row = Math.floor(index / 4);
  const column = index % 4;
  return {
    key: index,
    x: BOARD_ORIGIN + column * CELL,
    y: BOARD_ORIGIN + row * CELL,
    light: (row + column) % 2 === 0,
  };
});

function OffTheBoard() {
  return (
    <svg
      viewBox="0 0 344 272"
      className="h-auto w-full max-w-[380px]"
      role="img"
      aria-label="A chess knight on the corner of a board, its L-shaped move landing on a dashed square outside the board marked 404."
    >
      {squares.map((square) => (
        <rect
          key={square.key}
          x={square.x}
          y={square.y}
          width={CELL}
          height={CELL}
          fill={square.light ? "#f5edf8" : "#d0a8e1"}
        />
      ))}
      <rect
        x={BOARD_ORIGIN}
        y={BOARD_ORIGIN}
        width={CELL * 4}
        height={CELL * 4}
        fill="none"
        stroke="#5a1372"
        strokeOpacity="0.28"
        strokeWidth="2"
      />

      <defs>
        <marker id="knight-move-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#5a1372" />
        </marker>
      </defs>

      {/* Two squares up, one across - a legal knight move that happens to leave the board. */}
      <path
        d="M 228 206 L 228 100 L 260 100"
        fill="none"
        stroke="#5a1372"
        strokeWidth="3.5"
        strokeDasharray="8 8"
        strokeLinecap="round"
        markerEnd="url(#knight-move-arrow)"
      />

      <text x="228" y="228" textAnchor="middle" dominantBaseline="central" fontSize="54" fill="#5a1372">
        {"♞"}
      </text>

      <g className="motion-float">
        <rect x="270" y="68" width={CELL} height={CELL} rx="10" fill="#fffbe5" stroke="#5a1372" strokeWidth="3.5" strokeDasharray="9 8" />
        <text
          x="302"
          y="101"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="21"
          fontWeight="800"
          fill="#5a1372"
        >
          404
        </text>
      </g>
    </svg>
  );
}

export default function NotFound() {
  return (
    <>
      <MarketingHeader demoHref="/register" />

      <main>
        <section className="bg-white px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">
                Error 404
              </p>

              <h1 className="mt-5 text-4xl font-black leading-[1.05] text-brand-900 sm:text-5xl lg:text-6xl">
                This square is <span className="text-brand">off the board</span>.
              </h1>

              <p className="mt-5 max-w-xl text-base leading-7 text-brand-900/70">
                The knight moved in an L. This page moved out of the building. Whatever you were
                looking for either lives somewhere else now or never existed at all - and either
                way, it is not this square.
              </p>

              <p className="mt-3 max-w-xl text-base leading-7 text-brand-900/70">
                Nothing to resign over. Even a grandmaster blunders roughly once a game.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-black text-white shadow-sm shadow-brand-900/20 transition hover:-translate-y-0.5 hover:bg-brand-400"
                >
                  <Home size={16} />
                  Back to the home page
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-black text-brand-900 shadow-sm shadow-brand-900/10 transition hover:-translate-y-0.5 hover:bg-accent-300"
                >
                  Book a free demo class
                  <ArrowRight size={16} />
                </Link>
              </div>

              {/* The single most likely reason somebody is standing here. */}
              <p className="mt-8 max-w-xl rounded-xl border border-brand/10 bg-brand-50 px-4 py-3 text-sm leading-6 text-brand-900/75">
                <span className="font-black text-brand-900">Followed a link to one of our old blog posts?</span>{" "}
                Those came down when we rebuilt the site. The coaching itself is all still here -
                the course ladder and the Kolkata centres are below.
              </p>
            </div>

            <div className="flex justify-center lg:justify-end">
              <OffTheBoard />
            </div>
          </div>
        </section>

        <RelatedLinks
          eyebrow="Online coaching"
          heading="Where you were probably headed"
          intro="Five stages, fifteen levels and 240 live sessions, from a first legal move to tournament preparation."
          links={[demoLink, courseHubLink, ...courseLinks()]}
          columns={3}
        />

        <RelatedLinks
          eyebrow="In Kolkata"
          heading="Or learn over the board, in person"
          intro="Four centres across Kolkata, each with its own batch timings, coaches and contact number."
          links={[centreHubLink, ...centreLinks(), successStoriesLink, contactLink]}
          columns={3}
          tone="slate"
        />
      </main>

      <MarketingFooter />
    </>
  );
}
