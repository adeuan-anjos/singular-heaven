# Media Controls Nativos do SO - Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar o player do Haven Sounds com a sessão de mídia nativa do SO (Windows/macOS/Linux) para responder a media keys e mostrar metadata no overlay.

**Architecture:** `tauri-plugin-media` registra uma sessão de mídia nativa. Um bridge service (`media-session-bridge.ts`) observa as stores Zustand e sincroniza metadata/playback state com o SO. Eventos do SO (media keys, overlay clicks) são despachados de volta para as stores existentes.

**Tech Stack:** tauri-plugin-media 0.1.1 (Rust) + tauri-plugin-media-api (JS) + Zustand subscribers

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src-tauri/Cargo.toml` | Adicionar dep `tauri-plugin-media` |
| Modify | `src-tauri/src/lib.rs` | Registrar plugin no builder |
| Create | `src-tauri/capabilities/media.json` | Permissions do plugin |
| Modify | `package.json` | Adicionar dep `tauri-plugin-media-api` |
| Create | `src/modules/youtube-music/services/media-session-bridge.ts` | Bridge bidirecional SO <-> stores |
| Modify | `src/modules/youtube-music/index.tsx` | Inicializar/limpar bridge no lifecycle do módulo |

---

### Task 1: Instalar dependências Rust

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Adicionar dep ao Cargo.toml**

Em `src-tauri/Cargo.toml`, na seção `[dependencies]`, adicionar:

```toml
tauri-plugin-media = "0.1"
```

- [ ] **Step 2: Registrar plugin no builder**

Em `src-tauri/src/lib.rs`, logo após `.plugin(tauri_plugin_opener::init())` (linha ~105), adicionar:

```rust
.plugin(tauri_plugin_media::init())
```

- [ ] **Step 3: Verificar compilação**

Run: `cd src-tauri && cargo check`
Expected: compilação sem erros

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs
git commit -m "feat: add tauri-plugin-media dependency and register plugin"
```

---

### Task 2: Configurar permissions e instalar JS

**Files:**
- Create: `src-tauri/capabilities/media.json`
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Criar capability file**

Criar `src-tauri/capabilities/media.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "media-controls",
  "description": "Media session controls for OS integration",
  "windows": ["main"],
  "permissions": [
    "media:default"
  ]
}
```

- [ ] **Step 2: Instalar pacote JS**

Run: `npm install tauri-plugin-media-api`

Se o pacote não existir no npm, verificar nome correto no README do plugin:
- Alternativas: `@anthropic/tauri-plugin-media-api`, `tauri-plugin-media-api`
- Se nenhum funcionar, o plugin pode expor via `@tauri-apps/api/core` invoke direto

- [ ] **Step 3: Verificar que o dev server inicia**

Run: `npm run tauri dev`
Expected: app abre sem erros de permission

- [ ] **Step 4: Commit**

```bash
git add src-tauri/capabilities/media.json package.json package-lock.json
git commit -m "feat: configure media plugin permissions and install JS API"
```

---

### Task 3: Criar media-session-bridge.ts

**Files:**
- Create: `src/modules/youtube-music/services/media-session-bridge.ts`

Este é o arquivo principal. Responsabilidades:
1. Inicializar sessão de mídia com o SO
2. Escutar eventos do SO (play, pause, next, prev) e despachar para stores
3. Observar mudanças de track/playback e sincronizar metadata com o SO

- [ ] **Step 1: Criar o bridge**

Criar `src/modules/youtube-music/services/media-session-bridge.ts`:

