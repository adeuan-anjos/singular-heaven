import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { CollectionHeader } from "../shared/collection-header";
import { TrackTable } from "../shared/track-table";
import { getMockPlaylist } from "../../mock/data";
import { usePlayerStore } from "../../stores/player-store";
import { Search } from "lucide-react";
import type { Track, StackPage } from "../../types/music";

interface PlaylistPageProps {
  playlistId: string;
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onPlayAll: (tracks: Track[]) => void;
}

export function PlaylistPage({
  playlistId,
  onNavigate,
  onPlayTrack,
  onAddToQueue,
  onPlayAll,
}: PlaylistPageProps) {
  const playlist = getMockPlaylist(playlistId);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const [filter, setFilter] = useState("");

  const tracks = playlist.tracks ?? [];
  const filteredTracks = filter
    ? tracks.filter((t) => {
        const q = filter.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          t.artists.some((a) => a.name.toLowerCase().includes(q)) ||
          (t.album?.name.toLowerCase().includes(q) ?? false)
        );
      })
    : tracks;

  return (
    <ScrollArea className="group/page h-full">
      <div className="mx-auto max-w-screen-xl space-y-6 p-4">
        <CollectionHeader
          title={playlist.title}
          subtitle={playlist.author.name}
          trackCount={playlist.trackCount}
          thumbnailUrl={playlist.thumbnails[0]?.url}
          onPlay={() => onPlayAll(tracks)}
          onShuffle={() => onPlayAll([...tracks].sort(() => Math.random() - 0.5))}
          onGoToAuthor={playlist.author.id ? () => onNavigate({ type: "artist", artistId: playlist.author.id! }) : undefined}
        />

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar a playlist por título, artista ou álbum"
            className="pl-8"
          />
        </div>

        <TrackTable
          tracks={filteredTracks}
          currentTrackId={currentTrack?.videoId}
          isPlaying={isPlaying}
          onPlay={onPlayTrack}
          onAddToQueue={onAddToQueue}
          onGoToArtist={(id) => onNavigate({ type: "artist", artistId: id })}
          onGoToAlbum={(id) => onNavigate({ type: "album", albumId: id })}
        />

        {filter && filteredTracks.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma música encontrada para "{filter}"
          </p>
        )}
      </div>
    </ScrollArea>
  );
}
