import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";
import { ImageOff, RefreshCw } from "lucide-react";

/**
 * SmartImage — single image primitive for the entire app.
 *
 * Replaces the legacy pattern of `onError={e => e.currentTarget.style.display = "none"}`,
 * which permanently hides nodes on transient CDN failures (Cloudflare cold cache,
 * CORS preflight reorder, brief 5xx). This primitive instead:
 *
 *   - retries the load with a bounded `?_r=N` cache-buster (max 2 retries → 3 loads),
 *   - paces retries 2s → 5s so we don't burn an attempt on the same cold-start race,
 *   - defers first load via IntersectionObserver (replaces `loading="lazy"` so the
 *     retry chain isn't interrupted by lazy-load races); calls `unobserve` on first
 *     intersection so fast-scroll can't re-toggle the load,
 *   - renders a React fallback in the same box on terminal failure (no DOM mutation,
 *     no layout jump — width/height/aspectRatio are required),
 *   - exposes `onRetry` / `onTerminalFailure` callbacks for future telemetry,
 *   - supports `srcFallbacks` for *domain-level* URL substitution
 *     (e.g. YouTube maxresdefault → hqdefault), which is consumed before the
 *     cache-buster retry chain.
 *
 * IMPORTANT: never reach into the DOM from an onError. If you need failure
 * behavior, pass `fallback` or use `onTerminalFailure`.
 */

type DivStyleProps = {
  /** Required so the fallback fills the same box and layout never jumps. */
  width?: number | string;
  height?: number | string;
  /** Alternative to width/height — e.g. "16/9" or 1.7777. */
  aspectRatio?: string | number;
};

export interface SmartImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "onError" | "onLoad" | "loading">,
    DivStyleProps {
  src: string;
  alt: string;
  /** Skip the IntersectionObserver and load immediately. */
  eager?: boolean;
  /**
   * Ordered list of *domain-level* alternative URLs tried before the
   * cache-buster retry chain begins. Useful for YouTube thumb downgrades.
   */
  srcFallbacks?: string[];
  /** Custom fallback render. Receives a retry function so callers (e.g. lightbox) can offer recovery. */
  fallback?: (ctx: { retry: () => void; src: string }) => ReactNode;
  /** Number of cache-buster retries after the srcFallbacks chain is exhausted. Default 2. */
  maxRetries?: number;
  /** Backoff schedule in ms. Default [2000, 5000]. */
  backoffMs?: number[];
  onLoadOk?: () => void;
  onRetry?: (info: { src: string; attempt: number }) => void;
  onTerminalFailure?: (info: { src: string }) => void;
}

const DEFAULT_BACKOFF = [2000, 5000];