```typescript
import { mediaControls } from "tauri-plugin-media-api";
import { usePlayerStore } from "../stores/player-store";
import { useQueueStore } from "../stores/queue-store";
import { useTrackCacheStore } from "../stores/track-cache-store";
import type { Track } from "../types/music";

const LOG_TAG = "[MediaSessionBridge]";

/** Unsubscribe handles for cleanup */
let unsubPlayer: (() => void) | null = null;
let positionInterval: ReturnType<typeof setInterval> | null = null;
let initialized = false;

/**
 * Maps a Track to the metadata format expected by the OS media session.
 */
function buildMetadata(track: Track) {
  // Use highest-res thumbnail (last in array) for the OS overlay artwork
  const artwork = track.thumbnails.length > 0
    ? track.thumbnails[track.thumbnails.length - 1]
    : null;

  return {
    title: track.title,
    artist: track.artists.map((a) => a.name).join(", "),
    album: track.album?.name ?? "",
    artworkUrl: artwork?.url ?? "",
    duration: track.durationSeconds,
  };
}

/**
 * Sync current track metadata + playback state to the OS media session.
 */
function syncNowPlaying(track: Track, isPlaying: boolean, progress: number) {
  const metadata = buildMetadata(track);

  console.debug(LOG_TAG, "syncNowPlaying", {
    title: metadata.title,
    artist: metadata.artist,
    isPlaying,
    progress,
  });

  void mediaControls.updateNowPlaying(metadata, {
    status: isPlaying ? "playing" : "paused",
    position: progress,
    shuffle: false,
    repeatMode: "none",
    playbackRate: 1.0,
  });
}

/**
 * Handle OS media session events (media keys, overlay button clicks).
 * Dispatches to the existing Zustand stores — same code path as UI buttons.
 */
function handleMediaEvent(event: string) {
  console.debug(LOG_TAG, "received OS event", { event });

  const playerState = usePlayerStore.getState();
  const queueStore = useQueueStore.getState();
  const play = playerState.play;

  switch (event) {
    case "play":
    case "pause":
    case "toggle": {
      playerState.togglePlay();
      break;
    }
    case "next": {
      void queueStore.next().then((nextId) => {
        if (nextId) play(nextId);
      });
      break;
    }
    case "previous": {
      // Same logic as player-bar: if progress > 3s, seek to start; else prev track
      if (playerState.progress > 3) {
        playerState.seek(0);
      } else {
        void queueStore.previous().then((prevId) => {
          if (prevId) play(prevId);
        });
      }
      break;
    }
    case "stop": {
      playerState.cleanup();
      void mediaControls.clearNowPlaying();
      break;
    }
    default:
      console.warn(LOG_TAG, "unhandled OS media event", { event });
  }
}

/**
 * Initialize the media session bridge.
 * Call this once when the youtube-music module mounts.
 */
export async function initMediaSession(): Promise<void> {
  if (initialized) {
    console.warn(LOG_TAG, "already initialized, skipping");
    return;
  }

  try {
    console.log(LOG_TAG, "initializing media session");
    await mediaControls.initialize("com.singular.haven", "Haven Sounds");

    // TODO: Register event listener for OS media events.
    // The exact API depends on how tauri-plugin-media exposes callbacks.
    // If it uses Tauri events:
    //   import { listen } from "@tauri-apps/api/event";
    //   await listen("media://event", (e) => handleMediaEvent(e.payload));
    // If it uses a callback-based API:
    //   mediaControls.onEvent(handleMediaEvent);
    // We'll wire this based on the actual plugin API at integration time.

    initialized = true;
    console.log(LOG_TAG, "media session initialized");
  } catch (err) {
    console.error(LOG_TAG, "failed to initialize media session", err);
    return;
  }

  // Subscribe to player store — sync metadata when track or playback state changes
  let prevTrackId: string | null = null;

  unsubPlayer = usePlayerStore.subscribe((state) => {
    const { currentTrackId, isPlaying, progress } = state;

    if (!currentTrackId) {
      // No track playing — clear OS overlay
      if (prevTrackId !== null) {
        console.debug(LOG_TAG, "no track playing, clearing now playing");
        void mediaControls.clearNowPlaying();
        prevTrackId = null;
      }
      return;
    }

    const track = useTrackCacheStore.getState().getTrack(currentTrackId);
    if (!track) {
      console.warn(LOG_TAG, "track not in cache", { currentTrackId });
      return;
    }

    const trackChanged = currentTrackId !== prevTrackId;
    if (trackChanged) {
      prevTrackId = currentTrackId;
      syncNowPlaying(track, isPlaying, 0);
      console.log(LOG_TAG, "track changed, synced metadata", { title: track.title });
    }

    // isPlaying changed without track change — update status only
    if (!trackChanged) {
      syncNowPlaying(track, isPlaying, progress);
    }
  });

  // Update position periodically (every 5s) to keep OS progress bar in sync
  // Uses getState() to avoid triggering store re-renders
  positionInterval = setInterval(() => {
    const { currentTrackId, isPlaying, progress } = usePlayerStore.getState();
    if (!currentTrackId || !isPlaying) return;

    const track = useTrackCacheStore.getState().getTrack(currentTrackId);
    if (!track) return;

    void mediaControls.updatePosition(progress);
  }, 5000);
}

/**
 * Teardown the media session bridge.
 * Call this when the youtube-music module unmounts.
 */
export async function destroyMediaSession(): Promise<void> {
  console.log(LOG_TAG, "destroying media session");

  if (unsubPlayer) {
    unsubPlayer();
    unsubPlayer = null;
  }

  if (positionInterval) {
    clearInterval(positionInterval);
    positionInterval = null;
  }

  if (initialized) {
    try {
      await mediaControls.clearNowPlaying();
    } catch (err) {
      console.error(LOG_TAG, "failed to clear now playing on destroy", err);
    }
    initialized = false;
  }
}
```

