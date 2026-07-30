"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Box,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  FilePlus2,
  FileUp,
  Folder,
  Home,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Chess } from "chess.js";
import { toast } from "sonner";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

type PgnDoc = {
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
  hasAnnotations?: boolean;
  hasVariations?: boolean;
  initialFen?: string;
  sideToMove?: "white" | "black";
  sourceFileName?: string;
  createdAt?: string;
  updatedAt?: string;
  pgn: string;
  folder?: string;
  uploadedBy?: string;
  visibility?: "private" | "shared" | "classroom";
};

type FolderDoc = { id: string; name: string; path: string; personal: boolean; gameCount?: number; lastUpdatedAt?: string; description?: string; coverImage?: string };

type ModalName = "folder" | "upload" | "generator" | "edit-folder" | "edit-pgn" | null;
type UploadTab = "single" | "multiple";
type GeneratorStep = 1 | 2 | 3;
type SetupTab = "general" | "gamified";

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
const lightSquare = "#efd6a8";
const darkSquare = "#bd8d62";
const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export default function PgnLibraryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [games, setGames] = useState<PgnDoc[]>([]);
  const [folders, setFolders] = useState<FolderDoc[]>([]);
  const [currentFolder, setCurrentFolder] = useState<FolderDoc | null>(null);
  const [modal, setModal] = useState<ModalName>(null);
  const [selectedFolder, setSelectedFolder] = useState<FolderDoc | null>(null);
  const [selectedGame, setSelectedGame] = useState<PgnDoc | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("Newest");
  const [reorder, setReorder] = useState(false);
  const role = (session?.user as any)?.role;
  const isAdmin = (session?.user as any)?.role === "admin";
  const currentUserId = String((session?.user as any)?.id || "");

  useEffect(() => {
    if (role === "student") router.replace("/dashboard");
  }, [role, router]);

  const load = useCallback(async () => {
    if (role === "student") return;
    const [gamesResponse, foldersResponse] = await Promise.all([
      fetch("/api/pgn", { cache: "no-store" }),
      fetch("/api/pgn/folders", { cache: "no-store" }),
    ]);
    if (gamesResponse.ok) {
      const docs = await gamesResponse.json();
      setGames(Array.isArray(docs) ? docs : []);
    }
    if (foldersResponse.ok) {
      const docs = await foldersResponse.json();
      setFolders(Array.isArray(docs) ? docs.map((folder: any) => ({
        id: String(folder._id || folder.path),
        name: folderLabel(folder.path || folder.name),
        path: normalizeFolderPath(folder.path || folder.name),
        personal: folder.visibility !== "shared",
        gameCount: Number(folder.gameCount || 0),
        lastUpdatedAt: folder.lastUpdatedAt || folder.updatedAt,
        description: folder.description,
        coverImage: folder.coverImage,
      })) : []);
    }
  }, [role]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeFolderPath = currentFolder?.path || "";
  const activeScope = currentFolder?.personal === false ? "shared" : "personal";

  const visibleGames = useMemo(() => {
    const folderPath = activeFolderPath;
    const q = query.trim().toLowerCase();
    const filtered = games.filter((game) => {
      if (folderPath && game.folder !== folderPath) return false;
      if (folderPath && currentFolder && (game.visibility === "shared") !== !currentFolder.personal) return false;
      if (!folderPath && String(game.folder || "").includes("/")) return false;
      if (!q) return true;
      return [game.title, game.white, game.black, game.event, game.opening, game.eco, game.sourceFileName, game.result, game.date].filter(Boolean).some((value) => value!.toLowerCase().includes(q));
    });
    return sortGames(filtered, sort);
  }, [games, activeFolderPath, query, currentFolder, sort]);

  const allKnownFolders = useMemo(() => {
    const byPath = new Map<string, FolderDoc>();
    folders.forEach((folder) => byPath.set(`${folder.personal ? "personal" : "shared"}:${folder.path}`, folder));
    games.forEach((game) => {
      const path = normalizeFolderPath(game.folder);
      const personal = game.visibility !== "shared";
      const folderKey = `${personal ? "personal" : "shared"}:${path}`;
      if (path && !byPath.has(folderKey)) {
        byPath.set(folderKey, { id: `${folderKey}-${path.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name: folderLabel(path), path, personal });
      }
      let parentPath = parentFolderPath(path);
      while (parentPath) {
        const parentKey = `${personal ? "personal" : "shared"}:${parentPath}`;
        if (!byPath.has(parentKey)) {
          byPath.set(parentKey, { id: `${parentKey}-${parentPath.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name: folderLabel(parentPath), path: parentPath, personal });
        }
        parentPath = parentFolderPath(parentPath);
      }
    });
    return Array.from(byPath.values())
      .map((folder) => {
        const folderGames = games.filter((game) => {
          const gameFolder = normalizeFolderPath(game.folder);
          const sameScope = (game.visibility === "shared") !== folder.personal;
          return sameScope && (gameFolder === folder.path || gameFolder.startsWith(`${folder.path}/`));
        });
        const latest = folderGames
          .map((game) => game.updatedAt || game.createdAt)
          .filter(Boolean)
          .sort()
          .at(-1);
        return {
          ...folder,
          gameCount: folder.gameCount || folderGames.length,
          lastUpdatedAt: folder.lastUpdatedAt || latest,
        };
      })
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [folders, games]);

  const visibleFolders = useMemo(() => {
    const folderPath = activeFolderPath;
    const q = query.trim().toLowerCase();
    return allKnownFolders
      .filter((folder) => getImmediateChildPath(folderPath, folder.path) === folder.path)
      .filter((folder) => !folderPath || !currentFolder || folder.personal === currentFolder.personal)
      .filter((folder) => !q || folder.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allKnownFolders, activeFolderPath, query, currentFolder]);

  const rootSharedFolders = useMemo(() => visibleFolders.filter((folder) => !folder.personal), [visibleFolders]);
  const rootPersonalFolders = useMemo(() => visibleFolders.filter((folder) => folder.personal), [visibleFolders]);
  const rootSharedGames = useMemo(() => visibleGames.filter((game) => game.visibility === "shared"), [visibleGames]);
  const rootPersonalGames = useMemo(() => visibleGames.filter((game) => game.visibility !== "shared"), [visibleGames]);
  const previewFens = useMemo(() => {
    const map = new Map<string, string>();
    games.forEach((game) => map.set(game._id, previewFen(game)));
    return map;
  }, [games]);

  useEffect(() => {
    const folderPath = normalizeFolderPath(searchParams?.get("folder"));
    const folderScope = searchParams?.get("scope") === "shared" ? "shared" : "personal";
    if (!folderPath) {
      setCurrentFolder(null);
      setQuery("");
      return;
    }
    const folder = allKnownFolders.find((item) => item.path === folderPath && (item.personal ? "personal" : "shared") === folderScope);
    if (!folder) {
      setCurrentFolder(null);
      router.replace("/pgn");
      return;
    }
    setCurrentFolder(folder);
  }, [searchParams, allKnownFolders, router]);

  function openFolder(folder: FolderDoc) {
    setCurrentFolder(folder);
    setQuery("");
    router.push(`/pgn?folder=${encodeURIComponent(folder.path)}&scope=${folder.personal ? "personal" : "shared"}`);
  }

  function openRoot() {
    setCurrentFolder(null);
    setQuery("");
    router.push("/pgn");
  }

  async function addFolder(name: string, personal: boolean) {
    const nextName = name.trim();
    if (!nextName) {
      toast.error("Please enter a folder name");
      return;
    }
    const nextPersonal = currentFolder ? currentFolder.personal : personal;
    const path = activeFolderPath ? `${activeFolderPath}/${nextName}` : nextName;
    if (folders.some((folder) => folder.path === path && folder.personal === nextPersonal)) {
      toast.error("A folder with this name already exists here");
      return;
    }
    const response = await fetch("/api/pgn/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nextName, currentFolder: activeFolderPath, personal: nextPersonal }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      toast.error(data.error || "Could not create folder");
      return;
    }
    const created = await response.json();
    const folder = { id: String(created._id || path), name: folderLabel(created.path || path), path: normalizeFolderPath(created.path || path), personal: created.visibility !== "shared" };
    await load();
    setQuery("");
    setModal(null);
    router.push(`/pgn?folder=${encodeURIComponent(folder.path)}&scope=${folder.personal ? "personal" : "shared"}`);
  }

  async function renameFolder(folder: FolderDoc, name: string) {
    const nextName = name.trim();
    if (!nextName || nextName === folder.name) return setModal(null);
    const nextPath = parentFolderPath(folder.path) ? `${parentFolderPath(folder.path)}/${nextName}` : nextName;
    const response = await fetch("/api/pgn/folders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldName: folder.path, newName: nextPath }),
    });
    if (!response.ok) return toast.error("Could not rename folder");
    await load();
    if (currentFolder?.path === folder.path) {
      const nextFolder = { ...folder, name: nextName, path: nextPath, personal: folder.personal };
      setCurrentFolder(nextFolder);
      router.push(`/pgn?folder=${encodeURIComponent(nextPath)}&scope=${nextFolder.personal ? "personal" : "shared"}`);
    }
    setModal(null);
    toast.success("Folder renamed");
  }

  async function deleteFolder(folder: FolderDoc) {
    if (!window.confirm(`Delete "${folder.name}" and all PGNs inside it?`)) return;
    const scope = folder.personal ? "personal" : "shared";
    const response = await fetch(`/api/pgn/folders?name=${encodeURIComponent(folder.path)}&scope=${scope}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return toast.error(data.error || "Could not delete folder");
    }
    await load();
    if (currentFolder?.path === folder.path || currentFolder?.path?.startsWith(`${folder.path}/`)) openRoot();
    toast.success("Folder deleted");
  }

  async function updateGame(game: PgnDoc, title: string, pgn: string) {
    const response = await fetch(`/api/pgn/${game._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, pgn, folder: game.folder || currentFolder?.path }),
    });
    if (!response.ok) return toast.error("Could not update PGN");
    await response.json();
    await load();
    setModal(null);
    toast.success("PGN updated");
  }

  async function deleteGame(game: PgnDoc) {
    if (!window.confirm(`Delete "${game.title}"?`)) return;
    const response = await fetch(`/api/pgn/${game._id}`, { method: "DELETE" });
    if (!response.ok) return toast.error("Could not delete PGN");
    await load();
    toast.success("PGN deleted");
  }

  function downloadText(filename: string, content: string) {
    const url = URL.createObjectURL(new Blob([content], { type: "application/x-chess-pgn;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadGame(game: PgnDoc) {
    downloadText(`${safeFileName(game.title)}.pgn`, game.pgn);
  }

  function downloadFolder(folder: FolderDoc) {
    const folderGames = games.filter((game) => (game.folder === folder.path || String(game.folder || "").startsWith(`${folder.path}/`)) && ((game.visibility === "shared") !== folder.personal));
    if (!folderGames.length) return toast.error("No PGNs in this folder");
    downloadText(`${safeFileName(folder.name)}.pgn`, folderGames.map((game) => game.pgn).join("\n\n"));
  }

  async function uploadGame(title: string, pgn: string, createFolder: boolean) {
    const folderName = createFolder ? (currentFolder?.path ? `${currentFolder.path}/${title}` : title) : currentFolder?.path;
    const visibility = currentFolder?.personal === false ? "shared" : "private";
    const response = await fetch("/api/pgn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, pgn, folder: folderName, visibility }),
    });
    if (!response.ok) return toast.error("Invalid PGN");
    await load();
    toast.success("PGN uploaded");
    setModal(null);
  }

  return (
    <div className="-m-6 min-h-screen space-y-6 bg-slate-50 p-6 text-slate-950">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl">PGN Library</h1>
          <p className="mt-1 text-sm text-slate-500">Manage folders and PGNs for structured storage and easy access</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary gap-2 px-5" onClick={() => setModal("folder")}><Plus size={16} /> New Folder</button>
          {currentFolder && (
            <>
              <button className="btn-primary gap-2 px-5" onClick={() => setModal("upload")}><FileUp size={16} /> Upload PGN</button>
              <button className="btn gap-2 border border-slate-300 bg-white text-slate-950 hover:bg-slate-50" onClick={() => setModal("generator")}><Plus size={16} /> Create Game</button>
            </>
          )}
        </div>
      </div>

      <section className="min-h-[376px] rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            {currentFolder ? (
              <>
                <h2 className="mb-4 text-lg font-semibold">{currentFolder.name}</h2>
                <div className="flex items-center gap-2 text-sm">
                  <button className="inline-flex items-center gap-1 text-blue-600" onClick={openRoot}><Home size={14} /> Folders</button>
                  {folderBreadcrumbs(currentFolder.path, currentFolder.personal).map((item) => (
                    <span key={item.path} className="contents">
                      <ChevronRight size={14} className="text-slate-400" />
                      <button className={`font-semibold ${item.path === currentFolder.path ? "text-slate-950" : "text-blue-600"}`} onClick={() => openFolder(item)}>
                        {item.name}
                      </button>
                    </span>
                  ))}
                </div>
              </>
            ) : <div />}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              Reorder folders and pgns
              <button
                className={`relative h-5 w-9 rounded-full ${reorder ? "bg-brand" : "bg-slate-200"}`}
                onClick={() => setReorder((value) => !value)}
                aria-label="Toggle reorder"
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${reorder ? "left-4" : "left-0.5"}`} />
              </button>
            </label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input w-[min(72vw,260px)] bg-white pl-9 text-slate-950" placeholder={currentFolder ? "Search inside folder" : "Search PGN database"} value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <div className="relative">
              <select className="input w-[140px] appearance-none bg-white pr-10 text-slate-950" value={sort} onChange={(event) => setSort(event.target.value)}>
                <option>Newest</option>
                <option>Oldest</option>
                <option>Name</option>
                <option>Players</option>
                <option>Event</option>
                <option>Date</option>
                <option>Opening</option>
                <option>Result</option>
                <option>Moves</option>
              </select>
              <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        </div>

        {currentFolder ? (
          visibleFolders.length || visibleGames.length ? (
            <div className="space-y-6">
              {visibleFolders.length > 0 && (
                <div>
                  <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Subfolders</div>
                  <FolderGrid
                    folders={visibleFolders}
                    isAdmin={isAdmin}
                    onOpen={openFolder}
                    onEdit={(folder) => {
                      setSelectedFolder(folder);
                      setModal("edit-folder");
                    }}
                    onDelete={deleteFolder}
                    onDownload={downloadFolder}
                  />
                </div>
              )}
              {visibleGames.length > 0 && (
                <div>
                  <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">PGNs</div>
                  <GameGrid
                    games={visibleGames}
                    previewFens={previewFens}
                    folder={currentFolder.path}
                    isAdmin={isAdmin}
                    currentUserId={currentUserId}
                    onEdit={(game) => {
                      setSelectedGame(game);
                      setModal("edit-pgn");
                    }}
                    onDelete={deleteGame}
                    onDownload={downloadGame}
                  />
                </div>
              )}
            </div>
          ) : <EmptyFolder />
        ) : visibleFolders.length || visibleGames.length ? (
          <div className="space-y-8">
            <LibrarySection
              title="Shared Library"
              description="Shared folders and PGNs available across the academy."
              folders={rootSharedFolders}
              games={rootSharedGames}
              previewFens={previewFens}
              isAdmin={isAdmin}
              currentUserId={currentUserId}
              onOpen={openFolder}
              onEditFolder={(folder) => { setSelectedFolder(folder); setModal("edit-folder"); }}
              onDeleteFolder={deleteFolder}
              onDownloadFolder={downloadFolder}
              onEditGame={(game) => { setSelectedGame(game); setModal("edit-pgn"); }}
              onDeleteGame={deleteGame}
              onDownloadGame={downloadGame}
            />
            <LibrarySection
              title="Personal Library"
              description="Private folders and PGNs visible only to you."
              folders={rootPersonalFolders}
              games={rootPersonalGames}
              previewFens={previewFens}
              isAdmin={isAdmin}
              currentUserId={currentUserId}
              onOpen={openFolder}
              onEditFolder={(folder) => { setSelectedFolder(folder); setModal("edit-folder"); }}
              onDeleteFolder={deleteFolder}
              onDownloadFolder={downloadFolder}
              onEditGame={(game) => { setSelectedGame(game); setModal("edit-pgn"); }}
              onDeleteGame={deleteGame}
              onDownloadGame={downloadGame}
            />
          </div>
        ) : (
          <EmptyFolder />
        )}

        {!currentFolder && (
          <div className="mt-28 flex items-center justify-end gap-5">
            <ChevronLeft size={18} className="text-slate-700" />
            <span className="rounded-md border border-brand px-3 py-2 text-brand">1</span>
            <ChevronRight size={18} className="text-slate-700" />
            <div className="relative">
              <select className="input w-[112px] appearance-none bg-white pr-8 text-slate-950">
                <option>18 / page</option>
                <option>36 / page</option>
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        )}
      </section>

      {modal === "folder" && <NewFolderModal currentFolder={currentFolder?.path} currentFolderPersonal={currentFolder?.personal} onClose={() => setModal(null)} onCreate={addFolder} />}
      {modal === "edit-folder" && selectedFolder && <EditNameModal title="Edit Folder" label="Folder Name" initialName={selectedFolder.name} onClose={() => setModal(null)} onSave={(name) => renameFolder(selectedFolder, name)} />}
      {modal === "edit-pgn" && selectedGame && <EditPgnModal game={selectedGame} onClose={() => setModal(null)} onSave={(title, pgn) => updateGame(selectedGame, title, pgn)} />}
      {modal === "upload" && <UploadPgnModal onClose={() => setModal(null)} onUpload={uploadGame} />}
      {modal === "generator" && <PgnGeneratorModal onClose={() => setModal(null)} onSave={uploadGame} />}
    </div>
  );
}

function safeFileName(value: string) {
  return value.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "pgn";
}

function sortGames(games: PgnDoc[], sort: string) {
  return [...games].sort((a, b) => {
    if (sort === "Oldest") return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    if (sort === "Name") return String(a.title || "").localeCompare(String(b.title || ""));
    if (sort === "Players") return `${a.white || ""} ${a.black || ""}`.localeCompare(`${b.white || ""} ${b.black || ""}`);
    if (sort === "Event") return String(a.event || "").localeCompare(String(b.event || ""));
    if (sort === "Date") return String(b.date || "").localeCompare(String(a.date || ""));
    if (sort === "Opening") return `${a.opening || ""} ${a.eco || ""}`.localeCompare(`${b.opening || ""} ${b.eco || ""}`);
    if (sort === "Result") return String(a.result || "").localeCompare(String(b.result || ""));
    if (sort === "Moves") return Number(b.moveCount || 0) - Number(a.moveCount || 0);
    return String(b.createdAt || b.updatedAt || "").localeCompare(String(a.createdAt || a.updatedAt || ""));
  });
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function extractHeader(pgn: string, key: string) {
  const match = pgn.match(new RegExp(`\\[${key}\\s+"([^"]*)"\\]`));
  return match?.[1];
}

