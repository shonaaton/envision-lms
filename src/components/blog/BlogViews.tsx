"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Eye } from "lucide-react";

const API = "/api/blog/views";
/** One browser counts as one view per post per day, so refreshes don't inflate it. */
const RECOUNT_AFTER_MS = 24 * 60 * 60 * 1000;
const seenKey = (slug: string) => `blog-view:${slug}`;

export function formatViews(views: number) {
  if (views < 1000) return String(views);
  if (views < 100_000) return `${(views / 1000).toFixed(views < 10_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(views);
}

function Label({ views, className = "" }: { views: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} title={`${views.toLocaleString("en-IN")} views`}>
      <Eye size={15} className="text-brand" aria-hidden /> {formatViews(views)} {views === 1 ? "view" : "views"}
    </span>
  );
}

/**
 * The post page's own counter: records this visit (once a day per browser)
 * and shows the total. Renders nothing until the number arrives, so a slow or
 * failed request never leaves a "0 views" behind.
 */
export function PostViewCounter({ slug, className }: { slug: string; className?: string }) {
  const [views, setViews] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let alreadyCounted = false;
    try {
      const last = Number(window.localStorage.getItem(seenKey(slug)) || 0);
      alreadyCounted = Date.now() - last < RECOUNT_AFTER_MS;
    } catch {
      // Storage blocked: count the view; the server's rate limit still applies.
    }

    // Marked before the request, so an effect that runs twice (React dev mode,
    // a fast remount) reads the count instead of adding a second view.
    const forget = () => {
      try {
        window.localStorage.removeItem(seenKey(slug));
      } catch {
        /* ignore */
      }
    };
    if (!alreadyCounted) {
      try {
        window.localStorage.setItem(seenKey(slug), String(Date.now()));
      } catch {
        /* ignore */
      }
    }

    const request = alreadyCounted
      ? fetch(`${API}?slugs=${encodeURIComponent(slug)}`, { cache: "no-store" })
          .then((res) => res.json())
          .then((data) => data?.views?.[slug])
      : fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
          keepalive: true,
        })
          .then((res) => res.json())
          .then((data) => {
            if (typeof data?.views !== "number") forget();
            return data?.views;
          })
          .catch((error) => {
            forget();
            throw error;
          });

    request
      .then((count) => {
        if (!cancelled && typeof count === "number") setViews(count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (views === null) return null;
  return <Label views={views} className={className} />;
}

const ViewsContext = createContext<Record<string, number>>({});

/** Loads every card's count on /blog in one request. */
export function BlogViewsProvider({ slugs, children }: { slugs: string[]; children: ReactNode }) {
  const [views, setViews] = useState<Record<string, number>>({});
  const key = slugs.join(",");

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}?slugs=${encodeURIComponent(key)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.views && typeof data.views === "object") setViews(data.views);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key]);

  return <ViewsContext.Provider value={views}>{children}</ViewsContext.Provider>;
}

/** A card's count. Hidden until loaded, and for posts nobody has opened yet. */
export function CardViewCount({ slug, className }: { slug: string; className?: string }) {
  const views = useContext(ViewsContext)[slug];
  if (!views) return null;
  return <Label views={views} className={className} />;
}
