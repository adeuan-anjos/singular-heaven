import { useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MusicTabs } from "./components/layout/music-tabs";
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
import { usePlayer } from "./hooks/use-player";
import { useQueue } from "./hooks/use-queue";
import type { Track } from "./types/music";

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
  const [activeTab, setActiveTab] = useState("home");
  const [queueOpen, setQueueOpen] = useState(false);
  const nav = useNavigation();
  const player = usePlayer();
  const queue = useQueue();

  const handlePlayTrack = (track: Track) => {
    player.play(track);
    queue.setTracks([track], 0);
  };

  const handlePlayAll = (tracks: Track[]) => {
    if (tracks.length === 0) return;
    player.play(tracks[0]);
    queue.setTracks(tracks, 0);
  };

  const handleAddToQueue = (track: Track) => {
    queue.addNext(track);
  };

  const handleNext = () => {
    const nextTrack = queue.next();
    if (nextTrack) player.play(nextTrack);
  };

  const handlePrevious = () => {
    if (player.progress > 3) {
      player.seek(0);
      return;
    }
    const prevTrack = queue.previous();
    if (prevTrack) player.play(prevTrack);
  };

  const handleQueuePlayIndex = (index: number) => {
    const track = queue.queue[index];
    if (track) {
      queue.setTracks(queue.queue, index);
      player.play(track);
    }
  };

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
          return <SearchView onNavigate={nav.push} onPlayTrack={handlePlayTrack} />;
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
        return (
          <LibraryView
            onNavigate={nav.push}
            onPlayTrack={handlePlayTrack}
            onAddToQueue={handleAddToQueue}
          />
        );
      default:
        return null;
    }
  };

  const handleTabChange = (tab: string) => {
    nav.clear();
    setActiveTab(tab);
  };

  return (
    <TooltipProvider delay={0}>
      <div className="flex h-full flex-col">
        {nav.currentPage ? (
          <MusicHeader title={getPageTitle(nav.currentPage)} onBack={nav.pop} />
        ) : (
          <MusicTabs
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onSearchClick={() => nav.push({ type: "search" })}
          />
        )}

        <div className="flex-1 overflow-hidden">{renderContent()}</div>

        <PlayerBar
          track={player.currentTrack}
          isPlaying={player.isPlaying}
          progress={player.progress}
          volume={player.volume}
          shuffleOn={player.shuffle}
          repeat={player.repeat}
          onTogglePlay={player.togglePlay}
          onNext={handleNext}
          onPrevious={handlePrevious}
          onSeek={player.seek}
          onVolumeChange={player.setVolume}
          onToggleShuffle={player.toggleShuffle}
          onCycleRepeat={player.cycleRepeat}
          onOpenQueue={() => setQueueOpen(true)}
          onGoToArtist={(id) => nav.push({ type: "artist", artistId: id })}
          onGoToAlbum={(id) => nav.push({ type: "album", albumId: id })}
        />

        <QueueSheet
          open={queueOpen}
          onOpenChange={setQueueOpen}
          queue={queue.queue}
          currentIndex={queue.currentIndex}
          onPlayIndex={handleQueuePlayIndex}
          onRemove={queue.removeFromQueue}
        />
      </div>
    </TooltipProvider>
  );
}
