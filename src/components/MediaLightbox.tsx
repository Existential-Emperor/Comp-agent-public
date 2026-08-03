import React, { useState, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Play, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { overlayVariants, lightboxContentVariants } from "@/lib/animations";
import SmartImage, { LightboxRetryFallback } from "@/components/SmartImage";

export interface MediaItem {
  type: "image" | "video";
  src: string;
  alt?: string;
  pageUrl?: string;
}

interface MediaLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  items: MediaItem[];
  currentIndex: number;
  onNavigate: (index: number) => void;
}

const MediaLightbox = React.forwardRef<HTMLDivElement, MediaLightboxProps>(function MediaLightbox(
  { isOpen, onClose, items, currentIndex, onNavigate },
  ref,
) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && currentIndex > 0) onNavigate(currentIndex - 1);
      if (e.key === "ArrowRight" && currentIndex < items.length - 1) onNavigate(currentIndex + 1);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose, currentIndex, items.length, onNavigate]);

  if (!isOpen || items.length === 0) return null;

  const current = items[currentIndex];
  if (!current) return null;

  const embedUrl = getEmbedUrl(current.src);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;

  const lightbox = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={ref}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-sm"
          onClick={onClose}
          variants={overlayVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {/* Close button */}
          <motion.button
            onClick={onClose}
            className="absolute top-4 right-4 z-50 rounded-full bg-background/20 p-2 text-white hover:bg-background/40 transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <X className="h-6 w-6" />
          </motion.button>

          {/* Counter */}
          {items.length > 1 && (
            <motion.div
              className="absolute top-4 left-1/2 -translate-x-1/2 z-50 text-white/70 text-xs bg-black/40 px-3 py-1 rounded-full"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              {currentIndex + 1} / {items.length}
            </motion.div>
          )}

          {/* Previous arrow */}
          <motion.button
            onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex - 1); }}
            className={`absolute left-4 top-1/2 -translate-y-1/2 z-50 rounded-full bg-background/20 p-2 text-white hover:bg-background/40 transition-colors ${!hasPrev ? "opacity-0 pointer-events-none" : ""}`}
            whileHover={hasPrev ? { scale: 1.1, x: -2 } : {}}
            whileTap={hasPrev ? { scale: 0.9 } : {}}
          >
            <ChevronLeft className="h-8 w-8" />
          </motion.button>

          {/* Next arrow */}
          <motion.button
            onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex + 1); }}
            className={`absolute right-4 top-1/2 -translate-y-1/2 z-50 rounded-full bg-background/20 p-2 text-white hover:bg-background/40 transition-colors ${!hasNext ? "opacity-0 pointer-events-none" : ""}`}
            whileHover={hasNext ? { scale: 1.1, x: 2 } : {}}
            whileTap={hasNext ? { scale: 0.9 } : {}}
          >
            <ChevronRight className="h-8 w-8" />
          </motion.button>

          <motion.div
            className="relative max-h-[90vh] max-w-[90vw] flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
            variants={lightboxContentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            key={currentIndex}
          >
            {current.type === "image" ? (
              <SmartImage
                src={current.src}
                srcFallbacks={getYouTubeThumbDowngrade(current.src)}
                alt={current.alt || "Product screenshot"}
                className="h-[78vh] w-[85vw] max-w-[1280px] object-contain rounded-t-lg shadow-2xl"
                aspectRatio="16/9"
                eager
                fallback={(ctx) => <LightboxRetryFallback {...ctx} />}
              />
            ) : embedUrl ? (
              <iframe
                src={embedUrl}
                className="w-[85vw] h-[78vh] max-w-[1280px] max-h-[720px] rounded-t-lg shadow-2xl"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="flex flex-col items-center gap-4 p-8 bg-card rounded-lg">
                <p className="text-foreground text-sm">Cannot embed this video directly.</p>
                <a
                  href={current.src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Video
                </a>
              </div>
            )}

            {/* Context info bar */}
            {(current.alt || current.pageUrl) && (
              <motion.div
                className="w-full max-w-[85vw] bg-black/60 backdrop-blur-sm rounded-b-lg px-4 py-2.5 flex items-center justify-between gap-4"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                {current.alt && (
                  <p className="text-white/90 text-xs truncate flex-1">{current.alt}</p>
                )}
                {current.pageUrl && (
                  <a
                    href={current.pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 text-white/70 hover:text-white text-[11px] shrink-0 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {(() => {
                      try { return new URL(current.pageUrl).hostname; } catch { return "Source"; }
                    })()}
                  </a>
                )}
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(lightbox, document.body);
});

/** Extract embeddable URL from YouTube/Vimeo links */
function getEmbedUrl(url: string): string | null {
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`;
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`;
  return null;
}

/** Get YouTube thumbnail URL (small for inline previews) */
export function getYouTubeThumbnail(url: string): string | null {
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
  return null;
}

/** Get high-res YouTube thumbnail URL (for lightbox) */
export function getYouTubeMaxResThumbnail(url: string): string | null {
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return `https://img.youtube.com/vi/${ytMatch[1]}/maxresdefault.jpg`;
  return null;
}

/**
 * For a YouTube `maxresdefault` URL, returns the deterministic downgrade chain
 * that SmartImage should walk before entering its cache-buster retry phase.
 * (maxresdefault doesn't exist for every video; hqdefault always does.)
 */
export function getYouTubeThumbDowngrade(url: string): string[] | undefined {
  const m = url.match(/img\.youtube\.com\/vi\/([a-zA-Z0-9_-]{11})\/maxresdefault/);
  if (!m) return undefined;
  return [`https://img.youtube.com/vi/${m[1]}/hqdefault.jpg`];
}

/** Attempt to get a higher-resolution version of an image URL */
export function getHighResImageUrl(url: string): string {
  const ytThumbMatch = url.match(/img\.youtube\.com\/vi\/([a-zA-Z0-9_-]{11})\/(hqdefault|mqdefault|sddefault|default)\.(jpg|webp)/);
  if (ytThumbMatch) return `https://img.youtube.com/vi/${ytThumbMatch[1]}/maxresdefault.jpg`;
  let highRes = url
    .replace(/[-_]\d{2,4}x\d{2,4}(?=\.\w{3,4}(?:\?|$))/, '')
    .replace(/\/thumb(?:nail)?s?\//, '/')
    .replace(/\?w=\d+(&h=\d+)?/, '')
    .replace(/&w=\d+(&h=\d+)?/, '');
  return highRes;
}

/** Hook for managing lightbox state with navigation */
export function useLightbox() {
  const [state, setState] = useState<{
    isOpen: boolean;
    items: MediaItem[];
    currentIndex: number;
  }>({ isOpen: false, items: [], currentIndex: 0 });

  const openImage = useCallback((src: string, alt?: string, pageUrl?: string, allItems?: MediaItem[], index?: number) => {
    if (allItems && index !== undefined) {
      setState({ isOpen: true, items: allItems, currentIndex: index });
    } else {
      setState({ isOpen: true, items: [{ type: "image", src, alt, pageUrl }], currentIndex: 0 });
    }
  }, []);

  const openVideo = useCallback((src: string, alt?: string, pageUrl?: string) => {
    setState({ isOpen: true, items: [{ type: "video", src, alt, pageUrl }], currentIndex: 0 });
  }, []);

  const navigate = useCallback((index: number) => {
    setState((s) => ({ ...s, currentIndex: index }));
  }, []);

  const close = useCallback(() => {
    setState((s) => ({ ...s, isOpen: false }));
  }, []);

  // Return a STABLE object: the callbacks are already stable (useCallback), so
  // the wrapper only changes when `state` changes (open/close/navigate). This
  // lets consumers memoize media subtrees — critical during token streaming,
  // where the gallery now renders alongside the prose and would otherwise
  // re-render on every flush.
  return useMemo(
    () => ({ state, openImage, openVideo, navigate, close }),
    [state, openImage, openVideo, navigate, close],
  );
}

export default MediaLightbox;
