import type { Metadata } from "next";
import { MARKETING_BASE_URL } from "@/lib/publicLinks";

/**
 * The offline side of the academy: one Kolkata hub page and a page per centre.
 *
 * The hub at `/chess-academy-in-kolkata` owns the city-wide phrases - "chess
 * academy in Kolkata", "chess coaching in Kolkata", "chess classes in Kolkata" -
 * and each centre page under it owns its own locality, so the five pages do not
 * compete for the same query. That mirrors how `coursePages` splits the online
 * ladder, except the centres are real URL children of the hub: a parent picks a
 * city first and a branch second, and the breadcrumbs say so.
 *
 * Only the words and the branch facts live here. Everything a crawler is told -
 * the opening hours, the postal address, the phone number - is derived from
 * this one list, so the page, the schema and the footer can never disagree
 * about when a centre actually teaches.
 */

const OG_IMAGE_PATH = "/images/achievements/682626726_122217430778279433_7786835792267057544_n.jpg";

function socialImage(alt: string) {
  return [{ url: OG_IMAGE_PATH, width: 1200, height: 900, alt }];
}

export const CENTRE_HUB_SLUG = "chess-academy-in-kolkata";

/** A single batch slot, stored in 24h so `openingHoursSpecification` is real. */
export type CentreSlot = {
  from: string;
  to: string;
  /** Shown beside the time, e.g. "Special batch". */
  note?: string;
};

export type CentreDay = {
  /** Full English day name - also what schema.org's dayOfWeek expects. */
  day: string;
  slots: CentreSlot[];
};

export type CentreConfig = {
  slug: string;
  /** The locality on its own, used in headings, cards and the footer. */
  name: string;
  /** Where in the city it sits, for the one-line description. */
  area: string;
  /** The exact phrase this page targets. */
  keyword: string;
  h1: string;
  supportingHeading: string;
  title: string;
  description: string;
  keywords: string[];
  intro: string;
  streetAddress: string;
  postalCode: string;
  /** One-line address, used for the map embed and the footer. */
  address: string;
  /** The centre's own Google listing, for directions. */
  mapsUrl: string;
  phone: string;
  phoneDisplay: string;
  /** Who picks up that phone. */
  contactName: string;
  contactRole: string;
  coachName: string;
  coachCredential: string;
  coachBio: string;
  schedule: CentreDay[];
  programmes: string[];
  /** Neighbouring localities this centre is a realistic commute from. */
  nearby: string[];
  /** Anything running at this centre only. */
  offer?: string;
  faqs: { q: string; a: string }[];
};

