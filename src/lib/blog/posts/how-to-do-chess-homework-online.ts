import type { BlogPost } from "@/lib/blog/types";
import { screenshotsFor } from "@/lib/blog/screenshots";

const SLUG = "how-to-do-chess-homework-online";
const { computer, phone } = screenshotsFor(SLUG);

const post: BlogPost = {
  slug: SLUG,
  title: "How to Do Your Chess Homework Online: Step by Step | Envision",
  h1: "How to Do Your Chess Homework Online: A Step-by-Step Guide",
  description:
    "How to do chess homework online at Envision: find it, answer questions, solve positions on the board, play the computer, submit, and read your score and answers.",
  keyword: "how to do chess homework online",
  keywords: [
    "how to do chess homework online",
    "chess homework for kids",
    "online chess assignments",
    "chess puzzles homework",
    "submit chess homework",
  ],
  category: "for-parents",
  excerpt:
    "Every Envision class comes with homework in the student portal: quick questions, positions to solve on a real board and games against the computer. Here is every step on a computer and on a phone.",
  publishedAt: "2026-11-04",
  updatedAt: "2026-11-04",
  relatedCourses: ["beginner-chess-course", "intermediate-chess-course"],
  relatedPosts: ["how-to-take-the-online-chess-level-exam", "online-chess-practice-tools-for-kids", "how-to-join-an-online-chess-class"],
  priority: 38,
  body: [
    {
      type: "p",
      text: "After most classes, your coach sets **homework in the student portal**. It usually mixes three kinds of task: **quick multiple-choice questions**, **positions to solve on a chess board**, and sometimes **a game against the computer**. You open it from the **Homework** page, work through each activity, press **Submit assignment**, and see your score, XP and the right answers straight away. This guide shows every screen on a computer and on a phone.",
    },
    {
      type: "p",
      text: "Homework is where the lesson sticks. The topic your coach taught on Monday is practised on Tuesday, while it is still fresh, and the coach sees exactly which positions caused trouble before the next class. It is also the best preparation for the [level exam](/blog/how-to-take-the-online-chess-level-exam) at the end of each level, which draws its questions from the same homework.",
    },
    { type: "h2", id: "find-your-homework", text: "Step 1: Find your homework" },
    {
      type: "p",
      text: "Open the menu and go to **Class Tools → Homework**. On a phone, tap the menu button at the top left first. The page has three lists:",
    },
    {
      type: "ul",
      items: [
        "**Pending Homework**: set and not finished yet, with its due date and status (Not Started or In Progress).",
        "**Late Homework**: the due date has passed. Finish it as soon as you can and tell your coach if something stopped you.",
        "**Completed Homework**: everything you have submitted, with your score and accuracy.",
      ],
    },
    {
      type: "p",
      text: "New homework also appears on your dashboard under **Due soon**, and the bell shows a \"New homework\" message when your coach sets it. Click a homework card to open it.",
    },
    {
      type: "screenshots",
      images: [
        computer("hw-d-list", "The Homework page: pending, late and completed homework.", "Homework page listing one pending checkmate practice with its due date and one late quiz, with an empty completed list"),
        phone("hw-m-list", "The same lists on a phone.", "Homework page on a phone showing the pending checkmate practice card and the late quiz card"),
      ],
    },
    { type: "h2", id: "open-the-homework", text: "Step 2: Open it and read the top bar" },
    {
      type: "p",
      text: "The purple bar at the top shows the homework title and the coach's note. The **timer** shows how long you have been working, and **attempts** shows how many tries you have left (your coach chooses the number). Below the bar, every activity has its own card with its points.",
    },
    {
      type: "screenshots",
      images: [
        computer("hw-d-attempt", "An open homework with its timer, attempts and the first activity.", "Homework attempt page with the title bar, a 1:00 timer, 2 of 2 attempts and Activity 1 Quick questions below"),
        phone("hw-m-attempt", "The same homework on a phone.", "Phone screen showing the homework title bar with timer and attempts above the first question"),
      ],
    },
    { type: "h2", id: "questions", text: "Step 3: Answer the questions" },
    {
      type: "p",
      text: "Multiple-choice activities show one question at a time (\"Item 1 of 2\"). Click or tap an answer, then press **Submit Answer** and the next question appears. **Previous** goes back and **Skip** moves on if you want to come back to a question later. Read each question twice: one word, such as \"not\" or \"only\", often changes the answer.",
    },
    {
      type: "screenshots",
      images: [
        computer("hw-d-mcq-card", "Choose an answer, then press Submit Answer.", "Quick questions card with Checkmate selected as the answer to what it is called when the king has no way out"),
      ],
    },
    { type: "h2", id: "positions", text: "Step 4: Solve the positions on the board" },
    {
      type: "p",
      text: "Position activities show a chess board with a task such as \"Find the checkmate\". Check whose turn it is above the board, then **drag a piece or tap it and then the target square**. A correct move moves you on to the next position; the counter under the title shows your moves, mistakes and hints. If you are stuck, the **Hint** button points you to the right idea, but hints and mistakes lower your score, so think first. If a position needs several moves, the computer answers for the other side after each of yours.",
    },
    {
      type: "p",
      text: "These positions use the same patterns as class. If back-rank or queen-and-king mates are new to you, our guide to [basic checkmates](/blog/how-to-checkmate-basic-mates) explains them with diagrams.",
    },
    {
      type: "screenshots",
      images: [
        computer("hw-d-puzzle-card", "A position to solve: make the best move on the board.", "Find the checkmate card with a board showing a white rook on d1, a black king on g8 behind three pawns, and White to move"),
        computer("hw-d-puzzle-next", "Solved: the next position opens by itself.", "The next position, Queen and king, with the white queen on g1 and kings on f7 and h8"),
        phone("hw-m-puzzle-card", "Positions on a phone: tap the piece, then the square.", "Phone view of the back-rank mate position with the board, the move counter and the Hint button"),
      ],
    },
    { type: "h2", id: "play-the-computer", text: "Step 5: Play the computer (when set)" },
    {
      type: "p",
      text: "Some homework includes a game against the assignment bot. The card says the bot's level, which colour you play and whether there is a clock. Press **Start** and play your moves on the board; the moves are listed beside it. Your coach usually adds a goal, such as checkmating with the queen, so the game practises the week's topic. **Resign** ends the game if you need to stop.",
    },
    {
      type: "screenshots",
      images: [
        computer("hw-d-computer-card", "Play the computer: you play White against the assignment bot.", "Play the computer card with the starting position, You as White and Computer as Black, no clock, and a Resign button"),
      ],
    },
    { type: "h2", id: "submit", text: "Step 6: Submit and read your result" },
    {
      type: "p",
      text: "When every activity is done, press **Submit assignment** at the bottom right. Your result opens straight away:",
    },
    {
      type: "ul",
      items: [
        "**Score, accuracy, time and attempt** in the top bar.",
        "**XP and coins earned**, and any badge, which count towards the academy leaderboard.",
        "**Mistakes, hints used, boards solved and questions correct.**",
        "**Every question again** with your answer and the correct answer underneath, so you can see exactly where a mark was lost.",
      ],
    },
    {
      type: "p",
      text: "The homework then moves to **Completed Homework** with its score and accuracy. If your coach allowed more than one attempt, the attempts counter shows how many tries are left.",
    },
    {
      type: "screenshots",
      images: [
        computer("hw-d-result", "The result: score, XP, coins and every answer with the correct one.", "Completed assignment page showing score 4, 80 percent accuracy, 20 XP and 4 coins earned, 2 of 2 boards solved and 2 of 2 questions correct"),
        computer("hw-d-list-after", "Submitted homework moves to Completed, with its score.", "Homework page with the checkmate practice now under Completed Homework showing score 4 and 80 percent accuracy"),
        phone("hw-m-list-after", "The completed homework on a phone.", "Phone Homework page with no pending homework, the late quiz, and the completed checkmate practice with its score"),
      ],
    },
    { type: "h2", id: "tips", text: "Tips for parents and students" },
    {
      type: "ul",
      items: [
        "**Do it the day after class.** Ten to twenty minutes while the lesson is fresh beats an hour the night before the next class.",
        "**Look before you move.** On positions, check every check and capture first. Mistakes and hints cost marks.",
        "**Read the review.** The correct answers on the result page are the most useful part of the homework.",
        "**Ask when stuck.** Message your coach on [Ask Coach](/blog/how-to-join-an-online-chess-class#ask-coach) instead of guessing.",
        "**Keep practising between homeworks** with the portal's [practice tools](/blog/online-chess-practice-tools-for-kids): puzzles, King Hunt and games against the computer.",
      ],
    },
    {
      type: "p",
      text: "Homework is part of how every Envision course works, from the [beginner chess course](/beginner-chess-course) onwards. Coaches use the results to decide what to revise in the next class.",
    },
    {
      type: "cta",
      heading: "Want to see how our classes and homework work?",
      text: "Book a free demo class. Your child gets a live lesson with a coach and a sample homework in the portal.",
      href: "/register",
      label: "Book a free demo class",
    },
  ],
  faqs: [
    { q: "How long does chess homework take?", a: "Most homework takes 10 to 20 minutes: a few questions, a few positions and sometimes one game against the computer. The timer at the top shows how long you have spent." },
    { q: "What happens if homework is submitted late?", a: "It moves to Late Homework on the Homework page. Finish it as soon as possible; your coach can see when it was done." },
    { q: "Can my child try the homework again?", a: "Only if the coach set more than one attempt. The attempts counter at the top of the homework shows how many are left." },
    { q: "Do hints and wrong moves lose marks?", a: "Yes. Hints and mistakes lower the score for that position, so it is worth thinking through checks and captures before moving." },
    { q: "Can homework be done on a phone?", a: "Yes. Every activity works on a phone: tap a piece, then tap the square to move it. A computer or tablet gives a bigger board." },
  ],
};

export default post;
