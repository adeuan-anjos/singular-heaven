# YouTube Music Module — UI Design Spec

**Data**: 2026-04-06
**Escopo**: UI completa do módulo YouTube Music (sem backend/sidecar — apenas componentes React, estado local, dados mockados)

---

## Objetivo

Construir a interface do módulo YouTube Music usando exclusivamente componentes shadcn/ui e ReUI, sem customizações. A UI deve refletir as capacidades reais da ytmusicapi (Python), preparada para receber dados reais quando o sidecar for implementado.

## Premissas

- **Somente UI**: Sem sidecar Python, sem yt-dlp, sem streaming real. Dados mockados com estruturas que espelham os retornos da ytmusicapi.
- **shadcn/ReUI puro**: Zero componentes custom do zero. Tudo via `npx shadcn@latest add` + `className`.
- **Tema dark**: Já configurado no shell.
- **Player bar**: Dentro da área do módulo, não se sobrepõe à sidebar do app (56px à esquerda).

---

## 1. Layout Geral

```
┌────┬───────────────────────────────────────────────┐
│    │  [ Início ]  [ Explorar ]  [ Biblioteca ]  🔍 │
│ 🎵 ├───────────────────────────────────────────────┤
│    │                                               │
│ 📥 │           Conteúdo da tab ativa               │
│    │        (ou página empilhada com ← voltar)     │
│    │                                               │
│    ├───────────────────────────────────────────────┤
│    │  Player Bar (fixa, sempre visível)            │
└────┴───────────────────────────────────────────────┘
```

### Componentes do layout

| Elemento | Componente shadcn |
|---|---|
| Tabs (Início/Explorar/Biblioteca) | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` |
| Busca (🔍) | `Button` → abre `Command` dialog |
| Conteúdo scrollável | `Scroll Area` |
| Player bar | Composição de `Avatar`, `Button`, `Slider`, `Toggle`, `Tooltip` |

### Navegação stack

Quando o usuário clica em artista/álbum/playlist/busca, a página é empilhada sobre a tab ativa:

- A barra de tabs é substituída por: `← Voltar` + título da página
- O conteúdo muda para a página empilhada
- Clicar em voltar retorna à tab anterior
- O player bar permanece fixo independentemente

Estado de navegação: array stack simples em `useState`. Push ao navegar, pop ao voltar.

```ts
type StackPage =
  | { type: "artist"; artistId: string }
  | { type: "album"; albumId: string }
  | { type: "playlist"; playlistId: string }
  | { type: "search" }
  | { type: "mood"; params: string; title: string };