function previewFen(game: PgnDoc) {
  if (game.initialFen) return game.initialFen;
  try {
    const chess = new Chess();
    chess.loadPgn(game.pgn);
    const history = chess.history({ verbose: true }) as Array<{ before?: string }>;
    return history[0]?.before || extractHeader(game.pgn, "FEN") || startFen;
  } catch {
    return extractHeader(game.pgn, "FEN") || startFen;
  }
}

function sideToMoveLabel(game: PgnDoc, fen?: string) {
  const side = game.sideToMove || (String(fen || "").split(/\s+/)[1] === "b" ? "black" : "white");
  return side === "black" ? "Black to play" : "White to play";
}

function fenPieces(fen: string) {
  const board = String(fen || startFen).split(" ")[0] || "";
  const pieces: string[] = [];
  board.split("/").forEach((rank) => {
    for (const char of rank) {
      const empty = Number(char);
      if (Number.isInteger(empty) && empty > 0) {
        pieces.push(...Array.from({ length: empty }, () => ""));
      } else {
        pieces.push(char);
      }
    }
  });
  return pieces.slice(0, 64);
}

function MiniFenBoard({ fen }: { fen: string }) {
  const pieceMap: Record<string, string> = {
    p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚",
    P: "♙", N: "♘", B: "♗", R: "♖", Q: "♕", K: "♔",
  };
  const pieces = fenPieces(fen);
  return (
    <div className="grid h-full w-full grid-cols-8 grid-rows-8" aria-hidden="true">
      {Array.from({ length: 64 }).map((_, index) => {
        const file = index % 8;
        const rank = Math.floor(index / 8);
        const light = (file + rank) % 2 === 0;
        const piece = pieces[index] || "";
        const whitePiece = piece === piece.toUpperCase();
        return (
          <span
            key={index}
            className={`flex items-center justify-center text-[15px] leading-none ${light ? "bg-[#efd6a8]" : "bg-[#bd8d62]"} ${whitePiece ? "text-white [text-shadow:_0_1px_1px_rgb(0_0_0_/_0.8)]" : "text-black"}`}
          >
            {pieceMap[piece] || ""}
          </span>
        );
      })}
    </div>
  );
}

