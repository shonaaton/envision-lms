import { ClipboardList, MessageSquare, MonitorSmartphone, ShieldCheck, Target, Trophy, type LucideIcon } from "lucide-react";

/**
 * Why the academy, in the order a parent asks it.
 *
 * Every claim maps to something the platform can actually back - the ladder
 * numbers come from the taught syllabus in `demoCurriculum`, and the rest are
 * features that exist in the portal. Shared so the landing page and the course
 * pages make the same promises rather than drifting into two pitches.
 */
export type AcademyReason = {
  title: string;
  detail: string;
  icon: LucideIcon;
};

export const academyReasons: AcademyReason[] = [
  {
    title: "A real curriculum, not ad-hoc lessons",
    detail:
      "Five stages, fifteen levels and 240 taught sessions, from the first move through to Masters. Every level is sixteen sessions across two months.",
    icon: ClipboardList,
  },
  {
    title: "Your child starts at the right level",
    detail:
      "A free assessment with a coach places them at the exact session to begin from, rather than a generic beginner slot.",
    icon: Target,
  },
  {
    title: "Everything in one portal",
    detail:
      "Live classes, homework, tournaments, coach feedback, progress reports, invoices and payments behind a single login.",
    icon: MonitorSmartphone,
  },
  {
    title: "Feedback every week",
    detail:
      "Coaches review submitted homework and answer questions between classes, so nothing waits until the next session.",
    icon: MessageSquare,
  },
  {
    title: "Competition is built in",
    detail:
      "Weekly academy tournaments with real pairings, live games, results and leaderboards - not just practice games.",
    icon: Trophy,
  },
  {
    title: "Parents can see all of it",
    detail:
      "Attendance, assignment scores, tournament results and fee history are visible to parents, not only to the student.",
    icon: ShieldCheck,
  },
];
