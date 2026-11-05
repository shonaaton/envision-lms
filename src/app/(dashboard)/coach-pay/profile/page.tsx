import { redirect } from "next/navigation";

import { CoachProfilesView } from "@/components/coach-pay/CoachProfilesView";
import { resolveCoachPayViewer } from "@/lib/coachPayAccess";
import { saveCoachProfile } from "../actions";

export const dynamic = "force-dynamic";

export default async function CoachProfilePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await resolveCoachPayViewer();
  if (!viewer) return <div className="p-6 text-sm text-slate-600">Forbidden</div>;

  // The admin team keeps these profiles; coaches no longer fill in their own.
  if (!viewer.canViewAll) redirect("/coach-pay");

  return (
    <CoachProfilesView
      params={searchParams ? await searchParams : {}}
      basePath="/coach-pay/profile"
      eyebrow="Coach Pay"
      viewerId={viewer.userId}
      canEdit={viewer.role === "admin" || viewer.role === "sub-admin"}
      saveAction={saveCoachProfile}
      showCoachPayLinks
    />
  );
}
