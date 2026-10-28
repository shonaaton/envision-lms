import { createHash } from "crypto";

export function validateWhatsAppUpload(name: string, bytes: Buffer): { kind?: "image" | "document"; mime?: string; filename?: string; hash?: string; error?: string } {
  const filename = name.replace(/[\x00-\x1f\x7f"/\\]/g, "_").slice(-150);
  const extension = filename.split(".").at(-1)?.toLowerCase();
  if (!bytes.length) return { error: "Choose a file that is not empty." };
  if (bytes.length > 10 * 1024 * 1024) return { error: "Files must be 10 MB or smaller." };
  let kind: "image" | "document" = "document", mime = "";
  if (["jpg", "jpeg"].includes(extension || "") && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) { kind = "image"; mime = "image/jpeg"; }
  else if (extension === "png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) { kind = "image"; mime = "image/png"; }
  else if (extension === "pdf" && bytes.subarray(0, 5).toString() === "%PDF-") mime = "application/pdf";
  else if (extension === "pgn" || extension === "txt") {
    const text = bytes.toString("utf8");
    if (text.includes("\u0000") || text.includes("\uFFFD")) return { error: "PGN and text documents must contain valid UTF-8 text." };
    if (extension === "pgn" && !/\[(?:Event|Site|White|Black|Result|FEN)\s+"/i.test(text) && !/\b1\.(?:\s|[a-hKQRBNO])/.test(text)) return { error: "This file does not look like a PGN. Check it before sending." };
    // WhatsApp accepts text/plain documents; keep the original .pgn filename.
    mime = "text/plain";
  } else return { error: "Choose a JPEG, PNG, PDF, PGN or text file with matching file content." };
  if (kind === "image" && bytes.length > 5 * 1024 * 1024) return { error: "Images must be 5 MB or smaller." };
  return { kind, mime, filename, hash: createHash("sha256").update(bytes).digest("hex") };
}
