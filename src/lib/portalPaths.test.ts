import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isPortalPath, portalPaths } from "./portalPaths";

const dashboardDir = fileURLToPath(new URL("../app/(dashboard)", import.meta.url));

/** The route segments in `app/(dashboard)`, ignoring layout/error/loading files. */
function dashboardSegments() {
  return readdirSync(dashboardDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `/${entry.name}`)
    .sort();
}

describe("portalPaths", () => {
  // This is the guard the privacy policy leans on: a dashboard route missing
  // from the list would load the Meta Pixel on a page a child uses.
  it("covers every route folder in app/(dashboard)", () => {
    const missing = dashboardSegments().filter((segment) => !portalPaths.includes(segment as never));
    expect(missing, `add these to portalPaths so the portal is not tracked: ${missing.join(", ")}`).toEqual([]);
  });

  it("lists no path that has stopped existing", () => {
    const segments = dashboardSegments();
    const stale = portalPaths.filter((path) => !segments.includes(path));
    expect(stale, `these are no longer routes: ${stale.join(", ")}`).toEqual([]);
  });

  it("matches a portal page and everything under it", () => {
    expect(isPortalPath("/dashboard")).toBe(true);
    expect(isPortalPath("/fees/invoices")).toBe(true);
    expect(isPortalPath("/booking")).toBe(true);
  });

  it("does not match the public pages", () => {
    expect(isPortalPath("/")).toBe(false);
    expect(isPortalPath("/register")).toBe(false);
    expect(isPortalPath("/terms")).toBe(false);
    expect(isPortalPath("/success-stories")).toBe(false);
  });

  it("does not match a public path that merely starts with a portal one", () => {
    expect(isPortalPath("/playground")).toBe(false);
    expect(isPortalPath("/learn-chess-online")).toBe(false);
  });

  it("ignores a query string or hash", () => {
    expect(isPortalPath("/dashboard?tab=1")).toBe(true);
    expect(isPortalPath("/terms#fees")).toBe(false);
  });
});
