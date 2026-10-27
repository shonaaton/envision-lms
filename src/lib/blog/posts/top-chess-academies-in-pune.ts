import { cityAcademyGuide } from "@/lib/blog/cityAcademyGuide";

export default cityAcademyGuide({
  citySlug: "chess-coaching-in-pune",
  description:
    "Top chess academies in Pune compared: Envision's live online classes, Kunte's Chess Academy, SW Chess Academy and Chess Gaja - areas, formats and who each suits.",
  answer:
    "The top chess academies in Pune include **Envision Chess Academy** (live online classes in English and Hindi for families across Pune and Pimpri-Chinchwad), **Kunte's Chess Academy**, run by Grandmaster Abhijit Kunte and WIM Mrunalini Kunte, the newer **SW Chess Academy** in Wagholi, and **Chess Gaja**, an online academy led by a grandmaster. Pune has a strong chess tradition, so there is good coaching for every level.",
  academies: [
    {
      name: "Kunte's Chess Academy",
      area: "Kothrud, with other branches",
      format: "Offline and online",
      suits: "Beginners to competitive players",
      text: "Founded in 2007 and run by WIM Mrunalini Kunte and Grandmaster [Abhijit Kunte](https://en.wikipedia.org/wiki/Abhijit_Kunte), Kunte's Chess Academy is one of Pune's best-known chess schools. According to its website, classes are grouped by playing strength with no more than twelve students, the main centre is in Kothrud, and it also offers online coaching, camps and chess-in-schools programmes. [ChessBase India](https://www.chessbase.in/news/10-years-of-kca) marked its tenth anniversary.",
    },
    {
      name: "SW Chess Academy",
      area: "Wagholi",
      format: "Offline and online",
      suits: "Families in east Pune",
      text: "According to [ChessBase India](https://chessbase.in/news/the-story-behind-punes-newest-chess-academy-sw-chess-academy), SW Chess Academy was founded by National Instructor Satyam Warude and opened in Wagholi in 2026, offering online and offline training.",
    },
    {
      name: "Chess Gaja",
      area: "Online (Pune address)",
      format: "Online",
      suits: "Players who want grandmaster-led online classes",
      text: "Chess Gaja is an online academy led by Grandmaster Priyadharshan Kannappan, according to its website, with FIDE-rated coaches and a Pune address.",
    },
  ],
  localAdvice:
    "Pune families often balance chess against a demanding school calendar, so look for an academy whose timings fit exam seasons as well as normal weeks. If the best academy for your child's level is across town - Kothrud to Kharadi, or Pimpri to Hadapsar - an online option on a fixed schedule may be easier to sustain.",
  extraFaqs: [
    {
      q: "Is there a chess academy in Pune run by a grandmaster?",
      a: "Yes. Kunte's Chess Academy is run by Grandmaster Abhijit Kunte and WIM Mrunalini Kunte, and Chess Gaja is an online academy led by a grandmaster.",
    },
  ],
  cityPost: { slug: "how-to-balance-chess-and-studies", anchor: "how to balance chess and studies" },
  priority: 35,
});
