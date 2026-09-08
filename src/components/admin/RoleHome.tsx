import Link from "next/link";
import { getNavigationFeatureState, type SessionUser } from "@/lib/featureAccess";
import { FEATURE_DEFINITIONS } from "@/lib/featureRegistry";
import { resolveAccessRole } from "@/lib/accessRoles";

export default async function RoleHome({ user }: { user: SessionUser & { name?: string | null } }) {
  const assigned = user.id ? await resolveAccessRole(user.id) : null;
  const state = await getNavigationFeatureState(user);
  const features = FEATURE_DEFINITIONS.filter(feature => state[feature.key]?.visible && state[feature.key]?.status !== "coming_soon" && feature.routes.length && !["dashboard", "accountSettings", "notifications"].includes(feature.key));
  return <div className="space-y-5">
    <div className="rounded-xl border border-purple-100 bg-white p-5"><p className="text-xs font-semibold text-purple-700">{assigned?.roleName || "Staff workspace"}</p><h1 className="mt-1 text-2xl font-semibold">Welcome, {user.name || "Team member"}</h1><p className="mt-2 text-sm text-slate-500">{assigned && !assigned.roleEnabled ? "Your role is inactive. Contact the academy administrator to restore access." : "Your workspace includes the features assigned to your role."}</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{features.map(feature => <Link key={feature.key} href={feature.routes.find(route => !route.startsWith("/instructor") && !route.startsWith("/chess-profile")) || feature.routes[0]} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-purple-300 hover:shadow-sm"><p className="text-[11px] font-medium text-purple-700">{feature.category}</p><h2 className="mt-1 font-semibold">{feature.label}</h2><p className="mt-1 text-xs text-slate-500">{feature.description}</p></Link>)}</div>
    {!features.length && <p className="rounded-lg bg-white p-4 text-sm text-slate-500">No workspace features are available. Ask an administrator to update your role.</p>}
  </div>;
}
