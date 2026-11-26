import type { BlogPost } from "@/lib/blog/types";

/**
 * Round 3 review of the 2026 title match, written on the first rest day.
 *
 * Facts checked on 2026-11-27 against FIDE's Game 3 report (Yannick
 * Pelletier), Chess.com's flash report (Colin McGourty), and the ANI reports
 * syndicated by The Tribune and NationPress. No source printed the full score
 * in text, so the post quotes only moves the reports name. The 29.f4 diagram
 * is read off FIDE's own diagram (arrows f3-f4 and h2-h3); the opening diagram
 * is the position after 5...Be7, which is what "Rio de Janeiro Variation"
 * means. ANI's later middlegame details (a "d3 passer") do not match FIDE's
 * diagram, so they are left out.
 *
 * Sindarov's clock at move 40: FIDE says 8 seconds, Chess.com 6 - the copy
 * says "six to eight seconds".
 *
 * Photos are FIDE's (Y.E. Nisenbaum and Michal Walusza) from its Game 3
 * report, resized to WebP in public/blog/world-chess-championship-2026-game-3/.
 */
const GUKESH = "[D. Gukesh](https://ratings.fide.com/profile/46616543)";
const SINDAROV = "[Javokhir Sindarov](https://ratings.fide.com/profile/14205483)";
const IMG = "/blog/world-chess-championship-2026-game-3";

