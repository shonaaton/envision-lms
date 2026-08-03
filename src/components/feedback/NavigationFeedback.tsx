"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import PageLoadingOverlay from "./PageLoadingOverlay";

function comparableUrl(url: URL) {
  return `${url.origin}${url.pathname}${url.search}`;
}

export default function NavigationFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failsafeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLoaderTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (failsafeTimerRef.current) clearTimeout(failsafeTimerRef.current);
    timerRef.current = null;
    failsafeTimerRef.current = null;
  }, []);

  const hideLoader = useCallback(() => {
    clearLoaderTimers();
    setVisible(false);
  }, [clearLoaderTimers]);

  useEffect(() => {
    setVisible(false);
    clearLoaderTimers();
  }, [clearLoaderTimers, pathname, searchParams]);

  useEffect(() => {
    function scheduleLoader(delay = 120) {
      clearLoaderTimers();
      timerRef.current = setTimeout(() => setVisible(true), delay);
      // Never let a cancelled navigation or a failed route transition leave a
      // full-page loader covering the application indefinitely.
      failsafeTimerRef.current = setTimeout(() => setVisible(false), 10_000);
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const link = target?.closest?.("a") as HTMLAnchorElement | null;
      if (!link) return;
      if (event.defaultPrevented || link.getAttribute("aria-disabled") === "true" || link.hasAttribute("data-no-navigation-loader")) return;
      if (link.target || link.download || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const href = link.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return;
      const next = new URL(href, window.location.href);
      const current = new URL(window.location.href);
      if (next.origin !== window.location.origin || comparableUrl(next) === comparableUrl(current)) return;
      scheduleLoader();
    };

    const onSubmit = (event: SubmitEvent) => {
      if (event.defaultPrevented) return;
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form) return;
      const method = String(form.getAttribute("method") || "get").toLowerCase();
      if (method !== "get") return;
      if (form.target && form.target !== "_self") return;

      const action = form.getAttribute("action") || window.location.href;
      const target = new URL(action, window.location.href);
      if (target.origin !== window.location.origin || target.pathname.startsWith("/api/")) return;
      scheduleLoader(80);
    };

    // Bubble phase runs after React handlers, allowing prevented clicks and
    // submissions to be ignored instead of showing a false navigation loader.
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    window.addEventListener("pageshow", hideLoader);
    window.addEventListener("popstate", hideLoader);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
      window.removeEventListener("pageshow", hideLoader);
      window.removeEventListener("popstate", hideLoader);
      clearLoaderTimers();
    };
  }, [clearLoaderTimers, hideLoader]);

  return <PageLoadingOverlay visible={visible} message="Loading latest view..." />;
}
