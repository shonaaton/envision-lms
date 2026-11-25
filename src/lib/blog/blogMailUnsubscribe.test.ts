import { describe, expect, it } from "vitest";
import { blogUnsubscribeSignature, blogUnsubscribeUrl, maskEmail, verifyBlogUnsubscribeSignature } from "@/lib/blog/blogMailUnsubscribe";

describe("blog unsubscribe links", () => {
  it("verifies its own signature and rejects another recipient's", async () => {
    const signature = await blogUnsubscribeSignature("6b0721816e4e057f920845d6");
    expect(signature).toHaveLength(32);
    expect(await verifyBlogUnsubscribeSignature("6b0721816e4e057f920845d6", signature)).toBe(true);
    expect(await verifyBlogUnsubscribeSignature("6b0721816e4e057f920845d7", signature)).toBe(false);
    expect(await verifyBlogUnsubscribeSignature("6b0721816e4e057f920845d6", "")).toBe(false);
  });

  it("builds a URL without the email address in it", async () => {
    const url = await blogUnsubscribeUrl("https://envisionchessacademy.com/", "6b0721816e4e057f920845d6");
    expect(url).toMatch(/^https:\/\/envisionchessacademy\.com\/unsubscribe\/blog\/6b0721816e4e057f920845d6\/[\w-]{32}$/);
  });

  it("masks an address", () => {
    expect(maskEmail("riyaroy@gmail.com")).toBe("ri*****@gmail.com");
    expect(maskEmail("ab@x.com")).toBe("ab*@x.com");
    expect(maskEmail("nope")).toBe("");
  });
});
