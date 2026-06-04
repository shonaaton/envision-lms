"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { toast } from "sonner";
import {
  BookOpen,
  Bot,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Crown,
  Eraser,
  FlipHorizontal,
  Grid2X2,
  Highlighter,
  Library,
  Lock,
  MessageSquare,
  MousePointer2,
  RefreshCcw,
  Send,
  Settings,
  ShieldAlert,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  Unlock,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

type Role = "student" | "instructor" | "admin";
type BoardPosition = Record<string, string | undefined>;
type TabKey = "students" | "pgn" | "chat" | "moves" | "leaderboard";
type ToolKey = "move" | "highlight" | "arrow" | "setup";

function isCoach(role: Role) {
  return role === "admin" || role === "instructor";
}

function extractFen(pgn: string) {
  return pgn.match(/\[FEN\s+"([^"]+)"\]/)?.[1];
}

function fenToPosition(fen?: string): BoardPosition {
  const chess = new Chess();
  if (fen && fen !== "start") chess.load(fen, { skipValidation: true });
  const position: BoardPosition = {};
  chess.board().forEach((rank, rankIndex) => {
    rank.forEach((piece, fileIndex) => {
      if (!piece) return;
      const square = `${"abcdefgh"[fileIndex]}${8 - rankIndex}`;
      position[square] = `${piece.color}${piece.type.toUpperCase()}`;
    });
  });
  return position;
}

function positionToFen(position: BoardPosition, sideToMove = "w") {
  const ranks = [];
  for (let rank = 8; rank >= 1; rank--) {
    let empty = 0;
    let row = "";
    for (const file of "abcdefgh") {
      const piece = position[`${file}${rank}`];
      if (!piece) {
        empty++;
        continue;
      }
      if (empty) {
        row += empty;
        empty = 0;
      }
      const letter = piece[1];
      row += piece[0] === "w" ? letter : letter.toLowerCase();
    }
    if (empty) row += empty;
    ranks.push(row);
  }
  return `${ranks.join("/")} ${sideToMove} - - 0 1`;
}

function buildGame(fen?: string) {
  try {
    if (fen && fen !== "start") return new Chess(fen);
  } catch {
    // Fall through to a clean board if an instructor is experimenting with setup mode.
  }
  return new Chess();
}

function applyMoves(startFen: string | undefined, moves: string[], count: number) {
  const chess = startFen && startFen !== "start" ? new Chess(startFen) : new Chess();
  for (const move of moves.slice(0, Math.max(0, count))) {
    try {
      chess.move(move);
    } catch {
      break;
    }
  }
  return chess.fen();
}

function playMoveSound(enabled: boolean) {
  if (!enabled || typeof window === "undefined") return;
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 520;
    gain.gain.value = 0.035;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.045);
  } catch {
    // Sound is a helper, never a blocker.
  }
}

