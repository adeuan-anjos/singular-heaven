import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import React from "react";
import type { Thumbnail } from "../../types/music";

interface MediaCardProps {
  title: string;
  typeLabel?: string;
  artistName?: string;
  albumName?: string;
  thumbnails: Thumbnail[];
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
  thumbnails,
  onClick,
  onPlay,
  onGoToArtist,
  onGoToAlbum,
}: MediaCardProps) {
  const imgUrl = thumbnails[0]?.url ?? "";

  const subtitleParts: React.ReactNode[] = [];

  if (typeLabel) {
    subtitleParts.push(
      <span key="type">{typeLabel}</span>
    );
  }

  if (artistName) {
    if (subtitleParts.length > 0) {
      subtitleParts.push(<span key="sep-artist"> &bull; </span>);
    }
    subtitleParts.push(
      onGoToArtist ? (
        <button
          key="artist"
          type="button"
          className="hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            onGoToArtist();
          }}
        >
          {artistName}
        </button>
      ) : (
        <span key="artist">{artistName}</span>
      )
    );
  }

  if (albumName) {
    if (subtitleParts.length > 0) {
      subtitleParts.push(<span key="sep-album"> &bull; </span>);
    }
    subtitleParts.push(
      onGoToAlbum ? (
        <button
          key="album"
          type="button"
          className="hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            onGoToAlbum();
          }}
        >
          {albumName}
        </button>
      ) : (
        <span key="album">{albumName}</span>
      )
    );
  }

  return (
    <div className="group/card flex min-w-0 flex-col gap-2 rounded-md text-left hover:bg-accent">
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
      </button>
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
