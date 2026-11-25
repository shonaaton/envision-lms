import { describe, expect, it } from "vitest";
import { addressesFor, newPostMailCopy, planNewPostMailing, type MailablePost } from "@/lib/blog/newPostMail";

const post = (slug: string, publishedAt: string): MailablePost => ({ slug, h1: `Title ${slug}`, excerpt: `About ${slug}.`, publishedAt });
const now = new Date("2026-11-26T10:00:00Z");

describe("planNewPostMailing", () => {
  it("records every live post on the first run and mails none", () => {
    const plan = planNewPostMailing([post("a", "2026-11-25"), post("b", "2025-01-01")], new Set(), now);
    expect(plan).toEqual({ kind: "seed", slugs: ["a", "b"] });
  });

  it("queues new slugs and ignores known ones", () => {
    const plan = planNewPostMailing([post("a", "2026-11-25"), post("b", "2026-11-26")], new Set(["a"]), now);
    expect(plan).toEqual({ kind: "update", queue: ["b"], skip: [] });
  });

  it("skips a new slug whose post was published more than two weeks ago", () => {
    const plan = planNewPostMailing([post("old", "2026-10-01"), post("new", "2026-11-20")], new Set(["x"]), now);
    expect(plan).toEqual({ kind: "update", queue: ["new"], skip: ["old"] });
  });
});

describe("newPostMailCopy", () => {
  it("names a single post in the subject and links to it", () => {
    const copy = newPostMailCopy([post("game-3", "2026-11-26")], "https://envisionchessacademy.com/", "Riya");
    expect(copy.subject).toBe("New on the Envision blog: Title game-3");
    expect(copy.actionUrl).toBe("https://envisionchessacademy.com/blog/game-3");
    expect(copy.message).toContain("Hello Riya,");
    expect(copy.href).toBe("/blog/game-3");
  });

  it("sends one email for several posts", () => {
    const copy = newPostMailCopy([post("a", "2026-11-26"), post("b", "2026-11-26")], "https://x.test", "");
    expect(copy.subject).toBe("2 new articles on the Envision blog");
    expect(copy.message).toContain("https://x.test/blog/a");
    expect(copy.message).toContain("https://x.test/blog/b");
    expect(copy.message).toContain("Hello there,");
  });
});

describe("addressesFor", () => {
  it("adds a student's parent email once, lower-cased", () => {
    expect(addressesFor({ role: "student", email: "Kid@x.com", parentEmail: "mum@x.com" })).toEqual(["kid@x.com", "mum@x.com"]);
    expect(addressesFor({ role: "student", email: "same@x.com", parentEmail: "SAME@x.com" })).toEqual(["same@x.com"]);
  });

  it("ignores parent email for staff and drops unusable addresses", () => {
    expect(addressesFor({ role: "instructor", email: "coach@x.com", parentEmail: "p@x.com" })).toEqual(["coach@x.com"]);
    expect(addressesFor({ role: "student", email: "", parentEmail: "no-email.invalid" })).toEqual([]);
  });
});
