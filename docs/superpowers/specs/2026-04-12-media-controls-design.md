# Integração com Media Controls Nativos do SO

**Data**: 2026-04-12
**Escopo**: Media keys + Now Playing overlay com controles interativos

## Contexto

O player do Haven Sounds já tem play/pause/next/previous implementados via Zustand + Tauri commands, mas não responde a media keys do teclado nem integra com o overlay de mídia do SO.

## Solução

Usar `tauri-plugin-media` (Taiizor) para integrar com a sessão de mídia nativa de cada SO:
- **Windows**: System Media Transport Controls (overlay + media keys)
- **macOS**: MPNowPlayingInfoCenter (Now Playing + media keys)
- **Linux**: MPRIS D-Bus (widget KDE/GNOME + media keys)

## Arquitetura

```
SO Media Session ←→ tauri-plugin-media (Rust) ←→ media-session-bridge.ts ←→ Zustand stores
```

### Fluxo de entrada (media key/overlay → app)
1. Usuário pressiona media key ou clica no overlay do SO
2. Plugin emite evento para o frontend
3. `media-session-bridge.ts` despacha para stores existentes (togglePlay, next, previous)

### Fluxo de saída (app → overlay do SO)
1. Track muda → bridge observa player-store e queue-store via subscribe
2. Bridge chama updateNowPlaying() com metadata (título, artista, álbum, artwork, duração, posição)
3. SO atualiza overlay nativo

## Componentes

### 1. Plugin Setup (Rust)
- Adicionar `tauri-plugin-media` ao Cargo.toml
- Registrar `.plugin(tauri_plugin_media::init())` no main.rs
- Configurar permissions em capabilities

### 2. Plugin Setup (JS)
- Instalar `tauri-plugin-media-api`

### 3. media-session-bridge.ts (novo)
- Localização: `src/modules/youtube-music/services/media-session-bridge.ts`
- Responsabilidades:
  - `initMediaSession()`: inicializa plugin com app ID
  - `syncNowPlaying(track, playbackInfo)`: envia metadata ao SO
  - `clearMediaSession()`: limpa ao parar/desmontar
  - Escuta eventos do SO (play, pause, next, prev) e despacha para stores
  - Subscribe no player-store para atualizar posição em tempo real

### 4. Integração no módulo
- Inicializar bridge quando módulo youtube-music monta
- Desmontar/limpar quando módulo desmonta (regra de módulos inativos)
- Atualizar metadata sempre que track mudar

## Tipos

```typescript
interface MediaMetadata {
  title: string
  artist?: string
  album?: string
  artworkUrl?: string
  duration?: number
}

enum PlaybackStatus {
  Playing = 'playing',
  Paused = 'paused',
  Stopped = 'stopped',
}
```

## Plataformas
- Windows, macOS, Linux — multiplataforma desde o início
