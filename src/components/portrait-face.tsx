"use client";
/* eslint-disable @next/next/no-img-element */

/** Shared portrait frame (4:5); image fills via object-cover. */
export function PortraitFace({
  src,
  alt,
  widthClassName,
  className = "",
}: {
  src: string;
  alt: string;
  /** Tailwind width (e.g. w-14, w-full); height follows aspect-[4/5]. */
  widthClassName: string;
  className?: string;
}) {
  return (
    <div
      className={`relative aspect-[4/5] shrink-0 overflow-hidden border-2 border-slate-900 ${widthClassName}${className ? ` ${className}` : ""}`}
    >
      <img src={src} alt={alt} className="h-full w-full object-cover" />
    </div>
  );
}

/** Allow labels to wrap across up to two lines without overflowing. */
export const nameTwoLinesClassName = "line-clamp-2 break-words leading-tight";
