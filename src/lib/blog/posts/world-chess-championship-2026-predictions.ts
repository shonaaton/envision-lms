import type { BlogPost } from "@/lib/blog/types";

/**
 * Predictions for the 2026 title match, published the day before Game 1.
 *
 * Supports the explainer `/blog/fide-world-chess-championship-2026`, which
 * owns "fide world chess championship 2026"; this post owns the predictions,
 * odds and "who will win" searches and links back to it for rules and dates.
 *
 * Facts checked on 2026-11-23 against the Wikipedia match article, OLBG's odds
 * report (bet365 prices updated 17 Nov) and RamaChess's prediction round-up,
 * which collects the expert quotes and the earlier odds with their dates.
 * Gukesh's world rank is 26 on Wikipedia and OLBG, 28 "among active players"
 * on RamaChess: the copy uses 26. Head-to-head counts differ between
 * databases for rapid/blitz, so the copy gives only the classical record,
 * where they agree (Sindarov 2 wins, 1 draw).
 *
 * The match predictor's presets come from `matchOdds()`: 14/26 per game
 * gives Sindarov about 76% (the market), 10/30 about 89% (ratings only),
 * 17/17 exactly 50% with an 18% tiebreak chance (the academy's own view,
 * chosen by the owner on 2026-11-23: form vs experience, mindset decides).
 *
 * Once the match is over, rewrite the intro and "our prediction" into a
 * result, keep the predictions as a record, and bump `updatedAt`.
 */
