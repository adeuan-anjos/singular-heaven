import { ScrollArea } from "@/components/ui/scroll-area";
import { CarouselSection } from "../shared/carousel-section";
import { MediaCard } from "../shared/media-card";
import { mockHomeSections, getMockArtist } from "../../mock/data";
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
    return {
      title: item.title,
      typeLabel: "Música",
      artistName: item.artists.map((a) => a.name).join(", "),
      albumName: item.album?.name,
      thumbnails: item.thumbnails,
    };
  }
  if (isArtist(item)) {
    return { title: item.name, typeLabel: "Artista", thumbnails: item.thumbnails };
  }
  if (isPlaylist(item)) {
    return {
      title: item.title,
      typeLabel: "Playlist",
      artistName: item.author.name,
      thumbnails: item.thumbnails,
    };
  }
  if (isAlbum(item)) {
    return {
      title: item.title,
      typeLabel: "Álbum",
      artistName: item.artists?.map((a) => a.name).join(", "),
      thumbnails: item.thumbnails,
    };
  }
  return { title: "", thumbnails: [] };
}

function getItemActions(item: Track | Album | Artist | Playlist, onNavigate: (page: StackPage) => void, onPlayTrack: (track: Track) => void) {
  if (isTrack(item)) {
    const firstArtistId = item.artists[0]?.id;
    const albumId = item.album?.id;
    return {
      onClick: () => onPlayTrack(item),
      onPlay: () => onPlayTrack(item),
      onGoToArtist: firstArtistId ? () => onNavigate({ type: "artist", artistId: firstArtistId }) : undefined,
      onGoToAlbum: albumId ? () => onNavigate({ type: "album", albumId }) : undefined,
    };
  }
  if (isArtist(item)) {
    const artistData = getMockArtist(item.browseId);
    const firstTrack = artistData.topSongs?.[0];
    return {
      onClick: () => onNavigate({ type: "artist", artistId: item.browseId }),
      onPlay: firstTrack ? () => onPlayTrack(firstTrack) : undefined,
    };
  }
  if (isPlaylist(item)) {
    const authorId = item.author.id;
    return {
      onClick: () => onNavigate({ type: "playlist", playlistId: item.playlistId }),
      onPlay: () => onNavigate({ type: "playlist", playlistId: item.playlistId }),
      onGoToArtist: authorId ? () => onNavigate({ type: "artist", artistId: authorId }) : undefined,
    };
  }
  if (isAlbum(item)) {
    const firstArtistId = item.artists?.[0]?.id;
    return {
      onClick: () => onNavigate({ type: "album", albumId: item.browseId }),
      onPlay: () => onNavigate({ type: "album", albumId: item.browseId }),
      onGoToArtist: firstArtistId ? () => onNavigate({ type: "artist", artistId: firstArtistId }) : undefined,
    };
  }
  return {};
}

export function HomeView({ onNavigate, onPlayTrack }: HomeViewProps) {
  useRenderTracker("HomeView", { onNavigate, onPlayTrack });
  const sections = mockHomeSections;

  return (
    <ScrollArea className="group/page h-full">
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
                  typeLabel={props.typeLabel}
                  artistName={props.artistName}
                  albumName={props.albumName}
                  thumbnails={props.thumbnails}
                  onClick={actions.onClick}
                  onPlay={actions.onPlay}
                  onGoToArtist={actions.onGoToArtist}
                  onGoToAlbum={actions.onGoToAlbum}
                />
              );
            })}
          </CarouselSection>
        ))}
      </div>
    </ScrollArea>
  );
}
