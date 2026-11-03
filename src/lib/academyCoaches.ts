/**
 * The coaches shown in the "Meet our coaches" section on the homepage, the
 * Kolkata hub and centre pages, the city pages, the course pages and the two
 * online-class hubs.
 *
 * Every number and designation here is copied from the coach's public
 * ratings.fide.com profile (November 2026 list), so a parent can click
 * through and check it. Update `COACH_RATINGS_AS_OF` with the numbers.
 * Photos are face-centred 320px squares in /public/images/coaches.
 */
export type AcademyCoach = {
  name: string;
  photo: string;
  fideId: string;
  /** FIDE trainer or arena titles, most senior first. */
  designations: string[];
  standard?: number;
  rapid?: number;
  blitz?: number;
};

export const COACH_RATINGS_AS_OF = "November 2026";

export function fideProfileUrl(fideId: string) {
  return `https://ratings.fide.com/profile/${fideId}`;
}

const photo = (slug: string) => `/images/coaches/${slug}.webp`;

export const academyCoaches: AcademyCoach[] = [
  {
    name: "Sayan Bose",
    photo: photo("sayan-bose"),
    fideId: "5011990",
    designations: ["FIDE Instructor", "Arena International Master"],
    standard: 1972,
    rapid: 1947,
    blitz: 1986,
  },
  {
    name: "Samrat Ghorai",
    photo: photo("samrat-ghorai"),
    fideId: "5033659",
    designations: ["FIDE Instructor"],
    standard: 1845,
    rapid: 1932,
    blitz: 1999,
  },
  {
    name: "Sayantan Chandra",
    photo: photo("sayantan-chandra"),
    fideId: "5057655",
    designations: ["National Instructor"],
    standard: 1865,
    rapid: 1800,
    blitz: 1805,
  },
  {
    name: "Shreyas Ghadi",
    photo: photo("shreyas-ghadi"),
    fideId: "35062409",
    designations: ["FIDE-rated coach"],
    standard: 2069,
    rapid: 1987,
    blitz: 1947,
  },
  {
    name: "Debankan Dhara",
    photo: photo("debankan-dhara"),
    fideId: "5056586",
    designations: ["FIDE-rated coach"],
    standard: 1960,
    rapid: 2016,
  },
  {
    name: "Sayandeep Roy",
    photo: photo("sayandeep-roy"),
    fideId: "25673904",
    designations: ["FIDE-rated coach"],
    standard: 1882,
    rapid: 1694,
  },
];