export const kolkataCentres: CentreConfig[] = [
  {
    slug: "bowbazar",
    name: "Bowbazar",
    area: "central Kolkata",
    keyword: "chess academy in Bowbazar",
    h1: "Chess Academy in Bowbazar",
    supportingHeading: "Offline chess classes in Bowbazar, central Kolkata, under National Instructor Sayantan Chandra.",
    title: "Chess Academy in Bowbazar, Kolkata | Envision",
    description:
      "Chess academy in Bowbazar, Kolkata. Offline chess classes six days a week under a FIDE-certified National Instructor, with group and one-to-one coaching and tournament preparation.",
    keywords: [
      "chess academy in Bowbazar",
      "chess classes in Bowbazar",
      "chess coaching in Bowbazar",
      "chess academy in central Kolkata",
      "chess classes near Sealdah",
      "chess classes near College Street",
      "chess coaching centre in Kolkata",
      "chess classes for kids in Kolkata",
      "chess academy near me",
    ],
    intro:
      "The academy's central Kolkata centre and its registered address, running batches six days a week. Beginners start from the board itself; competitive players prepare for district, state and national events in the same room.",
    streetAddress: "20, Dr Jagabandhu Lane",
    postalCode: "700012",
    address: "20, Dr Jagabandhu Lane, Bowbazar, Kolkata 700012",
    mapsUrl: "https://share.google/ncGhaUNbJpaK21fXp",
    phone: "+916290349998",
    phoneDisplay: "+91 62903 49998",
    contactName: "Sayantan Chandra",
    contactRole: "Coach and centre in-charge",
    coachName: "National Instructor Sayantan Chandra",
    coachCredential: "FIDE-certified National Instructor",
    coachBio:
      "A FIDE-certified National Instructor with 20+ years playing the game and 5+ years coaching it, teaching everything from a child's first legal game to tournament preparation for rated players.",
    schedule: [
      { day: "Tuesday", slots: [{ from: "18:00", to: "19:00" }, { from: "19:00", to: "20:30" }] },
      { day: "Wednesday", slots: [{ from: "17:00", to: "18:00" }, { from: "18:00", to: "19:00" }, { from: "19:00", to: "20:00" }] },
      { day: "Thursday", slots: [{ from: "18:00", to: "19:00" }, { from: "19:00", to: "20:30" }] },
      {
        day: "Saturday",
        slots: [
          { from: "10:00", to: "11:00" },
          { from: "11:00", to: "12:00" },
          { from: "12:00", to: "13:00" },
          { from: "16:00", to: "17:00" },
          { from: "17:00", to: "18:00" },
        ],
      },
      { day: "Sunday", slots: [{ from: "10:00", to: "11:00" }, { from: "11:00", to: "12:00" }, { from: "12:00", to: "13:00" }] },
    ],
    programmes: [
      "One-on-one coaching",
      "Interactive group coaching",
      "Online classes",
      "Handouts and assignments",
      "Tournament preparation for district, state and national events",
    ],
    nearby: ["Sealdah", "College Street", "Chandni Chowk", "Esplanade", "Muhammad Ali Park", "Bara Bazar"],
    faqs: [
      {
        q: "Where is the Bowbazar chess academy located?",
        a: "At 20, Dr Jagabandhu Lane, Bowbazar, Kolkata 700012 - also the academy's registered address. It is a short trip from Sealdah, College Street, Chandni Chowk and Esplanade, so families across central Kolkata can reach it on a weekday evening.",
      },
      {
        q: "Which days do chess classes run in Bowbazar?",
        a: "Tuesday, Wednesday and Thursday evenings, and Saturday and Sunday through the day. Weekday batches start from 5:00 PM and weekend batches from 10:00 AM, so a batch can be matched to school hours.",
      },
      {
        q: "Who teaches at the Bowbazar centre?",
        a: "National Instructor Sayantan Chandra, a FIDE-certified coach with 20+ years of playing experience and 5+ years of coaching, teaches at this centre.",
      },
      {
        q: "Do you prepare students for rated chess tournaments in Kolkata?",
        a: "Yes. Tournament preparation for district, state and national level events is part of the coaching at this centre, alongside weekly academy tournaments inside the student portal.",
      },
      {
        q: "Can a complete beginner join the Bowbazar chess classes?",
        a: "Yes. The beginner stage starts from the board, the pieces and notation, so a child who has never played a full game can start there. A free demo class decides the exact session to begin from.",
      },
    ],
  },
  {
    slug: "haridevpur",
    name: "Haridevpur",
    area: "south-west Kolkata",
    keyword: "chess academy in Haridevpur",
    h1: "Chess Academy in Haridevpur",
    supportingHeading: "Offline chess classes in Haridevpur under FIDE Instructor Sayan Bose.",
    title: "Chess Academy in Haridevpur, Kolkata | Envision",
    description:
      "Chess academy in Haridevpur, Kolkata, under FIDE Instructor Sayan Bose. Offline chess classes on Monday, Thursday, Saturday and Sunday, with a special weekend batch and tournament preparation.",
    keywords: [
      "chess academy in Haridevpur",
      "chess classes in Haridevpur",
      "chess coaching in Haridevpur",
      "chess classes near Behala",
      "chess coaching in Thakurpukur",
      "chess classes in south Kolkata",
      "FIDE chess coaching in Kolkata",
      "chess classes for kids in Kolkata",
      "chess academy near me",
    ],
    intro:
      "The academy's largest offline schedule, taught under a FIDE Instructor who has trained International Masters, Grandmasters and Asian-level champions. Batches run on two weekday evenings and right through the weekend.",
    streetAddress: "403B, Mahatma Gandhi Road",
    postalCode: "700082",
    address: "403B, Mahatma Gandhi Road, Haridevpur, Kolkata 700082",
    mapsUrl: "https://share.google/t06OYA30z5VE33Bci",
    phone: "+919804470707",
    phoneDisplay: "+91 98044 70707",
    contactName: "Sayan Bose",
    contactRole: "Coach and centre in-charge",
    coachName: "FIDE Instructor Sayan Bose",
    coachCredential: "FIDE Instructor, 12+ years of coaching",
    coachBio:
      "A FIDE Instructor with 12+ years of coaching experience who has trained International Masters, Grandmasters and Asian-level champions, and still teaches the beginner batches at this centre himself.",
    schedule: [
      { day: "Monday", slots: [{ from: "17:00", to: "18:00" }, { from: "18:00", to: "19:00" }, { from: "19:00", to: "20:00" }] },
      { day: "Thursday", slots: [{ from: "17:00", to: "18:00" }, { from: "18:00", to: "19:00" }, { from: "19:00", to: "20:00" }] },
      {
        day: "Saturday",
        slots: [
          { from: "10:30", to: "12:30", note: "Special batch" },
          { from: "14:00", to: "15:00" },
          { from: "15:00", to: "16:00" },
          { from: "16:00", to: "17:00" },
          { from: "17:00", to: "18:00" },
        ],
      },
      {
        day: "Sunday",
        slots: [
          { from: "14:00", to: "15:00" },
          { from: "15:00", to: "16:00" },
          { from: "16:00", to: "17:00" },
          { from: "17:00", to: "18:00" },
        ],
      },
    ],
    programmes: [
      "One-on-one coaching",
      "Interactive group coaching",
      "Online classes",
      "Practice sessions",
      "Tournament preparation",
    ],
    nearby: ["Behala", "Thakurpukur", "Barisha", "Sarsuna", "Parnasree", "Tollygunge"],
    faqs: [
      {
        q: "Where is the Haridevpur chess academy located?",
        a: "At 403B, Mahatma Gandhi Road, Haridevpur, Kolkata 700082. It is the nearest Envision centre for families in Behala, Thakurpukur, Barisha, Sarsuna and Parnasree.",
      },
      {
        q: "Which days do chess classes run in Haridevpur?",
        a: "Monday and Thursday evenings from 5:00 PM, Saturday from 10:30 AM and Sunday afternoons. Saturday also carries a longer special batch from 10:30 AM to 12:30 PM.",
      },
      {
        q: "Who teaches at the Haridevpur centre?",
        a: "FIDE Instructor Sayan Bose, who has 12+ years of coaching experience and has trained International Masters, Grandmasters and Asian-level champions.",
      },
      {
        q: "Is there a chess academy near Behala?",
        a: "Yes. The Haridevpur centre is the closest Envision centre to Behala, and the New Alipore centre is the next nearest for families on the Diamond Harbour Road side.",
      },
      {
        q: "What is the Saturday special batch?",
        a: "A longer two-hour session from 10:30 AM to 12:30 PM, used for deeper work than a one-hour batch allows - analysis, longer games and tournament preparation.",
      },
    ],
  },
  {
    slug: "jodhpur-park",
    name: "Jodhpur Park",
    area: "south Kolkata",
    keyword: "chess academy in Jodhpur Park",
    h1: "Chess Academy in Jodhpur Park",
    supportingHeading: "Weekend chess classes in Jodhpur Park, south Kolkata, with FIDE-rated coaches.",
    title: "Chess Academy in Jodhpur Park, Kolkata | Envision",
    description:
      "Chess academy in Jodhpur Park, Kolkata. Weekend chess classes on Saturday and Sunday morning with FIDE-rated coaches, group and one-to-one coaching and tournament preparation.",
    keywords: [
      "chess academy in Jodhpur Park",
      "chess classes in Jodhpur Park",
      "chess coaching in Jodhpur Park",
      "chess classes in south Kolkata",
      "chess classes near Gariahat",
      "chess coaching near Jadavpur",
      "weekend chess classes in Kolkata",
      "chess classes for kids in Kolkata",
      "chess academy near me",
    ],
    intro:
      "A weekend-only centre for south Kolkata, built around families whose weekday evenings are already full. One morning batch on Saturday and one on Sunday, taught by FIDE-rated coaches.",
    streetAddress: "1D, Jodhpur Park",
    postalCode: "700068",
    address: "1D, Jodhpur Park, Kolkata 700068",
    mapsUrl: "https://share.google/9Gs3oGljZs1dtiiId",
    phone: "+919831248613",
    phoneDisplay: "+91 98312 48613",
    contactName: "Priyanka Dey",
    contactRole: "Centre in-charge",
    coachName: "FIDE-rated coaches",
    coachCredential: "FIDE-rated",
    coachBio:
      "Taught by FIDE-rated coaches who are experienced with young beginners - interactive sessions, patient explanation and a batch size small enough for every child to be corrected by name.",
    schedule: [
      { day: "Saturday", slots: [{ from: "10:30", to: "12:00" }] },
      { day: "Sunday", slots: [{ from: "10:30", to: "12:00" }] },
    ],
    programmes: [
      "One-on-one coaching",
      "Interactive group coaching",
      "Online classes",
      "Extra practice sessions",
      "Tournament preparation",
    ],
    nearby: ["Gariahat", "Dhakuria", "Lake Gardens", "Golf Green", "Jadavpur", "Kasba"],
    offer: "Students enrolling now receive a free welcome kit - a chess board and pieces - on admission.",
    faqs: [
      {
        q: "Where is the Jodhpur Park chess academy located?",
        a: "At 1D, Jodhpur Park, Kolkata 700068, an easy trip for families in Gariahat, Dhakuria, Lake Gardens, Golf Green, Jadavpur and Kasba.",
      },
      {
        q: "When do chess classes run in Jodhpur Park?",
        a: "Saturday and Sunday, 10:30 AM to 12:00 PM. It is a weekend centre, so a child can train without giving up a school evening.",
      },
      {
        q: "Are the Jodhpur Park coaches FIDE rated?",
        a: "Yes. The centre is taught by FIDE-rated coaches who are experienced with young beginners and keep the sessions interactive.",
      },
      {
        q: "Is there a welcome kit for new students?",
        a: "Yes. Students enrolling at this centre now receive a free welcome kit - a chess board and pieces - on admission.",
      },
      {
        q: "Can my child train on weekdays as well?",
        a: "Yes. Weekend students at this centre can add live online batches on weekdays, on the same syllabus and with the same homework and progress tracking.",
      },
    ],
  },
  {
    slug: "new-alipore",
    name: "New Alipore",
    area: "south Kolkata",
    keyword: "chess academy in New Alipore",
    h1: "Chess Academy in New Alipore",
    supportingHeading: "Chess classes in New Alipore for beginners, with a FIDE-rated coach.",
    title: "Chess Academy in New Alipore, Kolkata | Envision",
    description:
      "Chess academy in New Alipore, Kolkata. Chess classes on Tuesday, Saturday and Sunday with a FIDE-rated coach, small batches and a beginner-friendly start.",
    keywords: [
      "chess academy in New Alipore",
      "chess classes in New Alipore",
      "chess coaching in New Alipore",
      "chess classes near Alipore",
      "chess coaching near Behala",
      "chess classes near Tollygunge",
      "beginner chess classes in Kolkata",
      "chess classes for kids in Kolkata",
      "chess academy near me",
    ],
    intro:
      "A small, beginner-friendly centre for south Kolkata, with one weekday evening and two weekend batches. The coach is FIDE-rated and known for getting first-time players comfortable quickly.",
    streetAddress: "2/1, Shyama Charan Smriti Tirtha Road",
    postalCode: "700053",
    address: "2/1, Shyama Charan Smriti Tirtha Road, New Alipore, Kolkata 700053",
    mapsUrl: "https://share.google/A2Cv0qDKN5uazNx6x",
    phone: "+919903855007",
    phoneDisplay: "+91 99038 55007",
    contactName: "Gayitri Ma'am",
    contactRole: "Centre in-charge",
    coachName: "FIDE-rated coach",
    coachCredential: "FIDE-rated",
    coachBio:
      "A FIDE-rated coach who is friendly and effective with children, which makes this the easiest centre to start at if your child has never been taught chess properly before.",
    schedule: [
      { day: "Tuesday", slots: [{ from: "17:00", to: "18:00" }, { from: "18:00", to: "19:00" }] },
      { day: "Saturday", slots: [{ from: "16:00", to: "17:00" }, { from: "17:00", to: "18:00" }] },
      { day: "Sunday", slots: [{ from: "10:00", to: "11:00" }] },
    ],
    programmes: [
      "One-on-one coaching",
      "Interactive group coaching",
      "Online classes",
      "Tournament preparation",
    ],
    nearby: ["Alipore", "Chetla", "Behala", "Tollygunge", "Taratala", "Sakher Bazar"],
    faqs: [
      {
        q: "Where is the New Alipore chess academy located?",
        a: "At 2/1, Shyama Charan Smriti Tirtha Road, New Alipore, Kolkata 700053, within reach of Alipore, Chetla, Behala, Tollygunge and Taratala.",
      },
      {
        q: "When do chess classes run in New Alipore?",
        a: "Tuesday evenings from 5:00 PM, Saturday afternoons from 4:00 PM and Sunday mornings from 10:00 AM.",
      },
      {
        q: "Is the New Alipore centre suitable for a complete beginner?",
        a: "It is the centre we most often recommend for a first-time player. The coach is FIDE-rated and particularly good with children who are just starting out.",
      },
      {
        q: "How large are the batches?",
        a: "Batches are kept small enough for the coach to correct every child by name in a session, which is why each slot is capped rather than opened to everyone at once.",
      },
      {
        q: "Can we start mid-year?",
        a: "Yes. Students are placed by a coach at the session that matches their strength rather than at the start of a term, so there is no fixed joining date.",
      },
    ],
  },
];