- [ ] **Step 2: Verificar tipo do import**

Se `tauri-plugin-media-api` não exporta `mediaControls`, adaptar o import.
Pode ser: `import { mediaControls } from "tauri-plugin-media-api"` ou `import mediaControls from "..."`.

Verificar no `node_modules/tauri-plugin-media-api` a exportação real.

- [ ] **Step 3: Commit**

```bash
git add src/modules/youtube-music/services/media-session-bridge.ts
git commit -m "feat: create media session bridge for OS media controls integration"
```

---

### Task 4: Integrar bridge no lifecycle do módulo

**Files:**
- Modify: `src/modules/youtube-music/index.tsx` (~linhas 93-142)

- [ ] **Step 1: Importar bridge**

No topo de `src/modules/youtube-music/index.tsx`, adicionar:

```typescript
import { initMediaSession, destroyMediaSession } from "./services/media-session-bridge";
```

- [ ] **Step 2: Inicializar no mount**

No `useEffect` de mount (linha ~93), após `void queueHydrate();`, adicionar:

```typescript
void initMediaSession();
```

- [ ] **Step 3: Limpar no unmount**

Na cleanup function do `useEffect` (linha ~134), antes de `playerCleanup()`, adicionar:

```typescript
void destroyMediaSession();
```

O bloco de cleanup ficará:

```typescript
return () => {
  cancelled = true;
  console.log("[YouTubeMusicModule] unmounting — cleaning up stores");
  void destroyMediaSession();
  playerCleanup();
  void queueCleanup();
  playlistLibraryClear();
  trackCacheClear();
  trackLikesClear();
};
```

- [ ] **Step 4: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: sem erros de tipo

- [ ] **Step 5: Commit**

```bash
git add src/modules/youtube-music/index.tsx
git commit -m "feat: wire media session bridge into youtube-music module lifecycle"
```

---

### Task 5: Teste end-to-end e ajuste da API de eventos

**Files:**
- Possibly modify: `src/modules/youtube-music/services/media-session-bridge.ts`

- [ ] **Step 1: Iniciar app em dev**

Run: `npm run tauri dev`
Expected: app abre sem erros no console

- [ ] **Step 2: Tocar uma música**

1. Navegar ao módulo YouTube Music
2. Tocar qualquer música
3. Verificar no console: `[MediaSessionBridge] track changed, synced metadata`

- [ ] **Step 3: Verificar overlay do SO**

- **Windows**: Pressionar uma media key ou abrir Volume Mixer — deve mostrar "Haven Sounds" com metadata
- **Linux**: Verificar widget MPRIS no painel
- **macOS**: Verificar Now Playing no Control Center

- [ ] **Step 4: Testar media keys**

1. Pressionar Play/Pause media key → player deve pausar/resumir
2. Pressionar Next media key → deve pular para próxima
3. Pressionar Previous media key → deve voltar (ou restart se progress > 3s)

- [ ] **Step 5: Ajustar API de eventos se necessário**

O plugin pode expor eventos de 3 formas possíveis:
1. Tauri events: `listen("media://event", callback)`
2. Callback API: `mediaControls.onEvent(callback)`
3. Tauri commands retornando para o Rust que emite events

Verificar a API real no código do plugin instalado (`node_modules/tauri-plugin-media-api`) e adaptar `handleMediaEvent` + a seção TODO em `initMediaSession`.

- [ ] **Step 6: Testar overlay buttons**

1. Clicar Play/Pause no overlay do SO → mesmo efeito que media key
2. Clicar Next/Previous no overlay → mesmo efeito

- [ ] **Step 7: Verificar cleanup**

1. Trocar para outro módulo (desmontar youtube-music)
2. Verificar que media keys param de responder
3. Verificar que overlay do SO limpa

- [ ] **Step 8: Commit final**

```bash
git add -u
git commit -m "feat: finalize OS media controls integration with event handling"
```
