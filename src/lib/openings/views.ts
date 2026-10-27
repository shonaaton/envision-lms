import "server-only";
import { Chess } from "chess.js";
import { ecoAt } from "./eco";
import { buildChapterTimeline, type ChapterFrame, type FrameMove } from "./engine";
import type { Opening, OpeningLevel } from "./types";

/**
 * The serialisable shapes pages hand to client components. A card or an
 * overview carries no steps at all; a ChapterView carries exactly one chapter,
 * already replayed and named, so the player never needs the content files or
 * the 450 KB name index.
 */

export type ChapterOutline = { slug: string; title: string; summary: string; preview: boolean; steps: number };

export type OpeningCard = {
  slug: string;
  name: string;
  eco: string[];
  side: "white" | "black";
  level: OpeningLevel;
  tagline: string;
  /** The position after the defining moves, for thumbnails. */
  fen: string;
  chapters: ChapterOutline[];
};

export type OpeningOverview = OpeningCard & { history: string[]; keyIdeas: string[] };

export type ChapterView = {
  opening: { slug: string; name: string; side: "white" | "black" };
  chapter: { slug: string; title: string; summary: string; number: number; total: number; preview: boolean };
  startFen: string;
  setup: FrameMove[];
  frames: ChapterFrame[];
  error?: string;
  prev?: { slug: string; title: string };
  next?: { slug: string; title: string };
};

function definingFen(opening: Opening) {
  const game = new Chess();
  for (const san of opening.definingMoves) game.move(san);
  return game.fen();
}

export function openingCard(opening: Opening): OpeningCard {
  return {
    slug: opening.slug,
    name: opening.name,
    eco: opening.eco,
    side: opening.side,
    level: opening.level,
    tagline: opening.tagline,
    fen: definingFen(opening),
    chapters: opening.chapters.map((chapter) => ({
      slug: chapter.slug,
      title: chapter.title,
      summary: chapter.summary,
      preview: chapter.preview === true,
      steps: chapter.steps.length,
    })),
  };
}

export function openingOverview(opening: Opening): OpeningOverview {
  return { ...openingCard(opening), history: opening.history, keyIdeas: opening.keyIdeas };
}

export function previewChapter(opening: Opening) {
  return opening.chapters.find((chapter) => chapter.preview) ?? opening.chapters[0];
}

export function chapterView(opening: Opening, chapterSlug: string): ChapterView | null {
  const index = opening.chapters.findIndex((chapter) => chapter.slug === chapterSlug);
  if (index < 0) return null;
  const chapter = opening.chapters[index];
  const timeline = buildChapterTimeline(chapter, ecoAt);
  const prev = opening.chapters[index - 1];
  const next = opening.chapters[index + 1];
  return {
    opening: { slug: opening.slug, name: opening.name, side: opening.side },
    chapter: {
      slug: chapter.slug,
      title: chapter.title,
      summary: chapter.summary,
      number: index + 1,
      total: opening.chapters.length,
      preview: chapter.preview === true,
    },
    ...timeline,
    prev: prev ? { slug: prev.slug, title: prev.title } : undefined,
    next: next ? { slug: next.slug, title: next.title } : undefined,
  };
}
