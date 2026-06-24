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
    await User.findByIdAndUpdate(userId, { $inc: { [`demoUsage.${feature}`]: 1 } });
    return { ...state, used: state.used + 1, remaining: Math.max(0, state.remaining - 1) };
  }
  return state;
}
