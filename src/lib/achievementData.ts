export type AchievementLevel = "District" | "State" | "National" | "International" | "Rating" | "Other";

export type AchievementRecord = {
  _id?: string;
  studentName: string;
  studentPhotoUrl?: string;
  achievementImageUrl: string;
  tournamentName: string;
  result: string;
  category: string;
  tournamentLocation: string;
  year: string;
  achievementLevel: AchievementLevel;
  shortDescription: string;
  isFeatured: boolean;
  displayOrder: number;
  isPublished: boolean;
  sourceImageName: string;
};

export type ReviewRecord = {
  name: string;
  role: string;
  rating: number;
  text: string;
  profilePhotoUrl?: string;
};

const imageBase = "/images/achievements";

const filenames = [
  "474014694_122179329326049791_2849132005422086620_n.jpg",
  "474858964_122179923578049791_9195577122398739865_n.jpg",
  "474869240_122179778876049791_1060732499259705623_n.jpg",
  "474921121_122180110886049791_7319427251731386455_n.jpg",
  "475059496_122180110562049791_3878296334010343149_n.jpg",
  "475284097_122180153954049791_8981164150629167543_n.jpg",
  "500074123_122179991420279433_2424166741920712843_n.jpg",
  "500237386_122180326622279433_7500549743335270853_n.jpg",
  "500411390_122179989356279433_6003444726920825586_n.jpg",
  "511165248_122183668718279433_3983701709530303664_n.jpg",
  "517604773_122185349084279433_6977536861914066886_n.jpg",
  "518061069_122186124530279433_8307349737622287381_n.jpg",
  "585346743_122200323866279433_5720068810456925659_n.jpg",
  "585874625_122200334360279433_5765728443175568261_n.jpg",
  "594077968_122201549654279433_2432551005370768553_n.jpg",
  "619001799_122207485298279433_159544895833438279_n.jpg",
  "627466214_122208550064279433_3837611022896303386_n.jpg",
  "674447949_122216787590279433_6441717834629453898_n.jpg",
  "679214668_122216957852279433_859703507673834597_n.jpg",
  "682626726_122217430778279433_7786835792267057544_n.jpg",
  "696712918_122218990358279433_8505527401776804569_n.jpg",
  "706795034_122220114398279433_4939696076703418846_n.jpg",
  "714840119_122220947258279433_7777855664830080698_n.jpg",
  "723066701_122222235464279433_3637646613851670765_n.jpg",
  "732018737_122223099770279433_9055084044092369505_n.jpg",
  "732747362_122223201662279433_2490254090135470859_n.jpg",
];

function image(index: number) {
  return `${imageBase}/${filenames[index]}`;
}

export const impactCounters = [
  { value: "2,000+", label: "Students Trained" },
  { value: "15+", label: "Countries" },
  { value: "100+", label: "Rated Players Produced" },
  { value: "1,000+", label: "Tournament Winners" },
  { value: "20+", label: "State, National & International Achievements" },
];

export const academyBranches = [
  { name: "Bowbazar", address: "20 Dr Jagabandhu Lane, Kolkata 700012" },
  { name: "Haridevpur", address: "403B, Mahatma Gandhi Rd, Kolkata 700082" },
  { name: "Jodhpur Park", address: "1D, Jodhpur Park, Kolkata, West Bengal 700068" },
  { name: "New Alipore", address: "2/1, Shyama Charan Smriti Tirtha Rd, Kolkata 700053" },
  { name: "Silpara, Behala", address: "Kolkata offline centre" },
];

export const verifiedReviews: ReviewRecord[] = [
  {
    name: "Palash Sinha",
    role: "Parent review",
    rating: 5,
    text:
      "The impact of this chess academy on my daughter's development has been truly remarkable. The coaches are experts and exceptional educators who inspire and motivate students.",
  },
  {
    name: "Arindam Das",
    role: "Parent review",
    rating: 5,
    text:
      "An excellent chess academy in the town. The coaches connect easily with children, make learning enjoyable, and the course structure is very strong.",
  },
  {
    name: "Nivedita Kar",
    role: "Parent review",
    rating: 5,
    text:
      "Sayan Sir is very experienced. His chess teaching techniques are effective, learner-friendly, and supported by a suitable classroom environment.",
  },
];

export const anishStory = {
  studentName: "Anish Bijibilla",
  startingLevel: "Beginner",
  currentLevel: "Professional",
  coachingDuration: "2.5 Years",
  achievement:
    "England's No. 1 player in the Under-7 category across all formats, qualified for the FIDE World Cadets Cup, Batumi.",
  fatherTestimonial:
    "When Anish began, he was simply curious about chess. Envision gave that curiosity a real structure. The coaches broke the game into clear levels, gave him personal attention after every class, and prepared him carefully before tournaments. What changed most was his confidence. He started believing that disciplined practice could turn into real results. From a beginner to England's No. 1 Under-7 player, his growth has been extraordinary, and the academy's mentorship has been central to that journey.",
};

