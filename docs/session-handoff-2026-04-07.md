# Session Handoff — 2026-04-07

> Documento completo para continuidade de desenvolvimento em nova sessao.
> Leia este arquivo inteiro antes de tocar em qualquer codigo.

---

## 1. Estado do Projeto

### O que e o Singular Haven

App desktop opensource de utilidades pessoais unificadas. Primeiro modulo: YouTube Music com UI propria e leve. Stack:

| Camada | Tecnologia |
|--------|-----------|
| Backend | Tauri 2.0 (Rust), `tauri = "2"` |
| Frontend | React 19.1 + TypeScript 5.8 |
| Estilos | Tailwind CSS 4.2 (zero runtime) |
| Componentes UI | shadcn/ui (estilo `base-nova` com `@base-ui/react`) + ReUI |
| Fonte | Geist Variable |
| Estado | Zustand 5 (com `subscribeWithSelector`) |
| Virtual scroll | `@tanstack/react-virtual` |
| Icones | Lucide React |
| Bundler | Vite 7 |
| YouTube API (Rust) | `ytmapi-rs = "0.3"` |
| Cookie extraction | `rookie = "0.5"` |
| Windows memory | `webview2-com = "0.38"`, `windows-core = "0.61"` |

### O que foi construido

- Modulo YouTube Music completo com UI funcional (dados mock)
- Navegacao com side panel (Inicio, Explorar, Biblioteca, playlists)
- Top bar com busca permanente no input, navegacao back/forward
- Player bar com controles, progress bar ref-based (zero re-renders)
- Pages: Home, Explore, Library, Artist, ArtistSongs, Album, Playlist, SearchResults
- Componentes compartilhados: MediaCard, CarouselSection, MediaGrid, TrackRow, TrackTable, CollectionHeader, ChartList, TopResultCard, VirtualTrackList
- Zustand stores para player (play/pause/seek/volume/shuffle/repeat) e queue
- Login screen com deteccao automatica de browsers e cookie auth
- Backend Rust com ytmapi-rs: search, auth (OAuth + cookie), browser detection
- Otimizacao de memoria: WebView2 memory level Low/Normal no focus/blur (147MB -> 28MB)
- Debug hooks: useRenderTracker, useLeakDetector, useListenerTracker

---

## 2. Decisoes de Arquitetura

### Single Window, Single WebView
- Uma janela, um WebView. Modulos trocados via React.
- Cada WebView extra custa +80-120MB. Documentado em `docs/memory-optimization.md`.

### Modulos Lazy + Unmount
- `React.lazy()` + `Suspense` + `key={moduleId}` no `ModuleHost`
- Trocar de modulo forca unmount completo (desmonta fiber tree, DOM, cleanup effects)
- Nenhum estado, listener ou sidecar persiste quando modulo esta inativo
- Documentado em `docs/keep-alive-screens.md`

### Estado
- Zustand para estado de alta frequencia (player, queue) — NAO useState em componentes root
- `subscribeWithSelector` middleware para subscricoes granulares
- Stores fazem cleanup no unmount do modulo

### Progress Bar
- `ProgressBar` usa refs DOM puros (`trackRef`, `fillRef`, `thumbRef`, `currentTimeRef`)
- Subscribes ao Zustand via `subscribe()` direto, atualiza DOM sem re-render React
- Zero re-renders durante playback — apenas monta/desmonta com PlayerBar
- Arquivo: `src/modules/youtube-music/components/layout/progress-bar.tsx`

### WebView2 Memory Level (Windows only)
- Quando perde foco: `SetMemoryUsageTargetLevel(Low)` — RAM cai de 147MB para 28MB
- Quando ganha foco: `SetMemoryUsageTargetLevel(Normal)`
- Implementado via `ICoreWebView2_19` com `#[cfg(target_os = "windows")]`
- NAO misturar com `TrySuspendAsync`
- Documentado em `docs/webview2-memory-level.md`

### CSS / Animacoes
- Tailwind CSS 4 com `@tailwindcss/vite` plugin (zero runtime)
- Animacoes CSS via compositor thread (transform, opacity) para 144Hz
- Smooth scrolling habilitado globalmente
- GPU acceleration com `will-change` apenas em elementos animados

### Navegacao interna do modulo
- Hook `useNavigation()` com stack + forward stack
- Tipos: `StackPage` union type (artist, artist-songs, album, playlist, mood, search)
- Back/forward no top bar, clear ao trocar de tab no side panel

---

