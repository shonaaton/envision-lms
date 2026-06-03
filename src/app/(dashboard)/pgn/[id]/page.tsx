import { dbConnect } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PGN } from "@/models/PGN";
import PgnViewer from "@/components/quiz/PgnViewer";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PgnDetail({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) notFound();
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

  return (
    <div className="-m-6 min-h-screen space-y-6 bg-slate-50 p-6 text-slate-950">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="font-display text-3xl">{game.title}</h1>
          <div className="mt-1 text-sm text-slate-500">
            {game.white || "?"} vs {game.black || "?"} - {game.result || "*"} {game.event && `- ${game.event}`}
          </div>
          {folderGames.length > 1 && (
            <div className="mt-2 text-xs font-medium text-slate-400">
              {currentIndex + 1} of {folderGames.length} in {game.folder || "Unfiled PGNs"}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={previousGame ? `/pgn/${previousGame._id.toString()}` : "#"}
            className={[
              "inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-medium transition",
              previousGame ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50" : "pointer-events-none border-slate-100 bg-slate-100 text-slate-300",
            ].join(" ")}
            aria-disabled={!previousGame}
          >
            Previous file
          </Link>
          <Link
            href={nextGame ? `/pgn/${nextGame._id.toString()}` : "#"}
            className={[
              "inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-medium transition",
              nextGame ? "border-brand bg-brand text-white hover:bg-brand-600" : "pointer-events-none border-slate-100 bg-slate-100 text-slate-300",
            ].join(" ")}
            aria-disabled={!nextGame}
          >
            Next file
          </Link>
        </div>
      </div>
      <PgnViewer pgn={game.pgn} />
    </div>
  );
}
