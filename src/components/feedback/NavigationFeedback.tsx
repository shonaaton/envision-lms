"use client";

import { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    setVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, [pathname, searchParams]);

  useEffect(() => {
    function scheduleLoader(delay = 120) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setVisible(true), delay);
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const link = target?.closest?.("a") as HTMLAnchorElement | null;
      if (!link) return;
      if (link.target || link.download || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const href = link.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const next = new URL(href, window.location.href);
      const current = new URL(window.location.href);
      if (next.origin !== window.location.origin || comparableUrl(next) === comparableUrl(current)) return;
      scheduleLoader();
    };

    const onSubmit = (event: SubmitEvent) => {
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

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return <PageLoadingOverlay visible={visible} message="Loading latest view..." />;
}
