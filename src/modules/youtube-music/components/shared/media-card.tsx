import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import React from "react";
import type { Thumbnail } from "../../types/music";
import { thumbUrl } from "../../utils/thumb-url";

interface MediaCardProps {
  title: string;
  typeLabel?: string;
  artistName?: string;
  albumName?: string;
  thumbnails?: Thumbnail[];
  onClick?: () => void;
  onPlay?: () => void;
  onGoToArtist?: () => void;
  onGoToAlbum?: () => void;
}

export function MediaCard({
  title,
  typeLabel,
  artistName,
  albumName,
  thumbnails = [],
  onClick,
  onPlay,
  onGoToArtist,
  onGoToAlbum,
}: MediaCardProps) {
  // Use the largest available thumbnail (last in the array = highest resolution)
  const imgUrl = thumbnails[thumbnails.length - 1]?.url ?? thumbnails[0]?.url ?? "";

  const subtitleParts: React.ReactNode[] = [];

  if (typeLabel) {
    subtitleParts.push(
      <span key="type">{typeLabel}</span>
    );
  }

  if (artistName) {
    if (subtitleParts.length > 0) {
      subtitleParts.push(<span key="sep-artist"> • </span>);
    }
    subtitleParts.push(
      onGoToArtist ? (
        <span
          key="artist"
          role="button"
          tabIndex={0}
          className="cursor-pointer hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            onGoToArtist();
          }}
          onKeyDown={(e) => { if (e.key === "Enter") onGoToArtist(); }}
        >
          {artistName}
        </span>
      ) : (
        <span key="artist">{artistName}</span>
      )
    );
  }

  if (albumName) {
    if (subtitleParts.length > 0) {
      subtitleParts.push(<span key="sep-album"> • </span>);
    }
    subtitleParts.push(
      onGoToAlbum ? (
        <span
          key="album"
          role="button"
          tabIndex={0}
          className="cursor-pointer hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            onGoToAlbum();
          }}
          onKeyDown={(e) => { if (e.key === "Enter") onGoToAlbum(); }}
        >
          {albumName}
        </span>
      ) : (
        <span key="album">{albumName}</span>
      )
    );
  }

  return (
    <div className="group/card flex min-w-0 flex-col gap-2 text-left">
      <div
        role="button"
        tabIndex={0}
        className="relative aspect-square w-full cursor-pointer overflow-hidden rounded-md bg-muted"
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === "Enter" && onClick) onClick(); }}
      >
        {imgUrl ? (
          <img
            src={thumbUrl(imgUrl, 226)}
            alt={title}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl text-muted-foreground">
            {title.charAt(0)}
          </div>
        )}
        {onPlay && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/card:opacity-100">
            <Button
              variant="default"
              size="icon"
              className="h-12 w-12 rounded-full shadow-lg"
              onClick={(e) => {
                e.stopPropagation();
                onPlay();
              }}
            >
              <Play className="h-5 w-5 fill-current" />
            </Button>
          </div>
        )}
      </div>
      <div className="min-w-0">
        <button
          type="button"
          className="w-full truncate text-left text-sm font-medium text-foreground hover:underline"
          onClick={onClick}
        >
          {title}
        </button>
        {subtitleParts.length > 0 && (
          <p className="truncate text-xs text-muted-foreground">
            {subtitleParts}
          </p>
        )}
      </div>
    </div>
  );
}
