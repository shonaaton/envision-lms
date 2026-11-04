import Image from "next/image";
import type { ReviewRecord } from "@/lib/achievementData";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/**
 * Reviews as a row of wide slabs the visitor swipes by hand. No script: the
 * row is a scroll-snapping overflow container.
 *
 * The reviews come from `getLandingReviews()`: the ones synced from the Google
 * listing, or the three verified parent reviews when none have synced. The
 * heading says "Google reviews" only when Google ones are actually shown.
 */
export default function ReviewSlabs({ reviews }: { reviews: ReviewRecord[] }) {
  if (!reviews.length) return null;
  const fromGoogle = reviews.some((review) => review.role === "Google review");
  const listingUrl = reviews.find((review) => review.googleMapsUrl)?.googleMapsUrl;

  return (
    <section className="section reviews-section" id="reviews">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <div className="eyebrow">{fromGoogle ? "Google reviews" : "Parent reviews"}</div>
          <h2>What families say about Envision.</h2>
          <p>
            {fromGoogle
              ? "Real reviews from parents and students, straight from our Google listing."
              : "Reviews from parents whose children train with us."}
          </p>
        </div>
      </div>
      <div className="review-slabs" tabIndex={0} aria-label="Reviews, scroll sideways for more">
        <ul className="review-track">
          {reviews.map((review, index) => (
            <li key={`${review.name}-${index}`} className="review-slab">
              <div className="review-top">
                <span className="review-stars" aria-label={`${review.rating} out of 5 stars`}>
                  {"★".repeat(Math.max(0, Math.min(5, Math.round(review.rating))))}
                </span>
                <span className="review-source">{review.role}</span>
              </div>
              <blockquote className="review-text">{review.text}</blockquote>
              <div className="review-by">
                <span className="review-avatar">
                  {review.profilePhotoUrl ? (
                    <Image src={review.profilePhotoUrl} alt="" fill sizes="44px" />
                  ) : (
                    <span aria-hidden="true">{initials(review.name)}</span>
                  )}
                </span>
                <span className="review-name">{review.name}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {listingUrl ? (
        <div className="wrap reviews-more">
          <a href={listingUrl} target="_blank" rel="noopener noreferrer">
            Read all our reviews on Google ↗
          </a>
        </div>
      ) : null}
    </section>
  );
}
