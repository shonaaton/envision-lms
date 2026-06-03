/**
 * Seed script — creates one admin, one instructor, two students, one classroom.
 * Run with:  npm run seed
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { dbConnect } from "../src/lib/db";
import { User } from "../src/models/User";
import { Classroom } from "../src/models/Classroom";

async function main() {
  await dbConnect();
  const hash = async (p: string) => bcrypt.hash(p, 10);

  const admin = await User.findOneAndUpdate(
    { email: "admin@envision.local" },
    { name: "Admin", email: "admin@envision.local", passwordHash: await hash("admin12345"), role: "admin" },
    { upsert: true, new: true }
  );
  const coach = await User.findOneAndUpdate(
    { email: "coach@envision.local" },
    { name: "Coach Sayantan", email: "coach@envision.local", passwordHash: await hash("coach12345"), role: "instructor" },
    { upsert: true, new: true }
  );
  const s1 = await User.findOneAndUpdate(
    { email: "student1@envision.local" },
    { name: "Student One", email: "student1@envision.local", passwordHash: await hash("student12345"), role: "student" },
    { upsert: true, new: true }
  );
  const s2 = await User.findOneAndUpdate(
    { email: "student2@envision.local" },
    { name: "Student Two", email: "student2@envision.local", passwordHash: await hash("student12345"), role: "student" },
    { upsert: true, new: true }
  );

  await Classroom.findOneAndUpdate(
    { title: "Sunday Beginners Batch" },
    {
      title: "Sunday Beginners Batch",
      description: "Foundation course covering openings, basic tactics and endgame patterns.",
      level: "beginner",
      instructor: coach._id,
      students: [s1._id, s2._id],
      feePerMonth: 150000, // ₹1500
      schedule: [{ dayOfWeek: 0, startTime: "10:00", endTime: "11:00" }],
    },
    { upsert: true }
  );

  console.log("Seeded:", { admin: admin.email, coach: coach.email, s1: s1.email, s2: s2.email });
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