function initials(name?: string) {
  return (name || "Student")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function LiveClassroom({ classroomId, role, userId }: { classroomId: string; role: Role; userId: string }) {
  const [data, setData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("students");
  const [tool, setTool] = useState<ToolKey>("move");
  const [moveAnswer, setMoveAnswer] = useState("");
  const [quizTitle, setQuizTitle] = useState("Best move from current position");
  const [chatText, setChatText] = useState("");
  const [manualLoadText, setManualLoadText] = useState("");
  const [highlightDraft, setHighlightDraft] = useState<string | null>(null);
  const [setupPosition, setSetupPosition] = useState<BoardPosition>({});
  const [engineText, setEngineText] = useState("Engine ready");
  const [boardWidth, setBoardWidth] = useState(680);
  const engineRef = useRef<Worker | null>(null);
  const coach = isCoach(role);

  async function load() {
    const res = await fetch(`/api/classrooms/${classroomId}/live`, { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 1800);
    return () => clearInterval(timer);
  }, [classroomId]);

  useEffect(() => {
    function resize() {
      const available = window.innerWidth >= 1280 ? window.innerWidth - 760 : window.innerWidth - 96;
      setBoardWidth(Math.max(360, Math.min(760, available)));
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const live = data?.live;
  const classroom = data?.classroom;
  const activeQuestion = data?.activeQuestion;
  const students = classroom?.students || [];
  const pgnLibrary = data?.pgnLibrary || [];
  const chatMessages = data?.chatMessages || [];
  const pgnMoves = live?.pgnMoves || [];
  const currentMoveIndex = live?.pgnMoveIndex || 0;
  const boardFen = live?.fen === "start" || !live?.fen ? "start" : live.fen;
  const boardPosition = live?.setupMode || tool === "setup" ? setupPosition : boardFen;
  const game = useMemo(() => buildGame(live?.fen), [live?.fen]);
  const canMove =
    coach ||
    (live?.studentMovesEnabled &&
      (live?.boardControlStudents || []).some((student: any) => student._id?.toString?.() === userId || student.toString?.() === userId));
  const duration = live?.startedAt ? Math.max(0, Math.floor((Date.now() - new Date(live.startedAt).getTime()) / 60000)) : 0;
  const classroomName = classroom?.title || "Live Classroom";
  const coachName = classroom?.coach?.name || classroom?.instructor?.name || "Coach";
  const activeStudents = students.filter((student: any) => student?.status !== "inactive");

  useEffect(() => {
    setSetupPosition(fenToPosition(live?.fen));
  }, [live?.fen, live?.setupMode]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowLeft") navigateMove(currentMoveIndex - 1);
      if (event.key === "ArrowRight") navigateMove(currentMoveIndex + 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentMoveIndex, pgnMoves.length, live?.pgn]);

  useEffect(() => {
    if (!live?.engineEnabled || !live?.fen || activeTab !== "moves") return;
    try {
      if (!engineRef.current) {
        engineRef.current = new Worker("/stockfish/stockfish.js");
        engineRef.current.onmessage = (event) => {
          const line = String(event.data || "");
          if (line.includes("score") || line.startsWith("bestmove")) setEngineText(line);
        };
        engineRef.current.postMessage("uci");
      }
      engineRef.current.postMessage(`position fen ${live.fen === "start" ? new Chess().fen() : live.fen}`);
      engineRef.current.postMessage("go depth 8");
    } catch {
      setEngineText("Engine unavailable in this browser session");
    }
  }, [activeTab, live?.engineEnabled, live?.fen]);

  async function patch(update: any) {
    const res = await fetch(`/api/classrooms/${classroomId}/live`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    if (!res.ok) {
      toast.error("Could not update classroom");
      return;
    }
    await load();
  }

  function commitSetup(position = setupPosition) {
    const sideToMove = live?.fen?.split(" ")?.[1] || "w";
    patch({ fen: positionToFen(position, sideToMove), setupMode: true });
  }

  function onDrop(source: string, target: string, piece: string) {
    if (live?.locked || (!canMove && !coach)) return false;
    if (live?.setupMode || tool === "setup" || live?.illegalMovesEnabled) {
      const next = { ...setupPosition };
      delete next[source];
      next[target] = piece;
      setSetupPosition(next);
      commitSetup(next);
      playMoveSound(live?.soundEnabled);
      return true;
    }
    try {
      const move = game.move({ from: source, to: target, promotion: "q" });
      if (!move) return false;
      patch({
        fen: game.fen(),
        moveHistory: [...(live?.moveHistory || []), move.san],
        mode: live?.mode === "one_move_challenge" ? "teaching" : live?.mode,
        boardControlStudents: live?.mode === "one_move_challenge" ? [] : live?.boardControlStudents?.map((s: any) => s._id || s),
        challenge: live?.mode === "one_move_challenge" ? { active: false } : live?.challenge,
      });
      playMoveSound(live?.soundEnabled);
      return true;
    } catch {
      return false;
    }
  }

  function onPieceDropOffBoard(source: string) {
    if (!(live?.setupMode || tool === "setup")) return;
    const next = { ...setupPosition };
    delete next[source];
    setSetupPosition(next);
    commitSetup(next);
  }

  function onSquareClick(square: string) {
    if (!coach) return;
    if (tool === "highlight") {
      const drawings = live?.drawings || [];
      patch({ drawings: [...drawings, { type: "highlight", from: square, color: "#facc15" }] });
      return;
    }
    if (tool === "arrow") {
      if (!highlightDraft) {
        setHighlightDraft(square);
        return;
      }
      patch({ drawings: [...(live?.drawings || []), { type: "arrow", from: highlightDraft, to: square, color: "#7c1fa2" }] });
      setHighlightDraft(null);
    }
  }

  async function askEveryone() {
    const res = await fetch(`/api/classrooms/${classroomId}/live/question`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "ask_everyone",
        title: "Ask Everyone",
        instructions: "Submit the best move from the current position.",
        fen: live?.fen || "start",
        pgn: live?.pgn,
        moveHistory: live?.moveHistory || [],
      }),
    });
    if (res.ok) toast.success("Question sent to everyone");
    setActiveTab("leaderboard");
    await load();
  }

  async function createQuiz() {
    const res = await fetch(`/api/classrooms/${classroomId}/live/question`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "best_move",
        title: quizTitle,
        topic: "Classroom Quiz",
        difficulty: "medium",
        instructions: "Find the best move from the current classroom position.",
        fen: live?.fen || "start",
        pgn: live?.pgn,
        moveHistory: live?.moveHistory || [],
        scoring: { correct: 5, wrongPenalty: 1, hintPenalty: 1, speedBonus: 2 },
        attempts: "single",
      }),
    });
    if (res.ok) toast.success("Live quiz launched");
    setActiveTab("leaderboard");
    await load();
  }

  async function submitResponse() {
    if (!activeQuestion) return;
    const res = await fetch(`/api/classrooms/${classroomId}/live/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: activeQuestion._id, submittedMove: moveAnswer }),
    });
    if (res.ok) {
      toast.success("Response submitted");
      setMoveAnswer("");
      await load();
    }
  }

  async function sendChat() {
    if (!chatText.trim()) return;
    const res = await fetch(`/api/classrooms/${classroomId}/live/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: chatText }),
    });
    if (res.ok) {
      setChatText("");
      await load();
    }
  }

  function resetGame() {
    patch({ fen: "start", pgnMoveIndex: 0, moveHistory: [], drawings: [], setupMode: false });
  }

  function navigateMove(nextIndex: number) {
    if (!pgnMoves.length) return;
    const boundedIndex = Math.max(0, Math.min(pgnMoves.length, nextIndex));
    const startFen = extractFen(live?.pgn || "") || "start";
    patch({ fen: applyMoves(startFen, pgnMoves, boundedIndex), pgnMoveIndex: boundedIndex, moveHistory: pgnMoves.slice(0, boundedIndex) });
  }

  function loadPgn(pgn: any, index: number) {
    const chess = new Chess();
    try {
      chess.loadPgn(pgn.pgn);
      const moves = chess.history();
      const startFen = extractFen(pgn.pgn) || "start";
      patch({
        pgn: pgn.pgn,
        pgnTitle: pgn.title,
        pgnMoves: moves,
        pgnMoveIndex: 0,
        fen: startFen,
        moveHistory: [],
        setupMode: false,
        drawings: [],
      });
      setActiveTab("moves");
      toast.success(`Loaded ${pgn.title}`);
    } catch {
      toast.error("This PGN could not be loaded");
    }
  }

  function loadManualPosition() {
    const value = manualLoadText.trim();
    if (!value) return;
    try {
      const fenGame = new Chess(value);
      patch({ fen: fenGame.fen(), pgn: "", pgnTitle: "Custom FEN", pgnMoves: [], pgnMoveIndex: 0, moveHistory: [], setupMode: false, drawings: [] });
      setManualLoadText("");
      toast.success("FEN loaded into classroom");
      return;
    } catch {
      // Try PGN next.
    }
    try {
      const pgnGame = new Chess();
      pgnGame.loadPgn(value);
      const moves = pgnGame.history();
      const startFen = extractFen(value) || "start";
      patch({
        pgn: value,
        pgnTitle: "Pasted PGN",
        pgnMoves: moves,
        pgnMoveIndex: 0,
        fen: startFen,
        moveHistory: [],
        setupMode: false,
        drawings: [],
      });
      setManualLoadText("");
      setActiveTab("moves");
      toast.success("PGN loaded into classroom");
    } catch {
      toast.error("Paste a valid PGN or FEN");
    }
  }

  function loadAdjacentPgn(direction: 1 | -1) {
    if (!pgnLibrary.length) return;
    const current = pgnLibrary.findIndex((pgn: any) => pgn.title === live?.pgnTitle || pgn.pgn === live?.pgn);
    const next = current < 0 ? 0 : Math.max(0, Math.min(pgnLibrary.length - 1, current + direction));
    loadPgn(pgnLibrary[next], next);
  }

  const squareStyles = useMemo(() => {
    const styles: Record<string, Record<string, string | number>> = {};
    for (const drawing of live?.drawings || []) {
      if (drawing.type === "highlight" && drawing.from) {
        styles[drawing.from] = { background: "radial-gradient(circle, rgba(250,204,21,.78) 28%, rgba(250,204,21,.32) 31%, transparent 34%)" };
      }
    }
    if (highlightDraft) styles[highlightDraft] = { boxShadow: "inset 0 0 0 5px rgba(124,31,162,.55)" };
    return styles;
  }, [live?.drawings, highlightDraft]);

  const arrows = useMemo(() => {
    return (live?.drawings || [])
      .filter((drawing: any) => drawing.type === "arrow" && drawing.from && drawing.to)
      .map((drawing: any) => [drawing.from, drawing.to, drawing.color || "#7c1fa2"]);
  }, [live?.drawings]);

  const leaderboardRows = useMemo(() => {
    const responseMap = new Map((data?.responses || []).map((r: any) => [r.student?._id, r]));
    return students
      .map((student: any) => {
        const response: any = responseMap.get(student._id);
        return {
          ...student,
          points: response?.score || 0,
          completed: Boolean(response),
          move: response?.submittedMove,
        };
      })
      .sort((a: any, b: any) => b.points - a.points);
  }, [students, data?.responses]);

  if (!data) return <div className="rounded-lg border border-slate-200 bg-white p-5">Loading classroom...</div>;

  const ToolButton = ({ id, icon, label, active, onClick }: { id?: ToolKey; icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) => (
    <button
      type="button"
      onClick={onClick || (() => id && setTool(id))}
      title={label}
      className={`grid h-11 w-11 place-items-center rounded-md border text-slate-700 transition hover:border-purple-300 hover:bg-purple-50 hover:text-purple-800 ${
        active || (id && tool === id) ? "border-purple-300 bg-purple-100 text-purple-800" : "border-slate-200 bg-white"
      }`}
    >
      {icon}
    </button>
  );

  const ToggleButton = ({ active, label, icon, onClick }: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`grid h-11 w-11 place-items-center rounded-md border transition ${
        active ? "border-purple-300 bg-purple-100 text-purple-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {icon}
    </button>
  );

  return (
    <div className="min-h-[calc(100vh-120px)] rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">{classroomName}</h2>
          <p className="text-sm text-slate-500">
            Instructor: {coachName} · Topic: {live?.topic || "Not set"} · {duration} min
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 lg:mt-0">
          {["teaching", "student_move", "one_move_challenge", "puzzle"].map((mode) => (
            <button
              key={mode}
              onClick={() => patch({ mode, studentMovesEnabled: mode !== "teaching" })}
              className={`rounded-md border px-3 py-2 text-xs font-semibold capitalize ${
                live?.mode === mode ? "border-purple-700 bg-purple-700 text-white" : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {mode.replaceAll("_", " ")}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(760px,1fr)_430px]">
        <section className="flex flex-col gap-4 p-4 lg:flex-row">
          <div className="grid grid-cols-4 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 shadow-sm lg:grid-cols-2 lg:self-start">
            <ToolButton id="move" icon={<MousePointer2 size={19} />} label="Move pieces" />
            <ToggleButton active={!!live?.locked} icon={live?.locked ? <Lock size={19} /> : <Unlock size={19} />} label="Lock board" onClick={() => patch({ locked: !live?.locked })} />
            <ToolButton id="highlight" icon={<Highlighter size={19} />} label="Square highlight tool" />
            <ToolButton id="arrow" icon={<ChevronRight size={19} />} label="Arrow drawing tool" />
            <ToggleButton active={!!live?.studentMovesEnabled} icon={<Users size={19} />} label="Enable student moves" onClick={() => patch({ studentMovesEnabled: !live?.studentMovesEnabled, mode: !live?.studentMovesEnabled ? "student_move" : "teaching" })} />
            <ToggleButton active={!!live?.illegalMovesEnabled} icon={<ShieldAlert size={19} />} label="Allow illegal moves" onClick={() => patch({ illegalMovesEnabled: !live?.illegalMovesEnabled })} />
            <ToggleButton active={!!live?.showCoordinates} icon={<Grid2X2 size={19} />} label="Show coordinates" onClick={() => patch({ showCoordinates: !live?.showCoordinates })} />
            <ToggleButton active={!!live?.arrowsEnabled} icon={<Square size={19} />} label="Enable arrow drawing" onClick={() => patch({ arrowsEnabled: !live?.arrowsEnabled })} />
            <ToggleButton active={!!live?.setupMode || tool === "setup"} icon={<Settings size={19} />} label="Customize board setup" onClick={() => { setTool("setup"); patch({ setupMode: !live?.setupMode }); }} />
            <ToolButton icon={<Eraser size={19} />} label="Clear highlights and arrows" onClick={() => patch({ drawings: [] })} />
            <ToolButton icon={<FlipHorizontal size={19} />} label="Flip board" onClick={() => patch({ orientation: live?.orientation === "white" ? "black" : "white" })} />
            <ToggleButton active={!!live?.soundEnabled} icon={live?.soundEnabled ? <Volume2 size={19} /> : <VolumeX size={19} />} label="Piece sounds" onClick={() => patch({ soundEnabled: !live?.soundEnabled })} />
            <ToolButton icon={<RefreshCcw size={19} />} label="Reset game" onClick={resetGame} />
            <ToolButton icon={<Library size={19} />} label="Load PGNs" onClick={() => setActiveTab("pgn")} />
            <ToolButton icon={<ChevronLeft size={19} />} label="Load previous game" onClick={() => loadAdjacentPgn(-1)} />
            <ToolButton icon={<ChevronRight size={19} />} label="Load next game" onClick={() => loadAdjacentPgn(1)} />
          </div>

          <div className="flex-1">
            <div className="mx-auto w-fit rounded-lg border border-slate-200 bg-[#f6f2ea] p-3 shadow-sm">
              <Chessboard
                id={`classroom-board-${classroomId}`}
                position={boardPosition as any}
                boardWidth={boardWidth}
                boardOrientation={live?.orientation || "white"}
                onPieceDrop={onDrop}
                onPieceDropOffBoard={onPieceDropOffBoard as any}
                onSquareClick={onSquareClick as any}
                customArrows={live?.arrowsEnabled ? (arrows as any) : []}
                customSquareStyles={squareStyles as any}
                areArrowsAllowed={!!live?.arrowsEnabled}
                arePiecesDraggable={!live?.locked && (coach || canMove)}
                arePremovesAllowed={!!live?.illegalMovesEnabled}
                dropOffBoardAction={live?.setupMode || tool === "setup" ? "trash" : "snapback"}
                showBoardNotation={live?.showCoordinates !== false}
                customDarkSquareStyle={{ backgroundColor: "#b9875f" }}
                customLightSquareStyle={{ backgroundColor: "#f1d9aa" }}
                customBoardStyle={{ borderRadius: "4px", overflow: "hidden" }}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button onClick={() => navigateMove(0)} className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 bg-white text-slate-700"><SkipBack size={17} /></button>
              <button onClick={() => navigateMove(currentMoveIndex - 1)} className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 bg-white text-slate-700"><ChevronLeft size={17} /></button>
              <span className="rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">{currentMoveIndex} / {pgnMoves.length || (live?.moveHistory || []).length}</span>
              <button onClick={() => navigateMove(currentMoveIndex + 1)} className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 bg-white text-slate-700"><ChevronRight size={17} /></button>
              <button onClick={() => navigateMove(pgnMoves.length)} className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 bg-white text-slate-700"><SkipForward size={17} /></button>
              <button onClick={() => loadAdjacentPgn(-1)} className="ml-2 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold">Previous game</button>
              <button onClick={() => loadAdjacentPgn(1)} className="rounded-md bg-purple-700 px-3 py-2 text-xs font-semibold text-white">Next game</button>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
              <input
                className="h-11 rounded-md border border-slate-200 px-3 text-sm"
                placeholder="Current topic, e.g. Queen-side attack"
                defaultValue={live?.topic || ""}
                onBlur={(event) => coach && patch({ topic: event.target.value })}
                disabled={!coach}
              />
              <div className="flex gap-2">
                <button onClick={askEveryone} className="inline-flex h-11 items-center gap-2 rounded-md border border-purple-200 bg-purple-50 px-4 text-sm font-semibold text-purple-800"><Send size={16} /> Ask</button>
                <button onClick={createQuiz} className="inline-flex h-11 items-center gap-2 rounded-md bg-purple-700 px-4 text-sm font-semibold text-white"><Sparkles size={16} /> Quiz</button>
              </div>
            </div>

            {activeQuestion && (
              <div className="mt-4 rounded-lg border border-purple-200 bg-purple-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-purple-950">{activeQuestion.title}</h3>
                    <p className="mt-1 text-sm text-purple-800">{activeQuestion.instructions}</p>
                  </div>
                  <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-purple-700">{activeQuestion.type?.replaceAll("_", " ")}</span>
                </div>
                {!coach && (
                  <div className="mt-3 flex gap-2">
                    <input value={moveAnswer} onChange={(event) => setMoveAnswer(event.target.value)} className="h-10 flex-1 rounded-md border px-3 text-sm" placeholder="Enter move, e.g. Nf3" />
                    <button onClick={submitResponse} className="rounded-md bg-purple-700 px-3 text-sm font-semibold text-white">Submit</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <aside className="border-t border-slate-200 xl:border-l xl:border-t-0">
          <div className="grid grid-cols-5 border-b border-slate-200 text-sm">
            {[
              ["students", Users, "Students"],
              ["pgn", Library, "PGN Library"],
              ["chat", MessageSquare, "Chat"],
              ["moves", ClipboardList, "Moves"],
              ["leaderboard", Crown, "Leaderboard"],
            ].map(([key, Icon, label]: any) => (
              <button key={key} onClick={() => setActiveTab(key)} className={`flex h-14 items-center justify-center gap-1 border-b-2 text-xs font-semibold ${activeTab === key ? "border-purple-700 text-purple-800" : "border-transparent text-slate-500"}`} title={label}>
                <Icon size={17} />
                <span className="hidden 2xl:inline">{label}</span>
              </button>
            ))}
          </div>

          <div className="h-[calc(100vh-225px)] min-h-[620px] overflow-auto p-4">
            {activeTab === "students" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-950">Classroom Students</h3>
                  <p className="mt-1 text-sm text-slate-500">{activeStudents.length} students available for this session</p>
                </div>
                <div className="space-y-2">
                  {students.map((student: any) => {
                    const hasControl = (live?.boardControlStudents || []).some((s: any) => s._id === student._id || s === student._id);
                    return (
                      <div key={student._id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                        <div className="flex items-center gap-3">
                          <div className="grid h-9 w-9 place-items-center rounded-full bg-purple-100 text-xs font-bold text-purple-800">{initials(student.name)}</div>
                          <div>
                            <div className="text-sm font-semibold text-slate-950">{student.name}</div>
                            <div className="text-xs text-slate-500">{student.username || student.email}</div>
                          </div>
                        </div>
                        {coach && (
                          <button
                            onClick={() => {
                              const current = (live?.boardControlStudents || []).map((s: any) => s._id || s);
                              patch({ boardControlStudents: hasControl ? current.filter((id: any) => id !== student._id) : [...current, student._id], studentMovesEnabled: true, mode: "student_move" });
                            }}
                            className={`rounded-md px-3 py-2 text-xs font-semibold ${hasControl ? "bg-purple-700 text-white" : "bg-slate-100 text-slate-700"}`}
                          >
                            {hasControl ? "Control on" : "Give move"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === "pgn" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-950">PGN Library</h3>
                  <p className="mt-1 text-sm text-slate-500">Load a file directly into the classroom board, then use previous and next game near the board.</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <label className="text-xs font-semibold text-slate-600">Load PGN or FEN</label>
                  <textarea
                    value={manualLoadText}
                    onChange={(event) => setManualLoadText(event.target.value)}
                    className="mt-2 min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                    placeholder="Paste a PGN or FEN here"
                  />
                  <button onClick={loadManualPosition} className="mt-2 h-10 w-full rounded-md bg-purple-700 text-sm font-semibold text-white">Load on board</button>
                </div>
                <div className="space-y-2">
                  {pgnLibrary.length ? pgnLibrary.map((pgn: any, index: number) => (
                    <button key={pgn._id} onClick={() => loadPgn(pgn, index)} className={`w-full rounded-lg border p-3 text-left transition hover:border-purple-300 hover:bg-purple-50 ${live?.pgnTitle === pgn.title ? "border-purple-300 bg-purple-50" : "border-slate-200"}`}>
                      <div className="text-sm font-semibold text-slate-950">{pgn.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{pgn.folder || "Library"} · {pgn.white || "White"} vs {pgn.black || "Black"} {pgn.result ? `· ${pgn.result}` : ""}</div>
                    </button>
                  )) : <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No PGNs available yet.</div>}
                </div>
              </div>
            )}

            {activeTab === "chat" && (
              <div className="flex min-h-full flex-col">
                <div className="flex-1 space-y-2">
                  {chatMessages.length ? chatMessages.map((message: any) => (
                    <div key={message._id} className="rounded-lg bg-slate-50 p-3">
                      <div className="text-xs font-semibold text-slate-500">{message.sender?.name || message.sender?.username || "User"}</div>
                      <div className="mt-1 text-sm text-slate-800">{message.message}</div>
                    </div>
                  )) : <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No classroom messages yet.</div>}
                </div>
                <div className="mt-4 flex gap-2">
                  <input value={chatText} onChange={(event) => setChatText(event.target.value)} onKeyDown={(event) => event.key === "Enter" && sendChat()} className="h-11 flex-1 rounded-md border border-slate-200 px-3 text-sm" placeholder="Send a classroom message" />
                  <button onClick={sendChat} className="grid h-11 w-11 place-items-center rounded-md bg-purple-700 text-white"><Send size={17} /></button>
                </div>
              </div>
            )}

            {activeTab === "moves" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-950">Notation</h3>
                    <button onClick={() => patch({ engineEnabled: !live?.engineEnabled })} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold ${live?.engineEnabled ? "bg-purple-700 text-white" : "bg-slate-100 text-slate-600"}`}><Bot size={15} /> Stockfish</button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{live?.pgnTitle || "Current classroom game"}</p>
                </div>
                <div className="grid grid-cols-[44px_1fr_1fr] gap-y-1 text-sm">
                  {(pgnMoves.length ? pgnMoves : live?.moveHistory || []).map((move: string, index: number) => (
                    <button key={`${move}-${index}`} onClick={() => navigateMove(index + 1)} className={`contents ${index + 1 === currentMoveIndex ? "font-semibold text-purple-800" : "text-slate-700"}`}>
                      {index % 2 === 0 && <span className="rounded-l-md px-2 py-2 text-slate-400">{Math.floor(index / 2) + 1}.</span>}
                      {index % 2 !== 0 && <span />}
                      <span className={`px-2 py-2 ${index + 1 === currentMoveIndex ? "rounded-md bg-purple-700 text-white" : "hover:bg-slate-50"}`}>{move}</span>
                    </button>
                  ))}
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-950"><Bot size={16} /> Engine</div>
                  <p className="break-words text-xs text-slate-600">{live?.engineEnabled ? engineText : "Engine disabled"}</p>
                </div>
              </div>
            )}

            {activeTab === "leaderboard" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-950">Live Leaderboard</h3>
                  <p className="mt-1 text-sm text-slate-500">Quiz and Ask Everyone results update here.</p>
                </div>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <div className="grid grid-cols-[60px_1fr_86px_88px] border-b bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-500">
                    <span>Rank</span><span>Student</span><span>Points</span><span>Done</span>
                  </div>
                  {leaderboardRows.length ? leaderboardRows.map((row: any, index: number) => (
                    <div key={row._id} className="grid grid-cols-[60px_1fr_86px_88px] items-center border-b px-3 py-3 text-sm last:border-b-0">
                      <span className="font-semibold text-slate-500">#{index + 1}</span>
                      <span className="font-semibold text-slate-950">{row.name}<span className="block text-xs font-normal text-slate-500">{row.move || "No response yet"}</span></span>
                      <span>{row.points}</span>
                      <span>{row.completed ? "Yes" : "No"}</span>
                    </div>
                  )) : <div className="p-8 text-center text-sm text-slate-500">No quiz responses yet.</div>}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">{classroomName}</h3>
                <p className="text-sm text-slate-500">Instructor: {coachName}</p>
              </div>
              <button className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 text-slate-700" title="Save classroom notes as PDF">
                <BookOpen size={17} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setActiveTab("pgn")} className="h-11 rounded-md bg-purple-700 text-sm font-semibold text-white">Load PGNs</button>
              <button onClick={() => toast.info("Classroom ended for this coach view")} className="h-11 rounded-md bg-red-500 text-sm font-semibold text-white">End Classroom</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
