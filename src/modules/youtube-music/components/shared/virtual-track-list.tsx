import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TrackRow } from "./track-row";
import type { Track } from "../../types/music";

const ROW_HEIGHT = 56;
const OVERSCAN = 5;

interface VirtualTrackListProps {
  tracks: Track[];
  className?: string;
  currentTrackId?: string;
  onPlay?: (track: Track) => void;
  onAddToQueue?: (track: Track) => void;
  onGoToArtist?: (artistId: string) => void;
  onGoToAlbum?: (albumId: string) => void;
}

export function VirtualTrackList({
  tracks,
  className,
  currentTrackId,
  onPlay,
  onAddToQueue,
  onGoToArtist,
  onGoToAlbum,
}: VirtualTrackListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div ref={parentRef} className={`styled-scrollbar ${className ?? ""}`} style={{ overflowY: "auto" }}>
      <div
        style={{
          height: totalSize,
          width: "100%",
          position: "relative",
        }}
      >
        {items.map((virtualItem) => {
          const track = tracks[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <TrackRow
                track={track}
                index={virtualItem.index}
                isPlaying={currentTrackId === track.videoId}
                onPlay={onPlay}
                onAddToQueue={onAddToQueue}
                onGoToArtist={onGoToArtist}
                onGoToAlbum={onGoToAlbum}
              />
            </div>
          );
        })}
      </div>

    </div>
  );
}
