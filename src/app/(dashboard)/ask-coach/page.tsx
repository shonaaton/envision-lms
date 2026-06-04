import { auth } from "@/lib/auth";
import AskCoachClient from "@/components/ask-coach/AskCoachClient";

export const dynamic = "force-dynamic";

export default async function AskCoachPage() {
  const session = await auth();
  const role = (session?.user as any)?.role as "student" | "instructor" | "admin";
  return <AskCoachClient role={role} />;
}
