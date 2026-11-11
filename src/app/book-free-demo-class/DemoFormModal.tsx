"use client";

import { useEffect, useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, X } from "lucide-react";
import "./form/form.css";

const DemoRequestForm = dynamic(() => import("./form/DemoRequestForm"), {
  ssr: false,
  loading: () => (
    <div className="dform-modal-loading" role="status">
      <Loader2 className="dform-spin" size={26} aria-hidden="true" />
      <span>Loading the form</span>
    </div>
  ),
});

/**
 * The free demo form as a pop-up over the landing page.
 *
 * The page's buttons stay plain links to `formHref`, the form's own page, so
 * they still work before this loads, without JavaScript, and in a new tab.
 * This catches a normal click on any of them and opens the dialog instead.
 * The listener is on the capture phase: Next's <Link> navigates from its own
 * click handler unless the event is already prevented by the time it runs.
 *
 * A native <dialog>, for its focus trap, Escape key and backdrop. The form is
 * fetched on the first open and stays mounted after that, so closing the
 * pop-up by accident does not lose what a parent has typed.
 */
export default function DemoFormModal({ formHref }: { formHref: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState(false);
  const titleId = useId();

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.origin !== window.location.origin || link.pathname !== formHref) return;
      const box = dialog.current;
      if (!box || typeof box.showModal !== "function") return;
      event.preventDefault();
      setOpened(true);
      if (!box.open) box.showModal();
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [formHref]);

  // A modal dialog does not stop the page behind it from scrolling.
  useEffect(() => {
    const box = dialog.current;
    if (!box) return;
    const root = document.documentElement;
    const sync = () => root.classList.toggle("dform-modal-open", box.open);
    const observer = new MutationObserver(sync);
    observer.observe(box, { attributes: true, attributeFilter: ["open"] });
    return () => {
      observer.disconnect();
      root.classList.remove("dform-modal-open");
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="dform-modal"
      aria-labelledby={titleId}
      // The dialog element itself is only ever the click target on its backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="dform dform-modal-box">
        <div className="dform-rank" aria-hidden="true" />
        <button type="button" className="dform-modal-close" aria-label="Close" onClick={() => dialog.current?.close()}>
          <X size={20} aria-hidden="true" />
        </button>
        <div className="dform-modal-body">{opened ? <DemoRequestForm embedded titleId={titleId} /> : null}</div>
      </div>
    </dialog>
  );
}
