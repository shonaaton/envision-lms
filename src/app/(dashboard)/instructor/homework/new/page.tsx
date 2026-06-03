"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Puzzle = { fen: string; solution: string; prompt: string; points: number };

export default function NewHomeworkPage() {
  const router = useRouter();
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [classroom, setClassroom] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [puzzles, setPuzzles] = useState<Puzzle[]>([{ fen: "", solution: "", prompt: "", points: 1 }]);

  useEffect(() => { fetch("/api/classrooms").then((r) => r.json()).then(setClassrooms); }, []);

  function update(i: number, patch: Partial<Puzzle>) {
    setPuzzles((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function add() { setPuzzles((p) => [...p, { fen: "", solution: "", prompt: "", points: 1 }]); }
  function remove(i: number) { setPuzzles((p) => p.filter((_, idx) => idx !== i)); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      classroom, title, description,
      puzzles: puzzles.map((p) => ({ fen: p.fen, prompt: p.prompt, points: Number(p.points) || 1, solution: p.solution.trim().split(/\s+/).filter(Boolean) })),
    };
    const res = await fetch("/api/homework", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return toast.error("Failed to create");
    toast.success("Homework assigned");
    router.push("/homework");
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-4">
      <h1 className="font-display text-3xl text-accent">Assign Homework</h1>
      <div className="card space-y-3">
        <select className="input" value={classroom} onChange={(e) => setClassroom(e.target.value)} required>
          <option value="">Choose classroom</option>
          {classrooms.map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
        </select>
        <input className="input" placeholder="Homework title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <textarea className="input min-h-[80px]" placeholder="Instructions" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      {puzzles.map((p, i) => (
        <div key={i} className="card space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-white font-semibold">Puzzle {i + 1}</div>
            {puzzles.length > 1 && <button type="button" className="btn-ghost text-red-400" onClick={() => remove(i)}>Remove</button>}
          </div>
          <input className="input font-mono text-xs" placeholder="FEN (starting position)" value={p.fen} onChange={(e) => update(i, { fen: e.target.value })} required />
          <input className="input" placeholder="Solution in SAN, space separated (e.g. Nf6 Bxc6+ bxc6)" value={p.solution} onChange={(e) => update(i, { solution: e.target.value })} required />
          <input className="input" placeholder="Prompt (optional, e.g. White to move and mate in 2)" value={p.prompt} onChange={(e) => update(i, { prompt: e.target.value })} />
          <input className="input w-32" type="number" min={1} value={p.points} onChange={(e) => update(i, { points: Number(e.target.value) })} />
        </div>
      ))}
      <button type="button" className="btn-outline" onClick={add}>+ Add puzzle</button>
      <button type="submit" className="btn-accent w-full">Assign homework</button>
    </form>
  );
}
