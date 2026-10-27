/** The public, indexable sales pages. */
export const OPENINGS_PUBLIC_PATH = "/chess-openings";
/** The signed-in course, inside the portal. */
export const OPENINGS_PORTAL_PATH = "/openings";

export const publicOpeningHref = (slug: string) => `${OPENINGS_PUBLIC_PATH}/${slug}`;
export const portalOpeningHref = (slug: string, chapter?: string) => `${OPENINGS_PORTAL_PATH}/${slug}${chapter ? `/${chapter}` : ""}`;
