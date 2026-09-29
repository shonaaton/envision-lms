import { readUpload } from "@/lib/uploads";

// Files are written at runtime, so nothing here can be prerendered.
export const dynamic = "force-dynamic";

/**
 * Serves uploaded profile photos and achievement images (see lib/uploads.ts).
 * Only images, only from the two upload areas, and only by a plain filename.
 * Upload filenames carry a timestamp and are never rewritten, so a file can be
 * cached for good.
 */
export async function GET(_request: Request, { params }: { params: { path: string[] } }) {
  const file = await readUpload(params.path || []);
  if (!file) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
