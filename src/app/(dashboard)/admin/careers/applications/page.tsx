import { Suspense } from "react";
import { redirect } from "next/navigation";
import ApplicationsClient from "@/components/admin/careers/ApplicationsClient";
import { getCareersActor } from "@/lib/careers/careersAccess";
import { listHireAccessRoles, listPostingsForAdmin } from "@/lib/careers/careersService";

export const dynamic = "force-dynamic";

export default async function CareersApplicationsPage() {
  const actor = await getCareersActor("view");
  if (!actor) redirect("/dashboard?restricted=1");
  const [postings, accessRoles, canEdit, canHire, canDelete, canExport] = await Promise.all([
    listPostingsForAdmin(),
    listHireAccessRoles(),
    getCareersActor("edit"),
    getCareersActor("approve"),
    getCareersActor("delete"),
    getCareersActor("export"),
  ]);
  return (
    <Suspense>
      <ApplicationsClient
        postings={postings.map((posting) => ({ id: posting.id, title: posting.title, hireRole: posting.hireRole, hireAccessRole: posting.hireAccessRole, accepting: posting.accepting }))}
        accessRoles={accessRoles}
        canEdit={Boolean(canEdit)}
        canHire={Boolean(canHire)}
        canDelete={Boolean(canDelete)}
        canExport={Boolean(canExport)}
        isSuperAdmin={actor.isSuperAdmin}
      />
    </Suspense>
  );
}
