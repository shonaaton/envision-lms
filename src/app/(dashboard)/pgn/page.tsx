"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Box,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  FileUp,
  Folder,
  Home,
  MoreVertical,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  pgn: string;
  folder?: string;
};

type FolderDoc = {
  id: string;
  name: string;
  personal: boolean;
};

type ModalName = "folder" | "upload" | "generator" | null;
type UploadTab = "single" | "multiple";
type GeneratorStep = 1 | 2 | 3;
type SetupTab = "general" | "gamified";

const defaultFolders: FolderDoc[] = [{ id: "beginners-level", name: "Beginners Level", personal: false }];
const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
const lightSquare = "#efd6a8";
const darkSquare = "#bd8d62";
const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export default function PgnLibraryPage() {
  const [games, setGames] = useState<PgnDoc[]>([]);
  const [folders, setFolders] = useState<FolderDoc[]>(defaultFolders);
  const [currentFolder, setCurrentFolder] = useState<FolderDoc | null>(null);
  const [modal, setModal] = useState<ModalName>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("None");
  const [reorder, setReorder] = useState(false);

  async function load() {
    const response = await fetch("/api/pgn");
    if (!response.ok) return;
    const docs = await response.json();
    setGames(docs);
  }

  useEffect(() => {
    load();
    const saved = window.localStorage.getItem("pgn-folders");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as FolderDoc[];
        if (Array.isArray(parsed) && parsed.length) setFolders(parsed);
      } catch {
        // Local folder preferences are optional.
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("pgn-folders", JSON.stringify(folders));
  }, [folders]);

  const visibleGames = useMemo(() => {
    const folderName = currentFolder?.name;
    const q = query.trim().toLowerCase();
    return games.filter((game) => {
      if (folderName && game.folder !== folderName) return false;
      if (!q) return true;
      return [game.title, game.white, game.black, game.event].filter(Boolean).some((value) => value!.toLowerCase().includes(q));
    });
  }, [games, currentFolder, query]);

  const visibleFolders = useMemo(() => {
    const byName = new Map<string, FolderDoc>();
    defaultFolders.forEach((folder) => byName.set(folder.name, folder));
    folders.forEach((folder) => byName.set(folder.name, folder));
    games.forEach((game) => {
      if (game.folder && !byName.has(game.folder)) {
        byName.set(game.folder, { id: game.folder.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: game.folder, personal: true });
      }
    });
    const q = query.trim().toLowerCase();
    return Array.from(byName.values()).filter((folder) => !q || folder.name.toLowerCase().includes(q));
  }, [folders, games, query]);

  function addFolder(name: string, personal: boolean) {
    const folder = { id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`, name, personal };
    setFolders((current) => [...current, folder]);
    setCurrentFolder(folder);
    setModal(null);
  }

  async function uploadGame(title: string, pgn: string, createFolder: boolean) {
    const folderName = createFolder ? title : currentFolder?.name;
    const response = await fetch("/api/pgn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, pgn, folder: folderName, visibility: "private" }),
    });
    if (!response.ok) return toast.error("Invalid PGN");
    if (createFolder && title && !folders.some((folder) => folder.name === title)) {
      setFolders((current) => [...current, { id: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`, name: title, personal: true }]);
    }
    toast.success("PGN uploaded");
    setModal(null);
    load();
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
                  <button className="inline-flex items-center gap-1 text-blue-600" onClick={() => setCurrentFolder(null)}><Home size={14} /> Folders</button>
                  <ChevronRight size={14} className="text-slate-400" />
                  <span className="font-semibold">{currentFolder.name}</span>
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
            {!currentFolder && (
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className="input w-[220px] bg-white pl-9 text-slate-950" placeholder="Search folders and PGN..." value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
            )}
            <div className="relative">
              <select className="input w-[140px] appearance-none bg-white pr-10 text-slate-950" value={sort} onChange={(event) => setSort(event.target.value)}>
                <option>None</option>
                <option>Name</option>
                <option>Newest</option>
              </select>
              <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        </div>

        {currentFolder ? (
          visibleGames.length ? <GameGrid games={visibleGames} /> : <EmptyFolder />
        ) : (
          <FolderGrid folders={visibleFolders} onOpen={setCurrentFolder} />
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

      {modal === "folder" && <NewFolderModal onClose={() => setModal(null)} onCreate={addFolder} />}
      {modal === "upload" && <UploadPgnModal onClose={() => setModal(null)} onUpload={uploadGame} />}
      {modal === "generator" && <PgnGeneratorModal onClose={() => setModal(null)} onSave={uploadGame} />}
    </div>
  );
}

function FolderGrid({ folders, onOpen }: { folders: FolderDoc[]; onOpen: (folder: FolderDoc) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {folders.map((folder) => (
        <button
          key={folder.id}
          className="flex h-14 items-center justify-between rounded-md border border-slate-200 bg-white px-4 text-left transition hover:bg-slate-50"
          onClick={() => onOpen(folder)}
        >
          <span className="inline-flex items-center gap-3 font-medium">
            <Folder size={22} className="fill-slate-700 text-slate-700" /> {folder.name}
          </span>
          <MoreVertical size={18} className="text-slate-700" />
        </button>
      ))}
    </div>
  );
}

function GameGrid({ games }: { games: PgnDoc[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {games.map((game) => (
        <Link key={game._id} href={`/pgn/${game._id}`} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50">
          <div className="font-semibold">{game.title}</div>
          <div className="mt-2 text-sm text-slate-500">{game.white || "?"} vs {game.black || "?"} - {game.result || "*"}</div>
          {game.event && <div className="mt-1 text-xs text-slate-400">{game.event}</div>}
        </Link>
      ))}
    </div>
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
        <div className="absolute left-[152px] top-24 text-5xl">♟</div>
        <div className="absolute left-[190px] top-50 text-5xl text-slate-700">♞</div>
        <div className="absolute left-[212px] top-88 rounded-lg border-4 border-slate-500 bg-white px-5 py-3 text-3xl">♟</div>
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

function NewFolderModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, personal: boolean) => void }) {
  const [name, setName] = useState("");
  const [personal, setPersonal] = useState(false);
  return (
    <ModalFrame title="Create New Folder" onClose={onClose} width="max-w-[476px]">
      <label className="mb-2 block text-sm">Folder Name</label>
      <input className="input bg-white text-slate-950" placeholder="Enter folder name" value={name} onChange={(event) => setName(event.target.value)} />
      <label className="mt-6 flex items-center gap-3 text-sm">
        <button
          className={`relative h-5 w-10 rounded-full ${personal ? "bg-brand" : "bg-slate-200"}`}
          onClick={() => setPersonal((value) => !value)}
          aria-label="Toggle personal folder"
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${personal ? "left-5" : "left-0.5"}`} />
        </button>
        Personal Folder
      </label>
      <p className="ml-12 mt-2 text-xs text-slate-500">This folder will be private and only accessible to you.</p>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn border border-slate-200 bg-white text-slate-950" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!name.trim()} onClick={() => onCreate(name.trim(), personal)}>Create</button>
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