function normalizeFolderPath(value?: string | null) {
  return String(value || "").trim().replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
}

function folderLabel(path: string) {
  const normalized = normalizeFolderPath(path);
  return normalized.split("/").filter(Boolean).pop() || normalized;
}

function parentFolderPath(path?: string | null) {
  const normalized = normalizeFolderPath(path);
  if (!normalized.includes("/")) return "";
  return normalized.split("/").slice(0, -1).join("/");
}

function getImmediateChildPath(basePath: string, candidatePath: string) {
  const base = normalizeFolderPath(basePath);
  const candidate = normalizeFolderPath(candidatePath);
  if (!candidate) return "";
  if (!base) {
    return candidate.includes("/") ? candidate.split("/")[0] : candidate;
  }
  if (candidate === base || !candidate.startsWith(`${base}/`)) return "";
  const rest = candidate.slice(base.length + 1);
  const first = rest.split("/")[0];
  return `${base}/${first}`;
}

function folderBreadcrumbs(path: string, personal = true) {
  const parts = normalizeFolderPath(path).split("/").filter(Boolean);
  return parts.map((part, index) => ({
    id: parts.slice(0, index + 1).join("/"),
    name: part,
    path: parts.slice(0, index + 1).join("/"),
    personal,
  }));
}

function FolderGrid({
  folders,
  isAdmin,
  onOpen,
  onEdit,
  onDelete,
  onDownload,
}: {
  folders: FolderDoc[];
  isAdmin: boolean;
  onOpen: (folder: FolderDoc) => void;
  onEdit: (folder: FolderDoc) => void;
  onDelete: (folder: FolderDoc) => void;
  onDownload: (folder: FolderDoc) => void;
}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {folders.map((folder) => (
        <div
          key={folder.id}
          className="relative rounded-md border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-amber-200 hover:bg-amber-50/30"
        >
          <button className="block w-full pr-9 text-left" onClick={() => onOpen(folder)}>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-md bg-amber-50 text-amber-600">
                <Folder size={22} className="fill-amber-500 text-amber-500" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{folder.name}</span>
                <span className="mt-1 block text-xs text-slate-500">{folder.gameCount || 0} PGNs{folder.lastUpdatedAt ? ` - Updated ${formatDate(folder.lastUpdatedAt)}` : ""}</span>
                {folder.description && <span className="mt-1 line-clamp-2 block text-xs text-slate-500">{folder.description}</span>}
              </span>
            </div>
          </button>
          <button
            className="absolute right-2 top-2 rounded-md p-2 hover:bg-slate-100"
            onClick={(event) => {
              event.stopPropagation();
              setOpenMenu((current) => current === folder.id ? null : folder.id);
            }}
            aria-label={`Open menu for ${folder.name}`}
          >
            <MoreVertical size={18} className="text-slate-700" />
          </button>
          {openMenu === folder.id && (
            <ActionMenu>
              <MenuAction tone="danger" icon={<Trash2 size={13} />} onClick={() => { setOpenMenu(null); onDelete(folder); }}>Delete</MenuAction>
              <MenuAction icon={<Edit3 size={13} />} onClick={() => { setOpenMenu(null); onEdit(folder); }}>Edit</MenuAction>
              {isAdmin && <MenuAction icon={<Download size={13} />} onClick={() => { setOpenMenu(null); onDownload(folder); }}>Download</MenuAction>}
            </ActionMenu>
          )}
        </div>
      ))}
    </div>
  );
}

