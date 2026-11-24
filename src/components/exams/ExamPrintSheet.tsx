import { BoardSvg, ChessDiagramDefs } from "@/components/blog/ChessDiagram";
import { ACADEMY_DEFAULTS, academyLogoUrl } from "@/lib/branding";
import { MCQ_COUNT, POSITION_COUNT } from "@/lib/exams/examRules";

/** The parts of a staff paper the printed sheet needs. */
export type PrintablePaper = {
  levelLabel: string;
  version: number;
  status: "draft" | "published";
  mcqs: { id: string; question: string; positionFen: string; options: { id: string; text: string; correct: boolean }[]; explanation?: string; topicName: string }[];
  positions: { id: string; topicName: string; question: string; startFen: string; solution: string[]; studentColor: "white" | "black" }[];
};

export const MCQ_MARKS = 2;
export const POSITION_MARKS = 5;
const LETTERS = "ABCDEFGH";

/** Black to move, read from the FEN's second field. Boards are printed from the mover's side, as puzzle books do. */
function blackToMove(fen: string) {
  return String(fen || "").trim().split(/\s+/)[1] === "b";
}

/**
 * A level paper laid out for A4: a header with name/date boxes, the MCQs two to a row,
 * then the positions four to a row on their own page. Plain CSS (not Tailwind) so the
 * sheet prints the same wherever it is rendered, and every card refuses to split across
 * a page break.
 *
 * `answers` prints the answer key: the right option ticked and each position's solution
 * in place of the blank answer line. The student copy carries no answers at all.
 */
