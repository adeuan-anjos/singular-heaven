// src/modules/youtube-music/components/lyrics/lyrics-empty.tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { thumbUrl } from "../../utils/thumb-url";
import type { Track } from "../../types/music";

interface LyricsEmptyProps {
  track: Track;
}

/**
 * Rendered when LRCLIB returns no lyrics for the current track.
 * Mirrors a minimal "Now Playing" card centered in the right column.
 */
export function LyricsEmpty({ track }: LyricsEmptyProps) {
  const imgUrl = track.thumbnails[0]?.url ?? "";
  const artistName = track.artists.map((a) => a.name).join(", ");

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <Avatar className="size-48 rounded-2xl">
        <AvatarImage
          src={thumbUrl(imgUrl, 400)}
          alt={track.title}
          className="rounded-2xl object-cover"
        />
        <AvatarFallback className="rounded-2xl text-3xl">
          {track.title.charAt(0)}
        </AvatarFallback>
      </Avatar>
      <div className="font-heading">
        <h2 className="text-2xl font-semibold text-foreground">{track.title}</h2>
        <p className="text-base text-muted-foreground">{artistName}</p>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Letra não disponível para esta música.
      </p>
    </div>
  );
}
