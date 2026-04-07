import { useState, useCallback, useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidePanel } from "./components/layout/side-panel";
import { MusicHeader } from "./components/layout/music-header";
import { PlayerBar } from "./components/layout/player-bar";
import { HomeView } from "./components/home/home-view";
import { ExploreView } from "./components/explore/explore-view";
import { LibraryView } from "./components/library/library-view";
import { SearchView } from "./components/search/search-view";
import { ArtistPage } from "./components/pages/artist-page";
import { AlbumPage } from "./components/pages/album-page";
import { PlaylistPage } from "./components/pages/playlist-page";
import { QueueSheet } from "./components/queue/queue-sheet";
import { useNavigation } from "./hooks/use-navigation";
import { usePlayerStore } from "./stores/player-store";
import { useQueueStore } from "./stores/queue-store";
import { mockTracks, getMockPlaylist, mockPlaylists } from "./mock/data";
import type { Track } from "./types/music";
import { useRenderTracker, useLeakDetector } from "@/lib/debug";

function getPageTitle(page: { type: string; title?: string } | null): string {
  if (!page) return "";
  switch (page.type) {
    case "artist": return "Artista";
    case "album": return "Álbum";
    case "playlist": return "Playlist";
    case "search": return "Buscar";
    case "mood": return (page as { title: string }).title;
    default: return "";
  }
}

export default function YouTubeMusicModule() {
  useRenderTracker("YouTubeMusicModule", {});
  useLeakDetector("YouTubeMusicModule");
  const [activeTab, setActiveTab] = useState("home");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const nav = useNavigation();

  const playerPlay = usePlayerStore((s) => s.play);
  const playerCleanup = usePlayerStore((s) => s.cleanup);
  const queueSetTracks = useQueueStore((s) => s.setTracks);
  const queueAddNext = useQueueStore((s) => s.addNext);
  const queueCleanup = useQueueStore((s) => s.cleanup);

  console.log("[YouTubeMusicModule] render", { activeTab, selectedPlaylistId, page: nav.currentPage?.type });

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

  const handleViewChange = useCallback((view: string) => {
    nav.clear();
    setActiveTab(view);
  }, [nav]);

  const handleSelectPlaylist = useCallback((id: string | null) => {
    nav.clear();
    setSelectedPlaylistId(id);
  }, [nav]);

  // Compute library tracks and title from selectedPlaylistId
  const libraryTracks =
    selectedPlaylistId === null
      ? mockTracks
      : getMockPlaylist(selectedPlaylistId).tracks ?? mockTracks;

  const libraryTitle =
    selectedPlaylistId === null
      ? "Curtidas"
      : (mockPlaylists.find((p) => p.playlistId === selectedPlaylistId)?.title ?? "Playlist");

  const renderContent = () => {
    if (nav.currentPage) {
      switch (nav.currentPage.type) {
        case "artist":
          return (
            <>
              <MusicHeader title={getPageTitle(nav.currentPage)} onBack={nav.pop} />
              <ArtistPage
                artistId={nav.currentPage.artistId}
                onNavigate={nav.push}
                onPlayTrack={handlePlayTrack}
                onAddToQueue={handleAddToQueue}
              />
            </>
          );
        case "album":
          return (
            <>
              <MusicHeader title={getPageTitle(nav.currentPage)} onBack={nav.pop} />
              <AlbumPage
                albumId={nav.currentPage.albumId}
                onNavigate={nav.push}
                onPlayTrack={handlePlayTrack}
                onAddToQueue={handleAddToQueue}
                onPlayAll={handlePlayAll}
              />
            </>
          );
        case "playlist":
          return (
            <>
              <MusicHeader title={getPageTitle(nav.currentPage)} onBack={nav.pop} />
              <PlaylistPage
                playlistId={nav.currentPage.playlistId}
                onNavigate={nav.push}
                onPlayTrack={handlePlayTrack}
                onAddToQueue={handleAddToQueue}
                onPlayAll={handlePlayAll}
              />
            </>
          );
        case "search":
          return (
            <>
              <MusicHeader title={getPageTitle(nav.currentPage)} onBack={nav.pop} />
              <SearchView onNavigate={nav.push} onPlayTrack={handlePlayTrack} />
            </>
          );
        case "mood":
          return (
            <>
              <MusicHeader title={getPageTitle(nav.currentPage)} onBack={nav.pop} />
              <ExploreView onNavigate={nav.push} onPlayTrack={handlePlayTrack} />
            </>
          );
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
        return (
          <LibraryView
            title={libraryTitle}
            tracks={libraryTracks}
            onNavigate={nav.push}
            onPlayTrack={handlePlayTrack}
            onAddToQueue={handleAddToQueue}
          />
        );
      default:
        return null;
    }
  };

  return (
    <TooltipProvider delay={0}>
      <div className="flex h-full flex-col">
        <div className="flex min-h-0 flex-1">
          <SidePanel
            activeView={activeTab}
            onViewChange={handleViewChange}
            selectedPlaylistId={selectedPlaylistId}
            onSelectPlaylist={handleSelectPlaylist}
            onBack={nav.pop}
            onForward={nav.forward}
            canGoBack={nav.canGoBack}
            canGoForward={nav.canGoForward}
            onSearch={() => nav.push({ type: "search" })}
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
