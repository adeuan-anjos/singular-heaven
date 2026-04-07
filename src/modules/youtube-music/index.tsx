import { useState, useCallback, useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
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
import type { Track } from "./types/music";
import { useRenderTracker, useLeakDetector } from "@/lib/debug";

export default function YouTubeMusicModule() {
  useRenderTracker("YouTubeMusicModule", {});
  useLeakDetector("YouTubeMusicModule");
  const [activeTab, setActiveTab] = useState("home");
  const [queueOpen, setQueueOpen] = useState(false);
  const nav = useNavigation();

  const playerPlay = usePlayerStore((s) => s.play);
  const playerCleanup = usePlayerStore((s) => s.cleanup);
  const queueSetTracks = useQueueStore((s) => s.setTracks);
  const queueAddNext = useQueueStore((s) => s.addNext);
  const queueCleanup = useQueueStore((s) => s.cleanup);

  console.log("[YouTubeMusicModule] render", { activeTab, page: nav.currentPage?.type });

  useEffect(() => {
    console.log("[YouTubeMusicModule] mounted");
    return () => {
      console.log("[YouTubeMusicModule] unmounting — cleaning up stores");
      playerCleanup();
      queueCleanup();
    };
  }, [playerCleanup, queueCleanup]);

  const handlePlayTrack = useCallback((track: Track) => {
    console.log("[YouTubeMusicModule] handlePlayTrack", { title: track.title });
    playerPlay(track);
    queueSetTracks([track], 0);
  }, [playerPlay, queueSetTracks]);

  const handlePlayAll = useCallback((tracks: Track[]) => {
    if (tracks.length === 0) return;
    console.log("[YouTubeMusicModule] handlePlayAll", { count: tracks.length });
    playerPlay(tracks[0]);
    queueSetTracks(tracks, 0);
  }, [playerPlay, queueSetTracks]);

  const handleAddToQueue = useCallback((track: Track) => {
    console.log("[YouTubeMusicModule] handleAddToQueue", { title: track.title });
    queueAddNext(track);
  }, [queueAddNext]);

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
              onAddToQueue={handleAddToQueue}
            />
          );
        case "artist-songs":
          return (
            <ArtistSongsPage
              artistId={nav.currentPage.artistId}
              onNavigate={nav.push}
              onPlayTrack={handlePlayTrack}
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

  return (
    <TooltipProvider delay={0}>
      <div className="flex h-full flex-col">
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
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {renderContent()}
          </div>
        </div>

        <PlayerBar
          onOpenQueue={() => setQueueOpen(true)}
          onGoToArtist={(id) => nav.push({ type: "artist", artistId: id })}
          onGoToAlbum={(id) => nav.push({ type: "album", albumId: id })}
        />

        <QueueSheet
          open={queueOpen}
          onOpenChange={setQueueOpen}
        />
      </div>
    </TooltipProvider>
  );
}
