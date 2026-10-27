import { cityAcademyGuide } from "@/lib/blog/cityAcademyGuide";

export default cityAcademyGuide({
  citySlug: "chess-coaching-in-chennai",
  description:
    "Top chess academies in Chennai compared: Envision's live online classes, Chess Gurukul, the WestBridge-Anand programme and local academies - formats and fit.",
  answer:
    "The top chess academies in Chennai include **Envision Chess Academy** (live online classes for families anywhere in Chennai), **Chess Gurukul**, co-founded by Grandmaster R B Ramesh, the **WestBridge-Anand Chess Academy** mentorship programme for elite juniors, and neighbourhood academies such as **Velachery Chess Academy** and **C Squad Chess Academy**. In India's chess capital, the choice depends a lot on how far your child wants to take the game.",
  academies: [
    {
      name: "Chess Gurukul",
      area: "T. Nagar",
      format: "Offline and online",
      suits: "Ambitious, competitive players",
      text: "Chess Gurukul was co-founded in 2008 by Grandmaster [R B Ramesh](https://en.wikipedia.org/wiki/Ramachandran_Ramesh) and WGM Aarthie Ramaswamy. Ramesh is widely known as the coach of R Praggnanandhaa and R Vaishali, and the academy runs in-person and online training from beginner to elite level, with a reputation for serious, competitive training.",
    },
    {
      name: "WestBridge-Anand Chess Academy",
      area: "Chennai",
      format: "Mentorship programme",
      suits: "India's top junior players",
      text: "The [WestBridge-Anand Chess Academy](https://en.wikipedia.org/wiki/WestBridge-Anand_Chess_Academy) was founded by Viswanathan Anand in December 2020 with WestBridge Capital. According to Wikipedia it is a fellowship programme that mentors elite junior players - D Gukesh is among its alumni - rather than a walk-in academy for beginners.",
    },
    {
      name: "Velachery Chess Academy",
      area: "Velachery",
      format: "Offline",
      suits: "Local beginners to advanced players",
      text: "According to its listing, Velachery Chess Academy offers beginner, intermediate and advanced classes and trial classes - a neighbourhood option for families in south Chennai.",
    },
    {
      name: "C Squad Chess Academy",
      area: "Ayanavaram, near Anna Nagar",
      format: "Offline and online",
      suits: "Children who want tournament preparation",
      text: "C Squad Chess Academy's listing describes beginner programmes, tournament preparation, one-to-one coaching and online coaching, for families around Anna Nagar and Ayanavaram.",
    },
  ],
  localAdvice:
    "Chennai has some of the strongest junior chess in the world, which cuts both ways: your child will find excellent coaching and opponents, but weak foundations show quickly. Be honest about your child's level and goals. Elite programmes suit elite juniors; most children do better with a structured course that builds the basics properly first.",
  extraFaqs: [
    {
      q: "Can my child join the WestBridge-Anand Chess Academy?",
      a: "It is a mentorship programme for India's strongest junior players rather than an open academy, according to Wikipedia. Most children start with a regular academy or online course and build towards competitive chess from there.",
    },
  ],
  cityPost: { slug: "why-chennai-is-the-chess-capital-of-india", anchor: "why Chennai is the chess capital of India" },
  priority: 40,
});