function LibrarySection({
  title,
  description,
  folders,
  games,
  previewFens,
  isAdmin,
  currentUserId,
  onOpen,
  onEditFolder,
  onDeleteFolder,
  onDownloadFolder,
  onEditGame,
  onDeleteGame,
  onDownloadGame,
}: {
  title: string;
  description: string;
  folders: FolderDoc[];
  games: PgnDoc[];
  previewFens: Map<string, string>;
  isAdmin: boolean;
  currentUserId: string;
  onOpen: (folder: FolderDoc) => void;
  onEditFolder: (folder: FolderDoc) => void;
  onDeleteFolder: (folder: FolderDoc) => void;
  onDownloadFolder: (folder: FolderDoc) => void;
  onEditGame: (game: PgnDoc) => void;
  onDeleteGame: (game: PgnDoc) => void;
  onDownloadGame: (game: PgnDoc) => void;
}) {
  if (!folders.length && !games.length) return null;

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</div>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {folders.length > 0 && (
        <FolderGrid
          folders={folders}
          isAdmin={isAdmin}
          onOpen={onOpen}
          onEdit={onEditFolder}
          onDelete={onDeleteFolder}
          onDownload={onDownloadFolder}
        />
      )}
      {games.length > 0 && (
        <GameGrid
          games={games}
          previewFens={previewFens}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          onEdit={onEditGame}
          onDelete={onDeleteGame}
          onDownload={onDownloadGame}
        />
      )}
    </div>
  );
}

