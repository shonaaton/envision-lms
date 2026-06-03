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
  const game: any = await PGN.findOne({ _id: params.id, uploadedBy: (session.user as any).id }).lean();
  if (!game) notFound();

  return (
    <div className="-m-6 min-h-screen space-y-6 bg-slate-50 p-6 text-slate-950">
      <div>
        <h1 className="font-display text-3xl">{game.title}</h1>
        <div className="mt-1 text-sm text-slate-500">
          {game.white || "?"} vs {game.black || "?"} - {game.result || "*"} {game.event && `- ${game.event}`}
        </div>
      </div>
      <PgnViewer pgn={game.pgn} />
    </div>
  );
}
