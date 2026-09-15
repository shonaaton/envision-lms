import { describe, expect, it } from "vitest";
import { normalizeGoogleMeetUrl, parseMeetingUrlInput } from "@/lib/meetingUrl";

describe("parseMeetingUrlInput", () => {
  it("makes a link pasted without https absolute, so it never renders as a portal path", () => {
    expect(parseMeetingUrlInput("meet.google.com/abc-defg-hij")).toEqual({ url: "https://meet.google.com/abc-defg-hij", error: "" });
  });

  it("keeps a full Meet room link", () => {
    expect(parseMeetingUrlInput("  https://meet.google.com/abc-defg-hij ").url).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("allows no link at all", () => {
    expect(parseMeetingUrlInput("")).toEqual({ url: "", error: "" });
    expect(parseMeetingUrlInput(null)).toEqual({ url: "", error: "" });
  });

  it("rejects links that are not a Meet room", () => {
    expect(parseMeetingUrlInput("https://meet.google.com/new").error).not.toBe("");
    expect(parseMeetingUrlInput("https://zoom.us/j/123").error).not.toBe("");
    expect(parseMeetingUrlInput("abc-defg-hij").error).not.toBe("");
  });
});

describe("normalizeGoogleMeetUrl", () => {
  it("repairs a stored link that is missing https", () => {
    expect(normalizeGoogleMeetUrl("meet.google.com/abc-defg-hij")).toBe("https://meet.google.com/abc-defg-hij");
  });
});
