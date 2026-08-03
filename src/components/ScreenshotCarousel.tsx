import React, { useState, useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import MediaLightbox, { useLightbox, getHighResImageUrl, type MediaItem } from "@/components/MediaLightbox";
import SmartImage from "@/components/SmartImage";

interface ScreenshotCarouselProps {
  images: { alt: string; url: string }[];
}

const ScreenshotCarousel: React.FC<ScreenshotCarouselProps> = ({ images }) => {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: "start" });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const lightbox = useLightbox();

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  React.useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    return () => { emblaApi.off("select", onSelect); };
  }, [emblaApi]);

  if (images.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-baseline gap-2 mb-3 mt-6">
        <h2 className="text-xl font-semibold text-foreground">Visual Overview</h2>
        <span className="text-xs text-muted-foreground">({images.length} screenshot{images.length !== 1 ? "s" : ""})</span>
      </div>
      <div className="relative group">
        <div className="overflow-hidden rounded-lg border border-border" ref={emblaRef}>
          <div className="flex">
            {images.map((img, i) => {
              const allItems: MediaItem[] = images.map(im => ({ type: "image" as const, src: getHighResImageUrl(im.url), alt: im.alt }));
              return (
                <div key={i} className="flex-[0_0_100%] min-w-0 relative">
                  <button
                    onClick={() => lightbox.openImage(getHighResImageUrl(img.url), img.alt, undefined, allItems, i)}
                    className="w-full cursor-pointer relative"
                  >
                    <SmartImage
                      src={img.url}
                      alt={img.alt}
                      className="w-full h-48 object-contain bg-muted/30"
                      height={192}
                      eager={i < 2}
                    />
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="bg-black/60 rounded p-1">
                        <Maximize2 className="h-3.5 w-3.5 text-white" />
                      </div>
                    </div>
                  </button>
                  <p className="text-[10px] text-muted-foreground truncate px-2 py-1">{img.alt}</p>
                </div>
              );
            })}
          </div>
        </div>
        {images.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-background/80 border border-border shadow opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={scrollPrev}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-background/80 border border-border shadow opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={scrollNext}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="flex justify-center gap-1 mt-1.5">
              {images.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${i === selectedIndex ? "bg-primary" : "bg-muted-foreground/30"}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
      <MediaLightbox
        isOpen={lightbox.state.isOpen}
        onClose={lightbox.close}
        items={lightbox.state.items}
        currentIndex={lightbox.state.currentIndex}
        onNavigate={lightbox.navigate}
      />
    </div>
  );
};

export default ScreenshotCarousel;
