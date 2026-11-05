import { redirect } from "next/navigation";

import { saveCoachProfile } from "@/app/(dashboard)/coach-pay/actions";
import { CoachProfilesView } from "@/components/coach-pay/CoachProfilesView";
import { requireCoachPayPermission } from "@/lib/coachPayAccess";
import { requireRetentionViewer } from "@/lib/retention/retentionAccess";

export const dynamic = "force-dynamic";

/**
 * Coach Profiles on the Retention grant. Read-only unless the viewer could also
 * change them from Coach Pay, which is the rule `saveCoachProfile` enforces.
 */
export default async function RetentionCoachProfilesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireRetentionViewer();
  if (!viewer) redirect("/dashboard?restricted=1");

  const canEdit = Boolean(await requireCoachPayPermission("view_all"));
  return (
    <CoachProfilesView
      params={searchParams ? await searchParams : {}}
      basePath="/admin/retention/coach-profiles"
      eyebrow="Retention"
      viewerId={viewer.id}
      canEdit={canEdit}
      saveAction={saveCoachProfile}
    />
  );
}
