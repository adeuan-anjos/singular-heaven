import { useState, useCallback, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Router, Route, Switch } from "wouter";
import { toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initMediaSession, destroyMediaSession } from "./services/media-session-bridge";
import { LoginScreen } from "./components/auth/login-screen";
import { AccountPicker } from "./components/auth/account-picker";
import { GoogleAccountPicker } from "./components/auth/google-account-picker";
import { SidePanel } from "./components/layout/side-panel";
import { TopBar } from "./components/layout/top-bar";
import { PlayerBar } from "./components/layout/player-bar";
import { ScrollRegion } from "./components/layout/scroll-region";
import { PageContainer } from "./components/layout/page-container";
import { HomeView } from "./components/home/home-view";
import { ExploreView } from "./components/explore/explore-view";
import { LibraryView } from "./components/library/library-view";
import { ArtistPage } from "./components/pages/artist-page";
import { ArtistSongsPage } from "./components/pages/artist-songs-page";
import { AlbumPage } from "./components/pages/album-page";
import { PlaylistPage } from "./components/pages/playlist-page";
import { QueueSheet } from "./components/queue/queue-sheet";
import { AmbientBackground } from "./components/layout/ambient-background";
import { SearchResultsPage } from "./components/search/search-results-page";
import { AddToPlaylistDialog } from "./components/shared/add-to-playlist-dialog";
import { EditPlaylistDialog } from "./components/shared/edit-playlist-dialog";
import { SavePlaylistDialog } from "./components/shared/save-playlist-dialog";
import {
  useHistoryStore,
  useMemoryLocation,
  useMemorySearch,
} from "./router/history-store";
import { paths } from "./router/paths";
import { YtActionsProvider, type YtActions } from "./router/actions-context";
import { usePlaylistRefreshStore } from "./stores/playlist-refresh-store";
import { usePlayerStore } from "./stores/player-store";
import { useQueueStore } from "./stores/queue-store";
import { usePlaylistLibraryStore } from "./stores/playlist-library-store";
import { useTrackCacheStore } from "./stores/track-cache-store";
import { useTrackLikeStore } from "./stores/track-like-store";
import { ytGetCachedTracks, ytAuthLogout, ytRadioStart, type QueueSnapshot, type RadioSeedKind } from "./services/yt-api";
import { mapLibraryPlaylists } from "./services/mappers";
import type { PlayAllOptions, Playlist, Track } from "./types/music";
import { useDocumentHiddenClass } from "@/lib/hooks/use-document-hidden-class";

type AuthState = "loading" | "unauthenticated" | "google-account-select" | "account-select" | "authenticated";

