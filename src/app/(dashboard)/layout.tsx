import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardFrame from "@/components/layout/DashboardFrame";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = (session.user as any).role as "student" | "instructor" | "admin";
  const accountStatus = (session.user as any).accountStatus;
  return (
    <DashboardFrame role={role} accountStatus={accountStatus} user={{ name: session.user.name, role }}>
      {children}
    </DashboardFrame>
  );
}
