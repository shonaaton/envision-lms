"use client";

import { Fragment } from "react";
import { AlertCircle, Check, CheckCheck, Clock3 } from "lucide-react";
import type { WaMessage } from "./types";

// Render a small, safe subset of WhatsApp formatting. Never interpret HTML.
export function MessageText({ text }: { text: string }) {
  return <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{text.split(/(https?:\/\/[^\s<>]+|```[\s\S]*?```|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g).map((part, index) => {
    if (/^https?:\/\//i.test(part)) return <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{part}</a>;
    if (part.startsWith("```") && part.endsWith("```")) return <code key={index} className="rounded bg-black/10 px-1 font-mono">{part.slice(3, -3)}</code>;
    if (/^\*.+\*$/.test(part)) return <strong key={index}>{part.slice(1, -1)}</strong>;
    if (/^_.+_$/.test(part)) return <em key={index}>{part.slice(1, -1)}</em>;
    if (/^~.+~$/.test(part)) return <s key={index}>{part.slice(1, -1)}</s>;
    return <Fragment key={index}>{part}</Fragment>;
  })}</div>;
}

export function MessageStatus({ message }: { message: WaMessage }) {
  const status = message.uncertain ? "Unconfirmed" : message.status;
  const Icon = message.uncertain || status === "failed" ? AlertCircle : ["read", "delivered"].includes(status) ? CheckCheck : ["sent", "accepted"].includes(status) ? Check : Clock3;
  return <span className={`inline-flex items-center gap-1 ${status === "read" ? "text-sky-600" : status === "failed" ? "text-rose-700" : "text-slate-500"}`} title={message.error || status} aria-label={`Message ${status}`}><Icon size={13} /><span>{status}</span></span>;
}

export function MessageMedia({ message }: { message: WaMessage }) {
  if (!message.mediaUrl) return null;
  if (message.mediaKind === "image" || message.mediaKind === "sticker") return (
    <a href={message.mediaUrl} target="_blank" rel="noreferrer" className={`mb-2 grid place-items-center overflow-hidden rounded-md bg-black/5 ${message.mediaKind === "sticker" ? "h-28 w-28" : "h-52 w-64 max-w-full"}`}>
      {/* Fixed media boxes prevent loading an image from moving the thread. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={message.mediaUrl} alt={message.mediaFilename || "WhatsApp image"} loading="lazy" className="h-full max-h-52 w-full object-contain" />
    </a>
  );
  if (message.mediaKind === "video") return <video src={message.mediaUrl} controls preload="metadata" className="mb-2 h-52 w-64 max-w-full rounded-md bg-black" />;
  if (message.mediaKind === "audio") return <audio src={message.mediaUrl} controls preload="none" className="mb-2 h-14 w-64 max-w-full" />;
  return <a href={message.mediaUrl} target="_blank" rel="noreferrer" className="mb-2 block break-all font-semibold underline">{message.mediaFilename || "Open attachment"}</a>;
}
