"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ExamFlow, type ExamActions } from "./ExamRunner";
import { createPreviewActions } from "./examPreview";

/** Admins sit a level's paper exactly as a student would, without anything being recorded. */
export default function ExamPreviewClient({ tier, level }: { tier: string; level: number }) {
  const [actions, setActions] = useState<ExamActions | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/exams?view=paper&tier=${encodeURIComponent(tier)}&level=${level}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not load the paper.");
        if (!data.paper) throw new Error("This level has no paper yet. Generate one on the Exams page first.");
        if (alive) setActions(createPreviewActions(data.paper, "/admin/exams"));
      })
      .catch((reason) => alive && setError(reason.message));
    return () => {
      alive = false;
    };
  }, [tier, level]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">
        {error} <Link href="/admin/exams" className="underline">Back to Exams</Link>
      </div>
    );
  }
  if (!actions) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" /> Loading the paper...
      </div>
    );
  }
  return <ExamFlow actions={actions} />;
}
