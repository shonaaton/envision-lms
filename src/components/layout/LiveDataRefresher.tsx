"use client";

import { RefreshCw } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

declare global {
  interface Window {
    __lmsFetchPatched?: boolean;
  }
}

type RefreshDetail = {
  silent?: boolean;
  source?: string;
};

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const quietMutationPatterns = [
  /^\/api\/classrooms\/[^/]+\/live\/move$/,
  /^\/api\/classrooms\/[^/]+\/live\/chat$/,
  /^\/api\/classrooms\/[^/]+\/live\/responses$/,
  /^\/api\/tournaments\/games\/[^/]+\/move$/,
];

const liveClassroomPattern = /^\/api\/classrooms\/[^/]+\/live$/;

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestMethod(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) {
  if (init?.method) return String(init.method).toUpperCase();
  if (typeof input !== "string" && !(input instanceof URL) && input.method) return input.method.toUpperCase();
  return "GET";
}

function bodyText(init?: Parameters<typeof fetch>[1]) {
  const body = init?.body;
  return typeof body === "string" ? body : "";
}

function isSameOriginAppApi(rawUrl: string) {
  try {
    const url = new URL(rawUrl, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function shouldEmitRefresh(rawUrl: string, method: string, body: string) {
  if (!MUTATING_METHODS.has(method) || !isSameOriginAppApi(rawUrl)) return false;

  const url = new URL(rawUrl, window.location.origin);
  const path = url.pathname;

  if (quietMutationPatterns.some((pattern) => pattern.test(path))) return false;

  if (liveClassroomPattern.test(path)) {
    return /"endedAt"|"status"\s*:\s*"ended"|"status"\s*:\s*"completed"|"participants"\s*:\s*\[\]/i.test(body);
  }

  return true;
}

function freshApiFetchArgs(input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1] | undefined, method: string, url: string) {
  if ((method !== "GET" && method !== "HEAD") || !isSameOriginAppApi(url)) return [input, init] as Parameters<typeof fetch>;

  const requestCache = typeof input !== "string" && !(input instanceof URL) ? input.cache : undefined;
  if (init?.cache || requestCache === "no-store") return [input, init] as Parameters<typeof fetch>;

  return [input, { ...init, cache: "no-store" }] as Parameters<typeof fetch>;
}

function patchFetchOnce() {
  if (typeof window === "undefined" || window.__lmsFetchPatched) return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = (async (...args: Parameters<typeof fetch>) => {
    const [input, init] = args;
    const method = requestMethod(input, init);
    const url = requestUrl(input);
    const body = bodyText(init);
    const freshArgs = freshApiFetchArgs(input, init, method, url);
    const response = await originalFetch(...freshArgs);

    if (response.ok && shouldEmitRefresh(url, method, body)) {
      window.dispatchEvent(
        new CustomEvent<RefreshDetail>("lms:data-changed", {
          detail: { source: new URL(url, window.location.origin).pathname },
        }),
      );
    }

    return response;
  }) as typeof fetch;

  window.__lmsFetchPatched = true;
}

export default function LiveDataRefresher() {
  const router = useRouter();
  const pathname = usePathname();
  const isLiveClassroomRoute = /^\/classrooms\/[^/]+(?:\/live)?$/.test(pathname || "");
  const isQuietRefreshRoute = isLiveClassroomRoute || (pathname || "").startsWith("/pgn");
  const [showSync, setShowSync] = useState(false);
  const [isPending, startTransition] = useTransition();
  const refreshTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const lastRefreshRef = useRef(Date.now());

  const clearTimers = useCallback(() => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    refreshTimerRef.current = null;
    hideTimerRef.current = null;
  }, []);

  const refreshNow = useCallback(
    ({ silent = false }: RefreshDetail = {}) => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (isQuietRefreshRoute) return;
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);

      refreshTimerRef.current = window.setTimeout(() => {
        lastRefreshRef.current = Date.now();
        if (!silent) setShowSync(true);

        startTransition(() => {
          router.refresh();
        });

        if (!silent) {
          if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
          hideTimerRef.current = window.setTimeout(() => setShowSync(false), 950);
        }
      }, silent ? 0 : 450);
    },
    [isQuietRefreshRoute, router],
  );

  useEffect(() => {
    if (isQuietRefreshRoute) return;
    patchFetchOnce();
  }, [isQuietRefreshRoute]);

  useEffect(() => {
    if (isQuietRefreshRoute) return;
    const onDataChanged = (event: Event) => {
      const detail = (event as CustomEvent<RefreshDetail>).detail || {};
      refreshNow(detail);
    };

    const onFocus = () => {
      if (Date.now() - lastRefreshRef.current > 6000) refreshNow();
    };

    const onVisibilityChange = () => {
      if (!document.hidden && Date.now() - lastRefreshRef.current > 6000) refreshNow();
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted || Date.now() - lastRefreshRef.current > 6000) refreshNow({ silent: true });
    };

    window.addEventListener("lms:data-changed", onDataChanged);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("lms:data-changed", onDataChanged);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearTimers();
    };
  }, [clearTimers, isQuietRefreshRoute, refreshNow]);

  useEffect(() => {
    if (isQuietRefreshRoute) return;
    const interval = window.setInterval(() => {
      if (!document.hidden && Date.now() - lastRefreshRef.current > 25000) {
        refreshNow({ silent: true });
      }
    }, 30000);

    return () => window.clearInterval(interval);
  }, [isQuietRefreshRoute, refreshNow]);

  useEffect(() => {
    setShowSync(false);
  }, [pathname]);

  if (isQuietRefreshRoute) return null;
  if (!showSync && !isPending) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[90] flex items-center gap-2 rounded-full border border-[#ead7ef] bg-white/95 px-4 py-2 text-sm font-semibold text-[#5a1372] shadow-[0_18px_50px_rgba(90,19,114,0.18)] backdrop-blur">
      <RefreshCw className="h-4 w-4 animate-spin" />
      Loading latest data
    </div>
  );
}
