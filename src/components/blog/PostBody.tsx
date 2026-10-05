import Link from "next/link";
import { ArrowRight, Lightbulb } from "lucide-react";
import ChessDiagram from "@/components/blog/ChessDiagram";
import { parseInline } from "@/lib/blog/inline";
import type { Block } from "@/lib/blog/types";

/** Inline text with its two marks: links become `next/link`, bold becomes `<strong>`. */
export function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((token, index) => {
        if (token.kind === "bold") return <strong key={index} className="font-black text-brand-900">{token.text}</strong>;
        if (token.kind === "link" && /^https?:\/\//.test(token.href)) {
          // Sources (FIDE, the national federation) open in a new tab and pass
          // no referrer; every internal link stays a client-side navigation.
          return (
            <a key={index} href={token.href} target="_blank" rel="noopener noreferrer" className="font-bold text-brand underline decoration-brand/30 underline-offset-[3px] transition hover:decoration-brand">
              {token.text}
            </a>
          );
        }
        if (token.kind === "link") {
          return (
            <Link key={index} href={token.href} className="font-bold text-brand underline decoration-brand/30 underline-offset-[3px] transition hover:decoration-brand">
              {token.text}
            </Link>
          );
        }
        return <span key={index}>{token.text}</span>;
      })}
    </>
  );
}

/**
 * A post's body. The page owns the H1; the body starts at H2, so every post
 * has exactly one H1 whatever its author wrote. Heading ids are stable so the
 * table of contents and shared #links survive edits to the wording.
 */
export default function PostBody({ blocks }: { blocks: Block[] }) {
  return (
    <div className="text-[1.02rem] leading-8 text-brand-900/80">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "h2":
            return (
              <h2 key={index} id={block.id} className="mt-12 scroll-mt-24 text-2xl font-black leading-tight text-brand-900 sm:text-[1.7rem]">
                {block.text}
              </h2>
            );
          case "h3":
            return (
              <h3 key={index} id={block.id} className="mt-8 scroll-mt-24 text-lg font-black leading-snug text-brand-900 sm:text-xl">
                {block.text}
              </h3>
            );
          case "p":
            return (
              <p key={index} className="mt-4">
                <Inline text={block.text} />
              </p>
            );
          case "ul":
            return (
              <ul key={index} className="mt-4 list-disc space-y-2 pl-6 marker:text-brand">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}><Inline text={item} /></li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={index} className="mt-4 list-decimal space-y-2 pl-6 marker:font-black marker:text-brand">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}><Inline text={item} /></li>
                ))}
              </ol>
            );
          case "callout":
            return (
              <aside key={index} className="mt-6 rounded-2xl border border-accent/60 bg-accent/15 p-5">
                <p className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.1em] text-brand-900">
                  <Lightbulb size={16} className="text-brand" /> {block.title}
                </p>
                <p className="mt-2 text-[0.97rem] leading-7"><Inline text={block.text} /></p>
              </aside>
            );
          case "table":
            return (
              <div key={index} className="mt-6 overflow-x-auto rounded-xl border border-brand/10">
                <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                  <caption className="bg-brand-50 px-4 py-2.5 text-left text-xs font-black uppercase tracking-[0.1em] text-brand-900/70">{block.caption}</caption>
                  <thead>
                    <tr className="bg-brand text-white">
                      {block.head.map((cell) => (
                        <th key={cell} scope="col" className="px-4 py-2.5 font-black">{cell}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-t border-brand/10 odd:bg-white even:bg-brand-50/50">
                        {row.map((cell, cellIndex) =>
                          cellIndex === 0 ? (
                            <th key={cellIndex} scope="row" className="px-4 py-2.5 font-black text-brand-900"><Inline text={cell} /></th>
                          ) : (
                            <td key={cellIndex} className="px-4 py-2.5 leading-6"><Inline text={cell} /></td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "cta":
            return (
              <aside key={index} className="mt-10 rounded-2xl bg-brand p-6 text-white shadow-xl shadow-brand-900/20 sm:p-7">
                <p className="text-lg font-black leading-snug sm:text-xl">{block.heading}</p>
                <p className="mt-2 text-sm leading-6 text-white/80">{block.text}</p>
                <Link href={block.href} className="btn-accent mt-5 inline-flex">
                  {block.label} <ArrowRight size={16} />
                </Link>
              </aside>
            );
          case "diagram":
            return <ChessDiagram key={index} diagram={block} />;
        }
      })}
    </div>
  );
}
