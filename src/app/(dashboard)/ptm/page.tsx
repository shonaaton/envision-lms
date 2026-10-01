import { redirect } from "next/navigation";
import { requirePtmViewer } from "@/lib/ptm/ptmAccess";
import StudentPtmClient from "@/components/ptm/StudentPtmClient";
import CoachPtmClient from "@/components/ptm/CoachPtmClient";
import AdminPtmClient from "@/components/ptm/AdminPtmClient";
export const dynamic = "force-dynamic";
export default async function PtmPage({ searchParams }: { searchParams: { tab?: string; id?: string; join?: string } }) {
  const viewer = await requirePtmViewer();
  if (!viewer) redirect("/dashboard?restricted=1");
  const Client = viewer.role === "student" ? StudentPtmClient : viewer.role === "instructor" ? CoachPtmClient : AdminPtmClient;
  return <Client viewer={viewer} initialTab={searchParams.tab} initialId={searchParams.id} join={searchParams.join} />;
}