export default function ExamPrintSheet({ paper, answers = false }: { paper: PrintablePaper; answers?: boolean }) {
  const fens = [...paper.mcqs.map((m) => m.positionFen).filter(Boolean), ...paper.positions.map((p) => p.startFen)];
  const totalMarks = paper.mcqs.length * MCQ_MARKS + paper.positions.length * POSITION_MARKS;

  return (
    <div className="eps">
      <style>{SHEET_CSS}</style>
      <ChessDiagramDefs fens={fens} />

      <header className="eps-head">
        <div className="eps-brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- printed sheet; next/image adds nothing here */}
          <img className="eps-logo" src={academyLogoUrl(600)} alt={ACADEMY_DEFAULTS.academyName} />
          <h1>{paper.levelLabel} · Level exam</h1>
          <div className="eps-meta">
            Paper v{paper.version}
            {paper.status === "draft" ? " (draft)" : ""} · Time: 90 minutes · Maximum marks: {totalMarks}
            {answers ? <b className="eps-key"> · ANSWER KEY</b> : null}
          </div>
        </div>
        <div className="eps-fields">
          <div>
            Name<span />
          </div>
          <div>
            Date<span />
          </div>
          <div>
            Marks<span className="eps-short" />/ {totalMarks}
          </div>
        </div>
      </header>

      <section>
        <h2>
          Section A · Multiple choice <small>{paper.mcqs.length} × {MCQ_MARKS} marks · tick one answer</small>
        </h2>
        <div className="eps-mcqs">
          {paper.mcqs.map((mcq, index) => (
            <article key={mcq.id} className={mcq.positionFen ? "eps-card eps-mcq" : "eps-card eps-mcq eps-noboard"}>
              {mcq.positionFen ? (
                <div className="eps-board">
                  <BoardSvg diagram={{ fen: mcq.positionFen, alt: `Question ${index + 1} position`, flipped: blackToMove(mcq.positionFen) }} />
                  <div className="eps-tomove">{blackToMove(mcq.positionFen) ? "● Black to move" : "○ White to move"}</div>
                </div>
              ) : null}
              <div className="eps-body">
                <div className="eps-qline">
                  <b>Q{index + 1}.</b> {mcq.question}
                </div>
                <ol className="eps-options">
                  {mcq.options.map((option, i) => (
                    <li key={option.id} className={answers && option.correct ? "eps-right" : undefined}>
                      <span className="eps-box">{answers && option.correct ? "✓" : ""}</span>
                      <b>{LETTERS[i]}</b> {option.text}
                    </li>
                  ))}
                </ol>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="eps-positions-section">
        <h2>
          Section B · Positions <small>{paper.positions.length} × {POSITION_MARKS} marks · write the full solution in notation</small>
        </h2>
        <div className="eps-positions">
          {paper.positions.map((position, index) => (
            <article key={position.id} className="eps-card eps-pos">
              <div className="eps-poshead">
                <b>P{index + 1}</b>
                <span>{position.studentColor === "black" ? "● Black to move" : "○ White to move"}</span>
              </div>
              <div className="eps-posq">{position.question}</div>
              <div className="eps-posboard">
                <BoardSvg diagram={{ fen: position.startFen, alt: `Position ${index + 1}`, flipped: position.studentColor === "black" }} />
              </div>
              {answers ? (
                <div className="eps-solution">{position.solution.join(" ")}</div>
              ) : (
                <div className="eps-lines">
                  <span />
                  <span />
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {paper.mcqs.length !== MCQ_COUNT || paper.positions.length !== POSITION_COUNT ? (
        <p className="eps-warn">
          This paper has {paper.mcqs.length} MCQs and {paper.positions.length} positions; a full paper has {MCQ_COUNT} and {POSITION_COUNT}.
        </p>
      ) : null}
    </div>
  );
}

const SHEET_CSS = `
@page { size: A4; margin: 9mm 9mm 11mm; }
@page { @bottom-center { content: "Page " counter(page) " of " counter(pages); font: 8pt system-ui, sans-serif; color: #64748b; } }
.eps { width: 192mm; margin: 0 auto; color: #0f172a; font: 9pt/1.3 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.eps * { box-sizing: border-box; }
.eps h1 { margin: 0.5mm 0 0; font-size: 15pt; font-weight: 900; line-height: 1.15; }
.eps h2 { margin: 0 0 2mm; padding-bottom: 1mm; border-bottom: 0.4mm solid #5a1372; font-size: 10.5pt; font-weight: 900; color: #5a1372; text-transform: uppercase; letter-spacing: 0.03em; }
.eps h2 small { margin-left: 2mm; font-size: 8pt; font-weight: 600; color: #475569; text-transform: none; letter-spacing: 0; }
.eps-head { display: flex; gap: 6mm; align-items: flex-end; margin-bottom: 4mm; padding-bottom: 3mm; border-bottom: 0.6mm solid #0f172a; }
.eps-brand { flex: 1; min-width: 0; }
/* The logo is yellow: on its brand-purple badge it stays legible on a black-and-white printer too. */
.eps-logo { display: block; height: 11mm; width: auto; margin-bottom: 1.5mm; padding: 1mm 3mm; border-radius: 1.5mm; background: #5a1372; }
.eps-meta { margin-top: 1mm; font-size: 8.5pt; color: #334155; }
.eps-key { color: #b91c1c; }
.eps-fields { display: grid; gap: 2.2mm; width: 72mm; font-size: 8.5pt; font-weight: 700; }
.eps-fields div { display: flex; align-items: flex-end; gap: 2mm; }
.eps-fields span { flex: 1; border-bottom: 0.3mm solid #334155; height: 4mm; }
.eps-fields span.eps-short { flex: 0 0 18mm; }
.eps section { margin-bottom: 3mm; }
.eps-card { break-inside: avoid; page-break-inside: avoid; border: 0.3mm solid #cbd5e1; border-radius: 1.5mm; }
.eps-mcqs { display: grid; grid-template-columns: 1fr 1fr; gap: 2.5mm; }
.eps-mcq { display: grid; grid-template-columns: 34mm minmax(0, 1fr); gap: 2.5mm; padding: 1.8mm; }
.eps-mcq.eps-noboard { grid-template-columns: minmax(0, 1fr); }
.eps-board svg { border: 0.2mm solid #94a3b8; }
.eps-tomove { margin-top: 0.8mm; text-align: center; font-size: 7pt; font-weight: 700; color: #334155; }
.eps-body { display: flex; flex-direction: column; min-width: 0; }
.eps-qline { font-size: 8.5pt; font-weight: 600; }
.eps-qline b { color: #5a1372; }
.eps-options { list-style: none; margin: 1.5mm 0 0; padding: 0; display: grid; gap: 1mm; }
.eps-options li { display: flex; align-items: center; gap: 1.5mm; padding: 0.8mm 1.2mm; border: 0.2mm solid #e2e8f0; border-radius: 1mm; font-size: 8.5pt; }
.eps-options li b { color: #64748b; font-size: 7.5pt; }
.eps-options li.eps-right { border-color: #059669; background: #ecfdf5; font-weight: 800; color: #065f46; }
.eps-box { display: inline-flex; align-items: center; justify-content: center; width: 3.2mm; height: 3.2mm; border: 0.3mm solid #475569; border-radius: 0.6mm; font-size: 7pt; line-height: 1; flex: none; }
.eps-positions-section { break-before: page; page-break-before: always; }
.eps-positions { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 2.5mm; }
.eps-pos { display: flex; flex-direction: column; padding: 1.8mm; }
.eps-posboard { width: 40mm; max-width: 100%; margin: 0 auto; }
.eps-pos svg { border: 0.2mm solid #94a3b8; }
.eps-poshead { display: flex; justify-content: space-between; align-items: baseline; font-size: 7.5pt; font-weight: 700; color: #334155; }
.eps-poshead b { font-size: 9pt; color: #5a1372; }
.eps-posq { min-height: 6mm; margin: 0.6mm 0 1.2mm; font-size: 7.5pt; font-weight: 600; line-height: 1.25; }
.eps-lines { display: grid; gap: 4mm; margin-top: 3mm; }
.eps-lines span { display: block; border-bottom: 0.25mm solid #64748b; }
.eps-solution { margin-top: 1.5mm; padding: 1mm 1.2mm; border-radius: 1mm; background: #ecfdf5; color: #065f46; font: 700 8pt ui-monospace, Consolas, monospace; }
.eps-warn { font-size: 8pt; color: #b45309; }
@media screen {
  .eps { padding: 9mm; margin: 0 auto 8mm; background: #fff; box-shadow: 0 1px 6px rgba(15, 23, 42, 0.15); }
}
`;
