import { cityAcademyGuide } from "@/lib/blog/cityAcademyGuide";

export default cityAcademyGuide({
  citySlug: "chess-coaching-in-delhi",
  description:
    "Top chess academies in Delhi and the NCR compared: Envision's live online classes, Genius Chess Academy, Dwarka Chess Academy and more - areas and formats.",
  answer:
    "The top chess academies in Delhi include **Envision Chess Academy** (live online classes in English and Hindi for families across Delhi and the NCR), **Genius Chess Academy** in C R Park, **Dwarka Chess Academy** in West Delhi, **Rohini Chess Academy** in North-West Delhi and **Western Chess Academy**, which offers online, offline and at-home coaching. Delhi is a big city, so the right choice usually starts with which part of it you live in.",
  academies: [
    {
      name: "Genius Chess Academy",
      area: "C R Park, South Delhi",
      format: "Offline",
      suits: "Competitive juniors in South Delhi",
      text: "According to its website, Genius Chess Academy in C R Park has been coaching for about 25 years and has trained players who went on to earn FIDE titles - a long-established option for families in South Delhi.",
    },
    {
      name: "Dwarka Chess Academy",
      area: "Dwarka, West Delhi",
      format: "Offline",
      suits: "Beginners to state-level players in West Delhi",
      text: "Dwarka Chess Academy serves West Delhi. Its website says its coaches have trained many state champions and describes a long-serving senior coach - a local option for families in Dwarka and nearby areas.",
    },
    {
      name: "Rohini Chess Academy",
      area: "Rohini, North-West Delhi",
      format: "Offline",
      suits: "Children in North-West Delhi",
      text: "Rohini Chess Academy describes itself on its website as offering chess classes and coaching in Rohini with FIDE-rated coaches and former state champions - convenient for families in North-West Delhi.",
    },
    {
      name: "Western Chess Academy",
      area: "Delhi NCR",
      format: "Online, offline and at home",
      suits: "Families who want flexible formats",
      text: "According to its website, Western Chess Academy offers online classes, offline classes and in-home coaching across Delhi with FIDE-rated coaches - flexible if you want a coach to come to you.",
    },
  ],
  localAdvice:
    "Across Delhi and the NCR, distance and season both matter. A centre in South Delhi is a long trip from Noida or Gurugram, and in winter, smog days can close schools and cancel outdoor plans. Shortlist one or two academies close to home, compare them with a structured online option, and think about which one your child can keep attending every week of the year.",
  extraFaqs: [
    {
      q: "Are there chess classes in Delhi taught in Hindi?",
      a: "Yes. Many Delhi academies teach in Hindi and English. Envision's online classes for Delhi families are taught in English, with coaches explaining in Hindi whenever it helps.",
    },
  ],
  cityPost: { slug: "indoor-activities-for-kids-delhi-pollution", anchor: "indoor activities for kids on Delhi's smog days" },
  priority: 38,
});
