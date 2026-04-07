# YouTube Music Module UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a UI completa do módulo YouTube Music com componentes shadcn/ui e ReUI, dados mockados, navegação stack, player bar, e fila de reprodução.

**Architecture:** Módulo isolado em `src/modules/youtube-music/` com lazy loading. Navegação interna via stack state. Player state via hook dedicado. Todas as telas usam componentes shadcn sem customização. Dados mockados espelham retornos reais da ytmusicapi.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, shadcn/ui (base-nova), ReUI, Lucide React

---

## File Map

```
src/modules/youtube-music/
├── index.tsx                          # Entry point — compõe layout + tabs + player + stack
├── types/
│   └── music.ts                       # Tipos que espelham ytmusicapi
├── mock/
│   └── data.ts                        # Dados mockados para todas as telas
├── hooks/
│   ├── use-player.ts                  # Estado do player (track, playing, progress, volume, shuffle, repeat)
│   ├── use-queue.ts                   # Estado da fila (tracks, add, remove, reorder, next, prev)
│   └── use-navigation.ts             # Stack de navegação interna do módulo
├── components/
│   ├── layout/
│   │   ├── music-tabs.tsx             # Tabs header (Início/Explorar/Biblioteca) + botão busca
│   │   ├── music-header.tsx           # Header de página empilhada (← Voltar + título)
│   │   └── player-bar.tsx             # Player bar fixa no bottom
│   ├── shared/
│   │   ├── media-card.tsx             # Card reutilizável (capa + nome + subtítulo)
│   │   ├── carousel-section.tsx       # Seção com título + scroll horizontal de cards
│   │   ├── track-row.tsx              # Row de track (capa + nome + artista + duração + menu)
│   │   ├── track-context-menu.tsx     # Context menu wrapper para tracks
│   │   └── section-header.tsx         # Título de seção + link "Ver tudo"
│   ├── home/
│   │   └── home-view.tsx              # Tab Início — carrosséis via get_home()
│   ├── explore/
│   │   ├── explore-view.tsx           # Tab Explorar — carrosséis + moods
│   │   └── mood-grid.tsx              # Grid de badges de moods/genres
│   ├── library/
│   │   └── library-view.tsx           # Tab Biblioteca — curtidas, playlists, artistas, álbuns
│   ├── search/
│   │   └── search-view.tsx            # Página de busca com Command palette
│   ├── pages/
│   │   ├── artist-page.tsx            # Página de artista
│   │   ├── album-page.tsx             # Página de álbum
│   │   └── playlist-page.tsx          # Página de playlist
│   └── queue/
│       └── queue-sheet.tsx            # Sheet lateral da fila de reprodução
```

---

## Task 1: Instalar componentes shadcn necessários

**Files:**
- Modify: `package.json` (novas deps)
- Create: `src/components/ui/*.tsx` (componentes shadcn)

- [ ] **Step 1: Instalar todos os componentes shadcn de uma vez**

```bash
cd ./singular-haven
npx shadcn@latest add tabs slider scroll-area card avatar skeleton command context-menu dropdown-menu sheet toggle dialog badge sonner
```

- [ ] **Step 2: Verificar instalação**

```bash
ls src/components/ui/
```

Expected: Todos os componentes listados devem existir como arquivos `.tsx`.

- [ ] **Step 3: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: Zero erros.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(youtube-music): install shadcn components for music module"
```

---

## Task 2: Tipos e dados mockados

**Files:**
- Create: `src/modules/youtube-music/types/music.ts`
- Create: `src/modules/youtube-music/mock/data.ts`

- [ ] **Step 1: Criar diretórios**

```bash
mkdir -p src/modules/youtube-music/types src/modules/youtube-music/mock src/modules/youtube-music/hooks src/modules/youtube-music/components/layout src/modules/youtube-music/components/shared src/modules/youtube-music/components/home src/modules/youtube-music/components/explore src/modules/youtube-music/components/library src/modules/youtube-music/components/search src/modules/youtube-music/components/pages src/modules/youtube-music/components/queue
```

- [ ] **Step 2: Criar src/modules/youtube-music/types/music.ts**

```ts
export interface Thumbnail {
  url: string;
  width: number;
  height: number;
}

export interface ArtistBasic {
  id: string | null;
  name: string;
}

export interface Track {
  videoId: string;
  title: string;
  artists: ArtistBasic[];
  album: { id: string; name: string } | null;
  duration: string;
  durationSeconds: number;
  thumbnails: Thumbnail[];
  likeStatus?: "LIKE" | "DISLIKE" | "INDIFFERENT";
}

export interface Album {
  browseId: string;
  title: string;
  artists: ArtistBasic[];
  year?: string;
  thumbnails: Thumbnail[];
  tracks?: Track[];
}

export interface Artist {
  browseId: string;
  name: string;
  thumbnails: Thumbnail[];
  subscribers?: string;
  topSongs?: Track[];
  albums?: Album[];
  singles?: Album[];
  similarArtists?: Artist[];
}

export interface Playlist {
  playlistId: string;
  title: string;
  author: ArtistBasic;
  trackCount?: number;
  thumbnails: Thumbnail[];
  tracks?: Track[];
}

export interface HomeSection {
  title: string;
  contents: (Album | Playlist | Track | Artist)[];
}

export interface ExploreData {
  newReleases: Album[];
  trending: Track[];
  newVideos: Track[];
  moodsAndGenres: MoodCategory[];
}

export interface MoodCategory {
  title: string;
  params: string;
}

export interface SearchResults {
  songs: Track[];
  artists: Artist[];
  albums: Album[];
  playlists: Playlist[];
}

export type StackPage =
  | { type: "artist"; artistId: string }
  | { type: "album"; albumId: string }
  | { type: "playlist"; playlistId: string }
  | { type: "search" }
  | { type: "mood"; params: string; title: string };

export type RepeatMode = "off" | "all" | "one";
```

- [ ] **Step 3: Criar src/modules/youtube-music/mock/data.ts**

```ts
import type {
  Track,
  Album,
  Artist,
  Playlist,
  HomeSection,
  ExploreData,
  SearchResults,
  MoodCategory,
} from "../types/music";

const PLACEHOLDER_IMG = "https://placehold.co/160x160/1a1a2e/ffffff?text=♪";
const PLACEHOLDER_ARTIST_IMG = "https://placehold.co/160x160/1a1a2e/ffffff?text=🎤";

function thumb(url = PLACEHOLDER_IMG): { url: string; width: number; height: number }[] {
  return [{ url, width: 160, height: 160 }];
}

