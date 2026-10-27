import type { Metadata } from "next";
import { publicMetadata } from "@/lib/seo";

/**
 * City landing pages for families outside Kolkata.
 *
 * Every class outside Kolkata is live and online, and these pages say so in
 * the first paragraph. They carry no street address, no LocalBusiness schema
 * and no "centre in Mumbai" language, because there is none: Google treats a
 * local listing without a real location as spam, and a parent who goes looking
 * for one stops trusting everything else on the page. Kolkata is deliberately
 * not in this list - `/chess-academy-in-kolkata` owns that city with its four
 * real centres, and a second Kolkata page would compete with it.
 *
 * City pages are also where Google is strictest about "doorway pages": copies
 * that differ only by the city name. So each entry carries its own intro, its
 * own section on the chess scene there, its own reasons, areas and questions,
 * and `cityPages.test.ts` fails if two pages grow too alike. The shared parts -
 * the course ladder, how a class runs, the results - are rendered from the same
 * data every other page uses.
 */

export type CityPageConfig = {
  slug: string;
  /** The name a reader expects in headings: "Bengaluru". */
  city: string;
  /** The other spelling people search with, if any: "Bangalore". */
  altName?: string;
  state: string;
  /** The exact phrase the page targets, used in the H1 and title. */
  keyword: string;
  title: string;
  description: string;
  keywords: string[];
  /** H2 directly under the H1. */
  supportingHeading: string;
  /** The opening paragraphs, unique to the city. */
  intro: string[];
  /** The local chess scene: why chess is worth taking seriously here. */
  scene: { heading: string; paragraphs: string[] };
  /** Why online coaching suits families in this city in particular. */
  reasons: { title: string; detail: string }[];
  /** Neighbourhoods and nearby towns where families learn with us online. */
  areas: string[];
  /** Teaching languages that make sense for this city. */
  languages: string[];
  /** City-specific questions; the shared ones are added by the page. */
  faqs: { q: string; a: string }[];
};

