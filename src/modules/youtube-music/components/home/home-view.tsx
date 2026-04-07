import { ScrollArea } from "@/components/ui/scroll-area";
import { CarouselSection } from "../shared/carousel-section";
import { MediaCard } from "../shared/media-card";
import { mockHomeSections } from "../../mock/data";
import type { Track, Album, Artist, Playlist, StackPage } from "../../types/music";
import { useRenderTracker } from "@/lib/debug";

interface HomeViewProps {
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
}

function isTrack(item: Track | Album | Artist | Playlist): item is Track {
  return "videoId" in item;
}

function isArtist(item: Track | Album | Artist | Playlist): item is Artist {
  return "browseId" in item && "name" in item && !("title" in item);
}

function isPlaylist(item: Track | Album | Artist | Playlist): item is Playlist {
  return "playlistId" in item;
}

function isAlbum(item: Track | Album | Artist | Playlist): item is Album {
  return "browseId" in item && "title" in item;
}

function getItemProps(item: Track | Album | Artist | Playlist) {
  if (isTrack(item)) {
    return { title: item.title, subtitle: `Música • ${item.artists.map((a) => a.name).join(", ")}`, thumbnails: item.thumbnails };
  }
  if (isArtist(item)) {
    return { title: item.name, subtitle: "Artista", thumbnails: item.thumbnails };
  }
  if (isPlaylist(item)) {
    return { title: item.title, subtitle: `Playlist • ${item.author.name}`, thumbnails: item.thumbnails };
  }
  if (isAlbum(item)) {
    return { title: item.title, subtitle: `Álbum • ${item.artists?.map((a) => a.name).join(", ") ?? ""}`, thumbnails: item.thumbnails };
  }
  return { title: "", subtitle: "", thumbnails: [] };
}

function getItemActions(item: Track | Album | Artist | Playlist, onNavigate: (page: StackPage) => void, onPlayTrack: (track: Track) => void) {
  if (isTrack(item)) {
    return { onClick: () => onPlayTrack(item), onPlay: () => onPlayTrack(item) };
  }
  if (isArtist(item)) {
    return { onClick: () => onNavigate({ type: "artist", artistId: item.browseId }) };
  }
  if (isPlaylist(item)) {
    return { onClick: () => onNavigate({ type: "playlist", playlistId: item.playlistId }), onPlay: () => onNavigate({ type: "playlist", playlistId: item.playlistId }) };
  }
  if (isAlbum(item)) {
    return { onClick: () => onNavigate({ type: "album", albumId: item.browseId }), onPlay: () => onNavigate({ type: "album", albumId: item.browseId }) };
  }
  return {};
}

export function HomeView({ onNavigate, onPlayTrack }: HomeViewProps) {
  useRenderTracker("HomeView", { onNavigate, onPlayTrack });
  const sections = mockHomeSections;

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-4">
        {sections.map((section) => (
          <CarouselSection key={section.title} title={section.title}>
            {section.contents.map((item, i) => {
              const props = getItemProps(item);
              const actions = getItemActions(item, onNavigate, onPlayTrack);
              return (
                <MediaCard
                  key={i}
                  title={props.title}
                  subtitle={props.subtitle}
                  thumbnails={props.thumbnails}
                  onClick={actions.onClick}
                  onPlay={actions.onPlay}
                />
              );
            })}
          </CarouselSection>
        ))}
      </div>
    </ScrollArea>
  );
}