export const mockTracks: Track[] = [
  { videoId: "t1", title: "Blinding Lights", artists: [{ id: "a1", name: "The Weeknd" }], album: { id: "al1", name: "After Hours" }, duration: "3:20", durationSeconds: 200, thumbnails: thumb() },
  { videoId: "t2", title: "Levitating", artists: [{ id: "a2", name: "Dua Lipa" }], album: { id: "al2", name: "Future Nostalgia" }, duration: "3:23", durationSeconds: 203, thumbnails: thumb() },
  { videoId: "t3", title: "Watermelon Sugar", artists: [{ id: "a3", name: "Harry Styles" }], album: { id: "al3", name: "Fine Line" }, duration: "2:54", durationSeconds: 174, thumbnails: thumb() },
  { videoId: "t4", title: "Stay", artists: [{ id: "a4", name: "The Kid LAROI" }, { id: "a5", name: "Justin Bieber" }], album: null, duration: "2:21", durationSeconds: 141, thumbnails: thumb() },
  { videoId: "t5", title: "Peaches", artists: [{ id: "a5", name: "Justin Bieber" }], album: { id: "al4", name: "Justice" }, duration: "3:18", durationSeconds: 198, thumbnails: thumb() },
  { videoId: "t6", title: "Montero", artists: [{ id: "a6", name: "Lil Nas X" }], album: { id: "al5", name: "Montero" }, duration: "2:17", durationSeconds: 137, thumbnails: thumb() },
  { videoId: "t7", title: "Kiss Me More", artists: [{ id: "a7", name: "Doja Cat" }], album: { id: "al6", name: "Planet Her" }, duration: "3:28", durationSeconds: 208, thumbnails: thumb() },
  { videoId: "t8", title: "Save Your Tears", artists: [{ id: "a1", name: "The Weeknd" }], album: { id: "al1", name: "After Hours" }, duration: "3:35", durationSeconds: 215, thumbnails: thumb() },
  { videoId: "t9", title: "Good 4 U", artists: [{ id: "a8", name: "Olivia Rodrigo" }], album: { id: "al7", name: "SOUR" }, duration: "2:58", durationSeconds: 178, thumbnails: thumb() },
  { videoId: "t10", title: "Happier Than Ever", artists: [{ id: "a9", name: "Billie Eilish" }], album: { id: "al8", name: "Happier Than Ever" }, duration: "4:58", durationSeconds: 298, thumbnails: thumb() },
];

export const mockAlbums: Album[] = [
  { browseId: "al1", title: "After Hours", artists: [{ id: "a1", name: "The Weeknd" }], year: "2020", thumbnails: thumb(), tracks: mockTracks.filter((t) => t.album?.id === "al1") },
  { browseId: "al2", title: "Future Nostalgia", artists: [{ id: "a2", name: "Dua Lipa" }], year: "2020", thumbnails: thumb() },
  { browseId: "al3", title: "Fine Line", artists: [{ id: "a3", name: "Harry Styles" }], year: "2019", thumbnails: thumb() },
  { browseId: "al4", title: "Justice", artists: [{ id: "a5", name: "Justin Bieber" }], year: "2021", thumbnails: thumb() },
  { browseId: "al5", title: "Montero", artists: [{ id: "a6", name: "Lil Nas X" }], year: "2021", thumbnails: thumb() },
  { browseId: "al6", title: "Planet Her", artists: [{ id: "a7", name: "Doja Cat" }], year: "2021", thumbnails: thumb() },
  { browseId: "al7", title: "SOUR", artists: [{ id: "a8", name: "Olivia Rodrigo" }], year: "2021", thumbnails: thumb() },
  { browseId: "al8", title: "Happier Than Ever", artists: [{ id: "a9", name: "Billie Eilish" }], year: "2021", thumbnails: thumb() },
];

export const mockArtists: Artist[] = [
  { browseId: "a1", name: "The Weeknd", thumbnails: thumb(PLACEHOLDER_ARTIST_IMG), subscribers: "35M", topSongs: mockTracks.filter((t) => t.artists[0].id === "a1"), albums: mockAlbums.filter((a) => a.artists[0].id === "a1"), singles: [], similarArtists: [] },
  { browseId: "a2", name: "Dua Lipa", thumbnails: thumb(PLACEHOLDER_ARTIST_IMG), subscribers: "28M" },
  { browseId: "a3", name: "Harry Styles", thumbnails: thumb(PLACEHOLDER_ARTIST_IMG), subscribers: "22M" },
  { browseId: "a5", name: "Justin Bieber", thumbnails: thumb(PLACEHOLDER_ARTIST_IMG), subscribers: "70M" },
  { browseId: "a7", name: "Doja Cat", thumbnails: thumb(PLACEHOLDER_ARTIST_IMG), subscribers: "18M" },
  { browseId: "a8", name: "Olivia Rodrigo", thumbnails: thumb(PLACEHOLDER_ARTIST_IMG), subscribers: "15M" },
  { browseId: "a9", name: "Billie Eilish", thumbnails: thumb(PLACEHOLDER_ARTIST_IMG), subscribers: "45M" },
];

export const mockPlaylists: Playlist[] = [
  { playlistId: "p1", title: "Meu Mix 1", author: { id: null, name: "YouTube Music" }, trackCount: 25, thumbnails: thumb(), tracks: mockTracks.slice(0, 5) },
  { playlistId: "p2", title: "Descobertas da Semana", author: { id: null, name: "YouTube Music" }, trackCount: 30, thumbnails: thumb(), tracks: mockTracks.slice(3, 8) },
  { playlistId: "p3", title: "Pop Internacional", author: { id: null, name: "YouTube Music" }, trackCount: 50, thumbnails: thumb() },
  { playlistId: "p4", title: "Relax & Chill", author: { id: null, name: "YouTube Music" }, trackCount: 40, thumbnails: thumb() },
  { playlistId: "p5", title: "Workout Hits", author: { id: null, name: "YouTube Music" }, trackCount: 35, thumbnails: thumb() },
];

export const mockHomeSections: HomeSection[] = [
  { title: "Ouvir novamente", contents: mockTracks.slice(0, 6) },
  { title: "Mixes para você", contents: mockPlaylists.slice(0, 4) },
  { title: "Recomendados", contents: mockAlbums.slice(0, 6) },
  { title: "Artistas que você segue", contents: mockArtists.slice(0, 5) },
];

export const mockMoodCategories: MoodCategory[] = [
  { title: "Pop", params: "pop" },
  { title: "Rock", params: "rock" },
  { title: "Hip-Hop", params: "hiphop" },
  { title: "R&B", params: "rnb" },
  { title: "Eletrônica", params: "electronic" },
  { title: "Jazz", params: "jazz" },
  { title: "Clássica", params: "classical" },
  { title: "Sertanejo", params: "sertanejo" },
  { title: "Funk", params: "funk" },
  { title: "MPB", params: "mpb" },
];

