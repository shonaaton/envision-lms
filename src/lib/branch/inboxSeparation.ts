import { BranchLead, BranchStudent, BranchWaitlist } from "@/models/Branch";
import { User } from "@/models/User";
import { tenDigitPhone } from "./admissionRules";

/**
 * The academy has one WhatsApp number and one message store, so a Bowbazar
 * family's chat lands in the same place as an online family's. The branch admin
 * reads it through /bowbazar/whatsapp; the online inbox must not show it.
 *
 * A number is "branch only" when a Bowbazar student, enquiry or waitlist record
 * holds it and no online account does. A family with children in both branches stays visible
 * online - the online team still has to answer them.
 */
export function branchOnlyNationals(branchPhones: unknown[], onlinePhones: unknown[]) {
  const online = new Set(onlinePhones.map(tenDigitPhone).filter(Boolean));
  return new Set(branchPhones.map(tenDigitPhone).filter((phone) => phone && !online.has(phone)));
}

/** The ten-digit national part, when the stored inbox number is an Indian mobile. */
export function inboxNational(phoneNumber: string) {
  return tenDigitPhone(phoneNumber);
}

const CACHE_MS = 60_000;
let cache: { at: number; nationals: Set<string> } | null = null;

/** Branch-only family numbers (ten digits). Cached for a minute: the inbox polls. */
export async function branchOnlyInboxNationals(now = Date.now()) {
  if (cache && now - cache.at < CACHE_MS) return cache.nationals;
  // Enquiries and waitlist families get the centre's slots/fees and seat-free messages
  // before they are students; those chats belong to the branch too.
  const [students, leads, waitlist]: any[][] = await Promise.all([
    BranchStudent.find({}).select("phone").lean(),
    BranchLead.find({ countryCode: { $in: [null, "", "+91"] } }).select("phone").lean(),
    BranchWaitlist.find({}).select("phone").lean(),
  ]);
  const branchPhones = [...students, ...leads, ...waitlist].map((row) => row.phone);
  const nationals = [...new Set(branchPhones.map(tenDigitPhone).filter(Boolean))];
  let onlinePhones: unknown[] = [];
  if (nationals.length) {
    const spellings = nationals.flatMap((phone) => [phone, `91${phone}`, `+91${phone}`, `0${phone}`]);
    const accounts: any[] = await User.find({ branch: null, $or: [{ phoneCanonical: { $in: nationals.map((phone) => `91${phone}`) } }, { phone: { $in: spellings } }] })
      .setOptions({ allBranches: true })
      .select("phone")
      .lean();
    onlinePhones = accounts.map((account) => account.phone);
  }
  cache = { at: now, nationals: branchOnlyNationals(branchPhones, onlinePhones) };
  return cache.nationals;
}

/** True when this stored inbox number belongs only to a branch family. */
export async function isBranchOnlyInboxNumber(phoneNumber: string) {
  const national = inboxNational(phoneNumber);
  return Boolean(national) && (await branchOnlyInboxNationals()).has(national);
}

export function clearBranchInboxCache() {
  cache = null;
}
