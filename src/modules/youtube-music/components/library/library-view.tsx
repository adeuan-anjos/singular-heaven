import React, { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MediaGrid } from "../shared/media-grid";
import { MediaCard } from "../shared/media-card";
import { ytGetLibraryPlaylists, ytGetLibrarySongs, ytGetLikedTrackIds } from "../../services/yt-api";
import { mapLibraryPlaylists, mapLibrarySongs } from "../../services/mappers";
import type { Playlist, Track, StackPage, Thumbnail } from "../../types/music";
import { useRenderTracker } from "@/lib/debug";

interface LibraryViewProps {
  onNavigate: (page: StackPage) => void;
}

export const LibraryView = React.memo(function LibraryView({
  onNavigate,
}: LibraryViewProps) {
  useRenderTracker("LibraryView", { onNavigate });

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [likedSongs, setLikedSongs] = useState<Track[]>([]);
  const [likedSongCount, setLikedSongCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchLibrary() {
      console.log("[LibraryView] Fetching library data...");
      setLoading(true);
      setError(null);
      try {
        const [apiPlaylists, apiSongs, likedIds] = await Promise.all([
          ytGetLibraryPlaylists(),
          ytGetLibrarySongs(),
          ytGetLikedTrackIds(),
        ]);
        if (cancelled) return;
        const mappedPlaylists = mapLibraryPlaylists(apiPlaylists);
        const mappedSongs = mapLibrarySongs(apiSongs);
        console.log("[LibraryView] Loaded library:", {
          playlistCount: mappedPlaylists.length,
          likedSongCount: likedIds.length,
        });
        console.log(
          `[LibraryView] liked count resolved ${JSON.stringify({
            likedPlaylistEntryCount: likedIds.length,
            likedUniqueVideoIdCount: new Set(likedIds).size,
            sample: likedIds.slice(0, 5),
          })}`
        );
        setPlaylists(mappedPlaylists);
        setLikedSongs(mappedSongs);
        setLikedSongCount(likedIds.length);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[LibraryView] Failed to load library:", msg);
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchLibrary();
    return () => { cancelled = true; };
  }, []);

  console.log("[LibraryView] render", {
    playlistCount: playlists.length,
    likedSongCount,
  });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-sm">Erro ao carregar a biblioteca</p>
        <p className="text-xs">{error}</p>
      </div>
    );
  }

  return (
    <ScrollArea className="group/page h-full">
      <div className="mx-auto max-w-screen-xl space-y-6 p-4">
        <MediaGrid title="Biblioteca">
          <MediaCard
            title="Curtidas"
            typeLabel="Playlist"
            artistName={`${likedSongCount} músicas`}
            thumbnails={likedSongs[0]?.thumbnails as Thumbnail[]}
            onClick={() => onNavigate({ type: "playlist", playlistId: "liked" })}
            onPlay={() => onNavigate({ type: "playlist", playlistId: "liked" })}
          />

          {playlists.map((pl) => (
            <MediaCard
              key={pl.playlistId}
              title={pl.title}
              typeLabel="Playlist"
              artistName={`${pl.author.name} • ${pl.trackCount ?? 0} músicas`}
              thumbnails={pl.thumbnails as Thumbnail[]}
              onClick={() => onNavigate({ type: "playlist", playlistId: pl.playlistId })}
              onPlay={() => onNavigate({ type: "playlist", playlistId: pl.playlistId })}
            />
          ))}
        </MediaGrid>
      </div>
    </ScrollArea>
  );
});