export const mockExploreData: ExploreData = {
  newReleases: mockAlbums.slice(0, 6),
  trending: mockTracks.slice(0, 6),
  newVideos: mockTracks.slice(4, 8),
  moodsAndGenres: mockMoodCategories,
};

export const mockSearchResults: SearchResults = {
  songs: mockTracks.slice(0, 5),
  artists: mockArtists.slice(0, 3),
  albums: mockAlbums.slice(0, 3),
  playlists: mockPlaylists.slice(0, 2),
};

export function getMockArtist(artistId: string): Artist {
  const artist = mockArtists.find((a) => a.browseId === artistId);
  if (!artist) return { ...mockArtists[0], browseId: artistId };
  return {
    ...artist,
    topSongs: mockTracks.filter((t) => t.artists.some((a) => a.id === artistId)).concat(mockTracks.slice(0, 3)),
    albums: mockAlbums.filter((a) => a.artists.some((ar) => ar.id === artistId)).concat(mockAlbums.slice(0, 2)),
    singles: mockAlbums.slice(2, 4),
    similarArtists: mockArtists.filter((a) => a.browseId !== artistId).slice(0, 4),
  };
}

export function getMockAlbum(albumId: string): Album {
  const album = mockAlbums.find((a) => a.browseId === albumId);
  if (!album) return { ...mockAlbums[0], browseId: albumId, tracks: mockTracks.slice(0, 8) };
  return { ...album, tracks: mockTracks.slice(0, 8) };
}

export function getMockPlaylist(playlistId: string): Playlist {
  const playlist = mockPlaylists.find((p) => p.playlistId === playlistId);
  if (!playlist) return { ...mockPlaylists[0], playlistId, tracks: mockTracks };
  return { ...playlist, tracks: mockTracks };
}
```

- [ ] **Step 4: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: Zero erros.

- [ ] **Step 5: Commit**

```bash
git add src/modules/youtube-music/types/ src/modules/youtube-music/mock/
git commit -m "feat(youtube-music): add types and mock data"
```

---

## Task 3: Hooks (navigation, player, queue)

**Files:**
- Create: `src/modules/youtube-music/hooks/use-navigation.ts`
- Create: `src/modules/youtube-music/hooks/use-player.ts`
- Create: `src/modules/youtube-music/hooks/use-queue.ts`

- [ ] **Step 1: Criar src/modules/youtube-music/hooks/use-navigation.ts**

```ts
import { useState, useCallback } from "react";
import type { StackPage } from "../types/music";

export function useNavigation() {
  const [stack, setStack] = useState<StackPage[]>([]);

  const push = useCallback((page: StackPage) => {
    setStack((prev) => [...prev, page]);
  }, []);

  const pop = useCallback(() => {
    setStack((prev) => prev.slice(0, -1));
  }, []);

  const clear = useCallback(() => {
    setStack([]);
  }, []);

  const currentPage = stack.length > 0 ? stack[stack.length - 1] : null;

  return { stack, currentPage, push, pop, clear } as const;
}
```

- [ ] **Step 2: Criar src/modules/youtube-music/hooks/use-player.ts**

```ts
import { useState, useCallback, useRef, useEffect } from "react";
import type { Track, RepeatMode } from "../types/music";

export function usePlayer() {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(80);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const play = useCallback((track: Track) => {
    setCurrentTrack(track);
    setIsPlaying(true);
    setProgress(0);
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const seek = useCallback((value: number) => {
    setProgress(value);
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle((prev) => !prev);
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((prev) => {
      if (prev === "off") return "all";
      if (prev === "all") return "one";
      return "off";
    });
  }, []);

  useEffect(() => {
    if (isPlaying && currentTrack) {
      intervalRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= currentTrack.durationSeconds) {
            setIsPlaying(false);
            return currentTrack.durationSeconds;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, currentTrack]);

  return {
    currentTrack,
    isPlaying,
    progress,
    volume,
    shuffle,
    repeat,
    play,
    togglePlay,
    seek,
    setVolume,
    toggleShuffle,
    cycleRepeat,
  } as const;
}
```

- [ ] **Step 3: Criar src/modules/youtube-music/hooks/use-queue.ts**

```ts
import { useState, useCallback } from "react";
import type { Track } from "../types/music";

export function useQueue() {
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const setTracks = useCallback((tracks: Track[], startIndex = 0) => {
    setQueue(tracks);
    setCurrentIndex(startIndex);
  }, []);

  const addToQueue = useCallback((track: Track) => {
    setQueue((prev) => [...prev, track]);
  }, []);

  const addNext = useCallback((track: Track) => {
    setQueue((prev) => {
      const next = [...prev];
      next.splice(currentIndex + 1, 0, track);
      return next;
    });
  }, [currentIndex]);

  const removeFromQueue = useCallback((index: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== index));
    setCurrentIndex((prev) => {
      if (index < prev) return prev - 1;
      return prev;
    });
  }, []);

  const next = useCallback((): Track | null => {
    if (currentIndex < queue.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      return queue[nextIndex];
    }
    return null;
  }, [currentIndex, queue]);

  const previous = useCallback((): Track | null => {
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1;
      setCurrentIndex(prevIndex);
      return queue[prevIndex];
    }
    return null;
  }, [currentIndex, queue]);

  const currentTrack = currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;

  return {
    queue,
    currentIndex,
    currentTrack,
    setTracks,
    addToQueue,
    addNext,
    removeFromQueue,
    next,
    previous,
  } as const;
}
```

- [ ] **Step 4: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: Zero erros.

- [ ] **Step 5: Commit**

```bash
git add src/modules/youtube-music/hooks/
git commit -m "feat(youtube-music): add navigation, player, and queue hooks"
```

---

## Task 4: Componentes compartilhados (shared)

**Files:**
- Create: `src/modules/youtube-music/components/shared/media-card.tsx`
- Create: `src/modules/youtube-music/components/shared/carousel-section.tsx`
- Create: `src/modules/youtube-music/components/shared/track-row.tsx`
- Create: `src/modules/youtube-music/components/shared/track-context-menu.tsx`
- Create: `src/modules/youtube-music/components/shared/section-header.tsx`

- [ ] **Step 1: Criar src/modules/youtube-music/components/shared/media-card.tsx**

```tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Thumbnail } from "../../types/music";

interface MediaCardProps {
  title: string;
  subtitle?: string;
  thumbnails: Thumbnail[];
  rounded?: "full" | "md";
  onClick?: () => void;
}