const post: BlogPost = {
  slug: "world-chess-championship-2026-game-3",
  title: "World Chess Championship 2026 Game 3 Review | Envision",
  h1: "World Chess Championship 2026 Game 3: Gukesh's Surprise and a 60-Move Fight",
  description:
    "Round 3 review of the World Chess Championship 2026: Gukesh's Rio de Janeiro surprise, Sindarov's 29.f4, six seconds left at move 40 and a 60-move draw.",
  keyword: "world chess championship 2026 game 3",
  keywords: [
    "world chess championship 2026 game 3",
    "gukesh sindarov game 3",
    "world chess championship 2026 round 3",
    "rio de janeiro variation berlin",
    "gukesh vs sindarov game 3 analysis",
  ],
  category: "tournaments-and-ratings",
  excerpt:
    "Gukesh surprised Sindarov with a 19th-century sideline of the Berlin, Sindarov's 29.f4 set the board alight, he reached move 40 with seconds to spare, and after 60 moves the match was still level at 1½–1½.",
  publishedAt: "2026-11-27",
  updatedAt: "2026-11-27",
  relatedCourses: ["intermediate-chess-course", "semi-pro-chess-course"],
  relatedPosts: [
    "world-chess-championship-2026-game-2",
    "world-chess-championship-2026-game-1",
    "fide-world-chess-championship-2026",
    "world-chess-championship-2026-predictions",
  ],
  priority: 98,
  body: [
    {
      type: "p",
      text: `Game 3 of the World Chess Championship 2026 was the longest and most tense game of the match so far. ${SINDAROV} had White again and opened 1.e4, and ${GUKESH} answered with the Berlin Defence for the second time, but with a **surprise on move 5** that took Sindarov out of his preparation. The challenger later lit up the position with **29.f4**, then had only **six to eight seconds** left when he made his 40th move. After **60 moves** the players shook hands on a draw, and the match is level at **1½–1½**.`,
    },
    {
      type: "p",
      text: "This review explains Gukesh's opening choice, the clock battle, the critical position before 29.f4 and why the game ended in an opposite-coloured bishop endgame that neither side could win. Catch up on the earlier rounds in our [Game 1 review](/blog/world-chess-championship-2026-game-1) and [Game 2 review](/blog/world-chess-championship-2026-game-2), and see our [guide to the FIDE World Chess Championship 2026](/blog/fide-world-chess-championship-2026) for the format and schedule.",
    },
    {
      type: "callout",
      title: "Game 3 at a glance",
      text: "**White:** Javokhir Sindarov (Uzbekistan). **Black:** D. Gukesh (India). **Date:** Thursday, 26 November 2026, Geneva. **Opening:** Berlin Defence, Rio de Janeiro Variation (5...Be7). **Result:** draw, 60 moves. **Match score:** 1½–1½. **Next:** rest day on 27 November, then Game 4 on Saturday, 28 November, 7:30 pm IST, with Gukesh playing White.",
    },
    {
      type: "image",
      src: `${IMG}/game-3-at-the-board.webp`,
      width: 1200,
      height: 796,
      caption: "Sindarov (left) and Gukesh in the opening of Game 3 at the Fondation Martin Bodmer. Photo: FIDE / Michal Walusza and Y.E. Nisenbaum.",
      alt: "Sindarov, in a dark suit, sits on the left with his hand on a piece, and Gukesh, in a navy blazer, sits on the right with his chin on his hand. The Uzbek and Indian flags stand beside the clock, and bookshelves line the wall on the right.",
    },
    { type: "h2", id: "first-move", text: "Before the game: a poll for 1.f4" },
    {
      type: "p",
      text: "Each game starts with a ceremonial first move by a guest. According to FIDE's report, Chess.com's Mike Klein had polled his colleagues before Game 3, and most of them wanted the guest move to be the rare **1.f4**, the Bird's Opening. When the real game began, Sindarov stayed with **1.e4**, the move he played in Game 1.",
    },
    {
      type: "image",
      src: `${IMG}/game-3-first-move.webp`,
      width: 1200,
      height: 785,
      caption: "The ceremonial first move of Game 3, with Sindarov (left) smiling and Gukesh (right) waiting. Photo: FIDE / Michal Walusza and Y.E. Nisenbaum.",
      alt: "A guest in a blue jacket stands between the players and reaches over the board to move a white pawn. Sindarov sits on the left smiling, Gukesh sits on the right in profile, and the Uzbek and Indian flags stand on the table.",
    },
    { type: "h2", id: "opening", text: "The surprise: the Rio de Janeiro Variation" },
    {
      type: "p",
      text: "After 1.e4 e5 2.Nf3 Nc6 3.Bb5 Nf6 4.0-0 Nxe4 5.d4, Gukesh did not play the usual 5...Nd6 that leads to the Berlin Endgame from Game 1. Instead he chose **5...Be7**, the **Rio de Janeiro Variation**. FIDE's report points out how old this line is: it was played around the end of the 19th century, and Viktor Korchnoi tried it against Anatoly Karpov in their 1981 World Championship match, without success.",
    },
    {
      type: "diagram",
      fen: "r1bqk2r/ppppbppp/2n5/1B2p3/3Pn3/5N2/PPP2PPP/RNBQ1RK1 w kq - 1 6",
      highlight: ["e7", "e4"],
      caption: "The Rio de Janeiro Variation after 5...Be7: instead of retreating the e4 knight, Black develops the bishop and prepares to castle.",
      alt: "Position after 1.e4 e5 2.Nf3 Nc6 3.Bb5 Nf6 4.0-0 Nxe4 5.d4 Be7, White to move. White: king g1, queen d1, rooks a1 and f1, bishops b5 and c1, knights b1 and f3, pawns a2, b2, c2, d4, f2, g2, h2. Black: king e8, queen d8, rooks a8 and h8, bishops c8 and e7, knights c6 and e4, pawns a7, b7, c7, d7, e5, f7, g7, h7. The bishop on e7 and the knight on e4 are highlighted.",
    },
    {
      type: "p",
      text: "The game continued 6.Qe2 Nd6 7.Bxc6 bxc6 8.dxe5 and, according to ANI's report, Gukesh played **8...Nf5**, a rare branch that Boris Spassky used in two games in 1988. Sindarov admitted afterwards that his team had looked at 5...Be7, but not that deeply, and he called Gukesh really well prepared. Asked how he found such an old idea, Gukesh joked: **\"Spassky is not one of my seconds,\"** before confirming he knew the 1988 game (via ANI and ChessBase India).",
    },
    {
      type: "p",
      text: "The surprise paid off on the clock. Gukesh played his first 15 moves in about two minutes, NationPress reported, and Chess.com put his lead at around **50 minutes** at one point, the opposite of Games 1 and 2. Sindarov's **12.Nc3** had appeared in only three earlier games, FIDE noted, but Gukesh stayed in his preparation until move 16, took his first long think, and then exchanged queens.",
    },
    {
      type: "callout",
      title: "Why surprise your opponent in the opening?",
      text: "A well-prepared surprise does two jobs. It takes your opponent out of the lines they studied, and it makes them spend their own clock time solving problems you already solved at home. You don't need a World Championship team to use this: learn one sound sideline in an opening you already play. Our guide to [chess opening principles](/blog/chess-opening-principles-for-beginners) shows the ideas that keep any sideline playable.",
    },
    { type: "h2", id: "middlegame", text: "Opposite-coloured bishops, but all four rooks" },
    {
      type: "p",
      text: "With the queens gone, Sindarov's **22.Nc5+** led to a position with **opposite-coloured bishops**: White's bishop on the dark squares, Black's on the light squares. On their own, opposite-coloured bishops are famous for drawing, because each bishop can defend squares the other can never attack. But with **all four rooks still on the board**, the position was full of life, and both players tried to win.",
    },
    {
      type: "p",
      text: "Both players named one moment as critical: Gukesh moving his bishop from **f5 to c4**, a decision he was unhappy with afterwards. It gave Sindarov the chance he had been waiting for.",
    },
    { type: "h2", id: "f4", text: "The key moment: 29.f4" },
    {
      type: "diagram",
      fen: "1r6/2p2p2/2p1k3/3pP1pp/rPbB4/P3RP2/6PP/R5K1 w - - 0 29",
      highlight: ["f3", "h2"],
      arrows: ["f3f4", "h2h3"],
      caption: "Before White's 29th move. Sindarov played 29.f4 at once; afterwards he felt he should have prepared it with 29.h3.",
      alt: "Position before White's 29th move. White: king g1, rooks a1 and e3, bishop d4, pawns a3, b4, e5, f3, g2, h2. Black: king e6, rooks a4 and b8, bishop c4, pawns c6, c7, d5, f7, g5, h5. Arrows show the pawn moves f3 to f4 and h2 to h3.",
    },
    {
      type: "p",
      text: "This is the position FIDE highlighted in its report. Material is level and the bishops are opposite-coloured, but White's pawn on **e5** cramps Black, and Black's king on e6 is close to the action. Sindarov struck with **29.f4**, a pawn break that attacks Black's g5 pawn and tries to open lines on the kingside. Chess.com described it as the move that turned a calm position into a sharp one, and Gukesh admitted at the press conference that he had overlooked it.",
    },
    {
      type: "p",
      text: "So was it a good move? Sindarov himself thought he played it too soon. He said he should have prepared it with **29.h3** first, a quiet move that gives his king an escape square on h2 and takes away the g4 square from Black. Gukesh, for his part, found a safe way to keep the balance. NationPress singled out his king moves **31...Kf5!** and **32...Ke6** and the pawn push **33...c5** as the accurate defence.",
    },
    {
      type: "callout",
      title: "The lesson of 29.h3",
      text: "Before you open lines near your own king, check whether your king has a safe square. A pawn break like f4 is strongest when the rest of your position is ready for it. One quiet preparatory move, like h3, often makes the attacking move work much better.",
    },
    { type: "h2", id: "time-trouble", text: "Six seconds at move 40" },
    {
      type: "image",
      src: `${IMG}/game-3-from-above.webp`,
      width: 1200,
      height: 776,
      caption: "Seen from above: Sindarov (left) and Gukesh in the middlegame of Game 3, with the queens already off the board. Photo: FIDE / Michal Walusza and Y.E. Nisenbaum.",
      alt: "Overhead view of the playing table. Sindarov, in a black suit, leans over the board on the left holding a captured piece, and Gukesh, in a navy blazer, rests his head on his hand on the right. The clock shows both players' times, and captured pieces stand beside the board.",
    },
    {
      type: "p",
      text: "The time control gives each player two hours for the first 40 moves, with 30 more minutes and a 30-second increment after that. Sindarov had used so much time solving the opening and the complications after 29.f4 that he made his **40th move with only six to eight seconds left** (Chess.com said six, FIDE said eight). He admitted afterwards that in the time scramble he came very close to missing something. Gukesh later ran short of time too, NationPress reported, but also came through safely.",
    },
    {
      type: "p",
      text: "This is the clearest lesson of the game for students. **Time is a piece.** A player who spends 50 minutes more than their opponent in the opening is giving away material that only shows up at move 35. Practise making your moves in the opening faster by knowing your plans, and save your thinking time for the moments that really matter.",
    },
    { type: "h2", id: "endgame", text: "The endgame and the draw" },
    {
      type: "p",
      text: "After the time control the rooks were traded off one pair at a time, and the game reached a pure **opposite-coloured bishop endgame**. In these endings even an extra pawn is often not enough to win, because the defending bishop can stop the pawns on squares the attacking bishop can never control. NationPress reported that Gukesh was a pawn up at the end, and that he had turned down a draw offer earlier, but the position gave him no real chances. The players shook hands on **move 60**.",
    },
    {
      type: "p",
      text: "If you want to see this idea for yourself, set up a king, bishop and two pawns against a king and a bishop of the other colour, and try to win. You will find that the defender simply parks the bishop on the path of the pawns. Knowing which endgames are drawn helps you decide when to trade pieces in your own games, the same way it helped both players here.",
    },
    { type: "h2", id: "what-they-said", text: "What the players said" },
    {
      type: "ul",
      items: [
        "**Sindarov** said he was surprised by how deep Gukesh's preparation went in the 5...Be7 line, thought he had a very good position at first, and later realised the endgame was completely equal. He regretted rushing 29.f4 instead of preparing it with 29.h3.",
        "**Gukesh** said the game became very interesting after 29.f4, which he had overlooked, and that he was unhappy with his bishop move from f5 to c4.",
        "**On his preparation,** Gukesh answered with a joke about Spassky not being one of his seconds, and confirmed he knew Spassky's 1988 game in the line.",
      ],
    },
    { type: "h2", id: "analysis", text: "Our analysis: three games, three draws" },
    {
      type: "p",
      text: "After three draws the match is still waiting for its first decisive result, but Game 3 changed the story in one important way. In Games 1 and 2, Gukesh fell well behind on the clock. In Game 3 it was **Sindarov** who ran short, and the reason was Gukesh's preparation. If the champion's team can keep finding surprises like 5...Be7, the clock battle could swing his way in the games to come.",
    },
    {
      type: "p",
      text: "Sindarov, for his part, has now pressed with White in both of his White games, and showed in time trouble that he can defend accurately. Before the match the bookmakers made him the favourite and our view was that it is **anybody's game**, as explained in our [World Chess Championship 2026 predictions](/blog/world-chess-championship-2026-predictions). Three games in, that still looks right. The next two games, with Gukesh playing White in Game 4, will show whether the champion can turn his opening surprises into real winning chances.",
    },
    { type: "h2", id: "lessons", text: "Three lessons for students from Game 3" },
    {
      type: "ol",
      items: [
        "**Prepare one surprise.** A sound but rare line takes your opponent out of their preparation and wins you time on the clock, just as 5...Be7 did for Gukesh.",
        "**Prepare your pawn breaks.** Sindarov's 29.f4 was a strong idea, but in his own words it needed 29.h3 first. Make sure your king is safe before you open lines.",
        "**Know your drawn endgames.** Opposite-coloured bishop endings are often drawn even a pawn down. When you are worse, trading into one can save the game; when you are better, try to keep other pieces on the board.",
      ],
    },
    {
      type: "p",
      text: "Envision students can practise these ideas in our regular [online chess tournaments for students](/blog/online-chess-tournaments-for-students), where the clocks are real and every second counts. Bring the 29.f4 position to your next class and ask your coach what they would play.",
    },
    { type: "h2", id: "game-4", text: "What's next: Game 4" },
    {
      type: "p",
      text: "Friday, 27 November is the first rest day. Game 4 is on **Saturday, 28 November**, at **7:30 pm IST** (3:00 pm in Geneva), and **Gukesh has White**. After his London System in Game 2, everyone will be watching to see what the champion opens with this time. We will review every game here on the blog.",
    },
    {
      type: "cta",
      heading: "Want your child to think like a World Championship player?",
      text: "Book a free demo class and our coaches will find the right level and batch for your child, from first moves to tournament play.",
      href: "/book-free-demo-class",
      label: "Book a free demo class",
    },
  ],
  faqs: [
    {
      q: "Who won Game 3 of the World Chess Championship 2026?",
      a: "Nobody. Game 3 between Javokhir Sindarov (White) and D. Gukesh (Black) on 26 November 2026 was drawn after 60 moves in an opposite-coloured bishop endgame. The match is level at 1½–1½.",
    },
    {
      q: "What is the Rio de Janeiro Variation of the Berlin Defence?",
      a: "It is the line 1.e4 e5 2.Nf3 Nc6 3.Bb5 Nf6 4.0-0 Nxe4 5.d4 Be7, where Black develops the bishop instead of retreating the knight with 5...Nd6. It is more than a century old and rarely played today, which is why Gukesh's choice surprised Sindarov.",
    },
    {
      q: "What did Gukesh mean by \"Spassky is not one of my seconds\"?",
      a: "It was a joke at the press conference. Gukesh's 8...Nf5 followed a line Boris Spassky played in 1988, and when he was asked about his preparation he joked that the former World Champion was not on his team, before confirming he knew Spassky's game.",
    },
    {
      q: "How much time did Sindarov have left at move 40 in Game 3?",
      a: "Only a few seconds. FIDE reported 8 seconds and Chess.com 6 seconds when he made his 40th move, after which both players received 30 more minutes plus a 30-second increment per move.",
    },
    {
      q: "When is Game 4 of the World Chess Championship 2026?",
      a: "Game 4 is on Saturday, 28 November 2026, at 7:30 pm IST (3:00 pm in Geneva), after the rest day on 27 November. Gukesh plays White.",
    },
  ],
};

export default post;
