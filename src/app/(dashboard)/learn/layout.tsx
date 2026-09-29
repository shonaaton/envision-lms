import { auth } from "@/lib/auth";
import { requireLearnChessAccess } from "@/lib/learning/studentAccess";

export const dynamic = "force-dynamic";

/**
 * Learn Chess is only for students who have been in a Beginner Level 1 or 2
 * class (lib/learning/audience.ts); staff can always open it to preview. The
 * sidebar hides the link, and the pages under here each call
 * requireLearnChessAccess before loading anything. This layout is the safety
 * net for a page added later without that call.
 */
export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  await requireLearnChessAccess(session?.user as any);
  return <>{children}</>;
}
