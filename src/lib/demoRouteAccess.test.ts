import { describe, expect, it } from "vitest";
import { authConfig } from "@/lib/auth.config";

/**
 * The demo dashboard hands a demo account real destinations - its demo
 * classroom, the starter homework on it, its linked chess accounts - so the
 * middleware has to let those through. It did not, and the join button opened
 * Google Meet in a new tab while the live classroom bounced back to the
 * dashboard, which left demo students unable to attend their own demo class.
 */
function visit(pathname: string, user: Record<string, unknown> | null = { role: "student", accountStatus: "demo", isActive: true }) {
  const authorized = (authConfig.callbacks as any).authorized as (input: any) => boolean | Response;
  return authorized({ auth: user ? { user } : null, request: { nextUrl: new URL(`https://academy.test${pathname}`) } });
}

function allowed(pathname: string, user?: Record<string, unknown> | null) {
  return visit(pathname, user) === true;
}

describe("demo account route access", () => {
  it("lets a demo student into the live classroom and the APIs behind it", () => {
    expect(allowed("/classrooms")).toBe(true);
    expect(allowed("/classrooms/650000000000000000000001/live")).toBe(true);
    expect(allowed("/api/classrooms/650000000000000000000001/live")).toBe(true);
    expect(allowed("/api/classrooms/650000000000000000000001/live/chat")).toBe(true);
  });

  it("lets a demo student reach the rest of what their dashboard links to", () => {
    expect(allowed("/homework")).toBe(true);
    expect(allowed("/api/homework/650000000000000000000002")).toBe(true);
    expect(allowed("/chess-profile")).toBe(true);
    expect(allowed("/api/chess/accounts")).toBe(true);
    expect(allowed("/booking")).toBe(true);
    expect(allowed("/dashboard")).toBe(true);
  });

  it("still keeps a demo student out of everything else", () => {
    expect(allowed("/admin/demo-center")).toBe(false);
    expect(allowed("/fees")).toBe(false);
    expect(allowed("/tournaments")).toBe(false);
    expect(allowed("/api/admin/students")).toBe(false);
  });

  it("does not widen access for anyone else", () => {
    const coach = { role: "instructor", accountStatus: "approved", isActive: true };
    expect(allowed("/admin/demo-center", coach)).toBe(false);
    expect(allowed("/classrooms", coach)).toBe(true);
    expect(visit("/classrooms", null)).toBe(false);
  });
});
