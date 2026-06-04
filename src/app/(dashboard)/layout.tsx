import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = (session.user as any).role as "student" | "instructor" | "admin";
  return (
    <div className="flex min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(253,231,90,0.18),transparent_28%),linear-gradient(135deg,#fff_0%,#fbf7ff_48%,#fff8c9_140%)]">
      <Sidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={{ name: session.user.name, role }} />
        <main className="flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="mx-auto w-full max-w-[1800px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
