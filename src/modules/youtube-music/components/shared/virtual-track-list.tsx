import { useVirtualizer } from "@tanstack/react-virtual";
import { TrackRow } from "./track-row";
import type { Track } from "../../types/music";

const ROW_HEIGHT = 56;
const OVERSCAN = 5;

interface VirtualTrackListProps {
  tracks: Track[];
  scrollElementRef: React.RefObject<HTMLElement | null>;
  /** Offset in px from the top of the scroll container to where this list starts (accounts for carousels above) */
  scrollMargin?: number;
  onPlay?: (track: Track) => void;
  onAddToQueue?: (track: Track) => void;
  onGoToArtist?: (artistId: string) => void;
  onGoToAlbum?: (albumId: string) => void;
}

export function VirtualTrackList({
  tracks,
  scrollElementRef,
  scrollMargin = 0,
  onPlay,
  onAddToQueue,
  onGoToArtist,
  onGoToAlbum,
}: VirtualTrackListProps) {
  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    scrollMargin,
  });

  const items = virtualizer.getVirtualItems();

  return (
    <div
      style={{
        height: virtualizer.getTotalSize(),
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
              transform: `translateY(${virtualItem.start - scrollMargin}px)`,
            }}
          >
            <TrackRow
              track={track}
              index={virtualItem.index}
              onPlay={onPlay}
              onAddToQueue={onAddToQueue}
              onGoToArtist={onGoToArtist}
              onGoToAlbum={onGoToAlbum}
            />
          </div>
        );
      })}
    </div>
  );
}