const SmartImage = forwardRef<HTMLImageElement, SmartImageProps>(function SmartImage(
  {
    src,
    alt,
    eager = false,
    srcFallbacks,
    fallback,
    maxRetries = 2,
    backoffMs = DEFAULT_BACKOFF,
    width,
    height,
    aspectRatio,
    style,
    className,
    onLoadOk,
    onRetry,
    onTerminalFailure,
    ...rest
  },
  ref,
) {
  const [shouldLoad, setShouldLoad] = useState(eager);
  // Index into [src, ...srcFallbacks]. -1 means "still on cache-buster phase".
  const [fallbackIdx, setFallbackIdx] = useState(0);
  // Cache-buster attempt count (0..maxRetries). 0 means no buster yet.
  const [bustAttempt, setBustAttempt] = useState(0);
  const [terminallyFailed, setTerminallyFailed] = useState(false);

  const placeholderRef = useRef<HTMLSpanElement | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const terminalFiredRef = useRef(false);

  // Reset state when src or srcFallbacks change.
  // IMPORTANT: depend on a *stable* signature, not the array identity. Callers
  // frequently pass `srcFallbacks={fn(src)}` inline (e.g. MediaLightbox), which
  // produces a new array reference on every parent render. If we depended on
  // the array identity directly we'd reset state every render, re-trigger the
  // load, and potentially wedge the browser when many SmartImages render at
  // once (e.g. 40+ tile gallery).
  const fallbackKey = (srcFallbacks ?? []).join("|");
  useEffect(() => {
    setFallbackIdx(0);
    setBustAttempt(0);
    setTerminallyFailed(false);
    terminalFiredRef.current = false;
  }, [src, fallbackKey]);

  // IntersectionObserver gating. Skipped when eager.
  useEffect(() => {
    if (eager || shouldLoad) return;
    const el = placeholderRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            obs.unobserve(entry.target);
            setShouldLoad(true);
          }
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [eager, shouldLoad]);

  // Clear pending retry timer on unmount.
  useEffect(() => {
    return () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  const sources = useMemo(() => [src, ...(srcFallbacks ?? [])], [src, fallbackKey]);
  const currentBaseSrc = sources[Math.min(fallbackIdx, sources.length - 1)];
  const resolvedSrc = bustAttempt > 0
    ? appendCacheBuster(currentBaseSrc, bustAttempt)
    : currentBaseSrc;

  // Defensive: if every candidate URL is structurally invalid, short-circuit to
  // the fallback rather than burning the retry chain on an unloadable string.
  const allInvalid = useMemo(
    () => sources.every((u) => !isLikelyValidHttpUrl(u)),
    [sources],
  );

  // Box style for the placeholder/fallback span — needs aspectRatio so layout
  // doesn't jump while the image is pending or has terminally failed.
  const boxStyle: CSSProperties = useMemo(() => {
    const s: CSSProperties = { ...style };
    if (width !== undefined) s.width = width;
    if (height !== undefined) s.height = height;
    if (aspectRatio !== undefined) s.aspectRatio = String(aspectRatio);
    return s;
  }, [style, width, height, aspectRatio]);

  // Style for the actual <img> element — intentionally OMITS aspectRatio.
  // An <img> already has an intrinsic aspect ratio from the loaded bitmap;
  // forcing CSS aspect-ratio on top of that, with no explicit width set,
  // collapses the element to width:0 inside flex containers (e.g. the
  // MediaLightbox content wrapper). We only need width/height passthrough so
  // that callers like GalleryThumb (which DO pass width/height) still constrain
  // the rendered img.
  const imgStyle: CSSProperties = useMemo(() => {
    const s: CSSProperties = { ...style };
    if (width !== undefined) s.width = width;
    if (height !== undefined) s.height = height;
    return s;
  }, [style, width, height]);

  const handleError = useCallback(() => {
    // 1) Walk the domain-level fallback chain first (no backoff — these are
    //    deterministic substitutions, not retry-the-network attempts).
    if (fallbackIdx < sources.length - 1) {
      setFallbackIdx((i) => i + 1);
      return;
    }
    // 2) Then enter the cache-buster retry chain with backoff.
    if (bustAttempt < maxRetries) {
      const nextAttempt = bustAttempt + 1;
      const delay = backoffMs[bustAttempt] ?? backoffMs[backoffMs.length - 1] ?? 2000;
      onRetry?.({ src: currentBaseSrc, attempt: nextAttempt });
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        setBustAttempt(nextAttempt);
      }, delay);
      return;
    }
    // 3) Exhausted.
    if (!terminalFiredRef.current) {
      terminalFiredRef.current = true;
      onTerminalFailure?.({ src: currentBaseSrc });
    }
    setTerminallyFailed(true);
  }, [
    fallbackIdx,
    sources.length,
    bustAttempt,
    maxRetries,
    backoffMs,
    currentBaseSrc,
    onRetry,
    onTerminalFailure,
  ]);

  const handleLoad = useCallback(() => {
    onLoadOk?.();
  }, [onLoadOk]);

  const resetForRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setFallbackIdx(0);
    setBustAttempt(0);
    setTerminallyFailed(false);
    terminalFiredRef.current = false;
    if (!eager) setShouldLoad(true);
  }, [eager]);

  if (terminallyFailed || allInvalid) {
    return (
      <span className={className} style={boxStyle} data-smart-image="failed">
        {fallback
          ? fallback({ retry: resetForRetry, src: currentBaseSrc })
          : <DefaultFallback />}
      </span>
    );
  }

  if (!shouldLoad) {
    return (
      <span
        ref={placeholderRef}
        className={className}
        style={boxStyle}
        data-smart-image="pending"
        aria-hidden="true"
      />
    );
  }

  return (
    <img
      {...rest}
      ref={ref}
      src={resolvedSrc}
      alt={alt}
      className={className}
      style={imgStyle}
      decoding="async"
      onError={handleError}
      onLoad={handleLoad}
    />
  );
});

function DefaultFallback() {
  return (
    <span className="flex h-full w-full items-center justify-center bg-muted/30 text-muted-foreground">
      <ImageOff className="h-6 w-6 opacity-50" aria-hidden="true" />
    </span>
  );
}

/** Lightbox-style fallback with a retry button. Exported for explicit use at high-intent surfaces. */
export function LightboxRetryFallback({ retry }: { retry: () => void; src: string }) {
  return (
    <span className="flex h-full w-full flex-col items-center justify-center gap-3 bg-card/40 text-muted-foreground">
      <ImageOff className="h-10 w-10 opacity-60" aria-hidden="true" />
      <span className="text-xs">Image failed to load</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); retry(); }}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-3 py-1.5 text-xs text-foreground hover:bg-background/80 transition-colors"
      >
        <RefreshCw className="h-3 w-3" /> Retry
      </button>
    </span>
  );
}

function appendCacheBuster(url: string, attempt: number): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_r=${attempt}`;
}

function isLikelyValidHttpUrl(u: string): boolean {
  if (!u || typeof u !== "string") return false;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export default SmartImage;
