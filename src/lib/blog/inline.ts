/**
 * The two inline marks a post may use: `[anchor](/path)` and `**bold**`.
 *
 * Parsed into tokens rather than HTML so the renderer can turn links into
 * `next/link` and the content test can read every href without a DOM.
 */

export type InlineToken =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "link"; text: string; href: string };

const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

export function parseInline(source: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;
  for (const match of source.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) tokens.push({ kind: "text", text: source.slice(last, at) });
    if (match[1] !== undefined) tokens.push({ kind: "link", text: match[1], href: match[2] });
    else tokens.push({ kind: "bold", text: match[3] });
    last = at + match[0].length;
  }
  if (last < source.length) tokens.push({ kind: "text", text: source.slice(last) });
  return tokens;
}

/** The text a reader sees, with the marks removed - for word counts and schema. */
export function plainText(source: string) {
  return parseInline(source)
    .map((token) => token.text)
    .join("");
}

/** Every link href in a piece of inline text. */
export function inlineHrefs(source: string) {
  return parseInline(source).flatMap((token) => (token.kind === "link" ? [token.href] : []));
}
