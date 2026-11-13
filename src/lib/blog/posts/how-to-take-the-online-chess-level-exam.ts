import type { BlogPost, ScreenshotImage } from "@/lib/blog/types";

const SLUG = "how-to-take-the-online-chess-level-exam";

const computer = (name: string, caption: string, alt: string): ScreenshotImage => ({
  src: `/blog/${SLUG}/computer-${name}.jpg`,
  width: 800,
  height: 500,
  device: "computer",
  caption,
  alt,
});

// Phone shots were taken at two zoom levels; the size is what next/image reserves.
const phone = (name: string, caption: string, alt: string, tall = false): ScreenshotImage => ({
  src: `/blog/${SLUG}/phone-${name}.jpg`,
  width: tall ? 780 : 488,
  height: tall ? 1688 : 1055,
  device: "phone",
  caption,
  alt,
});

const post: BlogPost = {
  slug: SLUG,
  title: "How to Take the Online Chess Level Exam: Step by Step | Envision",
  h1: "How to Take Your Online Chess Level Exam: A Step-by-Step Guide",
  description:
    "How the Envision online chess level exam works: 10 questions and 16 positions in 90 minutes, every screen on computer and phone, the rules, result and certificate.",
  keyword: "online chess level exam",
  keywords: [
    "online chess level exam",
    "chess exam for kids",
    "how to take a chess exam online",
    "chess level test",
    "chess certificate exam",
    "Envision exam center",
  ],
  category: "for-parents",
  excerpt:
    "Every Envision student sits a short online exam at the end of each level. Here is every screen, on a computer and on a phone: finding the exam, the rules, the questions, the positions, submitting, and getting your certificate.",
  publishedAt: "2026-11-03",
  updatedAt: "2026-11-03",
  relatedCourses: ["beginner-chess-course", "intermediate-chess-course"],
  relatedPosts: ["how-online-chess-classes-work", "how-to-checkmate-basic-mates", "chess-rules-for-beginners"],
  priority: 40,
  body: [
    {
      type: "p",
      text: "At the end of every level, Envision students take one **online chess level exam** in the academy portal: **10 multiple-choice questions and 16 chess positions, 100 marks in 90 minutes**. It stays open for **7 days**, the result appears the moment you submit, and everyone who submits gets a certificate. This guide walks through every screen, on a computer and on a phone, so there are no surprises on exam day.",
    },
    {
      type: "p",
      text: "The exam is not a pass-or-fail test. It shows the student, the parents and the coach what has stuck from the level's classes and homework, and which topics need another look before the next level of the [chess courses](/online-chess-coaching-courses) begins.",
    },
    { type: "h2", id: "at-a-glance", text: "The level exam at a glance" },
    {
      type: "table",
      caption: "What the online chess level exam contains",
      head: ["", "Detail"],
      rows: [
        ["Questions", "10 multiple-choice questions, 2 marks each, one try, no negative marking"],
        ["Positions", "16 chess positions to solve on the board, 5 marks each"],
        ["Total", "100 marks"],
        ["Time", "90 minutes from the moment you press Start"],
        ["When", "Open for 7 days after it is given, until 11:59 pm India time on the last day"],
        ["Result", "Shown straight away, with the right answer for every question you missed"],
        ["Certificate", "Sent after you submit, whatever the score"],
      ],
    },
    {
      type: "p",
      text: "Every question comes from the level the student has just finished. A student completing the [beginner chess course](/beginner-chess-course) is asked about the board, how the pieces move, check and checkmate, and basic mates. Later levels, such as the [intermediate chess course](/intermediate-chess-course), test the tactics and plans taught there.",
    },
    { type: "h2", id: "before-you-start", text: "Before you start" },
    {
      type: "p",
      text: "Once you press Start you cannot pause, so begin only when you have 90 free minutes. Get these ready first:",
    },
    {
      type: "ul",
      items: [
        "**A computer or laptop if you can.** The board is bigger and easier to use. A phone works too: hold it upright and keep it charged.",
        "**Steady internet.** Wi-Fi is best. If the connection is lost for 3 minutes, the exam submits itself.",
        "**Your login.** Your user ID (for example Aarav@ENV) or email, and your password. Log in before exam time, not at the last minute.",
        "**A quiet place** with no one helping. The exam measures what the student knows, so help only hides what needs more practice.",
        "**Other apps and tabs closed.** Turn off pop-up notifications. On a phone, silence calls and messages.",
      ],
    },
    { type: "h2", id: "find-your-exam", text: "Step 1: Find your exam" },
    {
      type: "p",
      text: "The exam appears in the **Exam Center** once the level is complete. The student also gets a \"New exam\" message in the portal bell, and the family gets an email and a WhatsApp message with the last day to take it.",
    },
    {
      type: "ol",
      items: [
        "Log in to the portal.",
        "Click the **bell** at the bottom of the menu to read the \"New exam\" message.",
        "Open the menu, then **Class Tools → Exam Center**. On a phone, tap the menu button at the top left first.",
        "The exam is under **Waiting for you**. Press **Open exam**.",
      ],
    },
    {
      type: "screenshots",
      images: [
        computer("notification", "The bell shows a \"New exam\" message.", "Portal notification panel open with a New exam: Beginner Level 1 message giving the last day to take it"),
        computer("exam-center", "The Exam Center with the exam waiting.", "Exam Center page on a computer listing Beginner Level 1 as Not started with an Open exam button"),
        phone("menu", "On a phone: menu → Class Tools → Exam Center.", "Phone menu open on Class Tools with Exam Center highlighted"),
        phone("exam-center", "Press Open exam.", "Exam Center on a phone with Beginner Level 1 waiting and a purple Open exam button", true),
      ],
    },
    { type: "h2", id: "rules-and-start", text: "Step 2: Read the rules and start" },
    {
      type: "p",
      text: "A rules box opens before the exam, and the 90 minutes start only when you press **Start the exam**. Read all nine rules. The two that matter most: you cannot pause, and leaving the exam twice submits it. Tick **\"I have read the rules\"**, which unlocks the Start button, then press **Start the exam (90 min)**. Not ready? Press **Not now**: the exam waits until its last day.",
    },
    {
      type: "screenshots",
      images: [
        computer("rules", "The rules box with the tick box and the Start button.", "Rules pop-up listing nine exam rules, a tick box to confirm, and Not now and Start the exam buttons"),
        phone("rules", "The same rules on a phone.", "The nine exam rules on a phone screen with the confirmation tick box and Start the exam button"),
      ],
    },
    { type: "h2", id: "multiple-choice", text: "Step 3: Answer the multiple-choice questions" },
    {
      type: "p",
      text: "Questions Q1 to Q10 are worth 2 marks each, and each has **one try**. A wrong answer loses nothing, so answer every question. Click or tap an answer (it turns purple and can still be changed), then press **Lock in answer**. The next question opens by itself.",
    },
    {
      type: "p",
      text: "The bar at the top is the map of the exam. The **clock** shows the time left and turns red in the last five minutes. The numbers **Q1–Q10 and P1–P16** jump straight to any question, and finished ones turn green. **Previous** and **Next** move one question at a time, so a hard question can be skipped and answered later.",
    },
    {
      type: "screenshots",
      images: [
        computer("question", "An answer selected, ready to lock in.", "Multiple-choice question about stalemate with one answer selected, the 89:50 clock and question numbers along the top"),
        phone("question", "On a phone, swipe the row of numbers sideways to reach the positions.", "Multiple-choice question on a phone with the clock, Finish exam button and Lock in answer button"),
      ],
    },
    { type: "h2", id: "positions", text: "Step 4: Solve the chess positions" },
    {
      type: "p",
      text: "Positions P1 to P16 are worth 5 marks each. Every position has a short task above the board - for example \"Find the checkmate in one move\" - and a topic label. Check whose turn it is, then move a piece by **dragging** it or by **tapping the piece and then the square**. The board is turned so the student's side is at the bottom. When a line needs more than one move, the computer plays the other side's reply.",
    },
    {
      type: "p",
      text: "Students can try as many times as they need, but every wrong move takes away **0.5 marks** and every hint takes away **2 marks**. A position never goes below 0. **Worth now** at the top right shows the marks still left on it. These are exactly the patterns from class: if back-rank mates or queen-and-king mates feel shaky, our guide to [basic checkmates](/blog/how-to-checkmate-basic-mates) is good revision before the exam.",
    },
    {
      type: "screenshots",
      images: [
        computer("position", "A position: White to move, worth 5 out of 5, with the Hint button.", "Exam position with a white rook on a1 and kings on g6 and g8, White to move, Worth now 5/5 and a Hint button"),
        phone("position", "A position ready to solve.", "Chess position on a phone with the board, White to move and the Hint button below"),
        phone("wrong-move", "After a wrong move: 0.5 marks off, now worth 4.5.", "Red message Not the move, minus 0.5 marks, try again, with the position now worth 4.5 out of 5"),
      ],
    },
    { type: "h3", id: "hints", text: "When to use a hint" },
    {
      type: "p",
      text: "Pressing **Hint (−2 marks)** opens a box that asks you to confirm first. The hint then draws an arrow on the board and names the move. One hint costs as much as four wrong moves, so it is worth trying a couple of ideas first and keeping hints for positions where you are truly stuck.",
    },
    {
      type: "screenshots",
      images: [
        computer("hint-confirm", "\"Take a hint?\" asks you to confirm.", "Confirmation box saying the hint shows the next move and takes away 2 marks, with No and Yes, show it buttons"),
        computer("hint", "The hint arrow and the move. The position is now worth 2.5.", "Board with an arrow from a1 to a8 and the text Hint: play Ra8#, the position now worth 2.5 out of 5"),
      ],
    },
    { type: "h2", id: "submit", text: "Step 5: Finish and submit" },
    {
      type: "p",
      text: "When everything is done, press **Finish exam** at the top right. A box shows how many questions are answered and positions solved; anything left blank scores 0. **Keep going** goes back to the exam, and the green numbers in the top bar show what is still missing. **Submit** ends the exam for good.",
    },
    {
      type: "screenshots",
      images: [
        computer("submit", "The Submit your exam now? box.", "Submit your exam now box saying 1 of 10 questions answered and 1 of 16 positions solved, with Keep going and Submit"),
        phone("submit", "The same box on a phone.", "Submit confirmation on a phone listing answered questions and solved positions with Keep going and Submit buttons"),
      ],
    },
    { type: "h3", id: "auto-submit", text: "When the exam submits by itself" },
    {
      type: "table",
      caption: "What ends the exam automatically",
      head: ["What happens", "Result"],
      rows: [
        ["The 90 minutes run out", "The exam submits with the answers so far"],
        ["Switching to another tab or app, the first time", "A red warning appears; press Back to the exam and carry on"],
        ["Leaving a second time", "The exam submits straight away"],
        ["Refreshing the page, or closing the tab, app or browser", "The exam submits straight away (the browser first asks \"Leave site?\" - choose Stay)"],
        ["The internet drops for 3 minutes", "The exam submits with the answers saved so far"],
      ],
    },
    {
      type: "p",
      text: "Answers are saved the moment they are locked in, so an automatic submit never loses work already done. The Back button is blocked during the exam and shows a message instead.",
    },
    {
      type: "screenshots",
      images: [
        computer("warning", "The one warning after leaving the exam.", "Red warning box saying you left the exam, this is your only warning, with a Back to the exam button"),
        phone("warning", "The same warning on a phone.", "Phone screen showing the Warning: you left the exam message over the exam board"),
      ],
    },
    { type: "h2", id: "result-and-certificate", text: "Step 6: Your result and certificate" },
    {
      type: "p",
      text: "The score appears the moment the exam is submitted: the **total out of 100**, then the marks for the questions (out of 20) and the positions (out of 80). Below that, every question is listed with its marks, a **By topic** chart shows the strongest and weakest topics, and **Review your mistakes** gives the right answer for every missed question and the solution for every unsolved position. Going through that review with the coach is the most useful ten minutes after any exam.",
    },
    {
      type: "p",
      text: "The certificate first shows as \"Being prepared\". When it is ready, a yellow **Download certificate** button appears on the result page and in the Exam Center.",
    },
    {
      type: "screenshots",
      images: [
        computer("result", "The result card and the marks for every question.", "Result page showing 83.5 out of 100 with MCQ and position marks listed question by question"),
        computer("review", "By topic, and Review your mistakes with the right answer.", "By topic bars for four topics and a Review your mistakes card marking White as the right answer"),
        computer("certificate", "The Download certificate button once the certificate is ready.", "Exam complete card with the score and a yellow Download certificate button"),
        phone("result", "The result on a phone.", "Phone result screen with the trophy, 83.5 out of 100 and the marks for each question", true),
        phone("certificate", "The certificate button in the Exam Center.", "Exam Center on a phone with Beginner Level 1 completed, 83.5 out of 100 and a Certificate button", true),
      ],
    },
    { type: "h2", id: "tips", text: "Tips for a good exam" },
    {
      type: "ul",
      items: [
        "**Start early in the 7 days.** A bad connection on the last night cannot be fixed.",
        "**Answer every multiple-choice question.** A wrong answer costs nothing.",
        "**Think before each move.** Every wrong move costs 0.5; a quick look for checks and captures saves marks.",
        "**Skip and come back.** Use the numbers in the top bar to return to a hard position later.",
        "**Revise the rules first.** A quick read of our [chess rules for beginners](/blog/chess-rules-for-beginners) covers stalemate, castling and promotion, which often come up.",
        "**Stay on the exam page** until you press Submit.",
      ],
    },
    {
      type: "p",
      text: "The exam is one part of how progress is tracked at Envision, alongside homework, tournaments and monthly reports from the coach. Our guide to [how online chess classes work](/blog/how-online-chess-classes-work) explains the rest of the journey from the first class to the next level.",
    },
    {
      type: "cta",
      heading: "Not an Envision student yet?",
      text: "Book a free demo class with one of our coaches. Every level ends with an exam like this one and a certificate for your child.",
      href: "/book-free-demo-class",
      label: "Book a free demo class",
    },
  ],
  faqs: [
    {
      q: "Can my child pause the exam and continue later?",
      a: "No. Once Start is pressed, the 90 minutes run without a pause. Before pressing Start, the exam can wait: it stays open for 7 days, until 11:59 pm India time on the last day.",
    },
    {
      q: "Is it better to take the exam on a phone or a computer?",
      a: "Both work, but a computer or laptop is easier because the board is bigger. On a phone, hold it upright, keep it charged and silence calls and notifications first.",
    },
    {
      q: "What happens if the internet stops during the exam?",
      a: "Answers are saved as soon as they are locked in or a position is solved. If the connection is lost for 3 minutes, the exam submits itself with the saved answers. Contact your coach if that happens.",
    },
    {
      q: "Does a wrong answer lose marks?",
      a: "Not in the multiple-choice questions: a wrong answer simply scores 0. In the positions, each wrong move takes away 0.5 marks and each hint takes away 2, but a position never goes below 0.",
    },
    {
      q: "Does every student get a certificate?",
      a: "Yes. Everyone who submits the exam gets a certificate for that level, whatever the score. It appears as a Download certificate button once it is ready.",
    },
  ],
};

export default post;
