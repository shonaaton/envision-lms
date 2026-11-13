import type { BlogPost } from "@/lib/blog/types";
import { screenshotsFor } from "@/lib/blog/screenshots";

const SLUG = "online-chess-practice-tools-for-kids";
const { computer, phone } = screenshotsFor(SLUG);

const post: BlogPost = {
  slug: SLUG,
  title: "Chess Practice Tools: Puzzles, Games and Lessons | Envision",
  h1: "Online Chess Practice Tools for Kids: Puzzles, Games and Lessons",
  description:
    "The online chess practice tools in the Envision portal: Learn Chess lessons, Tactics Trainer, King Hunt, Square Trainer and Play vs Computer, step by step.",
  keyword: "online chess practice tools for kids",
  keywords: [
    "online chess practice tools for kids",
    "chess puzzles for kids",
    "chess tactics trainer",
    "learn chess online step by step",
    "play chess against computer for kids",
    "board vision practice",
  ],
  category: "learn-chess",
  excerpt:
    "Between classes, Envision students practise in the portal: guided lessons, rated puzzles, checkmate drills, a board-vision game and games against the computer. Here is what each tool does and how to use it.",
  publishedAt: "2026-11-04",
  updatedAt: "2026-11-04",
  relatedCourses: ["beginner-chess-course", "intermediate-chess-course"],
  relatedPosts: ["how-to-do-chess-homework-online", "online-chess-tournaments-for-students", "chess-tactics-forks-pins-skewers", "how-to-checkmate-basic-mates"],
  priority: 37,
  body: [
    {
      type: "p",
      text: "Envision students have five **online chess practice tools** in the portal, all under **Chess Tools** in the menu: **Learn Chess** (step-by-step lessons), **Tactics Trainer** (puzzles at your level), **King Hunt** (checkmate puzzles), **Square Trainer** (a board-vision game) and **Play vs Computer**. Ten minutes a day on any of them builds the patterns that win games. This guide shows what each tool does, on a computer and on a phone.",
    },
    {
      type: "p",
      text: "Practice is different from homework. Homework is set by the coach and has a due date; the practice tools are open any time, as often as you like, and the puzzles and games you solve earn XP and coins for the academy leaderboard. A good routine is homework first, then a few minutes of puzzles.",
    },
    { type: "h2", id: "learn-chess", text: "Learn Chess: lessons step by step" },
    {
      type: "p",
      text: "**Learn Chess** is a guided course inside the portal. It starts with how each piece moves - the pawn first, then the rook, bishop, queen, knight and king - and moves on to basic skills. Each lesson has short exercises, and each exercise earns up to three stars. Lessons unlock in order: finish one to open the next. The top of the page shows your overall progress and stars, and **Continue** takes you straight to where you left off.",
    },
    {
      type: "p",
      text: "It is ideal for new beginners and younger children, and a quick refresher for anyone unsure about a rule. Our written guide to [how chess pieces move](/blog/how-chess-pieces-move) covers the same ground with diagrams.",
    },
    {
      type: "screenshots",
      images: [
        computer("pr-d-learn", "Learn Chess: progress, stars and the next lesson.", "Learn Chess page showing 0 percent progress, 0 of 300 stars, a Continue Pawn button and the Pieces unit with Pawn open and other pieces locked"),
        computer("pr-d-learn-lesson", "A lesson: read it first, then do the exercises.", "Pawn lesson page listing How pawns move to read first, then exercises such as One step forward and The opening double step"),
        phone("pr-m-learn", "Learn Chess on a phone.", "Learn Chess on a phone with the progress panel, stars earned and Continue Pawn"),
      ],
    },
    { type: "h2", id: "tactics-trainer", text: "Tactics Trainer: puzzles at your level" },
    {
      type: "p",
      text: "**Tactics Trainer** gives you one puzzle at a time from a large puzzle collection. First choose a level - **Absolute Beginner (puzzle rating 1-300), Beginner (300-500), Intermediate (500-800), Advanced (800-1000) or Professional (1000+)** - and the first puzzle opens. The opponent has just moved; find the best reply. Drag or tap the pieces as usual. A **Hint** helps when you are stuck, and the next puzzle is one click away. You can change level at any time.",
    },
    {
      type: "p",
      text: "Start one level lower than feels comfortable and move up when you solve most puzzles first time. The ideas you meet most often - forks, pins and skewers - are explained in our guide to [chess tactics](/blog/chess-tactics-forks-pins-skewers).",
    },
    {
      type: "screenshots",
      images: [
        computer("pr-d-tactics-levels", "Choose a puzzle level.", "Tactics Trainer level picker with five difficulty cards from Absolute Beginner to Professional and their puzzle rating ranges"),
        computer("pr-d-tactics-puzzle", "A puzzle: find the best move.", "Tactics Trainer puzzle board at Beginner level with the side to move shown and Hint and new puzzle buttons"),
        phone("pr-m-tactics-levels", "The levels on a phone.", "Tactics Trainer level list on a phone with five difficulty buttons"),
      ],
    },
    { type: "h2", id: "king-hunt", text: "King Hunt: checkmate puzzles" },
    {
      type: "p",
      text: "**King Hunt** is a puzzle trainer made only of checkmates. It takes two steps: first choose the **checkmate length** - **Mate in 1, 2, 3, 4 or 5** - then choose the **difficulty**, using the same five levels as Tactics Trainer. Every puzzle ends with the enemy king trapped. Mate in 1 is perfect for beginners learning the basic mates; Mate in 3 and above trains calculation for stronger players.",
    },
    {
      type: "screenshots",
      images: [
        computer("pr-d-kinghunt-length", "Step 1: choose the checkmate length.", "King Hunt first step with buttons for Mate in 1 to Mate in 5"),
        computer("pr-d-kinghunt-step2", "Step 2: choose the difficulty.", "King Hunt second step showing the five difficulty levels for Mate in 1"),
        computer("pr-d-kinghunt-board", "A King Hunt puzzle: find the checkmate.", "King Hunt puzzle board with a mate-in-one position to solve"),
        phone("pr-m-kinghunt-length", "King Hunt on a phone.", "King Hunt checkmate length buttons stacked on a phone screen"),
      ],
    },
    { type: "h2", id: "square-trainer", text: "Square Trainer: learn the board" },
    {
      type: "p",
      text: "Strong players know every square's name instantly, which makes reading notation, following the coach and calculating much faster. **Square Trainer** turns that into a game. Choose a **round length (30, 60 or 120 seconds)** and the **side you read the board from (White or Black)**, then press **Start Round**. A square name such as B8 appears; click that square on the board as fast as you can. The panel tracks your score, accuracy, mistakes and best streak, and **End and Save** records the round.",
    },
    {
      type: "screenshots",
      images: [
        computer("pr-d-square-setup", "Set the round length and board side, then Start Round.", "Square Trainer setup with round length buttons 30s, 60s and 120s, board side White or Black, and a Start Round button"),
        computer("pr-d-square-round", "Click the target square before time runs out.", "Square Trainer round with target square B8, a 58 second timer, score, mistakes and streak counters beside an empty board"),
        phone("pr-m-square-round", "A round on a phone.", "Square Trainer round on a phone with the target square, timer and board"),
      ],
    },
    { type: "h2", id: "play-vs-computer", text: "Play vs Computer" },
    {
      type: "p",
      text: "**Play vs Computer** is a full game against the computer at the strength you choose. Press **Start Game** to open the setup: choose **real time, correspondence or unlimited** time, a **strength from 1 to 9** (level 1 is a friendly first opponent), and whether you play **White, Black or a random side**. Then press **Play against computer**. Moves are listed on the right, and **Resign**, **Restart** and **View History** are at the top. Moving up a level each time you win two or three games in a row is a good way to improve steadily.",
    },
    {
      type: "screenshots",
      images: [
        computer("pr-d-computer-setup", "Game setup: time, strength and side.", "Game setup window with Standard chess, the Unlimited time tab selected, strength buttons 1 to 9 with 1 selected, and White chosen as the side"),
        computer("pr-d-computer-game", "A game in progress, with the moves listed.", "Play with Computer board after 1. e4 Na6, with the move history and Resign, Restart and View History buttons"),
        phone("pr-m-computer", "Play vs Computer on a phone.", "Play with Computer on a phone with the board, Start Game and View History buttons"),
      ],
    },
    { type: "h2", id: "practice-plan", text: "A simple weekly practice plan" },
    {
      type: "table",
      caption: "Ten to fifteen minutes a day",
      head: ["Day", "Practice"],
      rows: [
        ["After each class", "Finish the homework (our [homework guide](/blog/how-to-do-chess-homework-online) shows how)"],
        ["Two days a week", "Ten Tactics Trainer puzzles at your level"],
        ["Two days a week", "Five King Hunt puzzles: Mate in 1 for beginners, Mate in 2 or 3 for others"],
        ["Once a week", "Two Square Trainer rounds, then one game against the computer"],
        ["Any day", "One Learn Chess lesson if a rule or piece still feels shaky"],
      ],
    },
    {
      type: "p",
      text: "The practice tools are included for every Envision student, alongside live classes, homework and tournaments. You can see how the whole programme fits together in our guide to [how online chess classes work](/blog/how-online-chess-classes-work).",
    },
    {
      type: "cta",
      heading: "Try the portal with a free demo class",
      text: "Book a free demo with one of our coaches. Demo accounts can try the puzzles and games too.",
      href: "/book-free-demo-class",
      label: "Book a free demo class",
    },
  ],
  faqs: [
    { q: "Which practice tool should a beginner start with?", a: "Learn Chess, then King Hunt at Mate in 1. Once the basic mates feel easy, add Tactics Trainer at the Absolute Beginner or Beginner level." },
    { q: "Do practice puzzles count for anything?", a: "Solved puzzles and finished games earn XP and coins, which appear on the academy leaderboard alongside homework and attendance." },
    { q: "How strong is the computer?", a: "You choose a strength from 1 to 9. Level 1 is a gentle first opponent; move up a level after winning a few games in a row." },
    { q: "Can the practice tools be used on a phone?", a: "Yes. Every tool works on a phone: tap a piece and then a square to move. A bigger screen helps for longer games." },
    { q: "How long should my child practise each day?", a: "Ten to fifteen minutes on most days is plenty for beginners. Regular short sessions build patterns better than one long session a week." },
  ],
};

export default post;
