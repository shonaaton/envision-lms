import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";
import { sealTempPassword } from "@/lib/tempPasswords";

/**
 * Seals temporary passwords written in plain text before they were encrypted
 * (see lib/tempPasswords.ts).
 *
 * This goes to the raw collection on purpose. Mongoose runs the model's setter
 * on query filters as well as on updates, so a filter naming the old plain
 * value would be sealed too and match nothing. Each update is conditional on
 * the stored value being unchanged, so a reset landing at the same moment wins.
 * Safe to repeat: sealed values are skipped.
 */
export async function sealLegacyTempPasswords(batchSize = 200) {
  await dbConnect();
  const users = User.collection;
  const legacy = await users
    .find({ tempPassword: { $type: "string", $not: /^enc:v1:/ } }, { projection: { _id: 1, tempPassword: 1 } })
    .limit(batchSize)
    .toArray();
  let sealed = 0;
  for (const user of legacy) {
    const plain = user.tempPassword as string;
    if (!plain) continue;
    const next = sealTempPassword(plain);
    if (next === plain) continue; // no AUTH_SECRET to seal with
    const result = await users.updateOne({ _id: user._id, tempPassword: plain }, { $set: { tempPassword: next } });
    sealed += result.modifiedCount;
  }
  return { checked: legacy.length, sealed };
}
