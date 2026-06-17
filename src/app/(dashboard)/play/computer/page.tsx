import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import PlayVsComputer from "@/components/quiz/PlayVsComputer";

export default async function PlayComputerPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role === "instructor") redirect("/dashboard");
  return <PlayVsComputer depth={4} />;
}
