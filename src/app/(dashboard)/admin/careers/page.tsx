import { redirect } from "next/navigation";
import OpeningsClient from "@/components/admin/careers/OpeningsClient";
import { getCareersActor } from "@/lib/careers/careersAccess";
import { listPostingsForAdmin } from "@/lib/careers/careersService";

export const dynamic = "force-dynamic";

export default async function CareersOpeningsPage() {
  if (!(await getCareersActor("view"))) redirect("/dashboard?restricted=1");
  return <OpeningsClient initial={await listPostingsForAdmin()} />;
}
