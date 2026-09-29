import { describe, expect, it } from "vitest";

import { isUploadedProfilePhoto, parseUploadUrl, uploadUrl } from "./uploadUrls";

describe("parseUploadUrl", () => {
  it("reads current upload URLs", () => {
    expect(parseUploadUrl(uploadUrl("profiles", "avatar-abc-1.png"))).toEqual({ area: "profiles", filename: "avatar-abc-1.png", legacy: false });
    expect(parseUploadUrl("/uploads/achievements/trophy-2.jpg")).toEqual({ area: "achievements", filename: "trophy-2.jpg", legacy: false });
  });

  it("still recognises the URLs uploads were saved under before", () => {
    expect(parseUploadUrl("/images/profiles/avatar-abc-1.png")).toEqual({ area: "profiles", filename: "avatar-abc-1.png", legacy: true });
    expect(parseUploadUrl("/images/achievements/uploads/trophy-2.jpg")).toEqual({ area: "achievements", filename: "trophy-2.jpg", legacy: true });
  });

  it("refuses anything that could reach outside the upload folder", () => {
    for (const url of [
      "/uploads/profiles/../../package.json",
      "/uploads/profiles/sub/dir.png",
      "/uploads/profiles/..",
      "/uploads/profiles/.env",
      "/uploads/profiles/",
      "/images/profiles/../secret.png",
      "/uploads/other/file.png",
    ]) {
      expect(parseUploadUrl(url)).toBeNull();
    }
  });

  it("ignores colours, external images and non-strings", () => {
    expect(parseUploadUrl("#5a1372")).toBeNull();
    expect(parseUploadUrl("https://example.com/x.png")).toBeNull();
    expect(parseUploadUrl(undefined)).toBeNull();
  });
});

describe("isUploadedProfilePhoto", () => {
  it("is true only for profile photos, old or new", () => {
    expect(isUploadedProfilePhoto("/uploads/profiles/a.png")).toBe(true);
    expect(isUploadedProfilePhoto("/images/profiles/a.png")).toBe(true);
    expect(isUploadedProfilePhoto("/uploads/achievements/a.png")).toBe(false);
    expect(isUploadedProfilePhoto("#123456")).toBe(false);
  });
});