## 3. YouTube Music API — Descobertas Criticas

### OAuth esta MORTO

**Google bloqueou OAuth + WEB_REMIX client em agosto de 2025.** Todas as bibliotecas foram afetadas:
- ytmusicapi (Python) — nao funciona mais com OAuth
- ytmapi-rs (Rust) — nao funciona mais com OAuth
- yt-dlp — afetado
- YouTube.js (Invidious) — afetado

**Nao existe fix.** Google nao revogou apenas um client ID — eles bloquearam o padrao inteiro do WEB_REMIX client com OAuth tokens. O Device Code Flow completa, gera token, mas as requests falham com 403.

### Cookie auth FUNCIONA

- Extrair cookies do navegador do usuario usando o crate `rookie`
- Cookies `.youtube.com` sao suficientes
- Cookies duram ~2 anos (ate o usuario fazer logout)
- `rookie` suporta: Chrome, Firefox, Edge, Brave, Chromium, Opera, Vivaldi
- Cookies sao salvos em `{app_data_dir}/yt_cookies.txt` para persistencia

### ytmapi-rs (Rust crate, versao 0.3)

**61 query types** implementados. Funciona para muitas operacoes, MAS:

- **Bug no parser de search**: Quando o resultado contem "More results" variant, o parser falha (issue #353 no GitHub)
- **Metodos faltando**: `get_home`, `get_explore`, `get_charts` nao existem no crate
- **BrowserToken**: Funciona com cookies extraidos via `rookie`

### ytmusicapi (Python, versao 1.11.5)

- **6,738 LOC**, 61 metodos, 9 mixins
- Estrutura modular limpa: `_base.py` + mixins (search, browsing, library, playlists, explore, watch, uploads, podcasts, i18n)
- Referencia completa em `docs/ytmusicapi-reference.md`
- **Recomendacao**: Converter para Rust como crate proprio

### Resultados dos testes de API (cookies do Brave)

| Teste | Resultado | Notas |
|-------|-----------|-------|
| Search suggestions | OK | Retorna sugestoes reais |
| Library songs (curtidas) | OK | Retorna dados reais do usuario |
| Mood categories | OK | Retorna categorias de humor/genero |
| Search | FALHA | Bug no parser "More results" (ytmapi-rs #353) |
| Library playlists | VAZIO | Retorna array vazio (possivel bug no parsing) |
| Get artist | PULADO | Problema de tipo com ArtistChannelID |

---

## 4. Proximo Passo: O Que Fazer

### 4.1 ROLLBACK do codigo OAuth

O codigo OAuth adicionado nos commits `b66702d` e `37d92d5` e complexidade desnecessaria, ja que OAuth esta morto. Ja foi parcialmente removido no commit `7f07f55` (login screen), mas o backend ainda tem:
- `PendingOAuthCode` state em `lib.rs`
- `yt_auth_start` e `yt_auth_complete` commands em `commands.rs`
- `OAuthToken` persistence em `client.rs`
- `Authenticated(YtMusic<OAuthToken>)` variant no enum

**Acao**: Remover todo codigo OAuth do backend. Manter apenas `CookieAuth` e `Unauthenticated`.

### 4.2 Criar crate `ytmusic-api` (workspace member)

Criar um crate Rust proprio que reimplemente a API do YouTube Music, convertido da `ytmusicapi` Python:

```
singular-haven/
  ytmusic-api/           # Novo workspace member
    Cargo.toml
    src/
      lib.rs
      client.rs          # HTTP client (reqwest), context builder
      auth/
        mod.rs
        cookie.rs        # Cookie auth via rookie
      innertube/
        mod.rs
        context.rs       # InnerTube request context builder
        endpoints.rs     # Endpoint constants
      parsers/
        mod.rs
        nav.rs           # JSON navigation helpers (equivalente ao nav.py)
        search.rs
        browsing.rs
        library.rs
        playlists.rs
        explore.rs
        watch.rs
        uploads.rs
        podcasts.rs
      queries/
        mod.rs
        search.rs
        browsing.rs
        library.rs
        playlists.rs
        explore.rs
        watch.rs
        uploads.rs
        podcasts.rs
      types/
        mod.rs           # Structs tipadas (Song, Album, Artist, Playlist, etc.)
      continuations.rs   # Pagination handling
    tests/
      integration.rs
    examples/
      cli_test.rs        # CLI binary para testes end-to-end
```

**Plano de conversao**:
1. **Core**: HTTP client (reqwest), InnerTube context builder, JSON navigation helpers, continuation/pagination
2. **Auth**: Apenas cookie auth (usando `rookie` para extracao)
3. **Mixins -> modules**: search, browsing, library, playlists, explore, charts, watch, uploads, podcasts
4. **Parsers**: serde typed structs para shapes conhecidos, `serde_json::Value` para partes dinamicas
5. **Testing**: CLI binary para testes end-to-end com cookies reais

### 4.3 Integracao Frontend

Apos o crate estar funcional:
- Criar Tauri commands para cada operacao (search, get_home, get_artist, get_album, get_playlist, etc.)
- Substituir dados mock por chamadas reais via `invoke()`
- Implementar loading states e error handling no frontend

---

## 5. Estrutura de Arquivos

### Raiz do projeto

```
singular-haven/
  CLAUDE.md                          # Regras do projeto (OBRIGATORIO ler)
  package.json                       # React 19, Tailwind 4, Zustand 5, Vite 7
  components.json                    # shadcn config (base-nova, @base-ui/react)
  vite.config.ts                     # Dev port 1430, alias @/ -> src/
  tsconfig.json
  tsconfig.node.json
```

### docs/

```
docs/
  keep-alive-screens.md              # Regra: modulos desmontam quando inativos
  memory-optimization.md             # Guia completo de otimizacao de RAM (426 linhas)
  webview2-memory-level.md           # Resultado: 147MB -> 28MB no minimize
  ytmusicapi-reference.md            # Referencia completa da lib Python (para conversao)
  superpowers/                       # Plans e specs de implementacao
    plans/
      2026-04-06-stack-setup.md
      2026-04-06-youtube-music-ui.md
    specs/
      2026-04-06-stack-setup-design.md
      2026-04-06-youtube-music-ui-design.md
```

### src/ (Frontend)

```
src/
  main.tsx                           # Entry point React
  app.tsx                            # Render <AppShell />
  index.css                          # Tailwind imports, tema, Geist font
  vite-env.d.ts

  components/
    shell/
      app-shell.tsx                  # Layout raiz: Sidebar + ModuleHost
      sidebar.tsx                    # Barra lateral de modulos (icons com tooltip)
      module-host.tsx                # Suspense + lazy load do modulo ativo (key forces unmount)
      module-skeleton.tsx            # Fallback de loading

    ui/                              # shadcn/ui (NAO EDITAR — customizar via className)
      avatar.tsx, badge.tsx, button.tsx, card.tsx, command.tsx,
      context-menu.tsx, dialog.tsx, dropdown-menu.tsx, input.tsx,
      input-group.tsx, popover.tsx, resizable.tsx, scroll-area.tsx,
      separator.tsx, sheet.tsx, skeleton.tsx, slider.tsx, sonner.tsx,
      tabs.tsx, textarea.tsx, toggle.tsx, tooltip.tsx

  config/
    modules.ts                       # Registry de modulos (youtube-music, download-manager)

  hooks/
    use-active-module.ts             # Hook para controlar modulo ativo

  lib/
    utils.ts                         # cn() helper (clsx + tailwind-merge)
    debug/
      index.ts                       # Re-exports dos debug hooks
      use-render-tracker.ts          # Loga re-renders com props diff
      use-leak-detector.ts           # Detecta leaks via FinalizationRegistry
      use-listener-tracker.ts        # Rastreia event listeners

  types/
    module.ts                        # ModuleConfig type

  modules/
    download-manager/
      index.tsx                      # Placeholder

    youtube-music/
      index.tsx                      # Root do modulo — auth check, routing, layout
      types/music.ts                 # Track, Album, Artist, Playlist, StackPage, etc.
      mock/data.ts                   # Dados mock (160 linhas)

      stores/
        player-store.ts              # Zustand — play/pause/seek/volume/shuffle/repeat + timer
        queue-store.ts               # Zustand — queue management (add/remove/next/prev)

      hooks/
        use-navigation.ts            # Stack-based navigation (push/pop/forward/clear)

      components/
        auth/
          login-screen.tsx           # Deteccao de browsers, cookie auth, skip option

        layout/
          side-panel.tsx             # Navegacao interna (Inicio/Explorar/Biblioteca/playlists)
          top-bar.tsx                # Back/forward + search input permanente
          player-bar.tsx             # Controles de playback, avatar do track, volume
          progress-bar.tsx           # Ref-based, zero re-renders

        home/
          home-view.tsx              # Carousels de recomendacoes (mock)

        explore/
          explore-view.tsx           # Novidades, trending, mood grid
          mood-grid.tsx              # Grid de categorias de humor/genero

        library/
          library-view.tsx           # Playlists, curtidas, albums do usuario

        pages/
          artist-page.tsx            # Bio, monthly listeners, top songs, albums, singles, similar
          artist-songs-page.tsx      # Full track list do artista
          album-page.tsx             # Header + TrackTable
          playlist-page.tsx          # Header + TrackTable + filter

        search/
          search-results-page.tsx    # Tabs de filtro (Tudo, Musicas, Videos, Albums, etc.)
          top-result-card.tsx        # Card do resultado principal
          top-result-section.tsx     # Secao do top result + tracks

        queue/
          queue-sheet.tsx            # Sheet lateral com fila de reproducao

        shared/
          carousel-section.tsx       # Scroll horizontal com arrows e drag-to-scroll
          media-card.tsx             # Card de album/playlist/artista (thumbnail + info)
          media-grid.tsx             # Grid responsivo que usa MediaCard
          section-header.tsx         # Titulo de secao
          collection-header.tsx      # Header grande (album/playlist page) — thumbnail, stats, actions
          track-row.tsx              # Linha individual de track
          track-table.tsx            # Tabela de tracks com header, hover, context menu
          track-context-menu.tsx     # Menu de contexto (tocar, fila, artista, album)
          chart-list.tsx             # Lista numerada de charts (trending)
          virtual-track-list.tsx     # Lista virtualizada com @tanstack/react-virtual
```

### src-tauri/ (Backend Rust)

```
src-tauri/
  Cargo.toml                         # Deps: tauri 2, ytmapi-rs 0.3, rookie 0.5, serde, tokio
  tauri.conf.json                    # App config: 1200x800, port 1430, CSP null
  build.rs

  capabilities/
    default.json                     # Tauri security capabilities

  src/
    main.rs                          # Entry point (chama singular_haven_lib::run)
    lib.rs                           # Tauri setup: auth init, memory level, command handler
    youtube_music/
      mod.rs                         # Re-exports client + commands
      client.rs                      # YtMusicClient enum (Unauth/Auth/CookieAuth) + persistence
      commands.rs                    # Tauri commands: search, auth, browser detection

    bin/
      api_test.rs                    # CLI para testar API com cookies reais
```

---

## 6. Componentes Compartilhados

| Componente | Arquivo | Funcao |
|-----------|---------|--------|
| `MediaCard` | `shared/media-card.tsx` | Card com thumbnail, titulo, subtitulo, play overlay. Usado em carousels e grids. |
| `CarouselSection` | `shared/carousel-section.tsx` | Scroll horizontal com arrows, drag-to-scroll, "Ver tudo" button. |
| `MediaGrid` | `shared/media-grid.tsx` | Grid CSS `repeat(6,1fr)` responsivo. Wrapping layout para library e full pages. |
| `TrackRow` | `shared/track-row.tsx` | Linha individual de track com thumbnail, titulo, artista, duracao. |
| `TrackTable` | `shared/track-table.tsx` | Tabela de tracks: header, hover effects, heart/menu always visible, context menu. |
| `TrackContextMenu` | `shared/track-context-menu.tsx` | Context menu: tocar, adicionar a fila, ir para artista/album. |
| `CollectionHeader` | `shared/collection-header.tsx` | Header grande para album/playlist: thumbnail, titulo, subtitle, stats, actions, like. |
| `ChartList` | `shared/chart-list.tsx` | Lista numerada para charts (ranking, trend up/down). |
| `TopResultCard` | `search/top-result-card.tsx` | Card do resultado principal da busca. |
| `SectionHeader` | `shared/section-header.tsx` | Titulo de secao com opcional "Ver tudo". |
| `VirtualTrackList` | `shared/virtual-track-list.tsx` | Lista virtualizada com `@tanstack/react-virtual` para 100+ items. |
| `ProgressBar` | `layout/progress-bar.tsx` | Progress bar ref-based, zero re-renders. DOM updates via Zustand subscribe. |

---

## 7. Pages e Estrutura

### Home (`home-view.tsx`)
- Carousels de recomendacoes usando `CarouselSection` + `MediaCard`
- Dados mock por enquanto

### Explore (`explore-view.tsx`)
- Secoes: Novidades, Em alta, Novos clipes
- `MoodGrid` para categorias de humor/genero
- Usa `CarouselSection`, `ChartList`, `MediaCard`

### Library (`library-view.tsx`)
- Playlists, curtidas, albums do usuario
- Usa `MediaGrid` com layout wrapping
- Usa `CarouselSection` para secoes

### Artist (`artist-page.tsx`)
- Header com foto, nome, monthly listeners
- Shuffle + Radio buttons
- Top songs (com "Mostrar tudo" -> `ArtistSongsPage`)
- Albums, singles, similar artists em carousels
- Bio/descricao

### Artist Songs (`artist-songs-page.tsx`)
- Header + lista completa de tracks sem carousels
- `CollectionHeader` + `TrackTable`

### Album (`album-page.tsx`)
- `CollectionHeader` (grande, com thumbnail, stats)
- `TrackTable` com todas as faixas
- Action buttons: play all, shuffle, add to library

### Playlist (`playlist-page.tsx`)
- Mesmo layout do Album
- `CollectionHeader` + `TrackTable`
- Filtro de busca, action buttons

### Search Results (`search-results-page.tsx`)
- Tabs de filtro: Tudo, Musicas, Videos, Albums, Artistas, Playlists, Podcasts
- Tab "Tudo" mostra `TopResultSection` + secoes por tipo
- `TopResultCard` para o melhor match

---

## 8. Issues Conhecidos / Tech Debt

| Issue | Severidade | Notas |
|-------|-----------|-------|
| Debug logs em todos os componentes | Baixa | Intencional, nao remover sem permissao |
| Codigo OAuth no backend | Media | Morto, precisa ser removido (complexidade desnecessaria) |
| ytmapi-rs search parser bug | Alta | Issue #353 — "More results" variant quebra o parser |
| Library playlists retorna vazio | Media | Possivel bug no parsing do ytmapi-rs |
| Get artist pulado nos testes | Baixa | Problema de tipo com ArtistChannelID |
| Dados mock no frontend | Alta | Toda a UI usa dados mock — precisa integrar API real |
| `PendingOAuthCode` state em lib.rs | Baixa | Remover junto com OAuth cleanup |

---

## 9. Regras do CLAUDE.md (Resumo)

### Obrigatorias
1. **Portugues BR correto** no texto voltado ao usuario (acentuacao, gramatica)
2. **Codigo em ingles** (variaveis, funcoes, identificadores)
3. **SEMPRE usar shadcn/ui ou ReUI** — nunca recriar componente do zero
4. **NUNCA editar `src/components/ui/`** — customizar via `className`
5. **NUNCA usar valores arbitrarios do Tailwind** (`bg-[#xxx]`, `px-[455px]`)
6. **Modulos isolados** em `src/modules/`, lazy loaded, desmontados quando inativos
7. **Sidecars sob demanda** — iniciados e encerrados com o modulo
8. **Debug logs** em cada etapa apos implementar feature
9. **Validacao end-to-end** obrigatoria antes de considerar pronto
10. **Multiplataforma** — nunca usar APIs nativas de SO sem abstrair

### Qualidade
- Codigo de engenheiro senior — limpo, enxuto, profissional
- Pesquisar libs antes de implementar do zero
- Fix estrutural se arquitetura esta falha
- Sem gambiarras — encontrar causa raiz
- Reverter tentativas fracassadas imediatamente

### Mecanicas
- Dead code removal antes de refactor em arquivos >300 LOC
- Max 5 arquivos por fase de refactor
- Re-ler arquivo antes de editar (apos 10+ mensagens)
- Verificar edit com leitura pos-edit
- Busca completa em renomeacoes (imports, types, strings, re-exports, testes)
- Rodar type-check/lint apos cada mudanca

---

## 10. Historico Git Recente

```
7f07f55 refactor(youtube-music): remove broken OAuth from login screen, keep only browser cookie auth
1a7682d feat: auto browser cookie extraction for YouTube Music auth using rookie crate
d7c2233 debug: add API test panel in home view to verify yt_search with real data
37d92d5 feat(youtube-music): add OAuth login screen with device code flow
b66702d feat: implement OAuth Device Code Flow for YouTube Music authentication
2c903ae feat: add ytmapi-rs crate and base YouTube Music backend structure
a98cfa5 docs: document WebView2 memory level optimization — 147MB to 28MB on minimize
027ba6e perf: set WebView2 memory level to Low when unfocused, Normal when focused
cc2b396 perf: enable smooth scrolling on all scroll areas
937b9a0 perf: GPU-accelerate equalizer animation with will-change, document GPU acceleration findings
fb14ee1 perf(youtube-music): replace Slider with lightweight ref-based progress bar — zero re-renders during playback
024d508 refactor(youtube-music): unify all page headers into single CollectionHeader component
cd338d2 feat(youtube-music): artist songs page — header + full track list without carousels
34776d1 fix(youtube-music): 'Mostrar tudo' navigates to full playlist page with virtual scroll
b51b07b feat(youtube-music): add 'Mostrar tudo' button for artist top songs
7740fe0 feat(youtube-music): add views/play count column to TrackTable, show on artist page
fc463f9 feat(youtube-music): redesign artist page with full API data — bio, monthly listeners, shuffle, radio, videos
e625602 fix(youtube-music): MediaGrid uses auto-fill for responsive wrapping on smaller screens
0876c8f fix(youtube-music): MediaGrid header min-h-8 to match CarouselSection header height
4aa239d fix(youtube-music): MediaGrid add pb-4 to match CarouselSection grid height
9a765e0 fix(youtube-music): MediaGrid uses same grid sizing as CarouselSection
9513d38 fix(youtube-music): use bullet separator instead of pipe in CollectionHeader stats
0e3d755 fix(youtube-music): CollectionHeader layout closer to Tidal — stats with pipe separator, description below
3bce936 chore: add mock data to playlist CollectionHeader for visual preview
1910dcd feat(youtube-music): CollectionHeader supports description, year, duration, privacy from API
911178b refactor(youtube-music): create CollectionHeader component — shared between playlist and album pages
aec0732 feat(youtube-music): album page matches playlist page style — large header, TrackTable, filter, action buttons
1fffe48 fix(youtube-music): TrackTable — heart/menu always visible in title column, fixed grid layout
32ea7a5 feat(youtube-music): redesign playlist page with large header, filter, and action buttons
6e89a29 feat(youtube-music): add all API-supported search filter tabs
1d76a5f fix(youtube-music): add spacing between search filter tabs and content
8160eff fix(youtube-music): remove duplicate Musicas section from search Tudo tab — already in TopResultSection
292ef50 feat(youtube-music): add top result card to search results page
c7e7d6e feat(youtube-music): add search results page with filter tabs
208e382 fix(youtube-music): search dropdown without Popover — no focus stealing, input works on first click
a16015b refactor(youtube-music): search as permanent input with dropdown in top bar — no separate page
55fb881 refactor(youtube-music): remove redundant MusicHeader, fix all pages to match explore structure, fix circular thumbnails
94e1f42 fix(youtube-music): top bar spacer has border-r matching side panel border
c5e164f feat(youtube-music): add top navigation bar with back/forward/search
7e27d58 fix(youtube-music): MediaGrid uses repeat(6,1fr) — same sizing as CarouselSection
8e06067 feat(youtube-music): add MediaGrid component — wrapping grid for library, reuses MediaCard
70b7d7a fix(youtube-music): library uses CarouselSection — same component as explore/home
86ea76f fix(youtube-music): library page matches explore page structure — same wrapper pattern
3693af3 fix(youtube-music): apply same grid layout to library page
63eb33c fix(youtube-music): CSS Grid repeat(6,1fr) with width max(100%,1020px) — fills space, overflows when narrow
```

---

## 11. Constantes Importantes

### InnerTube API (do ytmusicapi Python)

```
YTM_DOMAIN = "https://music.youtube.com"
YTM_BASE_API = "https://music.youtube.com/youtubei/v1/"
YTM_PARAMS_KEY = "&key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30"
```

### OAuth (MORTO — apenas referencia)

```
OAUTH_CLIENT_ID = "REDACTED_OAUTH_CLIENT_ID"
OAUTH_CLIENT_SECRET = "REDACTED_OAUTH_SECRET"
```

### Tauri Config

```
identifier: "com.singularhaven.app"
dev port: 1430
window: 1200x800 (min 800x600)
```

---

## 12. Como Rodar

```bash
# Dev com hot reload
npm run tauri dev

# Build de producao
npm run tauri build

# Testar API com cookies reais (CLI)
cd src-tauri && cargo run --bin api_test
```

---

## 13. Branch e Remote

- Branch atual: `master`
- Branch principal: `main`
- Ultimo commit: `7f07f55` (remove OAuth from login screen)
- Arquivos modificados nao commitados: `package-lock.json`, `src-tauri/Cargo.toml`
- Arquivo untracked: `src-tauri/Cargo.lock`