const post: BlogPost = {
  slug: "world-chess-championship-2026-predictions",
  title: "World Chess Championship 2026 Predictions: Who Wins? | Envision",
  h1: "FIDE World Chess Championship 2026 Predictions: Gukesh or Sindarov?",
  description:
    "World Chess Championship 2026 predictions: the odds, expert picks, head-to-head and form for Gukesh vs Sindarov, plus a match calculator to make your own call.",
  keyword: "world chess championship 2026 predictions",
  keywords: [
    "world chess championship 2026 predictions",
    "fide world chess championship 2026 predictions",
    "gukesh vs sindarov prediction",
    "who will win world chess championship 2026",
    "world chess championship 2026 odds",
    "gukesh vs sindarov odds",
  ],
  category: "tournaments-and-ratings",
  excerpt:
    "The bookmakers make Javokhir Sindarov a 3-to-1 favourite to take the title from D. Gukesh. We look at the ratings, the form, the head-to-head and what the experts say - then let you run the numbers yourself.",
  publishedAt: "2026-11-23",
  updatedAt: "2026-11-23",
  relatedCourses: ["intermediate-chess-course", "semi-pro-chess-course", "beginner-chess-course"],
  relatedPosts: [
    "world-chess-championship-2026-game-1",
    "fide-world-chess-championship-2026",
    "why-chennai-is-the-chess-capital-of-india",
    "how-to-get-fide-rating-india",
    "online-chess-tournaments-for-students",
  ],
  priority: 94,
  body: [
    {
      type: "p",
      text: "Our **World Chess Championship 2026 prediction** in one line: **it is anybody's game - we call it 50-50.** Javokhir Sindarov has the form, D. Gukesh has the experience, and in a one-on-one title match the mindset on the day can matter more than either. The bookmakers disagree with us: they give the Uzbek challenger about a **75% chance** of winning the match that starts in Geneva on **24 November**, and most top players rate him the stronger player right now. But World Championship matches are not decided by ratings alone, and Gukesh showed in 2024 that he can come back from a bad start in a title match.",
    },
    {
      type: "p",
      text: "Below we set out every piece of evidence: the ratings, the head-to-head record, a year of form, the betting markets and the expert predictions. Then you can use our **match calculator** to make your own forecast, and test yourself with a short quiz. For the rules, dates and where to watch, see our full guide to the [FIDE World Chess Championship 2026](/blog/fide-world-chess-championship-2026).",
    },
    {
      type: "image",
      src: "/blog/world-chess-championship-2026-predictions/gukesh-vs-sindarov-tale-of-the-tape.svg",
      width: 1200,
      height: 760,
      caption: "Tale of the tape: the numbers behind the World Chess Championship 2026 predictions.",
      alt: "Comparison card. Gukesh, India, World Champion: FIDE rating 2710, world number 26, no classical wins against Sindarov, won the 2024 title 7½–6½, about 25% bookmaker chance. Sindarov, Uzbekistan, challenger: rating 2782, world number 4, two classical wins against Gukesh with one draw, won the Candidates with 10 out of 14, about 75% chance.",
    },
    { type: "h2", id: "verdict", text: "The short answer: who will win?" },
    {
      type: "callout",
      title: "Our prediction",
      text: "**Anybody's game: 50-50.** Sindarov has the form - an unbeaten Candidates and the best year of his career. Gukesh has the experience - he has already played a World Championship match and won it. Over 14 games against one opponent, the player who handles the pressure better will win, and that can go either way. With nothing between them, there is almost a **1 in 5** chance it goes all the way to tiebreaks on 12 December.",
    },
    {
      type: "p",
      text: "Why do we disagree with the bookmakers? Because a title match is a test of mindset as much as chess. In a tournament a bad day is one result among many; in a match it can change the whole story, and the player who stays calm after a loss usually wins in the end. Gukesh has shown that calm before, and Sindarov has never had to show it on this stage. This is a prediction, not a promise, and it is written for chess fans, not for betting. The rest of this page sets out the evidence on both sides, so you can make up your own mind.",
    },
    { type: "h2", id: "ratings", text: "Ratings: the biggest gap in years" },
    {
      type: "p",
      text: "On the November 2026 FIDE list Sindarov is rated **2782**, world number 4, and Gukesh is rated **2710**, world number 26. That is a **72-point gap**, and the reports of the match point out that Gukesh is the lowest-rated reigning champion since the Elo rating system began in 1971. The 22-place gap in the world ranking is the widest of any title match since the championship was reunified in 2006.",
    },
    {
      type: "p",
      text: "What does 72 points mean in practice? Under the Elo formula, the higher-rated player is expected to score about **60%** of the points in a game. In a match where around six games in ten are drawn, that works out to Sindarov winning about 30% of games and Gukesh about 10%. Play that out over 14 games and pure ratings would make Sindarov close to a **9-in-10 favourite**. Nobody serious thinks it is that one-sided, and the reasons why are the interesting part of this prediction. If you want to understand how these ratings are calculated in the first place, read our guide to [getting a FIDE rating in India](/blog/how-to-get-fide-rating-india).",
    },
    { type: "h2", id: "head-to-head", text: "Head-to-head: Sindarov has never lost in classical" },
    {
      type: "table",
      caption: "Gukesh vs Sindarov: classical games",
      head: ["Event", "Result"],
      rows: [
        ["Moscow Open 2018", "Sindarov won with Black"],
        ["Sharjah Masters 2022", "Sindarov won with White"],
        ["Tata Steel Masters 2026", "Draw in 78 moves"],
      ],
    },
    {
      type: "p",
      text: "In classical chess the record reads **Sindarov 2, Gukesh 0, with one draw**. Two of those games were played when both were young teenagers, so they tell us less than the score suggests. The only recent one, at Wijk aan Zee in January 2026, was a long draw in which Gukesh had real winning chances. In faster chess the picture is more mixed: Gukesh won their rapid game at the Grand Chess Tour event in Poland in May 2026, while Sindarov won their blitz games there.",
    },
    { type: "h2", id: "form", text: "Form: a hard year for the champion" },
    { type: "h3", id: "gukesh-form", text: "Gukesh: from 2794 to 2710" },
    {
      type: "p",
      text: "Gukesh reached a peak rating of 2794 after winning the title, but 2025 and 2026 have been difficult. He lost rating points through 2025, finished well down the field at the Grand Swiss and went out of the World Cup in Goa early as top seed. In 2026 he finished 10th at Tata Steel, joint last in Prague and last at Norway Chess, and his rating fell as low as 2703 before he steadied himself at the Chess Olympiad in September, where India took team silver. He also withdrew from the classical Grand Chess Tour events this year.",
    },
    { type: "h3", id: "sindarov-form", text: "Sindarov: the best year of his life" },
    {
      type: "p",
      text: "Sindarov's year has been the opposite. He won the FIDE World Cup in 2025, finished second at Tata Steel in January, then won the **Candidates Tournament 2026** in Cyprus with **10 out of 14 and not a single loss**, finishing 1½ points clear of Anish Giri. He has since helped Uzbekistan to Olympiad gold and won a rapid event in St Louis in October. His rating climbed from about 2745 in March to 2782 now.",
    },
    {
      type: "p",
      text: "Form is the main reason most experts favour the challenger. But form in tournaments and form in a one-on-one match are not the same thing, as the next sections show.",
    },
    { type: "h2", id: "odds", text: "World Chess Championship 2026 odds" },
    {
      type: "image",
      src: "/blog/world-chess-championship-2026-predictions/world-championship-2026-odds-trend.svg",
      width: 1200,
      height: 675,
      caption: "Sindarov has been the clear betting favourite all year, between about 70% and 77%.",
      alt: "Line chart of implied chances to win the match in 2026. Sindarov: 77% on 22 May, 73% on 30 June, 70% on 17 August (Kalshi), 73% on 2 September and 75% on 17 November. Gukesh: 29%, 33%, 30%, 33% and 31% on the same dates.",
    },
    {
      type: "p",
      text: "The betting markets have barely moved since the Candidates. On 17 November bet365 priced Sindarov at **1/3** and Gukesh at **9/4**, which converts to roughly a 75% chance for the challenger. The prediction market Kalshi has shown similar numbers through the year, with Sindarov between 70% and 77%. Bookmakers build in a margin, so their two numbers add up to slightly more than 100%; strip it out and the market view is close to **75-25**.",
    },
    {
      type: "p",
      text: "Notice the gap between the markets (75%) and the pure ratings (close to 90%). That gap is the market's way of saying that a reigning champion, with experience of a title match and months of focused preparation, is worth more than his rating. We think experience and mindset are worth even more than that, which is why our own prediction is an even match.",
    },
    { type: "h2", id: "experts", text: "What the experts predict" },
    {
      type: "ul",
      items: [
        "**Magnus Carlsen** (September 2026) called Sindarov \"a pretty significant favorite\" and described him as the more rounded player. He also warned that an early Sindarov lead would be very bad news for Gukesh.",
        "**Hikaru Nakamura** (August 2026) put it at about 75-25 for Sindarov, while stressing that Gukesh can still win.",
        "**Garry Kasparov** (April 2026) named Sindarov the clear favourite, but praised Gukesh as very resilient.",
        "**R. Praggnanandhaa** (May 2026) refused to pick a side and called the match 50-50.",
        "**Viswanathan Anand** (June 2026) did not name a favourite.",
      ],
    },
    {
      type: "p",
      text: "The pattern is clear: almost everyone favours Sindarov, but very few think the champion is a lost cause. Both teams are experienced. Sindarov is working with his long-time coach Roman Vidonyak and grandmasters Nikita Vitiugov and Mukhiddin Madaminov. Gukesh has kept his 2024 coach Grzegorz Gajewski and mental conditioning coach Paddy Upton, the team that took him to the title in Singapore.",
    },
    { type: "h2", id: "case-for-gukesh", text: "Why Gukesh can still win" },
    {
      type: "ol",
      items: [
        "**He has done this before.** Gukesh has played a World Championship match and won it, coming back from losing Game 1 against Ding Liren in 2024. Sindarov has never played a match of this length or pressure.",
        "**Matches reward preparation.** A tournament tests you against many opponents; a match lets a team spend months on one. Gukesh has had time to prepare openings aimed at one man.",
        "**Ratings come from tournaments.** Every point Gukesh lost came in open fields and round-robins, not in a match. Match play is a different skill, and it is the one he proved in Singapore.",
        "**Draws help the underdog.** In a 14-game match with many draws, one good day can decide the title. The more drawn the match, the closer it becomes to a coin toss.",
      ],
    },
    { type: "h2", id: "case-for-sindarov", text: "Why the odds favour Sindarov" },
    {
      type: "ol",
      items: [
        "**He is in the form of his life.** Unbeaten at the Candidates, a World Cup winner, rising fast.",
        "**He has never lost to Gukesh** in a classical game.",
        "**He has the first White.** Colours were drawn at the opening ceremony on 22 November, and Sindarov plays White in Game 1 and every odd-numbered game. Each player gets seven Whites, but starting with White lets you set the tone.",
        "**An early lead is dangerous.** If Sindarov wins one of the first few games, Gukesh will have to take risks, and risks against a player in this form often backfire.",
      ],
    },
    {
      type: "diagram",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      arrows: ["e2e4", "d2d4"],
      caption: "Game 1: Sindarov has White. Will he open with 1.e4 or 1.d4?",
      alt: "The starting position of a chess game with White to move. Arrows show the two most common first moves: the king's pawn from e2 to e4 and the queen's pawn from d2 to d4.",
    },
    {
      type: "p",
      text: "The first move of Game 1 will be the first clue to each team's plans. Both 1.e4 and 1.d4 follow the [chess opening principles](/blog/chess-opening-principles-for-beginners) every beginner learns: put a pawn in the centre and open lines for the pieces. At this level the choice also tells you what kind of game the player wants: sharp and tactical, or slow and strategic.",
    },
    { type: "h2", id: "calculator", text: "Make your own prediction" },
    {
      type: "p",
      text: "Here is the same simple model we used for our prediction. Choose a starting point, then move the sliders to set each player's chance of winning a single game. The calculator works out the chance of each player winning the whole 14-game match, including tiebreaks. Try nudging Gukesh's chance up by just a few per cent and watch how fast the match swings.",
    },
    {
      type: "matchPredictor",
      heading: "World Championship 2026 match calculator",
      players: ["Gukesh", "Sindarov"],
      games: 14,
      presets: [        {
          label: "Our prediction: 50-50",
          aWin: 17,
          bWin: 17,
          note: "Sindarov's form against Gukesh's experience: nothing between them, as Praggnanandhaa also says. A 50-50 match with almost a 1 in 5 chance of tiebreaks.",
        },

        {
          label: "What the odds say",
          aWin: 14,
          bWin: 26,
          note: "Gukesh wins 14% of games, Sindarov 26%, the rest drawn. That gives Sindarov about 76%, close to the bookmakers' price.",
        },
        {
          label: "Ratings only",
          aWin: 10,
          bWin: 30,
          note: "What a 72-point rating gap predicts if nothing else matters: Sindarov close to 9 in 10.",
        },
        {
          label: "Gukesh at his best",
          aWin: 22,
          bWin: 18,
          note: "If the 2024 Gukesh turns up, the champion becomes the favourite at about 59%.",
        },
      ],
    },
    {
      type: "p",
      text: "Two things stand out when you play with the numbers. First, small changes in single games make big changes in the match: moving just two per cent of games from Sindarov to Gukesh (from 14-26 to 16-24) cuts Sindarov from about 76% to 68%. Second, the chance of a 7-7 tie stays around 13-18% in most realistic settings, so the tiebreak day on 12 December is far from unlikely.",
    },
    { type: "h2", id: "quiz", text: "Quiz: how well do you know the match?" },
    {
      type: "quiz",
      heading: "World Championship 2026 quiz",
      questions: [
        {
          q: "How many points does a player need to win the match?",
          options: ["7", "7½", "8", "10"],
          answer: 1,
          explain: "**7½ points** out of 14 games. A player who reaches 7½ wins, and the remaining games are not played.",
        },
        {
          q: "Who plays White in Game 1?",
          options: ["Gukesh", "Sindarov"],
          answer: 1,
          explain: "**Sindarov**, after the colours were drawn at the opening ceremony. He has White in every odd-numbered game.",
        },
        {
          q: "Which tournament did Sindarov win to become the challenger?",
          options: ["Tata Steel 2026", "Candidates 2026", "Norway Chess 2026", "Chess Olympiad"],
          answer: 1,
          explain: "The **Candidates Tournament 2026** in Cyprus, with 10 out of 14 and no losses.",
        },
        {
          q: "Whom did Gukesh beat to become World Champion in 2024?",
          options: ["Magnus Carlsen", "Ian Nepomniachtchi", "Ding Liren", "Fabiano Caruana"],
          answer: 2,
          explain: "**Ding Liren**, 7½–6½ in Singapore. Read the story of his home city in [why Chennai is the chess capital of India](/blog/why-chennai-is-the-chess-capital-of-india).",
        },
        {
          q: "What is the classical head-to-head score before the match?",
          options: ["Gukesh leads", "Level", "Sindarov leads"],
          answer: 2,
          explain: "**Sindarov leads** with two wins and one draw. Gukesh has never beaten him in a classical game - yet.",
        },
      ],
    },
    { type: "h2", id: "students", text: "Predict the moves, not just the winner" },
    {
      type: "p",
      text: "The best way for a student to follow the match is to make predictions every game, not only about the winner. Before each move appears, guess what you would play. Guess the opening on move one. Guess which player will use more time. Coaches call this active watching, and it trains exactly the calculation and judgement you need in your own games. When you are ready to test those skills over the board, our [online chess tournaments for students](/blog/online-chess-tournaments-for-students) are the place to start.",
    },
    {
      type: "p",
      text: "Bring your predictions to class, too. A move from a World Championship game makes a great lesson, and our coaches will happily go through the critical moments with you. If your child is new to chess and the match has sparked their interest, our [online chess coaching courses](/online-chess-coaching-courses) start from the very first moves.",
    },
    {
      type: "cta",
      heading: "Caught World Championship fever?",
      text: "Book a free demo class and one of our coaches will assess your child's level and suggest the right batch.",
      href: "/book-free-demo-class",
      label: "Book a free demo class",
    },
  ],
  faqs: [
    {
      q: "Who will win the World Chess Championship 2026?",
      a: "Nobody knows, but Javokhir Sindarov is the favourite. Bookmakers give him about a 75% chance, and most top players, including Magnus Carlsen, Hikaru Nakamura and Garry Kasparov, favour him. Our own prediction is that it is anybody's game, 50-50: Sindarov has the form, Gukesh has the experience, and in a title match the mindset on the day can decide it.",
    },
    {
      q: "What are the odds for Gukesh vs Sindarov?",
      a: "On 17 November 2026 bet365 priced Sindarov at 1/3 and Gukesh at 9/4, which is roughly a 75% chance for Sindarov and 25% for Gukesh once the bookmaker's margin is removed. Odds change during the match, so check a live source for current prices.",
    },
    {
      q: "Who is higher rated, Gukesh or Sindarov?",
      a: "Sindarov. On the November 2026 FIDE list he is rated 2782 and ranked world number 4. Gukesh is rated 2710 and ranked number 26, a gap of 72 points.",
    },
    {
      q: "Has Gukesh ever beaten Sindarov?",
      a: "Not in classical chess. Sindarov has won two classical games against Gukesh and drawn one. Gukesh did beat Sindarov in a rapid game in Poland in May 2026.",
    },
    {
      q: "When does the World Chess Championship 2026 start?",
      a: "Game 1 is on Tuesday, 24 November 2026, at 7:30 pm IST. The 14 classical games run until 11 December, with tiebreaks on 12 December if the score is 7-7.",
    },
  ],
};

export default post;
