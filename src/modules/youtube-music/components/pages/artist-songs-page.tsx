import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrackTable } from "../shared/track-table";
import { getMockArtist } from "../../mock/data";
import { usePlayerStore } from "../../stores/player-store";
import { useQueueStore } from "../../stores/queue-store";
import {
  Shuffle,
  Radio,
  Heart,
  Ellipsis,
  Search,
} from "lucide-react";
import type { Track, StackPage } from "../../types/music";

interface ArtistSongsPageProps {
  artistId: string;
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
}

export function ArtistSongsPage({
  artistId,
  onNavigate,
  onPlayTrack,
  onAddToQueue,
}: ArtistSongsPageProps) {
  const artist = getMockArtist(artistId);
  const imgUrl = artist.thumbnails[0]?.url ?? "";
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const play = usePlayerStore((s) => s.play);
  const setTracks = useQueueStore((s) => s.setTracks);
  const [subscribed, setSubscribed] = useState(artist.subscribed ?? false);
  const [liked, setLiked] = useState(false);
  const [filter, setFilter] = useState("");

  const allSongs = artist.topSongs ?? [];
  const filteredSongs = filter
    ? allSongs.filter((t) => {
        const q = filter.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          t.artists.some((a) => a.name.toLowerCase().includes(q)) ||
          (t.album?.name.toLowerCase().includes(q) ?? false)
        );
      })
    : allSongs;

  const handlePlayAll = () => {
    if (allSongs.length > 0) {
      play(allSongs[0]);
      setTracks(allSongs, 0);
    }
  };

  const handleShuffle = () => {
    const shuffled = [...allSongs].sort(() => Math.random() - 0.5);
    if (shuffled.length > 0) {
      play(shuffled[0]);
      setTracks(shuffled, 0);
    }
  };

  return (
    <ScrollArea className="group/page h-full">
      <div className="mx-auto max-w-screen-xl space-y-6 p-4">
        {/* Artist header (same as artist page) */}
        <div className="flex items-start gap-6">
          <div className="flex h-48 w-48 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
            {imgUrl ? (
              <img src={imgUrl} alt={artist.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-4xl text-muted-foreground">{artist.name.charAt(0)}</span>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <h1 className="text-4xl font-bold text-foreground">{artist.name}</h1>
            {artist.monthlyListeners && (
              <p className="text-sm text-muted-foreground">{artist.monthlyListeners}</p>
            )}
            {artist.subscribers && (
              <p className="text-sm text-muted-foreground">{artist.subscribers} inscritos</p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleShuffle}>
            <Shuffle className="mr-2 h-4 w-4" />
            Aleatório
          </Button>
          <Button variant="outline" onClick={handlePlayAll}>
            <Radio className="mr-2 h-4 w-4" />
            Rádio
          </Button>
          <Button
            variant={subscribed ? "default" : "outline"}
            onClick={() => setSubscribed(!subscribed)}
          >
            {subscribed ? "Inscrito" : "Inscrever-se"}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setLiked(!liked)}>
            <Heart className={`h-5 w-5 ${liked ? "fill-red-500 text-red-500" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon">
            <Ellipsis className="h-5 w-5" />
          </Button>
        </div>

        {/* Filter */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar por título, artista ou álbum"
            className="pl-8"
          />
        </div>

        {/* Músicas heading */}
        <h2 className="text-lg font-semibold text-foreground">Músicas</h2>

        {/* Full track list */}
        <TrackTable
          tracks={filteredSongs}
          showViews
          currentTrackId={currentTrack?.videoId}
          isPlaying={isPlaying}
          onPlay={onPlayTrack}
          onAddToQueue={onAddToQueue}
          onGoToArtist={(id) => onNavigate({ type: "artist", artistId: id })}
          onGoToAlbum={(id) => onNavigate({ type: "album", albumId: id })}
        />

        {filter && filteredSongs.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma música encontrada para "{filter}"
          </p>
        )}
      </div>
    </ScrollArea>
  );
}
