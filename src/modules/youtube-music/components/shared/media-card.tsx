import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import type { Thumbnail } from "../../types/music";

interface MediaCardProps {
  title: string;
  subtitle?: string;
  thumbnails: Thumbnail[];
  onClick?: () => void;
  onPlay?: () => void;
}

export function MediaCard({ title, subtitle, thumbnails, onClick, onPlay }: MediaCardProps) {
  const imgUrl = thumbnails[0]?.url ?? "";

  return (
    <div className="group/card flex min-w-0 w-44 flex-shrink-0 flex-col gap-2 rounded-md p-2 text-left hover:bg-accent">
      <button
        type="button"
        className="relative aspect-square w-full overflow-hidden rounded-md bg-muted"
        onClick={onClick}
      >
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl text-muted-foreground">
            {title.charAt(0)}
          </div>
        )}
        {onPlay && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/card:opacity-100">
            <Button
              variant="secondary"
              size="icon"
              className="h-10 w-10 rounded-full bg-background/80 shadow-md hover:bg-background/90"
              onClick={(e) => {
                e.stopPropagation();
                onPlay();
              }}
            >
              <Play className="h-5 w-5 fill-current" />
            </Button>
          </div>
        )}
      </button>
      <div className="min-w-0">
        <button
          type="button"
          className="w-full truncate text-left text-sm font-medium text-foreground hover:underline"
          onClick={onClick}
        >
          {title}
        </button>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
