import PlayVsComputer from "@/components/quiz/PlayVsComputer";

export default function PlayComputerPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl text-accent">Play vs Computer</h1>
      <p className="text-sm text-gray-400">Stockfish (drop into /public/stockfish/stockfish.js) — currently depth 8.</p>
      <PlayVsComputer depth={8} />
    </div>
  );
}
