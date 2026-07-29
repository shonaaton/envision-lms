import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Notification } from "@/models/Fee";
import { Bell, CheckCircle2, MailOpen, Megaphone } from "lucide-react";
import { redirect } from "next/navigation";
import Link from "next/link";

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
    <div className="min-h-screen min-w-0 text-slate-950">
      <div className="mb-5 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-brand">
            <Bell size={14} />
            Administration
          </div>
          <h1 className="mt-3 text-3xl font-black text-brand">Notifications</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Review platform notifications delivered to students and coaches.</p>
        </div>
        <div className="grid grid-cols-1 gap-2 rounded-2xl border border-brand/10 bg-white p-3 shadow-xl shadow-brand/10 sm:grid-cols-3">
          <Stat label="Total" value={notifications.length} icon={<Bell size={15} />} />
          <Stat label="Unread" value={unread} icon={<MailOpen size={15} />} />
          <Stat label="Announcements" value={announcements} icon={<Megaphone size={15} />} />
        </div>
      </div>

      <section className="overflow-hidden rounded-3xl border border-brand/10 bg-white shadow-2xl shadow-brand/10">
        {notifications.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No notifications have been created yet.</div>
        ) : (
          <>
            <div className="divide-y divide-slate-100 lg:hidden">
              {notifications.map((item) => {
                const href = item.metadata?.href || (item.metadata?.conversation
                  ? `/ask-coach?conversation=${item.metadata.conversation}${item.metadata?.message ? `&message=${item.metadata.message}` : ""}`
                  : "");
                return (
                  <NotificationCard
                    key={item._id.toString()}
                    item={item}
                    href={href}
                  />
                );
              })}
            </div>

            <div className="hidden lg:block">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_128px_156px_110px] border-b border-slate-200 bg-slate-50 px-5 py-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                <span>Recipient</span>
                <span>Title</span>
                <span>Message</span>
                <span>Status</span>
                <span>Sent</span>
                <span className="text-right">Action</span>
              </div>
              <div className="max-h-[calc(100dvh-20rem)] overflow-y-auto overscroll-contain">
                {notifications.map((item) => {
                  const href = item.metadata?.href || (item.metadata?.conversation
                    ? `/ask-coach?conversation=${item.metadata.conversation}${item.metadata?.message ? `&message=${item.metadata.message}` : ""}`
                    : "");
                  return (
                    <NotificationTableRow
                      key={item._id.toString()}
                      item={item}
                      href={href}
                    />
                  );
                })}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-1 text-xs font-semibold text-slate-500">{icon}{label}</div>
      <div className="mt-1 text-xl font-black text-brand">{value}</div>
    </div>
  );
}

function notificationHrefLabel(href: string) {
  if (href.startsWith("/ask-coach")) return "Open Chat";
  if (href.startsWith("/booking")) return "Open Booking";
  if (href.startsWith("/availability")) return "Open Availability";
  if (href.startsWith("/admin")) return "Review";
  return "Open";
}

function NotificationStatus({ readAt }: { readAt?: string | Date }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${readAt ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
      {readAt ? <CheckCircle2 size={13} /> : <MailOpen size={13} />}
      {readAt ? "Read" : "Unread"}
    </span>
  );
}

function NotificationCard({ item, href }: { item: any; href: string }) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-bold text-slate-950">{item.user?.name || "Unknown user"}</div>
          <div className="mt-1 truncate text-xs text-slate-500">{item.user?.email || item.user?.username || item.user?.role || "-"}</div>
        </div>
        <div className="shrink-0">
          <NotificationStatus readAt={item.readAt} />
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Title</div>
          <div className="mt-1 font-semibold text-slate-950">{item.title}</div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-brand/70">{item.type}</div>
        </div>

        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Message</div>
          <div className="mt-1 break-words text-sm leading-6 text-slate-600">{item.message}</div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Sent</div>
            <div className="mt-1 text-sm text-slate-500">{notificationTimeLabel(item)}</div>
          </div>
          {href ? (
            <span className="inline-flex h-10 items-center justify-center rounded-xl border border-brand/15 px-4 text-sm font-bold text-brand">
              {notificationHrefLabel(href)}
            </span>
          ) : null}
        </div>
      </div>
    </>
  );

  return href ? (
    <Link href={href} className="block border-b border-slate-100 p-4 transition last:border-b-0 hover:bg-brand/[0.03] sm:p-5">
      {content}
    </Link>
  ) : (
    <div className="border-b border-slate-100 p-4 last:border-b-0 sm:p-5">
      {content}
    </div>
  );
}

function NotificationTableRow({ item, href }: { item: any; href: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_128px_156px_110px] items-start gap-4 border-b border-slate-100 px-5 py-4 text-sm last:border-b-0">
      <div className="min-w-0">
        <div className="truncate font-bold text-slate-950">{item.user?.name || "Unknown user"}</div>
        <div className="mt-1 truncate text-xs text-slate-500">{item.user?.email || item.user?.username || item.user?.role || "-"}</div>
      </div>
      <div className="min-w-0">
        <div className="truncate font-semibold text-slate-950">{item.title}</div>
        <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-brand/70">{item.type}</div>
      </div>
      <div className="min-w-0 break-words leading-6 text-slate-600">{item.message}</div>
      <div className="pt-0.5">
        <NotificationStatus readAt={item.readAt} />
      </div>
      <div className="pt-1 text-xs leading-5 text-slate-500">{notificationTimeLabel(item)}</div>
      <div className="flex justify-end">
        {href ? (
          <Link href={href} className="inline-flex h-10 items-center justify-center rounded-xl border border-brand/15 px-3 text-xs font-bold text-brand transition hover:bg-brand hover:text-white">
            {notificationHrefLabel(href)}
          </Link>
        ) : (
          <span className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-400">
            No action
          </span>
        )}
      </div>
    </div>
  );
}

function notificationTimeLabel(item: any) {
  return item.metadata?.editedAt ? `Edited ${new Date(item.metadata.editedAt).toLocaleString()}` : new Date(item.createdAt).toLocaleString();
}
