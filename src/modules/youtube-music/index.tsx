import { useState, useCallback, useEffect } from "react";
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
import { useNavigation } from "./hooks/use-navigation";
import { usePlayerStore } from "./stores/player-store";
import { useQueueStore } from "./stores/queue-store";
import { useTrackCacheStore } from "./stores/track-cache-store";
import type { Track } from "./types/music";
import { useRenderTracker, useLeakDetector, startMemoryMonitor } from "@/lib/debug";

type AuthState = "loading" | "unauthenticated" | "account-select" | "authenticated" | "skipped";

export default function YouTubeMusicModule() {
  useRenderTracker("YouTubeMusicModule", {});
  useLeakDetector("YouTubeMusicModule");
  useEffect(() => { startMemoryMonitor(5000); }, []);
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [activeTab, setActiveTab] = useState("home");
  const [queueOpen, setQueueOpen] = useState(false);
  const nav = useNavigation();

  const playerPlay = usePlayerStore((s) => s.play);
  const playerCleanup = usePlayerStore((s) => s.cleanup);
  const queueSetQueue = useQueueStore((s) => s.setQueue);
  const queueAddNext = useQueueStore((s) => s.addNext);
  const queueCleanup = useQueueStore((s) => s.cleanup);
  const trackCachePut = useTrackCacheStore((s) => s.putTracks);
  const trackCacheClear = useTrackCacheStore((s) => s.clear);

  console.log("[YouTubeMusicModule] render", { authState, activeTab, page: nav.currentPage?.type });

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

    return () => {
      cancelled = true;
      console.log("[YouTubeMusicModule] unmounting — cleaning up stores");
      playerCleanup();
      queueCleanup();
      trackCacheClear();
    };
  }, [playerCleanup, queueCleanup, trackCacheClear]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;

    listen<{
      playlistId: string;
      newTrackIds: string[];
      totalTracks: number;
      isComplete: boolean;
    }>("playlist-tracks-updated", (event) => {
      const { playlistId, newTrackIds, totalTracks, isComplete } = event.payload;
      const queueState = useQueueStore.getState();
      if (queueState.playlistId === playlistId) {
        console.log("[YouTubeMusicModule] playlist-tracks-updated", {
          playlistId,
          newTracks: newTrackIds.length,
          totalTracks,
          isComplete,
        });
        queueState.appendTrackIds(newTrackIds);
        if (isComplete) {
          queueState.markComplete();
        }
      }
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
    };
  }, []);

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

  const handlePlayTrack = useCallback((track: Track) => {
    console.log("[YouTubeMusicModule] handlePlayTrack", { title: track.title });
    trackCachePut([track]);
    playerPlay(track.videoId);
    queueSetQueue([track.videoId], 0);
  }, [playerPlay, queueSetQueue, trackCachePut]);

  const handlePlayAll = useCallback(
    (tracks: Track[], startIndex?: number, playlistId?: string, isComplete?: boolean) => {
      if (tracks.length === 0) return;
      const idx = startIndex ?? 0;
      console.log("[YouTubeMusicModule] handlePlayAll", {
        count: tracks.length,
        startIndex: idx,
        playlistId,
        isComplete,
      });
      trackCachePut(tracks);
      const ids = tracks.map((t) => t.videoId).filter(Boolean);
      playerPlay(ids[idx]);
      queueSetQueue(ids, idx, playlistId ?? null, isComplete ?? true);
    },
    [playerPlay, queueSetQueue, trackCachePut]
  );

  const handleAddToQueue = useCallback((track: Track) => {
    console.log("[YouTubeMusicModule] handleAddToQueue", { title: track.title });
    trackCachePut([track]);
    queueAddNext(track.videoId);
  }, [queueAddNext, trackCachePut]);

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
            />
          );
        case "album":
          return (
            <AlbumPage
              albumId={nav.currentPage.albumId}
              onNavigate={nav.push}
              onPlayTrack={handlePlayTrack}
              onAddToQueue={handleAddToQueue}
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
      </div>
    </TooltipProvider>
  );
}
