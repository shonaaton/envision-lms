"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

export default function PgnLibraryPage() {
  const [list, setList] = useState<any[]>([]);
  const [pgnText, setPgnText] = useState("");
  const [title, setTitle] = useState("");

  async function load() {
    const r = await fetch("/api/pgn");
    setList(await r.json());
  }
  useEffect(() => { load(); }, []);

  async function upload() {
    const res = await fetch("/api/pgn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pgn: pgnText, title }),
    });
    if (!res.ok) return toast.error("Invalid PGN");
    toast.success("Uploaded");
    setPgnText(""); setTitle("");
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-accent">PGN Library</h1>
      <div className="card space-y-3">
        <div className="text-sm font-semibold text-white">Upload PGN</div>
        <input className="input" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="input min-h-[160px] font-mono text-xs" placeholder='[Event "..."]\n1. e4 e5 ...' value={pgnText} onChange={(e) => setPgnText(e.target.value)} />
        <button className="btn-accent" onClick={upload} disabled={!pgnText}>Upload</button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {list.map((g) => (
          <Link key={g._id} href={`/pgn/${g._id}`} className="card-hover">
            <div className="font-semibold text-white">{g.title}</div>
            <div className="mt-1 text-xs text-gray-400">{g.white || "?"} vs {g.black || "?"} • {g.result || "*"}</div>
            {g.event && <div className="mt-1 text-xs text-gray-500">{g.event}</div>}
          </Link>
        ))}
        {list.length === 0 && <div className="card text-sm text-gray-400">No games yet.</div>}
      </div>
    </div>
  );
}
