export const ACADEMY_LOGO_URL = "https://res.cloudinary.com/dlafr6yu3/image/upload/v1781225175/text_logo_yellow_2_jkykvz.png";

/**
 * The logo resized by Cloudinary for a web page header. The master file above
 * is 8000x2000 pixels: about 64 MB once a phone decodes it, for a logo shown
 * 140-190px wide. `width` is in image pixels, so pass about 3x the CSS width.
 */
export function academyLogoUrl(width = 600) {
  return ACADEMY_LOGO_URL.replace("/image/upload/", `/image/upload/f_auto,q_auto,w_${Math.round(width)}/`);
}
export const ACADEMY_SIGNATURE_URL = "https://res.cloudinary.com/dlafr6yu3/image/upload/v1785307810/sayantan_signature_3_jq2ayo.jpg";
export const ACADEMY_FAVICON_URL = "/favicon.png";

export const ACADEMY_DEFAULTS = {
  academyName: "Envision Chess Academy",
  legalName: "Envisions Chess Academy LLP",
  registeredAddress: "20, Dr Jagabandhu Lane\nKolkata 700 012, West Bengal India",
  affiliationLine: "Affiliated to Kolkata District Chess Association",
  recognitionLine: "Recognised By Sara Bangla Daba Sangstha",
  gstNumber: "19AALFE6840P1ZN",
  phone: "+918618037398",
  email: "info@envisionchessacademy.com",
  website: "www.envisionchessacademy.com",
  authorizedSignatory: "Sayantan Chandra",
};

/**
 * The academy number as a person reads it on a button. Derived from the dialled
 * form rather than typed again, so the two can never disagree; a number that is
 * not a +NN NNNNN NNNNN passes through unchanged.
 */
export const ACADEMY_PHONE_DISPLAY = ACADEMY_DEFAULTS.phone.replace(/^(\+\d{2})(\d{5})(\d{5})$/, "$1 $2 $3");

/**
 * The two bodies the academy is accredited by, with the logo each one is
 * recognised by on sight. Kept beside the affiliation lines above so the wording
 * on a page and the wording on an invoice can never drift apart.
 */
export const ACADEMY_ACCREDITATIONS = [
  {
    relation: "Affiliated to",
    name: "Kolkata District Chess Association",
    logo: "/images/affiliations/kolkata-district-chess-association.jpg",
  },
  {
    relation: "Recognised by",
    name: "Sara Bangla Daba Sangstha",
    logo: "/images/affiliations/sara-bangla-daba-sangstha.jpg",
  },
] as const;
