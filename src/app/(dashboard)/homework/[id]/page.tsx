"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import PuzzleBoard from "@/components/quiz/PuzzleBoard";

export default function HomeworkAttemptPage() {
  const { id } = useParams<{ id: string }>();
  const [hw, setHw] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});

  useEffect(() => {
    fetch(`/api/homework/${id}`).then((r) => r.json()).then(setHw).catch(() => {});
  }, [id]);

  if (!hw) return <div className="card">Loading...</div>;

  async function submit() {
    const payload = { answers: Object.entries(answers).map(([puzzleId, moves]) => ({ puzzleId, moves })) };
    const res = await fetch(`/api/homework/${id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return toast.error("Failed to submit");
    const sub = await res.json();
    toast.success(`Submitted! Score: ${sub.totalScore}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-accent">{hw.title}</h1>
        {hw.description && <p className="mt-2 text-gray-300">{hw.description}</p>}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {hw.puzzles?.map((p: any, i: number) => (
          <div key={p._id} className="card">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-white font-semibold">Puzzle {i + 1}</div>
              <div className="chip">{p.points ?? 1} pts</div>
            </div>
            {p.prompt && <p className="mb-3 text-sm text-gray-300">{p.prompt}</p>}
            <PuzzleBoard fen={p.fen} solution={p.solution} onSolved={() => setAnswers((a) => ({ ...a, [p._id]: p.solution }))} />
          </div>
        ))}
      </div>
      <button onClick={submit} className="btn-accent">Submit homework</button>
    </div>
  );
}
