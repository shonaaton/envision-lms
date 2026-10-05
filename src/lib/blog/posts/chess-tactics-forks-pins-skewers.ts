import type { BlogPost } from "@/lib/blog/types";

const post: BlogPost = {
  slug: "chess-tactics-forks-pins-skewers",
  title: "Chess Tactics for Beginners: Forks, Pins, Skewers | Envision",
  h1: "Chess Tactics for Beginners: Forks, Pins, Skewers and Discovered Attacks",
  description:
    "The chess tactics that win most beginner games - forks, pins, skewers, discovered attacks and double checks - with diagrams, how to spot them and how to practise.",
  keyword: "chess tactics for beginners",
  keywords: [
    "chess tactics for beginners",
    "knight fork chess",
    "pin in chess",
    "skewer in chess",
    "discovered attack chess",
    "double check chess",
    "chess puzzles for beginners",
  ],
  category: "learn-chess",
  excerpt:
    "Most games below club level are decided by a tactic: a fork, a pin or a skewer that wins a piece. Learn the five patterns that matter most, see each on a board, and learn how to spot them in your own games.",
  publishedAt: "2026-10-05",
  updatedAt: "2026-10-05",
  relatedCourses: ["intermediate-chess-course", "beginner-chess-course"],
  relatedPosts: ["how-to-checkmate-basic-mates", "chess-opening-principles-for-beginners", "how-to-get-fide-rating-india"],
  priority: 70,
  body: [
    {
      type: "p",
      text: "A chess tactic is a short, forcing sequence of moves - usually checks, captures and threats - that wins material or delivers checkmate. The five every beginner should learn first are the **fork** (one piece attacks two at once), the **pin** (a piece cannot move without exposing a more valuable one behind it), the **skewer** (a valuable piece is attacked and must move, exposing a piece behind it), the **discovered attack** and the **double check**.",
    },
    {
      type: "p",
      text: "Tactics are where beginner games are won and lost. You can play a perfect opening and lose a knight to a fork on move twelve. The good news is that tactics are patterns, and patterns can be learned. This guide assumes you know [how the pieces move](/blog/how-chess-pieces-move) and what [check and checkmate](/blog/chess-rules-for-beginners) mean.",
    },
    { type: "h2", id: "fork", text: "The fork (double attack)" },
    {
      type: "p",
      text: "A **fork** is one piece attacking two or more enemy pieces at the same time. Your opponent can only save one. Any piece can fork, but the knight is the master of it, because the pieces it forks cannot capture it back: no queen, rook, bishop, king or pawn can reach a square a knight's move away. Only another knight can.",
    },
    {
      type: "diagram",
      fen: "r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1",
      highlight: ["a8", "e8"],
      caption: "A royal fork: the knight on c7 checks the king and attacks the rook. The king must move, and White takes the rook.",
      alt: "White knight on c7 forking the black king on e8 and the black rook on a8.",
    },
    {
      type: "p",
      text: "The most valuable fork is one that includes the king, because check must be answered, so the second piece is lost for certain. Look out especially for a knight landing on c7, hitting an uncastled king on e8 and the rook on a8, or on f7, hitting the queen on d8 and the rook on h8.",
    },
    { type: "h2", id: "pin", text: "The pin" },
    {
      type: "p",
      text: "A **pin** happens when a bishop, rook or queen attacks a piece that has a more valuable piece behind it on the same line. If the pinned piece moves, the piece behind it is exposed.",
    },
    {
      type: "ul",
      items: [
        "In an **absolute pin**, the piece behind is the king. The pinned piece legally cannot move at all.",
        "In a **relative pin**, the piece behind is valuable but not the king - say a queen or rook. The pinned piece can move, but it will usually cost material.",
      ],
    },
    {
      type: "diagram",
      fen: "4k3/8/2n5/1B6/8/8/8/4K3 w - - 0 1",
      highlight: ["c6", "e8"],
      arrows: ["b5e8"],
      caption: "An absolute pin: the knight on c6 cannot move, because it would expose the king on e8 to the bishop on b5.",
      alt: "White bishop on b5 pinning the black knight on c6 to the black king on e8 along the diagonal.",
    },
    {
      type: "p",
      text: "A pinned piece is a weak piece: it is not really defending anything, and you can attack it again - often with a pawn - knowing it cannot run away. \"Attack the pinned piece\" is one of the most useful rules in chess.",
    },
    { type: "h2", id: "skewer", text: "The skewer" },
    {
      type: "p",
      text: "A **skewer** is a pin in reverse. The more valuable piece is in front: it is attacked, has to move, and the less valuable piece behind it is captured.",
    },
    {
      type: "diagram",
      fen: "6q1/8/8/3k4/8/1B6/8/6K1 b - - 0 1",
      highlight: ["d5", "g8"],
      arrows: ["b3d5"],
      caption: "The bishop checks the king on d5. Once the king steps off the diagonal, the bishop takes the queen on g8.",
      alt: "White bishop on b3 giving check to the black king on d5, with the black queen behind the king on g8 on the same diagonal - a skewer.",
    },
    {
      type: "p",
      text: "Skewers are most common with rooks and queens in the endgame, where kings and pieces stand on open lines. Whenever two enemy pieces share a rank, file or diagonal, check whether you can attack the front one.",
    },
    { type: "h2", id: "discovered-attack", text: "The discovered attack" },
    {
      type: "p",
      text: "A **discovered attack** happens when one piece moves out of the way and uncovers an attack by a piece behind it. It is powerful because it creates two threats at once: one from the piece that moved and one from the piece it uncovered. When the uncovered attack is on the king, it is a **discovered check** - and then the piece that moved can go almost anywhere, even to a square where it can be captured.",
    },
    {
      type: "diagram",
      fen: "4k3/8/8/8/q3N3/8/8/4R1K1 w - - 0 1",
      highlight: ["e8", "a4"],
      arrows: ["e4c3"],
      caption: "Nc3+ uncovers check from the rook on e1 and attacks the queen on a4 at the same time. Even blocking with ...Qe4 loses the queen.",
      alt: "White knight on e4 in front of a white rook on e1, with the black king on e8 and black queen on a4. An arrow shows the knight moving to c3, discovering check and attacking the queen.",
    },
    { type: "h2", id: "double-check", text: "The double check" },
    {
      type: "p",
      text: "A **double check** is a discovered check where the piece that moves also gives check. The king is attacked by two pieces at once. You cannot block two checks or capture two pieces in one move, so **the only legal reply to a double check is to move the king**. That makes double check the most forcing move in chess, and it is behind many brilliant mates.",
    },
    { type: "h2", id: "spot-tactics", text: "How to spot tactics in your own games" },
    {
      type: "p",
      text: "Tactics do not appear by accident; they come from features in the position. Before each move, run through this checklist:",
    },
    {
      type: "ol",
      items: [
        "**Checks, captures, threats** - list every forcing move you have, in that order, and every one your opponent has.",
        "**Loose pieces** - which pieces, yours and theirs, are undefended? Undefended pieces are the targets of forks.",
        "**Lines** - are a king and queen, or a queen and rook, on the same line? That is a pin or skewer waiting to happen.",
        "**The king** - is either king short of escape squares? That is where [back-rank mates](/blog/how-to-checkmate-basic-mates) come from.",
      ],
    },
    { type: "h2", id: "practise", text: "How to practise chess tactics" },
    {
      type: "p",
      text: "The most effective method is **daily puzzle solving**: ten to fifteen minutes of puzzles grouped by theme, so the pattern repeats until it is recognised instantly. Solve them by calculating the whole line before moving, not by trying moves until one works. Then review your own games for tactics you or your opponent missed.",
    },
    {
      type: "p",
      text: "This is exactly how the first level of our [Intermediate Chess Course](/intermediate-chess-course) is built: double attacks and knight forks, pins, skewers, back-rank tactics, discovered attacks and double checks, each taught at an easy and then a medium level, with revision and practice sessions in between. Later levels move on to deflection, decoys, overloading and mates in two. Students who are still on the rules should start with the [Beginner Chess Course](/beginner-chess-course), which ends with simple tactics like attacking and capturing hanging pieces.",
    },
    {
      type: "table",
      caption: "The five beginner tactics at a glance",
      head: ["Tactic", "What happens", "Best pieces for it"],
      rows: [
        ["Fork", "One piece attacks two or more", "Knight, queen, pawn"],
        ["Pin", "A piece cannot move without exposing a bigger one behind it", "Bishop, rook, queen"],
        ["Skewer", "A big piece is attacked and must move, exposing one behind", "Bishop, rook, queen"],
        ["Discovered attack", "A moving piece uncovers an attack from another", "Any piece in front of a bishop, rook or queen"],
        ["Double check", "Two pieces give check at once - only a king move helps", "Knight or bishop moving off a line"],
      ],
    },
    {
      type: "cta",
      heading: "Make tactics automatic",
      text: "Our coaches teach every tactical pattern in order, then drill it with homework puzzles and weekly tournaments. Book a free demo class to find your child's level.",
      href: "/register",
      label: "Book a Free Demo Class",
    },
  ],
  faqs: [
    {
      q: "What is the most common tactic in chess?",
      a: "The fork, or double attack, is the most common, and the knight fork is the one beginners meet most often. Pins come a close second, especially pins against the king and queen in the opening.",
    },
    {
      q: "What is the difference between a pin and a skewer?",
      a: "In a pin, the less valuable piece is in front and cannot safely move because a more valuable piece is behind it. In a skewer, the more valuable piece is in front, is forced to move, and the piece behind it is captured.",
    },
    {
      q: "How many chess puzzles should a beginner solve a day?",
      a: "Ten to twenty puzzles a day, solved carefully, is more useful than a hundred solved quickly. Consistency matters more than volume: a short daily session builds pattern recognition faster than an occasional long one.",
    },
    {
      q: "When should a child start learning chess tactics?",
      a: "As soon as they know how the pieces move and what checkmate is. Simple tactics like attacking undefended pieces start within the first few weeks of a beginner course; named patterns like forks, pins and skewers usually follow once the rules are secure.",
    },
  ],
};

export default post;
