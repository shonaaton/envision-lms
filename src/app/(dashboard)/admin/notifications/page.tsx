import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Notification } from "@/models/Fee";
import { Bell, CheckCircle2, MailOpen, Megaphone } from "lucide-react";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") redirect("/dashboard");

  await dbConnect();
  const notifications: any[] = await Notification.find({})
    .populate("user", "name email role username")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  const unread = notifications.filter((item) => !item.readAt).length;
  const announcements = notifications.filter((item) => item.type === "announcement").length;

  return (
    <div className="min-h-screen text-slate-950">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-brand">
            <Bell size={14} />
            Administration
          </div>
          <h1 className="mt-3 text-3xl font-black text-brand">Notifications</h1>
          <p className="mt-1 text-sm text-slate-600">Review platform notifications delivered to students and coaches.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-brand/10 bg-white p-3 shadow-xl shadow-brand/10">
          <Stat label="Total" value={notifications.length} icon={<Bell size={15} />} />
          <Stat label="Unread" value={unread} icon={<MailOpen size={15} />} />
          <Stat label="Announcements" value={announcements} icon={<Megaphone size={15} />} />
        </div>
      </div>

      <section className="overflow-hidden rounded-3xl border border-brand/10 bg-white shadow-2xl shadow-brand/10">
        <div className="grid grid-cols-[1.1fr_1.2fr_1.6fr_120px_160px] border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
          <span>Recipient</span>
          <span>Title</span>
          <span>Message</span>
          <span>Status</span>
          <span>Sent</span>
        </div>
        {notifications.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No notifications have been created yet.</div>
        ) : (
          notifications.map((item) => (
            <div key={item._id.toString()} className="grid grid-cols-[1.1fr_1.2fr_1.6fr_120px_160px] items-center border-b border-slate-100 px-4 py-3 text-sm last:border-b-0">
              <div className="min-w-0">
                <div className="truncate font-bold text-slate-950">{item.user?.name || "Unknown user"}</div>
                <div className="truncate text-xs text-slate-500">{item.user?.email || item.user?.username || item.user?.role || "-"}</div>
              </div>
              <div className="min-w-0">
                <div className="truncate font-semibold text-slate-950">{item.title}</div>
                <div className="mt-0.5 text-xs font-semibold uppercase tracking-[0.12em] text-brand/70">{item.type}</div>
              </div>
              <div className="line-clamp-2 text-slate-600">{item.message}</div>
              <div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${item.readAt ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {item.readAt ? <CheckCircle2 size={13} /> : <MailOpen size={13} />}
                  {item.readAt ? "Read" : "Unread"}
                </span>
              </div>
              <div className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="min-w-28 rounded-xl bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-1 text-xs font-semibold text-slate-500">{icon}{label}</div>
      <div className="mt-1 text-xl font-black text-brand">{value}</div>
    </div>
  );
}
