import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { CarouselSection } from "../shared/carousel-section";
import { MediaCard } from "../shared/media-card";
import { ytGetHome } from "../../services/yt-api";
import { mapHomeSections } from "../../services/mappers";
import {
  cacheFiniteTrackCollection,
  createTrackCollectionId,
} from "../../services/track-collections";
import { useYtActions } from "../../router/actions-context";
import { paths } from "../../router/paths";
import type { Track, Album, Artist, Playlist, HomeSection } from "../../types/music";

type NavigateFn = (to: string) => void;

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

function getItemActions(
  item: Track | Album | Artist | Playlist,
  navigate: NavigateFn,
  onPlayTrack: (track: Track) => void,
) {
  if (isTrack(item)) {
    const firstArtistId = item.artists[0]?.id;
    const albumId = item.album?.id;
    return {
      onClick: () => onPlayTrack(item),
      onPlay: () => onPlayTrack(item),
      onGoToArtist: firstArtistId ? () => navigate(paths.artist(firstArtistId)) : undefined,
      onGoToAlbum: albumId ? () => navigate(paths.album(albumId)) : undefined,
    };
  }
  if (isArtist(item)) {
    return {
      onClick: () => navigate(paths.artist(item.browseId)),
      onPlay: () => navigate(paths.artist(item.browseId)),
    };
  }
  if (isPlaylist(item)) {
    const authorId = item.author.id;
    return {
      onClick: () => navigate(paths.playlist(item.playlistId)),
      onPlay: () => navigate(paths.playlist(item.playlistId)),
      onGoToArtist: authorId ? () => navigate(paths.artist(authorId)) : undefined,
    };
  }
  if (isAlbum(item)) {
    const firstArtistId = item.artists?.[0]?.id;
    return {
      onClick: () => navigate(paths.album(item.browseId)),
      onPlay: () => navigate(paths.album(item.browseId)),
      onGoToArtist: firstArtistId ? () => navigate(paths.artist(firstArtistId)) : undefined,
    };
  }
  return {};
}

export function HomeView() {
  const [, navigate] = useLocation();
  const { onPlayTrack } = useYtActions();
  const [sections, setSections] = useState<HomeSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchHome() {
      setLoading(true);
      setError(null);
      try {
        const apiSections = await ytGetHome(6);
        if (cancelled) return;
        const mapped = mapHomeSections(apiSections);
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
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <CarouselSection key={section.title} title={section.title}>
          {section.contents.map((item, i) => {
            const props = getItemProps(item);
            const actions = getItemActions(item, navigate, onPlayTrack);
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
  );
}
