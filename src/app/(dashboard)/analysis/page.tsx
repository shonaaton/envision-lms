import AnalysisBoard from "@/components/quiz/AnalysisBoard";

export default function AnalysisPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl text-accent">Analysis Board</h1>
      <p className="text-sm text-gray-400">Drop /public/stockfish/stockfish.js (Stockfish.js WASM build) to enable engine analysis.</p>
      <AnalysisBoard />
    </div>
  );
}
