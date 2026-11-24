/**
 * Renders an opening's description: blank lines split paragraphs, lines
 * starting with "-" or "*" become bullets, and a line ending in ":" on its own
 * becomes a small heading ("Responsibilities:"). Plain text in, no HTML.
 */
export default function JobDescription({ text, className = "" }: { text: string; className?: string }) {
  const blocks = String(text || "").replace(/\r/g, "").split(/\n{2,}/).map((block) => block.split("\n").map((line) => line.trim()).filter(Boolean)).filter((block) => block.length);
  if (!blocks.length) return null;
  return (
    <div className={`space-y-4 text-sm leading-7 text-brand-900/80 ${className}`}>
      {blocks.map((lines, index) => {
        const heading = lines[0].endsWith(":") && lines[0].length < 80 ? lines[0].slice(0, -1) : null;
        const rest = heading ? lines.slice(1) : lines;
        const bullets = rest.length > 0 && rest.every((line) => /^[-*•]\s+/.test(line));
        return (
          <div key={index}>
            {heading ? <h3 className="mb-1.5 text-base font-black text-brand-900">{heading}</h3> : null}
            {bullets ? (
              <ul className="list-disc space-y-1 pl-5">
                {rest.map((line, i) => <li key={i}>{line.replace(/^[-*•]\s+/, "")}</li>)}
              </ul>
            ) : rest.length ? (
              <p>{rest.map((line, i) => <span key={i}>{i ? <br /> : null}{line.replace(/^[-*•]\s+/, "• ")}</span>)}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
