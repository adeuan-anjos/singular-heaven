import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { CollectionHeader } from "../shared/collection-header";
import { TrackTable } from "../shared/track-table";
import { getMockAlbum } from "../../mock/data";
import { usePlayerStore } from "../../stores/player-store";
import { Play, Shuffle, Search } from "lucide-react";
import type { Track, StackPage } from "../../types/music";

interface AlbumPageProps {
  albumId: string;
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onPlayAll: (tracks: Track[]) => void;
}

export function AlbumPage({
  albumId,
  onNavigate,
  onPlayTrack,
  onAddToQueue,
  onPlayAll,
}: AlbumPageProps) {
  const album = getMockAlbum(albumId);
  const artistName = album.artists.map((a) => a.name).join(", ");
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const [filter, setFilter] = useState("");

  const tracks = album.tracks ?? [];
  const filteredTracks = filter
    ? tracks.filter((t) => {
        const q = filter.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          t.artists.some((a) => a.name.toLowerCase().includes(q))
        );
      })
    : tracks;

  return (
    <ScrollArea className="group/page h-full">
      <div className="mx-auto max-w-screen-xl space-y-6 p-4">
        <CollectionHeader
          title={album.title}
          subtitle={artistName}
          infoLines={[
            [album.year, `${tracks.length} músicas`].filter(Boolean).join(" • "),
          ]}
          thumbnailUrl={album.thumbnails[0]?.url}
          actions={[
            { label: "Reproduzir", icon: Play, onClick: () => onPlayAll(tracks) },
            { label: "Aleatório", icon: Shuffle, onClick: () => onPlayAll([...tracks].sort(() => Math.random() - 0.5)) },
          ]}
          onGoToAuthor={album.artists[0]?.id ? () => onNavigate({ type: "artist", artistId: album.artists[0].id! }) : undefined}
        />

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar por título ou artista"
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
