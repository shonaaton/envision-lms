import type { BlogPost } from "@/lib/blog/types";

const post: BlogPost = {
  slug: "how-to-checkmate-basic-mates",
  title: "How to Checkmate in Chess: 5 Basic Mates | Envision",
  h1: "How to Checkmate in Chess: The 5 Basic Mates Every Beginner Needs",
  description:
    "How to checkmate in chess: king and queen, the two-rook ladder, king and rook, the back-rank mate and Scholar's Mate, with diagrams and the stalemate traps.",
  keyword: "how to checkmate in chess",
  keywords: [
    "how to checkmate in chess",
    "basic checkmates",
    "king and queen checkmate",
    "two rook checkmate",
    "king and rook checkmate",
    "back rank mate",
    "scholar's mate",
    "checkmate patterns for beginners",
  ],
  category: "learn-chess",
  excerpt:
    "Checkmate wins the game - but only if you can actually deliver it. These five mates are the ones every beginner must know by heart, each with the final position and the method to reach it.",
  publishedAt: "2026-10-05",
  updatedAt: "2026-10-05",
  relatedCourses: ["beginner-chess-course", "intermediate-chess-course"],
  relatedPosts: ["chess-rules-for-beginners", "chess-tactics-forks-pins-skewers", "how-chess-pieces-move"],
  priority: 80,
  body: [
    {
      type: "p",
      text: "To checkmate in chess, you attack the enemy king so that it has **no legal way out**: it cannot move to a safe square, the attacking piece cannot be captured, and the check cannot be blocked. In practice that means using two pieces together - one to give check and one to cover the king's escape squares - and pushing the king to the **edge of the board**, where it has fewer squares to run to.",
    },
    {
      type: "p",
      text: "Most beginner games that should be won are drawn or lost at exactly this point: a player is a queen up and cannot finish. These five mates fix that. If you need a reminder of what check, checkmate and stalemate mean, see our [chess rules for beginners](/blog/chess-rules-for-beginners) first.",
    },
    { type: "h2", id: "principle", text: "The one principle behind every checkmate" },
    {
      type: "p",
      text: "A king in the centre of the board has eight squares around it. On the edge it has five; in a corner, three. **Every basic mate works by driving the king to the edge, then covering the remaining squares.** Your own king is part of the attack in most of them - beginners often leave it at home, and that is why the mate never comes.",
    },
    { type: "h2", id: "king-and-queen", text: "1. Checkmate with king and queen" },
    {
      type: "p",
      text: "King and queen against a lone king is the mate you will need most often, because promoting a pawn to a queen is how most endgames are won. The method has two phases.",
    },
    {
      type: "ol",
      items: [
        "**Box the king in.** Use the queen alone to shrink the area the enemy king can move in. A useful habit is to place the queen a knight's move away from the king - it cuts off a rank and a file at once without giving check. Each time the king steps back, follow it with the queen, keeping the box getting smaller.",
        "**Bring your king.** Once the enemy king is stuck on the edge, stop moving the queen and walk your own king up until it protects a square next to the enemy king.",
        "**Deliver mate.** Give check with the queen on a square your king protects, so it cannot be captured.",
      ],
    },
    {
      type: "diagram",
      fen: "k7/1Q6/2K5/8/8/8/8/8 b - - 0 1",
      highlight: ["a8"],
      caption: "Checkmate: the queen on b7 gives check and covers a7 and b8, and the king on c6 protects her.",
      alt: "Black king on a8 checkmated by a white queen on b7 that is protected by the white king on c6.",
    },
    {
      type: "callout",
      title: "The stalemate trap",
      text: "The queen covers so many squares that it is easy to take away the king's last move without giving check. That is stalemate, and it is a draw. In the position below, if the white king is far away, Qb6 with Black to move leaves the black king on a8 with no legal move.",
    },
    {
      type: "diagram",
      fen: "k7/8/1Q6/8/8/8/8/4K3 b - - 0 1",
      highlight: ["a8"],
      caption: "Black to move, not in check, and a7, b7 and b8 are all covered: stalemate. Always leave the king a square until your own king arrives.",
      alt: "Black king on a8, white queen on b6 and white king far away on e1. The black king is not in check but has no legal moves, which is stalemate.",
    },
    { type: "h2", id: "two-rooks", text: "2. The ladder mate with two rooks" },
    {
      type: "p",
      text: "Two rooks can checkmate without any help from the king. They take turns: one rook guards a rank so the king cannot step back over it, while the other gives check on the next rank, pushing the king one rank closer to the edge. Then they swap roles - like climbing a ladder - until the king is on the last rank.",
    },
    {
      type: "diagram",
      fen: "R5k1/1R6/8/8/8/8/8/6K1 b - - 0 1",
      highlight: ["g8"],
      caption: "The ladder mate: the rook on b7 guards the seventh rank and the rook on a8 gives check on the eighth.",
      alt: "Black king on g8 checkmated by two white rooks, one on a8 giving check along the back rank and one on b7 covering the seventh rank.",
    },
    {
      type: "p",
      text: "The one thing to watch: if the enemy king walks towards one of your rooks, move that rook to the far side of the board along its rank before continuing. Rooks are strongest at a distance, where the king cannot attack them.",
    },
    { type: "h2", id: "king-and-rook", text: "3. Checkmate with king and rook" },
    {
      type: "p",
      text: "King and rook against king takes longer, because one rook cannot do the ladder alone. The rook cuts the enemy king off along a rank or file, and your king walks up until the two kings stand **facing each other** with one square between them (this is called opposition). At that moment a rook check along the edge is mate.",
    },
    {
      type: "diagram",
      fen: "R2k4/8/3K4/8/8/8/8/8 b - - 0 1",
      highlight: ["d8"],
      caption: "The kings face each other on the d-file, so the rook check on a8 is mate: c7, d7 and e7 are covered by the white king.",
      alt: "Black king on d8 facing the white king on d6, checkmated by a white rook on a8 along the eighth rank.",
    },
    {
      type: "p",
      text: "When the enemy king refuses to step into opposition, make a \"waiting move\" with the rook along the same rank or file - it keeps the king cut off and passes the move back. Our beginner syllabus gives a full session each to the king-and-queen, double-rook and king-and-rook mates, followed by a combined practice class, because they need to become automatic.",
    },
    { type: "h2", id: "back-rank", text: "4. The back-rank mate" },
    {
      type: "p",
      text: "The back-rank mate happens in real games all the time. A king that has castled sits behind its own pawns; if those pawns have not moved, a rook or queen landing on the back rank gives check, and the king's own pawns block every escape.",
    },
    {
      type: "diagram",
      fen: "3R2k1/5ppp/8/8/8/8/8/6K1 b - - 0 1",
      highlight: ["g8"],
      arrows: ["d8g8"],
      caption: "The pawns on f7, g7 and h7 imprison their own king. One rook on the back rank is enough.",
      alt: "Black king on g8 behind unmoved pawns on f7, g7 and h7, checkmated by a white rook on d8 on the back rank.",
    },
    {
      type: "p",
      text: "Defending against it is easy once you know it: at a quiet moment, move one pawn in front of your castled king (h3 or g3 for White) to give it an escape square - players call this \"making luft\". Back-rank combinations are a whole topic of their own in the [Intermediate Chess Course](/intermediate-chess-course).",
    },
    { type: "h2", id: "scholars-mate", text: "5. Scholar's Mate, and how to stop it" },
    {
      type: "p",
      text: "Scholar's Mate is a four-move checkmate that beginners fall for constantly: 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#. The queen and bishop both aim at f7, the square only the black king defends.",
    },
    {
      type: "diagram",
      fen: "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4",
      highlight: ["e8", "f7"],
      caption: "Scholar's Mate: the queen takes on f7, protected by the bishop on c4. The king cannot recapture.",
      alt: "Scholar's Mate final position: white queen on f7 supported by the white bishop on c4, checkmating the black king on e8.",
    },
    {
      type: "p",
      text: "You should know it so that it never happens to you, not so you can play it. Against an opponent who knows how to defend, bringing the queen out early just loses time. The defence is simple: after 3.Qh5, play 3...g6 to block the queen, or 3...Qe7 to defend f7, and then develop your pieces while the white queen is chased around. We explain the thinking in [chess opening principles for beginners](/blog/chess-opening-principles-for-beginners).",
    },
    { type: "h2", id: "practise", text: "How to practise checkmates" },
    {
      type: "ul",
      items: [
        "**Set up each mate against a friend or a computer** and play it from a random starting position until you can mate within the fifty-move limit every time.",
        "**Solve mate-in-one puzzles daily.** Spotting a one-move mate quickly is the foundation for longer combinations - our beginner course spends four sessions on mate in one alone, from easy to mixed.",
        "**Say the escape squares out loud.** Before giving check, name every square the king could go to and what covers it. This catches stalemate too.",
      ],
    },
    {
      type: "p",
      text: "Once these are second nature, the next step is winning material that leads to mate - forks, pins and skewers. That is our guide to [chess tactics for beginners](/blog/chess-tactics-forks-pins-skewers).",
    },
    {
      type: "cta",
      heading: "Turn won positions into wins",
      text: "The Beginner Chess Course spends much of its final level on checkmate technique and mate-in-one training. Book a free demo and a coach will assess where your child is.",
      href: "/register",
      label: "Book a Free Demo Class",
    },
  ],
  faqs: [
    {
      q: "What is the fastest checkmate in chess?",
      a: "Fool's Mate, in two moves: 1.f3 e5 2.g4 Qh4#. It only happens if White makes two very weak pawn moves that open the diagonal to the king. Scholar's Mate, in four moves, is the quick mate beginners actually meet.",
    },
    {
      q: "Can you checkmate with just a king and a rook?",
      a: "Yes. King and rook against a lone king is always a win. The rook cuts the enemy king off, your king walks up to face it with one square between them, and a rook check along the edge is mate.",
    },
    {
      q: "Can you checkmate with a king and one bishop or one knight?",
      a: "No. A king with a single bishop or a single knight cannot force checkmate against a lone king, so those positions are draws by insufficient material. Two bishops, or a bishop and a knight, can force mate.",
    },
    {
      q: "How do I avoid stalemate when I am winning?",
      a: "Before every move, check whether the enemy king will still have a legal move afterwards. If it will not, and your move is not a check, choose another move. Bringing your own king up early also makes stalemate much less likely.",
    },
  ],
};

export default post;
