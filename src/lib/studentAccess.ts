import { User } from "@/models/User";
export { inactiveStudentMessage } from "@/lib/studentStatus";

export async function getStudentAccessState(userId: string) {
  const user: any = await User.findById(userId).select("role isActive accountStatus name email").lean();
  return {
    user,
    isStudent: user?.role === "student",
    isCurrentStudent: user?.role === "student" && user?.isActive !== false,
  };
}

export async function isCurrentStudent(userId: string) {
  const state = await getStudentAccessState(userId);
  return state.isCurrentStudent;
}
