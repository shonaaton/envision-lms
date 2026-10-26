import "server-only";

import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { uploadsRoot } from "@/lib/uploads";
import { cleanFileName, fileListProblem, fileRuleFor, matchesSignature, type LinkAttachmentInput } from "@/lib/askCoachAttachmentRules";

/**
 * Files sent in Ask Coach chats. They sit under UPLOADS_DIR like profile
 * photos, but in an area the public `/uploads` route does not serve: a chat
 * file is only handed out by `/api/ask-coach/attachments/...`, which checks
 * that the viewer is in the conversation.
 *
 * Kept out of lib/askCoach.ts on purpose - that one is reachable from the jobs
 * in instrumentation.ts, which must not pull in `fs` (see lib/uploads.ts).
 */
const AREA = "ask-coach";
const STORED_NAME = /^[a-f0-9-]{36}\.[a-z0-9]{1,8}$/;

export type StoredAttachment = {
  kind: "image" | "document" | "link";
  name: string;
  mimeType?: string;
  size?: number;
  storedName?: string;
  url?: string;
  label?: string;
};

function filePath(storedName: string) {
  if (!STORED_NAME.test(storedName)) throw new Error("Invalid attachment name.");
  return path.join(uploadsRoot(), AREA, storedName);
}

/**
 * Checks and stores the files picked for one message. Nothing is written
 * unless every file passes, so a refused message leaves no files behind.
 */
export async function saveAskCoachFiles(files: File[]): Promise<StoredAttachment[]> {
  const problem = fileListProblem(files.map((file) => ({ name: file.name, size: file.size })));
  if (problem) throw new Error(problem);

  const checked = await Promise.all(
    files.map(async (file) => {
      const rule = fileRuleFor(file.name)!;
      const data = Buffer.from(await file.arrayBuffer());
      if (!matchesSignature(rule.signature, data)) {
        throw new Error(`${cleanFileName(file.name)} does not look like a real ${path.extname(file.name).slice(1).toUpperCase()} file.`);
      }
      return { file, rule, data };
    })
  );

  await mkdir(path.join(uploadsRoot(), AREA), { recursive: true });
  const stored: StoredAttachment[] = [];
  try {
    for (const { file, rule, data } of checked) {
      const extension = path.extname(file.name).toLowerCase();
      const storedName = `${globalThis.crypto.randomUUID()}${extension}`;
      await writeFile(filePath(storedName), data);
      stored.push({ kind: rule.kind, name: cleanFileName(file.name), mimeType: rule.mimeType, size: data.length, storedName });
    }
  } catch (error) {
    await removeAskCoachFiles(stored);
    throw error;
  }
  return stored;
}

export function linkAttachments(links: LinkAttachmentInput[]): StoredAttachment[] {
  return links.map((link) => ({ kind: "link", name: link.label || link.url, url: link.url, label: link.label }));
}

export async function readAskCoachFile(storedName: string) {
  try {
    return await readFile(filePath(storedName));
  } catch {
    return null;
  }
}

export async function removeAskCoachFiles(attachments: Array<{ storedName?: string | null }>) {
  await Promise.all(
    attachments
      .map((item) => item.storedName)
      .filter((name): name is string => Boolean(name && STORED_NAME.test(name)))
      .map((name) => unlink(filePath(name)).catch(() => undefined))
  );
}