/**
 * The city hub. It carries the broad commercial phrases so the four centre
 * pages do not have to fight it for them - each of those owns one locality.
 */
export const centreHub = {
  slug: CENTRE_HUB_SLUG,
  navLabel: "Chess Academy in Kolkata",
  keyword: "chess academy in Kolkata",
  h1: "Chess Academy in Kolkata",
  supportingHeading: "Professional chess coaching in Kolkata for beginners to competitive players.",
  title: "Chess Academy in Kolkata | Chess Coaching & Classes - Envision",
  description:
    "Join Envision Chess Academy in Kolkata for structured chess coaching, FIDE-rated and FIDE-certified coaches, small batches and tournament preparation across four Kolkata centres.",
  keywords: [
    "chess academy in Kolkata",
    "chess coaching in Kolkata",
    "chess classes in Kolkata",
    "chess training in Kolkata",
    "chess coaching classes in Kolkata",
    "chess academy for kids in Kolkata",
    "chess classes for kids in Kolkata",
    "offline chess classes in Kolkata",
    "chess coaching for kids in Kolkata",
    "professional chess coaching in Kolkata",
    "FIDE chess coaching in Kolkata",
    "chess training academy in Kolkata",
    "chess coaching centre in Kolkata",
    "best chess academy in Kolkata",
    "best chess coaching in Kolkata",
    "competitive chess coaching in Kolkata",
    "tournament chess coaching in Kolkata",
    "beginner chess classes in Kolkata",
    "advanced chess coaching in Kolkata",
    "chess academy near me",
  ],
  intro:
    "Structured offline chess classes across Kolkata with FIDE-rated and FIDE-certified coaches, small batches, tournament preparation and a published learning pathway that runs from the first move to competitive chess. Four centres: Bowbazar, Haridevpur, Jodhpur Park and New Alipore.",
  faqs: [
    {
      q: "Which is a good chess academy in Kolkata for kids?",
      a: "Look for three things: a published syllabus rather than ad-hoc lessons, coaches with a real federation qualification, and proof of what students have won. Envision is affiliated to the Kolkata District Chess Association and recognised by Sara Bangla Daba Sangstha, teaches a fixed 240-session curriculum, and every centre is run by a FIDE-rated or FIDE-certified coach. Book a free demo class and judge the coaching for yourself before paying anything.",
    },
    {
      q: "Where does Envision Chess Academy have centres in Kolkata?",
      a: "Four centres: Bowbazar in central Kolkata, Haridevpur in the south-west, and Jodhpur Park and New Alipore in the south. Each centre page lists its address, batch timings, coach and contact number.",
    },
    {
      q: "Do you offer beginner chess classes in Kolkata?",
      a: "Yes. The beginner stage starts from the board, the pieces, notation and the rules that catch people out, and runs for 48 sessions before the tactics stage begins. A child who has never played a full game can start there.",
    },
    {
      q: "Do you provide advanced chess coaching in Kolkata?",
      a: "Yes. Above the beginner and tactics stages the ladder continues into endgame technique and opening repertoire, then advanced calculation, then positional play and theoretical endgames - the material rated games are actually decided by.",
    },
    {
      q: "Are your chess coaches FIDE rated or certified?",
      a: "Yes. Haridevpur is taught by FIDE Instructor Sayan Bose, who has trained International Masters, Grandmasters and Asian-level champions. Bowbazar is taught by FIDE-certified National Instructor Sayantan Chandra. Jodhpur Park and New Alipore are taught by FIDE-rated coaches.",
    },
    {
      q: "Do you prepare students for chess tournaments?",
      a: "Yes. Tournament preparation runs at every centre, weekly academy tournaments run inside the student portal, and students are entered for external rated events - which is where the academy's state, national and international results come from.",
    },
    {
      q: "What age can children start chess classes?",
      a: "Most children start between five and seven, once they can sit through a class and follow a rule. There is no upper age limit: adult beginners and returning players join the same beginner stage.",
    },
    {
      q: "Are both group and individual chess classes available?",
      a: "Yes. Every centre runs interactive group batches and one-to-one coaching on the same syllabus. The demo assessment covers which format suits the player.",
    },
    {
      q: "Can I book a demo chess class in Kolkata?",
      a: "Yes, and it is free. The demo is a real assessment class with a coach that ends in a level recommendation, with no obligation to enrol. You can take it at a centre or online.",
    },
    {
      q: "Do you also offer online chess coaching?",
      a: "Yes. The same five courses run live online for students anywhere in India and in 15+ other countries, with identical homework, tournaments and progress tracking.",
    },
    {
      q: "What are the chess class fees in Kolkata?",
      a: "Fees vary by centre, batch and format, so our team shares the current fee structure with you directly when you book a demo class.",
    },
  ],
};

