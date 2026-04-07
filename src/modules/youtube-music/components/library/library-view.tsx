import { VirtualTrackList } from "../shared/virtual-track-list";
import { mockTracks } from "../../mock/data";
import type { Track, StackPage } from "../../types/music";

interface LibraryViewProps {
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
}

export function LibraryView({ onNavigate, onPlayTrack, onAddToQueue }: LibraryViewProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 min-h-0">
        <VirtualTrackList
          tracks={mockTracks}
          className="h-full"
          onPlay={onPlayTrack}
          onAddToQueue={onAddToQueue}
          onGoToArtist={(id) => onNavigate({ type: "artist", artistId: id })}
          onGoToAlbum={(id) => onNavigate({ type: "album", albumId: id })}
        />
      </div>
    </div>
  );
}
