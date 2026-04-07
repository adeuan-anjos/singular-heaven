import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrackTable } from "../shared/track-table";
import { getMockAlbum } from "../../mock/data";
import { usePlayerStore } from "../../stores/player-store";
import {
  Play,
  Shuffle,
  Heart,
  Ellipsis,
  Search,
} from "lucide-react";
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
  const imgUrl = album.thumbnails[0]?.url ?? "";
  const artistName = album.artists.map((a) => a.name).join(", ");
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const [filter, setFilter] = useState("");
  const [liked, setLiked] = useState(false);

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
        {/* Header */}
        <div className="flex items-start gap-6">
          <div className="flex h-48 w-48 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
            {imgUrl ? (
              <img src={imgUrl} alt={album.title} className="h-full w-full object-cover" />
            ) : (
              <span className="text-4xl text-muted-foreground">{album.title.charAt(0)}</span>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <h1 className="text-4xl font-bold text-foreground">{album.title}</h1>
            <button
              type="button"
              className="w-fit text-sm text-muted-foreground hover:underline"
              onClick={() => album.artists[0]?.id && onNavigate({ type: "artist", artistId: album.artists[0].id })}
            >
              {artistName}
            </button>
            <p className="text-sm text-muted-foreground">
              {album.year && `${album.year} • `}{tracks.length} músicas
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => onPlayAll(tracks)}>
              <Play className="mr-2 h-4 w-4" />
              Reproduzir
            </Button>
            <Button variant="outline" onClick={() => onPlayAll([...tracks].sort(() => Math.random() - 0.5))}>
              <Shuffle className="mr-2 h-4 w-4" />
              Aleatório
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLiked(!liked)}
            >
              <Heart className={`h-5 w-5 ${liked ? "fill-red-500 text-red-500" : ""}`} />
            </Button>
            <Button variant="ghost" size="icon">
              <Ellipsis className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Filter */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar por título ou artista"
            className="pl-8"
          />
        </div>

        {/* Track table */}
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
