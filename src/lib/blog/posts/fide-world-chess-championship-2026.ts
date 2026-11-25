import type { BlogPost } from "@/lib/blog/types";

/**
 * Introductory guide to the 2026 title match, written for students and their
 * parents the day before Game 1.
 *
 * Facts checked on 2026-11-23 against FIDE's match announcement, Chess.com's
 * match news and ChessBase India's match explainer (16 Nov 2026). FIDE's own
 * page still shows the first-announced 25 Nov - 15 Dec dates; the schedule was
 * moved in August, so the dates below follow ChessBase India and Chess.com.
 * The time control, tiebreak format and prize fund were reported only by
 * ChessBase India and are attributed to it in the copy.
 *
 * Once the match ends, update the intro, the "at a glance" callout and the
 * FAQs with the result and bump `updatedAt`.
 */
const post: BlogPost = {
  slug: "fide-world-chess-championship-2026",
  title: "FIDE World Chess Championship 2026: Gukesh vs Sindarov | Envision",
  h1: "FIDE World Chess Championship 2026: Gukesh vs Sindarov Explained",
  description:
    "A student's guide to the FIDE World Chess Championship 2026: Gukesh vs Sindarov in Geneva, the 14-game format, the schedule in IST and what to learn by watching.",
  keyword: "fide world chess championship 2026",
  keywords: [
    "fide world chess championship 2026",
    "world chess championship 2026",
    "gukesh vs sindarov",
    "world chess championship 2026 schedule",
    "gukesh world championship match",
  ],
  category: "tournaments-and-ratings",
  excerpt:
    "India's D. Gukesh defends his title against Uzbekistan's Javokhir Sindarov in Geneva from 24 November. Here is who they are, how the match works, when to watch in India and what to look for.",
  publishedAt: "2026-11-23",
  updatedAt: "2026-11-25",
  relatedCourses: ["beginner-chess-course", "intermediate-chess-course", "semi-pro-chess-course"],
  relatedPosts: [
    "world-chess-championship-2026-game-2",
    "world-chess-championship-2026-game-1",
    "world-chess-championship-2026-predictions",
    "why-chennai-is-the-chess-capital-of-india",
    "online-chess-tournaments-for-students",
    "how-to-get-fide-rating-india",
    "chess-opening-principles-for-beginners",
  ],
  priority: 95,
  body: [
    {
      type: "p",
      text: "The **FIDE World Chess Championship 2026** is the biggest event in chess this year, and it starts on **Tuesday, 24 November**. India's **D. Gukesh**, the reigning World Champion, defends his title against **Javokhir Sindarov** of Uzbekistan in Geneva, Switzerland. They will play up to **14 classical games**, and the first player to reach **7½ points** is World Champion. Every game starts at **7:30 pm Indian time**, which makes this a match Indian students can watch live after school.",
    },
    {
      type: "p",
      text: "This guide explains what the World Championship is, introduces both players, walks through the rules and the full schedule, and ends with simple ways to watch the games like a chess player rather than a spectator. You do not need to be a strong player to enjoy it. If you know [how the chess pieces move](/blog/how-chess-pieces-move), you can follow the match.",
    },
    {
      type: "p",
      text: "**Update, 25 November:** the score is 1–1 after two draws. Game 1 was a 38-move draw in the Berlin and Game 2 a 20-move draw in the London System. Read our [Game 1 review](/blog/world-chess-championship-2026-game-1) and [Game 2 review](/blog/world-chess-championship-2026-game-2) for the key moves and what students can learn from them.",
    },
    {
      type: "callout",
      title: "The match at a glance",
      text: "**Players:** D. Gukesh (India, champion) vs Javokhir Sindarov (Uzbekistan, challenger). **Where:** Fondation Martin Bodmer, Cologny, Geneva. **When:** Game 1 on 24 November, last classical game on 11 December, tiebreaks (if needed) on 12 December. **Format:** up to 14 classical games, first to 7½ points wins. **Start time:** 7:30 pm IST every game day.",
    },
    { type: "h2", id: "what-is-it", text: "What is the World Chess Championship?" },
    {
      type: "p",
      text: "The World Chess Championship decides who holds the most famous title in chess: **World Champion**. Unlike a normal tournament with many players, it is a **match** between just two people who play each other again and again. The first official World Championship match was played in 1886, when Wilhelm Steinitz beat Johannes Zukertort, and since then only a small group of players have held the title. Today the match is organised by **FIDE**, the International Chess Federation, the same body that runs the rating system our students work towards.",
    },
    {
      type: "p",
      text: "The champion does not have to qualify. The challenger does, and that is the hard part: they must first win the **Candidates Tournament**, an event for eight of the world's best players. The winner earns the right to face the champion. So a World Championship match is always the champion against the one player who beat everybody else to get there.",
    },
    { type: "h2", id: "gukesh", text: "Meet the champion: D. Gukesh" },
    {
      type: "p",
      text: "**Gukesh Dommaraju** is from Chennai, a city with a long chess history that our guide on [why Chennai is called the chess capital of India](/blog/why-chennai-is-the-chess-capital-of-india) explains. He became a grandmaster at the age of 12, one of the youngest in history, and kept climbing quickly through the world's top tournaments.",
    },
    {
      type: "p",
      text: "In 2024 he won the Candidates Tournament in Toronto and then played China's Ding Liren for the title in Singapore. The match came down to the very last classical game, Game 14, which Gukesh won to finish **7½–6½**. At 18 he became the youngest undisputed World Champion ever, and the second Indian World Champion after Viswanathan Anand. This match in Geneva is his first title defence.",
    },
    {
      type: "p",
      text: "Gukesh is known for his calm at the board, his fighting spirit and his willingness to play long, complicated games. Watch how he uses his clock and how rarely he looks rattled, even in difficult positions. Those are habits every student can copy.",
    },
    { type: "h2", id: "sindarov", text: "Meet the challenger: Javokhir Sindarov" },
    {
      type: "p",
      text: "**Javokhir Sindarov** is from Uzbekistan, a country that has produced a wave of young stars in recent years and won the Chess Olympiad in 2022. Like Gukesh, he became a grandmaster at 12, and he has been one of the fastest-rising players in the world ever since. Both players are 20 when the match begins, and Sindarov turns 21 during the match, on 8 December.",
    },
    {
      type: "p",
      text: "Sindarov earned his place with two outstanding results. He won the **FIDE World Cup in 2025**, held in Goa, and then won the **Candidates Tournament 2026** in Cyprus in April, scoring 10 out of 14 with six wins and **no losses**, finishing 1½ points ahead of Anish Giri. He arrives in Geneva as the higher-rated player: on the November 2026 FIDE list he is rated about 2782 and world number 4.",
    },
    {
      type: "p",
      text: "A rating gap does not decide a World Championship. Match play is different from tournament play: preparation, nerves and the ability to bounce back after a loss matter as much as rating. Our [World Chess Championship 2026 predictions](/blog/world-chess-championship-2026-predictions) weigh the odds, the form and the expert picks, with a calculator to make your own.",
    },
    { type: "h2", id: "format", text: "How the match works" },
    {
      type: "table",
      caption: "FIDE World Chess Championship 2026: the rules",
      head: ["Rule", "What it means"],
      rows: [
        ["Games", "Up to 14 classical games. Players swap colours each game."],
        ["Scoring", "1 point for a win, ½ for a draw, 0 for a loss."],
        ["Winning the match", "The first player to 7½ points wins. If one player gets there early, the remaining games are not played."],
        ["Time control", "120 minutes for the first 40 moves, then 30 more minutes, with 30 seconds added per move from move 41 (as reported by ChessBase India)."],
        ["Rest days", "After every three games: 27 November, 1 December, 5 December and 9 December."],
        ["If it is 7–7", "Tiebreaks on 12 December: rapid games first, then faster games, then blitz, until someone wins."],
      ],
    },
    {
      type: "p",
      text: "A classical game with this time control can last five or six hours. Players get two hours for their first 40 moves, so you will often see them think for 20 or 30 minutes on a single move. That is not slow chess, it is deep chess: they are calculating many moves ahead and checking every possible reply.",
    },
    {
      type: "p",
      text: "According to ChessBase India, the tiebreaks start with four rapid games at 15 minutes plus 10 seconds a move, then two games at 10 minutes plus 5 seconds, then two blitz games at 3 minutes plus 2 seconds, and finally single blitz games until one player wins. The prize fund is reported at US $2.5 million.",
    },
    { type: "h2", id: "schedule", text: "Schedule in Indian time" },
    {
      type: "p",
      text: "Every game begins at **3:00 pm in Geneva**, which is **7:30 pm IST**. A long game can run past midnight in India, so younger students may want to watch the opening live and catch up on the rest the next morning.",
    },
    {
      type: "table",
      caption: "Game dates (all games 7:30 pm IST)",
      head: ["Games 1-7", "Date", "Games 8-14", "Played on"],
      rows: [
        ["Game 1", "Tue 24 Nov", "Game 8", "Thu 3 Dec"],
        ["Game 2", "Wed 25 Nov", "Game 9", "Fri 4 Dec"],
        ["Game 3", "Thu 26 Nov", "Game 10", "Sun 6 Dec"],
        ["Game 4", "Sat 28 Nov", "Game 11", "Mon 7 Dec"],
        ["Game 5", "Sun 29 Nov", "Game 12", "Tue 8 Dec"],
        ["Game 6", "Mon 30 Nov", "Game 13", "Thu 10 Dec"],
        ["Game 7", "Wed 2 Dec", "Game 14", "Fri 11 Dec"],
      ],
    },
    {
      type: "p",
      text: "If the score is level after Game 14, the tiebreaks and the closing ceremony take place on **Saturday, 12 December**. The match can also finish earlier if one player reaches 7½ points before Game 14.",
    },
    { type: "h2", id: "watch", text: "Where to watch the games" },
    {
      type: "ul",
      items: [
        "**Live boards and commentary:** the games are broadcast move by move as they are played, and the major chess sites show live boards with an engine bar and expert commentary.",
        "**Commentary for Indian viewers:** ChessBase India streams every game on its YouTube channel, in partnership with Chess.com India.",
        "**Catch-up the next morning:** every game is published in full afterwards, so you can replay it move by move at your own pace.",
      ],
    },
    {
      type: "callout",
      title: "A tip for parents",
      text: "Watching even 20 minutes of a game together is a lovely way to talk chess at home. Ask your child to predict the next move before it is played, and let them explain why. It is the same skill coaches train in class, and it turns screen time into thinking time.",
    },
    { type: "h2", id: "learn", text: "What students can learn by watching" },
    {
      type: "p",
      text: "The best players in the world are also the best teachers, if you know where to look. Here are five things to watch for in every game:",
    },
    {
      type: "ol",
      items: [
        "**Guess the move.** Before each move appears, decide what you would play. Count how many you guess right in the first 15 moves. It is a classic training method, and a fun competition with friends or family.",
        "**Watch the opening.** Both players follow the same ideas we teach beginners: control the centre, develop the knights and bishops, and castle early. Our guide to [chess opening principles](/blog/chess-opening-principles-for-beginners) explains them, and you will spot each one in the first ten moves.",
        "**Look at the clocks.** Notice when a player slows down. Long thinks usually come at the critical moment, when the position is about to change. Learning to recognise those moments is half of good time management.",
        "**Look for tactics, even the ones that are not played.** Commentators often show forks, pins and hidden checkmates that the players avoided. Our guide to [forks, pins and skewers](/blog/chess-tactics-forks-pins-skewers) will help you see them.",
        "**Watch the handshake.** Win or lose, both players shake hands and sit down to discuss the game at the press conference. That respect is part of chess too.",
      ],
    },
    { type: "h2", id: "your-turn", text: "From watching to playing: your next step" },
    {
      type: "p",
      text: "Gukesh and Sindarov both started as children playing small local events. Every great player's story starts with a first tournament. Envision students can play regular [online chess tournaments for students](/blog/online-chess-tournaments-for-students) inside the portal, and those who are ready for rated play can read our guide to [getting a FIDE rating in India](/blog/how-to-get-fide-rating-india), the same rating list that ranks the two players in Geneva.",
    },
    {
      type: "p",
      text: "During the match, bring your favourite moments to class. Coaches love it when a student asks about a move they saw in a World Championship game, and it often becomes the example for the next lesson. If your child is not with us yet, our [online chess coaching courses](/online-chess-coaching-courses) take players from their first moves to tournament level.",
    },
    {
      type: "cta",
      heading: "Inspired by the World Championship?",
      text: "Book a free demo class and let one of our coaches find the right level and batch for your child.",
      href: "/book-free-demo-class",
      label: "Book a free demo class",
    },
  ],
  faqs: [
    {
      q: "When does the FIDE World Chess Championship 2026 start?",
      a: "Game 1 is on Tuesday, 24 November 2026, at 7:30 pm IST (3:00 pm in Geneva). The last classical game is on 11 December, and tiebreaks, if needed, are on 12 December.",
    },
    {
      q: "Who is playing in the World Chess Championship 2026?",
      a: "The reigning World Champion D. Gukesh of India plays the challenger Javokhir Sindarov of Uzbekistan, who qualified by winning the Candidates Tournament 2026 in Cyprus.",
    },
    {
      q: "Where is the World Chess Championship 2026 being played?",
      a: "At the Fondation Martin Bodmer in Cologny, near Geneva, Switzerland. FIDE chose a neutral venue after several countries, including India, wanted to host the match.",
    },
    {
      q: "How many games are in the match?",
      a: "Up to 14 classical games. The first player to score 7½ points wins. If the score is 7-7 after 14 games, the title is decided by faster tiebreak games on 12 December.",
    },
    {
      q: "Is Gukesh the youngest World Chess Champion?",
      a: "Yes. Gukesh won the title at 18 by beating Ding Liren 7½-6½ in Singapore in December 2024, making him the youngest undisputed World Champion in history.",
    },
  ],
};

export default post;
