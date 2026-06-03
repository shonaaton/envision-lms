import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const role = (req.auth?.user as any)?.role as "student" | "instructor" | "admin" | undefined;

  const isAuthRoute = ["/login", "/register"].some((p) => nextUrl.pathname.startsWith(p));
  const isPublic = ["/", "/api/auth"].some((p) => nextUrl.pathname === p || nextUrl.pathname.startsWith("/api/auth"));
  const isAdminRoute = nextUrl.pathname.startsWith("/admin");
  const isInstructorRoute = nextUrl.pathname.startsWith("/instructor");

  if (isPublic) return NextResponse.next();
  if (isAuthRoute) return isLoggedIn ? NextResponse.redirect(new URL("/dashboard", nextUrl)) : NextResponse.next();
  if (!isLoggedIn) return NextResponse.redirect(new URL("/login", nextUrl));
  if (isAdminRoute && role !== "admin") return NextResponse.redirect(new URL("/dashboard", nextUrl));
  if (isInstructorRoute && role !== "instructor" && role !== "admin") return NextResponse.redirect(new URL("/dashboard", nextUrl));
  return NextResponse.next();
});

export const config = { matcher: ["/((?!_next|.*\\..*).*)"] };
