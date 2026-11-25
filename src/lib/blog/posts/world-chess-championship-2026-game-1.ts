import type { BlogPost } from "@/lib/blog/types";

/**
 * Round 1 review of the 2026 title match, written the morning after Game 1.
 *
 * Facts checked on 2026-11-25 against FIDE's official Game 1 report (Yannick
 * Pelletier, 24 Nov), Chess.com's report with GM Dejan Bojkov's annotations
 * (Colin McGourty) and ChessBase's report (Carlos Alberto Colodro). None of
 * them printed the full score in text, so the post quotes only the moves the
 * reports name. The 18...h6 diagram is read off FIDE's own diagram in its
 * report; the opening diagram is the standard Berlin Endgame position the
 * reports describe (6.Bxc6 ... 8.Qxd8+).
 *
 * Photos are FIDE's press photos from its Game 1 report (credited there to
 * Y.E. Nisenbaum and Michal Walusza), resized to WebP in
 * public/blog/world-chess-championship-2026-game-1/.
 *
 * Player names link to their official FIDE rating profiles.
 */
const GUKESH = "[D. Gukesh](https://ratings.fide.com/profile/46616543)";
const SINDAROV = "[Javokhir Sindarov](https://ratings.fide.com/profile/14205483)";
const IMG = "/blog/world-chess-championship-2026-game-1";

