import type { BlogPost } from "@/lib/blog/types";

/**
 * Round 2 review of the 2026 title match, written the evening of Game 2.
 *
 * Facts checked on 2026-11-25 against Chess.com's flash report (Colin
 * McGourty), ESPN (Aaditya Narayan), Gazeta.uz and the ANI report syndicated by
 * The Tribune. FIDE had not yet published its own Game 2 report, and no source
 * printed the full score in text, so the post quotes only moves the reports
 * name (7.Ne5, 7...Qb6, 10.a4, 11...Qd8, 15...f5, 16.f3). The diagram is a
 * typical London position, labelled as such, not the game position.
 *
 * Photos are FIDE's Game 2 press photos (credited "FIDE / Michal Walusza"), as
 * published in Gazeta.uz's report, resized to WebP in
 * public/blog/world-chess-championship-2026-game-2/. Swap for fide.com copies
 * once FIDE's Game 2 report is up, and add its analysis if it changes anything.
 *
 * Player names link to their official FIDE rating profiles.
 */
const GUKESH = "[D. Gukesh](https://ratings.fide.com/profile/46616543)";
const SINDAROV = "[Javokhir Sindarov](https://ratings.fide.com/profile/14205483)";
const IMG = "/blog/world-chess-championship-2026-game-2";