const [stack, setStack] = useState<StackPage[]>([]);
// stack vazio = mostrando tabs
// stack com items = mostrando última página, com botão voltar
```

---

## 2. Tab: Início

**Dados**: `get_home()` — retorna seções personalizadas com título + lista de items.

### Layout

- Carrosséis horizontais, um por seção
- Cada seção: título à esquerda + scroll horizontal de cards

### Componentes

| Elemento | Componente |
|---|---|
| Container da seção | `div` com título `h2` |
| Cards do carrossel | `Card` com `Avatar` (capa) + nome + subtítulo |
| Loading | `Skeleton` (cards placeholder) |
| Scroll | `Scroll Area` com orientação horizontal |

### Card do carrossel

```
┌─────────┐
│  [Capa]  │  ← Avatar ou img aspect-ratio
│  160x160 │
├─────────┤
│ Nome     │  ← truncado, 1 linha
│ Subtítulo│  ← muted-foreground, 1 linha
└─────────┘
```

- Click no card → push na stack (artista, álbum ou playlist conforme o tipo)
- Tamanho do card: ~160px largura para álbuns/playlists, ~140px para artistas (circular)
- Artistas usam `Avatar` circular, álbums/playlists usam `Avatar` com `rounded-md`

---

## 3. Tab: Explorar

**Dados**: `get_explore()` + `get_mood_categories()`

### Layout

- Seção "Novos lançamentos" → carrossel de `Card` (álbuns)
- Seção "Em alta" → carrossel de `Card`
- Seção "Novos vídeos" → carrossel de `Card`
- Seção "Moods e gêneros" → grid de `Badge` clicáveis

### Moods & Genres

- `get_mood_categories()` retorna categorias agrupadas
- Cada categoria renderizada como `Badge` com variante outline
- Click no badge → push `{ type: "mood", params, title }` na stack
- Página de mood: lista de playlists via `get_mood_playlists(params)`

---

## 4. Tab: Biblioteca

**Dados**: Métodos de library (todos requerem auth)

### Layout

Sub-seções verticais (não sub-tabs, para manter simples):

1. **Curtidas** — `get_liked_songs()` → lista de tracks
2. **Playlists** — `get_library_playlists()` → grid/lista de playlists
3. **Artistas** — `get_library_artists()` → grid de artistas
4. **Álbuns** — `get_library_albums()` → grid de álbuns
5. **Histórico** — `get_history()` → lista de tracks recentes

Cada seção mostra preview (5-8 items) com link "Ver tudo" que empilha a lista completa.

### Componentes

| Elemento | Componente |
|---|---|
| Seção | `div` com `h2` + link "Ver tudo" |
| Lista de tracks | `div` rows com `Avatar` (capa) + nome + artista + duração |
| Grid de álbuns/playlists | Grid de `Card` (como carrossel da Home mas em grid) |
| Grid de artistas | Grid de `Avatar` circular + nome |
| Loading | `Skeleton` |

---

## 5. Busca

**Dados**: `search()` + `get_search_suggestions()`

### Fluxo

1. Usuário clica 🔍 → push `{ type: "search" }` na stack
2. Abre tela com `Command` (paleta de busca) no topo
3. Digitando → `get_search_suggestions()` mostra sugestões em tempo real
4. Enter ou clique em sugestão → `search(query)` retorna resultados mistos
5. Resultados agrupados por tipo: Músicas, Artistas, Álbuns, Playlists

### Componentes

| Elemento | Componente |
|---|---|
| Barra de busca | `Command` com `CommandInput` |
| Sugestões | `CommandList` + `CommandItem` |
| Grupos de resultados | `CommandGroup` por tipo |
| Items de resultado | Row com `Avatar` + nome + tipo + `Dropdown Menu` (⋯) |

### Resultados de busca

- **Música**: `Avatar` (capa) + nome + artista + duração → click = tocar
- **Artista**: `Avatar` (circular) + nome → click = push artista na stack
- **Álbum**: `Avatar` (capa) + nome + artista + ano → click = push álbum na stack
- **Playlist**: `Avatar` (capa) + nome + autor → click = push playlist na stack

---

## 6. Página de Artista

**Dados**: `get_artist(artistId)`

### Layout

```
← Voltar    Nome do Artista
┌───────────────────────────────────┐
│  [Avatar grande]                  │
│  Nome do Artista                  │
│  [Botão: Inscrever-se]           │
├───────────────────────────────────┤
│  Top músicas (lista, max 5)      │
│  Álbuns (carrossel)              │
│  Singles (carrossel)             │
│  Vídeos (carrossel)             │
│  Artistas similares (carrossel)  │
└───────────────────────────────────┘
```

### Componentes

| Elemento | Componente |
|---|---|
| Header | `Avatar` (lg, circular) + nome + `Button` inscrever |
| Top músicas | Rows com # + `Avatar` + nome + duração + `Dropdown Menu` |
| Carrosséis | Mesma estrutura da Home (`Card` + `Avatar`) |
| Loading | `Skeleton` para header + carrosséis |

---

## 7. Página de Álbum

**Dados**: `get_album(albumId)`

### Layout

```
← Voltar    Nome do Álbum
┌───────────────────────────────────┐
│  [Capa 200x200]  Nome do Álbum   │
│                   Artista • Ano   │
│                   X músicas       │
│                   [▶ Tocar tudo]  │
├───────────────────────────────────┤
│  1. Nome da música       3:45    │
│  2. Nome da música       4:12    │
│  3. Nome da música       3:33    │
│  ...                             │
└───────────────────────────────────┘
```

### Componentes

| Elemento | Componente |
|---|---|
| Capa | `Avatar` (200px, rounded-md) |
| Info | Texto com nome, artista (clicável), ano, contagem |
| Botão tocar | `Button` variante default |
| Tracklist | Rows: # + nome + duração + `Dropdown Menu` (⋯) |
| Right-click | `Context Menu` em cada track |
| Loading | `Skeleton` para capa + linhas |

### Context Menu / Dropdown Menu (tracks)

Opções:
- Tocar
- Tocar em seguida (adicionar à fila)
- Ir para o artista
- Ir para o álbum (se não estiver na página do álbum)
- Adicionar à playlist → submenu com playlists do usuário
- Curtir / Descurtir

---

## 8. Página de Playlist

**Dados**: `get_playlist(playlistId)` + `get_playlist_videos(playlistId)`

Layout idêntico à página de álbum, com diferença:
- Mostra autor em vez de artista
- Mostra contagem de vídeos
- Cada track mostra artista individual (playlists têm tracks de artistas variados)

---

## 9. Player Bar

Fixa no bottom da área do módulo. Sempre visível quando há música (ativa ou pausada).

### Layout

```
┌──────────────────────────────────────────────────────┐
│ [Cover] Nome da Música      🔀 ◄ ▶ ► 🔁   ━━●━━━ 🔊│
│ 48x48   Artista                        0:00 / 3:45  │
└──────────────────────────────────────────────────────┘
```

### Componentes

| Elemento | Componente | Detalhe |
|---|---|---|
| Capa | `Avatar` (48x48, rounded-md) | Clicável → abre álbum |
| Nome da música | Texto truncado | Clicável → abre álbum |
| Nome do artista | Texto `muted-foreground` | Clicável → abre artista |
| Shuffle | `Toggle` | Ativo/inativo |
| Previous | `Button` (ghost, icon) | `lucide: skip-back` |
| Play/Pause | `Button` (default, icon) | `lucide: play` / `pause` |
| Next | `Button` (ghost, icon) | `lucide: skip-forward` |
| Repeat | `Toggle` | Off / all / one |
| Barra de progresso | `Slider` | Drag + click para seek |
| Tempo | Texto `muted-foreground` | `0:00 / 3:45` |
| Volume | `Slider` (menor) | Com ícone `lucide: volume-2` |
| Fila | `Button` (ghost, icon) | `lucide: list-music` → abre `Sheet` |

### Estados

- **Sem música**: Player bar não aparece, conteúdo ocupa 100% da altura
- **Com música**: Player bar visível (~72px altura), conteúdo ajusta
- **Pausada**: Botão mostra play, barra de progresso parada

---

## 10. Fila de Reprodução

**Dados**: `get_watch_playlist(videoId)` para fila automática

### Layout

`Sheet` abrindo pela direita (side="right"), largura ~400px.

```
┌─── Fila de reprodução ──────────┐
│                                 │
│  Tocando agora                  │
│  [Track ativa destacada]        │
│                                 │
│  Próximas                       │
│  1. Track               3:45   │
│  2. Track               4:12   │
│  3. Track               3:33   │
│  ...                           │
│                                 │
└─────────────────────────────────┘
```

### Componentes

| Elemento | Componente |
|---|---|
| Painel | `Sheet` (side="right") |
| Header | `SheetHeader` com título "Fila de reprodução" |
| Lista | `Scroll Area` com rows |
| Reordenar | `Sortable` (ReUI) para drag-and-drop |
| Track ativa | Row com destaque visual (bg-accent) |
| Cada track | `Avatar` + nome + artista + duração + botão remover |

---

## 11. Estrutura de Arquivos

```
src/modules/youtube-music/
├── index.tsx                      # Entry point (React.lazy)
├── components/
│   ├── layout/
│   │   ├── music-tabs.tsx         # Tabs + header com busca
│   │   ├── music-header.tsx       # Header de página empilhada (← voltar + título)
│   │   └── player-bar.tsx         # Player bar fixa
│   ├── home/
│   │   ├── home-view.tsx          # Tab Início
│   │   └── carousel-section.tsx   # Seção de carrossel reutilizável
│   ├── explore/
│   │   ├── explore-view.tsx       # Tab Explorar
│   │   └── mood-grid.tsx          # Grid de moods/genres
│   ├── library/
│   │   └── library-view.tsx       # Tab Biblioteca
│   ├── search/
│   │   └── search-view.tsx        # Página de busca
│   ├── pages/
│   │   ├── artist-page.tsx        # Página de artista
│   │   ├── album-page.tsx         # Página de álbum
│   │   └── playlist-page.tsx      # Página de playlist
│   ├── queue/
│   │   └── queue-sheet.tsx        # Sheet da fila
│   └── shared/
│       ├── track-row.tsx          # Row de track reutilizável
│       ├── track-context-menu.tsx # Context menu de track
│       ├── media-card.tsx         # Card de carrossel reutilizável
│       └── section-header.tsx     # Título de seção + "Ver tudo"
├── hooks/
│   ├── use-player.ts             # Estado do player (track, playing, progress, volume)
│   ├── use-queue.ts              # Estado da fila
│   └── use-navigation.ts         # Stack de navegação interna
├── types/
│   └── music.ts                  # Tipos que espelham retornos da ytmusicapi
└── mock/
    └── data.ts                   # Dados mockados para desenvolvimento da UI
