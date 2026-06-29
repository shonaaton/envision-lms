import PuzzleTrainer from "@/components/quiz/PuzzleTrainer";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { demoUsageState } from "@/lib/demoAccess";

export const dynamic = "force-dynamic";

export default async function KingHuntPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  await dbConnect();
  const demo = userId ? await demoUsageState(userId, "kingHunt") : null;
  if (demo?.isDemo && !demo.allowed) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-xl">
        <h1 className="text-2xl font-black text-slate-950">Demo King Hunt completed</h1>
        <p className="mx-auto mt-2 max-w-xl text-slate-600">You have used your demo King Hunt attempts. Please book a demo class so the academy team can guide you further.</p>
        <a href="/booking" className="btn-primary mt-5 inline-flex">Book Demo Class</a>
      </div>
    );
  }
  return <PuzzleTrainer mode="king_hunt" />;
}
