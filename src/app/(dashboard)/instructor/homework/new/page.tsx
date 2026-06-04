"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BookOpen,
  CalendarClock,
  Check,
  ChevronDown,
  ClipboardList,
  Layers3,
  Library,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";

type Puzzle = { fen: string; solution: string; prompt: string; points: number };
type ActivityPack = { id: string; name: string; description: string; puzzles: Puzzle[] };

const emptyPuzzle: Puzzle = { fen: "", solution: "", prompt: "", points: 1 };
const starterPacks: ActivityPack[] = [
  {
    id: "mate-sprint",
    name: "Mate Sprint",
    description: "Short tactical positions for quick calculation.",
    puzzles: [
      { fen: "6k1/5ppp/8/8/8/5Q2/5PPP/6K1 w - - 0 1", solution: "Qa8+", prompt: "Find the forcing check.", points: 2 },
      { fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3", solution: "Bb5", prompt: "Develop with tempo.", points: 1 },
    ],
  },
  {
    id: "endgame-basics",
    name: "Endgame Basics",
    description: "Simple king and pawn decisions for beginners.",
    puzzles: [
      { fen: "8/8/8/3k4/8/3K4/4P3/8 w - - 0 1", solution: "e4+", prompt: "Use opposition ideas.", points: 2 },
    ],
  },
];

export default function NewHomeworkPage() {
  const router = useRouter();
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [classroom, setClassroom] = useState("");
  const [title, setTitle] = useState("Knight Vision: Daily Practice");
  const [description, setDescription] = useState("Solve each position carefully. Write down the idea before moving.");
  const [dueAt, setDueAt] = useState("");
  const [puzzles, setPuzzles] = useState<Puzzle[]>([{ ...emptyPuzzle }]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [savedPacks, setSavedPacks] = useState<ActivityPack[]>([]);
  const [packName, setPackName] = useState("");

  useEffect(() => {
    fetch("/api/classrooms").then((r) => r.json()).then(setClassrooms).catch(() => toast.error("Could not load classrooms"));
    const saved = window.localStorage.getItem("activity-sets");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ActivityPack[];
        if (Array.isArray(parsed)) setSavedPacks(parsed);
      } catch {
        // Local saved sets are optional.
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("activity-sets", JSON.stringify(savedPacks));
  }, [savedPacks]);

  const activePuzzle = puzzles[activeIndex] || puzzles[0];
  const totalPoints = useMemo(() => puzzles.reduce((sum, item) => sum + (Number(item.points) || 0), 0), [puzzles]);
  const readyCount = puzzles.filter((puzzle) => puzzle.fen.trim() && puzzle.solution.trim()).length;

  function update(index: number, patch: Partial<Puzzle>) {
    setPuzzles((current) => current.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  }

  function addPuzzle(seed: Partial<Puzzle> = {}) {
    setPuzzles((current) => {
      const next = [...current, { ...emptyPuzzle, ...seed }];
      setActiveIndex(next.length - 1);
      return next;
    });
  }

  function removePuzzle(index: number) {
    setPuzzles((current) => {
      const next = current.filter((_, idx) => idx !== index);
      setActiveIndex(Math.max(0, Math.min(activeIndex, next.length - 1)));
      return next.length ? next : [{ ...emptyPuzzle }];
    });
  }

  function loadPack(pack: ActivityPack) {
    setPuzzles(pack.puzzles.map((puzzle) => ({ ...puzzle })));
    setActiveIndex(0);
    toast.success(`${pack.name} loaded`);
  }

  function savePack() {
    const name = packName.trim() || title.trim();
    if (!name) return toast.error("Add a name for this activity set");
    const pack: ActivityPack = {
      id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
      name,
      description: description || "Saved activity set",
      puzzles,
    };
    setSavedPacks((current) => [pack, ...current].slice(0, 12));
    setPackName("");
    toast.success("Activity set saved");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      classroom,
      title,
      description,
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      puzzles: puzzles.map((puzzle) => ({
        fen: puzzle.fen,
        prompt: puzzle.prompt,
        points: Number(puzzle.points) || 1,
        solution: puzzle.solution.trim().split(/\s+/).filter(Boolean),
      })),
    };
    const response = await fetch("/api/homework", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return toast.error("Failed to create assignment");
    toast.success("Assignment created");
    router.push("/homework");
  }

  return (
    <form onSubmit={submit} className="h-[calc(100vh-112px)] overflow-hidden rounded-3xl border border-brand/10 bg-white/92 p-4 text-slate-950 shadow-2xl shadow-brand-900/10 backdrop-blur">
      <header className="mb-4 flex flex-col gap-3 border-b border-brand/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-brand/70">
            <Sparkles size={14} className="text-accent-500" /> Mission Builder
          </div>
          <h1 className="mt-1 text-3xl font-black text-brand">Create Assignment</h1>
          <p className="text-sm text-slate-500">Design a compact practice mission from activity sets, chess positions, and due dates.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-outline" onClick={savePack}><Save size={16} /> Save Activity Set</button>
          <button className="btn-primary"><Check size={16} /> Create Assignment</button>
        </div>
      </header>

      <div className="grid h-[calc(100%-92px)] min-h-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_330px]">
        <section className="min-h-0 space-y-3 overflow-hidden rounded-2xl border border-brand/10 bg-[#fbf7ff] p-4">
          <PanelTitle icon={<ClipboardList size={17} />} title="Brief" />
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-600">
              Classroom
              <select className="input mt-1 h-11" value={classroom} onChange={(event) => setClassroom(event.target.value)} required>
                <option value="">Choose classroom</option>
                {classrooms.map((item) => <option key={item._id} value={item._id}>{item.title}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-600">
              Assignment Name
              <input className="input mt-1 h-11" value={title} onChange={(event) => setTitle(event.target.value)} required />
            </label>
            <label className="text-xs font-bold text-slate-600">
              Coach Notes
              <textarea className="input mt-1 h-24 resize-none" value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <label className="text-xs font-bold text-slate-600">
              Due Date
              <span className="mt-1 flex h-11 items-center gap-2 rounded-lg border border-brand/10 bg-white px-3 shadow-sm">
                <CalendarClock size={16} className="text-brand" />
                <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
              </span>
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-2">
            <Metric label="Activities" value={puzzles.length} />
            <Metric label="Ready" value={readyCount} />
            <Metric label="Points" value={totalPoints} />
          </div>
        </section>

        <section className="grid min-h-0 grid-rows-[auto_1fr] rounded-2xl border border-brand/10 bg-white shadow-lg shadow-brand-900/5">
          <div className="flex items-center justify-between border-b border-brand/10 p-4">
            <PanelTitle icon={<Layers3 size={17} />} title="Activities" />
            <button type="button" className="btn-accent h-9 min-h-9 px-3" onClick={() => addPuzzle()}><Plus size={15} /> Add</button>
          </div>
          <div className="grid min-h-0 gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="min-h-0 overflow-y-auto pr-1">
              <div className="space-y-2">
                {puzzles.map((puzzle, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`w-full rounded-xl border p-3 text-left transition ${activeIndex === index ? "border-brand bg-brand text-white shadow-lg" : "border-brand/10 bg-white hover:border-brand/30 hover:bg-brand-50"}`}
                    onClick={() => setActiveIndex(index)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-bold">Activity {index + 1}</div>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${activeIndex === index ? "bg-accent text-brand" : "bg-accent/30 text-brand"}`}>{puzzle.points || 1} pt</span>
                    </div>
                    <div className={`mt-1 line-clamp-2 text-xs ${activeIndex === index ? "text-white/75" : "text-slate-500"}`}>
                      {puzzle.prompt || puzzle.fen || "Untitled chess task"}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 rounded-2xl bg-[#fbf7ff] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-brand/60">Edit Activity</div>
                  <h2 className="text-xl font-black text-brand">Activity {activeIndex + 1}</h2>
                </div>
                {puzzles.length > 1 && (
                  <button type="button" className="rounded-lg border border-red-100 bg-white p-2 text-red-600 hover:bg-red-50" onClick={() => removePuzzle(activeIndex)} aria-label="Remove activity">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              {activePuzzle && (
                <div className="grid gap-3">
                  <label className="text-xs font-bold text-slate-600">
                    Prompt students will see
                    <input className="input mt-1 h-11" placeholder="White to move and win material" value={activePuzzle.prompt} onChange={(event) => update(activeIndex, { prompt: event.target.value })} />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    FEN position
                    <textarea className="input mt-1 h-20 resize-none font-mono text-xs" placeholder="Paste FEN here" value={activePuzzle.fen} onChange={(event) => update(activeIndex, { fen: event.target.value })} required />
                  </label>
                  <div className="grid gap-3 md:grid-cols-[1fr_120px]">
                    <label className="text-xs font-bold text-slate-600">
                      Solution moves
                      <input className="input mt-1 h-11" placeholder="SAN moves, e.g. Nf6 Bxc6+" value={activePuzzle.solution} onChange={(event) => update(activeIndex, { solution: event.target.value })} required />
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Points
                      <input className="input mt-1 h-11" type="number" min={1} value={activePuzzle.points} onChange={(event) => update(activeIndex, { points: Number(event.target.value) })} />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="grid min-h-0 grid-rows-[auto_1fr_auto] rounded-2xl border border-brand/10 bg-[#2a0936] p-4 text-white shadow-xl shadow-brand-900/20">
          <PanelTitle icon={<Library size={17} />} title="Activity Library" light />
          <div className="mt-3 min-h-0 overflow-y-auto pr-1">
            <div className="mb-3 rounded-xl border border-white/10 bg-white/10 p-3">
              <div className="text-sm font-bold">Saved sets</div>
              <div className="mt-2 flex gap-2">
                <input className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/10 px-3 text-sm text-white placeholder-white/40 outline-none focus:border-accent" placeholder="Name this set" value={packName} onChange={(event) => setPackName(event.target.value)} />
                <button type="button" className="rounded-lg bg-accent px-3 text-sm font-bold text-brand" onClick={savePack}>Save</button>
              </div>
            </div>
            <LibraryList packs={[...savedPacks, ...starterPacks]} onLoad={loadPack} />
          </div>
          <div className="mt-3 rounded-xl border border-accent/30 bg-accent/15 p-3 text-sm text-white/85">
            <BookOpen size={17} className="mb-2 text-accent" />
            Use saved activity sets as reusable lesson blocks. They are not called templates, so they stay separate from your existing setup.
          </div>
        </aside>
      </div>
    </form>
  );
}

function PanelTitle({ icon, title, light = false }: { icon: React.ReactNode; title: string; light?: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-sm font-black ${light ? "text-white" : "text-brand"}`}>
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${light ? "bg-accent text-brand" : "bg-accent/40 text-brand"}`}>{icon}</span>
      {title}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white p-3 text-center shadow-sm">
      <div className="text-lg font-black text-brand">{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function LibraryList({ packs, onLoad }: { packs: ActivityPack[]; onLoad: (pack: ActivityPack) => void }) {
  return (
    <div className="space-y-2">
      {packs.map((pack) => (
        <button key={pack.id} type="button" className="w-full rounded-xl border border-white/10 bg-white/8 p-3 text-left transition hover:border-accent/60 hover:bg-white/15" onClick={() => onLoad(pack)}>
          <div className="flex items-center justify-between gap-2">
            <div className="font-bold">{pack.name}</div>
            <ChevronDown size={15} className="-rotate-90 text-accent" />
          </div>
          <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/60">{pack.description}</div>
          <div className="mt-2 text-xs font-semibold text-accent">{pack.puzzles.length} activities</div>
        </button>
      ))}
    </div>
  );
}
