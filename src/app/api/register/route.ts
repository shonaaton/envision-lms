import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { dbConnect } from "@/lib/db";
import { User, generateUsername } from "@/models/User";
import { CoachApplication } from "@/models/Onboarding";
import { registerSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = registerSchema.parse(body);
    await dbConnect();
    const exists = await User.findOne({ email: data.email.toLowerCase() });
    if (exists) return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    if (!data.acceptedPrivacy || !data.acceptedTerms || !data.acceptedRefund) {
      return NextResponse.json({ error: "Please accept the academy policies to continue." }, { status: 400 });
    }

    if (data.role === "instructor") {
      const existingApplication = await CoachApplication.findOne({ email: data.email.toLowerCase(), status: { $in: ["pending", "shortlisted"] } });
      if (existingApplication) return NextResponse.json({ error: "A coach application is already pending for this email." }, { status: 409 });
      const application = await CoachApplication.create({
        name: data.name,
        email: data.email.toLowerCase(),
        phone: data.phone,
        countryCode: data.countryCode,
        city: data.city,
        country: data.country,
        experience: data.coachExperience,
        playingLevel: data.playingLevel,
        fideId: data.fideId,
        rating: data.rating,
        preferredStudents: data.preferredStudents,
        availabilityNote: data.availabilityNote,
        message: data.message,
      });
      return NextResponse.json({ id: application._id.toString(), type: "coach_application" });
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const username = await generateUsername(data.name);
    const now = new Date();
    const user = await User.create({
      username,
      name: data.name,
      email: data.email.toLowerCase(),
      passwordHash,
      role: "student",
      accountStatus: "demo",
      demoLimits: { playComputer: 3, squareTrainer: 3, tacticsTrainer: 3, analysisBoard: 0 },
      demoUsage: { playComputer: 0, squareTrainer: 0, tacticsTrainer: 0, analysisBoard: 0 },
      phone: data.phone,
      countryCode: data.countryCode,
      parentName: data.parentName,
      city: data.city,
      country: data.country,
      studentLevel: data.level || "not_set",
      acceptedPrivacyAt: now,
      acceptedTermsAt: now,
      acceptedRefundAt: now,
      tags: ["demo"],
    });
    return NextResponse.json({ id: user._id.toString(), type: "demo_student" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Bad request" }, { status: 400 });
  }
}
