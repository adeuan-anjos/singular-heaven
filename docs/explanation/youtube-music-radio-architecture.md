# YouTube Music — Arquitetura de Rádio (Iniciar Rádio)

## Visão geral

O rádio é uma fila de reprodução gerada por recomendações do YouTube Music,
acionada a partir de uma música, playlist, álbum ou artista. Diferentemente
de uma playlist fixa, a fila do rádio cresce sob demanda via continuation
tokens do endpoint InnerTube `next`.

**Princípio central: demand-driven.** O backend busca faixas do YouTube
apenas quando o usuário demanda — rolar a fila ou chegar perto do fim
natural de reprodução. Nunca carrega o pool inteiro de uma só vez.

## Pontos de entrada

| Origem | Seed enviado ao backend | Tipo |
|---|---|---|
| Menu de contexto de faixa | `videoId` da faixa | `"video"` |
| Menu de contexto de playlist (sidebar ou página) | `videoId` da primeira faixa | `"video"` |
| Menu de contexto de álbum | `videoId` da primeira faixa | `"video"` |
| Botão "Rádio" na página do artista | `artist.radioId` (é um videoId especial) | `"artist"` |

Para playlist e álbum, o frontend resolve a primeira faixa localmente (via
cache ou `resolvePlaylistPlayback`) antes de chamar o backend — o backend
sempre recebe um `videoId` como seed.

## Fluxo: do clique à reprodução

```
Usuário clica "Iniciar rádio" (qualquer surface)
  │
  ├─→ Frontend: onStartRadio({ kind: "video", id: "abc123" })
  │     └─→ handleStartRadio() — index.tsx
  │           ├─→ ytRadioStart("video", "abc123")
  │           │     └─→ invoke("yt_radio_start", { seedKind, seedId })
  │           │           ├─→ get_watch_playlist(WatchPlaylistRequest::for_video_radio("abc123", 50))
  │           │           │     ├─→ POST InnerTube /next (body com params="wAEB")
  │           │           │     └─→ Retorna ~50 faixas + continuation token
  │           │           ├─→ queue.set_queue(track_ids, 0, None, !has_more, false)
  │           │           ├─→ queue.set_radio_state(RadioState { seed, continuation, ... })
  │           │           ├─→ Cache no SQLite (save_collection_tracks)
  │           │           └─→ Retorna QueueCommandResponse + emit queue-state-updated
  │           ├─→ queueSyncSnapshot(response.snapshot) — isRadio=true
  │           └─→ playerPlay(firstTrackId)
  │
  └─→ Música começa a tocar. Fila tem ~50 faixas.
```

## Continuation sob demanda

O rádio cresce a fila por dois triggers independentes:

### 1. Scroll na fila (demand-driven, síncrono)

```
Usuário abre a queue sheet e rola até o fim
  │
  ├─→ queue-sheet.tsx: terminalRowType === "loading" && isRadio
  │     └─→ useEffect dispara loadMoreRadio()
  │           └─→ ytRadioLoadMore()
  │                 └─→ invoke("yt_radio_load_more")
  │                       ├─→ get_watch_playlist_continuation(token, is_playlist)
  │                       ├─→ queue.append_radio_batch(new_track_ids)
  │                       ├─→ Atualiza RadioState (novo token, loaded_count)
  │                       ├─→ Cache no SQLite
  │                       └─→ Retorna QueueCommandResponse (snapshot atualizado)
  │
  └─→ Frontend aplica snapshot, UI mostra +49 faixas. Sem evento extra.
```

**Uma chamada por scroll-to-bottom.** Guard `loadMoreInflight` previne duplicação.

### 2. Fim natural da faixa (background, assíncrono)

```
Player: track termina
  │
  └─→ yt_queue_handle_track_end
        ├─→ queue.handle_track_end() → próxima faixa
        └─→ Se radio_state.is_some() && remaining <= 2 && !exhausted:
              └─→ tokio::spawn(continue_radio_background(app))
                    ├─→ get_watch_playlist_continuation(token, is_playlist)
                    ├─→ queue.append_radio_batch(new_track_ids)
                    ├─→ emit("radio-extended", snapshot)
                    └─→ Frontend listener aplica snapshot
```

**Uma chamada por track-end.** Guard `fetching: bool` em `RadioState` previne corrida com scroll.

## Re-roll (shuffle em modo rádio)

O botão de shuffle tem comportamento especial em modo rádio:

1. **Mantém a faixa atual tocando** sem interrupção.
2. **Descarta** todas as faixas depois da atual (`truncate_after_current`).
3. **Refaz uma chamada** ao mesmo seed, obtendo novas recomendações.
4. **Insere** as novas faixas depois da atual (`append_radio_batch`).
5. **Filtra** a faixa atual da resposta para evitar duplicação.

