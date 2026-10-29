import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { BranchCapability } from "./rules";
import { resolveBranchAccess } from "./access";
import { BRANCH_LABELS } from "./scope";

/**
 * Gate for a branch staff page. Runs in the page itself, before any data is
 * read: a layout redirect does not stop the page from rendering.
 */
export async function requireBranchPage(capability: BranchCapability) {
  const session = await auth();
  const user = session?.user as any;
  if (!user) redirect("/login");
  const access = await resolveBranchAccess(user);
  if (!access || !access.can.has(capability) || user.isActive === false) {
    redirect(user.branch && user.role === "student" ? "/bowbazar/me" : access ? "/bowbazar" : "/dashboard");
  }
  return {
    branch: access.branch,
    branchLabel: BRANCH_LABELS[access.branch],
    can: [...access.can],
    userName: String(user.name || ""),
  };
}