function GameGrid({
  games,
  previewFens,
  folder,
  isAdmin,
  currentUserId,
  onEdit,
  onDelete,
  onDownload,
}: {
  games: PgnDoc[];
  previewFens: Map<string, string>;
  folder?: string;
  isAdmin: boolean;
  currentUserId: string;
  onEdit: (game: PgnDoc) => void;
  onDelete: (game: PgnDoc) => void;
  onDownload: (game: PgnDoc) => void;
}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {games.map((game) => (
        <div key={game._id} className="relative rounded-md border border-slate-200 bg-white p-4 shadow-sm transition hover:border-purple-200 hover:bg-purple-50/20">
          {(() => {
            const canManage = isAdmin || String(game.uploadedBy || "") === currentUserId;
            return (
              <>
          <Link href={folder ? `/pgn/${game._id}?folder=${encodeURIComponent(folder)}&scope=${game.visibility === "shared" ? "shared" : "personal"}` : `/pgn/${game._id}`} className="grid grid-cols-[112px_minmax(0,1fr)] gap-4 pr-8">
            <div className="h-28 w-28 overflow-hidden rounded-md border border-slate-200 bg-slate-100" aria-label={`Preview board for ${game.title}`}>
              <MiniFenBoard fen={previewFens.get(game._id) || startFen} />
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold">{game.title}</div>
              <div className="mt-2 text-sm text-slate-600">{game.white || "White"} vs {game.black || "Black"} - {game.result || "*"}</div>
              <div className="mt-1 truncate text-xs text-slate-500">
                {[game.event, game.date].filter(Boolean).join(" - ") || "No event metadata"}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold text-slate-500">
                {game.eco && <span className="rounded bg-slate-100 px-2 py-1">{game.eco}</span>}
                {game.opening && <span className="max-w-full truncate rounded bg-slate-100 px-2 py-1">{game.opening}</span>}
                <span className="rounded bg-purple-50 px-2 py-1 text-purple-700">{sideToMoveLabel(game, previewFens.get(game._id))}</span>
                {game.moveCount ? <span className="rounded bg-slate-100 px-2 py-1">{game.moveCount} moves</span> : null}
                {game.hasAnnotations && <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">Annotated</span>}
                {game.hasVariations && <span className="rounded bg-sky-50 px-2 py-1 text-sky-700">Variations</span>}
              </div>
            </div>
          </Link>
          <button
            className="absolute right-2 top-2 rounded-md p-2 hover:bg-slate-100"
            onClick={() => setOpenMenu((current) => current === game._id ? null : game._id)}
            aria-label={`Open menu for ${game.title}`}
          >
            <MoreVertical size={18} className="text-slate-700" />
          </button>
          {openMenu === game._id && (
            <ActionMenu>
              {canManage && <MenuAction tone="danger" icon={<Trash2 size={13} />} onClick={() => { setOpenMenu(null); onDelete(game); }}>Delete</MenuAction>}
              {canManage && <MenuAction icon={<Edit3 size={13} />} onClick={() => { setOpenMenu(null); onEdit(game); }}>Edit</MenuAction>}
              {isAdmin && <MenuAction icon={<Download size={13} />} onClick={() => { setOpenMenu(null); onDownload(game); }}>Download</MenuAction>}
            </ActionMenu>
          )}
              </>
            );
          })()}
        </div>
      ))}
    </div>
  );
}

