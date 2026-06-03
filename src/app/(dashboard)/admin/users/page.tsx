import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";
import { redirect } from "next/navigation";

export default async function AdminUsersPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") redirect("/dashboard");
  await dbConnect();
  const list = await User.find({}, { passwordHash: 0 }).sort({ createdAt: -1 }).lean();
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-accent">Users</h1>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-400">
            <tr><th className="py-2 text-left">Name</th><th className="text-left">Email</th><th className="text-left">Role</th><th className="text-left">Active</th></tr>
          </thead>
          <tbody>
            {list.map((u: any) => (
              <tr key={u._id} className="border-t border-ink-700">
                <td className="py-2 text-white">{u.name}</td>
                <td>{u.email}</td>
                <td><span className="chip">{u.role}</span></td>
                <td>{u.isActive ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
