"use client";

import { useEffect, useState } from "react";

export default function DemoAssessmentLeaveGuard() {
  const [pendingHref, setPendingHref] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (submitted) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function handleSubmit() {
      setSubmitted(true);
    }

    function handleClick(event: MouseEvent) {
      if (submitted || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") || "";
      if (!href || href.startsWith("#") || anchor.target === "_blank") return;
      event.preventDefault();
      setPendingHref(anchor.href);
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("submit", handleSubmit, true);
    document.addEventListener("click", handleClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("submit", handleSubmit, true);
      document.removeEventListener("click", handleClick, true);
    };
  }, [submitted]);

  if (!pendingHref) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
        <h2 className="text-lg font-black text-slate-950">Submit assessment first</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          This demo was marked present. Please submit the assessment before leaving, so admin can follow up with the parent.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setPendingHref("")} className="btn-primary">Stay and Submit</button>
          <button type="button" onClick={() => window.location.assign(pendingHref)} className="btn-outline bg-white">Leave Anyway</button>
        </div>
      </div>
    </div>
  );
}
