import Link from "next/link";
import { Video } from "lucide-react";

/** Why a branch live room did not open, with the way back. */
export function LiveRoomNotice({ title, message, backHref, backLabel, meetingUrl }: { title: string; message: string; backHref: string; backLabel: string; meetingUrl?: string }) {
  return (
    <div className="mx-auto max-w-lg rounded-lg border border-brand/10 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-black text-slate-950">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{message}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={backHref} className="btn-secondary h-9 px-3 text-sm">
          {backLabel}
        </Link>
        {meetingUrl ? (
          <a href={meetingUrl} target="_blank" rel="noreferrer" className="btn-primary h-9 px-3 text-sm">
            <Video size={15} /> Open Google Meet
          </a>
        ) : null}
      </div>
    </div>
  );
}
