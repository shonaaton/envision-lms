import { notFound } from "next/navigation";
import CentrePage from "@/components/marketing/CentrePage";
import { centreMetadata, getCentrePage, kolkataCentres } from "@/lib/centrePages";
import { centreFees, liveCentreSchedule } from "@/lib/branch/publicSlots";

/**
 * One route for all four centres.
 *
 * `generateStaticParams` with `dynamicParams` off means these are built as four
 * static pages and anything else under the hub 404s, rather than a crawler
 * finding an infinite set of empty locality pages.
 */
export const dynamicParams = false;

/** Bowbazar's timetable, free seats and fees come live from its branch portal; refreshed every 5 minutes. */
export const revalidate = 300;

export function generateStaticParams() {
  return kolkataCentres.map((centre) => ({ centre: centre.slug }));
}

export function generateMetadata({ params }: { params: { centre: string } }) {
  const config = getCentrePage(params.centre);
  if (!config) return {};
  return centreMetadata(config);
}

export default async function KolkataCentrePage({ params }: { params: { centre: string } }) {
  const config = getCentrePage(params.centre);
  if (!config) notFound();
  if (config.slug === "bowbazar") {
    const [live, fees] = await Promise.all([liveCentreSchedule("bowbazar"), centreFees("bowbazar")]);
    return <CentrePage config={live ? { ...config, schedule: live } : config} live={Boolean(live)} fees={fees} />;
  }
  return <CentrePage config={config} />;
}
