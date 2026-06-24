import { dbConnect } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PGN } from "@/models/PGN";
import PgnViewer from "@/components/quiz/PgnViewer";
import { notFound } from "next/navigation";
import { buildPgnLibraryFilter } from "@/lib/pgnAccess";

export const dynamic = "force-dynamic";

export default async function PgnDetail({ params, searchParams }: { params: { id: string }; searchParams?: { folder?: string; scope?: string } }) {
  const session = await auth();
  if (!session) notFound();
  if ((session.user as any).role === "student") notFound();
  await dbConnect();
  const game: any = await PGN.findOne(buildPgnLibraryFilter(session, { _id: params.id })).lean();
  if (!game) notFound();

  const folderFilter = game.folder
    ? { folder: game.folder }
    : { $or: [{ folder: { $exists: false } }, { folder: null }, { folder: "" }] };
  const folderGames: any[] = await PGN.find(buildPgnLibraryFilter(session, folderFilter)).sort({ createdAt: -1 }).select("_id title visibility").lean();
  const scopedFolderGames = folderGames.filter((item) => (searchParams?.scope === "shared" ? item.visibility === "shared" : item.visibility !== "shared"));
  const currentIndex = scopedFolderGames.findIndex((item) => item._id.toString() === game._id.toString());
  const previousGame = currentIndex > 0 ? scopedFolderGames[currentIndex - 1] : null;
  const nextGame = currentIndex >= 0 && currentIndex < scopedFolderGames.length - 1 ? scopedFolderGames[currentIndex + 1] : null;
  const folderName = searchParams?.folder || game.folder || "";
  const folderQuery = folderName ? `?folder=${encodeURIComponent(folderName)}${searchParams?.scope ? `&scope=${encodeURIComponent(searchParams.scope)}` : ""}` : "";
  const backHref = folderQuery ? `/pgn${folderQuery}` : "/pgn";
  const previousFile = previousGame ? { href: `/pgn/${previousGame._id.toString()}${folderQuery}`, title: previousGame.title } : null;
  const nextFile = nextGame ? { href: `/pgn/${nextGame._id.toString()}${folderQuery}`, title: nextGame.title } : null;

  return (
    <div className="flex h-[calc(100vh-92px)] min-h-0 flex-col gap-3 overflow-hidden bg-slate-50 p-3 text-slate-950">
      <div className="flex-none">
        <h1 className="truncate font-display text-xl">{game.title}</h1>
        <div className="mt-1 text-sm text-slate-500">
          {game.white || "?"} vs {game.black || "?"} - {game.result || "*"} {game.event && `- ${game.event}`}
        </div>
        {scopedFolderGames.length > 1 && (
          <div className="mt-2 text-xs font-medium text-slate-400">
            {currentIndex + 1} of {scopedFolderGames.length} in {game.folder || "Unfiled PGNs"}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <PgnViewer pgn={game.pgn} backHref={backHref} previousFile={previousFile} nextFile={nextFile} />
      </div>
    </div>
  );
}
