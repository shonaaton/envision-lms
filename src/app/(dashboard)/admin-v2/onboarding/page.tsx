import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2OnboardingClient from "@/components/admin-v2/AdminV2OnboardingClient";

export const dynamic = "force-dynamic";

export default function AdminV2OnboardingPage() {
  return (
    <AdminV2Shell
      title="Onboarding Pilot"
      description="Review demo requests and coach applications from a separate test workspace. Existing onboarding routes and automations remain untouched."
      activeHref="/admin-v2/onboarding"
    >
      <AdminV2OnboardingClient />
    </AdminV2Shell>
  );
}

