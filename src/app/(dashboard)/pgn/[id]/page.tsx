import { dbConnect } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PGN } from "@/models/PGN";
import PgnViewer from "@/components/quiz/PgnViewer";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PgnDetail({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) notFound();
  await dbConnect();
  const g: any = await PGN.findOne({ _id: params.id, uploadedBy: (session.user as any).id }).lean();
  if (!g) notFound();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl text-accent">{g.title}</h1>
        <div className="text-sm text-gray-400">{g.white || "?"} vs {g.black || "?"} • {g.result || "*"} {g.event && `• ${g.event}`}</div>
      </div>
      <PgnViewer pgn={g.pgn} />
    </div>
  );
}
