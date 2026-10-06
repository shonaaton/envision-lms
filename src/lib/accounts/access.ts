import "server-only";

import { auth } from "@/lib/auth";
import { isAccountsAdmin } from "@/lib/accounts/accessRule";

export type AccountsViewer = { userId: string; name: string };

/**
 * The signed-in admin, or null. Every Accounts page, server action and API
 * route calls this itself: the dashboard layout's redirect does not stop a page
 * from rendering.
 */
export async function resolveAccountsViewer(): Promise<AccountsViewer | null> {
  const session = await auth();
  const user = session?.user as any;
  if (!isAccountsAdmin(user)) return null;
  return { userId: String(user.id), name: String(user.name || "") };
}

export async function requireAccountsAdmin(): Promise<AccountsViewer> {
  const viewer = await resolveAccountsViewer();
  if (!viewer) throw new Error("Forbidden");
  return viewer;
}