export const cityPages: CityPageConfig[] = [
  {
    slug: "chess-coaching-in-mumbai",
    city: "Mumbai",
    state: "Maharashtra",
    keyword: "best chess coaching in Mumbai",
    title: "Best Online Chess Classes & Coaching in Mumbai | Envision",
    description:
      "Best online chess classes in Mumbai, Thane and Navi Mumbai: live chess coaching for kids, a 240-session syllabus, weekly tournaments and a free demo class.",
    keywords: [
      "best chess coaching in Mumbai",
      "best online chess classes in Mumbai",
      "chess classes in Mumbai",
      "online chess classes in Mumbai",
      "chess coaching for kids in Mumbai",
      "chess classes in Thane",
      "chess classes in Navi Mumbai",
    ],
    supportingHeading: "Live online chess classes for children across Mumbai, Thane and Navi Mumbai - no commute, one structured syllabus.",
    intro: [
      "Finding good chess coaching in Mumbai usually means choosing between the class that is close and the class that is good. With traffic, a one-hour lesson across the city can cost a child two hours of the evening. Envision teaches Mumbai families live and online instead: the same coach, the same published syllabus and the same tournaments, from your own living room in Andheri, Thane or Navi Mumbai.",
      "Every class is live with a coach - never a recording - and follows a fixed 240-session course from the first move to tournament play. A free demo class tells you exactly where your child would start.",
    ],
    scene: {
      heading: "Chess in Mumbai: a city with a full tournament calendar",
      paragraphs: [
        "Mumbai has one of the busiest chess calendars in the country. School and inter-school championships run through the academic year, rated open tournaments are held regularly across the city and its suburbs, and the city's long-running Mayor's Cup international open draws strong players from across India and abroad.",
        "That is good news for a young player: there is always a next event to aim for. It also means the step from playing for fun to playing a rated game comes quickly, and children who have learned the rules, notation and clock handling properly are the ones who enjoy it. Our coaches prepare students for that step - see [how to get a FIDE rating in India](/blog/how-to-get-fide-rating-india).",
        "Mumbai parents also tell us the same thing about the school week: between school, tuition and travel, there is very little time left. That is the strongest argument for doing chess properly rather than casually. Two focused classes a week and a few minutes of puzzles at home build more skill than a long weekend session, and the habits chess trains - sitting with one problem, checking before acting - tend to show up in schoolwork too.",
      ],
    },
    reasons: [
      { title: "No cross-city commute", detail: "Evening traffic can turn a one-hour class into a three-hour outing. Online, your child is at the board two minutes after homework." },
      { title: "Monsoon-proof routine", detail: "Heavy-rain days close roads and schools, but not the online classroom. The weekly rhythm keeps going through July and August." },
      { title: "Coaching in English or Hindi", detail: "Classes are taught in English, and coaches can explain in Hindi too, so younger children are never lost in the language." },
    ],
    areas: ["Andheri", "Bandra", "Borivali", "Powai", "Chembur", "Goregaon", "Malad", "Mira Road", "Thane", "Navi Mumbai"],
    languages: ["English", "Hindi"],
    faqs: [
      {
        q: "Can my child in Mumbai play in tournaments while learning online?",
        a: "Yes. Students play weekly academy tournaments online, and our coaches prepare them for over-the-board events in Mumbai, from school championships to rated opens. You enter those events directly; we help your child get ready for them and review the games afterwards.",
      },
      {
        q: "Do online chess classes work for families in Thane and Navi Mumbai?",
        a: "Exactly the same as anywhere in the city. All your child needs is a laptop or tablet, a stable internet connection and headphones - the class happens in our live online classroom.",
      },
      {
        q: "Is chess worth it alongside school and tuition in Mumbai?",
        a: "For most children, yes - if it is kept to a steady rhythm. Two live classes a week plus ten minutes of puzzles on other days is enough to make real progress without crowding out schoolwork, and online classes save the travel time a local class would take.",
      },
    ],
  },
  {
    slug: "chess-coaching-in-delhi",
    city: "Delhi",
    altName: "New Delhi",
    state: "Delhi",
    keyword: "best chess coaching in Delhi",
    title: "Best Online Chess Classes & Coaching in Delhi | Envision",
    description:
      "Best online chess classes in Delhi, Gurugram and Noida: live chess coaching for kids in English and Hindi, a 240-session syllabus and a free demo class.",
    keywords: [
      "best chess coaching in Delhi",
      "best online chess classes in Delhi",
      "chess classes in Delhi",
      "online chess classes in Delhi",
      "chess coaching in New Delhi",
      "chess classes in Gurgaon",
      "chess classes in Noida",
    ],
    supportingHeading: "Online chess coaching for children in New Delhi, Gurugram, Noida and across the NCR - taught in English and Hindi.",
    intro: [
      "Parents searching for the best chess coaching in Delhi are often looking across the whole NCR - a good coach in South Delhi is a long drive from Noida, and a good one in Gurugram is further still. Envision's classes are live and online, so a child in Dwarka, Noida or Gurugram gets the same coach and the same structured course without anyone sitting in traffic.",
      "Classes are taught in English and Hindi, follow a published 240-session syllabus from the first move to tournament play, and start with a free demo class that places your child at the right session.",
    ],
    scene: {
      heading: "Chess in Delhi and the NCR",
      paragraphs: [
        "The capital has a deep competitive chess culture. Rated open tournaments run in and around Delhi through much of the year, school championships feed into state and national age-group events, and the city has long hosted international open tournaments that bring grandmasters to play alongside club players.",
        "For a child, that means plenty of strong opposition close to home once they are ready for it. Getting ready is the part we focus on: rules, notation and clock handling first, then the tactics that decide most junior games - covered in our guide to [chess tactics for beginners](/blog/chess-tactics-forks-pins-skewers).",
        "Delhi's long summer holidays are a good example of why a fixed online routine helps. When the heat keeps children indoors through May and June, or the family travels, classes and homework carry on from wherever your child is. Many students make their biggest jumps in those weeks, because there is finally time to play practice games and review them properly with the coach.",
      ],
    },
    reasons: [
      { title: "Classes in Hindi as well as English", detail: "Coaches explain in Hindi whenever it helps, which makes a real difference for five- and six-year-olds learning their first rules." },
      { title: "Winter smog and fog days", detail: "When pollution or fog closes schools and keeps children indoors, the online class still happens on schedule." },
      { title: "One coach for the whole NCR", detail: "Delhi, Gurugram, Noida, Ghaziabad or Faridabad - distance stops mattering, so you choose a coach on quality, not postcode." },
    ],
    areas: ["South Delhi", "Dwarka", "Rohini", "Janakpuri", "Vasant Kunj", "Mayur Vihar", "Gurugram", "Noida", "Ghaziabad", "Faridabad"],
    languages: ["English", "Hindi"],
    faqs: [
      {
        q: "Are your chess classes in Delhi taught in Hindi?",
        a: "Classes are taught in English, and our coaches can explain in Hindi as well. Tell us your preference when you book the demo and we will match your child to a suitable coach and batch.",
      },
      {
        q: "Do you teach children in Gurugram and Noida too?",
        a: "Yes. Because every class is live and online, families anywhere in the NCR join the same batches and one-to-one coaching on the same syllabus.",
      },
      {
        q: "Can my child keep taking classes during summer holidays or while we travel?",
        a: "Yes. Classes are online, so your child can join from anywhere with a laptop or tablet and a stable connection. Tell your coach about travel in advance so homework and any one-to-one sessions can be planned around it.",
      },
    ],
  },
  {
    slug: "chess-coaching-in-bangalore",
    city: "Bengaluru",
    altName: "Bangalore",
    state: "Karnataka",
    keyword: "best chess coaching in Bangalore",
    title: "Best Online Chess Classes & Coaching in Bangalore | Envision",
    description:
      "Best online chess classes in Bengaluru (Bangalore): live chess coaching for kids on a 240-session syllabus, weekly tournaments and a free demo class.",
    keywords: [
      "best chess coaching in Bangalore",
      "best online chess classes in Bangalore",
      "chess classes in Bangalore",
      "chess coaching in Bengaluru",
      "online chess classes in Bangalore",
      "chess classes for kids in Bangalore",
      "chess classes in Whitefield",
    ],
    supportingHeading: "Live online chess classes for children across Bengaluru - from Whitefield to JP Nagar, without the traffic.",
    intro: [
      "Ask any Bengaluru parent what limits after-school activities and the answer is usually the same: the traffic. A chess class across the city can take longer to reach than it lasts. Envision's chess coaching in Bangalore is live and online, so your child gets a structured course and a coach who knows their games, whether you live in Whitefield, Electronic City or Hebbal.",
      "The syllabus is published session by session - 240 sessions across five stages - and every new student begins with a free demo class and a level recommendation.",
    ],
    scene: {
      heading: "Chess in Bengaluru: a fast-growing junior scene",
      paragraphs: [
        "Bengaluru's junior chess scene has grown quickly, helped by a large community of families who already value logic and problem-solving. Weekend rapid tournaments, school events and rated opens are a regular part of the city's calendar, and many children start competing within their first year of serious study.",
        "Parents here often ask how chess fits beside coding classes, music and sport. Our answer is consistency over volume: two focused classes a week, ten minutes of puzzles on other days. Our guide on [how online chess classes work](/blog/how-online-chess-classes-work) explains the rhythm.",
        "Bengaluru is also a city families move to and from for work, and that is where online coaching quietly matters most. A child who starts with us in Whitefield can keep the same coach, the same level and the same classmates after a move to another city - or another country - without starting again with a new teacher who has to work out what they already know.",
      ],
    },
    reasons: [
      { title: "Time back from the traffic", detail: "Online classes turn a long evening drive into a short walk to the laptop - often the difference between a child keeping up chess or dropping it." },
      { title: "Fits around working parents", detail: "Group batches run at fixed times, and one-to-one coaching can be scheduled around shifting work and school weeks." },
      { title: "A clear, measurable plan", detail: "Parents see attendance, homework scores and tournament results in the portal - no guessing whether the classes are working." },
    ],
    areas: ["Whitefield", "Koramangala", "HSR Layout", "Indiranagar", "Electronic City", "Hebbal", "JP Nagar", "Jayanagar", "Sarjapur Road", "Yelahanka"],
    languages: ["English", "Hindi"],
    faqs: [
      {
        q: "Are classes taught in Kannada?",
        a: "Not at the moment. Classes are taught in English, with Hindi explanations available. Chess itself needs surprisingly little language once the rules are learned, and our coaches use the board to show rather than tell.",
      },
      {
        q: "Can chess fit around my child's other activities in Bangalore?",
        a: "Usually, yes. Two classes a week plus short practice on other days is the rhythm we recommend. If group batch timings clash with other activities, one-to-one coaching can be scheduled around them.",
      },
      {
        q: "What happens to my child's classes if we move out of Bangalore?",
        a: "Nothing changes. Because classes are online, your child keeps the same coach, level and syllabus wherever you move. Only the class time may need adjusting if you move to a different time zone.",
      },
    ],
  },
  {
    slug: "chess-coaching-in-hyderabad",
    city: "Hyderabad",
    state: "Telangana",
    keyword: "best chess coaching in Hyderabad",
    title: "Best Online Chess Classes & Coaching in Hyderabad | Envision",
    description:
      "Best online chess classes in Hyderabad and Secunderabad: live chess coaching for kids in English and Hindi, weekly tournaments and a free demo class.",
    keywords: [
      "best chess coaching in Hyderabad",
      "best online chess classes in Hyderabad",
      "chess classes in Hyderabad",
      "online chess classes in Hyderabad",
      "chess coaching for kids in Hyderabad",
      "chess classes in Secunderabad",
      "chess classes in Gachibowli",
    ],
    supportingHeading: "Live online chess classes for children in Hyderabad and Secunderabad, from Gachibowli to Kukatpally.",
    intro: [
      "Telangana has become one of India's strongest chess regions, and more Hyderabad parents than ever are looking for coaching that goes beyond a weekly hobby class. Envision offers that as live online coaching: a published syllabus, a coach who follows your child's progress, and weekly tournaments, without a drive across Hyderabad after school.",
      "Classes are taught in English and Hindi. Every student starts with a free demo class, which ends in a recommendation of the exact session to begin from.",
    ],
    scene: {
      heading: "Chess in Hyderabad and Telangana",
      paragraphs: [
        "Telangana's rise in chess has been hard to miss. Arjun Erigaisi, from Warangal, became one of the world's top-ranked players, and his success has pushed interest in junior chess across the state. Hyderabad's own calendar of school events and rated tournaments has grown alongside it, and the city's schools increasingly run chess clubs and inter-school competitions of their own. For a child, the result is more chances to play - and more reason to learn the game properly before the first serious tournament.",
        "A strong local scene raises the bar for young players: opponents in age-group events are better prepared than they were a few years ago. Structured training is what keeps a child competitive - starting with the fundamentals in our [Beginner Chess Course](/beginner-chess-course) and moving into tactics in the [Intermediate Chess Course](/intermediate-chess-course).",
        "Many Hyderabad children first meet chess through a school club or a summer camp, and the question for parents is what comes next. A club teaches the moves; a course teaches the game. Our ladder starts wherever the demo class shows your child is - so a child who already plays at school starts from tactics, not from how the knight moves.",
      ],
    },
    reasons: [
      { title: "No cross-city drive", detail: "From the HITEC City side to Secunderabad is a long evening journey. Online, the class starts where your child already is." },
      { title: "English and Hindi teaching", detail: "Coaches teach in English and explain in Hindi whenever it helps a young child follow along." },
      { title: "Training for a competitive state", detail: "Homework, game reviews and weekly tournaments prepare students for the stronger fields Telangana's age-group events now attract." },
    ],
    areas: ["Gachibowli", "HITEC City", "Madhapur", "Kondapur", "Kukatpally", "Miyapur", "Banjara Hills", "Jubilee Hills", "Secunderabad", "LB Nagar"],
    languages: ["English", "Hindi"],
    faqs: [
      {
        q: "Are classes available in Telugu?",
        a: "Not at the moment. Classes are taught in English, and coaches can explain in Hindi. Most children follow comfortably, because the coach shows every idea on the board.",
      },
      {
        q: "Will online coaching prepare my child for tournaments in Hyderabad?",
        a: "Yes. Students play weekly academy tournaments and are prepared for over-the-board events - clock handling, notation and opening preparation included - with games reviewed by the coach afterwards.",
      },
      {
        q: "Do you offer one-to-one chess coaching for students in Hyderabad?",
        a: "Yes. Students can join a group batch or take one-to-one coaching on the same syllabus. One-to-one suits children preparing seriously for tournaments or with schedules that do not fit a batch; the demo class helps you decide.",
      },
    ],
  },
  {
    slug: "chess-coaching-in-chennai",
    city: "Chennai",
    state: "Tamil Nadu",
    keyword: "best chess coaching in Chennai",
    title: "Best Online Chess Classes & Coaching in Chennai | Envision",
    description:
      "Best online chess classes in Chennai, India's chess capital: live chess coaching for kids, a 240-session syllabus, weekly tournaments and a free demo.",
    keywords: [
      "best chess coaching in Chennai",
      "best online chess classes in Chennai",
      "chess classes in Chennai",
      "online chess classes in Chennai",
      "chess academy in Chennai",
      "chess coaching for kids in Chennai",
      "chess classes in Anna Nagar",
    ],
    supportingHeading: "Structured online chess coaching for children in India's chess capital - from Anna Nagar to OMR.",
    intro: [
      "Chennai is the city that made India a chess nation, and families here know what serious chess coaching looks like. Envision offers it online: live classes with a coach, a published 240-session syllabus that runs from the first move to tournament play, and weekly tournaments - without adding another drive to your child's week.",
      "Every new student begins with a free demo class. A coach assesses your child and recommends the exact session to start from, so a child who already plays never repeats the basics.",
    ],
    scene: {
      heading: "Chess in Chennai, India's chess capital",
      paragraphs: [
        "Viswanathan Anand, India's first grandmaster and a five-time world champion, grew up in Chennai. A generation later, Chennai's D Gukesh became world champion in 2024, and R Praggnanandhaa is among the world's elite. Tamil Nadu has produced more grandmasters than any other Indian state, and in 2022 it hosted the 44th Chess Olympiad at Mamallapuram, just outside the city.",
        "That history makes junior chess in Chennai unusually competitive. Children meet well-prepared opponents early, so the basics have to be solid - piece play, checkmating technique and the tactics covered in our [guide to chess tactics](/blog/chess-tactics-forks-pins-skewers) - before tournament results follow.",
        "Some Chennai families come to us while their child already works with a local coach or attends a school chess programme. That can work well. Our syllabus is explicit about what is taught in every session, so it is easy to see where a child's gaps are - and the online format fits around other chess activity rather than replacing it.",
      ],
    },
    reasons: [
      { title: "Serious training, at home", detail: "The structure Chennai families expect - levels, homework, game review and tournaments - delivered live online, with no commute." },
      { title: "Ready for competitive fields", detail: "Junior events in Chennai are strong. Our ladder builds the tactics, endgames and openings needed to hold up in them." },
      { title: "A plan you can check", detail: "Attendance, homework scores and results are visible in the parent portal, so progress is measured, not assumed." },
    ],
    areas: ["Anna Nagar", "Adyar", "Velachery", "T Nagar", "Mylapore", "OMR", "Porur", "Tambaram", "Chromepet", "Ambattur"],
    languages: ["English", "Hindi"],
    faqs: [
      {
        q: "Are classes available in Tamil?",
        a: "Not at the moment. Classes are taught in English, with Hindi explanations available. Chess is a very visual subject, and our coaches demonstrate every idea on the board.",
      },
      {
        q: "Is online coaching enough for a child who wants to compete in Chennai?",
        a: "It is how many strong players train today. Online classes cover the teaching, homework and game review; your child gains over-the-board experience by playing local events, which we help them prepare for.",
      },
      {
        q: "My child already plays at a local club in Chennai. Can they still join?",
        a: "Yes. The demo class shows exactly where your child stands, and they start at that point in the syllabus rather than at the beginning. Many students combine our structured online classes with local over-the-board play.",
      },
    ],
  },
  {
    slug: "chess-coaching-in-pune",
    city: "Pune",
    state: "Maharashtra",
    keyword: "best chess coaching in Pune",
    title: "Best Online Chess Classes & Coaching in Pune | Envision",
    description:
      "Best online chess classes in Pune and Pimpri-Chinchwad: live chess coaching for kids in English and Hindi, a 240-session syllabus and a free demo class.",
    keywords: [
      "best chess coaching in Pune",
      "best online chess classes in Pune",
      "chess classes in Pune",
      "online chess classes in Pune",
      "chess coaching for kids in Pune",
      "chess classes in Pimpri Chinchwad",
      "chess classes in Baner",
    ],
    supportingHeading: "Online chess coaching for children across Pune and Pimpri-Chinchwad - one syllabus, one coach, no commute.",
    intro: [
      "Pune families tend to take education seriously, and chess is no exception: parents want to see a plan, not just a weekly game. Envision's online chess coaching in Pune gives you one - a published 240-session syllabus, two live classes a week with a coach, homework that gets checked, and weekly tournaments, all from home in Kothrud, Baner or Hinjewadi.",
      "Classes are taught in English and Hindi, and every child starts with a free demo class that ends in a level recommendation.",
    ],
    scene: {
      heading: "Chess in Pune",
      paragraphs: [
        "Pune has a long chess tradition within Maharashtra and an active circuit of school, district and rated tournaments. With so many schools and colleges in the city, children often meet chess through school events first - and the ones who enjoy it look for proper coaching next. Families across the city, from the older neighbourhoods around Kothrud to the IT corridors of Hinjewadi and Kharadi, tell us the same thing: they want a plan they can follow, with progress they can see, rather than an open-ended weekly hobby.",
        "That is the right moment to build foundations properly: how the pieces move, the full rules and checkmating technique, covered in our guides to [how chess pieces move](/blog/how-chess-pieces-move) and [how to checkmate](/blog/how-to-checkmate-basic-mates).",
        "Pune's school year has its share of exam weeks, project deadlines and holidays, and chess has to fit around them. What helps is a syllabus that does not depend on the calendar: each child is placed by level and works through it in order, so a lighter fortnight during exams does not mean falling behind a fixed class plan. Ten minutes of puzzles on a busy day keeps the habit alive.",
      ],
    },
    reasons: [
      { title: "No drive across town", detail: "Hinjewadi to Kharadi, or Pimpri to Hadapsar - online, distance stops deciding which coach your child can have." },
      { title: "English and Hindi", detail: "Coaches teach in English and explain in Hindi when it helps younger children." },
      { title: "A visible plan", detail: "Pune parents like to see progress. The portal shows attendance, homework scores, coach feedback and tournament results." },
    ],
    areas: ["Kothrud", "Baner", "Aundh", "Hinjewadi", "Wakad", "Kharadi", "Viman Nagar", "Hadapsar", "Pimpri-Chinchwad", "Magarpatta"],
    languages: ["English", "Hindi"],
    faqs: [
      {
        q: "Are classes available in Marathi?",
        a: "Not at the moment. Classes are taught in English, and coaches can explain in Hindi. Children usually follow easily, because every idea is shown on the board.",
      },
      {
        q: "Can students in Pimpri-Chinchwad join?",
        a: "Yes. Classes are live and online, so families anywhere in Pune and Pimpri-Chinchwad join the same batches on the same syllabus.",
      },
      {
        q: "How do chess classes fit around school exams in Pune?",
        a: "Talk to us before exam weeks. Many families keep classes going with lighter homework, and one-to-one sessions can be moved. Because each child works through the syllabus by level, a quieter fortnight does not undo their progress.",
      },
    ],
  },
  {
    slug: "chess-coaching-in-ahmedabad",
    city: "Ahmedabad",
    state: "Gujarat",
    keyword: "best chess coaching in Ahmedabad",
    title: "Best Online Chess Classes & Coaching in Ahmedabad | Envision",
    description:
      "Best online chess classes in Ahmedabad and Gandhinagar: live chess coaching for kids in English and Hindi, weekly tournaments and a free demo class.",
    keywords: [
      "best chess coaching in Ahmedabad",
      "best online chess classes in Ahmedabad",
      "chess classes in Ahmedabad",
      "online chess classes in Ahmedabad",
      "chess coaching for kids in Ahmedabad",
      "chess classes in Gandhinagar",
      "chess classes in Gujarat",
    ],
    supportingHeading: "Live online chess classes for children in Ahmedabad and Gandhinagar, taught in English and Hindi.",
    intro: [
      "Good chess coaching in Ahmedabad is not always easy to find close to home, and parents often end up choosing whatever class is nearest rather than whatever is best. Envision removes that trade-off: our classes are live and online, so a child in Satellite, Bopal or Gandhinagar gets a structured course, a coach who follows their progress and weekly tournaments.",
      "Classes are taught in English and Hindi. Every new student starts with a free demo class and a recommendation of exactly where to begin.",
    ],
    scene: {
      heading: "Chess in Ahmedabad and Gujarat",
      paragraphs: [
        "Chess in Gujarat has grown steadily, with district selections, state age-group championships and rated tournaments giving young players a clear competitive path. Envision students already compete in the state - one placed second in a Surat district selection for the state championship - and families from across Gujarat learn with us online. For an Ahmedabad child, that competitive path usually starts with district events, so the first goal is simple: play complete games confidently, write the moves down and handle a clock without nerves.",
        "The path from district events to state and national age-group championships rewards children who start with solid foundations. Our [Beginner Chess Course](/beginner-chess-course) builds them, and the tournament route is explained in [how to get a FIDE rating in India](/blog/how-to-get-fide-rating-india).",
        "Families in Gandhinagar and the newer parts of Ahmedabad often have the fewest local options of all, which is exactly where online classes help most. Your child learns in the same live classroom as students across India, plays in the same weekly tournaments and is reviewed by the same coaches - the address simply stops mattering.",
      ],
    },
    reasons: [
      { title: "The best coach, not the nearest", detail: "Online classes mean distance no longer decides which coach your child learns from." },
      { title: "English and Hindi teaching", detail: "Coaches teach in English and explain in Hindi, which helps younger children settle into the rules quickly." },
      { title: "A route into competition", detail: "Weekly academy tournaments and coach preparation get children ready for district and state events in Gujarat." },
    ],
    areas: ["Satellite", "Bopal", "Prahlad Nagar", "Vastrapur", "Navrangpura", "Thaltej", "Maninagar", "Chandkheda", "Gota", "Gandhinagar"],
    languages: ["English", "Hindi"],
    faqs: [
      {
        q: "Are classes available in Gujarati?",
        a: "Not at the moment. Classes are taught in English, and coaches can explain in Hindi. Because chess is taught on the board, most children follow comfortably from the first class.",
      },
      {
        q: "Do your students play tournaments in Gujarat?",
        a: "Yes. Envision students compete in Gujarat, including district selections for the state championship. Coaches prepare students for these events and review their games afterwards.",
      },
      {
        q: "Is online chess coaching suitable for young children in Ahmedabad?",
        a: "Yes, for most children from about five upwards who can concentrate for 30-45 minutes. A parent nearby for the first few classes helps the youngest settle in, and the coach keeps lessons interactive, with children moving pieces themselves.",
      },
    ],
  },
];

