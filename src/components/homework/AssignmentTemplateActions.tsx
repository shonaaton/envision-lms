"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, PowerOff } from "lucide-react";

export function ImportHomeworkPgnButton() {
  const router = useRouter();

  async function runImport() {
    const response = await fetch("/api/admin/assignment-templates/from-pgns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ importBatchId: new Date().toISOString() }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(data.error || "Could not import PGN templates");
    toast.success(`Imported ${data.imported || 0} homework template${Number(data.imported || 0) === 1 ? "" : "s"}`);
    router.refresh();
  }

  return (
    <button type="button" onClick={runImport} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-black text-white">
      <FileUp size={16} /> Import HW PGNs
    </button>
  );
}

export function DeactivateTemplateButton({ id }: { id: string }) {
  const router = useRouter();

  async function deactivate() {
    if (!window.confirm("Deactivate this template? It will stop auto-assigning.")) return;
    const response = await fetch(`/api/admin/assignment-templates/${id}`, { method: "DELETE" });
    if (!response.ok) return toast.error("Could not deactivate template");
    toast.success("Template deactivated");
    router.refresh();
  }

  return (
    <button type="button" onClick={deactivate} className="grid h-9 w-9 place-items-center rounded-lg border border-red-100 text-red-600 hover:bg-red-50" title="Deactivate template">
      <PowerOff size={15} />
    </button>
  );
}
