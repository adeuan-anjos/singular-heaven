import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LoginScreen } from "./components/auth/login-screen";
import { AccountPicker } from "./components/auth/account-picker";
import { SidePanel } from "./components/layout/side-panel";
import { TopBar } from "./components/layout/top-bar";
import { PlayerBar } from "./components/layout/player-bar";
import { HomeView } from "./components/home/home-view";
import { ExploreView } from "./components/explore/explore-view";
import { LibraryView } from "./components/library/library-view";
import { ArtistPage } from "./components/pages/artist-page";
import { ArtistSongsPage } from "./components/pages/artist-songs-page";
import { AlbumPage } from "./components/pages/album-page";
import { PlaylistPage } from "./components/pages/playlist-page";
import { QueueSheet } from "./components/queue/queue-sheet";
import { SearchResultsPage } from "./components/search/search-results-page";
import { AddToPlaylistDialog } from "./components/shared/add-to-playlist-dialog";
import { SavePlaylistDialog } from "./components/shared/save-playlist-dialog";
import { useNavigation } from "./hooks/use-navigation";
import { usePlayerStore } from "./stores/player-store";
import { useQueueStore } from "./stores/queue-store";
import { usePlaylistLibraryStore } from "./stores/playlist-library-store";
import { useTrackCacheStore } from "./stores/track-cache-store";
import { useTrackLikeStore } from "./stores/track-like-store";
import { ytGetCachedTracks, type QueueSnapshot } from "./services/yt-api";
import type { PlayAllOptions, Track } from "./types/music";
import { useRenderTracker, useLeakDetector, startMemoryMonitor } from "@/lib/debug";

type AuthState = "loading" | "unauthenticated" | "account-select" | "authenticated" | "skipped";

