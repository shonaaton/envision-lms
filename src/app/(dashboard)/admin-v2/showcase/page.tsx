import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2ShowcaseClient from "@/components/admin-v2/AdminV2ShowcaseClient";

export const dynamic = "force-dynamic";

export default function AdminV2ShowcasePage() {
  return (
    <AdminV2Shell
      title="Showcase Pilot"
      description="A visual achievement management workspace built in parallel with the current achievements page."
      activeHref="/admin-v2/showcase"
    >
      <AdminV2ShowcaseClient />
    </AdminV2Shell>
  );
}

