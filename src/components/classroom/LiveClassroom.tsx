"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { toast } from "sonner";
import { FlipHorizontal, Lock, Send, Unlock } from "lucide-react";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

type Role = "student" | "instructor" | "admin";

function isCoach(role: Role) {
  return role === "admin" || role === "instructor";
}

export default function LiveClassroom({ classroomId, role, userId }: { classroomId: string; role: Role; userId: string }) {
  const [data, setData] = useState<any>(null);
  const [moveAnswer, setMoveAnswer] = useState("");
  const [quizTitle, setQuizTitle] = useState("Best move from current position");
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

  const live = data?.live;
  const classroom = data?.classroom;
  const activeQuestion = data?.activeQuestion;
  const students = classroom?.students || [];
  const boardFen = live?.fen === "start" || !live?.fen ? undefined : live.fen;
  const canMove = coach || (live?.boardControlStudents || []).some((student: any) => student._id?.toString?.() === userId || student.toString?.() === userId);
  const game = useMemo(() => {
    try {
      return live?.fen && live.fen !== "start" ? new Chess(live.fen) : new Chess();
    } catch {
      return new Chess();
    }
  }, [live?.fen]);

  async function patch(update: any) {
    const res = await fetch(`/api/classrooms/${classroomId}/live`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    if (!res.ok) return toast.error("Could not update classroom");
    await load();
  }

  function onDrop(source: string, target: string) {
    if (!canMove || live?.locked) return false;
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
      return true;
    } catch {
      return false;
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

  if (!data) return <div className="rounded-lg border border-slate-200 bg-white p-5">Loading classroom...</div>;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(520px,1fr)_380px]">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{classroom?.title}</h2>
            <p className="text-sm text-slate-500">Mode: {live?.mode?.replaceAll("_", " ")} {live?.locked ? "- Board locked" : ""}</p>
          </div>
          <div className="flex gap-2">
            {coach && <button onClick={() => patch({ orientation: live?.orientation === "white" ? "black" : "white" })} className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-xs"><FlipHorizontal size={14} /> Flip Board</button>}
            {coach && <button onClick={() => patch({ locked: !live?.locked })} className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-xs">{live?.locked ? <Unlock size={14} /> : <Lock size={14} />} {live?.locked ? "Unlock" : "Lock"}</button>}
          </div>
        </div>
        <div className="mx-auto w-full max-w-[720px]">
          <Chessboard
            position={boardFen}
            boardWidth={680}
            boardOrientation={live?.orientation || "white"}
            onPieceDrop={onDrop}
            customDarkSquareStyle={{ backgroundColor: "#b88762" }}
            customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
          />
        </div>
        <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600">Moves: {(live?.moveHistory || []).join(" ") || "No moves yet"}</div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-slate-950">Classroom Information</h3>
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            <div>Class Name: <b>{classroom?.title}</b></div>
            <div>Batch Name: <b>{classroom?.batches?.[0]?.name || "Not assigned"}</b></div>
            <div>Coach Name: <b>{classroom?.coach?.name || classroom?.instructor?.name || "Coach"}</b></div>
            <div>Current Topic: <b>{live?.topic || "Not set"}</b></div>
            <div>Student Attendance Status: <b>Present when marked in Attendance</b></div>
            <div>Students Present: <b>{students.length}</b></div>
            <div>Session Duration: <b>{Math.max(0, Math.floor((Date.now() - new Date(live?.startedAt).getTime()) / 60000))} min</b></div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-slate-950">Student Status</h3>
          <div className="mt-3 text-sm text-slate-600">
            <div className="font-medium">Present Students</div>
            <div className="mt-2 flex flex-wrap gap-2">{students.map((s: any) => <span key={s._id} className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{s.name}</span>)}</div>
            <div className="mt-3">Board Control: <b>{(live?.boardControlStudents || []).map((s: any) => s.name || s.username).join(", ") || "Coach only"}</b></div>
            <div className="mt-2">Selected Student: <b>{live?.challenge?.student?.name || "None"}</b></div>
          </div>
        </section>

        {coach && (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="font-semibold text-slate-950">Coach Controls</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {["teaching", "student_move", "one_move_challenge", "puzzle"].map((mode) => <button key={mode} onClick={() => patch({ mode })} className="rounded-md border px-2 py-2 text-xs hover:bg-slate-50">{mode.replaceAll("_", " ")}</button>)}
            </div>
            <input className="mt-3 h-10 w-full rounded-md border px-3 text-sm" placeholder="Current Topic" defaultValue={live?.topic || ""} onBlur={(e) => patch({ topic: e.target.value })} />
            <textarea className="mt-2 min-h-20 w-full rounded-md border px-3 py-2 text-sm" placeholder="Load FEN" onBlur={(e) => e.target.value && patch({ fen: e.target.value })} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={askEveryone} className="inline-flex h-9 items-center gap-1 rounded-md bg-purple-700 px-3 text-xs font-semibold text-white"><Send size={14} /> Ask Everyone</button>
              <button onClick={createQuiz} className="h-9 rounded-md border px-3 text-xs">Create Quiz From Current Position</button>
            </div>
            <input className="mt-2 h-10 w-full rounded-md border px-3 text-sm" value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} />
          </section>
        )}

        {activeQuestion && (
          <section className="rounded-lg border border-purple-200 bg-purple-50 p-4 shadow-sm">
            <h3 className="font-semibold text-purple-950">{activeQuestion.title}</h3>
            <p className="mt-1 text-sm text-purple-800">{activeQuestion.instructions}</p>
            {!coach && (
              <div className="mt-3 flex gap-2">
                <input value={moveAnswer} onChange={(e) => setMoveAnswer(e.target.value)} className="h-10 flex-1 rounded-md border px-3 text-sm" placeholder="Enter move, e.g. Nf3" />
                <button onClick={submitResponse} className="rounded-md bg-purple-700 px-3 text-sm font-semibold text-white">Submit</button>
              </div>
            )}
            {coach && <div className="mt-3 space-y-2 text-sm">{(data.responses || []).map((r: any) => <div key={r._id} className="rounded bg-white px-3 py-2">{r.student?.name}: <b>{r.submittedMove}</b> - {r.correct ? "Correct" : "Review"} - {r.timeTakenSeconds}s</div>)}</div>}
          </section>
        )}
      </aside>
    </div>
  );
}
