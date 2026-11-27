import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { loginPathFor } from "@/lib/returnPath";

/**
 * Sends a signed-out visitor to /login, remembering the page they opened
 * (middleware puts it in x-pathname) so the login page can bring them back.
 */
export function redirectToLogin(): never {
  redirect(loginPathFor(headers().get("x-pathname")));
}
