import { notFound } from "next/navigation";
import CentrePage from "@/components/marketing/CentrePage";
import { centreMetadata, getCentrePage, kolkataCentres } from "@/lib/centrePages";

/**
 * One route for all four centres.
 *
 * `generateStaticParams` with `dynamicParams` off means these are built as four
 * static pages and anything else under the hub 404s, rather than a crawler
 * finding an infinite set of empty locality pages.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return kolkataCentres.map((centre) => ({ centre: centre.slug }));
}

export function generateMetadata({ params }: { params: { centre: string } }) {
  const config = getCentrePage(params.centre);
  if (!config) return {};
  return centreMetadata(config);
}

export default function KolkataCentrePage({ params }: { params: { centre: string } }) {
  const config = getCentrePage(params.centre);
  if (!config) notFound();
  return <CentrePage config={config} />;
}
