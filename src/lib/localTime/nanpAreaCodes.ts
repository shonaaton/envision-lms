/**
 * US and Canada (+1) area codes → timezone. A +1 number alone spans six zones;
 * its area code pins the state, and so the zone.
 *
 * A few area codes straddle a zone line (the Florida panhandle, southern
 * Indiana, Idaho, western Nebraska, the Dakotas, the Canadian territories).
 * Those give the zone most of their people are in, marked `split` so the badge
 * still says "(approx.)" and staff know to ask.
 *
 * People keep their number when they move, so a city or state on the account
 * beats this, and the device timezone beats everything.
 */

const ZONES: Record<string, string> = {
  "America/New_York": [
    // CT DE DC
    "203 475 860 959 302 202 771",
    // FL (peninsula)
    "239 305 321 324 352 386 407 561 645 656 689 727 728 754 772 786 813 863 904 941 954",
    // GA
    "229 404 470 478 678 706 762 770 912 943",
    // IN (most), KY (east)
    "260 317 463 574 765 502 606 859",
    // ME MD MA
    "207 240 301 410 443 667 339 351 413 508 617 774 781 857 978",
    // MI (lower peninsula)
    "231 248 269 313 517 586 616 679 734 810 947 989",
    // NH NJ
    "603 201 551 609 640 732 848 856 862 908 973",
    // NY
    "212 315 332 347 363 516 518 585 607 624 631 646 680 716 718 838 845 914 917 929 934",
    // NC OH
    "252 336 472 704 743 828 910 919 980 984 216 220 234 283 326 330 380 419 436 440 513 567 614 740 937",
    // PA RI SC
    "215 223 267 272 412 445 484 570 582 610 717 724 814 835 878 401 803 839 843 854 864",
    // TN (east) VT VA WV
    "423 865 802 276 434 540 571 703 757 804 826 948 304 681",
  ].join(" "),
  "America/Chicago": [
    // AL AR
    "205 251 256 334 659 938 327 479 501 870",
    // IL IA
    "217 224 309 312 331 447 464 618 630 708 730 773 779 815 847 861 872 319 515 563 641 712",
    // IN (northwest), KY (west), KS
    "219 270 364 316 620 785 913",
    // LA MN MS
    "225 318 337 504 985 218 320 507 612 651 763 952 228 601 662 769",
    // MO NE (east) OK
    "314 417 557 573 636 660 816 975 402 531 405 539 572 580 918",
    // TN (middle, west)
    "615 629 731 901 931",
    // TX (all but El Paso)
    "210 214 254 281 325 346 361 409 430 432 469 512 682 713 726 737 806 817 830 832 903 936 940 945 956 972 979",
    // WI
    "262 274 414 534 608 715 920",
    // Manitoba
    "204 431 584",
  ].join(" "),
  "America/Denver": [
    // CO MT NM UT WY, TX El Paso
    "303 719 720 970 983 406 505 575 385 435 801 307 915",
    // Alberta
    "368 403 587 780 825",
  ].join(" "),
  "America/Phoenix": "480 520 602 623 928",
  "America/Los_Angeles": [
    // CA
    "209 213 279 310 323 341 350 369 408 415 424 442 510 530 559 562 619 626 628 650 657 661 669 707 714 747 760 805 818 820 831 840 858 909 916 925 949 951",
    // NV OR WA
    "702 725 775 458 503 541 971 206 253 360 425 509 564",
  ].join(" "),
  "America/Vancouver": "236 250 257 604 672 778",
  "America/Anchorage": "907",
  "Pacific/Honolulu": "808",
  "America/Toronto": [
    // Ontario
    "226 249 289 343 365 382 416 437 519 548 613 647 683 705 742 753 905",
    // Quebec
    "263 354 367 418 438 450 468 514 579 581 819 873",
  ].join(" "),
  "America/Halifax": "782 902 428 506",
  "America/St_Johns": "709",
  "America/Regina": "306 474 639",
  "America/Puerto_Rico": "787 939",
};

/** Codes that straddle a zone line: the zone most of their people are in. */
const SPLIT: Record<string, string> = {
  "850": "America/Chicago", // Florida panhandle: Pensacola Central, Tallahassee Eastern
  "448": "America/Chicago",
  "812": "America/New_York", // southern Indiana: Evansville corner is Central
  "930": "America/New_York",
  "906": "America/New_York", // Michigan upper peninsula: western edge Central
  "208": "America/Boise", // Idaho: north is Pacific
  "986": "America/Boise",
  "308": "America/Chicago", // western Nebraska: panhandle is Mountain
  "605": "America/Chicago", // South Dakota: west is Mountain
  "701": "America/Chicago", // North Dakota: southwest is Mountain
  "807": "America/Toronto", // northwest Ontario: Kenora is Central
  "867": "America/Edmonton", // Yukon / NWT / Nunavut
};

const BY_CODE = new Map<string, string>();
Object.entries(ZONES).forEach(([zone, codes]) => codes.split(/\s+/).filter(Boolean).forEach((code) => BY_CODE.set(code, zone)));

/** The zone for a +1 national number, or null when its area code is not in the table. */
export function nanpAreaCodeZone(phone: unknown): { zone: string; areaCode: string; split: boolean } | null {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  const areaCode = digits.slice(0, 3);
  const exact = BY_CODE.get(areaCode);
  if (exact) return { zone: exact, areaCode, split: false };
  const split = SPLIT[areaCode];
  return split ? { zone: split, areaCode, split: true } : null;
}
