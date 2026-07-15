"use client";

import { useState, type MouseEvent } from "react";
import { LightboxOverlay } from "./image-lightbox";

/**
 * Renders an already-sanitised email/message HTML body and opens any embedded
 * image in the lightbox on click (rather than navigating away). The HTML is
 * sanitised server-side by sanitizeEmailHtml with the message's attachment
 * context, so every <img> here points at this message's auth-gated attachment
 * URL — never a remote source.
 */
export function EmailBody({ html, className }: { html: string; className?: string }) {
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(null);

  function onClick(e: MouseEvent<HTMLDivElement>) {
    const el = e.target as HTMLElement;
    if (el.tagName !== "IMG") return;
    const img = el as HTMLImageElement;
    e.preventDefault();
    setPreview({ src: img.currentSrc || img.src, alt: img.alt || "image" });
  }

  return (
    <>
      <div className={className} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
      {preview && <LightboxOverlay src={preview.src} alt={preview.alt} onClose={() => setPreview(null)} />}
    </>
  );
}