export const seededAchievements: AchievementRecord[] = [
  ["Ahilaan Baishya", "FIDE Rating", "1602 FIDE rating at age 8", "Not specified", "Not specified", "Rating Achievement", "Rating", true],
  ["Rudra Tiwary", "FIDE Rating", "1463 FIDE rating at age 9", "Not specified", "Not specified", "Rating Achievement", "Rating", true],
  ["Ahilaan Baishya", "2nd One Day Mega Rapid Chess Tournament 2024", "1st in Under 8 category", "Not specified", "2024", "Rapid Chess", "State", true],
  ["Ywun Poe Mel (Sarah)", "FIDE Standard Rating", "1657 FIDE standard rating at age 9", "Not specified", "Not specified", "Rating Achievement", "Rating", true],
  ["Aqmal Rizqy bin Abdul Rasid", "Manjungrian 6 Chess Championship 2024", "1st in Under 10 category", "Manjung, Malaysia", "2024", "International Tournament", "International", true],
  ["Yash Lohana", "FIDE Online Arena", "Arena International Master title; rating increased from 1480 to 1737", "Online", "Not specified", "Title Achievement", "International", true],
  ["Anish Bijibilla", "EJCOA Chess Qualifying Tournament", "Top Boy award", "Not specified", "Not specified", "Tournament Award", "National", true],
  ["Sarah", "Myanmar National Age Group Chess Championships", "1st in Girls Under 11; selected as G11 National Player of Myanmar", "Mandalay, Myanmar", "2025", "National Championship", "National", true],
  ["Nilasha Konwar", "Purba Bardhaman District Chess Championship 2025", "1st in U-7 Girls", "Magnus Global School", "2025", "District Championship", "District", false],
  ["Shreyan Bag", "3rd All Bengal Chess Development School Age Group Tournament 2025", "1st in Under 14 Open", "Kolkata", "2025", "State Tournament", "State", true],
  ["Urvil Maurya", "Kota District Under-15 Open Chess Tournament 2025", "3rd in Under 13 Open", "Kota", "2025", "District Championship", "District", false],
  ["Shreyan Bag", "7th Ayodhana International FIDE Rating Chess", "1st in Below 1799 Elo category; gained 23.6 rating points", "Not specified", "Not specified", "FIDE Rating Tournament", "International", true],
  ["Nilavo Pal", "4th All Bengal School Developmental Age Group Chess Championship 2025", "3rd in U-13 Open Category", "Kolkata", "2025", "State Tournament", "State", false],
  ["Adyashis Biswas", "4th All Bengal School Developmental Age Group Chess Championship 2025", "U-13 Open Champion", "Kolkata", "2025", "State Tournament", "State", true],
  ["Nilavo Pal", "FIDE Classical Rating", "1500 FIDE classical rating", "Not specified", "Not specified", "Rating Achievement", "Rating", true],
  ["Envision Student", "1st S.R.B. Memorial Cup Chess for Everymonth", "1st Under 10 Girls; second professional tournament and second trophy", "Burdwan", "Not specified", "Tournament Winner", "District", false],
  ["Souhrita Das", "Century Ply 3rd Open Air Chess Championship 2026", "3rd Position - Under 10 Girls", "Kolkata, Simpark Mall", "2026", "Open Air Championship", "State", true],
  ["Nilavo Pal", "5th AKD TMT All Bengal School Age Group Chess Tournament 2026", "10th Place in Under 17", "Kolkata, West Bengal", "2026", "State Tournament", "State", false],
  ["Nilavo Pal", "All Bengal One Day Rapid Chess Tournament", "13th Place in Open Category; cash prize Rs 700", "Kolkata, West Bengal", "Not specified", "Rapid Chess", "State", false],
  ["Anish", "World Cadets Chess Championship", "Qualified to represent England", "Batumi, Georgia", "Not specified", "World Cadets", "International", true],
  ["Anish", "England Under-7 chess rankings", "#1 in England Under-7; #1 in Classical, Rapid, and Blitz", "England", "Not specified", "National Ranking", "National", true],
  ["Sanjib Mali", "All India FIDE Rating Below 1800 Classical Chess Tournament 2026", "3rd Place with 7.5 points and Rs 15,000 prize money", "Hazaribagh, Jharkhand", "2026", "National FIDE Tournament", "National", true],
  ["Souhrita Das", "2nd Memari Elite Checkmate Challenge 2026", "U11 Girls Champion", "Memari", "2026", "Rapid Chess", "State", true],
  ["Adyashis Biswas", "2nd Memari Elite Checkmate Challenge 2026", "Rank 18; main prize with Rs 800 and memento", "Memari", "2026", "Rapid Chess", "State", false],
  ["Anumega Kundu", "1st Rangamati International Rapid and Blitz Tournament", "8th position in U-12 Girls", "Bolpur Shantiniketan", "2026", "International Rapid and Blitz", "International", true],
  ["Vedantika Chowdhury", "Surat District Selection for State", "2nd position with 4 out of 5 score", "Surat District", "Not specified", "District Selection", "District", false],
].map(([studentName, tournamentName, result, tournamentLocation, year, category, achievementLevel, isFeatured], index) => ({
  studentName: String(studentName),
  achievementImageUrl: image(index),
  tournamentName: String(tournamentName),
  result: String(result),
  tournamentLocation: String(tournamentLocation),
  year: String(year),
  category: String(category),
  achievementLevel: achievementLevel as AchievementLevel,
  shortDescription: `${studentName} achieved ${result} at ${tournamentName}${tournamentLocation !== "Not specified" ? ` in ${tournamentLocation}` : ""}${year !== "Not specified" ? ` (${year})` : ""}.`,
  isFeatured: Boolean(isFeatured),
  displayOrder: index + 1,
  isPublished: true,
  sourceImageName: filenames[index],
}));

export function publicAchievementList(records: AchievementRecord[] = seededAchievements) {
  return [...records]
    .filter((item) => item.isPublished)
    .sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || a.displayOrder - b.displayOrder);
}

export function studentSlug(studentName: string) {
  return studentName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
