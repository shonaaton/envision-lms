import { MessageSquareQuote } from "lucide-react";
import { coachFamilyNotes } from "@/lib/retention/familyCallService";

/**
 * Notes the retention team chose to share from their calls with a coach's
 * families (last six weeks). Only the shared note ever reaches a coach - never
 * the call's other notes, fees or pause details. Renders nothing when empty.
 */
export default async function CoachFamilyNotesPanel({ coachId }: { coachId: string }) {
  const notes = await coachFamilyNotes(coachId).catch(() => []);
  if (!notes.length) return null;
  return (
    <section className="rounded-2xl border border-brand/10 bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-black text-slate-950">
        <MessageSquareQuote size={16} className="text-brand" />
        Notes from parent calls
      </h2>
      <ul className="mt-3 space-y-2">
        {notes.map((note) => (
          <li key={note._id} className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-600">
              {note.title.replace(/^Note from a call with /, "")}
              <span className="ml-2 font-normal text-slate-400">
                {new Date(note.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}
              </span>
            </p>
            <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-800">{note.message}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
