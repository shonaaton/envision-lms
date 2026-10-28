import { describe, expect, it } from "vitest";
import { validateWhatsAppUpload } from "./whatsappMediaRules";
describe("outgoing WhatsApp attachments", () => {
  it("keeps PGN filenames while uploading their text with a supported document MIME type", () => {
    expect(validateWhatsAppUpload("Lesson.pgn", Buffer.from('[Event "Training"]\n\n1. e4 e5 2. Nf3 *'))).toMatchObject({ kind: "document", mime: "text/plain", filename: "Lesson.pgn" });
  });
  it("checks signatures instead of trusting a browser MIME type or file extension", () => {
    expect(validateWhatsAppUpload("image.jpg", Buffer.from("not an image")).error).toContain("matching");
    expect(validateWhatsAppUpload("invoice.pdf", Buffer.from("%PDF-1.7\n..."))).toMatchObject({ mime: "application/pdf" });
    expect(validateWhatsAppUpload("image.png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]))).toMatchObject({ mime: "image/png", kind: "image" });
  });
  it("rejects oversized, empty, binary-text and executable files", () => {
    expect(validateWhatsAppUpload("x.pdf", Buffer.alloc(10 * 1024 * 1024 + 1)).error).toContain("10 MB");
    expect(validateWhatsAppUpload("x.pgn", Buffer.alloc(0)).error).toContain("empty");
    expect(validateWhatsAppUpload("x.txt", Buffer.from([0, 1, 2])).error).toContain("UTF-8");
    expect(validateWhatsAppUpload("x.exe", Buffer.from("MZ" )).error).toContain("matching");
  });
  it("rejects oversized images and sanitises filenames without changing the content hash", () => {
    const bytes = Buffer.alloc(5 * 1024 * 1024 + 1); bytes.set([0xff, 0xd8, 0xff]);
    expect(validateWhatsAppUpload("large.jpg", bytes).error).toContain("5 MB");
    const pdf = Buffer.from("%PDF-1.7\n...");
    expect(validateWhatsAppUpload('a/"b.pdf', pdf).filename).toBe("a__b.pdf");
    expect(validateWhatsAppUpload("a.pdf", pdf).hash).toBe(validateWhatsAppUpload("b.pdf", pdf).hash);
  });
});