function ActionMenu({ children }: { children: ReactNode }) {
  return (
    <div className="absolute right-4 top-12 z-20 w-32 rounded-md bg-white py-2 shadow-xl ring-1 ring-slate-200">
      {children}
    </div>
  );
}

function MenuAction({ children, icon, tone, onClick }: { children: ReactNode; icon: ReactNode; tone?: "danger"; onClick: () => void }) {
  return (
    <button
      className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-slate-50 ${tone === "danger" ? "text-red-600" : "text-slate-950"}`}
      onClick={onClick}
    >
      <span>{children}</span>
      {icon}
    </button>
  );
}

function EmptyFolder() {
  return (
    <div className="flex min-h-[320px] items-center justify-center">
      <div className="relative h-[260px] w-[360px]">
        <div className="absolute left-1/2 top-16 grid h-28 w-28 -translate-x-1/2 rotate-45 grid-cols-2 overflow-hidden rounded-md">
          <span className="bg-sky-300" /><span className="bg-white" /><span className="bg-white" /><span className="bg-sky-300" />
        </div>
        <div className="absolute left-12 top-52 h-14 w-28 rounded-full bg-slate-100" />
        <div className="absolute right-14 top-52 h-14 w-28 rounded-full bg-slate-100" />
        <div className="absolute left-24 top-28 h-24 w-8 rounded-full bg-slate-700" />
        <div className="absolute left-20 top-22 h-10 w-16 rounded-full bg-slate-800" />
        <div className="absolute left-28 top-8 h-16 w-10 rounded-full bg-slate-800" />
        <div className="absolute right-26 top-20 h-28 w-10 rounded-full bg-slate-700" />
        <div className="absolute right-20 top-10 h-12 w-16 rounded-full bg-slate-800" />
        <div className="absolute left-[152px] top-24 text-5xl">&#9823;</div>
        <div className="absolute left-[190px] top-50 text-5xl text-slate-700">&#9822;</div>
        <div className="absolute left-[212px] top-88 rounded-lg border-4 border-slate-500 bg-white px-5 py-3 text-3xl">&#9823;</div>
      </div>
    </div>
  );
}

function ModalFrame({ title, children, onClose, width = "max-w-[480px]" }: { title: string; children: ReactNode; onClose: () => void; width?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className={`w-full rounded-lg bg-white p-5 text-slate-950 shadow-xl ${width}`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function NewFolderModal({ currentFolder, currentFolderPersonal, onClose, onCreate }: { currentFolder?: string; currentFolderPersonal?: boolean; onClose: () => void; onCreate: (name: string, personal: boolean) => void }) {
  const [name, setName] = useState("");
  const [personal, setPersonal] = useState(currentFolder ? !!currentFolderPersonal : false);
  const lockedScope = typeof currentFolderPersonal === "boolean";
  return (
    <ModalFrame title="Create New Folder" onClose={onClose} width="max-w-[476px]">
      {currentFolder && <p className="mb-3 text-xs text-slate-500">Creating inside: <span className="font-semibold text-slate-700">{currentFolder}</span></p>}
      <label className="mb-2 block text-sm">Folder Name</label>
      <input className="input bg-white text-slate-950" placeholder="Enter folder name" value={name} onChange={(event) => setName(event.target.value)} />
      <label className="mt-6 flex items-center gap-3 text-sm">
        <button
          className={`relative h-5 w-10 rounded-full ${personal ? "bg-brand" : "bg-slate-200"} ${lockedScope ? "cursor-not-allowed opacity-70" : ""}`}
          onClick={() => {
            if (!lockedScope) setPersonal((value) => !value);
          }}
          disabled={lockedScope}
          aria-label="Toggle personal folder"
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${personal ? "left-5" : "left-0.5"}`} />
        </button>
        {lockedScope ? (personal ? "Personal Folder" : "Shared Folder") : "Personal Folder"}
      </label>
      <p className="ml-12 mt-2 text-xs text-slate-500">
        {lockedScope
          ? "Nested folders stay inside the same library as their parent folder."
          : "This folder will be private and only accessible to you."}
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn border border-slate-200 bg-white text-slate-950" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!name.trim()} onClick={() => onCreate(name.trim(), personal)}>Create</button>
      </div>
    </ModalFrame>
  );
}