export default function YouTubeMusicModule() {
  useRenderTracker("YouTubeMusicModule", {});
  useLeakDetector("YouTubeMusicModule");
  useEffect(() => { startMemoryMonitor(5000); }, []);
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [activeTab, setActiveTab] = useState("home");
  const [queueOpen, setQueueOpen] = useState(false);
  const [playlistDialogTrack, setPlaylistDialogTrack] = useState<Track | null>(null);
  const [savePlaylistDialog, setSavePlaylistDialog] = useState<{
    playlistId: string;
    title: string;
  } | null>(null);
  const queueOpenRef = useRef(queueOpen);
  const nav = useNavigation();

  const playerPlay = usePlayerStore((s) => s.play);
  const playerCurrentTrackId = usePlayerStore((s) => s.currentTrackId);
  const playerCleanup = usePlayerStore((s) => s.cleanup);
  const queueSetQueue = useQueueStore((s) => s.setQueue);
  const queueAddNext = useQueueStore((s) => s.addNext);
  const queueAddCollectionNext = useQueueStore((s) => s.addCollectionNext);
  const queueAppendCollection = useQueueStore((s) => s.appendCollection);
  const queueCleanup = useQueueStore((s) => s.cleanup);
  const queueHydrate = useQueueStore((s) => s.hydrate);
  const queueSyncSnapshot = useQueueStore((s) => s.syncSnapshot);
  const playlistLibraryHydrate = usePlaylistLibraryStore((s) => s.hydrate);
  const playlistLibraryClear = usePlaylistLibraryStore((s) => s.clear);
  const trackCachePut = useTrackCacheStore((s) => s.putTracks);
  const trackCacheClear = useTrackCacheStore((s) => s.clear);
  const trackLikesHydrate = useTrackLikeStore((s) => s.hydrate);
  const trackLikesClear = useTrackLikeStore((s) => s.clear);

  console.log("[YouTubeMusicModule] render", { authState, activeTab, page: nav.currentPage?.type });

  useEffect(() => {
    queueOpenRef.current = queueOpen;
  }, [queueOpen]);

  useEffect(() => {
    console.log("[YouTubeMusicModule] mounted — checking auth status");
    let cancelled = false;

    async function checkAuth() {
      try {
        const status = await invoke<{ authenticated: boolean }>("yt_auth_status");
        console.log("[YouTubeMusicModule] yt_auth_status result", status);
        if (!cancelled) {
          setAuthState(status.authenticated ? "account-select" : "unauthenticated");
        }
      } catch (err) {
        console.error("[YouTubeMusicModule] yt_auth_status failed", err);
        if (!cancelled) {
          setAuthState("unauthenticated");
        }
      }
    }

    checkAuth();
    void queueHydrate();

    return () => {
      cancelled = true;
      console.log("[YouTubeMusicModule] unmounting — cleaning up stores");
      playerCleanup();
      void queueCleanup();
      playlistLibraryClear();
      trackCacheClear();
      trackLikesClear();
    };
  }, [playerCleanup, playlistLibraryClear, queueCleanup, queueHydrate, trackCacheClear, trackLikesClear]);

  useEffect(() => {
    if (authState !== "authenticated") return;

    void trackLikesHydrate(true, "auth-ready");
    void playlistLibraryHydrate(true, "auth-ready");

    const refreshSessionData = () => {
      if (document.visibilityState === "hidden") return;
      void trackLikesHydrate(false, "window-focus");
      void playlistLibraryHydrate(false, "window-focus");
    };

    window.addEventListener("focus", refreshSessionData);
    document.addEventListener("visibilitychange", refreshSessionData);

    return () => {
      window.removeEventListener("focus", refreshSessionData);
      document.removeEventListener("visibilitychange", refreshSessionData);
    };
  }, [authState, playlistLibraryHydrate, trackLikesHydrate]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;

    // Debounce rapid background events into batched updates (500ms window).
    // Without this, 20-40 events in quick succession cause 20-40 re-renders.
    let pendingIds: string[] = [];
    let pendingComplete = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const flushPendingEvents = () => {
      debounceTimer = null;
      if (pendingIds.length === 0 && !pendingComplete) return;
      const ids = pendingIds;
      const done = pendingComplete;
      pendingIds = [];
      pendingComplete = false;
      const queueState = useQueueStore.getState();

      console.log("[YouTubeMusicModule] flush playlist events", {
        newTracks: ids.length,
        isComplete: done,
        queueOpen: queueOpenRef.current,
        currentQueueSize: queueState.totalLoaded,
      });

      if (ids.length > 0) {
        // Pre-populate L1 cache
        invoke<string>("yt_get_cached_tracks", { videoIds: ids })
          .then((json) => {
            const tracks: Track[] = JSON.parse(json);
            if (tracks.length > 0) trackCachePut(tracks);
          })
          .catch((err) => console.error("[YouTubeMusicModule] pre-populate L1 error", err));
      }
    };

    listen<{
      playlistId: string;
      newTrackIds: string[];
      totalTracks: number;
      isComplete: boolean;
    }>("playlist-tracks-updated", (event) => {
      const { playlistId, newTrackIds, isComplete } = event.payload;
      if (useQueueStore.getState().playlistId !== playlistId) return;

      pendingIds.push(...newTrackIds);
      if (isComplete) pendingComplete = true;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flushPendingEvents, 500);
    }).then((fn) => {
      if (cancelled) {
        fn(); // immediately unlisten if already unmounted
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
      if (debounceTimer) clearTimeout(debounceTimer);
      // Flush any pending events before unmount
      if (pendingIds.length > 0 || pendingComplete) flushPendingEvents();
    };
  }, [trackCachePut]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;

    listen<QueueSnapshot>("queue-state-updated", (event) => {
      if (cancelled) return;
      queueSyncSnapshot(event.payload);
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [queueSyncSnapshot]);

  const handleAuthenticated = useCallback(() => {
    console.log("[YouTubeMusicModule] user authenticated, proceeding to account selection");
    setAuthState("account-select");
  }, []);

  const handleAccountSelected = useCallback(() => {
    console.log("[YouTubeMusicModule] account selected, proceeding to main UI");
    setAuthState("authenticated");
  }, []);

  const handleSkip = useCallback(() => {
    console.log("[YouTubeMusicModule] user skipped authentication");
    setAuthState("skipped");
  }, []);

  const handlePlayTrack = useCallback(async (track: Track) => {
    console.log("[YouTubeMusicModule] handlePlayTrack", { title: track.title });
    trackCachePut([track]);
    const queueTrackId = await queueSetQueue([track.videoId], 0, null, true, false);
    playerPlay(queueTrackId ?? track.videoId);
  }, [playerPlay, queueSetQueue, trackCachePut]);

  const handlePlayAll = useCallback(
    async (
      tracks: Track[],
      startIndex?: number,
      playlistId?: string,
      isComplete?: boolean,
      options?: PlayAllOptions
    ) => {
      const ids = (options?.queueTrackIds ?? tracks.map((t) => t.videoId).filter(Boolean));
      if (ids.length === 0) return;
      const idx = Math.min(startIndex ?? 0, ids.length - 1);
      console.log("[YouTubeMusicModule] handlePlayAll", {
        count: tracks.length,
        queueCount: ids.length,
        startIndex: idx,
        playlistId,
        isComplete,
        shuffle: options?.shuffle ?? false,
      });

      if (tracks.length > 0) {
        trackCachePut(tracks);
      }

      const targetTrackId = ids[idx];
      if (!tracks.some((track) => track.videoId === targetTrackId)) {
        try {
          const resolvedTracks = await ytGetCachedTracks([targetTrackId]);
          if (resolvedTracks.length > 0) {
            trackCachePut(resolvedTracks);
          }
        } catch (error) {
          console.error("[YouTubeMusicModule] failed to resolve selected track from cache", error);
        }
      }

      const queueTrackId = await queueSetQueue(
        ids,
        idx,
        playlistId ?? null,
        isComplete ?? true,
        options?.shuffle ?? false
      );
      playerPlay(queueTrackId ?? targetTrackId);
    },
    [playerPlay, queueSetQueue, trackCachePut]
  );

  const handleAddToQueue = useCallback(async (track: Track) => {
    console.log("[YouTubeMusicModule] handleAddToQueue", { title: track.title });
    trackCachePut([track]);
    await queueAddNext(track.videoId);
  }, [queueAddNext, trackCachePut]);

  const handleAddToPlaylist = useCallback((track: Track) => {
    console.log("[YouTubeMusicModule] handleAddToPlaylist", {
      title: track.title,
      videoId: track.videoId,
    });
    setPlaylistDialogTrack(track);
  }, []);

  const handleSavePlaylist = useCallback((playlistId: string, title: string) => {
    console.log(
      `[YouTubeMusicModule] handleSavePlaylist ${JSON.stringify({
        playlistId,
        title,
      })}`
    );
    setSavePlaylistDialog({ playlistId, title });
  }, []);

  const handleAddPlaylistNext = useCallback(
    async (tracks: Track[], queueTrackIds: string[]) => {
      console.log(
        `[YouTubeMusicModule] handleAddPlaylistNext ${JSON.stringify({
          loadedTracks: tracks.length,
          queueTrackIds: queueTrackIds.length,
          firstTrackId: queueTrackIds[0] ?? null,
          lastTrackId: queueTrackIds[queueTrackIds.length - 1] ?? null,
        })}`
      );
      if (tracks.length > 0) {
        trackCachePut(tracks);
      }
      const queueTrackId = await queueAddCollectionNext(queueTrackIds);
      if (!playerCurrentTrackId) {
        const targetTrackId = queueTrackId ?? queueTrackIds[0] ?? null;
        if (targetTrackId) {
          if (!useTrackCacheStore.getState().getTrack(targetTrackId)) {
            try {
              const resolvedTracks = await ytGetCachedTracks([targetTrackId]);
              if (resolvedTracks.length > 0) {
                trackCachePut(resolvedTracks);
              }
            } catch (error) {
              console.error(
                "[YouTubeMusicModule] failed to resolve track for idle add-next playback",
                error
              );
            }
          }

          console.log(
            `[YouTubeMusicModule] booting player from add-next ${JSON.stringify({
              targetTrackId,
              source: queueTrackId ? "queue" : "fallback",
            })}`
          );
          playerPlay(targetTrackId);
        }
      }
    },
    [playerCurrentTrackId, playerPlay, queueAddCollectionNext, trackCachePut]
  );

  const handleAppendPlaylistToQueue = useCallback(
    async (tracks: Track[], queueTrackIds: string[]) => {
      console.log(
        `[YouTubeMusicModule] handleAppendPlaylistToQueue ${JSON.stringify({
          loadedTracks: tracks.length,
          queueTrackIds: queueTrackIds.length,
          firstTrackId: queueTrackIds[0] ?? null,
          lastTrackId: queueTrackIds[queueTrackIds.length - 1] ?? null,
        })}`
      );
      if (tracks.length > 0) {
        trackCachePut(tracks);
      }
      const queueTrackId = await queueAppendCollection(queueTrackIds);
      if (!playerCurrentTrackId) {
        const targetTrackId = queueTrackId ?? queueTrackIds[0] ?? null;
        if (targetTrackId) {
          if (!useTrackCacheStore.getState().getTrack(targetTrackId)) {
            try {
              const resolvedTracks = await ytGetCachedTracks([targetTrackId]);
              if (resolvedTracks.length > 0) {
                trackCachePut(resolvedTracks);
              }
            } catch (error) {
              console.error(
                "[YouTubeMusicModule] failed to resolve track for idle append playback",
                error
              );
            }
          }

          console.log(
            `[YouTubeMusicModule] booting player from append ${JSON.stringify({
              targetTrackId,
              source: queueTrackId ? "queue" : "fallback",
            })}`
          );
          playerPlay(targetTrackId);
        }
      }
    },
    [playerCurrentTrackId, playerPlay, queueAppendCollection, trackCachePut]
  );

  const handleOpenQueue = useCallback(() => setQueueOpen(true), []);

  const handleGoToArtist = useCallback((id: string) => {
    nav.push({ type: "artist", artistId: id });
  }, [nav.push]);

  const handleGoToAlbum = useCallback((id: string) => {
    nav.push({ type: "album", albumId: id });
  }, [nav.push]);

  const handleSearchSubmit = useCallback((query: string) => {
    console.log("[YouTubeMusicModule] handleSearchSubmit", { query });
    nav.push({ type: "search", query });
  }, [nav]);

  const handleViewChange = useCallback((view: string) => {
    nav.clear();
    setActiveTab(view);
  }, [nav]);

  const handleSelectPlaylist = useCallback((id: string | null) => {
    // Side panel playlist click → push playlist page onto navigation stack
    if (id === null) {
      // "Curtidas" in sidebar
      nav.push({ type: "playlist", playlistId: "liked" });
    } else {
      nav.push({ type: "playlist", playlistId: id });
    }
  }, [nav]);

  const handlePlaylistDeleted = useCallback((playlistId: string) => {
    console.log("[YouTubeMusicModule] handlePlaylistDeleted", { playlistId });
    if (nav.currentPage?.type === "playlist" && nav.currentPage.playlistId === playlistId) {
      nav.clear();
      setActiveTab("library");
    }
  }, [nav]);

  const renderContent = () => {
    if (nav.currentPage) {
      switch (nav.currentPage.type) {
        case "artist":
          return (
            <ArtistPage
              artistId={nav.currentPage.artistId}
              onNavigate={nav.push}
              onPlayTrack={handlePlayTrack}
              onPlayAll={handlePlayAll}
              onAddToQueue={handleAddToQueue}
              onAddToPlaylist={handleAddToPlaylist}
            />
          );
        case "artist-songs":
          return (
            <ArtistSongsPage
              artistId={nav.currentPage.artistId}
              onNavigate={nav.push}
              onPlayTrack={handlePlayTrack}
              onPlayAll={handlePlayAll}
              onAddToQueue={handleAddToQueue}
              onAddToPlaylist={handleAddToPlaylist}
            />
          );
        case "album":
          return (
            <AlbumPage
              albumId={nav.currentPage.albumId}
              onNavigate={nav.push}
              onPlayTrack={handlePlayTrack}
              onAddToQueue={handleAddToQueue}
              onAddToPlaylist={handleAddToPlaylist}
              onPlayAll={handlePlayAll}
            />
          );
        case "playlist":
          return (
            <PlaylistPage
              playlistId={nav.currentPage.playlistId}
              onNavigate={nav.push}
              onPlayTrack={handlePlayTrack}
              onAddToQueue={handleAddToQueue}
              onAddToPlaylist={handleAddToPlaylist}
              onSavePlaylist={handleSavePlaylist}
              onAddPlaylistNext={handleAddPlaylistNext}
              onAppendPlaylistToQueue={handleAppendPlaylistToQueue}
              onPlaylistDeleted={handlePlaylistDeleted}
              onPlayAll={handlePlayAll}
            />
          );
        case "search":
          return (
            <SearchResultsPage
              query={nav.currentPage.query}
              onNavigate={nav.push}
              onPlayTrack={handlePlayTrack}
              onPlayAll={handlePlayAll}
              onAddToQueue={handleAddToQueue}
              onAddToPlaylist={handleAddToPlaylist}
            />
          );
        case "mood":
          return <ExploreView onNavigate={nav.push} onPlayTrack={handlePlayTrack} />;
        default:
          return null;
      }
    }

    switch (activeTab) {
      case "home":
        return <HomeView onNavigate={nav.push} onPlayTrack={handlePlayTrack} />;
      case "explore":
        return <ExploreView onNavigate={nav.push} onPlayTrack={handlePlayTrack} />;
      case "library":
        return <LibraryView onNavigate={nav.push} />;
      default:
        return null;
    }
  };

  // Smart memory management: Low when idle (5s), Normal when active
  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let isLow = false;

    const goNormal = () => {
      if (isLow) {
        console.log("[MemoryManager] User active → Normal");
        invoke("yt_set_memory_level", { low: false }).catch(() => {});
        isLow = false;
      }
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        console.log("[MemoryManager] Idle 5s → Low");
        invoke("yt_set_memory_level", { low: true }).catch(() => {});
        isLow = true;
      }, 5000);
    };

    const events = ["scroll", "mousemove", "keydown", "touchstart", "click"] as const;
    events.forEach((e) => window.addEventListener(e, goNormal, { passive: true }));
    goNormal(); // start timer

    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      events.forEach((e) => window.removeEventListener(e, goNormal));
    };
  }, []);

  if (authState === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Verificando autenticação...</div>
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <LoginScreen
        onAuthenticated={handleAuthenticated}
        onSkip={handleSkip}
      />
    );
  }

  if (authState === "account-select") {
    return (
      <AccountPicker
        onAccountSelected={handleAccountSelected}
      />
    );
  }

  return (
    <TooltipProvider delay={0}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Top bar — full width, splits into side-panel spacer + nav controls */}
        <TopBar
          onBack={nav.pop}
          onForward={nav.forward}
          canGoBack={nav.canGoBack}
          canGoForward={nav.canGoForward}
          onNavigate={nav.push}
          onPlayTrack={handlePlayTrack}
          onSearchSubmit={handleSearchSubmit}
        />

        {/* Main area */}
        <div className="flex min-h-0 flex-1">
        <SidePanel
          activeView={activeTab}
          onViewChange={handleViewChange}
          onSelectPlaylist={handleSelectPlaylist}
          onPlayAll={handlePlayAll}
          onSavePlaylist={handleSavePlaylist}
          onAddPlaylistNext={handleAddPlaylistNext}
          onAppendPlaylistToQueue={handleAppendPlaylistToQueue}
          onPlaylistDeleted={handlePlaylistDeleted}
        />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {renderContent()}
          </div>
        </div>

        <PlayerBar
          onOpenQueue={handleOpenQueue}
          onGoToArtist={handleGoToArtist}
          onGoToAlbum={handleGoToAlbum}
        />

        <QueueSheet
          open={queueOpen}
          onOpenChange={setQueueOpen}
        />

        <AddToPlaylistDialog
          open={playlistDialogTrack !== null}
          onOpenChange={(open) => {
            if (!open) setPlaylistDialogTrack(null);
          }}
          track={playlistDialogTrack}
        />

        <SavePlaylistDialog
          open={savePlaylistDialog !== null}
          onOpenChange={(open) => {
            if (!open) setSavePlaylistDialog(null);
          }}
          sourcePlaylistId={savePlaylistDialog?.playlistId ?? null}
          sourcePlaylistTitle={savePlaylistDialog?.title ?? null}
        />
      </div>
    </TooltipProvider>
  );
}
