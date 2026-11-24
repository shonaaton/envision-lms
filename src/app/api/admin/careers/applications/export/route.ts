import { forbidden, getCareersActor } from "@/lib/careers/careersAccess";
import { answerText } from "@/lib/careers/careersConfig";
import { listApplications, parseApplicationFilters } from "@/lib/careers/careersService";
import { toXlsx, type Sheet } from "@/lib/spreadsheet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The applications list as an Excel file, with the current filters. Admins with Export only. */
export async function GET(req: Request) {
  const actor = await getCareersActor("export");
  if (!actor) return forbidden();
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const { applications } = await listApplications(parseApplicationFilters(params), 5000);

  const questions: string[] = [];
  for (const application of applications) {
    for (const answer of application.answers) if (!questions.includes(answer.question)) questions.push(answer.question);
  }
  const sheet: Sheet = {
    name: "Applications",
    columns: [
      { label: "Applied on", type: "datetime" },
      { label: "Opening" },
      { label: "Stage" },
      { label: "Name" },
      { label: "WhatsApp" },
      { label: "WhatsApp verified" },
      { label: "Email" },
      { label: "City" },
      { label: "Age" },
      { label: "Current role" },
      { label: "Experience (years)" },
      { label: "Languages" },
      { label: "Profile link" },
      { label: "FIDE ID" },
      { label: "Chess rating" },
      { label: "Rating (1-5)" },
      { label: "Interview" },
      { label: "Resume" },
      ...questions.map((label) => ({ label })),
    ],
    rows: applications.map((item) => {
      const byQuestion = new Map(item.answers.map((answer: any) => [answer.question, answerText(answer.answer)]));
      return [
        item.createdAt ? new Date(item.createdAt) : "",
        item.postingTitle,
        item.stage,
        item.name,
        `${item.countryCode} ${item.phone}`.trim(),
        item.whatsappVerified ? "Yes" : "No",
        item.email,
        item.city,
        item.age ?? "",
        item.currentRole,
        item.experienceYears ?? "",
        item.languages,
        item.profileLink,
        item.fideId,
        item.chessRating,
        item.rating || "",
        item.interviewAt ? new Date(item.interviewAt).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "",
        item.resume ? item.resume.name : "",
        ...questions.map((question) => byQuestion.get(question) || ""),
      ];
    }),
  };
  const buffer = toXlsx([sheet]);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="careers-applications-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