export function centreHref(slug: string) {
  return `/${CENTRE_HUB_SLUG}/${slug}`;
}

export function getCentrePage(slug: string) {
  return kolkataCentres.find((centre) => centre.slug === slug);
}

/** "18:00" -> "6:00 PM". */
export function slotTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function slotLabel(slot: CentreSlot) {
  return `${slotTime(slot.from)} - ${slotTime(slot.to)}`;
}

/** The days a centre teaches, for a one-line summary. */
export function centreDays(centre: CentreConfig) {
  return centre.schedule.map((entry) => entry.day);
}

export function centreBatchCount(centre: CentreConfig) {
  return centre.schedule.reduce((total, entry) => total + entry.slots.length, 0);
}

/**
 * The earliest start and latest finish across the week, for a one-line summary.
 * Listing only the first slot would say "6:00 PM" for a centre that also runs a
 * 10:00 AM weekend batch.
 */
export function centreTimeRange(centre: CentreConfig) {
  const slots = centre.schedule.flatMap((entry) => entry.slots);
  const opens = slots.reduce((earliest, slot) => (slot.from < earliest ? slot.from : earliest), slots[0].from);
  const closes = slots.reduce((latest, slot) => (slot.to > latest ? slot.to : latest), slots[0].to);
  return `${slotTime(opens)} to ${slotTime(closes)}`;
}