export default function YouTubeMusicModule() {
  useDocumentHiddenClass();
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [queueOpen, setQueueOpen] = useState(false);
  const [playlistDialogTrack, setPlaylistDialogTrack] = useState<Track | null>(null);
  const [savePlaylistDialog, setSavePlaylistDialog] = useState<{
    playlistId: string;
    title: string;
  } | null>(null);
  const [editPlaylistDialog, setEditPlaylistDialog] = useState<{
    playlistId: string;
    title: string;
    description?: string | null;
    privacyStatus?: "PUBLIC" | "PRIVATE" | "UNLISTED" | null;
    thumbnailUrl?: string | null;
  } | null>(null);

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

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const status = await invoke<{
          authenticated: boolean;
          method: string;
          hasPageId: boolean;
        }>("yt_ensure_session");
        if (!cancelled) {
          if (status.authenticated && status.hasPageId) {
            setAuthState("authenticated");
          } else if (status.authenticated) {
            setAuthState("account-select");
          } else {
            setAuthState("unauthenticated");
          }
        }
      } catch (err) {
        console.error("[YouTubeMusicModule] yt_ensure_session failed", { error: String(err) });
        if (!cancelled) {
          setAuthState("unauthenticated");
        }
      }
    }

    checkAuth();
    void queueHydrate();
    initMediaSession();

    return () => {
      cancelled = true;
      destroyMediaSession();
      playerCleanup();
      void queueCleanup();
      playlistLibraryClear();
      trackCacheClear();
      trackLikesClear();
    };
  }, [playerCleanup, playlistLibraryClear, queueCleanup, queueHydrate, trackCacheClear, trackLikesClear]);

  useEffect(() => {
    if (authState !== "authenticated") return;

    void Promise.all([
      trackLikesHydrate(true, "auth-ready"),
      playlistLibraryHydrate(true, "auth-ready"),
    ]);

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
      pendingIds = [];
      pendingComplete = false;

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

  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;

    listen<QueueSnapshot>("radio-extended", (event) => {
      if (cancelled) return;
      useQueueStore.getState().applyRadioExtended(event.payload);
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
  }, []);

  // SWR: listen for background refresh of liked track IDs
  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;

    listen<{ videoIds: string[] }>("liked-track-ids-updated", (event) => {
      if (cancelled) return;
      useTrackLikeStore.getState().replaceLikedTrackIds(event.payload.videoIds);
    }).then((fn) => {
      if (cancelled) { fn(); } else { unlisten = fn; }
    });

    return () => { cancelled = true; unlisten?.(); };
  }, []);

  // SWR: listen for background refresh of library playlists
  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;

    listen<{ playlistsJson: string }>("library-playlists-updated", (event) => {
      if (cancelled) return;
      const apiPlaylists = JSON.parse(event.payload.playlistsJson);
      const playlists = mapLibraryPlaylists(apiPlaylists);
      usePlaylistLibraryStore.getState().replaceLibraryPlaylists(playlists);
    }).then((fn) => {
      if (cancelled) { fn(); } else { unlisten = fn; }
    });

    return () => { cancelled = true; unlisten?.(); };
  }, []);

  const handleAuthenticated = useCallback(() => {
    setAuthState("google-account-select");
  }, []);

  const handleGoogleAccountSelected = useCallback((_authUser: number) => {
    setAuthState("account-select");
  }, []);

  const handleAccountSelected = useCallback(() => {
    setAuthState("authenticated");
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await ytAuthLogout();
      playlistLibraryClear();
      trackCacheClear();
      trackLikesClear();
      playerCleanup();
      void queueCleanup();
      setAuthState("unauthenticated");
    } catch (err) {
      console.error("[YouTubeMusicModule] handleLogout: ytAuthLogout failed", { error: String(err) });
    }
  }, [playerCleanup, playlistLibraryClear, queueCleanup, trackCacheClear, trackLikesClear]);


  const handlePlayTrack = useCallback(async (track: Track) => {
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
    trackCachePut([track]);
    await queueAddNext(track.videoId);
  }, [queueAddNext, trackCachePut]);

  const handleAddToPlaylist = useCallback((track: Track) => {
    setPlaylistDialogTrack(track);
  }, []);

  const handleSavePlaylist = useCallback((playlistId: string, title: string) => {
    setSavePlaylistDialog({ playlistId, title });
  }, []);

  const handleEditPlaylist = useCallback((playlist: Playlist) => {
    setEditPlaylistDialog({
      playlistId: playlist.playlistId,
      title: playlist.title,
      description: playlist.description ?? null,
      privacyStatus: playlist.privacyStatus ?? null,
      thumbnailUrl:
        playlist.thumbnails[playlist.thumbnails.length - 1]?.url ??
        playlist.thumbnails[0]?.url ??
        null,
    });
  }, []);

  const handleAddPlaylistNext = useCallback(
    async (tracks: Track[], queueTrackIds: string[]) => {
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
          playerPlay(targetTrackId);
        }
      }
    },
    [playerCurrentTrackId, playerPlay, queueAddCollectionNext, trackCachePut]
  );

  const handleAppendPlaylistToQueue = useCallback(
    async (tracks: Track[], queueTrackIds: string[]) => {
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
          playerPlay(targetTrackId);
        }
      }
    },
    [playerCurrentTrackId, playerPlay, queueAppendCollection, trackCachePut]
  );

  const handleStartRadio = useCallback(
    async (seed: { kind: RadioSeedKind; id: string }) => {
      try {
        const response = await ytRadioStart(seed.kind, seed.id);
        queueSyncSnapshot(response.snapshot);
        const targetTrackId = response.trackId;
        if (targetTrackId) {
          if (!useTrackCacheStore.getState().getTrack(targetTrackId)) {
            try {
              const resolvedTracks = await ytGetCachedTracks([targetTrackId]);
              if (resolvedTracks.length > 0) {
                trackCachePut(resolvedTracks);
              }
            } catch (error) {
              console.error(
                "[YouTubeMusicModule] failed to resolve track for radio start",
                error,
              );
            }
          }
          playerPlay(targetTrackId);
        }
      } catch (err) {
        console.error("[YouTubeMusicModule] handleStartRadio failed", err);
        toast.error("Não foi possível iniciar o rádio.");
      }
    },
    [playerPlay, queueSyncSnapshot, trackCachePut],
  );

  const handleOpenQueue = useCallback(() => setQueueOpen(true), []);

  const handlePlaylistDeleted = useCallback((playlistId: string) => {
    const state = useHistoryStore.getState();
    const currentPath = state.stack[state.index];
    const match = currentPath.match(/^\/playlist\/([^/?]+)/);
    if (match && decodeURIComponent(match[1]) === playlistId) {
      state.navigate(paths.library, { replace: true });
    }
  }, []);

  const ytActions = useMemo<YtActions>(
    () => ({
      onPlayTrack: handlePlayTrack,
      onPlayAll: handlePlayAll,
      onAddToQueue: handleAddToQueue,
      onAddToPlaylist: handleAddToPlaylist,
      onEditPlaylist: handleEditPlaylist,
      onSavePlaylist: handleSavePlaylist,
      onAddPlaylistNext: handleAddPlaylistNext,
      onAppendPlaylistToQueue: handleAppendPlaylistToQueue,
      onPlaylistDeleted: handlePlaylistDeleted,
      onStartRadio: handleStartRadio,
    }),
    [
      handlePlayTrack,
      handlePlayAll,
      handleAddToQueue,
      handleAddToPlaylist,
      handleEditPlaylist,
      handleSavePlaylist,
      handleAddPlaylistNext,
      handleAppendPlaylistToQueue,
      handlePlaylistDeleted,
      handleStartRadio,
    ],
  );

  // Smart memory management: Low when idle (5s), Normal when active
  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let isLow = false;

    const goNormal = () => {
      if (isLow) {
        invoke("yt_set_memory_level", { low: false }).catch(() => {});
        isLow = false;
      }
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
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
      />
    );
  }

  if (authState === "google-account-select") {
    return (
      <GoogleAccountPicker
        onAccountSelected={handleGoogleAccountSelected}
        onBack={() => setAuthState("unauthenticated")}
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
      <Router hook={useMemoryLocation} searchHook={useMemorySearch}>
        <YtActionsProvider value={ytActions}>
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <AmbientBackground />
            <TopBar onLogout={handleLogout} />

            <div className="flex min-h-0 flex-1">
              <SidePanel
                onEditPlaylist={handleEditPlaylist}
                onPlayAll={handlePlayAll}
                onSavePlaylist={handleSavePlaylist}
                onAddPlaylistNext={handleAddPlaylistNext}
                onAppendPlaylistToQueue={handleAppendPlaylistToQueue}
                onStartRadio={handleStartRadio}
                onPlaylistDeleted={handlePlaylistDeleted}
              />
              <ScrollRegion>
                <PageContainer>
                  <Switch>
                    <Route path={paths.home} component={HomeView} />
                    <Route path={paths.explore} component={ExploreView} />
                    <Route path={paths.library} component={LibraryView} />
                    <Route path="/artist/:id/songs" component={ArtistSongsPage} />
                    <Route path="/artist/:id" component={ArtistPage} />
                    <Route path="/album/:id" component={AlbumPage} />
                    <Route path="/playlist/:id" component={PlaylistPage} />
                    <Route path="/search" component={SearchResultsPage} />
                    <Route path="/mood" component={ExploreView} />
                    <Route component={HomeView} />
                  </Switch>
                  {/* Spacer to prevent content from being hidden behind the glass player bar */}
                  <div className="h-16 shrink-0" />
                </PageContainer>
              </ScrollRegion>
            </div>

            <div className="absolute bottom-0 left-0 right-0 z-20">
              <PlayerBar onOpenQueue={handleOpenQueue} />
            </div>

            <QueueSheet open={queueOpen} onOpenChange={setQueueOpen} />

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

            <EditPlaylistDialog
              open={editPlaylistDialog !== null}
              onOpenChange={(open) => {
                if (!open) setEditPlaylistDialog(null);
              }}
              playlistId={editPlaylistDialog?.playlistId ?? null}
              initialTitle={editPlaylistDialog?.title}
              initialDescription={editPlaylistDialog?.description}
              initialPrivacyStatus={editPlaylistDialog?.privacyStatus ?? null}
              initialThumbnailUrl={editPlaylistDialog?.thumbnailUrl ?? null}
              onSaved={() => {
                if (editPlaylistDialog) {
                  usePlaylistRefreshStore.getState().bump(editPlaylistDialog.playlistId);
                }
              }}
            />
          </div>
        </YtActionsProvider>
      </Router>
    </TooltipProvider>
  );
}
