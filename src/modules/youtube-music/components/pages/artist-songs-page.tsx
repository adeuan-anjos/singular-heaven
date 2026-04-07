import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { CollectionHeader } from "../shared/collection-header";
import type { CollectionHeaderAction } from "../shared/collection-header";
import { TrackTable } from "../shared/track-table";
import { ytGetArtist } from "../../services/yt-api";
import { mapArtistPage } from "../../services/mappers";
import { usePlayerStore } from "../../stores/player-store";
import { useQueueStore } from "../../stores/queue-store";
import {
  Shuffle,
  Radio,
  Search,
  Loader2,
} from "lucide-react";
import type { Artist, Track, StackPage } from "../../types/music";

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
  const [artist, setArtist] = useState<Artist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const play = usePlayerStore((s) => s.play);
  const setTracks = useQueueStore((s) => s.setTracks);
  const [subscribed, setSubscribed] = useState(false);
  const [liked, setLiked] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    console.log("[ArtistSongsPage] Fetching artist:", artistId);

    ytGetArtist(artistId)
      .then((raw) => {
        if (cancelled) return;
        const mapped = mapArtistPage(raw);
        console.log("[ArtistSongsPage] Artist loaded:", mapped.name, "songs:", mapped.topSongs?.length);
        setArtist(mapped);
        setSubscribed(mapped.subscribed ?? false);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[ArtistSongsPage] Failed to fetch artist:", msg);
        setError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [artistId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!artist) return null;

  const imgUrl = artist.thumbnails[0]?.url ?? "";

  const infoLines: string[] = [];
  if (artist.monthlyListeners) infoLines.push(artist.monthlyListeners);
  if (artist.subscribers) infoLines.push(`${artist.subscribers} inscritos`);

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

  const buildArtistActions = (): CollectionHeaderAction[] => {
    const result: CollectionHeaderAction[] = [
      { label: "Aleatório", icon: Shuffle, onClick: handleShuffle },
      { label: "Rádio", icon: Radio, onClick: handlePlayAll },
    ];
    result.push({
      label: subscribed ? "Inscrito" : "Inscrever-se",
      onClick: () => setSubscribed(!subscribed),
      variant: subscribed ? "default" : "outline",
    });
    return result;
  };

  return (
    <ScrollArea className="group/page h-full">
      <div className="mx-auto max-w-screen-xl space-y-6 p-4">
        <CollectionHeader
          title={artist.name}
          thumbnailUrl={imgUrl || undefined}
          infoLines={infoLines}
          actions={buildArtistActions()}
          liked={liked}
          onLikeToggle={() => setLiked(!liked)}
        />

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
