import type { BlogPost } from "@/lib/blog/types";
import { centreHref, centreHub, centreTimeRange, kolkataCentres } from "@/lib/centrePages";

/**
 * A guide to chess academies in Kolkata, Envision first.
 *
 * The other academies are described only with facts that were found in public
 * sources in October 2026 - their own websites, Wikipedia, ChessBase India and
 * listing sites - and the copy says where each fact comes from. No rankings of
 * other academies, no negative claims, no addresses or phone numbers we could
 * not confirm. Envision's own entry is built from `centrePages`, so its
 * addresses and timings can never disagree with the centre pages.
 */

const centreRows = kolkataCentres.map((centre) => [
  `[${centre.h1}](${centreHref(centre.slug)})`,
  centre.address,
  centre.schedule.map((entry) => entry.day.slice(0, 3)).join(", "),
  centreTimeRange(centre),
]);

const post: BlogPost = {
  slug: "top-chess-academies-in-kolkata",
  title: "Top Chess Academies in Kolkata (2026 Guide) | Envision",
  h1: "Top Chess Academies in Kolkata: A 2026 Guide for Parents",
  description:
    "Top chess academies in Kolkata compared: Envision's four centres and online classes, Goodricke, Dibyendu Barua Chess Academy and more - areas, formats and fit.",
  keyword: "top chess academies in Kolkata",
  keywords: [
    "top chess academies in Kolkata",
    "top 10 chess academies in Kolkata",
    "best chess academies in Kolkata",
    "chess academies in Kolkata for kids",
    "chess classes in Kolkata comparison",
    "professional chess training Kolkata",
  ],
  category: "for-parents",
  excerpt:
    "Kolkata has one of India's richest chess cultures and plenty of academies to choose from. Here are the leading options - starting with our own four centres and online classes - with the areas they serve and who each one suits.",
  publishedAt: "2026-10-27",
  updatedAt: "2026-10-27",
  relatedCourses: ["beginner-chess-course", "intermediate-chess-course"],
  relatedPosts: ["online-vs-offline-chess-classes", "how-to-choose-a-chess-coach", "school-chess-club-vs-chess-coaching"],
  priority: 48,
  body: [
    {
      type: "p",
      text: `The top chess academies in Kolkata include **Envision Chess Academy** (${kolkataCentres.length} centres in ${kolkataCentres.map((centre) => centre.name).join(", ")}, plus live online classes), the **Goodricke National Chess Academy** at Gorky Sadan, the **Dibyendu Barua Chess Academy** in south Kolkata, the **Kolkata Chess Institute** in Birati, **The Knight Chess Academy** in Kasba, **Sunshine Chess Academy** in Kalighat and **Academia of Chess** in Behala. The right choice depends on where you live, your child's age and level, and whether you want offline classes, online classes or both.`,
    },
    {
      type: "callout",
      title: "Who wrote this, and how",
      text: "This guide is written by Envision Chess Academy, so we list ourselves first - and we say so plainly. Details of the other academies come from public sources (their own websites, Wikipedia, ChessBase India and listing sites) as checked in October 2026, and we describe every academy by the same criteria rather than ranking them. Timings and programmes change, so always confirm directly with an academy before enrolling.",
    },
    { type: "h2", id: "how-we-compared", text: "How we compared Kolkata's chess academies" },
    {
      type: "ul",
      items: [
        "**Location and format** - which part of Kolkata, and whether classes are offline, online or both.",
        "**Who it suits** - young beginners, school-age improvers or competitive and rated players.",
        "**Structure** - a defined syllabus and levels, rather than open-ended sessions.",
        "**Coaching and track record** - coach credentials and results that can be checked publicly.",
        "**Practice and competition** - homework, tournaments and game review.",
      ],
    },
    { type: "h2", id: "at-a-glance", text: "Chess academies in Kolkata at a glance" },
    {
      type: "table",
      caption: "Kolkata chess academies compared (details as published, October 2026)",
      head: ["Academy", "Area", "Format", "Best suited to"],
      rows: [
        ["[Envision Chess Academy](/chess-academy-in-kolkata)", kolkataCentres.map((centre) => centre.name).join(", "), "Offline and online", "Beginners to rated players; families who want both formats"],
        ["Goodricke National Chess Academy", "Gorky Sadan", "Offline", "Serious competitive juniors"],
        ["Dibyendu Barua Chess Academy", "South Kolkata (Ballygunge area)", "Offline", "Competitive and tournament players"],
        ["Kolkata Chess Institute", "Birati, north Kolkata", "Offline weekends and online", "Children from 5, beginner to advanced"],
        ["The Knight Chess Academy", "Kasba", "Offline and online", "Children aged 5 to 13"],
        ["Sunshine Chess Academy", "Kalighat", "Offline weekends", "Beginners to advanced players in south Kolkata"],
        ["Academia of Chess", "Behala", "Offline and online", "Children, with tournament play"],
      ],
    },
    { type: "h2", id: "envision", text: "1. Envision Chess Academy - four Kolkata centres and live online classes" },
    {
      type: "p",
      text: `Envision Chess Academy teaches chess the way a school teaches a subject: one published syllabus of **240 sessions across five stages**, from a child's first move to elite competitive play, with two classes a week, homework a coach reviews and weekly tournaments. It runs **${kolkataCentres.length} offline centres across Kolkata and live online classes on the same syllabus**, so a child can learn in person, online, or move between the two without starting again. The academy is affiliated to the Kolkata District Chess Association and recognised by Sara Bangla Daba Sangstha.`,
    },
    { type: "h3", id: "envision-centres", text: "Envision's offline chess centres in Kolkata" },
    {
      type: "table",
      caption: "Envision Chess Academy centres in Kolkata",
      head: ["Centre", "Address", "Class days", "Timings"],
      rows: centreRows,
    },
    {
      type: "p",
      text: `Each centre has its own page with coach details, batch timings, a map and directions - or see all of them on the [chess academy in Kolkata](/${centreHub.slug}) page. Coaching at the centres is led by FIDE-certified and FIDE-rated coaches, with group and one-to-one classes and preparation for district, state and national events.`,
    },
    { type: "h3", id: "envision-online", text: "Envision's live online chess classes" },
    {
      type: "p",
      text: "For families who cannot reach a centre - or who prefer to learn from home - the same courses run as live online classes, taught in English, Hindi and Bengali. Every class is live with a coach, never a recording, and the live board, homework, tactics trainer, tournaments and parent reports all sit in one academy portal. See [online chess classes for kids](/online-chess-classes-for-kids) for how a class runs, or the full [online chess coaching courses](/online-chess-coaching-courses) for the syllabus.",
    },
    { type: "h3", id: "envision-strengths", text: "What sets Envision apart" },
    {
      type: "ul",
      items: [
        "**A published syllabus.** Every session of the [Beginner Chess Course](/beginner-chess-course) and the [Intermediate Chess Course](/intermediate-chess-course) is listed in full, so parents know exactly what is taught.",
        "**Placement by assessment.** A free demo class places each child at the right session, so no one repeats what they already know.",
        "**Offline and online on one ladder** - switch formats without losing progress.",
        "**Verified results.** Kolkata students have won age-group titles at All Bengal school championships, and one Envision student placed third in an All India FIDE-rated below-1800 classical tournament in 2026 - see our [student success stories](/success-stories).",
        "**Parents can see everything** - attendance, homework scores, coach feedback and tournament results.",
      ],
    },
    { type: "h2", id: "goodricke", text: "2. Goodricke National Chess Academy" },
    {
      type: "p",
      text: "One of Kolkata's best-known training centres, the [Goodricke National Chess Academy](https://en.wikipedia.org/wiki/Goodricke_National_Chess_Academy) is run by the Alekhine Chess Club at Gorky Sadan. According to Wikipedia, its past students include grandmasters Surya Shekhar Ganguly, Sandipan Chanda and Neelotpal Das and Woman Grandmaster Nisha Mohota, as well as later junior champions such as Diptayan Ghosh. It has a long record of producing competitive players, and is best known as a training ground for serious juniors.",
    },
    { type: "h2", id: "dibyendu-barua", text: "3. Dibyendu Barua Chess Academy" },
    {
      type: "p",
      text: "The [Dibyendu Barua Chess Academy](https://chessbase.in/news/12_years_of_DBCA) was founded by Grandmaster Dibyendu Barua - India's second grandmaster and a three-time national champion - together with Woman International Master Saheli Dhar Barua. ChessBase India reports that it began in the mid-2000s in south Kolkata, and the academy is associated with the Chess for Youth tournament held in the city. It is a natural choice for players who want training from one of Indian chess's most experienced names.",
    },
    { type: "h2", id: "kolkata-chess-institute", text: "4. Kolkata Chess Institute" },
    {
      type: "p",
      text: "Based in Birati in north Kolkata, the Kolkata Chess Institute is led by its founder Sujeet Chakraborty, who the institute's website says has more than 20 years of coaching experience. According to its website it offers weekend offline classes and live online classes for beginner, intermediate and advanced players from about age five, runs inter-academy tournaments and is affiliated to the North 24 Parganas District Chess Association - a convenient option for families in the northern suburbs.",
    },
    { type: "h2", id: "knight-chess-academy", text: "5. The Knight Chess Academy" },
    {
      type: "p",
      text: "The Knight Chess Academy is based in Kasba and was founded by Arpita Das. Its website describes online and offline classes, group and one-to-one, for children aged roughly 5 to 13, with FIDE-certified instructors - a children-focused option for families in the Kasba and south-east Kolkata area.",
    },
    { type: "h2", id: "sunshine-chess-academy", text: "6. Sunshine Chess Academy" },
    {
      type: "p",
      text: "Sunshine Chess Academy runs weekend sessions in Kalighat, near Southern Avenue, led by Abhijit Mondal according to its public listings. It describes programmes from beginner to advanced level along with a children's programme and regular tournaments - a weekend option for south Kolkata families.",
    },
    { type: "h2", id: "academia-of-chess", text: "7. Academia of Chess" },
    {
      type: "p",
      text: "Academia of Chess is a children-focused chess centre in Behala. Its listing describes online coaching and tournaments alongside its classes, with sessions concentrated on Fridays and weekends - an option for families in the Behala area who want a local centre.",
    },
    { type: "h2", id: "how-to-choose", text: "How to choose the right chess academy in Kolkata" },
    {
      type: "ol",
      items: [
        "**Start with the map.** A centre twenty minutes away that your child attends every week beats a famous one an hour away that they miss. If none is close, consider [online vs offline chess classes](/blog/online-vs-offline-chess-classes).",
        "**Match the academy to your child's level.** Some academies are strongest with young beginners, others with competitive juniors.",
        "**Ask to see the syllabus** - what will your child learn in the next two months?",
        "**Book a trial or demo class** and watch how your child responds.",
        "**Ask how progress is shown** - homework, tournaments, reports.",
      ],
    },
    {
      type: "p",
      text: "Our full checklist is in [how to choose a chess coach](/blog/how-to-choose-a-chess-coach), and if your child already plays in a school club, read [school chess club vs chess coaching](/blog/school-chess-club-vs-chess-coaching).",
    },
    { type: "h2", id: "questions", text: "Questions to ask any Kolkata chess academy" },
    {
      type: "ul",
      items: [
        "How many children are in a batch, and are they grouped by level?",
        "Who will actually teach my child, and what are their credentials?",
        "Is there homework, and who checks it?",
        "How often do students play tournaments, inside and outside the academy?",
        "What happens if my child misses a class?",
        "Can my child switch between batches, centres or online classes later?",
      ],
    },
    {
      type: "cta",
      heading: "Visit an Envision centre - or try a class online",
      text: "Book a free demo class at any of our four Kolkata centres or online. A coach assesses your child and recommends the exact session to start from, with no obligation.",
      href: "/register",
      label: "Book a Free Demo Class",
    },
  ],
  faqs: [
    {
      q: "Which are the top chess academies in Kolkata?",
      a: "Well-known options include Envision Chess Academy (four centres plus online classes), the Goodricke National Chess Academy at Gorky Sadan, the Dibyendu Barua Chess Academy, the Kolkata Chess Institute in Birati, The Knight Chess Academy in Kasba, Sunshine Chess Academy in Kalighat and Academia of Chess in Behala. The best one for your child depends on location, age, level and format.",
    },
    {
      q: "Which chess academy in Kolkata offers both online and offline classes?",
      a: "Several do. Envision Chess Academy runs four offline centres in Bowbazar, Haridevpur, Jodhpur Park and New Alipore and live online classes on the same 240-session syllabus, so students can move between formats without starting again.",
    },
    {
      q: "What age can a child join a chess academy in Kolkata?",
      a: "Most academies take children from about five, once they can concentrate for 30-45 minutes. Older beginners are welcome too; a demo or trial class usually decides the starting level.",
    },
    {
      q: "How do I choose between chess academies in Kolkata?",
      a: "Start with location and format, then compare the syllabus, coach credentials, batch size, homework and tournaments. Book a trial class at your shortlisted academies and see which one your child is keen to return to.",
    },
  ],
};

export default post;
