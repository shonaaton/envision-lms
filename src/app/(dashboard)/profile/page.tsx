import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";
import ProfileEditor, { type ProfileData } from "./ProfileEditor";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = (session.user as any).role as string;
  if (role !== "student" && role !== "instructor") redirect("/dashboard");

  await dbConnect();
  const user: any = await User.findById((session.user as any).id)
    .select("name username email countryCode phone role accountStatus city country gender avatar fideId rating studentLevel parentName")
    .lean();

  if (!user) redirect("/login");

  const storedAvatar = String(user.avatar || "");
  const safeAvatar =
    /^#[0-9a-fA-F]{6}$/.test(storedAvatar) ||
    /^\/images\/profiles\/[A-Za-z0-9._-]+$/.test(storedAvatar)
      ? storedAvatar
      : "#5a1372";

  const profile: ProfileData = {
    name: user.name || "",
    username: user.username || "",
    email: user.email || "",
    phone: [user.countryCode, user.phone].filter(Boolean).join(" "),
    role: user.role,
    accountStatus: user.accountStatus || "enrolled",
    city: user.city || "",
    country: user.country || "",
    gender: user.gender || "not_available",
    avatar: safeAvatar,
    fideId: user.fideId || "",
    rating: Number(user.rating || 0),
    studentLevel: user.studentLevel || "not_set",
    parentName: user.parentName || "",
  };

  return <ProfileEditor initialProfile={profile} />;
}
