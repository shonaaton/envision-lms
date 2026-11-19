"use client";

import { useEffect } from "react";

/** Opens the dialler as soon as the page loads; the page's own button is the fallback. */
export default function CallRedirect({ href }: { href: string }) {
  useEffect(() => {
    window.location.href = href;
  }, [href]);
  return null;
}
