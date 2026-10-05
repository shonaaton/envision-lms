import type { BlogPost } from "@/lib/blog/types";

const post: BlogPost = {
  slug: "how-chess-pieces-move",
  title: "How Do Chess Pieces Move? A Beginner's Guide | Envision",
  h1: "How Chess Pieces Move: A Complete Beginner's Guide",
  description:
    "How each chess piece moves and captures - king, queen, rook, bishop, knight and pawn - with board diagrams, piece values and the mistakes beginners make most.",
  keyword: "how do chess pieces move",
  keywords: [
    "how do chess pieces move",
    "how chess pieces move",
    "chess piece movement",
    "how does the knight move in chess",
    "chess pieces names and moves",
    "chess piece values",
    "learn chess for beginners",
  ],
  category: "learn-chess",
  excerpt:
    "Every chess piece moves in its own pattern. Here is each one - king, queen, rook, bishop, knight and pawn - with a diagram of exactly where it can go, how it captures, and what it is worth.",
  publishedAt: "2026-10-05",
  updatedAt: "2026-10-05",
  relatedCourses: ["beginner-chess-course"],
  relatedPosts: ["chess-rules-for-beginners", "how-to-checkmate-basic-mates", "chess-opening-principles-for-beginners"],
  priority: 90,
  body: [
    {
      type: "p",
      text: "There are six kinds of chess piece, and each moves in its own fixed pattern. The **rook** moves in straight lines, the **bishop** moves diagonally, the **queen** does both, the **king** moves one square in any direction, the **knight** jumps in an L-shape, and the **pawn** moves forward one square (two on its first move) but captures diagonally. Every piece except the pawn captures the same way it moves, by landing on an enemy piece's square.",
    },
    {
      type: "p",
      text: "That paragraph is the whole system - but it only sticks once you see each pattern on a board. Below is every piece with a diagram showing the squares it can reach. This is the same order our coaches teach movement in the first sessions of the [Beginner Chess Course](/beginner-chess-course): the straight-line pieces first, the knight last, because it is the one piece that breaks the pattern.",
    },
    { type: "h2", id: "the-board", text: "First, the chessboard" },
    {
      type: "p",
      text: "A chessboard has 64 squares in an 8 x 8 grid. The columns are called **files** and are lettered a to h from White's left; the rows are called **ranks** and are numbered 1 to 8 from White's side. Every square has a name made of its file and rank - e4, d5, h8 - which is how moves are written down and how this guide refers to squares.",
    },
    {
      type: "p",
      text: "The board is always placed so that each player has a **light square in the bottom-right corner**. Getting this wrong swaps the king and queen, and it is the most common set-up mistake there is.",
    },
    {
      type: "diagram",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      caption: "The starting position. White's queen starts on d1, a light square; Black's on d8, a dark square - \"queen on her own colour\".",
      alt: "Chess starting position: white pieces on ranks 1 and 2, black pieces on ranks 7 and 8, rooks in the corners, then knights, bishops, queens on d1 and d8, kings on e1 and e8.",
    },
    { type: "h2", id: "rook", text: "How does the rook move?" },
    {
      type: "p",
      text: "The rook moves any number of squares in a straight line - forwards, backwards, left or right - along its file or rank. It cannot jump over pieces. If an enemy piece is in its path, the rook can capture it by landing on that square; if one of its own pieces is in the way, it has to stop before it.",
    },
    {
      type: "diagram",
      fen: "8/8/8/8/3R4/8/8/8 w - - 0 1",
      dots: ["d1", "d2", "d3", "d5", "d6", "d7", "d8", "a4", "b4", "c4", "e4", "f4", "g4", "h4"],
      caption: "A rook on d4 controls the whole d-file and the whole fourth rank: 14 squares.",
      alt: "White rook on d4 on an empty board, with dots on every square of the d-file and the fourth rank that it can move to.",
    },
    {
      type: "p",
      text: "A rook always controls 14 squares on an empty board, wherever it stands. That is why rooks become so strong in the endgame, once the pawns that block their files have gone.",
    },
    { type: "h2", id: "bishop", text: "How does the bishop move?" },
    {
      type: "p",
      text: "The bishop moves any number of squares diagonally, in any of the four diagonal directions. Like the rook, it cannot jump over pieces. Because it only moves diagonally, **a bishop stays on the same colour square for the whole game** - each side has one light-squared bishop and one dark-squared bishop.",
    },
    {
      type: "diagram",
      fen: "8/8/8/8/3B4/8/8/8 w - - 0 1",
      dots: ["a1", "b2", "c3", "e5", "f6", "g7", "h8", "a7", "b6", "c5", "e3", "f2", "g1"],
      caption: "A bishop on d4 reaches 13 squares along two long diagonals - and never a light square.",
      alt: "White bishop on the dark square d4, with dots on the diagonals a1 to h8 and a7 to g1 showing the squares it can reach.",
    },
    { type: "h2", id: "queen", text: "How does the queen move?" },
    {
      type: "p",
      text: "The queen combines the rook and the bishop: she moves any number of squares in a straight line or diagonally. From the centre of an empty board she reaches 27 squares, which is why she is the most powerful piece on the board - and why losing her early usually loses the game.",
    },
    {
      type: "diagram",
      fen: "8/8/8/8/3Q4/8/8/8 w - - 0 1",
      dots: ["d1", "d2", "d3", "d5", "d6", "d7", "d8", "a4", "b4", "c4", "e4", "f4", "g4", "h4", "a1", "b2", "c3", "e5", "f6", "g7", "h8", "a7", "b6", "c5", "e3", "f2", "g1"],
      caption: "A queen on d4 reaches 27 squares - every square a rook and a bishop on d4 could reach together.",
      alt: "White queen on d4 with dots on the d-file, the fourth rank and both diagonals through d4, 27 squares in total.",
    },
    {
      type: "callout",
      title: "Coach's tip",
      text: "Beginners love bringing the queen out on move two. Resist it. A queen in the middle of the board early gets chased by the opponent's knights and bishops, and every move she spends running away is a move your other pieces did not develop. We cover why in [chess opening principles for beginners](/blog/chess-opening-principles-for-beginners).",
    },
    { type: "h2", id: "king", text: "How does the king move?" },
    {
      type: "p",
      text: "The king moves exactly one square in any direction: forwards, backwards, sideways or diagonally. It is not a strong attacker, but it is the piece the whole game is about. **The king can never move to a square where it would be attacked**, and the game is lost when your king is attacked and has no way out - that is checkmate.",
    },
    {
      type: "diagram",
      fen: "8/8/8/8/4K3/8/8/8 w - - 0 1",
      dots: ["d3", "d4", "d5", "e3", "e5", "f3", "f4", "f5"],
      caption: "The king on e4 can step to any of the eight squares around it.",
      alt: "White king on e4 with dots on the eight neighbouring squares d3, d4, d5, e3, e5, f3, f4 and f5.",
    },
    {
      type: "p",
      text: "The king also has one special move, **castling**, which moves the king two squares towards a rook and jumps that rook to the other side of it. It has strict conditions, so it gets its own section in our guide to [chess rules for beginners](/blog/chess-rules-for-beginners).",
    },
    { type: "h2", id: "knight", text: "How does the knight move?" },
    {
      type: "p",
      text: "The knight moves in an **L-shape**: two squares in a straight line, then one square to the side (or one square, then two). It is the only piece that **jumps over other pieces**, so a knight can never be blocked. It captures only on the square where it lands, not on the squares it jumps over.",
    },
    {
      type: "diagram",
      fen: "8/8/8/8/3N4/8/8/8 w - - 0 1",
      dots: ["b3", "b5", "c2", "c6", "e2", "e6", "f3", "f5"],
      arrows: ["d4f5"],
      caption: "A knight on d4 has eight possible landing squares. Every one is the opposite colour to d4.",
      alt: "White knight on d4 with dots on its eight L-shaped destinations: b3, b5, c2, c6, e2, e6, f3 and f5, and an arrow showing the jump to f5.",
    },
    {
      type: "p",
      text: "Two facts make the knight easier to read. First, **a knight always lands on the opposite colour** to the square it started on. Second, a knight in the corner has only two moves, against eight in the centre - which is where the saying \"a knight on the rim is dim\" comes from.",
    },
    { type: "h2", id: "pawn", text: "How does the pawn move?" },
    {
      type: "p",
      text: "The pawn is the only piece that moves differently from how it captures, and the only one that can never move backwards.",
    },
    {
      type: "ul",
      items: [
        "**Moving:** one square straight forward, onto an empty square.",
        "**First move:** from its starting square a pawn may move one or two squares forward, as long as both squares are empty.",
        "**Capturing:** one square diagonally forward. A pawn cannot capture straight ahead, so a pawn facing an enemy piece directly in front of it is simply stuck.",
      ],
    },
    {
      type: "diagram",
      fen: "8/8/8/2p1p3/3P4/8/4P3/8 w - - 0 1",
      dots: ["e3", "e4", "d5", "c5", "e5"],
      caption: "The e2-pawn can move to e3 or e4. The d4-pawn can step to d5, or capture either black pawn on c5 or e5.",
      alt: "White pawns on e2 and d4, black pawns on c5 and e5. Dots on e3 and e4 for the e-pawn's first move, a dot on d5, and rings on c5 and e5 showing the d-pawn's diagonal captures.",
    },
    {
      type: "p",
      text: "Pawns have two special rules of their own. A pawn that reaches the far side of the board is **promoted** to a queen, rook, bishop or knight. And a pawn that moves two squares can, on the very next move only, be captured **en passant** by an enemy pawn beside it. Both are explained step by step in our [chess rules guide](/blog/chess-rules-for-beginners).",
    },
    { type: "h2", id: "piece-values", text: "How much is each chess piece worth?" },
    {
      type: "p",
      text: "Pieces are given rough point values so you can tell whether a trade is good, bad or equal. These are guides, not laws - a well-placed knight can be worth more than a buried rook - but they are the starting point every player uses.",
    },
    {
      type: "table",
      caption: "Standard chess piece values",
      head: ["Piece", "Value", "Why"],
      rows: [
        ["Pawn", "1", "The basic unit. Weak alone, but it can promote."],
        ["Knight", "3", "Jumps over pieces; strongest in closed, crowded positions."],
        ["Bishop", "3", "Long range on one colour; two bishops together are a real asset."],
        ["Rook", "5", "Controls whole files and ranks; dominant in endgames."],
        ["Queen", "9", "Rook and bishop combined - the strongest piece."],
        ["King", "-", "Priceless: lose it and you lose the game."],
      ],
    },
    {
      type: "p",
      text: "So giving a knight (3) for a rook (5) wins material - chess players call that \"winning the exchange\". Giving your queen (9) for a rook (5) is a bad trade unless it leads straight to checkmate. Judging trades like this is the subject of the \"good trade, bad trade, equal trade\" session in our beginner syllabus.",
    },
    { type: "h2", id: "mistakes", text: "The movement mistakes beginners make most" },
    {
      type: "ol",
      items: [
        "**Moving a pawn diagonally without capturing,** or capturing straight ahead. Pawns move straight and capture diagonally - never the other way round.",
        "**Forgetting the knight jumps.** Players check whether a knight is blocked; it never is.",
        "**Moving the king into check.** A king cannot step onto a square an enemy piece attacks, even for one move.",
        "**Setting up the board turned the wrong way,** which swaps king and queen. Light square on the right.",
        "**Leaving pieces \"hanging\"** - undefended where they can be captured for free. Before every move, ask what your opponent's last move attacks.",
      ],
    },
    { type: "h2", id: "practise", text: "How to practise piece movement" },
    {
      type: "p",
      text: "Knowing how the pieces move is not the same as seeing their moves at a glance. Two exercises build that quickly. First, put a single piece on an empty board and name every square it can reach, out loud, as fast as you can. Second, play \"pawn wars\": just kings and pawns, and the first player to promote a pawn wins. Both teach the patterns without the noise of a full game.",
    },
    {
      type: "p",
      text: "Once each piece feels automatic, move on to how the game is won: [how to checkmate](/blog/how-to-checkmate-basic-mates), starting with king and queen against a lone king.",
    },
    {
      type: "cta",
      heading: "Learning chess with a child?",
      text: "Our Beginner Chess Course takes children from the board and the pieces to checkmate in 48 live sessions. Book a free demo class and a coach will place your child at the right session.",
      href: "/register",
      label: "Book a Free Demo Class",
    },
  ],
  faqs: [
    {
      q: "Which chess piece can jump over other pieces?",
      a: "Only the knight. It moves in an L-shape - two squares in one direction and one to the side - and jumps over anything in between. Castling also moves the rook past the king, but that is a special move rather than a jump.",
    },
    {
      q: "Can a pawn move backwards in chess?",
      a: "No. A pawn only ever moves forward, one square at a time (two on its first move), and captures one square diagonally forward. It is the only piece that cannot retreat.",
    },
    {
      q: "What is the most powerful chess piece?",
      a: "The queen, worth about nine points. She moves any distance in straight lines and diagonals, combining the rook and the bishop. The king is more important, because losing it loses the game, but it is not a strong attacker.",
    },
    {
      q: "How many squares can a knight move to?",
      a: "Up to eight from the centre of the board, but only two from a corner, three or four from the edge. A knight always lands on a square of the opposite colour to the one it started on.",
    },
    {
      q: "How long does it take a child to learn how the pieces move?",
      a: "Most children learn the moves in two or three lessons. In our beginner course the movement of every piece is covered in the first six sessions, followed by notation and a revision class before tactics begin.",
    },
  ],
};

export default post;
