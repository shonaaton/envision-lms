/**
 * The public side of user uploads: which URLs are uploaded files, and what the
 * file behind one is called. No filesystem here, so client components can use
 * it; the server side is lib/uploads.ts.
 *
 * Uploads are served from `/uploads/<area>/<file>`. Before that they were
 * written under `public/images/...`, which never worked in production - Next.js
 * only serves public files that existed at build time - so records may still
 * hold those older URLs and are recognised too.
 */

export const UPLOAD_AREAS = ["profiles", "achievements"] as const;
export type UploadArea = (typeof UPLOAD_AREAS)[number];

const LEGACY_PREFIXES: Record<UploadArea, string> = {
  profiles: "/images/profiles/",
  achievements: "/images/achievements/uploads/",
};

/** Letters, digits, dots, dashes and underscores; never a path. */
const SAFE_FILENAME = /^[a-z0-9][a-z0-9._-]{0,150}$/i;

export function isSafeUploadFilename(name: string) {
  return SAFE_FILENAME.test(name);
}

export function uploadUrl(area: UploadArea, filename: string) {
  return `/uploads/${area}/${filename}`;
}

/**
 * The area and filename behind an uploaded-file URL, current or legacy, or null
 * for anything else (a colour, an external image, a crafted path).
 */
export function parseUploadUrl(url: unknown): { area: UploadArea; filename: string; legacy: boolean } | null {
  if (typeof url !== "string") return null;
  for (const area of UPLOAD_AREAS) {
    for (const [prefix, legacy] of [[`/uploads/${area}/`, false], [LEGACY_PREFIXES[area], true]] as const) {
      if (!url.startsWith(prefix)) continue;
      const filename = url.slice(prefix.length);
      return isSafeUploadFilename(filename) ? { area, filename, legacy } : null;
    }
  }
  return null;
}

/** An avatar value that is an uploaded photo rather than a colour. */
export function isUploadedProfilePhoto(avatar: unknown) {
  return parseUploadUrl(avatar)?.area === "profiles";
}
