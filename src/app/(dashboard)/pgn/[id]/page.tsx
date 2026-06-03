import { dbConnect } from "@/lib/db";
import { PGN } from "@/models/PGN";
import PgnViewer from "@/components/quiz/PgnViewer";
import { notFound } from "next/navigation";

export default async function PgnDetail({ params }: { params: { id: string } }) {
  await dbConnect();
  const g: any = await PGN.findById(params.id).lean();
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