const post: BlogPost = {
  slug: "world-chess-championship-2026-game-1",
  title: "World Chess Championship 2026 Game 1 Review | Envision",
  h1: "World Chess Championship 2026 Game 1: Gukesh Holds Sindarov in the Berlin",
  description:
    "Round 1 review of the World Chess Championship 2026: how Gukesh held Sindarov to a draw in the Berlin, the key moves, the clock battle and the draw-claim penalty.",
  keyword: "world chess championship 2026 game 1",
  keywords: [
    "world chess championship 2026 game 1",
    "gukesh sindarov game 1",
    "world chess championship 2026 round 1",
    "gukesh vs sindarov game 1 analysis",
    "berlin endgame",
  ],
  category: "tournaments-and-ratings",
  excerpt:
    "Sindarov pressed with White in the Berlin Endgame, Gukesh fell behind on the clock but found the right defence, and the opening game of the match ended in a 38-move draw. Here is what happened and what students can learn from it.",
  publishedAt: "2026-11-25",
  updatedAt: "2026-11-25",
  relatedCourses: ["intermediate-chess-course", "semi-pro-chess-course"],
  relatedPosts: [
    "world-chess-championship-2026-game-2",
    "fide-world-chess-championship-2026",
    "world-chess-championship-2026-predictions",
    "chess-rules-for-beginners",
    "chess-opening-principles-for-beginners",
  ],
  priority: 96,
  body: [
    {
      type: "p",
      text: `The World Chess Championship 2026 is under way, and Game 1 ended in a **draw**. Challenger ${SINDAROV} had White and kept up the pressure for most of the afternoon in Geneva, but reigning champion ${GUKESH} defended accurately and the game finished by **threefold repetition after 38 moves**. The match score is **½–½**, with 13 classical games left and 7½ points needed to win.`,
    },
    {
      type: "p",
      text: "It was not a quiet draw. Sindarov chose an ambitious plan, Gukesh fell well behind on the clock, and the last act included a rare moment for a World Championship: a **draw claim made the wrong way**, which cost the claimer a two-minute penalty. This review walks through the game in plain language, with the key moves named by the official reports, and ends with three lessons students can take straight into their own games. New to the match? Start with our [guide to the FIDE World Chess Championship 2026](/blog/fide-world-chess-championship-2026).",
    },
    {
      type: "callout",
      title: "Game 1 at a glance",
      text: "**White:** Javokhir Sindarov (Uzbekistan). **Black:** D. Gukesh (India). **Date:** Tuesday, 24 November 2026, Fondation Martin Bodmer, Cologny, Geneva. **Opening:** Ruy Lopez, Berlin Defence (Berlin Endgame). **Result:** draw by threefold repetition, 38 moves. **Match score:** ½–½. **Next:** Game 2 on Wednesday, 25 November, 7:30 pm IST, with Gukesh playing White.",
    },
    {
      type: "image",
      src: `${IMG}/game-1-hall.webp`,
      width: 1200,
      height: 780,
      caption: "Sindarov (left) and Gukesh at the board in Game 1, under the flags of Uzbekistan, India, FIDE and Switzerland. Photo: FIDE / Michal Walusza and Y.E. Nisenbaum.",
      alt: "The playing stage in Geneva. Javokhir Sindarov sits on the left behind his name plate, D. Gukesh sits on the right with his hand on his forehead, thinking. Behind them is a large Salesforce FIDE World Championship Geneva 2026 backdrop, with national flags on both sides.",
    },
    { type: "h2", id: "opening-ceremony", text: "The first move: Anand plays 1...e5 for Gukesh" },
    {
      type: "p",
      text: "Before the clocks started, the ceremonial first moves were made by two famous names. According to FIDE's report, FIDE President Timur Turlov played **1.e4** for Sindarov, and **Viswanathan Anand**, five-time World Champion and FIDE Deputy President, answered **1...e5** for Gukesh. For Indian fans it was a lovely moment: India's first World Champion making the first move for India's second.",
    },
    {
      type: "image",
      src: `${IMG}/game-1-first-move.webp`,
      width: 1200,
      height: 798,
      caption: "Viswanathan Anand makes the ceremonial first move for Gukesh before Game 1. Photo: FIDE / Michal Walusza and Y.E. Nisenbaum.",
      alt: "Viswanathan Anand, wearing an accreditation badge, leans over the board and reaches for Black's pieces while Gukesh sits on the right with his arms crossed and Sindarov sits on the left. Two officials stand behind the table, one holding a microphone.",
    },
    { type: "h2", id: "opening", text: "The opening: the Berlin Endgame" },
    {
      type: "p",
      text: "The game began **1.e4 e5 2.Nf3 Nc6 3.Bb5 Nf6**, the **Berlin Defence**, one of the most solid answers to the Ruy Lopez. Sindarov castled with **4.0-0** and then, after **6.Bxc6**, exchanged queens on move 8 to reach the famous **Berlin Endgame**. FIDE's report notes that this was a first for Sindarov, while Gukesh had played this queenless position before, but only with the white pieces.",
    },
    {
      type: "diagram",
      fen: "r1bk1b1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNB2RK1 w - - 0 9",
      highlight: ["d8", "c6", "e5"],
      caption: "The Berlin Endgame after 8.Qxd8+ Kxd8: no queens, Black's king has lost the right to castle, but Black owns the two bishops.",
      alt: "Berlin Endgame position. White: king g1, rooks a1 and f1, knights b1 and f3, bishop c1, pawns a2, b2, c2, e5, f2, g2, h2. Black: king d8, rooks a8 and h8, bishops c8 and f8, knight f5, pawns a7, b7, c7, c6, f7, g7, h7. The black king on d8 and the doubled c-pawns are highlighted, with White's e5 pawn.",
    },
    {
      type: "p",
      text: "Why would a World Championship game start with the queens leaving the board so early? Because this position is a battle of **small advantages**. White has a healthy four-against-three pawn majority on the kingside and a strong pawn on e5. Black has **doubled c-pawns**, a king stuck in the centre, but also the **two bishops**, which become powerful in an open position. The Berlin became famous when Vladimir Kramnik used it to take the title from Garry Kasparov in 2000, and it has been a World Championship regular ever since.",
    },
    {
      type: "p",
      text: "For our students, this is a good reminder that the [chess opening principles](/blog/chess-opening-principles-for-beginners) still apply at the very top: both players fought for the centre and developed their pieces quickly. What changes at this level is the depth of preparation. Sindarov's **12.Be3** was a deviation from the more common 12.b3, and according to ChessBase, **13.Ne4** was a new move, a **novelty**, that took Gukesh out of his preparation.",
    },
    { type: "h2", id: "middlegame", text: "Gukesh thinks, Sindarov presses" },
    {
      type: "p",
      text: "This is where the clock battle began. Gukesh spent more than 15 minutes on his reply to 13.Ne4. After the game he said he had looked at the sharp **13...Bf5 14.Ng3 Bxc2** but felt it was not something to calculate over the board, and chose the calmer **13...Bd7**. Sindarov answered with the ambitious **14.c4!?**, although he later admitted he had first wanted to play 14.Rd2.",
    },
    {
      type: "p",
      text: "The most important think of the game came after **17.b3**. Gukesh used **36 minutes** on one move. The reason, as Chess.com's annotator GM Dejan Bojkov explained, was that the natural-looking **17...Ra5?** would have been a mistake because of **18.Bg5!**, a tactic that hits Black's weak points. Gukesh found the safer **17...Bb4**, and after **18.Re2** he played **18...h6**, taking the g5 square away from White's pieces for good. Sindarov said afterwards he regretted not trying 18.Rb2 instead.",
    },
    {
      type: "diagram",
      fen: "r3k2r/1pp2pp1/2p1b1np/4P3/pbP1N3/1P2BN1P/P3RPP1/3R2K1 w - - 0 19",
      highlight: ["a4", "b4", "h6"],
      arrows: ["e4g3"],
      caption: "After 18...h6. Gukesh's pawn on a4, bishop on b4 and pawn on h6 have stopped White's easy play. Sindarov now starts his kingside plan with 19.Ng3.",
      alt: "Position after 18...h6 with White to move. White: king g1, rooks d1 and e2, bishop e3, knights e4 and f3, pawns a2, b3, c4, e5, f2, g2, h3. Black: king e8, rooks a8 and h8, bishops b4 and e6, knight g6, pawns a4, b7, c7, c6, f7, g7, h6. The a4 pawn, b4 bishop and h6 pawn are highlighted, with an arrow from e4 to g3.",
    },
    {
      type: "p",
      text: "This diagram is a good one to study. Look at how Black's moves work together: the **a-pawn** marched to a4 to poke at White's queenside, the **bishop on b4** became active outside the pawn chain, and **h6** made sure no white piece could use g5. FIDE's report singles out this plan as the moment Gukesh stopped White's initiative in the centre.",
    },
    { type: "h2", id: "kingside-attack", text: "Sindarov's kingside push and the key defence" },
    {
      type: "p",
      text: "With nothing more to gain in the centre, Sindarov switched plans. His knight went **19.Ng3** and then to **h5**, and Black replied with **19...c5**, fixing the queenside pawns. White followed up with **21.g4** (not the engines' first choice, ChessBase noted) and later **f4**, opening lines towards Black's king. By this point Gukesh was in serious time trouble: according to ChessBase he had about **16 minutes for his next 20 moves**, while Sindarov was roughly half an hour ahead.",
    },
    {
      type: "p",
      text: "The critical moment came on move 27. Sindarov played the striking **27.Nxf5+**, a move that looks very dangerous for Black. But Gukesh had a cool answer: **27...Kf6!**, walking his king forward to defend. Sindarov admitted at the press conference that he had underestimated this move. In an endgame, the king is a fighting piece, and here it was the king itself that solved Black's problems.",
    },
    {
      type: "callout",
      title: "The lesson of 27...Kf6!",
      text: "In the middlegame, keep your king safe. In the endgame, use it. Once the queens are off, a king in the centre is often a strength, not a weakness. Gukesh's king stood in the middle of the board for the whole game and still played the most important defensive move.",
    },
    { type: "h2", id: "draw-claim", text: "The draw and the two-minute penalty" },
    {
      type: "p",
      text: "With no way through, Sindarov regrouped and the pieces began to repeat their moves. Then came the strangest moment of the day. According to Chess.com and ChessBase, Sindarov **made his move first and only then claimed a draw** by repetition. That is not how the rule works, so the arbiters rejected the claim and penalised him two minutes, with extra time added to Gukesh's clock. It made no difference to the result: a couple of moves later the position repeated again and the draw was confirmed on move 38.",
    },
    {
      type: "p",
      text: "Every tournament player should know this rule. Under the FIDE Laws of Chess, if you want to claim a draw because a position will appear for the third time, you **write your move on your scoresheet without playing it**, then stop the clock and tell the arbiter. If the position has just appeared for the third time, you claim before you make your next move. If you play the move on the board first, you lose the right to claim at that moment. An incorrect claim is not free either: the arbiter adds **two minutes** to your opponent's clock. Our guide to the [chess rules for beginners](/blog/chess-rules-for-beginners) covers all the ways a game can be drawn.",
    },
    {
      type: "image",
      src: `${IMG}/game-1-handshake.webp`,
      width: 1200,
      height: 785,
      caption: "Sindarov and Gukesh shake hands at the end of Game 1, watched by the arbiter. Photo: FIDE / Michal Walusza and Y.E. Nisenbaum.",
      alt: "Seen from above, Sindarov on the left reaches across the board to shake hands with Gukesh, who rests his head on his other hand. Captured pieces stand beside the board and an arbiter in a dark suit watches from the left.",
    },
    { type: "h2", id: "what-they-said", text: "What the players and experts said" },
    {
      type: "ul",
      items: [
        "**Gukesh** said he felt safe and in control for most of the game, even when the position looked dangerous.",
        "**Sindarov** said he chose a solid approach to settle into the match, praised Gukesh's defence and admitted he had missed the strength of 27...Kf6.",
        "**R. Praggnanandhaa**, quoted by both Chess.com and ChessBase, called it a high-quality game.",
        "**Clock watch:** at the end, ChessBase reports, Sindarov still had about 15 minutes left while Gukesh had around six and a half. Black's long thinks paid off on the board but cost him on the clock.",
      ],
    },
    { type: "h2", id: "analysis", text: "Our analysis: who came out ahead?" },
    {
      type: "p",
      text: "On the scoreboard, nobody. But Game 1 told us a few things about how this match may go. **Sindarov** showed he is ready to press with White even in the Berlin, an opening built for Black to draw. His novelty on move 13 and his kingside plan with Ng3, Nh5, g4 and f4 gave Gukesh real problems to solve. **Gukesh** showed the calm defence that won him the title in 2024, but also an old habit: he spent a lot of time early and finished with much less on the clock than his opponent.",
    },
    {
      type: "p",
      text: "Before the match, the bookmakers made Sindarov a clear favourite, while our own view was that it is **anybody's game**. Our [World Chess Championship 2026 predictions](/blog/world-chess-championship-2026-predictions) explain both sides and include a calculator you can play with. After one game, nothing has changed that view. A draw with Black against the higher-rated challenger is a good result for Gukesh, and now he has White in Game 2.",
    },
    { type: "h2", id: "lessons", text: "Three lessons for students from Game 1" },
    {
      type: "ol",
      items: [
        "**Look for your opponent's best reply before you move.** Gukesh's 36-minute think after 17.b3 was about one tactic, 18.Bg5!, that would have punished the natural 17...Ra5. Checking your opponent's forcing moves (checks, captures and threats) is the habit that stops you walking into [tactics like forks and pins](/blog/chess-tactics-forks-pins-skewers).",
        "**Use your king in the endgame.** With the queens gone, 27...Kf6! was the move that saved the game. When you reach an endgame in class, ask yourself where your king can do the most work.",
        "**Know the rules, and use them correctly.** A draw by repetition must be claimed before you make the move on the board. Even a World Championship challenger can get this wrong under pressure, so practise it in your own games.",
      ],
    },
    {
      type: "p",
      text: "Envision students can try these ideas in our regular [online chess tournaments for students](/blog/online-chess-tournaments-for-students), and bring any question about Game 1 to their next class. Coaches love working through a World Championship position with a student who has watched it live.",
    },
    { type: "h2", id: "game-2", text: "What's next: Game 2" },
    {
      type: "p",
      text: "Game 2 is on **Wednesday, 25 November**, starting at **7:30 pm IST** (3:00 pm in Geneva), and this time **Gukesh has the white pieces**. Games 2 and 3 follow on consecutive days before the first rest day on 27 November. We will review the match round by round: read our [Game 2 review](/blog/world-chess-championship-2026-game-2) to see how Gukesh's London System went.",
    },
    {
      type: "cta",
      heading: "Want to understand games like this one?",
      text: "Book a free demo class and our coaches will find the right level and batch for your child, from first moves to tournament play.",
      href: "/book-free-demo-class",
      label: "Book a free demo class",
    },
  ],
  faqs: [
    {
      q: "Who won Game 1 of the World Chess Championship 2026?",
      a: "Nobody. Game 1 between Javokhir Sindarov (White) and D. Gukesh (Black) on 24 November 2026 ended in a draw by threefold repetition after 38 moves, so the match score is ½–½.",
    },
    {
      q: "What opening was played in Game 1?",
      a: "The Ruy Lopez, Berlin Defence. Sindarov exchanged on c6 and traded queens on move 8, reaching the Berlin Endgame, and introduced a new move, 13.Ne4.",
    },
    {
      q: "Why was Sindarov given a two-minute penalty in Game 1?",
      a: "He claimed a draw by repetition after making his move on the board. Under FIDE's rules the claim must be made before the move is played, so the claim was rejected and two minutes were added to Gukesh's clock. The game was drawn a couple of moves later anyway.",
    },
    {
      q: "When is Game 2 of the World Chess Championship 2026?",
      a: "Game 2 is on Wednesday, 25 November 2026, at 7:30 pm IST (3:00 pm in Geneva). Gukesh plays White.",
    },
    {
      q: "What is the score in the Gukesh vs Sindarov match?",
      a: "After Game 1 the score is ½–½. The match is played over up to 14 classical games, and the first player to reach 7½ points becomes World Champion.",
    },
  ],
};

export default post;