const post: BlogPost = {
  slug: "world-chess-championship-2026-game-2",
  title: "World Chess Championship 2026 Game 2 Review | Envision",
  h1: "World Chess Championship 2026 Game 2: A 20-Move London Draw",
  description:
    "Round 2 review of the World Chess Championship 2026: Gukesh's London System, Sindarov's 7...Qb6 answer, the 30-minute think on 16.f3 and the early draw.",
  keyword: "world chess championship 2026 game 2",
  keywords: [
    "world chess championship 2026 game 2",
    "gukesh sindarov game 2",
    "world chess championship 2026 round 2",
    "gukesh london system",
    "gukesh vs sindarov game 2 analysis",
  ],
  category: "tournaments-and-ratings",
  excerpt:
    "Gukesh surprised Sindarov with the London System, Sindarov was ready with 7...Qb6, and after a long think from the champion the game ended in a 20-move repetition. The match is level at 1–1.",
  publishedAt: "2026-11-25",
  updatedAt: "2026-11-25",
  relatedCourses: ["beginner-chess-course", "intermediate-chess-course"],
  relatedPosts: [
    "world-chess-championship-2026-game-1",
    "fide-world-chess-championship-2026",
    "world-chess-championship-2026-predictions",
    "chess-opening-principles-for-beginners",
  ],
  priority: 97,
  body: [
    {
      type: "p",
      text: `Game 2 of the World Chess Championship 2026 was over in **under two hours**. Champion ${GUKESH} had the white pieces for the first time in the match and chose the **London System**, a quiet, solid opening that many club players use. Challenger ${SINDAROV} was well prepared, the position stayed balanced, and the players **repeated moves on move 20**. The match is level at **1–1** after two draws.`,
    },
    {
      type: "p",
      text: "A short draw can look like nothing happened, but Game 2 was full of match strategy. This review explains why Gukesh picked the London, what Sindarov's early queen move was about, why one pawn move cost the champion half an hour, and why both players were happy to shake hands. If you missed the first game, start with our [Game 1 review](/blog/world-chess-championship-2026-game-1), and for the format and schedule see our [guide to the FIDE World Chess Championship 2026](/blog/fide-world-chess-championship-2026).",
    },
    {
      type: "callout",
      title: "Game 2 at a glance",
      text: "**White:** D. Gukesh (India). **Black:** Javokhir Sindarov (Uzbekistan). **Date:** Wednesday, 25 November 2026, Geneva. **Opening:** London System. **Result:** draw by threefold repetition, 20 moves. **Match score:** 1–1. **Next:** Game 3 on Thursday, 26 November, 7:30 pm IST, with Sindarov playing White. 27 November is the first rest day.",
    },
    {
      type: "image",
      src: `${IMG}/game-2-board.webp`,
      width: 1200,
      height: 800,
      caption: "Gukesh (left) and Sindarov deep in thought during Game 2, with most of the pieces still on the board. Photo: FIDE / Michal Walusza.",
      alt: "Gukesh, in a maroon jacket, rests his head on his hand on the left. Sindarov, in a grey jacket, leans forward over the table with his head down on his arm. Between them are the Indian and Uzbek flags and a board with nearly all the pieces still in play, under Salesforce, FIDE and Freedom logos.",
    },
    { type: "h2", id: "london", text: "The surprise: Gukesh plays the London System" },
    {
      type: "p",
      text: "The **London System** starts with 1.d4 and an early **Bf4**, and White builds the same solid set-up against almost anything: pawns on d4, e3 and c3, knights on f3 and d2, bishop to d3, castle short. It is popular from club level to the world's top players because it is easy to learn and hard to break. It is also a little unusual in a World Championship, where players normally prepare the sharpest lines they can find.",
    },
    {
      type: "p",
      text: "So why did Gukesh play it? GM Peter Svidler, commentating for FIDE, saw it as an **exploratory** choice by Gukesh's team: a safe way to find out what Sindarov had prepared for White's first-move options, while giving little away. It was not completely new to Gukesh either. As ANI pointed out, Ding Liren played the London against him twice in their 2024 title match, in Games 6 and 10, and both games were drawn.",
    },
    {
      type: "p",
      text: "Sindarov was not surprised for long. Reports say he played his opening moves quickly, a sure sign he had looked at the London before the match. After the game he admitted it was the opening he expected least in his first game with Black.",
    },
    { type: "h2", id: "qb6", text: "Sindarov's answer: 7...Qb6" },
    {
      type: "p",
      text: "According to Gazeta.uz, Gukesh placed a knight on **e5** on move 7 instead of trading pieces straight away, and Sindarov replied with **7...Qb6**. This queen move is one of the most important ideas to know against the London, and students meet it early.",
    },
    {
      type: "diagram",
      fen: "r1b1kb1r/pp2pppp/1qn2n2/2pp4/3P1B2/2P1P3/PP1N1PPP/R2QKBNR w KQkq - 0 6",
      highlight: ["b2", "f4"],
      arrows: ["b6b2"],
      caption: "A typical London position (not the exact game): once White's bishop has gone to f4, ...Qb6 attacks the b2 pawn, which the bishop used to protect.",
      alt: "A typical London System position after 1.d4 Nf6 2.Bf4 d5 3.e3 c5 4.c3 Nc6 5.Nd2 Qb6, White to move. White: king e1, queen d1, rooks a1 and h1, bishops f1 and f4, knights d2 and g1, pawns a2, b2, c3, d4, e3, f2, g2, h2. Black: king e8, queen b6, rooks a8 and h8, bishops c8 and f8, knights c6 and f6, pawns a7, b7, c5, d5, e7, f7, g7, h7. An arrow runs from b6 to b2, and the b2 pawn and the f4 bishop are highlighted.",
    },
    {
      type: "p",
      text: "Here is the idea. In the London, White's dark-squared bishop leaves c1 very early to go to f4. That bishop was the piece guarding the **b2 pawn**. Black's queen on b6, often helped by a pawn on c5, attacks b2 and puts pressure on d4 at the same time. White has to spend a move defending, usually with Qb3 or Qc1 or a careful pawn move, and that lost time is exactly what Black wants. In Game 2, Gazeta noted, the queen move took the edge off White's attacking plans. A few moves later, on move 11, Sindarov even brought the queen back to d8, having made White adjust.",
    },
    {
      type: "callout",
      title: "Try it in your games",
      text: "If your opponent plays an early Bf4 against you, look at b2. Is it still protected? A queen move to b6 can win the pawn or force White to make an awkward defensive move. And if you play the London yourself, remember to keep an eye on b2 before you develop everything else. Our guide to [chess opening principles](/blog/chess-opening-principles-for-beginners) explains why every move in the opening should count.",
    },
    { type: "h2", id: "f5-f3", text: "The key moment: 15...f5 and the 30-minute think" },
    {
      type: "image",
      src: `${IMG}/game-2-gukesh-thinks.webp`,
      width: 1200,
      height: 800,
      caption: "Gukesh considers his move with the Indian flag beside the clock. He spent about half an hour on 16.f3. Photo: FIDE / Michal Walusza.",
      alt: "Close-up of Gukesh in a maroon jacket, chin on his hand, staring at the board. White's pieces are in the foreground, the Indian flag stands next to the digital clock, and the FIDE logo is in the background.",
    },
    {
      type: "p",
      text: "Gukesh tried to make something of the queenside with **10.a4**, but the game only came alive on move 15. Sindarov played **15...f5**, a bold pawn push that grabbed space on the kingside. One idea behind it was to bring a knight from f6 to the strong **e4** square, where it would be hard to remove.",
    },
    {
      type: "p",
      text: "Gukesh thought for about **30 minutes** before answering with **16.f3**. The pawn on f3 covers e4, so Black's knight can no longer land there. It is a typical positional decision: instead of allowing a strong piece onto an outpost, you take the square away before the piece arrives. The commentators noted that during that long think Gukesh did not find a concrete way to an advantage, and by then he was about **35 minutes behind** on the clock, according to ESPN.",
    },
    {
      type: "p",
      text: "This is a lesson every student can use. An **outpost** is a square in or near the opponent's half where your piece cannot be chased away by a pawn. Knights love outposts. When you see your opponent's knight heading for one, ask: can I control that square with a pawn first? Gukesh's 16.f3 is a clear example. Our guide to [chess tactics like forks, pins and skewers](/blog/chess-tactics-forks-pins-skewers) shows why a knight on a strong square is so dangerous.",
    },
    { type: "h2", id: "repetition", text: "Why the game ended on move 20" },
    {
      type: "image",
      src: `${IMG}/game-2-sindarov-thinks.webp`,
      width: 1200,
      height: 800,
      caption: "Sindarov, head in hands, during Game 2. He equalised comfortably with the black pieces. Photo: FIDE / Michal Walusza.",
      alt: "Close-up of Sindarov in a grey jacket holding his head with both hands as he studies the board. Blurred chess pieces are in the foreground and a light blue FIDE flag is behind him.",
    },
    {
      type: "p",
      text: "After 16.f3, neither side found a way to make progress without taking a big risk. A bishop and a knight began moving back and forth between the same squares, and when the same position appeared for the third time, the game was drawn by **threefold repetition** on move 20, with most of the pieces still on the board. According to ESPN and Gazeta, Sindarov called the arbiter to claim the draw. This time, unlike the wrong claim in Game 1, it was done correctly.",
    },
    {
      type: "p",
      text: "Why would a World Champion agree to a draw so quickly with the white pieces? In a 14-game match, **every game is a small part of a long plan**. Gukesh was already behind on the clock, the position offered him nothing clear, and a risky try could have backfired. Taking a safe draw keeps the score level and saves energy for the games where he feels his preparation is stronger. ESPN noted the contrast with 2024, when Gukesh was much keener to play on in level positions.",
    },
    { type: "h2", id: "what-they-said", text: "What the players and experts said" },
    {
      type: "ul",
      items: [
        "**Sindarov** said the London was the opening he least expected, and that he was pleased with Black: \"I'm happy that I pretty equalised the game,\" he told the press conference (via Gazeta.uz). He added that he sees nothing wrong with the London and would even recommend it to beginners who start with 1.d4.",
        "**Gukesh** said he did not get much out of the opening and called it a fine game. He also defended the London, saying he does not understand why it gets so much criticism.",
        "**Peter Svidler**, on the FIDE broadcast, described the London as a scouting choice: it gave Gukesh little on the board, but his team learned something about Sindarov's preparation.",
      ],
    },
    { type: "h2", id: "analysis", text: "Our analysis: where the match stands after two games" },
    {
      type: "p",
      text: "Two games, two draws, and two clear patterns. **Sindarov's preparation looks excellent.** He pressed with White in Game 1 and was never in danger with Black in Game 2, playing his opening moves quickly both times. **Gukesh is spending more time on the clock.** In both games he fell well behind early, by about half an hour or more. So far his defence has held, but time trouble is where mistakes happen, and it is the thing to watch in the coming games.",
    },
    {
      type: "p",
      text: "On the other hand, Gukesh has now held the higher-rated challenger with Black and kept his own White game completely safe. In a match, a level score after the first White game is not a bad start. Our view before the match was that it is **anybody's game**, and our [World Chess Championship 2026 predictions](/blog/world-chess-championship-2026-predictions) still stand. Game 3, with Sindarov playing White again, is the last one before the first rest day, so expect both players to give everything.",
    },
    { type: "h2", id: "lessons", text: "Three lessons for students from Game 2" },
    {
      type: "ol",
      items: [
        "**A simple opening can be a strong opening.** The London follows the same plan against almost everything, which is why many coaches teach it to players starting with 1.d4. Both World Championship players defended it after the game.",
        "**Watch for ...Qb6 against an early Bf4.** When a bishop leaves its home square, check which pawns it was protecting. Here it was b2.",
        "**Take squares away before pieces reach them.** Gukesh's 16.f3 stopped a knight from landing on e4. Controlling an outpost with a pawn is often better than trying to chase the piece away later.",
      ],
    },
    {
      type: "p",
      text: "Envision students can try the London, or the ...Qb6 answer to it, in our regular [online chess tournaments for students](/blog/online-chess-tournaments-for-students), and ask their coach about Game 2 in their next class.",
    },
    { type: "h2", id: "game-3", text: "What's next: Game 3" },
    {
      type: "p",
      text: "Game 3 is on **Thursday, 26 November**, at **7:30 pm IST** (3:00 pm in Geneva), and **Sindarov has White** again. It is the last game before the first rest day on 27 November. After that, Gukesh has White in Game 4 on Saturday, 28 November. We will review every game here on the blog.",
    },
    {
      type: "cta",
      heading: "Want your child to learn openings like the London?",
      text: "Book a free demo class and our coaches will find the right level and batch for your child, from first moves to tournament play.",
      href: "/book-free-demo-class",
      label: "Book a free demo class",
    },
  ],
  faqs: [
    {
      q: "Who won Game 2 of the World Chess Championship 2026?",
      a: "Nobody. Game 2 between D. Gukesh (White) and Javokhir Sindarov (Black) on 25 November 2026 was drawn by threefold repetition after 20 moves. The match is level at 1–1.",
    },
    {
      q: "What opening did Gukesh play in Game 2?",
      a: "The London System, an opening built on 1.d4 and an early Bf4. Sindarov answered with the well-known idea 7...Qb6, which attacks the b2 pawn.",
    },
    {
      q: "Why was Game 2 so short?",
      a: "After Sindarov's 15...f5 and Gukesh's 16.f3, neither player saw a safe way to make progress. The pieces repeated their moves and the game was drawn by threefold repetition on move 20, in under two hours.",
    },
    {
      q: "Is the London System good for beginners?",
      a: "Many coaches think so, because White can use the same set-up against almost any defence and learn plans instead of long lines. Both Gukesh and Sindarov defended the opening after Game 2, and Sindarov said he would recommend it to beginners who play 1.d4.",
    },
    {
      q: "When is Game 3 of the World Chess Championship 2026?",
      a: "Game 3 is on Thursday, 26 November 2026, at 7:30 pm IST (3:00 pm in Geneva). Sindarov plays White. 27 November is a rest day.",
    },
  ],
};

export default post;
