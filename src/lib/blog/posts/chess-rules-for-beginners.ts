import type { BlogPost } from "@/lib/blog/types";

const post: BlogPost = {
  slug: "chess-rules-for-beginners",
  title: "Chess Rules for Beginners: Castling, En Passant | Envision",
  h1: "Chess Rules for Beginners: Check, Castling, En Passant and Draws",
  description:
    "The chess rules beginners get wrong, explained with diagrams: check and checkmate, castling, en passant, pawn promotion, stalemate and the five ways a game is drawn.",
  keyword: "chess rules for beginners",
  keywords: [
    "chess rules for beginners",
    "how to play chess",
    "castling rules in chess",
    "en passant rule",
    "pawn promotion chess",
    "stalemate in chess",
    "how does a chess game end in a draw",
  ],
  category: "learn-chess",
  excerpt:
    "Once you know how the pieces move, these are the rules that decide every game: check, checkmate, castling, en passant, promotion, stalemate and draws - each with a diagram and the common mistakes.",
  publishedAt: "2026-10-05",
  updatedAt: "2026-10-05",
  relatedCourses: ["beginner-chess-course"],
  relatedPosts: ["how-chess-pieces-move", "how-to-checkmate-basic-mates", "chess-opening-principles-for-beginners"],
  priority: 85,
  body: [
    {
      type: "p",
      text: "Chess is played by two players, White and Black, who take turns to move one piece at a time - White always moves first. The goal is to **checkmate** the opponent's king: attack it so that it cannot escape. Beyond how each piece moves, the rules every beginner needs are check, checkmate, castling, en passant, pawn promotion, stalemate and the ways a game can be drawn.",
    },
    {
      type: "p",
      text: "If you are not yet sure how each piece moves, start with [how chess pieces move](/blog/how-chess-pieces-move) and come back. Everything below assumes you know the six piece patterns.",
    },
    { type: "h2", id: "basic-rules", text: "The basic rules of a chess game" },
    {
      type: "ul",
      items: [
        "The board is set with a **light square in each player's bottom-right corner**, and the queen starts on the square of her own colour.",
        "**White moves first,** then the players alternate. You cannot pass, and you must move if you have a legal move.",
        "A piece **captures** by moving onto a square occupied by an enemy piece, which is removed from the board. You can never capture your own pieces.",
        "**Touch-move:** in a serious game, if you deliberately touch one of your pieces you must move it, and if you touch an opponent's piece you must capture it if you legally can. Say \"adjust\" first if you only want to straighten a piece.",
        "**You may never make a move that leaves your own king in check.**",
      ],
    },
    { type: "h2", id: "check", text: "What is check, and how do you get out of it?" },
    {
      type: "p",
      text: "A king is **in check** when an enemy piece attacks it. You must get out of check immediately - no other move is allowed. There are exactly three ways out, and it helps to remember them as a checklist:",
    },
    {
      type: "ol",
      items: [
        "**Move the king** to a square that is not attacked.",
        "**Capture the checking piece.**",
        "**Block the check** by putting a piece between the king and the attacker. (You cannot block a check from a knight or a pawn, because there is no square in between.)",
      ],
    },
    {
      type: "diagram",
      fen: "4k3/8/8/8/8/8/8/4R1K1 b - - 0 1",
      highlight: ["e8"],
      arrows: ["e1e8"],
      caption: "The white rook on e1 gives check down the open e-file. Black must move the king off the file - there is nothing to capture or block with.",
      alt: "White rook on e1 and white king on g1; black king on e8 in check along the e-file, shown by an arrow from e1 to e8.",
    },
    { type: "h2", id: "checkmate", text: "What is checkmate?" },
    {
      type: "p",
      text: "**Checkmate** is a check with no way out: the king cannot move to safety, the attacker cannot be captured, and the check cannot be blocked. Checkmate ends the game immediately and the side that delivered it wins. The king is never actually captured.",
    },
    {
      type: "diagram",
      fen: "3R2k1/5ppp/8/8/8/8/8/6K1 b - - 0 1",
      highlight: ["g8"],
      arrows: ["d8g8"],
      caption: "The back-rank mate. The rook gives check on the eighth rank, and the king is trapped by its own pawns.",
      alt: "Black king on g8 behind its own pawns on f7, g7 and h7, checkmated by a white rook on d8 along the back rank.",
    },
    {
      type: "p",
      text: "This back-rank pattern catches out players at every level, and it is the easiest mate to learn first. The rest of the basic mates - king and queen, two rooks, king and rook - are in our guide to [how to checkmate](/blog/how-to-checkmate-basic-mates).",
    },
    { type: "h2", id: "castling", text: "Castling: the rules and the exceptions" },
    {
      type: "p",
      text: "Castling is the only move in chess where two pieces move at once. The king moves **two squares** towards one of its rooks, and that rook jumps to the square the king passed over. Castling **kingside** (towards the h-rook) puts the king on g1 and the rook on f1; castling **queenside** (towards the a-rook) puts the king on c1 and the rook on d1. For Black it is the same on the eighth rank.",
    },
    {
      type: "diagram",
      fen: "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1",
      arrows: ["e1g1", "h1f1", "e1c1", "a1d1"],
      caption: "Kingside castling: king e1 to g1, rook h1 to f1. Queenside: king e1 to c1, rook a1 to d1.",
      alt: "White king on e1 with rooks on a1 and h1 and empty squares between them, with arrows showing the king moving to g1 or c1 and the rooks moving to f1 or d1.",
    },
    {
      type: "p",
      text: "You can only castle if **all** of these are true:",
    },
    {
      type: "ul",
      items: [
        "Neither the king nor that rook has moved before in the game.",
        "Every square between the king and the rook is empty.",
        "The king is **not in check** right now.",
        "The king does not **pass through** a square that is attacked.",
        "The king does not **land** on a square that is attacked.",
      ],
    },
    {
      type: "callout",
      title: "Common confusion",
      text: "The rook may be attacked, and it may pass over an attacked square (in queenside castling the rook crosses b1). Only the king's squares matter. And you can castle after being in check earlier in the game - only being in check right now stops it.",
    },
    { type: "h2", id: "promotion", text: "Pawn promotion" },
    {
      type: "p",
      text: "When a pawn reaches the last rank - the eighth rank for White, the first for Black - it must be **promoted** immediately, replaced by a queen, rook, bishop or knight of the same colour. You can have two or more queens on the board at once. Almost everyone chooses a queen; choosing anything else is called **underpromotion**, and it is occasionally right, for example promoting to a knight to give check, or to a rook to avoid stalemate.",
    },
    {
      type: "diagram",
      fen: "4k3/1P6/8/8/8/8/8/4K3 w - - 0 1",
      arrows: ["b7b8"],
      caption: "The b7-pawn steps to b8 and becomes a queen - usually decisive.",
      alt: "White pawn on b7 about to promote on b8, shown by an arrow, with the black king on e8 and the white king on e1.",
    },
    { type: "h2", id: "en-passant", text: "En passant, explained" },
    {
      type: "p",
      text: "**En passant** (French for \"in passing\") is a special pawn capture. If a pawn moves two squares forward from its starting square and lands **right beside an enemy pawn**, that enemy pawn may capture it as if it had moved only one square. The capturing pawn moves diagonally to the square the other pawn skipped, and the pawn that moved two squares is removed.",
    },
    {
      type: "diagram",
      fen: "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1",
      highlight: ["d5"],
      arrows: ["e5d6"],
      caption: "Black has just played d7-d5. White's e5-pawn can capture en passant by moving to d6, removing the pawn on d5.",
      alt: "White pawn on e5 beside a black pawn on d5 that has just advanced two squares; an arrow shows the white pawn capturing en passant by moving to d6.",
    },
    {
      type: "p",
      text: "Two details catch people out. En passant is only possible **on the very next move** - wait one move and the chance is gone. And it only applies to **pawns capturing pawns**; no other piece can capture en passant.",
    },
    { type: "h2", id: "stalemate", text: "What is stalemate?" },
    {
      type: "p",
      text: "**Stalemate** is when the player to move is **not in check but has no legal move**. It is a draw - not a win for either side. Stalemate is the most painful way for a beginner to throw away a won game: you have a queen against a lone king, you take away the king's last square without giving check, and the game ends level.",
    },
    {
      type: "diagram",
      fen: "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1",
      highlight: ["h8"],
      caption: "Black to move: the king on h8 is not in check, but g8, g7 and h7 are all covered. Stalemate - a draw.",
      alt: "Black king alone on h8, white queen on f7 and white king on g6. The black king is not in check but every square around it is attacked, so it is stalemate.",
    },
    {
      type: "callout",
      title: "How to avoid it",
      text: "When your opponent has only a king left, check before every move: does their king still have a legal move after mine? If the answer is no and you are not giving check, find a different move.",
    },
    { type: "h2", id: "draws", text: "The five ways a chess game can be drawn" },
    {
      type: "table",
      caption: "How a chess game ends in a draw",
      head: ["Draw", "What it means"],
      rows: [
        ["Stalemate", "The player to move is not in check and has no legal move."],
        ["Agreement", "Both players agree to a draw. In tournaments some events restrict early draw offers."],
        ["Threefold repetition", "The same position occurs three times with the same player to move. The player claims it, usually to the arbiter."],
        ["Fifty-move rule", "Fifty moves by each player with no pawn move and no capture. A player can claim the draw."],
        ["Insufficient material", "Neither side can possibly checkmate - for example king against king, or king and bishop against king."],
      ],
    },
    {
      type: "p",
      text: "In tournament play there are also rules for running out of time: if your clock runs out you lose, unless your opponent has no possible way to checkmate you, in which case it is a draw. That matters once a child starts playing in [rated chess tournaments](/blog/how-to-get-fide-rating-india).",
    },
    { type: "h2", id: "notation", text: "How chess moves are written down" },
    {
      type: "p",
      text: "Chess uses **algebraic notation**: each move is the piece letter followed by the square it moves to. K is king, Q queen, R rook, B bishop and N knight (because K already means king); pawns have no letter. An x means a capture, + means check and # means checkmate. So Nf3 is \"knight to f3\", exd5 is \"the e-pawn captures on d5\", O-O is kingside castling and O-O-O is queenside castling.",
    },
    {
      type: "p",
      text: "Writing moves down is compulsory in standard tournament games and it is the fastest way to improve, because you can replay your games afterwards and find where they turned. It is taught in the seventh session of our [Beginner Chess Course](/beginner-chess-course), straight after piece movement.",
    },
    {
      type: "cta",
      heading: "Want a coach to check your child really has the rules?",
      text: "Castling, en passant and stalemate are where self-taught players most often go wrong. A free demo class with one of our coaches finds the gaps and recommends where to start.",
      href: "/register",
      label: "Book a Free Demo Class",
    },
  ],
  faqs: [
    {
      q: "Can you castle out of check?",
      a: "No. You cannot castle while your king is in check, and the king may not pass through or land on an attacked square. You can castle later in the game, though, provided neither the king nor that rook has moved.",
    },
    {
      q: "Is stalemate a win or a draw?",
      a: "Stalemate is a draw. It happens when the player to move is not in check but has no legal move. It is not a win for the side with more pieces, however big their advantage was.",
    },
    {
      q: "Can a pawn promote to a second queen?",
      a: "Yes. A pawn that reaches the last rank can become a queen, rook, bishop or knight regardless of which pieces are still on the board, so a player can have two or more queens at once.",
    },
    {
      q: "When can you capture en passant?",
      a: "Only immediately after an enemy pawn moves two squares from its starting square and lands next to your pawn on the same rank. Your pawn captures diagonally onto the square the enemy pawn skipped. If you do not do it on that move, the right is lost.",
    },
    {
      q: "Who moves first in chess?",
      a: "White always moves first. In a casual game players often toss a coin or hide a pawn in each hand to decide colours; in tournaments the pairing decides.",
    },
  ],
};

export default post;
