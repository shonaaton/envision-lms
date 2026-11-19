"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";

type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/** Resends a coach no-show ruling's WhatsApp messages, and says what happened. */
export function ResendWhatsAppButton({
  classroomId,
  sessionId,
  action,
}: {
  classroomId: string;
  sessionId: string;
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function resend() {
    if (!window.confirm("Resend the WhatsApp message to the family and the coach?")) return;
    const formData = new FormData();
    formData.set("classroom", classroomId);
    formData.set("sessionId", sessionId);
    startTransition(async () => {
      const result = await action(formData);
      window.alert(result.ok ? result.message : result.error);
      router.refresh();
    });
  }

  return (
    <button type="button" onClick={resend} disabled={pending} className="btn-ghost h-8 px-3 text-xs">
      <MessageCircle size={13} /> {pending ? "Sending..." : "Resend WhatsApp"}
    </button>
  );
}
