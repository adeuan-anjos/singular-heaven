import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MediaCard } from "../shared/media-card";
import { mockTracks, mockPlaylists } from "../../mock/data";
import { Heart } from "lucide-react";
import type { StackPage, Thumbnail } from "../../types/music";
import { useRenderTracker } from "@/lib/debug";

interface LibraryViewProps {
  onNavigate: (page: StackPage) => void;
}

/** "Curtidas" special playlist rendered as the first card with a Heart overlay */
function LikedCard({ onClick }: { onClick: () => void }) {
  const thumbUrl = mockTracks[0]?.thumbnails[0]?.url ?? "";

  return (
    <div className="group/card flex min-w-0 flex-col gap-2 text-left">
      <button
        type="button"
        className="relative aspect-square w-full overflow-hidden rounded-md bg-muted"
        onClick={onClick}
      >
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt="Curtidas"
            className="h-full w-full object-cover brightness-75"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-primary/20" />
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <Heart className="h-10 w-10 fill-primary text-primary" />
        </div>
      </button>
      <div className="min-w-0">
        <button
          type="button"
          className="w-full truncate text-left text-sm font-medium text-foreground hover:underline"
          onClick={onClick}
        >
          Curtidas
        </button>
        <p className="truncate text-xs text-muted-foreground">
          Playlist • {mockTracks.length} músicas
        </p>
      </div>
    </div>
  );
}

export const LibraryView = React.memo(function LibraryView({
  onNavigate,
}: LibraryViewProps) {
  useRenderTracker("LibraryView", { onNavigate });

  console.log("[LibraryView] render", {
    playlistCount: mockPlaylists.length,
  });

  return (
    <ScrollArea className="group/page h-full">
      <div className="p-4">
        <div className="mx-auto max-w-screen-xl space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Biblioteca</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] gap-4">
            {/* Curtidas — always first */}
            <LikedCard
              onClick={() =>
                onNavigate({ type: "playlist", playlistId: "liked" })
              }
            />

            {/* User playlists */}
            {mockPlaylists.map((pl) => (
              <MediaCard
                key={pl.playlistId}
                title={pl.title}
                typeLabel="Playlist"
                artistName={`${pl.author.name} • ${pl.trackCount} músicas`}
                thumbnails={pl.thumbnails as Thumbnail[]}
                onClick={() =>
                  onNavigate({
                    type: "playlist",
                    playlistId: pl.playlistId,
                  })
                }
              />
            ))}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
});