function EditNameModal({ title, label, initialName, onClose, onSave }: { title: string; label: string; initialName: string; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(initialName);
  return (
    <ModalFrame title={title} onClose={onClose} width="max-w-[476px]">
      <label className="mb-2 block text-sm">{label}</label>
      <input className="input bg-white text-slate-950" value={name} onChange={(event) => setName(event.target.value)} />
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn border border-slate-200 bg-white text-slate-950" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!name.trim()} onClick={() => onSave(name.trim())}>Save</button>
      </div>
    </ModalFrame>
  );
}

function EditPgnModal({ game, onClose, onSave }: { game: PgnDoc; onClose: () => void; onSave: (title: string, pgn: string) => void }) {
  const [title, setTitle] = useState(game.title);
  const [pgn, setPgn] = useState(game.pgn);
  return (
    <ModalFrame title="Edit PGN" onClose={onClose} width="max-w-[560px]">
      <label className="mb-2 block text-sm">PGN Title</label>
      <input className="input mb-5 bg-white text-slate-950" value={title} onChange={(event) => setTitle(event.target.value)} />
      <label className="mb-2 block text-sm">PGN Text</label>
      <textarea className="input min-h-[220px] resize-y bg-white font-mono text-sm text-slate-950" value={pgn} onChange={(event) => setPgn(event.target.value)} />
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn border border-slate-200 bg-white text-slate-950" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!title.trim() || !pgn.trim()} onClick={() => onSave(title.trim(), pgn.trim())}>Save</button>
      </div>
    </ModalFrame>
  );
}

function UploadPgnModal({ onClose, onUpload }: { onClose: () => void; onUpload: (title: string, pgn: string, createFolder: boolean) => void }) {
  const [tab, setTab] = useState<UploadTab>("single");
  const [title, setTitle] = useState("");
  const [pgn, setPgn] = useState("");
  const [createFolder, setCreateFolder] = useState(false);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  function readSingle(file?: File) {
    if (!file) return;
    file.text().then((text) => {
      setPgn(text);
      if (!title) setTitle(file.name.replace(/\.pgn$/i, ""));
    }).catch(() => toast.error("Could not read PGN file"));
  }

  return (
    <ModalFrame title="Upload PGN" onClose={onClose} width="max-w-[486px]">
      <div className="mb-5 flex border-b border-slate-200">
        <button className={uploadTabClass(tab === "single")} onClick={() => setTab("single")}>Single File</button>
        <button className={uploadTabClass(tab === "multiple")} onClick={() => setTab("multiple")}>Multiple Files</button>
      </div>
      {tab === "single" ? (
        <>
          <label className="mb-2 block text-sm">PGN Title</label>
          <input className="input mb-5 bg-white text-slate-950" placeholder="Enter PGN title" value={title} onChange={(event) => setTitle(event.target.value)} />
          <label className="mb-2 block text-sm">PGN Text</label>
          <textarea className="input min-h-[98px] resize-y bg-white text-slate-950" placeholder="Paste your PGN content here" value={pgn} onChange={(event) => setPgn(event.target.value)} />
          <label className="mb-2 mt-5 block text-sm">Or Upload PGN File</label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
            Select PGN File <FileUp size={15} />
            <input className="hidden" type="file" accept=".pgn" onChange={(event) => readSingle(event.target.files?.[0])} />
          </label>
          <label className="mt-6 flex items-center gap-3 text-sm">
            <button className={`relative h-5 w-10 rounded-full ${createFolder ? "bg-brand" : "bg-slate-200"}`} onClick={() => setCreateFolder((value) => !value)} aria-label="Create folder with PGN title">
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${createFolder ? "left-5" : "left-0.5"}`} />
            </button>
            Create Folder With PGN Title
          </label>
        </>
      ) : (
        <button className="flex h-[170px] w-full flex-col items-center justify-center rounded-md border border-slate-200" onClick={() => folderInputRef.current?.click()}>
          <Box size={40} className="mb-5 text-brand" />
          <div className="font-semibold">Click to select a folder.</div>
          <div className="mt-3 text-sm font-medium text-slate-500">Supports nested folder structures. Only .pgn files will be uploaded.</div>
          <input ref={folderInputRef} className="hidden" type="file" accept=".pgn" multiple onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) readSingle(file);
          }} />
        </button>
      )}
      <div className="mt-8 flex justify-end gap-2">
        <button className="btn border border-slate-200 bg-white text-slate-950" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!pgn.trim()} onClick={() => onUpload(title.trim() || "Untitled PGN", pgn, createFolder)}>Upload</button>
      </div>
    </ModalFrame>
  );
}

function uploadTabClass(active: boolean) {
  return ["px-4 py-3 text-sm", active ? "border-b-2 border-brand text-brand" : "text-slate-600"].join(" ");
}

function PgnGeneratorModal({ onClose, onSave }: { onClose: () => void; onSave: (title: string, pgn: string, createFolder: boolean) => void }) {
  const gameRef = useRef(new Chess());
  const [step, setStep] = useState<GeneratorStep>(1);
  const [setupTab, setSetupTab] = useState<SetupTab>("general");
  const [position, setPosition] = useState(gameRef.current.fen());
  const [title, setTitle] = useState("");

  const pgn = gameRef.current.pgn() || `[Event "${title || "Generated Game"}"]\n\n*`;

  function onDrop(source: string, target: string) {
    try {
      const move = gameRef.current.move({ from: source, to: target, promotion: "q" });
      if (!move) return false;
      setPosition(gameRef.current.fen());
      return true;
    } catch {
      return false;
    }
  }

  return (
    <ModalFrame title="PGN Generator" onClose={onClose} width="max-w-[746px]">
      <Stepper step={step} />
      <div className="mt-8 grid gap-7 md:grid-cols-[300px_1fr]">
        <div>
          <div className="mb-5 inline-flex rounded-lg bg-slate-100 p-1">
            <button className={setupPill(setupTab === "general")} onClick={() => setSetupTab("general")}>General</button>
            <button className={setupPill(setupTab === "gamified")} onClick={() => setSetupTab("gamified")}>Gamified Board</button>
          </div>
          <div className="mb-3 flex justify-between text-2xl">
            {["p", "n", "b", "r", "q", "k", "trash"].map((item) => <span key={item}>{item === "trash" ? "⌫" : pieceFor(item)}</span>)}
          </div>
          <Chessboard
            position={position}
            onPieceDrop={onDrop}
            boardWidth={300}
            customDarkSquareStyle={{ backgroundColor: darkSquare }}
            customLightSquareStyle={{ backgroundColor: lightSquare }}
          />
          <div className="mt-3 flex justify-between text-2xl">
            {["P", "N", "B", "R", "Q", "K", "trash"].map((item) => <span key={item}>{item === "trash" ? "⌫" : pieceFor(item)}</span>)}
          </div>
        </div>
        <div>
          {step === 1 && (
            setupTab === "general" ? (
              <GeneratorFenStep onLoad={(fen) => {
                try {
                  gameRef.current = new Chess(fen);
                  setPosition(gameRef.current.fen());
                } catch {
                  toast.error("Invalid FEN");
                }
              }} />
            ) : <GeneratorGamifiedStep />
          )}
          {step === 2 && <GeneratorMovesStep />}
          {step === 3 && (
            <div>
              <h3 className="text-lg font-semibold">Step 3: Enter Game Info</h3>
              <label className="mb-2 mt-6 block text-sm"><span className="text-red-500">*</span> PGN Title</label>
              <input className="input bg-white text-slate-950" placeholder="Enter PGN Title" value={title} onChange={(event) => setTitle(event.target.value)} />
              <button className="btn-primary mt-6" disabled={!title.trim()} onClick={() => onSave(title.trim(), pgn, false)}>Save Game</button>
            </div>
          )}
        </div>
      </div>
      <div className="mt-8 flex justify-end gap-2">
        {step > 1 && <button className="btn border border-slate-200 bg-white text-slate-950" onClick={() => setStep((current) => (current - 1) as GeneratorStep)}>Previous</button>}
        {step < 3 ? (
          <button className="btn-primary" onClick={() => setStep((current) => (current + 1) as GeneratorStep)}>Next</button>
        ) : (
          <button className="btn-primary opacity-60" disabled={!title.trim()} onClick={() => onSave(title.trim(), pgn, false)}>Upload</button>
        )}
      </div>
    </ModalFrame>
  );
}

function Stepper({ step }: { step: GeneratorStep }) {
  const labels = ["Generate FEN", "Generate Moves", "Game Info"];
  return (
    <div className="grid grid-cols-3 items-center gap-4">
      {labels.map((label, index) => {
        const number = index + 1;
        const done = step > number;
        const active = step === number;
        return (
          <div key={label} className="flex items-center gap-3">
            <span className={`flex h-8 w-8 items-center justify-center rounded-full ${active ? "bg-brand text-white" : done ? "bg-brand/20 text-brand" : "bg-slate-100 text-slate-500 ring-1 ring-slate-300"}`}>
              {done ? "✓" : number}
            </span>
            <span>{label}</span>
            {number < 3 && <span className="hidden h-px flex-1 bg-brand md:block" />}
          </div>
        );
      })}
    </div>
  );
}

function GeneratorFenStep({ onLoad }: { onLoad: (fen: string) => void }) {
  const [fen, setFen] = useState("");
  return (
    <div>
      <h3 className="text-lg font-semibold">Step 1: Generate FEN</h3>
      <p className="mb-3 text-sm text-slate-600">Adjust the chessboard position or enter a FEN to set the board.</p>
      <div className="mb-5 flex gap-3">
        <input className="input bg-white text-slate-950" placeholder="Enter FEN position (e.g., 8/8/8/8/8/8/8/8 w - - 0 1)" value={fen} onChange={(event) => setFen(event.target.value)} />
        <button className="btn-primary" onClick={() => onLoad(fen || startFen)}>Load</button>
      </div>
      <MoveSide />
      <Castling />
      <div className="mt-5 flex gap-4">
        <button className="btn border border-slate-200 bg-white text-slate-950">Reset</button>
        <button className="btn border border-slate-200 bg-white text-slate-950">Clear board</button>
      </div>
    </div>
  );
}

function GeneratorGamifiedStep() {
  return (
    <div>
      <MoveSide />
      <div className="mb-4 font-semibold">Gamified Icons</div>
      <div className="mb-5 grid grid-cols-5 gap-5 text-center text-sm">
        {["Food", "Toys", "Animals", "Rewards", "Emoji"].map((item, index) => (
          <div key={item}><div className="text-2xl">{["🍔", "🧸", "🐶", "🏆", "😊"][index]}</div>{item}</div>
        ))}
      </div>
      <div className="mb-4 border-t border-slate-200 pt-4 font-semibold">Blocks Icons</div>
      <div className="grid grid-cols-4 gap-6 text-3xl"><span>🚧</span><span>🧱</span><span>🪨</span><span>🪵</span></div>
      <button className="btn mt-6 border border-slate-200 bg-white text-slate-950">Clear board</button>
    </div>
  );
}

function GeneratorMovesStep() {
  return (
    <div>
      <h3 className="text-lg font-semibold">Step 2: Generate Moves</h3>
      <p className="mb-5 text-sm text-slate-700">Use the chessboard to make valid moves starting from the current position.</p>
      <label className="mb-5 flex items-center gap-2 text-sm"><input type="checkbox" /> White to move</label>
      <div className="text-sm">Moves/Solutions:</div>
      <div className="mt-2 flex flex-wrap gap-3">
        {["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"].map((move, index) => <span key={move} className={`rounded border px-4 py-1 text-sm ${index % 2 ? "bg-black text-white" : "bg-white"}`}>{move}</span>)}
      </div>
    </div>
  );
}

function MoveSide() {
  return (
    <div className="mb-5">
      <div className="mb-2 text-sm">white/black to move:</div>
      <div className="inline-flex rounded-md border border-slate-200">
        <button className="rounded-l-md bg-brand px-4 py-2 text-sm text-white">White</button>
        <button className="rounded-r-md px-4 py-2 text-sm">Black</button>
      </div>
    </div>
  );
}

function Castling() {
  return (
    <div className="text-sm">
      <div className="font-semibold">White:</div>
      <label className="mr-4"><input type="checkbox" defaultChecked className="mr-2 accent-brand" />O-O</label>
      <label><input type="checkbox" defaultChecked className="mr-2 accent-brand" />O-O-O</label>
      <div className="mt-2 font-semibold">Black:</div>
      <label className="mr-4"><input type="checkbox" defaultChecked className="mr-2 accent-brand" />O-O</label>
      <label><input type="checkbox" defaultChecked className="mr-2 accent-brand" />O-O-O</label>
    </div>
  );
}

function setupPill(active: boolean) {
  return ["rounded-md px-7 py-2 text-sm font-semibold", active ? "bg-white text-slate-950 shadow" : "text-slate-500"].join(" ");
}

function pieceFor(piece: string) {
  const map: Record<string, string> = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚", P: "♙", N: "♘", B: "♗", R: "♖", Q: "♕", K: "♔" };
  return map[piece] || "";
}
