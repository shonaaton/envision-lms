import "server-only";
import type { CentreDay } from "@/lib/centrePages";
import { publicSlots } from "./leads";
import { DEFAULT_ADMISSION_FEE_RUPEES, SLOT_FEES, quotedAdmissionFee } from "./rules";
import { getBranchSettings } from "./settings";
import type { BranchKey } from "./scope";

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Resolves to null if the database has not answered in time, so a page never hangs on it. */
function withTimeout<T>(work: Promise<T>, ms = 8000): Promise<T | null> {
  return Promise.race([work, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/**
 * The centre's live timetable for its public page: active offline slots only
 * (online classes never appear), each with its id and the seats still free.
 * Null when the database can't be reached, so the page falls back to its static list.
 */
export async function liveCentreSchedule(branch: BranchKey): Promise<CentreDay[] | null> {
  try {
    const slots = await withTimeout(publicSlots(branch));
    if (!slots?.length) return null;
    const days: CentreDay[] = [];
    for (const slot of slots) {
      const day = DAY[slot.dayOfWeek];
      let entry = days.find((item) => item.day === day);
      if (!entry) days.push((entry = { day, slots: [] }));
      entry.slots.push({ id: slot.id, from: slot.startTime, to: slot.endTime, seatsLeft: slot.free });
    }
    return days;
  } catch (error) {
    console.error("[centre page] live slots unavailable", error);
    return null;
  }
}

export type CentreFees = {
  /** Monthly fee by classes a week, in rupees. */
  monthly: { classesPerWeek: number; rupees: number }[];
  /** One-time admission fee in rupees. */
  admissionFee: number;
  /** Percent off when paying for several months at once. */
  planDiscounts?: { quarterly: number; half_yearly: number; yearly: number };
};

/** The centre's public fee card: the slot fee rule, the admission fee, and any multi-month discounts from its settings. */
export async function centreFees(branch: BranchKey): Promise<CentreFees> {
  const monthly = Object.entries(SLOT_FEES)
    .map(([count, rupees]) => ({ classesPerWeek: Number(count), rupees }))
    .sort((a, b) => a.classesPerWeek - b.classesPerWeek);
  try {
    const settings = await withTimeout(getBranchSettings(branch));
    if (!settings) return { monthly, admissionFee: DEFAULT_ADMISSION_FEE_RUPEES };
    return { monthly, admissionFee: quotedAdmissionFee(settings.admissionFee), planDiscounts: settings.planDiscounts };
  } catch (error) {
    console.error("[centre page] fee settings unavailable", error);
    return { monthly, admissionFee: DEFAULT_ADMISSION_FEE_RUPEES };
  }
}
