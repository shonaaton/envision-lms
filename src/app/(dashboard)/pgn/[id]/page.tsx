import { dbConnect } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PGN } from "@/models/PGN";
import PgnViewer from "@/components/quiz/PgnViewer";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PgnDetail({ params, searchParams }: { params: { id: string }; searchParams?: { folder?: string } }) {
  const session = await auth();
  if (!session) notFound();
  if ((session.user as any).role === "student") notFound();
  await dbConnect();
  const game: any = await PGN.findOne({ _id: params.id, uploadedBy: (session.user as any).id }).lean();
  if (!game) notFound();

  const folderFilter = game.folder
    ? { folder: game.folder }
    : { $or: [{ folder: { $exists: false } }, { folder: null }, { folder: "" }] };
  const folderGames: any[] = await PGN.find({
    uploadedBy: (session.user as any).id,
    ...folderFilter,
  }).sort({ createdAt: -1 }).select("_id title").lean();
  const currentIndex = folderGames.findIndex((item) => item._id.toString() === game._id.toString());
  const previousGame = currentIndex > 0 ? folderGames[currentIndex - 1] : null;
  const nextGame = currentIndex >= 0 && currentIndex < folderGames.length - 1 ? folderGames[currentIndex + 1] : null;
  const folderName = searchParams?.folder || game.folder || "";
  const folderQuery = folderName ? `?folder=${encodeURIComponent(folderName)}` : "";
  const backHref = folderQuery ? `/pgn${folderQuery}` : "/pgn";
  const previousFile = previousGame ? { href: `/pgn/${previousGame._id.toString()}${folderQuery}`, title: previousGame.title } : null;
  const nextFile = nextGame ? { href: `/pgn/${nextGame._id.toString()}${folderQuery}`, title: nextGame.title } : null;

  return (
    <div className="-m-6 min-h-screen space-y-3 bg-slate-50 p-5 text-slate-950">
      <div>
        <h1 className="font-display text-2xl">{game.title}</h1>
        <div className="mt-1 text-sm text-slate-500">
          {game.white || "?"} vs {game.black || "?"} - {game.result || "*"} {game.event && `- ${game.event}`}
        </div>
        {folderGames.length > 1 && (
          <div className="mt-2 text-xs font-medium text-slate-400">
            {currentIndex + 1} of {folderGames.length} in {game.folder || "Unfiled PGNs"}
          </div>
        )}
      </div>
      <PgnViewer pgn={game.pgn} backHref={backHref} previousFile={previousFile} nextFile={nextFile} />
    </div>
  );
}
