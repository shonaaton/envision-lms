export type PortalTutorial = {
  title: string;
  detail: string;
  videoId: string;
};

/**
 * The walkthrough videos a new student is pointed at before their first class.
 *
 * They live here rather than in the landing page so the demo dashboard shows the
 * exact same four videos - a demo student and a visitor should never be looking
 * at different tours of the same portal.
 */
export const portalTutorials: PortalTutorial[] = [
  {
    title: "Before Your First Class",
    detail: "Log in, enter your classroom, and attend your first online class.",
    videoId: "OQ7RMzfbsoc",
  },
  {
    title: "Homework Tutorial",
    detail: "Access assignments, complete homework, and submit your work.",
    videoId: "jkhZnurcl10",
  },
  {
    title: "Class Tools",
    detail: "Review what was covered, use Ask Coach, and explore class features.",
    videoId: "JCOrhFkyXas",
  },
  {
    title: "Practice Tools",
    detail: "Use Tactics Trainer, King Hunt, Square Trainer, and Play vs Computer.",
    videoId: "sLUjlm4Y350",
  },
];

export function youtubeEmbedUrl(videoId: string) {
  return `https://www.youtube.com/embed/${videoId}`;
}
