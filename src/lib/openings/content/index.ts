import "server-only";
import type { Opening } from "../types";
import { italianGame } from "./italian-game";

/**
 * Every published opening, in the order the library lists them.
 *
 * Server-only on purpose: the paid chapters live in these files, and a client
 * component importing this module would ship all of them to every visitor.
 * Pages hand the player one resolved chapter (lib/openings/views.ts) instead.
 */
export const OPENINGS: Opening[] = [italianGame];

export function getOpening(slug: string): Opening | undefined {
  return OPENINGS.find((opening) => opening.slug === slug);
}
