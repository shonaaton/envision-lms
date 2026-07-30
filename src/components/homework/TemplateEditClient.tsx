"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";

export default function TemplateEditClient({ id, initialJson }: { id: string; initialJson: string }) {
  const router = useRouter();
  const [json, setJson] = useState(initialJson);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const parsed = JSON.parse(json);
      const response = await fetch(`/api/admin/assignment-templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(data.error || "Could not save template");
      toast.success("Template saved");
      router.push("/admin/homework-templates");
      router.refresh();
    } catch {
      toast.error("Template JSON is not valid");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 text-slate-950">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.16em] text-brand">Template Editor</div>
            <h1 className="text-2xl font-black text-slate-950">Edit Assignment Template</h1>
            <p className="text-sm text-slate-500">Edit the JSON, then save. Use preview to test it as a student.</p>
          </div>
          <button disabled={saving} onClick={save} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-black text-white disabled:bg-slate-400">
            <Save size={16} /> {saving ? "Saving..." : "Save Template"}
          </button>
        </div>
        <textarea
          className="min-h-[68vh] w-full resize-y rounded-lg border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-50 outline-none focus:border-brand"
          value={json}
          onChange={(event) => setJson(event.target.value)}
          spellCheck={false}
        />
      </section>
    </div>
  );
}
