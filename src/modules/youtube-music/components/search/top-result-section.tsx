import { useLocation } from "wouter";
import { TopResultCard } from "./top-result-card";
import { TrackRow } from "../shared/track-row";
import { paths } from "../../router/paths";
import type { Track, Artist, Album, Thumbnail } from "../../types/music";

type TopResultType =
  | { kind: "artist"; artist: Artist }
  | { kind: "album"; album: Album }
  | { kind: "song"; song: Track };

interface TopResultSectionProps {
  topResult: TopResultType;
  topSongs: Track[];
  currentTrackId?: string;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onAddToPlaylist?: (track: Track) => void;
  onGoToArtist: (artistId: string) => void;
  onGoToAlbum: (albumId: string) => void;
}

function getCardProps(topResult: TopResultType): {
  thumbnail: Thumbnail[];
  name: string;
  typeLabel: string;
} {
  switch (topResult.kind) {
    case "artist":
      return {
        thumbnail: topResult.artist.thumbnails,
        name: topResult.artist.name,
        typeLabel: "Artista",
      };
    case "album":
      return {
        thumbnail: topResult.album.thumbnails,
        name: topResult.album.title,
        typeLabel: "Álbum",
      };
    case "song":
      return {
        thumbnail: topResult.song.thumbnails,
        name: topResult.song.title,
        typeLabel: "Música",
      };
  }
}

function getOnClick(
  topResult: TopResultType,
  navigate: (to: string) => void,
  onPlayTrack: (track: Track) => void,
): () => void {
  switch (topResult.kind) {
    case "artist":
      return () => navigate(paths.artist(topResult.artist.browseId));
    case "album":
      return () => navigate(paths.album(topResult.album.browseId));
    case "song":
      return () => onPlayTrack(topResult.song);
  }
}

function getOnPlay(
  topResult: TopResultType,
  onPlayTrack: (track: Track) => void,
  topSongs: Track[],
): (() => void) | undefined {
  switch (topResult.kind) {
    case "artist":
      return topSongs[0] ? () => onPlayTrack(topSongs[0]) : undefined;
    case "album":
      return topSongs[0] ? () => onPlayTrack(topSongs[0]) : undefined;
    case "song":
      return () => onPlayTrack(topResult.song);
  }
}

export function TopResultSection({
  topResult,
  topSongs,
  currentTrackId,
  onPlayTrack,
  onAddToQueue,
  onAddToPlaylist,
  onGoToArtist,
  onGoToAlbum,
}: TopResultSectionProps) {
  const [, navigate] = useLocation();
  const cardProps = getCardProps(topResult);
  const songs = topSongs.slice(0, 4);

  return (
    <div className="grid grid-cols-5 gap-6">
      {/* Left column — Top Result */}
      <div className="col-span-2 space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Melhor resultado</h2>
        <TopResultCard
          thumbnail={cardProps.thumbnail}
          name={cardProps.name}
          typeLabel={cardProps.typeLabel}
          onClick={getOnClick(topResult, navigate, onPlayTrack)}
          onPlay={getOnPlay(topResult, onPlayTrack, topSongs)}
        />
      </div>

      {/* Right column — Songs */}
      <div className="col-span-3 space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Músicas</h2>
        <div className="space-y-1">
          {songs.map((track, i) => (
            <TrackRow
              key={track.videoId}
              track={track}
              index={i}
              isPlaying={track.videoId === currentTrackId}
              onPlay={onPlayTrack}
              onAddToQueue={onAddToQueue}
              onAddToPlaylist={onAddToPlaylist}
              onGoToArtist={onGoToArtist}
              onGoToAlbum={onGoToAlbum}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
