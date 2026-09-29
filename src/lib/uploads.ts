import "server-only";

import { accessSync, constants, mkdirSync } from "fs";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { isSafeUploadFilename, parseUploadUrl, UPLOAD_AREAS, uploadUrl, type UploadArea } from "@/lib/uploadUrls";

/**
 * Where uploaded profile photos and achievement images are stored.
 *
 * They used to be written into `public/`, which could not work in production:
 * Next.js only serves public files that existed at build time, the container's
 * app folder is not writable by the server user, and nothing in it survives a
 * redeploy. Files now go to UPLOADS_DIR and are served by
 * `app/uploads/[...path]/route.ts`.
 *
 * Mount a Docker volume at UPLOADS_DIR to keep uploads across deploys. Until
 * then the default is `uploads/` in the app folder when it is writable (local
 * development) or the system temp folder otherwise (the container today):
 * uploads work, but a redeploy still clears them.
 */
declare global {
  var __lmsUploadsRoot: string | undefined;
}

export function uploadsRoot() {
  if (globalThis.__lmsUploadsRoot) return globalThis.__lmsUploadsRoot;
  const candidates = [process.env.UPLOADS_DIR, path.join(process.cwd(), "uploads"), path.join(os.tmpdir(), "envision-lms-uploads")].filter(
    (dir): dir is string => Boolean(dir && dir.trim())
  );
  for (const dir of candidates) {
    try {
      mkdirSync(dir, { recursive: true });
      accessSync(dir, constants.W_OK);
      globalThis.__lmsUploadsRoot = dir;
      return dir;
    } catch {
      // Not writable here; try the next place.
    }
  }
  globalThis.__lmsUploadsRoot = candidates[candidates.length - 1];
  return globalThis.__lmsUploadsRoot;
}

/** Stores an upload and returns the URL to save on the record. */
export async function saveUpload(area: UploadArea, filename: string, data: Buffer) {
  if (!isSafeUploadFilename(filename)) throw new Error("Invalid upload filename.");
  const dir = path.join(uploadsRoot(), area);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), data);
  return uploadUrl(area, filename);
}

/** Deletes the file behind an uploaded-file URL; anything else is ignored. */
export async function removeUpload(url: unknown) {
  const parsed = parseUploadUrl(url);
  if (!parsed) return;
  const file = parsed.legacy
    ? path.join(process.cwd(), "public", ...(parsed.area === "profiles" ? ["images", "profiles"] : ["images", "achievements", "uploads"]), parsed.filename)
    : path.join(uploadsRoot(), parsed.area, parsed.filename);
  await unlink(file).catch(() => undefined);
}

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** The file extension to store an upload of this type under. */
export function extensionForImageType(type: string) {
  return type === "image/jpeg" ? ".jpg" : type === "image/png" ? ".png" : type === "image/webp" ? ".webp" : type === "image/gif" ? ".gif" : null;
}

/** Reads an uploaded image for `/uploads/<area>/<file>`, or null when there is none to serve. */
export async function readUpload(segments: string[]) {
  if (segments.length !== 2) return null;
  const [area, filename] = segments;
  if (!(UPLOAD_AREAS as readonly string[]).includes(area) || !isSafeUploadFilename(filename)) return null;
  const contentType = CONTENT_TYPES[path.extname(filename).toLowerCase()];
  if (!contentType) return null;
  try {
    return { data: await readFile(path.join(uploadsRoot(), area, filename)), contentType };
  } catch {
    return null;
  }
}
