// src/modules/youtube-music/components/lyrics/lyrics-empty.tsx
import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { thumbUrl } from "../../utils/thumb-url";
import type { Track } from "../../types/music";

interface LyricsEmptyProps {
  track: Track;
  /** When false, hides the "Letra não disponível" line — used while a fetch is in flight. */
  showMessage?: boolean;
}

/**
 * Shown both as the loading placeholder (showMessage=false) and as
 * the genuine "no synced lyrics" fallback (showMessage=true). Same
 * visual in both cases so the transition into actual lyrics is smooth.
 */
export const LyricsEmpty = React.memo(function LyricsEmpty({
  track,
  showMessage = true,
}: LyricsEmptyProps) {
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
      {showMessage && (
        <p className="mt-4 text-sm text-muted-foreground">
          Letra não disponível para esta música.
        </p>
      )}
    </div>
  );
});