/** schema.org opening hours, one entry per slot. */
export function centreOpeningHours(centre: CentreConfig) {
  return centre.schedule.flatMap((entry) =>
    entry.slots.map((slot) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: `https://schema.org/${entry.day}`,
      opens: slot.from,
      closes: slot.to,
    })),
  );
}

export function centrePostalAddress(centre: CentreConfig) {
  return {
    "@type": "PostalAddress",
    streetAddress: centre.streetAddress,
    addressLocality: centre.name,
    addressRegion: "West Bengal",
    postalCode: centre.postalCode,
    addressCountry: "IN",
  };
}

export function centreHubMetadata(): Metadata {
  const url = `${MARKETING_BASE_URL}/${centreHub.slug}`;
  return {
    metadataBase: new URL(MARKETING_BASE_URL),
    title: centreHub.title,
    description: centreHub.description,
    keywords: centreHub.keywords,
    alternates: { canonical: url },
    openGraph: {
      title: centreHub.title,
      description: centreHub.description,
      url,
      siteName: "Envision Chess Academy",
      type: "website",
      images: socialImage("Envision Chess Academy student with a tournament trophy - chess academy in Kolkata"),
    },
    twitter: {
      card: "summary_large_image",
      title: centreHub.title,
      description: centreHub.description,
      images: [OG_IMAGE_PATH],
    },
  };
}

export function centreMetadata(config: CentreConfig): Metadata {
  const url = `${MARKETING_BASE_URL}${centreHref(config.slug)}`;
  return {
    metadataBase: new URL(MARKETING_BASE_URL),
    title: config.title,
    description: config.description,
    keywords: config.keywords,
    alternates: { canonical: url },
    openGraph: {
      title: config.title,
      description: config.description,
      url,
      siteName: "Envision Chess Academy",
      type: "website",
      images: socialImage(`Envision Chess Academy ${config.name} centre - ${config.keyword}`),
    },
    twitter: {
      card: "summary_large_image",
      title: config.title,
      description: config.description,
      images: [OG_IMAGE_PATH],
    },
  };
}