export const cityHref = (slug: string) => `/${slug}`;

export function getCityPage(slug: string) {
  const config = cityPages.find((page) => page.slug === slug);
  if (!config) throw new Error(`No city page configured for "${slug}"`);
  return config;
}

/** The city name as searched, "Bengaluru (Bangalore)", for headings that should carry both. */
export function cityDisplayName(config: CityPageConfig) {
  return config.altName && config.altName !== config.city ? `${config.city} (${config.altName})` : config.city;
}

/**
 * The second phrase every city page targets. "Best chess coaching in Mumbai"
 * and "best online chess classes in Mumbai" are the same need in different
 * words, so one page owns both - a second page per city would only compete
 * with the first. Derived from `keyword` so the city spelling always matches.
 */
export function classesKeyword(config: CityPageConfig) {
  return config.keyword.replace(/^best chess coaching in/, "best online chess classes in");
}

export function cityMetadata(config: CityPageConfig): Metadata {
  return publicMetadata({
    path: cityHref(config.slug),
    title: config.title,
    description: config.description,
    keywords: config.keywords,
    imageAlt: `Envision Chess Academy student with a tournament trophy - ${config.keyword}`,
  });
}

/**
 * Questions every city page answers, worded for that city. The honest answer
 * to "is there a centre here" comes first: it is the question a parent who
 * found the page through a local search is most likely to have.
 */
