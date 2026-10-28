import "server-only";

import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { uploadsRoot } from "@/lib/uploads";

/**
 * Photos and identity documents from branch admission forms. They sit under
 * UPLOADS_DIR, but in an area the public `/uploads` route does not serve (it
 * only knows UPLOAD_AREAS): they are handed out by
 * `/api/bowbazar/admissions/[id]/file`, after the branch staff check.
 *
 * Imported only by route handlers and pages - never by models or jobs, which
 * must not pull in `fs` (see lib/uploads.ts).
 */
const AREA = "branch-admissions";
const STORED_NAME = /^[a-f0-9-]{36}\.(jpg|png|webp|pdf)$/;

function filePath(storedName: string) {
  if (!STORED_NAME.test(storedName)) throw new Error("Invalid file name.");
  return path.join(uploadsRoot(), AREA, storedName);
}

export async function saveAdmissionFile(data: Uint8Array, extension: string) {
  await mkdir(path.join(uploadsRoot(), AREA), { recursive: true });
  const storedName = `${globalThis.crypto.randomUUID()}${extension}`;
  await writeFile(filePath(storedName), data);
  return storedName;
}

export async function readAdmissionFile(storedName: string) {
  try {
    return await readFile(filePath(storedName));
  } catch {
    return null;
  }
}

export async function removeAdmissionFiles(names: Array<string | null | undefined>) {
  await Promise.all(
    names
      .filter((name): name is string => Boolean(name && STORED_NAME.test(name)))
      .map((name) => unlink(filePath(name)).catch(() => undefined))
  );
}
