"use client";

import { useState, type CSSProperties } from "react";
import { cx } from "@/components/ui";

/**
 * Robust image for the lesson.
 *
 * Why not `next/image`? Its `/_next/image` optimisation endpoint is not available on every
 * hosting setup (static export, some Netlify/Vercel configurations, disabled image optimisation),
 * which makes images silently disappear after deployment. This component loads the file straight
 * from `/public` (always served as a static asset) and shows a styled fallback if the request
 * still fails, so the layout never breaks.
 */
export type LessonImageProps = {
  src: string;
  alt: string;
  className?: string;
  /** Absolute-fill behaviour like `next/image` `fill` (default: true) */
  fill?: boolean;
  priority?: boolean;
  /** Emoji shown in the fallback box */
  fallbackIcon?: string;
  /** Text shown in the fallback box (defaults to alt) */
  fallbackLabel?: string;
  style?: CSSProperties;
};

export function assetUrl(src: string): string {
  if (/^(https?:)?\/\//.test(src) || src.startsWith("data:") || src.startsWith("blob:")) return src;
  const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
  return `${base}${src.startsWith("/") ? "" : "/"}${src}`;
}

export default function LessonImage({ src, alt, className, fill = true, priority = false, fallbackIcon = "🏰", fallbackLabel, style }: LessonImageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cx(
          fill ? "absolute inset-0" : "",
          "flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-sand via-gold-light to-saudi-light text-ink/60",
          className,
        )}
        style={style}
      >
        <span className="text-5xl drop-shadow">{fallbackIcon}</span>
        {(fallbackLabel ?? alt) && <span className="px-3 text-center font-heading text-sm font-bold">{fallbackLabel ?? alt}</span>}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={assetUrl(src)}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      draggable={false}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      className={cx(fill ? "absolute inset-0 h-full w-full" : "", "transition-opacity duration-500", loaded ? "opacity-100" : "opacity-0", className)}
      style={style}
    />
  );
}
