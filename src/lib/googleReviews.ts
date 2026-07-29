import { dbConnect } from "@/lib/db";
import { verifiedReviews, type ReviewRecord } from "@/lib/achievementData";
import { GoogleReview } from "@/models/GoogleReview";

const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;
const defaultPlaceQuery = "Envision Chess Academy Kolkata";

type NormalizedGoogleReview = ReviewRecord & {
  googleReviewId: string;
  profilePhotoUrl?: string;
  publishTime?: Date;
  updateTime?: Date;
  source: "places" | "business_profile";
  placeId?: string;
  placeName?: string;
  googleMapsUrl?: string;
  relativePublishTimeDescription?: string;
};

function starRatingToNumber(value: any) {
  if (typeof value === "number") return Math.max(1, Math.min(5, value));
  const normalized = String(value || "").toUpperCase();
  const map: Record<string, number> = {
    ONE: 1,
    TWO: 2,
    THREE: 3,
    FOUR: 4,
    FIVE: 5,
    STAR_RATING_UNSPECIFIED: 0,
  };
  return map[normalized.replace(/^STAR_RATING_/, "")] || map[normalized] || 0;
}

function reviewText(value: any) {
  return String(value?.text || value?.comment || value?.originalText?.text || "").replace(/<[^>]*>/g, "").trim();
}

function reviewerName(value: any) {
  return String(value?.author_name || value?.reviewer?.displayName || value?.authorAttribution?.displayName || "Google user").trim();
}

async function findPlaceId(apiKey: string) {
  if (process.env.GOOGLE_PLACE_ID) return process.env.GOOGLE_PLACE_ID;

  const query = process.env.GOOGLE_PLACE_QUERY || defaultPlaceQuery;
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
    },
    body: JSON.stringify({ textQuery: query, regionCode: "IN" }),
    next: { revalidate: 0 },
  });
  const data = await response.json();
  const placeId = data?.places?.[0]?.id;
  if (!response.ok || !placeId) {
    throw new Error(data?.error?.message || "Could not resolve Google Place ID.");
  }
  return placeId as string;
}

async function fetchPlacesReviews(): Promise<NormalizedGoogleReview[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];

  const placeId = await findPlaceId(apiKey);
  const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=en`, {
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "id,displayName,rating,userRatingCount,reviews,googleMapsUri",
    },
    next: { revalidate: 0 },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Could not fetch Google Place reviews.");
  }

  const placeName = data?.displayName?.text || process.env.GOOGLE_PLACE_QUERY || "Google Business Profile";
  const googleMapsUrl = data?.googleMapsUri || process.env.GOOGLE_BUSINESS_SHARE_URL;
  return (data?.reviews || [])
    .map((item: any, index: number) => {
      const rating = starRatingToNumber(item.rating);
      return {
        googleReviewId: item.name || `places:${placeId}:${item.publishTime || index}:${reviewerName(item)}`,
        name: reviewerName(item),
        role: "Google review",
        rating,
        text: reviewText(item),
        profilePhotoUrl: item.authorAttribution?.photoUri,
        publishTime: item.publishTime ? new Date(item.publishTime) : undefined,
        relativePublishTimeDescription: item.relativePublishTimeDescription,
        source: "places" as const,
        placeId,
        placeName,
        googleMapsUrl,
      };
    })
    .filter((item: NormalizedGoogleReview) => item.rating > 0 && item.text);
}

async function fetchBusinessProfileReviews(): Promise<NormalizedGoogleReview[]> {
  const accountId = process.env.GOOGLE_BUSINESS_ACCOUNT_ID;
  const locationId = process.env.GOOGLE_BUSINESS_LOCATION_ID;
  const accessToken = process.env.GOOGLE_BUSINESS_ACCESS_TOKEN;
  if (!accountId || !locationId || !accessToken) return [];

  const reviews: NormalizedGoogleReview[] = [];
  let pageToken = "";

  do {
    const url = new URL(`https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews`);
    url.searchParams.set("pageSize", "50");
    url.searchParams.set("orderBy", "updateTime desc");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      next: { revalidate: 0 },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "Could not fetch Google Business Profile reviews.");

    for (const item of data.reviews || []) {
      const rating = starRatingToNumber(item.starRating);
      const text = reviewText(item);
      if (!rating || !text) continue;
      reviews.push({
        googleReviewId: item.name || `business:${item.reviewId}`,
        name: reviewerName(item),
        role: "Google review",
        rating,
        text,
        profilePhotoUrl: item.reviewer?.profilePhotoUrl,
        publishTime: item.createTime ? new Date(item.createTime) : undefined,
        updateTime: item.updateTime ? new Date(item.updateTime) : undefined,
        source: "business_profile",
      });
    }

    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return reviews;
}

export async function syncGoogleReviews() {
  await dbConnect();
  const reviews = (await fetchBusinessProfileReviews()).concat(await fetchPlacesReviews());
  const unique = Array.from(new Map(reviews.map((review) => [review.googleReviewId, review])).values());
  const syncedAt = new Date();

  for (const review of unique) {
    await GoogleReview.updateOne(
      { googleReviewId: review.googleReviewId },
      {
        $set: {
          reviewerName: review.name,
          rating: review.rating,
          text: review.text,
          profilePhotoUrl: review.profilePhotoUrl,
          relativePublishTimeDescription: review.relativePublishTimeDescription,
          publishTime: review.publishTime,
          updateTime: review.updateTime,
          source: review.source,
          placeId: review.placeId,
          placeName: review.placeName,
          googleMapsUrl: review.googleMapsUrl,
          syncedAt,
          isPublished: true,
        },
      },
      { upsert: true }
    );
  }

  return unique.length;
}

function serializeReview(item: any): ReviewRecord {
  return {
    name: item.reviewerName,
    role: item.role || "Google review",
    rating: Number(item.rating || 5),
    text: item.text,
    profilePhotoUrl: item.profilePhotoUrl || "",
  };
}

export async function getLandingReviews(): Promise<ReviewRecord[]> {
  try {
    await dbConnect();
    const latest: any = await GoogleReview.findOne({}).sort({ syncedAt: -1 }).lean();
    const isStale = !latest?.syncedAt || Date.now() - new Date(latest.syncedAt).getTime() > fifteenDaysMs;
    if (isStale && (process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_BUSINESS_ACCESS_TOKEN)) {
      await syncGoogleReviews();
    }

    const reviews = await GoogleReview.find({ isPublished: { $ne: false }, text: { $ne: "" } })
      .sort({ rating: -1, updateTime: -1, publishTime: -1, syncedAt: -1 })
      .limit(20)
      .lean();
    if (reviews.length) return reviews.map(serializeReview);
  } catch {
    return verifiedReviews;
  }
  return verifiedReviews;
}
