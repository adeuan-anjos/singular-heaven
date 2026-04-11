import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Router, Route, Switch } from "wouter";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LoginScreen } from "./components/auth/login-screen";
import { AccountPicker } from "./components/auth/account-picker";
import { GoogleAccountPicker } from "./components/auth/google-account-picker";
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
import { ytGetCachedTracks, ytAuthLogout, type QueueSnapshot } from "./services/yt-api";
import { mapLibraryPlaylists } from "./services/mappers";
import type { PlayAllOptions, Playlist, Track } from "./types/music";
import { useRenderTracker, useLeakDetector, startMemoryMonitor } from "@/lib/debug";
import { useDocumentHiddenClass } from "@/lib/hooks/use-document-hidden-class";
import { perfMark, startModuleLoad } from "./services/perf";

type AuthState = "loading" | "unauthenticated" | "google-account-select" | "account-select" | "authenticated";

export default function YouTubeMusicModule() {
  useRenderTracker("YouTubeMusicModule", {});
  useLeakDetector("YouTubeMusicModule");
  useDocumentHiddenClass();
  useEffect(() => { startMemoryMonitor(5000); }, []);
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
  const queueOpenRef = useRef(queueOpen);

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

  console.log("[YouTubeMusicModule] render", { authState });

  useEffect(() => {
    queueOpenRef.current = queueOpen;
  }, [queueOpen]);

  useEffect(() => {
    console.log("[YouTubeMusicModule] mounted — checking auth status");
    startModuleLoad();
    let cancelled = false;

    async function checkAuth() {
      const authMark = perfMark("yt_ensure_session", "AUTH");
      try {
        // yt_ensure_session validates cookies and silently refreshes if expired
        console.log("[YouTubeMusicModule] invoking yt_ensure_session...");
        const status = await invoke<{
          authenticated: boolean;
          method: string;
          hasPageId: boolean;
        }>("yt_ensure_session");
        authMark.end({ authenticated: status.authenticated, hasPageId: status.hasPageId });
        console.log("[YouTubeMusicModule] yt_ensure_session result", JSON.stringify(status));
        if (!cancelled) {
          if (status.authenticated && status.hasPageId) {
            console.log("[YouTubeMusicModule] auth state transition", { from: "loading", to: "authenticated" });
            setAuthState("authenticated");
          } else if (status.authenticated) {
            console.log("[YouTubeMusicModule] auth state transition", { from: "loading", to: "account-select", reason: "no pageId" });
            setAuthState("account-select");
          } else {
            console.log("[YouTubeMusicModule] auth state transition", { from: "loading", to: "unauthenticated" });
            setAuthState("unauthenticated");
          }
        }
      } catch (err) {
        console.error("[YouTubeMusicModule] yt_ensure_session failed", { error: String(err) });
        if (!cancelled) {
          console.log("[YouTubeMusicModule] auth state transition", { from: "loading", to: "unauthenticated", reason: "invoke error" });
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

    const hydrationMark = perfMark("post-auth-hydration", "HYDRATE");
    void Promise.all([
      trackLikesHydrate(true, "auth-ready"),
      playlistLibraryHydrate(true, "auth-ready"),
    ]).then(() => hydrationMark.end());

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

  // SWR: listen for background refresh of liked track IDs
  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;

    listen<{ videoIds: string[] }>("liked-track-ids-updated", (event) => {
      if (cancelled) return;
      console.log("[YouTubeMusicModule] liked-track-ids-updated (SWR)", { count: event.payload.videoIds.length });
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
      console.log("[YouTubeMusicModule] library-playlists-updated (SWR)", { count: playlists.length });
      usePlaylistLibraryStore.getState().replaceLibraryPlaylists(playlists);
    }).then((fn) => {
      if (cancelled) { fn(); } else { unlisten = fn; }
    });

    return () => { cancelled = true; unlisten?.(); };
  }, []);

  const handleAuthenticated = useCallback(() => {
    console.log("[YouTubeMusicModule] handleAuthenticated: browser cookies accepted", {
      from: "unauthenticated",
      to: "google-account-select",
    });
    setAuthState("google-account-select");
  }, []);

  const handleGoogleAccountSelected = useCallback((authUser: number) => {
    console.log("[YouTubeMusicModule] handleGoogleAccountSelected: Google account confirmed", {
      authUser,
      from: "google-account-select",
      to: "account-select",
    });
    setAuthState("account-select");
  }, []);

  const handleAccountSelected = useCallback(() => {
    console.log("[YouTubeMusicModule] handleAccountSelected: channel/brand account confirmed", {
      from: "account-select",
      to: "authenticated",
    });
    setAuthState("authenticated");
  }, []);

  const handleLogout = useCallback(async () => {
    console.log("[YouTubeMusicModule] handleLogout: starting logout flow", {
      from: "authenticated",
      to: "unauthenticated",
    });
    try {
      await ytAuthLogout();
      console.log("[YouTubeMusicModule] handleLogout: ytAuthLogout succeeded, clearing stores");
      playlistLibraryClear();
      trackCacheClear();
      trackLikesClear();
      playerCleanup();
      void queueCleanup();
      console.log("[YouTubeMusicModule] handleLogout: stores cleared, setting state to unauthenticated");
      setAuthState("unauthenticated");
    } catch (err) {
      console.error("[YouTubeMusicModule] handleLogout: ytAuthLogout failed", { error: String(err) });
    }
  }, [playerCleanup, playlistLibraryClear, queueCleanup, trackCacheClear, trackLikesClear]);


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

  const handleEditPlaylist = useCallback((playlist: Playlist) => {
    console.log(
      `[YouTubeMusicModule] handleEditPlaylist ${JSON.stringify({
        playlistId: playlist.playlistId,
        title: playlist.title,
        hasDescription: Boolean(playlist.description),
        privacyStatus: playlist.privacyStatus ?? null,
      })}`
    );
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

  const handlePlaylistDeleted = useCallback((playlistId: string) => {
    console.log("[YouTubeMusicModule] handlePlaylistDeleted", { playlistId });
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
    ],
  );

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
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <TopBar onLogout={handleLogout} />

            <div className="flex min-h-0 flex-1">
              <SidePanel
                onEditPlaylist={handleEditPlaylist}
                onPlayAll={handlePlayAll}
                onSavePlaylist={handleSavePlaylist}
                onAddPlaylistNext={handleAddPlaylistNext}
                onAppendPlaylistToQueue={handleAppendPlaylistToQueue}
                onPlaylistDeleted={handlePlaylistDeleted}
              />
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
              </div>
            </div>

            <PlayerBar onOpenQueue={handleOpenQueue} />

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
