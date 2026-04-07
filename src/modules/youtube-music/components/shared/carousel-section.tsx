import { useRef, useState, useCallback, useEffect } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CarouselSectionProps {
  title: string;
  onSeeAll?: () => void;
  children: React.ReactNode;
}

const SCROLL_AMOUNT = 400;

export function CarouselSection({ title, onSeeAll, children }: CarouselSectionProps) {
  const viewportRef = useRef<HTMLElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  const scrollAreaRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        const viewport = node.querySelector('[data-slot="scroll-area-viewport"]');
        if (viewport) {
          viewportRef.current = viewport as HTMLElement;
          viewport.addEventListener("scroll", checkScroll);
          checkScroll();
        }
      }
    },
    [checkScroll]
  );

  useEffect(() => {
    checkScroll();
    const el = viewportRef.current;
    return () => {
      if (el) el.removeEventListener("scroll", checkScroll);
    };
  }, [checkScroll]);

  const scrollLeft = () => {
    viewportRef.current?.scrollBy({ left: -SCROLL_AMOUNT, behavior: "smooth" });
  };

  const scrollRight = () => {
    viewportRef.current?.scrollBy({ left: SCROLL_AMOUNT, behavior: "smooth" });
  };

  return (
    <div className="group/carousel space-y-3">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <div className="flex items-center gap-1">
          {onSeeAll && (
            <Button variant="outline" size="sm" onClick={onSeeAll}>
              Mais
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full opacity-0 transition-opacity group-hover/carousel:opacity-100 disabled:opacity-0"
            disabled={!canScrollLeft}
            onClick={scrollLeft}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full opacity-0 transition-opacity group-hover/carousel:opacity-100 disabled:opacity-0"
            disabled={!canScrollRight}
            onClick={scrollRight}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <ScrollArea ref={scrollAreaRef} className="w-full">
        <div className="flex gap-2 pb-4">
          {children}
        </div>
        <ScrollBar orientation="horizontal" className="opacity-0 transition-opacity group-hover/carousel:opacity-100" />
      </ScrollArea>
    </div>
  );
}
