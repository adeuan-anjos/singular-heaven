import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MediaGrid } from "../shared/media-grid";
import { MediaCard } from "../shared/media-card";
import { mockTracks, mockPlaylists } from "../../mock/data";
import type { StackPage, Thumbnail } from "../../types/music";
import { useRenderTracker } from "@/lib/debug";

interface LibraryViewProps {
  onNavigate: (page: StackPage) => void;
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
      <div className="mx-auto max-w-screen-xl space-y-6 p-4">
        <MediaGrid title="Biblioteca">
          <MediaCard
            title="Curtidas"
            typeLabel="Playlist"
            artistName={`${mockTracks.length} músicas`}
            thumbnails={mockTracks[0]?.thumbnails as Thumbnail[]}
            onClick={() => onNavigate({ type: "playlist", playlistId: "liked" })}
            onPlay={() => onNavigate({ type: "playlist", playlistId: "liked" })}
          />

          {mockPlaylists.map((pl) => (
            <MediaCard
              key={pl.playlistId}
              title={pl.title}
              typeLabel="Playlist"
              artistName={`${pl.author.name} • ${pl.trackCount} músicas`}
              thumbnails={pl.thumbnails as Thumbnail[]}
              onClick={() => onNavigate({ type: "playlist", playlistId: pl.playlistId })}
              onPlay={() => onNavigate({ type: "playlist", playlistId: pl.playlistId })}
            />
          ))}
        </MediaGrid>
      </div>
    </ScrollArea>
  );
});
