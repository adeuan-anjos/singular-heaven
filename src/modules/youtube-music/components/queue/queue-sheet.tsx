import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import type { Track } from "../../types/music";

interface QueueSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queue: Track[];
  currentIndex: number;
  onPlayIndex: (index: number) => void;
  onRemove: (index: number) => void;
}

export function QueueSheet({ open, onOpenChange, queue, currentIndex, onPlayIndex, onRemove }: QueueSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-96 flex-col p-0">
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle>Fila de reprodução</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 overflow-auto">
          <div className="space-y-1 p-2">
            {queue.length === 0 && (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                A fila está vazia
              </p>
            )}
            {queue.map((track, i) => {
              const imgUrl = track.thumbnails[0]?.url ?? "";
              const isCurrent = i === currentIndex;

              return (
                <div
                  key={`${track.videoId}-${i}`}
                  className={cn(
                    "group flex items-center gap-3 rounded-md px-2 py-1.5",
                    isCurrent ? "bg-accent" : "hover:bg-accent/50"
                  )}
                >
                  <button
                    type="button"
                    className="flex flex-1 items-center gap-3 min-w-0"
                    onClick={() => onPlayIndex(i)}
                  >
                    <Avatar className="h-10 w-10 rounded-sm">
                      <AvatarImage src={imgUrl} alt={track.title} className="object-cover" />
                      <AvatarFallback className="rounded-sm">{track.title.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 text-left">
                      <p className={cn("truncate text-sm", isCurrent ? "font-semibold text-foreground" : "text-foreground")}>
                        {track.title}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {track.artists.map((a) => a.name).join(", ")}
                      </p>
                    </div>
                  </button>
                  <span className="text-xs text-muted-foreground">{track.duration}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100"
                    onClick={() => onRemove(i)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
