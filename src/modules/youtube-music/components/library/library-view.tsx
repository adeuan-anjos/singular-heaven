import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { MediaGrid } from "../shared/media-grid";
import { MediaCard } from "../shared/media-card";
import { ytGetLibrarySongs } from "../../services/yt-api";
import { mapLibrarySongs } from "../../services/mappers";
import { usePlaylistLibraryStore } from "../../stores/playlist-library-store";
import { useTrackLikeStore } from "../../stores/track-like-store";
import { paths } from "../../router/paths";
import type { Playlist, Track } from "../../types/music";

export const LibraryView = React.memo(function LibraryView() {
  const [, navigate] = useLocation();

  const playlists = usePlaylistLibraryStore((s) => s.playlists);
  const hydratePlaylists = usePlaylistLibraryStore((s) => s.hydrate);
  const playlistsHydrated = usePlaylistLibraryStore((s) => s.hydrated);
  const playlistsHydrating = usePlaylistLibraryStore((s) => s.hydrating);
  const hydrateLikes = useTrackLikeStore((s) => s.hydrate);
  const likedEntryCount = useTrackLikeStore((s) => s.likedEntryCount);
  const visiblePlaylists = playlists.filter((playlist) => !playlist.isSpecial);

  const [likedSongs, setLikedSongs] = useState<Track[]>([]);
  const [loadingSongs, setLoadingSongs] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchLibrary() {
      setError(null);
      setLoadingSongs(true);
      try {
        const [apiSongs] = await Promise.all([
          ytGetLibrarySongs(),
          hydratePlaylists(false, "library-view"),
          hydrateLikes(false, "library-view"),
        ]);
        if (cancelled) return;
        const mappedSongs = mapLibrarySongs(apiSongs);
        setLikedSongs(mappedSongs);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[LibraryView] Failed to load library:", msg);
        setError(msg);
      } finally {
        if (!cancelled) setLoadingSongs(false);
      }
    }

    void fetchLibrary();
    return () => {
      cancelled = true;
    };
  }, [hydrateLikes, hydratePlaylists]);

  if ((loadingSongs && !playlistsHydrated) || playlistsHydrating) {
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
    <div className="flex flex-col gap-6">
      <MediaGrid title="Biblioteca">
        <MediaCard
          title="Curtidas"
          typeLabel="Playlist"
          artistName={`${likedEntryCount} músicas`}
          thumbnails={likedSongs[0]?.thumbnails ?? []}
          onClick={() => navigate(paths.playlist("liked"))}
          onPlay={() => navigate(paths.playlist("liked"))}
        />

        {visiblePlaylists.map((playlist: Playlist) => (
          <MediaCard
            key={playlist.playlistId}
            title={playlist.title}
            typeLabel="Playlist"
            artistName={`${playlist.author.name} • ${playlist.trackCount ?? 0} músicas`}
            thumbnails={playlist.thumbnails ?? []}
            onClick={() => navigate(paths.playlist(playlist.playlistId))}
            onPlay={() => navigate(paths.playlist(playlist.playlistId))}
          />
        ))}
      </MediaGrid>
    </div>
  );
});
