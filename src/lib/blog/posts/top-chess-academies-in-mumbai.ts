import { cityAcademyGuide } from "@/lib/blog/cityAcademyGuide";

export default cityAcademyGuide({
  citySlug: "chess-coaching-in-mumbai",
  description:
    "Top chess academies in Mumbai compared: Envision's live online classes, South Mumbai Chess Academy, Chess Guru and more - areas, formats and who each suits.",
  answer:
    "The top chess academies in Mumbai include **Envision Chess Academy** (live online classes for families anywhere in Mumbai, Thane and Navi Mumbai), the **South Mumbai Chess Academy**, **Chess Guru Coaching Academy** with centres across the suburbs, **Chessniti** and **Checkmate Chess Academy**. Which is right depends on where you live, how far you can travel in Mumbai traffic, and whether your child is a beginner or a competitive player.",
  academies: [
    {
      name: "South Mumbai Chess Academy (SMCA)",
      area: "South Mumbai, with other branches",
      format: "Offline",
      suits: "Beginners to competitive players",
      text: "Founded in 1996 by brothers Balaji and Durga Nagesh Guttula, the South Mumbai Chess Academy is one of the city's longest-running chess schools. According to [Wikipedia](https://en.wikipedia.org/wiki/Balaji_Guttula), Balaji Guttula is a FIDE Master and FIDE Trainer and serves as its chief coach; the academy's website describes branches in Mumbai and other cities.",
    },
    {
      name: "Chess Guru Coaching Academy",
      area: "Dombivli, Ghatkopar, Bandra, Kandivali, Mulund, Navi Mumbai",
      format: "Offline",
      suits: "Children who want a centre close to home",
      text: "According to its website, Chess Guru was founded by Amit Panchal in 2005 and runs centres across Mumbai's suburbs and satellite towns, including Dombivli, Ghatkopar, Bandra, Kandivali, Mulund and Navi Mumbai - a practical option for families who want offline classes without a long commute.",
    },
    {
      name: "Chessniti (The Professional Chess Academy)",
      area: "Mumbai",
      format: "Offline and online",
      suits: "Players looking for professional-style training",
      text: "Chessniti describes itself on its website as a Mumbai-based professional chess training academy with FIDE-rated coaches, offering structured training for players who want to take the game seriously.",
    },
    {
      name: "Checkmate Chess Academy",
      area: "Mumbai",
      format: "Offline",
      suits: "Young players starting out",
      text: "According to published listings, Checkmate Chess Academy was founded in 2011 by Jay Pradhan, an internationally rated chess player, and teaches children from the basics upwards.",
    },
  ],
  localAdvice:
    "In Mumbai, travel time decides more than anything else. A good centre one station away beats a famous one across the city, and in the monsoon even a short trip can be unreliable. Many Mumbai families combine a local centre for over-the-board play with online coaching for structure - or go fully online to get the coach they want without the commute.",
  extraFaqs: [
    {
      q: "Are there chess academies in Thane and Navi Mumbai?",
      a: "Yes. Some Mumbai academies run centres in the suburbs and satellite towns - Chess Guru, for example, lists centres including Mulund, Dombivli and Navi Mumbai - and online academies such as Envision teach families anywhere in the region.",
    },
  ],
  cityPost: { slug: "monsoon-indoor-activities-for-kids-mumbai", anchor: "monsoon indoor activities for kids in Mumbai" },
  priority: 39,
});
