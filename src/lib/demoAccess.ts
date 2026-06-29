import { User } from "@/models/User";

export type DemoFeature = "playComputer" | "squareTrainer" | "tacticsTrainer" | "kingHunt" | "analysisBoard";

export async function demoUsageState(userId: string, feature: DemoFeature) {
  const user: any = await User.findById(userId).select("accountStatus demoLimits demoUsage").lean();
  const isDemo = user?.accountStatus === "demo";
  const used = Number(user?.demoUsage?.[feature] || 0);
  const limit = Number(user?.demoLimits?.[feature] ?? (feature === "kingHunt" ? 3 : 0));
  return { isDemo, used, limit, remaining: Math.max(0, limit - used), allowed: !isDemo || used < limit };
}

export async function consumeDemoUsage(userId: string, feature: DemoFeature) {
  const state = await demoUsageState(userId, feature);
  if (!state.allowed) return state;
  if (state.isDemo) {
    const updated: any = await User.findOneAndUpdate(
      {
        _id: userId,
        accountStatus: "demo",
        $expr: {
          $lt: [
            { $ifNull: [`$demoUsage.${feature}`, 0] },
            { $ifNull: [`$demoLimits.${feature}`, feature === "kingHunt" ? 3 : 0] },
          ],
        },
      },
      { $inc: { [`demoUsage.${feature}`]: 1 } },
      { new: true, projection: { accountStatus: 1, demoLimits: 1, demoUsage: 1 } }
    ).lean();

    if (!updated) return { ...state, allowed: false, remaining: 0 };

    const used = Number(updated.demoUsage?.[feature] || 0);
    const limit = Number(updated.demoLimits?.[feature] ?? (feature === "kingHunt" ? 3 : 0));
    return { isDemo: true, used, limit, remaining: Math.max(0, limit - used), allowed: true };
  }
  return state;
}
