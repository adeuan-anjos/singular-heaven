import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Shuffle, Heart, Ellipsis } from "lucide-react";

interface CollectionHeaderProps {
  title: string;
  subtitle?: string;
  description?: string;
  year?: string;
  trackCount?: number;
  duration?: string;
  privacy?: string;
  thumbnailUrl?: string;
  onPlay: () => void;
  onShuffle: () => void;
  onGoToAuthor?: () => void;
}

export function CollectionHeader({
  title,
  subtitle,
  description,
  year,
  trackCount,
  duration,
  privacy,
  thumbnailUrl,
  onPlay,
  onShuffle,
  onGoToAuthor,
}: CollectionHeaderProps) {
  const [liked, setLiked] = useState(false);

  // Build meta line: "Playlist automática • 2026" or "990 músicas • Mais de 7 horas"
  const metaParts: string[] = [];
  if (privacy) metaParts.push(privacy);
  if (year) metaParts.push(year);

  const statParts: string[] = [];
  if (trackCount !== undefined) statParts.push(`${trackCount} músicas`);
  if (duration) statParts.push(duration);

  return (
    <div className="space-y-4">
      {/* Cover + Info */}
      <div className="flex items-start gap-6">
        <div className="flex h-48 w-48 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt={title} className="h-full w-full object-cover" />
          ) : (
            <span className="text-4xl text-muted-foreground">{title.charAt(0)}</span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <h1 className="text-4xl font-bold text-foreground">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground">
              {onGoToAuthor ? (
                <button type="button" className="hover:underline" onClick={onGoToAuthor}>
                  {subtitle}
                </button>
              ) : (
                <span>{subtitle}</span>
              )}
            </p>
          )}
          {(statParts.length > 0 || metaParts.length > 0) && (
            <p className="text-sm text-muted-foreground">
              {[...statParts, ...metaParts].join(" | ")}
            </p>
          )}
          {description && (
            <p className="line-clamp-2 text-sm text-muted-foreground/70">{description}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onPlay}>
          <Play className="mr-2 h-4 w-4" />
          Reproduzir
        </Button>
        <Button variant="outline" onClick={onShuffle}>
          <Shuffle className="mr-2 h-4 w-4" />
          Aleatório
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setLiked(!liked)}>
          <Heart className={`h-5 w-5 ${liked ? "fill-red-500 text-red-500" : ""}`} />
        </Button>
        <Button variant="ghost" size="icon">
          <Ellipsis className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
