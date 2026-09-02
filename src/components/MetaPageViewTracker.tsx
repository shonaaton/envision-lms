"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackMetaPageView } from "@/lib/metaPixel";

export default function MetaPageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const didSkipInitialPageView = useRef(false);
  const routeKey = `${pathname || ""}?${searchParams?.toString() || ""}`;

  useEffect(() => {
    if (!didSkipInitialPageView.current) {
      didSkipInitialPageView.current = true;
      return;
    }
    trackMetaPageView();
  }, [routeKey]);

  return null;
}
