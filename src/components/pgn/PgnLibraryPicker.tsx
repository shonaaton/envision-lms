"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, ChevronLeft, Folder, Search, X } from "lucide-react";
import { folderBreadcrumbs, folderLabel, getImmediateChildPath, normalizeFolderPath } from "@/lib/pgnLibrary";
import { cn } from "@/lib/utils";
import MiniFenBoard, { previewFenFromPgn } from "@/components/pgn/MiniFenBoard";

export type PgnLibraryGame = {
  _id: string;
  title: string;
  white?: string;
  black?: string;
  result?: string;
  event?: string;
  date?: string;
  eco?: string;
  opening?: string;
  moveCount?: number;
  initialFen?: string;
  sideToMove?: "white" | "black";
  folder?: string;
  pgn: string;
  visibility?: "private" | "shared" | "classroom";
};

type FolderItem = {
  path: string;
  name: string;
  gameCount: number;
};

function sideToMoveLabel(game: PgnLibraryGame) {
  const fen = game.initialFen || game.pgn.match(/\[FEN\s+"([^"]+)"\]/)?.[1] || "";
  const side = game.sideToMove || (fen.split(/\s+/)[1] === "b" ? "black" : "white");
  return side === "black" ? "Black to play" : "White to play";
}

export default function PgnLibraryPicker({
  open,
  title = "Load from PGN Library",
  mode = "single",
  onClose,
  onSelect,
}: {
  open: boolean;
  title?: string;
  mode?: "single" | "multiple";
  onClose: () => void;
  onSelect: (games: PgnLibraryGame[]) => void;
}) {
  const [games, setGames] = useState<PgnLibraryGame[]>([]);
  const [query, setQuery] = useState("");
  const [activeFolder, setActiveFolder] = useState("");
  const [sort, setSort] = useState("recently-added");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");
    fetch("/api/pgn?limit=500&sort=recently-added", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load the PGN library.")))
      .then((data) => setGames(Array.isArray(data) ? data : []))
      .catch((err) => setError(err?.message || "Could not load the PGN library."))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSelectedIds([]);
      setQuery("");
      setActiveFolder("");
    }
  }, [open]);

  const allFolders = useMemo(() => {
    const map = new Map<string, FolderItem>();
    games.forEach((game) => {
      const path = normalizeFolderPath(game.folder);
      if (!path) return;
      const parts = path.split("/");
      parts.forEach((_, index) => {
        const folderPath = parts.slice(0, index + 1).join("/");
        const current = map.get(folderPath) || { path: folderPath, name: folderLabel(folderPath), gameCount: 0 };
        if (index === parts.length - 1) current.gameCount += 1;
        map.set(folderPath, current);
      });
    });
    return Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path));
  }, [games]);

  const visibleFolders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allFolders
      .filter((folder) => getImmediateChildPath(activeFolder, folder.path) === folder.path)
      .filter((folder) => !q || folder.name.toLowerCase().includes(q) || folder.path.toLowerCase().includes(q));
  }, [activeFolder, allFolders, query]);

  const visibleGames = useMemo(() => {
    const q = query.trim().toLowerCase();
    const folder = normalizeFolderPath(activeFolder);
    const sorted = games
      .filter((game) => normalizeFolderPath(game.folder) === folder)
      .filter((game) => {
        if (!q) return true;
        return [game.title, game.white, game.black, game.event, game.opening, game.eco, game.date, game.result]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));
      });
    sorted.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "players") return `${a.white || ""} ${a.black || ""}`.localeCompare(`${b.white || ""} ${b.black || ""}`);
      if (sort === "opening") return `${a.opening || ""} ${a.eco || ""}`.localeCompare(`${b.opening || ""} ${b.eco || ""}`);
      if (sort === "moves") return Number(b.moveCount || 0) - Number(a.moveCount || 0);
      if (sort === "date") return String(b.date || "").localeCompare(String(a.date || ""));
      return 0;
    });
    return sorted;
  }, [activeFolder, games, query, sort]);

  function toggleGame(game: PgnLibraryGame) {
    if (mode === "single") {
      setSelectedIds([game._id]);
      return;
    }
    setSelectedIds((current) => current.includes(game._id) ? current.filter((id) => id !== game._id) : [...current, game._id]);
  }

  function confirmSelection(game?: PgnLibraryGame) {
    const selected = game ? [game] : games.filter((item) => selectedIds.includes(item._id));
    if (!selected.length) return;
    onSelect(selected);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white text-slate-950 shadow-2xl">
        <header className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><BookOpen size={18} /> {title}</h2>
            <p className="mt-1 text-sm text-slate-500">Browse the master PGN library by folder, then load one game or a selected collection.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="Close PGN library picker">
            <X size={18} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="min-h-0 border-b border-slate-200 p-3 md:border-b-0 md:border-r">
            <label className="relative block">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-100" placeholder="Search library" />
            </label>
            <button type="button" onClick={() => setActiveFolder("")} className={cn("mt-3 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold", !activeFolder ? "bg-purple-50 text-purple-800" : "hover:bg-slate-50")}>
              <BookOpen size={16} /> Library Root
            </button>
            <div className="mt-2 max-h-[45vh] space-y-1 overflow-y-auto pr-1">
              {visibleFolders.map((folder) => (
                <button key={folder.path} type="button" onClick={() => setActiveFolder(folder.path)} className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Folder size={16} className="flex-none text-amber-500" />
                    <span className="truncate">{folder.name}</span>
                  </span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-500">{folder.gameCount}</span>
                </button>
              ))}
              {!loading && !visibleFolders.length && <div className="rounded-md border border-dashed border-slate-200 p-3 text-sm text-slate-500">No folders here.</div>}
            </div>
          </aside>

          <main className="flex min-h-0 flex-col p-3">
            <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
                {activeFolder && (
                  <button type="button" onClick={() => setActiveFolder(normalizeFolderPath(activeFolder).split("/").slice(0, -1).join("/"))} className="mr-2 inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-semibold">
                    <ChevronLeft size={14} /> Up
                  </button>
                )}
                <button type="button" onClick={() => setActiveFolder("")} className={!activeFolder ? "font-semibold text-slate-900" : "text-purple-700"}>Library</button>
                {activeFolder && folderBreadcrumbs(activeFolder).map((item) => (
                  <span key={item.path} className="contents">
                    <span className="text-slate-400">/</span>
                    <button type="button" onClick={() => setActiveFolder(item.path)} className={item.path === activeFolder ? "font-semibold text-slate-900" : "text-purple-700"}>{item.name}</button>
                  </span>
                ))}
              </div>
              <select value={sort} onChange={(event) => setSort(event.target.value)} className="h-10 rounded-md border border-slate-200 px-3 text-sm">
                <option value="recently-added">Recently added</option>
                <option value="title">File name</option>
                <option value="players">Player name</option>
                <option value="date">Date played</option>
                <option value="opening">Opening</option>
                <option value="moves">Number of moves</option>
              </select>
            </div>

            {error && <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</div>}
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {loading ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-lg bg-slate-100" />)}
                </div>
              ) : visibleGames.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {visibleGames.map((game) => {
                    const selected = selectedIds.includes(game._id);
                    return (
                      <article key={game._id} className={cn("rounded-lg border p-3 shadow-sm transition", selected ? "border-purple-400 ring-2 ring-purple-100" : "border-slate-200 hover:border-purple-200")}>
                        <button type="button" onClick={() => toggleGame(game)} className="block w-full text-left">
                          <div className="grid grid-cols-[112px_minmax(0,1fr)_24px] items-start gap-3">
                            <MiniFenBoard fen={previewFenFromPgn(game.pgn, game.initialFen)} className="w-[112px]" />
                            <div className="min-w-0">
                              <h3 className="truncate text-sm font-semibold">{game.title}</h3>
                              <p className="mt-1 truncate text-xs text-slate-500">{game.white || "White"} vs {game.black || "Black"} {game.result ? `- ${game.result}` : ""}</p>
                              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold text-slate-500">
                                {game.eco && <span className="rounded bg-slate-100 px-2 py-1">{game.eco}</span>}
                                {game.opening && <span className="rounded bg-slate-100 px-2 py-1">{game.opening}</span>}
                                <span className="rounded bg-purple-50 px-2 py-1 text-purple-700">{sideToMoveLabel(game)}</span>
                                {game.moveCount ? <span className="rounded bg-slate-100 px-2 py-1">{game.moveCount} moves</span> : null}
                                {game.date && <span className="rounded bg-slate-100 px-2 py-1">{game.date}</span>}
                              </div>
                            </div>
                            <span className={cn("grid h-6 w-6 flex-none place-items-center rounded-full border text-xs", selected ? "border-purple-600 bg-purple-600 text-white" : "border-slate-300 text-transparent")}><Check size={14} /></span>
                          </div>
                        </button>
                        {mode === "single" && <button type="button" onClick={() => confirmSelection(game)} className="mt-3 h-9 w-full rounded-md bg-purple-700 text-sm font-semibold text-white">Load this PGN</button>}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="flex min-h-52 items-center justify-center rounded-lg border border-dashed border-slate-200 text-center text-sm text-slate-500">
                  No PGNs found in this folder.
                </div>
              )}
            </div>

            {mode === "multiple" && (
              <footer className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
                <span className="text-sm font-semibold text-slate-600">{selectedIds.length} selected</span>
                <button type="button" onClick={() => confirmSelection()} disabled={!selectedIds.length} className="h-10 rounded-md bg-purple-700 px-4 text-sm font-semibold text-white disabled:opacity-50">Load Selected</button>
              </footer>
            )}
          </main>
        </div>
      </section>
    </div>
  );
}
