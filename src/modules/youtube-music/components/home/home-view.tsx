import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CarouselSection } from "../shared/carousel-section";
import { MediaCard } from "../shared/media-card";
import { ytGetHome } from "../../services/yt-api";
import { mapHomeSections } from "../../services/mappers";
import {
  cacheFiniteTrackCollection,
  createTrackCollectionId,
} from "../../services/track-collections";
import type { Track, Album, Artist, Playlist, HomeSection, StackPage } from "../../types/music";
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
    return {
      onClick: () => onNavigate({ type: "artist", artistId: item.browseId }),
      onPlay: () => onNavigate({ type: "artist", artistId: item.browseId }),
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
  const [sections, setSections] = useState<HomeSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchHome() {
      console.log("[HomeView] Fetching home sections...");
      setLoading(true);
      setError(null);
      try {
        const apiSections = await ytGetHome(6);
        if (cancelled) return;
        const mapped = mapHomeSections(apiSections);
        console.log("[HomeView] Loaded home sections:", mapped.length);
        mapped.forEach((section, index) => {
          const tracks = section.contents.filter(isTrack);
          if (tracks.length === 0) return;
          void cacheFiniteTrackCollection({
            collectionType: "home-section",
            collectionId: createTrackCollectionId("home", index, section.title),
            title: section.title,
            subtitle: "Home",
            thumbnailUrl: tracks[0]?.thumbnails?.[0]?.url ?? null,
            isComplete: true,
            tracks,
          }).catch((error) => {
            console.error("[HomeView] failed to cache section collection", error);
          });
        });
        setSections(mapped);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[HomeView] Failed to load home:", msg);
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchHome();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-sm">Erro ao carregar a página inicial</p>
        <p className="text-xs">{error}</p>
      </div>
    );
  }

  return (
    <ScrollArea className="group/page h-full">
      <div className="mx-auto max-w-screen-xl space-y-6 p-4">
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
