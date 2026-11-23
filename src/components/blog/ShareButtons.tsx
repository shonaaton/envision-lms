"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Facebook, Link2, Linkedin, Mail, Send, Share2 } from "lucide-react";

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

type Network = { id: string; label: string; icon: ReactNode; className: string; href: (url: string, text: string) => string };

const enc = encodeURIComponent;

const NETWORKS: Network[] = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    icon: <WhatsAppIcon />,
    className: "bg-[#25D366] text-white hover:bg-[#1ebe5a]",
    href: (url, text) => `https://wa.me/?text=${enc(`${text} ${url}`)}`,
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: <Facebook size={15} aria-hidden />,
    className: "bg-[#1877F2] text-white hover:bg-[#0f66d8]",
    href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
  },
  {
    id: "x",
    label: "X",
    icon: <XIcon />,
    className: "bg-black text-white hover:bg-neutral-800",
    href: (url, text) => `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(text)}`,
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: <Linkedin size={15} aria-hidden />,
    className: "bg-[#0A66C2] text-white hover:bg-[#08539e]",
    href: (url) => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`,
  },
  {
    id: "telegram",
    label: "Telegram",
    icon: <Send size={14} aria-hidden />,
    className: "bg-[#229ED9] text-white hover:bg-[#1a8bc0]",
    href: (url, text) => `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`,
  },
  {
    id: "email",
    label: "Email",
    icon: <Mail size={15} aria-hidden />,
    className: "bg-brand-50 text-brand-900 ring-1 ring-brand/15 hover:bg-brand/10",
    href: (url, text) => `mailto:?subject=${enc(text)}&body=${enc(`${text}\n\n${url}`)}`,
  },
];

// One fixed height for links and buttons alike: the site's touch-target rule
// gives <button> a 44px minimum that <a> doesn't get, which made "Copy link" taller.
const pill = "inline-flex h-9 !min-h-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-extrabold transition";

/**
 * Share links for a blog post. Plain links to each network's own share page, so
 * no third-party script loads and nothing is sent anywhere until the reader
 * clicks. Phones that support it also get the system share sheet.
 */
export default function ShareButtons({ url, title, heading = "Share this guide", className = "" }: { url: string; title: string; heading?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement("textarea");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, text: title, url });
    } catch {
      // Reader closed the sheet.
    }
  }

  return (
    <div className={className}>
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-brand-900/60">{heading}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {NETWORKS.map((network) => (
          <a
            key={network.id}
            href={network.href(url, title)}
            target={network.id === "email" ? undefined : "_blank"}
            rel="noopener noreferrer"
            className={`${pill} ${network.className}`}
            aria-label={`Share on ${network.label}`}
          >
            {network.icon} {network.label}
          </a>
        ))}
        <button type="button" onClick={copyLink} className={`${pill} bg-white text-brand-900 ring-1 ring-brand/20 hover:bg-brand-50`}>
          {copied ? <Check size={15} className="text-green-600" aria-hidden /> : <Link2 size={15} aria-hidden />}
          {copied ? "Link copied" : "Copy link"}
        </button>
        {canNativeShare ? (
          <button type="button" onClick={nativeShare} className={`${pill} bg-brand text-white hover:bg-brand-900`}>
            <Share2 size={14} aria-hidden /> More
          </button>
        ) : null}
      </div>
    </div>
  );
}
