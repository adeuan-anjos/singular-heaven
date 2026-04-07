import React from "react";
import { VirtualTrackList } from "../shared/virtual-track-list";
import type { Track, StackPage } from "../../types/music";
import { useRenderTracker } from "@/lib/debug";
import { usePlayerStore } from "../../stores/player-store";

interface LibraryViewProps {
  title: string;
  tracks: Track[];
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
}

export const LibraryView = React.memo(function LibraryView({
  title,
  tracks,
  onNavigate,
  onPlayTrack,
  onAddToQueue,
}: LibraryViewProps) {
  useRenderTracker("LibraryView", { title, onNavigate, onPlayTrack, onAddToQueue });
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  console.log("[LibraryView] render", {
    title,
    trackCount: tracks.length,
  });

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-4 pt-4 pb-2">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <VirtualTrackList
          tracks={tracks}
          className="h-full"
          currentTrackId={currentTrack?.videoId}
          onPlay={onPlayTrack}
          onAddToQueue={onAddToQueue}
          onGoToArtist={(id) =>
            onNavigate({ type: "artist", artistId: id })
          }
          onGoToAlbum={(id) =>
            onNavigate({ type: "album", albumId: id })
          }
        />
      </div>
    </div>
  );
});