```

---

## 12. Tipos (espelhando ytmusicapi)

```ts
interface Thumbnail {
  url: string;
  width: number;
  height: number;
}

interface ArtistBasic {
  id: string | null;
  name: string;
}

interface Track {
  videoId: string;
  title: string;
  artists: ArtistBasic[];
  album: { id: string; name: string } | null;
  duration: string;        // "3:45"
  durationSeconds: number; // 225
  thumbnails: Thumbnail[];
  isExplicit?: boolean;
  likeStatus?: "LIKE" | "DISLIKE" | "INDIFFERENT";
}

interface Album {
  browseId: string;
  title: string;
  artists: ArtistBasic[];
  year?: string;
  thumbnails: Thumbnail[];
  tracks?: Track[];
}

interface Artist {
  browseId: string;
  name: string;
  thumbnails: Thumbnail[];
  subscribers?: string;
  topSongs?: Track[];
  albums?: Album[];
  singles?: Album[];
  similarArtists?: Artist[];
}

interface Playlist {
  playlistId: string;
  title: string;
  author: ArtistBasic;
  trackCount?: number;
  thumbnails: Thumbnail[];
  tracks?: Track[];
}

interface HomeSection {
  title: string;
  contents: (Album | Playlist | Track | Artist)[];
}

interface ExploreData {
  newReleases: Album[];
  trending: Track[];
  newVideos: Track[];
  moodsAndGenres: MoodCategory[];
}

