import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import type { Thumbnail } from "../../types/music";

interface TopResultCardProps {
  thumbnail: Thumbnail[];
  name: string;
  typeLabel: string;
  onClick?: () => void;
  onPlay?: () => void;
}

export function TopResultCard({
  thumbnail,
  name,
  typeLabel,
  onClick,
  onPlay,
}: TopResultCardProps) {
  const imgUrl = thumbnail[0]?.url ?? "";

  console.log("[TopResultCard] render", { name, typeLabel });

  return (
    <button
      type="button"
      className="group/top flex w-full flex-col items-start gap-4 rounded-lg bg-card p-4 text-left transition-colors hover:bg-accent"
      onClick={onClick}
    >
      <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-sm bg-muted">
        {imgUrl ? (
          <img referrerPolicy="no-referrer"
            src={imgUrl}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl text-muted-foreground">
            {name.charAt(0)}
          </div>
        )}
        {onPlay && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/top:opacity-100">
            <Button
              variant="default"
              size="icon"
              className="h-10 w-10 rounded-full shadow-lg"
              onClick={(e) => {
                e.stopPropagation();
                onPlay();
              }}
            >
              <Play className="h-4 w-4 fill-current" />
            </Button>
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-lg font-bold text-foreground">{name}</p>
        <p className="text-sm text-muted-foreground">{typeLabel}</p>
      </div>
    </button>
  );
}
