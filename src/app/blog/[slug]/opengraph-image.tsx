import { ImageResponse } from "next/og";
import { categoryLabel, getBlogPost } from "@/lib/blog";

/**
 * A social card per post: the post's own headline on the academy's colours.
 *
 * Every other page shares one trophy photo. A guide shared on WhatsApp or
 * LinkedIn is the one place a unique, readable card changes whether it gets
 * opened, so posts get their own.
 *
 * Edge, because the Node build of next/og resolves its bundled font through a
 * file URL that breaks on Windows paths. The route only reads post data, which
 * has no Node-only imports, so it runs the same on both runtimes.
 */
export const runtime = "edge";

export const alt = "Envision Chess Academy chess guide";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage({ params }: { params: { slug: string } }) {
  const post = getBlogPost(params.slug);
  const headline = post?.h1 ?? "Chess guides from Envision Chess Academy";
  const label = post ? categoryLabel(post.category) : "Chess Blog";

  // A chessboard strip down the right edge: 4 files by 8 ranks.
  const squares = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      squares.push(
        <div
          key={`${row}-${col}`}
          style={{ width: 78.75, height: 78.75, background: (row + col) % 2 === 0 ? "#fde75a" : "#5a1372" }}
        />,
      );
    }
  }

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#3d0b4f" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 56px 56px 72px" }}>
          <div style={{ display: "flex" }}>
            <div style={{ background: "#fde75a", color: "#3d0b4f", fontSize: 24, fontWeight: 800, padding: "10px 22px", borderRadius: 999, letterSpacing: 2, textTransform: "uppercase" }}>
              {label}
            </div>
          </div>
          <div style={{ color: "#ffffff", fontSize: headline.length > 60 ? 54 : 64, fontWeight: 800, lineHeight: 1.12, display: "flex" }}>{headline}</div>
          <div style={{ display: "flex", alignItems: "center", color: "#fde75a", fontSize: 28, fontWeight: 700 }}>
            Envision Chess Academy
            <span style={{ color: "rgba(255,255,255,0.65)", fontWeight: 500, marginLeft: 18 }}>envisionchessacademy.com</span>
          </div>
        </div>
        <div style={{ width: 315, display: "flex", flexWrap: "wrap", opacity: 0.9 }}>{squares}</div>
      </div>
    ),
    size,
  );
}