interface MoodCategory {
  title: string;
  params: string;
}
```

---

## 13. Componentes shadcn/ReUI a Instalar

```bash
npx shadcn@latest add tabs slider scroll-area card avatar skeleton \
  command context-menu dropdown-menu sheet toggle dialog badge sonner
```

ReUI (quando necessário):
```bash
npx shadcn@latest add @reui/sortable
npx shadcn@latest add @reui/autocomplete
```

---

## 14. Dados Mockados

Para desenvolvimento da UI, criar mocks que espelham a estrutura real da ytmusicapi:

- `mockHomeSections`: 4-5 seções com 8-10 items cada
- `mockExploreData`: novos lançamentos, trending, moods
- `mockLibrary`: curtidas (20 tracks), 5 playlists, 5 artistas, 5 álbuns
- `mockArtist`: artista completo com top songs, álbuns, similares
- `mockAlbum`: álbum com 12 tracks
- `mockPlaylist`: playlist com 15 tracks
- `mockSearchResults`: resultados mistos (5 músicas, 3 artistas, 3 álbuns, 2 playlists)

Usar thumbnails de placeholder (URL para imagem genérica 160x160) e dados fictícios mas realistas.

---

## Fora do Escopo

- Sidecar Python (ytmusicapi)
- Sidecar yt-dlp
- Streaming de áudio real
- OAuth / autenticação
- Persistência de estado entre sessões
- Letras (tela futura)
- Download de música (integração com módulo Download Manager)
