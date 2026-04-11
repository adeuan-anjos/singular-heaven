import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MediaGrid } from "../shared/media-grid";
import { MediaCard } from "../shared/media-card";
import { ytGetLibrarySongs } from "../../services/yt-api";
import { mapLibrarySongs } from "../../services/mappers";
import { usePlaylistLibraryStore } from "../../stores/playlist-library-store";
import { useTrackLikeStore } from "../../stores/track-like-store";
import type { Playlist, StackPage, Track } from "../../types/music";
import { useRenderTracker } from "@/lib/debug";
import { perfMark, endModuleLoad } from "../../services/perf";

interface LibraryViewProps {
  onNavigate: (page: StackPage) => void;
}

export const LibraryView = React.memo(function LibraryView({
  onNavigate,
}: LibraryViewProps) {
  useRenderTracker("LibraryView", { onNavigate });

  const playlists = usePlaylistLibraryStore((s) => s.playlists);
  const hydratePlaylists = usePlaylistLibraryStore((s) => s.hydrate);
  const playlistsHydrated = usePlaylistLibraryStore((s) => s.hydrated);
  const playlistsHydrating = usePlaylistLibraryStore((s) => s.hydrating);
  const hydrateLikes = useTrackLikeStore((s) => s.hydrate);
  const likedEntryCount = useTrackLikeStore((s) => s.likedEntryCount);
  const likedUniqueCount = useTrackLikeStore((s) => s.likedUniqueCount);
  const visiblePlaylists = playlists.filter((playlist) => !playlist.isSpecial);

  const [likedSongs, setLikedSongs] = useState<Track[]>([]);
  const [loadingSongs, setLoadingSongs] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchLibrary() {
      const viewMark = perfMark("LibraryView fetch", "VIEW");
      console.log("[LibraryView] Fetching library data...");
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
        viewMark.end({ songs: mappedSongs.length });
        endModuleLoad();
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

  useEffect(() => {
    console.log(
        `[LibraryView] liked count resolved ${JSON.stringify({
          playlistEntryCount: likedEntryCount,
          uniqueVideoIdCount: likedUniqueCount,
          playlistCount: visiblePlaylists.length,
        })}`
    );
  }, [likedEntryCount, likedUniqueCount, visiblePlaylists.length]);

  console.log("[LibraryView] render", {
    playlistCount: visiblePlaylists.length,
    likedEntryCount,
    likedUniqueCount,
  });

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
    <ScrollArea className="group/page h-full">
      <div className="mx-auto max-w-screen-xl space-y-6 p-4">
        <MediaGrid title="Biblioteca">
          <MediaCard
            title="Curtidas"
            typeLabel="Playlist"
            artistName={`${likedEntryCount} músicas`}
            thumbnails={likedSongs[0]?.thumbnails ?? []}
            onClick={() => onNavigate({ type: "playlist", playlistId: "liked" })}
            onPlay={() => onNavigate({ type: "playlist", playlistId: "liked" })}
          />

          {visiblePlaylists.map((playlist: Playlist) => (
            <MediaCard
              key={playlist.playlistId}
              title={playlist.title}
              typeLabel="Playlist"
              artistName={`${playlist.author.name} • ${playlist.trackCount ?? 0} músicas`}
              thumbnails={playlist.thumbnails ?? []}
              onClick={() => onNavigate({ type: "playlist", playlistId: playlist.playlistId })}
              onPlay={() => onNavigate({ type: "playlist", playlistId: playlist.playlistId })}
            />
          ))}
        </MediaGrid>
      </div>
    </ScrollArea>
  );
});
