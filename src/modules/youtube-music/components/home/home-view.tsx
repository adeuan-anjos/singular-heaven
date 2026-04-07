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
    return { title: item.title, subtitle: item.artists.map((a) => a.name).join(", "), thumbnails: item.thumbnails, rounded: "md" as const };
  }
  if (isArtist(item)) {
    return { title: item.name, subtitle: item.subscribers, thumbnails: item.thumbnails, rounded: "full" as const };
  }
  if (isPlaylist(item)) {
    return { title: item.title, subtitle: item.author.name, thumbnails: item.thumbnails, rounded: "md" as const };
  }
  if (isAlbum(item)) {
    return { title: item.title, subtitle: item.artists?.map((a) => a.name).join(", "), thumbnails: item.thumbnails, rounded: "md" as const };
  }
  return { title: "", subtitle: "", thumbnails: [], rounded: "md" as const };
}

function getItemAction(item: Track | Album | Artist | Playlist, onNavigate: (page: StackPage) => void, onPlayTrack: (track: Track) => void) {
  if (isTrack(item)) return () => onPlayTrack(item);
  if (isArtist(item)) return () => onNavigate({ type: "artist", artistId: item.browseId });
  if (isPlaylist(item)) return () => onNavigate({ type: "playlist", playlistId: item.playlistId });
  if (isAlbum(item)) return () => onNavigate({ type: "album", albumId: item.browseId });
  return undefined;
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
              const action = getItemAction(item, onNavigate, onPlayTrack);
              return (
                <MediaCard
                  key={i}
                  title={props.title}
                  subtitle={props.subtitle}
                  thumbnails={props.thumbnails}
                  rounded={props.rounded}
                  onClick={action}
                />
              );
            })}
          </CarouselSection>
        ))}
      </div>
    </ScrollArea>
  );
}
