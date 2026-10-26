import { describe, expect, it } from "vitest";
import {
  ASK_COACH_MAX_FILE_BYTES,
  attachmentSummary,
  canAttachToAskCoach,
  cleanFileName,
  fileListProblem,
  fileRuleFor,
  linkifySegments,
  matchesSignature,
  normalizeLinkUrl,
  parseLinkAttachments,
} from "./askCoachAttachmentRules";

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(16).fill(0x20)]);

describe("who can attach", () => {
  it("lets coaches and admins attach, never students", () => {
    expect(canAttachToAskCoach("instructor")).toBe(true);
    expect(canAttachToAskCoach("admin")).toBe(true);
    expect(canAttachToAskCoach("sub-admin")).toBe(true);
    expect(canAttachToAskCoach("student")).toBe(false);
    expect(canAttachToAskCoach(undefined)).toBe(false);
  });
});

describe("file rules", () => {
  it("takes the type from the extension, case-insensitively", () => {
    expect(fileRuleFor("Board.PNG")).toMatchObject({ kind: "image", mimeType: "image/png" });
    expect(fileRuleFor("opening notes.pdf")).toMatchObject({ kind: "document", mimeType: "application/pdf" });
    expect(fileRuleFor("game.pgn")?.kind).toBe("document");
    expect(fileRuleFor("setup.exe")).toBeNull();
    expect(fileRuleFor("page.html")).toBeNull();
    expect(fileRuleFor("image.svg")).toBeNull();
    expect(fileRuleFor("no-extension")).toBeNull();
  });

  it("refuses unsupported, empty, oversized and too many files", () => {
    expect(fileListProblem([{ name: "a.png", size: 10 }])).toBeNull();
    expect(fileListProblem([{ name: "a.exe", size: 10 }])).toMatch(/not a supported file/);
    expect(fileListProblem([{ name: "a.png", size: 0 }])).toMatch(/empty/);
    expect(fileListProblem([{ name: "a.pdf", size: ASK_COACH_MAX_FILE_BYTES + 1 }])).toMatch(/10 MB/);
    expect(fileListProblem(Array.from({ length: 6 }, (_, i) => ({ name: `${i}.png`, size: 1 })))).toMatch(/up to 5/);
    expect(fileListProblem(Array.from({ length: 3 }, (_, i) => ({ name: `${i}.pdf`, size: 9 * 1024 * 1024 })))).toMatch(/25 MB/);
  });

  it("checks the first bytes match the claimed type", () => {
    expect(matchesSignature("png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
    expect(matchesSignature("png", bytes(0x3c, 0x68, 0x74, 0x6d, 0x6c))).toBe(false);
    expect(matchesSignature("jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(matchesSignature("pdf", bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe(true);
    expect(matchesSignature("pdf", bytes(0x3c, 0x73, 0x63))).toBe(false);
    expect(matchesSignature("zip", bytes(0x50, 0x4b, 0x03, 0x04))).toBe(true);
    expect(matchesSignature("webp", new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]))).toBe(true);
    expect(matchesSignature("text", new TextEncoder().encode("1. e4 e5 2. Nf3"))).toBe(true);
    expect(matchesSignature("text", new Uint8Array([0x4d, 0x5a, 0x00, 0x01]))).toBe(false);
  });

  it("keeps a clean display name", () => {
    expect(cleanFileName("C:\\fakepath\\My Notes.pdf")).toBe("My Notes.pdf");
    expect(cleanFileName('bad"\u0007name.png')).toBe("badname.png");
    const long = cleanFileName(`${"x".repeat(200)}.docx`);
    expect(long).toHaveLength(120);
    expect(long.endsWith(".docx")).toBe(true);
  });
});

describe("links", () => {
  it("accepts http(s) links and adds https to a bare domain", () => {
    expect(normalizeLinkUrl("https://lichess.org/study/abc")).toBe("https://lichess.org/study/abc");
    expect(normalizeLinkUrl("lichess.org/training")).toBe("https://lichess.org/training");
    expect(normalizeLinkUrl("  http://chess.com  ")).toBe("http://chess.com/");
  });

  it("refuses script, data and other schemes, credentials and junk", () => {
    expect(normalizeLinkUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeLinkUrl("JavaScript:alert(1)")).toBeNull();
    expect(normalizeLinkUrl("data:text/html,<script>")).toBeNull();
    expect(normalizeLinkUrl("ftp://files.example.com")).toBeNull();
    expect(normalizeLinkUrl("https://user:pw@example.com")).toBeNull();
    expect(normalizeLinkUrl("not a link")).toBeNull();
    expect(normalizeLinkUrl("localhost")).toBeNull();
    expect(normalizeLinkUrl("")).toBeNull();
  });

  it("parses the links sent with a message", () => {
    expect(parseLinkAttachments([{ url: "lichess.org/study/1", label: "  Study  " }])).toEqual([
      { url: "https://lichess.org/study/1", label: "Study" },
    ]);
    expect(parseLinkAttachments(undefined)).toEqual([]);
    expect(() => parseLinkAttachments([{ url: "javascript:alert(1)" }])).toThrow(/not a valid web address/);
    expect(() => parseLinkAttachments(Array.from({ length: 6 }, () => ({ url: "a.com" })))).toThrow(/up to 5/);
  });

  it("turns web addresses in text into links without eating punctuation", () => {
    expect(linkifySegments("See https://lichess.org/study/x. Thanks")).toEqual([
      { type: "text", text: "See " },
      { type: "link", text: "https://lichess.org/study/x", href: "https://lichess.org/study/x" },
      { type: "text", text: ". Thanks" },
    ]);
    expect(linkifySegments("(www.chess.com)")).toEqual([
      { type: "text", text: "(" },
      { type: "link", text: "www.chess.com", href: "https://www.chess.com/" },
      { type: "text", text: ")" },
    ]);
    expect(linkifySegments("https://en.wikipedia.org/wiki/Gambit_(chess)")[0]).toMatchObject({ type: "link", text: "https://en.wikipedia.org/wiki/Gambit_(chess)" });
    expect(linkifySegments("no links here")).toEqual([{ type: "text", text: "no links here" }]);
    expect(linkifySegments("javascript:alert(1)")).toEqual([{ type: "text", text: "javascript:alert(1)" }]);
  });
});

describe("attachment summary", () => {
  it("describes an attachment-only message in words", () => {
    expect(attachmentSummary([])).toBe("");
    expect(attachmentSummary([{ kind: "image", name: "a.png" }])).toBe("Shared an image");
    expect(attachmentSummary([{ kind: "document", name: "Homework.pdf" }])).toBe("Shared a document (Homework.pdf)");
    expect(attachmentSummary([{ kind: "link", url: "https://lichess.org", label: "Study" }])).toBe("Shared a link (Study)");
    expect(
      attachmentSummary([
        { kind: "image", name: "a.png" },
        { kind: "image", name: "b.png" },
        { kind: "document", name: "x.pdf" },
        { kind: "link", url: "https://a.com" },
      ])
    ).toBe("Shared 2 images, a document (x.pdf) and a link (https://a.com)");
  });
});