export function MediaCard({ title, subtitle, thumbnails, rounded = "md", onClick }: MediaCardProps) {
  const imgUrl = thumbnails[0]?.url ?? "";

  return (
    <button
      type="button"
      className="flex w-40 flex-shrink-0 flex-col gap-2 rounded-md p-2 text-left hover:bg-accent"
      onClick={onClick}
    >
      <Avatar className={`h-36 w-36 ${rounded === "full" ? "rounded-full" : "rounded-md"}`}>
        <AvatarImage src={imgUrl} alt={title} className="object-cover" />
        <AvatarFallback className={rounded === "full" ? "rounded-full" : "rounded-md"}>
          {title.charAt(0)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Criar src/modules/youtube-music/components/shared/carousel-section.tsx**

```tsx
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { SectionHeader } from "./section-header";

interface CarouselSectionProps {
  title: string;
  onSeeAll?: () => void;
  children: React.ReactNode;
}

export function CarouselSection({ title, onSeeAll, children }: CarouselSectionProps) {
  return (
    <div className="space-y-3">
      <SectionHeader title={title} onSeeAll={onSeeAll} />
      <ScrollArea className="w-full">
        <div className="flex gap-2 pb-4">
          {children}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
```

- [ ] **Step 3: Criar src/modules/youtube-music/components/shared/section-header.tsx**

```tsx
import { Button } from "@/components/ui/button";

interface SectionHeaderProps {
  title: string;
  onSeeAll?: () => void;
}

export function SectionHeader({ title, onSeeAll }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between px-2">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {onSeeAll && (
        <Button variant="ghost" size="sm" onClick={onSeeAll}>
          Ver tudo
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Criar src/modules/youtube-music/components/shared/track-row.tsx**

```tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Ellipsis from "lucide-react/icons/ellipsis";
import Play from "lucide-react/icons/play";
import ListPlus from "lucide-react/icons/list-plus";
import User from "lucide-react/icons/user";
import Disc3 from "lucide-react/icons/disc-3";
import type { Track } from "../../types/music";

interface TrackRowProps {
  track: Track;
  index?: number;
  onPlay?: (track: Track) => void;
  onAddToQueue?: (track: Track) => void;
  onGoToArtist?: (artistId: string) => void;
  onGoToAlbum?: (albumId: string) => void;
}

export function TrackRow({ track, index, onPlay, onAddToQueue, onGoToArtist, onGoToAlbum }: TrackRowProps) {
  const imgUrl = track.thumbnails[0]?.url ?? "";
  const artistName = track.artists.map((a) => a.name).join(", ");

  return (
    <div
      className="group flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
      onDoubleClick={() => onPlay?.(track)}
    >
      {index !== undefined && (
        <span className="w-6 text-center text-sm text-muted-foreground">{index + 1}</span>
      )}
      <Avatar className="h-10 w-10 rounded-sm">
        <AvatarImage src={imgUrl} alt={track.title} className="object-cover" />
        <AvatarFallback className="rounded-sm">{track.title.charAt(0)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{track.title}</p>
        <p className="truncate text-xs text-muted-foreground">{artistName}</p>
      </div>
      <span className="text-xs text-muted-foreground">{track.duration}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
            <Ellipsis className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onPlay?.(track)}>
            <Play className="mr-2 h-4 w-4" />
            Tocar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddToQueue?.(track)}>
            <ListPlus className="mr-2 h-4 w-4" />
            Tocar em seguida
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {track.artists[0]?.id && (
            <DropdownMenuItem onClick={() => onGoToArtist?.(track.artists[0].id!)}>
              <User className="mr-2 h-4 w-4" />
              Ir para o artista
            </DropdownMenuItem>
          )}
          {track.album && (
            <DropdownMenuItem onClick={() => onGoToAlbum?.(track.album!.id)}>
              <Disc3 className="mr-2 h-4 w-4" />
              Ir para o álbum
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

- [ ] **Step 5: Criar src/modules/youtube-music/components/shared/track-context-menu.tsx**

```tsx
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import Play from "lucide-react/icons/play";
import ListPlus from "lucide-react/icons/list-plus";
import User from "lucide-react/icons/user";
import Disc3 from "lucide-react/icons/disc-3";
import type { Track } from "../../types/music";

interface TrackContextMenuProps {
  track: Track;
  children: React.ReactNode;
  onPlay?: (track: Track) => void;
  onAddToQueue?: (track: Track) => void;
  onGoToArtist?: (artistId: string) => void;
  onGoToAlbum?: (albumId: string) => void;
}

export function TrackContextMenu({
  track,
  children,
  onPlay,
  onAddToQueue,
  onGoToArtist,
  onGoToAlbum,
}: TrackContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onPlay?.(track)}>
          <Play className="mr-2 h-4 w-4" />
          Tocar
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onAddToQueue?.(track)}>
          <ListPlus className="mr-2 h-4 w-4" />
          Tocar em seguida
        </ContextMenuItem>
        <ContextMenuSeparator />
        {track.artists[0]?.id && (
          <ContextMenuItem onClick={() => onGoToArtist?.(track.artists[0].id!)}>
            <User className="mr-2 h-4 w-4" />
            Ir para o artista
          </ContextMenuItem>
        )}
        {track.album && (
          <ContextMenuItem onClick={() => onGoToAlbum?.(track.album!.id)}>
            <Disc3 className="mr-2 h-4 w-4" />
            Ir para o álbum
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
```

- [ ] **Step 6: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: Zero erros.

- [ ] **Step 7: Commit**

```bash
git add src/modules/youtube-music/components/shared/
git commit -m "feat(youtube-music): add shared components (media-card, carousel, track-row, context-menu)"
```

---

## Task 5: Layout — Tabs, Header, Player Bar

**Files:**
- Create: `src/modules/youtube-music/components/layout/music-tabs.tsx`
- Create: `src/modules/youtube-music/components/layout/music-header.tsx`
- Create: `src/modules/youtube-music/components/layout/player-bar.tsx`

- [ ] **Step 1: Criar src/modules/youtube-music/components/layout/music-tabs.tsx**

```tsx
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import Search from "lucide-react/icons/search";

interface MusicTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onSearchClick: () => void;
}

export function MusicTabs({ activeTab, onTabChange, onSearchClick }: MusicTabsProps) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-2">
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="home">Início</TabsTrigger>
          <TabsTrigger value="explore">Explorar</TabsTrigger>
          <TabsTrigger value="library">Biblioteca</TabsTrigger>
        </TabsList>
      </Tabs>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={onSearchClick}>
            <Search className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Buscar</TooltipContent>
      </Tooltip>
    </div>
  );
}
```

- [ ] **Step 2: Criar src/modules/youtube-music/components/layout/music-header.tsx**

```tsx
import { Button } from "@/components/ui/button";
import ArrowLeft from "lucide-react/icons/arrow-left";

interface MusicHeaderProps {
  title: string;
  onBack: () => void;
}

export function MusicHeader({ title, onBack }: MusicHeaderProps) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-2">
      <Button variant="ghost" size="icon" onClick={onBack}>
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <h1 className="truncate text-lg font-semibold text-foreground">{title}</h1>
    </div>
  );
}
```

- [ ] **Step 3: Criar src/modules/youtube-music/components/layout/player-bar.tsx**

```tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import SkipBack from "lucide-react/icons/skip-back";
import SkipForward from "lucide-react/icons/skip-forward";
import PlayIcon from "lucide-react/icons/play";
import Pause from "lucide-react/icons/pause";
import Shuffle from "lucide-react/icons/shuffle";
import Repeat from "lucide-react/icons/repeat";
import Repeat1 from "lucide-react/icons/repeat-1";
import Volume2 from "lucide-react/icons/volume-2";
import ListMusic from "lucide-react/icons/list-music";
import type { Track, RepeatMode } from "../../types/music";

interface PlayerBarProps {
  track: Track | null;
  isPlaying: boolean;
  progress: number;
  volume: number;
  shuffleOn: boolean;
  repeat: RepeatMode;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (value: number) => void;
  onVolumeChange: (value: number) => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onOpenQueue: () => void;
  onGoToArtist?: (artistId: string) => void;
  onGoToAlbum?: (albumId: string) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlayerBar({
  track,
  isPlaying,
  progress,
  volume,
  shuffleOn,
  repeat,
  onTogglePlay,
  onNext,
  onPrevious,
  onSeek,
  onVolumeChange,
  onToggleShuffle,
  onCycleRepeat,
  onOpenQueue,
  onGoToArtist,
  onGoToAlbum,
}: PlayerBarProps) {
  if (!track) return null;

  const imgUrl = track.thumbnails[0]?.url ?? "";
  const artistName = track.artists.map((a) => a.name).join(", ");

  return (
    <div className="flex items-center gap-4 border-t border-border bg-background px-4 py-2">
      <button
        type="button"
        className="flex items-center gap-3 min-w-0 flex-shrink-0"
        onClick={() => track.album && onGoToAlbum?.(track.album.id)}
      >
        <Avatar className="h-12 w-12 rounded-md">
          <AvatarImage src={imgUrl} alt={track.title} className="object-cover" />
          <AvatarFallback className="rounded-md">{track.title.charAt(0)}</AvatarFallback>
        </Avatar>
      </button>

      <div className="min-w-0 w-48 flex-shrink-0">
        <p className="truncate text-sm font-medium text-foreground">{track.title}</p>
        <button
          type="button"
          className="truncate text-xs text-muted-foreground hover:underline"
          onClick={() => track.artists[0]?.id && onGoToArtist?.(track.artists[0].id)}
        >
          {artistName}
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <Toggle size="sm" pressed={shuffleOn} onPressedChange={onToggleShuffle} aria-label="Shuffle">
            <Shuffle className="h-4 w-4" />
          </Toggle>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrevious}>
                <SkipBack className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Anterior</TooltipContent>
          </Tooltip>
          <Button size="icon" className="h-9 w-9" onClick={onTogglePlay}>
            {isPlaying ? <Pause className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNext}>
                <SkipForward className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Próxima</TooltipContent>
          </Tooltip>
          <Toggle
            size="sm"
            pressed={repeat !== "off"}
            onPressedChange={onCycleRepeat}
            aria-label="Repetir"
          >
            {repeat === "one" ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
          </Toggle>
        </div>
        <div className="flex w-full max-w-md items-center gap-2">
          <span className="w-10 text-right text-xs text-muted-foreground">{formatTime(progress)}</span>
          <Slider
            value={[progress]}
            max={track.durationSeconds}
            step={1}
            onValueChange={([v]) => onSeek(v)}
            className="flex-1"
          />
          <span className="w-10 text-xs text-muted-foreground">{track.duration}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Volume2 className="h-4 w-4 text-muted-foreground" />
        <Slider
          value={[volume]}
          max={100}
          step={1}
          onValueChange={([v]) => onVolumeChange(v)}
          className="w-24"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenQueue}>
              <ListMusic className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fila de reprodução</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: Zero erros.

- [ ] **Step 5: Commit**

```bash
git add src/modules/youtube-music/components/layout/
git commit -m "feat(youtube-music): add layout components (tabs, header, player-bar)"
```

---

## Task 6: Tab Início (Home) + Tab Explorar

**Files:**
- Create: `src/modules/youtube-music/components/home/home-view.tsx`
- Create: `src/modules/youtube-music/components/explore/explore-view.tsx`
- Create: `src/modules/youtube-music/components/explore/mood-grid.tsx`

- [ ] **Step 1: Criar src/modules/youtube-music/components/home/home-view.tsx**

```tsx
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { CarouselSection } from "../shared/carousel-section";
import { MediaCard } from "../shared/media-card";
import { mockHomeSections } from "../../mock/data";
import type { Track, Album, Artist, Playlist, StackPage } from "../../types/music";

interface HomeViewProps {
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
}

function getItemProps(item: Track | Album | Artist | Playlist) {
  if ("videoId" in item) {
    return { title: item.title, subtitle: item.artists.map((a) => a.name).join(", "), thumbnails: item.thumbnails, rounded: "md" as const };
  }
  if ("browseId" in item && "topSongs" in item) {
    return { title: item.name, subtitle: item.subscribers, thumbnails: item.thumbnails, rounded: "full" as const };
  }
  if ("browseId" in item) {
    return { title: item.title, subtitle: item.artists?.map((a) => a.name).join(", "), thumbnails: item.thumbnails, rounded: "md" as const };
  }
  if ("playlistId" in item) {
    return { title: item.title, subtitle: item.author.name, thumbnails: item.thumbnails, rounded: "md" as const };
  }
  return { title: "", subtitle: "", thumbnails: [], rounded: "md" as const };
}

function getItemAction(item: Track | Album | Artist | Playlist, onNavigate: (page: StackPage) => void, onPlayTrack: (track: Track) => void) {
  if ("videoId" in item) return () => onPlayTrack(item);
  if ("browseId" in item && "topSongs" in item) return () => onNavigate({ type: "artist", artistId: item.browseId });
  if ("browseId" in item) return () => onNavigate({ type: "album", albumId: item.browseId });
  if ("playlistId" in item) return () => onNavigate({ type: "playlist", playlistId: item.playlistId });
  return undefined;
}

export function HomeView({ onNavigate, onPlayTrack }: HomeViewProps) {
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
```

- [ ] **Step 2: Criar src/modules/youtube-music/components/explore/mood-grid.tsx**

```tsx
import { Badge } from "@/components/ui/badge";
import type { MoodCategory, StackPage } from "../../types/music";

interface MoodGridProps {
  categories: MoodCategory[];
  onSelect: (page: StackPage) => void;
}

export function MoodGrid({ categories, onSelect }: MoodGridProps) {
  return (
    <div className="flex flex-wrap gap-2 px-2">
      {categories.map((cat) => (
        <Badge
          key={cat.params}
          variant="outline"
          className="cursor-pointer px-3 py-1.5 text-sm hover:bg-accent"
          onClick={() => onSelect({ type: "mood", params: cat.params, title: cat.title })}
        >
          {cat.title}
        </Badge>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Criar src/modules/youtube-music/components/explore/explore-view.tsx**

```tsx
import { ScrollArea } from "@/components/ui/scroll-area";
import { CarouselSection } from "../shared/carousel-section";
import { MediaCard } from "../shared/media-card";
import { MoodGrid } from "./mood-grid";
import { SectionHeader } from "../shared/section-header";
import { mockExploreData } from "../../mock/data";
import type { Track, StackPage } from "../../types/music";

interface ExploreViewProps {
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
}

export function ExploreView({ onNavigate, onPlayTrack }: ExploreViewProps) {
  const data = mockExploreData;

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-4">
        <CarouselSection title="Novos lançamentos">
          {data.newReleases.map((album) => (
            <MediaCard
              key={album.browseId}
              title={album.title}
              subtitle={album.artists.map((a) => a.name).join(", ")}
              thumbnails={album.thumbnails}
              onClick={() => onNavigate({ type: "album", albumId: album.browseId })}
            />
          ))}
        </CarouselSection>

        <CarouselSection title="Em alta">
          {data.trending.map((track) => (
            <MediaCard
              key={track.videoId}
              title={track.title}
              subtitle={track.artists.map((a) => a.name).join(", ")}
              thumbnails={track.thumbnails}
              onClick={() => onPlayTrack(track)}
            />
          ))}
        </CarouselSection>

        <CarouselSection title="Novos vídeos">
          {data.newVideos.map((track) => (
            <MediaCard
              key={track.videoId}
              title={track.title}
              subtitle={track.artists.map((a) => a.name).join(", ")}
              thumbnails={track.thumbnails}
              onClick={() => onPlayTrack(track)}
            />
          ))}
        </CarouselSection>

        <div className="space-y-3">
          <SectionHeader title="Moods e gêneros" />
          <MoodGrid categories={data.moodsAndGenres} onSelect={onNavigate} />
        </div>
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 4: Verificar tipos**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/youtube-music/components/home/ src/modules/youtube-music/components/explore/
git commit -m "feat(youtube-music): add Home and Explore tab views"
```

---

## Task 7: Tab Biblioteca + Busca

**Files:**
- Create: `src/modules/youtube-music/components/library/library-view.tsx`
- Create: `src/modules/youtube-music/components/search/search-view.tsx`

- [ ] **Step 1: Criar src/modules/youtube-music/components/library/library-view.tsx**

```tsx
import { ScrollArea } from "@/components/ui/scroll-area";
import { CarouselSection } from "../shared/carousel-section";
import { MediaCard } from "../shared/media-card";
import { SectionHeader } from "../shared/section-header";
import { TrackRow } from "../shared/track-row";
import { mockTracks, mockPlaylists, mockArtists, mockAlbums } from "../../mock/data";
import type { Track, StackPage } from "../../types/music";

interface LibraryViewProps {
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
}

export function LibraryView({ onNavigate, onPlayTrack, onAddToQueue }: LibraryViewProps) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-4">
        <div className="space-y-2">
          <SectionHeader title="Curtidas" />
          {mockTracks.slice(0, 5).map((track, i) => (
            <TrackRow
              key={track.videoId}
              track={track}
              index={i}
              onPlay={onPlayTrack}
              onAddToQueue={onAddToQueue}
              onGoToArtist={(id) => onNavigate({ type: "artist", artistId: id })}
              onGoToAlbum={(id) => onNavigate({ type: "album", albumId: id })}
            />
          ))}
        </div>

        <CarouselSection title="Suas playlists">
          {mockPlaylists.map((pl) => (
            <MediaCard
              key={pl.playlistId}
              title={pl.title}
              subtitle={`${pl.trackCount} músicas`}
              thumbnails={pl.thumbnails}
              onClick={() => onNavigate({ type: "playlist", playlistId: pl.playlistId })}
            />
          ))}
        </CarouselSection>

        <CarouselSection title="Artistas que você segue">
          {mockArtists.map((artist) => (
            <MediaCard
              key={artist.browseId}
              title={artist.name}
              subtitle={artist.subscribers}
              thumbnails={artist.thumbnails}
              rounded="full"
              onClick={() => onNavigate({ type: "artist", artistId: artist.browseId })}
            />
          ))}
        </CarouselSection>

        <CarouselSection title="Álbuns salvos">
          {mockAlbums.slice(0, 5).map((album) => (
            <MediaCard
              key={album.browseId}
              title={album.title}
              subtitle={album.artists.map((a) => a.name).join(", ")}
              thumbnails={album.thumbnails}
              onClick={() => onNavigate({ type: "album", albumId: album.browseId })}
            />
          ))}
        </CarouselSection>
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 2: Criar src/modules/youtube-music/components/search/search-view.tsx**

```tsx
import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { mockSearchResults } from "../../mock/data";
import type { Track, StackPage } from "../../types/music";

interface SearchViewProps {
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
}

export function SearchView({ onNavigate, onPlayTrack }: SearchViewProps) {
  const [query, setQuery] = useState("");
  const results = query.length > 0 ? mockSearchResults : null;

  return (
    <div className="flex h-full flex-col">
      <Command className="border-b border-border" shouldFilter={false}>
        <CommandInput
          placeholder="Buscar músicas, artistas, álbuns..."
          value={query}
          onValueChange={setQuery}
        />
        {results && (
          <CommandList className="max-h-none">
            <ScrollArea className="h-[calc(100vh-12rem)]">
              {results.songs.length > 0 && (
                <CommandGroup heading="Músicas">
                  {results.songs.map((track) => (
                    <CommandItem key={track.videoId} onSelect={() => onPlayTrack(track)}>
                      <Avatar className="mr-3 h-8 w-8 rounded-sm">
                        <AvatarImage src={track.thumbnails[0]?.url} className="object-cover" />
                        <AvatarFallback className="rounded-sm">{track.title.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{track.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {track.artists.map((a) => a.name).join(", ")}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">{track.duration}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {results.artists.length > 0 && (
                <CommandGroup heading="Artistas">
                  {results.artists.map((artist) => (
                    <CommandItem
                      key={artist.browseId}
                      onSelect={() => onNavigate({ type: "artist", artistId: artist.browseId })}
                    >
                      <Avatar className="mr-3 h-8 w-8 rounded-full">
                        <AvatarImage src={artist.thumbnails[0]?.url} className="object-cover" />
                        <AvatarFallback>{artist.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <p className="text-sm">{artist.name}</p>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {results.albums.length > 0 && (
                <CommandGroup heading="Álbuns">
                  {results.albums.map((album) => (
                    <CommandItem
                      key={album.browseId}
                      onSelect={() => onNavigate({ type: "album", albumId: album.browseId })}
                    >
                      <Avatar className="mr-3 h-8 w-8 rounded-sm">
                        <AvatarImage src={album.thumbnails[0]?.url} className="object-cover" />
                        <AvatarFallback className="rounded-sm">{album.title.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{album.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {album.artists.map((a) => a.name).join(", ")} {album.year && `• ${album.year}`}
                        </p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {results.playlists.length > 0 && (
                <CommandGroup heading="Playlists">
                  {results.playlists.map((pl) => (
                    <CommandItem
                      key={pl.playlistId}
                      onSelect={() => onNavigate({ type: "playlist", playlistId: pl.playlistId })}
                    >
                      <Avatar className="mr-3 h-8 w-8 rounded-sm">
                        <AvatarImage src={pl.thumbnails[0]?.url} className="object-cover" />
                        <AvatarFallback className="rounded-sm">{pl.title.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{pl.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{pl.author.name}</p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              <CommandEmpty>Nenhum resultado encontrado</CommandEmpty>
            </ScrollArea>
          </CommandList>
        )}
      </Command>
    </div>
  );
}
```

- [ ] **Step 3: Verificar tipos**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/youtube-music/components/library/ src/modules/youtube-music/components/search/
git commit -m "feat(youtube-music): add Library and Search views"
```

---

## Task 8: Páginas empilhadas (Artista, Álbum, Playlist)

**Files:**
- Create: `src/modules/youtube-music/components/pages/artist-page.tsx`
- Create: `src/modules/youtube-music/components/pages/album-page.tsx`
- Create: `src/modules/youtube-music/components/pages/playlist-page.tsx`

- [ ] **Step 1: Criar src/modules/youtube-music/components/pages/artist-page.tsx**

```tsx
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CarouselSection } from "../shared/carousel-section";
import { MediaCard } from "../shared/media-card";
import { TrackRow } from "../shared/track-row";
import { getMockArtist } from "../../mock/data";
import type { Track, StackPage } from "../../types/music";

interface ArtistPageProps {
  artistId: string;
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
}

export function ArtistPage({ artistId, onNavigate, onPlayTrack, onAddToQueue }: ArtistPageProps) {
  const artist = getMockArtist(artistId);
  const imgUrl = artist.thumbnails[0]?.url ?? "";

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-4">
        <div className="flex items-center gap-6">
          <Avatar className="h-32 w-32 rounded-full">
            <AvatarImage src={imgUrl} alt={artist.name} className="object-cover" />
            <AvatarFallback className="text-3xl">{artist.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-3xl font-bold text-foreground">{artist.name}</h1>
            {artist.subscribers && (
              <p className="text-sm text-muted-foreground">{artist.subscribers} inscritos</p>
            )}
            <Button className="mt-3" variant="outline" size="sm">
              Inscrever-se
            </Button>
          </div>
        </div>

        {artist.topSongs && artist.topSongs.length > 0 && (
          <div className="space-y-2">
            <h2 className="px-2 text-lg font-semibold">Top músicas</h2>
            {artist.topSongs.slice(0, 5).map((track, i) => (
              <TrackRow
                key={track.videoId}
                track={track}
                index={i}
                onPlay={onPlayTrack}
                onAddToQueue={onAddToQueue}
                onGoToArtist={(id) => onNavigate({ type: "artist", artistId: id })}
                onGoToAlbum={(id) => onNavigate({ type: "album", albumId: id })}
              />
            ))}
          </div>
        )}

        {artist.albums && artist.albums.length > 0 && (
          <CarouselSection title="Álbuns">
            {artist.albums.map((album) => (
              <MediaCard
                key={album.browseId}
                title={album.title}
                subtitle={album.year}
                thumbnails={album.thumbnails}
                onClick={() => onNavigate({ type: "album", albumId: album.browseId })}
              />
            ))}
          </CarouselSection>
        )}

        {artist.singles && artist.singles.length > 0 && (
          <CarouselSection title="Singles">
            {artist.singles.map((single) => (
              <MediaCard
                key={single.browseId}
                title={single.title}
                subtitle={single.year}
                thumbnails={single.thumbnails}
                onClick={() => onNavigate({ type: "album", albumId: single.browseId })}
              />
            ))}
          </CarouselSection>
        )}

        {artist.similarArtists && artist.similarArtists.length > 0 && (
          <CarouselSection title="Artistas similares">
            {artist.similarArtists.map((a) => (
              <MediaCard
                key={a.browseId}
                title={a.name}
                subtitle={a.subscribers}
                thumbnails={a.thumbnails}
                rounded="full"
                onClick={() => onNavigate({ type: "artist", artistId: a.browseId })}
              />
            ))}
          </CarouselSection>
        )}
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 2: Criar src/modules/youtube-music/components/pages/album-page.tsx**

```tsx
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TrackRow } from "../shared/track-row";
import { TrackContextMenu } from "../shared/track-context-menu";
import { getMockAlbum } from "../../mock/data";
import PlayIcon from "lucide-react/icons/play";
import type { Track, StackPage } from "../../types/music";

interface AlbumPageProps {
  albumId: string;
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onPlayAll: (tracks: Track[]) => void;
}

export function AlbumPage({ albumId, onNavigate, onPlayTrack, onAddToQueue, onPlayAll }: AlbumPageProps) {
  const album = getMockAlbum(albumId);
  const imgUrl = album.thumbnails[0]?.url ?? "";
  const artistName = album.artists.map((a) => a.name).join(", ");

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-4">
        <div className="flex items-start gap-6">
          <Avatar className="h-48 w-48 rounded-md">
            <AvatarImage src={imgUrl} alt={album.title} className="object-cover" />
            <AvatarFallback className="rounded-md text-4xl">{album.title.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">{album.title}</h1>
            <button
              type="button"
              className="text-sm text-muted-foreground hover:underline"
              onClick={() => album.artists[0]?.id && onNavigate({ type: "artist", artistId: album.artists[0].id })}
            >
              {artistName}
            </button>
            {album.year && <p className="text-sm text-muted-foreground">{album.year}</p>}
            {album.tracks && (
              <p className="text-sm text-muted-foreground">{album.tracks.length} músicas</p>
            )}
            <Button
              className="mt-2"
              onClick={() => album.tracks && onPlayAll(album.tracks)}
            >
              <PlayIcon className="mr-2 h-4 w-4" />
              Tocar tudo
            </Button>
          </div>
        </div>

        {album.tracks && (
          <div className="space-y-1">
            {album.tracks.map((track, i) => (
              <TrackContextMenu
                key={track.videoId}
                track={track}
                onPlay={onPlayTrack}
                onAddToQueue={onAddToQueue}
                onGoToArtist={(id) => onNavigate({ type: "artist", artistId: id })}
              >
                <div>
                  <TrackRow
                    track={track}
                    index={i}
                    onPlay={onPlayTrack}
                    onAddToQueue={onAddToQueue}
                    onGoToArtist={(id) => onNavigate({ type: "artist", artistId: id })}
                    onGoToAlbum={(id) => onNavigate({ type: "album", albumId: id })}
                  />
                </div>
              </TrackContextMenu>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 3: Criar src/modules/youtube-music/components/pages/playlist-page.tsx**

```tsx
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TrackRow } from "../shared/track-row";
import { TrackContextMenu } from "../shared/track-context-menu";
import { getMockPlaylist } from "../../mock/data";
import PlayIcon from "lucide-react/icons/play";
import type { Track, StackPage } from "../../types/music";

interface PlaylistPageProps {
  playlistId: string;
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onPlayAll: (tracks: Track[]) => void;
}

export function PlaylistPage({ playlistId, onNavigate, onPlayTrack, onAddToQueue, onPlayAll }: PlaylistPageProps) {
  const playlist = getMockPlaylist(playlistId);
  const imgUrl = playlist.thumbnails[0]?.url ?? "";

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-4">
        <div className="flex items-start gap-6">
          <Avatar className="h-48 w-48 rounded-md">
            <AvatarImage src={imgUrl} alt={playlist.title} className="object-cover" />
            <AvatarFallback className="rounded-md text-4xl">{playlist.title.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">{playlist.title}</h1>
            <p className="text-sm text-muted-foreground">{playlist.author.name}</p>
            {playlist.trackCount && (
              <p className="text-sm text-muted-foreground">{playlist.trackCount} músicas</p>
            )}
            <Button
              className="mt-2"
              onClick={() => playlist.tracks && onPlayAll(playlist.tracks)}
            >
              <PlayIcon className="mr-2 h-4 w-4" />
              Tocar tudo
            </Button>
          </div>
        </div>

        {playlist.tracks && (
          <div className="space-y-1">
            {playlist.tracks.map((track, i) => (
              <TrackContextMenu
                key={track.videoId}
                track={track}
                onPlay={onPlayTrack}
                onAddToQueue={onAddToQueue}
                onGoToArtist={(id) => onNavigate({ type: "artist", artistId: id })}
                onGoToAlbum={(id) => onNavigate({ type: "album", albumId: id })}
              >
                <div>
                  <TrackRow
                    track={track}
                    index={i}
                    onPlay={onPlayTrack}
                    onAddToQueue={onAddToQueue}
                    onGoToArtist={(id) => onNavigate({ type: "artist", artistId: id })}
                    onGoToAlbum={(id) => onNavigate({ type: "album", albumId: id })}
                  />
                </div>
              </TrackContextMenu>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 4: Verificar tipos**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/youtube-music/components/pages/
git commit -m "feat(youtube-music): add Artist, Album, and Playlist pages"
```

---

## Task 9: Queue Sheet

**Files:**
- Create: `src/modules/youtube-music/components/queue/queue-sheet.tsx`

- [ ] **Step 1: Criar src/modules/youtube-music/components/queue/queue-sheet.tsx**

```tsx
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import X from "lucide-react/icons/x";
import type { Track } from "../../types/music";

interface QueueSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queue: Track[];
  currentIndex: number;
  onPlayIndex: (index: number) => void;
  onRemove: (index: number) => void;
}

export function QueueSheet({ open, onOpenChange, queue, currentIndex, onPlayIndex, onRemove }: QueueSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-96 p-0">
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle>Fila de reprodução</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100%-3.5rem)]">
          <div className="space-y-1 p-2">
            {queue.length === 0 && (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                A fila está vazia
              </p>
            )}
            {queue.map((track, i) => {
              const imgUrl = track.thumbnails[0]?.url ?? "";
              const isCurrent = i === currentIndex;

              return (
                <div
                  key={`${track.videoId}-${i}`}
                  className={cn(
                    "group flex items-center gap-3 rounded-md px-2 py-1.5",
                    isCurrent ? "bg-accent" : "hover:bg-accent/50"
                  )}
                >
                  <button
                    type="button"
                    className="flex flex-1 items-center gap-3 min-w-0"
                    onClick={() => onPlayIndex(i)}
                  >
                    <Avatar className="h-10 w-10 rounded-sm">
                      <AvatarImage src={imgUrl} alt={track.title} className="object-cover" />
                      <AvatarFallback className="rounded-sm">{track.title.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 text-left">
                      <p className={cn("truncate text-sm", isCurrent ? "font-semibold text-foreground" : "text-foreground")}>
                        {track.title}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {track.artists.map((a) => a.name).join(", ")}
                      </p>
                    </div>
                  </button>
                  <span className="text-xs text-muted-foreground">{track.duration}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100"
                    onClick={() => onRemove(i)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/youtube-music/components/queue/
git commit -m "feat(youtube-music): add queue sheet panel"
```

---

## Task 10: Entry point — Montar tudo no index.tsx

**Files:**
- Modify: `src/modules/youtube-music/index.tsx`

- [ ] **Step 1: Substituir src/modules/youtube-music/index.tsx**

```tsx
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
    <TooltipProvider delayDuration={0}>
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
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: Zero erros.

- [ ] **Step 3: Rodar dev server**

```bash
npm run dev
```

Verificar que Vite inicia sem erros na porta 1430.

- [ ] **Step 4: Commit**

```bash
git add src/modules/youtube-music/index.tsx
git commit -m "feat(youtube-music): wire up complete module with all views, player, queue, and navigation"
```

---

## Checklist de Verificação Final

- [ ] `npx tsc --noEmit` passa sem erros
- [ ] `npm run dev` inicia sem erros
- [ ] Tabs Início/Explorar/Biblioteca funcionam
- [ ] Carrosséis horizontais renderizam com cards
- [ ] Clicar em card de artista/álbum/playlist empilha página
- [ ] Botão ← voltar funciona na stack
- [ ] Busca abre ao clicar 🔍
- [ ] Player bar aparece ao clicar em track
- [ ] Controles do player funcionam (play/pause, progress, volume)
- [ ] Fila abre via botão na player bar
- [ ] Context menu aparece ao right-click em tracks
- [ ] Dropdown menu (⋯) aparece ao hover em tracks
