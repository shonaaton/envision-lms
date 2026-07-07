import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { demoUsageState } from "@/lib/demoAccess";
import PlayVsComputer from "@/components/quiz/PlayVsComputer";

export default async function PlayComputerPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  if (role === "instructor") redirect("/dashboard");
  await dbConnect();
  const demo = userId ? await demoUsageState(userId, "playComputer") : null;
  if (demo?.isDemo && !demo.allowed) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-xl">
        <h1 className="text-2xl font-black text-slate-950">Demo games completed</h1>
        <p className="mx-auto mt-2 max-w-xl text-slate-600">You have used your demo Play vs Computer attempts. Please create a demo booking so the academy team can guide you further.</p>
        <a href="/booking" className="btn-primary mt-5 inline-flex">Open Demo Booking</a>
      </div>
    );
  }
  return <PlayVsComputer depth={4} />;
}
