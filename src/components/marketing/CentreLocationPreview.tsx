import Link from "next/link";
import { ArrowUpRight, Navigation } from "lucide-react";

/** A lightweight directions link; the full map lives on the centre page. */
export default function CentreLocationPreview({ name, href, external = false }: { name: string; href: string; external?: boolean }) {
  const content = <>
    <span className="centre-location-preview__icon"><Navigation size={22} aria-hidden="true" /></span>
    <span><span className="centre-location-preview__eyebrow">Visit us in person</span><strong>{name}</strong><span className="centre-location-preview__action">{external ? "Open in Google Maps" : "Explore this centre"}</span></span>
    <ArrowUpRight size={23} className="ml-auto shrink-0" aria-hidden="true" />
  </>;

  return external
    ? <a href={href} target="_blank" rel="noopener noreferrer" className="centre-location-preview" aria-label={`Directions to ${name} (opens in a new tab)`}>{content}</a>
    : <Link href={href} className="centre-location-preview" aria-label={`Explore the ${name} centre`}>{content}</Link>;
}
