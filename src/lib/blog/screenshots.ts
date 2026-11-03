import type { ScreenshotImage } from "@/lib/blog/types";
import sizes from "@/lib/blog/screenshotSizes.json";

const SIZES: Record<string, number[]> = sizes;

/**
 * Screenshot builders for one post. Files live in `public/blog/<slug>/<name>.webp`
 * and their pixel sizes in `screenshotSizes.json`, written when the screenshots
 * are exported, so a post only names the shot and says what it shows.
 */
export function screenshotsFor(slug: string) {
  const build = (device: ScreenshotImage["device"], name: string, caption: string, alt: string): ScreenshotImage => {
    const size = SIZES[`${slug}/${name}`];
    if (!size) throw new Error(`No screenshot "${name}" for ${slug}`);
    return { src: `/blog/${slug}/${name}.webp`, width: size[0], height: size[1], device, caption, alt };
  };
  return {
    computer: (name: string, caption: string, alt: string) => build("computer", name, caption, alt),
    phone: (name: string, caption: string, alt: string) => build("phone", name, caption, alt),
  };
}
