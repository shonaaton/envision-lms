/**
 * The "Our students. Their achievements." strip under the homepage numbers.
 *
 * Source: the academy's "Student Achievements" sheet (Nov 2026) and the photo
 * folder on Drive; Kartik, Sayak, Shreehan and Anumegha's numbers were read
 * off their ratings.fide.com profiles (Nov 2026 list). Ratings move, so this is a snapshot: update `RATINGS_AS_OF`
 * along with the numbers. Photos are face-centred 320px squares in
 * /public/images/student-ratings; a student with no photo gets a monogram.
 *
 * `href` points at the student's success-story page when one exists (the slug
 * must match `studentSlug()` of a name in `seededAchievements`), or at the
 * public post the sheet names.
 */
export type StudentRating = {
  name: string;
  photo?: string;
  /** The big number or title on the pill, e.g. "1860" or "No. 1". */
  value: string;
  /** What the value is, e.g. "FIDE" or "England U-7". */
  label: string;
  detail: string;
  href?: string;
};

export const RATINGS_AS_OF = "November 2026";

const photo = (slug: string) => `/images/student-ratings/${slug}.webp`;
const story = (slug: string) => `/success-stories/${slug}`;

export const studentRatings: StudentRating[] = [
  {
    name: "Anish Bijibilla",
    photo: photo("anish-bijibilla"),
    value: "No. 1",
    label: "England U-7",
    detail: "Top in classical, rapid and blitz. Joined at 5 as a complete beginner; now plays for England at the U-8 World Cadets.",
    href: story("anish-bijibilla"),
  },
  {
    name: "Kartik Kumbhar",
    photo: photo("kartik-kumbhar"),
    value: "1981",
    label: "FIDE",
    detail: "Rated 1718 in rapid and 1593 in blitz as well.",
  },
  {
    name: "Shreyan Bag",
    photo: photo("shreyan-bag"),
    value: "1860",
    label: "FIDE",
    detail: "Joined us rated 1400.",
    href: story("shreyan-bag"),
  },
  {
    name: "Ywun Poe Mel (Sarah)",
    photo: photo("ywun-poe-mel-sarah"),
    value: "1657",
    label: "FIDE",
    detail: "G11 National Player and national champion of Myanmar. Started from scratch with us.",
    href: story("ywun-poe-mel-sarah"),
  },
  {
    name: "Yash Lohana",
    photo: photo("yash-lohana"),
    value: "AIM",
    label: "Title",
    detail: "Earned the Arena International Master title on FIDE Online Arena.",
    href: story("yash-lohana"),
  },
  {
    name: "Sayak Dutta",
    photo: photo("sayak-dutta"),
    value: "1613",
    label: "FIDE",
    detail: "Rated 1613 in classical and 1487 in rapid.",
  },
  {
    name: "Ahilaan Baishya",
    photo: photo("ahilaan-baishya"),
    value: "1640",
    label: "FIDE",
    detail: "First FIDE rating of 1425, built from scratch.",
    href: story("ahilaan-baishya"),
  },
  {
    name: "Adyashis Biswas",
    photo: photo("adyashis-biswas"),
    value: "1627",
    label: "FIDE",
    detail: "Joined near 1450 and dropped in the first month. Back to 1587 with us, and still climbing.",
    href: story("adyashis-biswas"),
  },
  {
    name: "Shreehan Sengupta",
    photo: photo("shreehan-sengupta"),
    value: "1587",
    label: "FIDE",
    detail: "Up from 1460 at the start of 2026.",
  },
  {
    name: "Urvil Maurya",
    photo: photo("urvil-maurya"),
    value: "1583",
    label: "FIDE",
    detail: "3rd at the Kota District U-15 Open 2025, playing above his age group.",
    href: story("urvil-maurya"),
  },
  {
    name: "Rudra Chintan Tiwary",
    photo: photo("rudra-tiwary"),
    value: "1564",
    label: "FIDE",
    detail: "Had the strength but no rating. We got him over the line to a first rating of 1463.",
    href: story("rudra-tiwary"),
  },
  {
    name: "Nilavo Pal",
    photo: photo("nilavo-pal"),
    value: "1500",
    label: "FIDE Classical",
    detail: "Earned a FIDE classical rating of 1500.",
    href: story("nilavo-pal"),
  },
  {
    name: "Anumegha Kundu",
    photo: photo("anumegha-kundu"),
    value: "1419",
    label: "FIDE",
    detail: "First FIDE rating, November 2026. Also 8th in U-12 Girls at the Rangamati International Rapid.",
    href: story("anumega-kundu"),
  },
  {
    name: "Prithviraj Ganguly",
    photo: photo("prithviraj-ganguly"),
    value: "1472",
    label: "FIDE Rapid",
    detail: "Earned a FIDE rapid rating of 1472.",
    href: "https://www.instagram.com/p/DWlZi__DXRw/",
  },
  {
    name: "Nilasha Konwar",
    value: "1st",
    label: "District",
    detail: "District champion, U-7 Girls, Purba Bardhaman 2025.",
    href: story("nilasha-konwar"),
  },
  {
    name: "Vedantika Chowdhury",
    photo: photo("vedantika-chowdhury"),
    value: "2nd",
    label: "Surat District",
    detail: "Scored 4/5 in the Surat district selection for state.",
    href: story("vedantika-chowdhury"),
  },
];
