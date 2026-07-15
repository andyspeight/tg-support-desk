"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * A full-screen image preview. Clicking a screenshot opens it here in a modal
 * overlay rather than a new browser tab — the agent stays on the ticket.
 * Closes on the backdrop, the ✕, or Escape; locks body scroll while open.
 */
export function LightboxOverlay({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Image preview"}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
      >
        <X className="h-5 w-5" strokeWidth={2} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed-redirect URL, next/image would need the storage host allow-listed */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-[92vw] cursor-default rounded-lg object-contain shadow-2xl"
      />
    </div>
  );
}

/**
 * A clickable image thumbnail that opens {@link LightboxOverlay}. Drop-in
 * replacement for an `<a target="_blank"><img/></a>` thumbnail.
 */
export function LightboxImage({
  src,
  alt,
  thumbClassName,
  imgClassName,
}: {
  src: string;
  alt: string;
  thumbClassName?: string;
  imgClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={alt}
        aria-label={`View ${alt || "image"}`}
        className={`cursor-zoom-in ${thumbClassName ?? ""}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- signed-redirect URL, next/image would need the storage host allow-listed */}
        <img src={src} alt={alt} loading="lazy" className={imgClassName} />
      </button>
      {open && <LightboxOverlay src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}