export function cityFaqs(config: CityPageConfig) {
  const name = config.city;
  return [
    {
      q: `Is there an Envision chess centre in ${name}?`,
      a: `No. Families in ${name} learn with us through live online classes, taught by the same coaches and on the same syllabus as our four offline centres in Kolkata. Every class is live with a coach - never a recording.`,
    },
    ...config.faqs,
    {
      q: `What makes these the best online chess classes in ${name}?`,
      a: `Structure you can check. Every class is live with a coach, the full ${name} course follows a published 240-session syllabus from the first move to Masters, homework is reviewed by the coach, students play weekly tournaments, and parents see attendance, scores and results in one portal. A free demo class lets you judge it for yourself before paying anything.`,
    },
    {
      q: `What age can children start chess coaching in ${name}?`,
      a: "Most children are ready for structured classes between five and seven, once they can concentrate for 30-45 minutes. Older beginners are welcome too - the demo class places every child at the right point in the syllabus.",
    },
    {
      q: "What times are the online classes?",
      a: "Group batches run at fixed times on Indian Standard Time, and one-to-one coaching can be scheduled around your child's week. Available slots are confirmed when you book the free demo class.",
    },
    {
      q: `How do I book a free demo chess class in ${name}?`,
      a: "Register on the site and choose a slot. The demo is a real assessment with a coach, it is free and carries no obligation, and it ends with a level recommendation for your child.",
    },
  ];
}
