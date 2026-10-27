import "server-only";

/**
 * Who may open which chapter.
 *
 * The preview chapter of every opening is open to everybody, signed in or not.
 * The rest need the opening unlocked. Staff (admins and sub-admins) see
 * everything so they can review content.
 *
 * Buying an opening and an enrolled student's three free picks are not built
 * yet, so for now everyone else sees the preview chapter only.
 */

export type OpeningAccess = {
  /** Every chapter is open. */
  full: boolean;
  reason: "staff" | "owned" | "locked";
};

type AccessUser = { id?: string; role?: string } | null | undefined;

export function isOpeningsStaff(user: AccessUser) {
  return user?.role === "admin" || user?.role === "sub-admin";
}

export async function openingAccessFor(user: AccessUser, _slug: string): Promise<OpeningAccess> {
  if (isOpeningsStaff(user)) return { full: true, reason: "staff" };
  return { full: false, reason: "locked" };
}

export function canOpenChapter(access: OpeningAccess, chapter: { preview?: boolean }) {
  return access.full || chapter.preview === true;
}
