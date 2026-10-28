"use client";
import { MessageText } from "./MessageContent";
import { renderTemplateBody, type TemplateDraft } from "@/lib/whatsappTemplateRules";

export default function TemplatePreview({ template, values }: { template: Pick<TemplateDraft, "body" | "header" | "footer" | "buttons" | "variables">; values?: string[] }) {
  return <div className="rounded-xl bg-[#f4f0e5] p-5"><div className="mx-auto max-w-sm overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
    <div className="space-y-2 p-4 text-sm">{template.header ? <p className="font-bold">{template.header}</p> : null}<MessageText text={renderTemplateBody(template.body, values || template.variables.map((variable) => variable.sample || `{{${variable.position}}}`))} />{template.footer ? <p className="text-xs text-slate-500">{template.footer}</p> : null}</div>
    {template.buttons.map((button, index) => <div key={index} className="border-t px-3 py-2 text-center text-sm font-semibold text-sky-700">{button.text}</div>)}
  </div><p className="mt-3 text-center text-xs text-slate-500">Message preview</p></div>;
}
