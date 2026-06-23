"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import PageLoadingOverlay from "./PageLoadingOverlay";

export default function NavigationFeedback() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const link = target?.closest?.("a") as HTMLAnchorElement | null;
      if (!link) return;
      if (link.target || link.download || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const href = link.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const next = new URL(href, window.location.href);
      if (next.origin !== window.location.origin || next.pathname === window.location.pathname) return;
      timerRef.current = setTimeout(() => setVisible(true), 120);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return <PageLoadingOverlay visible={visible} message="Opening page..." />;
}