O ícone de shuffle **não fica aceso** — é um botão de ação, não um toggle.

## Estado do backend

```rust
pub struct RadioState {
    pub seed: RadioSeed,           // { kind: Video|Playlist|Album|Artist, id: String }
    pub continuation: Option<String>,  // token opaco para próxima página
    pub pool_exhausted: bool,      // true quando a API parou de retornar
    pub loaded_count: usize,       // faixas acumuladas
    pub fetching: bool,            // guard de in-flight
}
```

`RadioState` vive dentro de `PlaybackQueue` como `Option<RadioState>`.
Quando `Some`, a queue está em modo rádio. Resetada para `None` quando:
- O usuário toca outra playlist/álbum/música via `set_queue`
- O usuário limpa a fila via `clear`

## Saída do modo rádio

Qualquer chamada a `yt_queue_set` (que o frontend faz ao tocar outra coisa)
automaticamente limpa `radio_state`. O `QueueSnapshot.isRadio` volta a `false`,
o badge no player bar some, e o botão de shuffle volta ao comportamento normal.

## Limites e proteções

| Proteção | Valor | Onde |
|---|---|---|
| Cap de faixas na queue | 2000 (MAX_RADIO_QUEUE_SIZE) | playback_queue.rs |
| Cap de páginas por chamada | 40 (MAX_WATCH_PAGES) | api/watch.rs |
| Percent-encoding do continuation token | RFC 3986 | api/watch.rs |
| Guard de in-flight | `RadioState.fetching` | commands.rs |
| Guard de frontend | `loadMoreInflight` | queue-store.ts |
| Throttle entre trigger scroll/track-end | um fetch por vez, sem timer | — |

## Memória e cache

- **Queue em memória**: `PlaybackQueue.playback_items` (Vec de `{item_id, video_id}`).
  Cada entry ~80 bytes. 2000 entries ≈ 160 KB. Negligível.
- **SQLite cache**: `collection_tracks` com `collection_type="radio"`.
  Acumulativo — nunca é purgado automaticamente.
  Tech debt: adicionar TTL ou purge on `clear_radio` no futuro.
- **L1 track cache (frontend)**: LRU com teto de 2000 entries.
  Rádio não requer mudança — o cache já evicta por LRU.
- **Thumbnails**: baixadas sob demanda pelo custom protocol `thumb://`.
  Cache em disco. Não afetadas pela feature de rádio.

## Endpoint InnerTube

O rádio usa o endpoint `next` da InnerTube API (mesmo endpoint de "A seguir"):

```
POST https://music.youtube.com/youtubei/v1/next?key=...
Body: {
  "enablePersistentPlaylistPanel": true,
  "isAudioOnly": true,
  "tunerSettingValue": "AUTOMIX_SETTING_NORMAL",
  "videoId": "<seed>",
  "playlistId": "RDAMVM<seed>",
  "params": "wAEB"  // ativa modo rádio
}
```

Cada página retorna ~49 faixas + um continuation token. O pool total por
seed é de ~1700 faixas (cap natural do YouTube), mas na prática o guard
de 2000 é atingido antes.

Continuations usam query params:
```
POST .../next?ctoken=<tok>&continuation=<tok>&type=nextRadio&key=...
```

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `crates/ytmusic-api/src/api/watch.rs` | `get_watch_playlist` + `get_watch_playlist_continuation` |
| `crates/ytmusic-api/src/parsers/watch.rs` | Parse de tracks + continuation tokens |
| `crates/ytmusic-api/src/types/watch.rs` | `WatchPlaylistRequest`, `WatchPlaylist`, `WatchTrack` |
| `src-tauri/src/playback_queue.rs` | `RadioState`, `append_radio_batch`, `truncate_after_current` |
| `src-tauri/src/youtube_music/commands.rs` | `yt_radio_start`, `yt_radio_reroll`, `yt_radio_load_more`, `continue_radio_background` |
| `src/modules/youtube-music/stores/queue-store.ts` | `isRadio`, `loadMoreRadio`, `toggleShuffle` → re-roll |
| `src/modules/youtube-music/components/queue/queue-sheet.tsx` | Trigger de `loadMoreRadio` via `useEffect` |
| `src/modules/youtube-music/components/layout/player-bar.tsx` | Badge "Rádio" condicional |

## Doc relacionada

- [youtube-music-playback-architecture.md](youtube-music-playback-architecture.md) — arquitetura geral de reprodução e queue
- [youtube-music-track-collections.md](youtube-music-track-collections.md) — coleções reproduzíveis e cache
- [youtube-music-playlist-management.md](youtube-music-playlist-management.md) — gestão de playlists (menção ao rádio)
- [memory-optimization.md](memory-optimization.md) — constraints de memória do app
