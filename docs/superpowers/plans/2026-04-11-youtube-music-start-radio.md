# YouTube Music — Iniciar Rádio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar a feature "Iniciar rádio" do YouTube Music, com continuation sob demanda, re-roll via botão shuffle, e entry points em música/playlist/álbum/artista.

**Architecture:** Backend-first. O crate `ytmusic-api` ganha suporte ao endpoint real com continuation loop. `PlaybackQueue` ganha um `radio_state` opcional. Dois comandos Tauri novos (`yt_radio_start`, `yt_radio_reroll`) e continuation disparada em background pelo próprio `yt_queue_handle_track_end`. Frontend é fino: um service, uma flag `isRadio` no store, e botões de entrada.

**Tech Stack:** Rust (`crates/ytmusic-api`, `src-tauri`), React 19 + TypeScript + Zustand, Tauri 2.0, shadcn/ui.

**Spec de referência:** `docs/superpowers/specs/2026-04-11-youtube-music-start-radio-design.md`

**Commit base:** `d59bca0` (spec) — todos os commits deste plano vão em cima deste.

---

## File Structure

### Arquivos novos

- `crates/ytmusic-api/src/types/watch.rs` — estende `WatchPlaylist`/`WatchTrack` (mesmo arquivo, não novo)
- nenhum arquivo realmente novo; reuso máximo

### Arquivos modificados

| Arquivo | Responsabilidade |
|---|---|
| `crates/ytmusic-api/src/api/watch.rs`          | Nova assinatura + continuation loop |
| `crates/ytmusic-api/src/types/watch.rs`        | `WatchPlaylistRequest`, campos novos em `WatchTrack` |
| `crates/ytmusic-api/src/parsers/watch.rs`      | Extrair `continuation`, `like_status`, `video_type`, `views` |
| `crates/ytmusic-api/src/error.rs`              | (checar) talvez adicionar `Error::Validation` se não existir |
| `src-tauri/src/playback_queue.rs`              | `RadioState`, reset em `set_queue`, getters |
| `src-tauri/src/youtube_music/commands.rs`      | `yt_radio_start`, `yt_radio_reroll`, hook no `yt_queue_handle_track_end` |
| `src-tauri/src/lib.rs`                         | Registrar os 2 comandos novos no `invoke_handler` |
| `src/modules/youtube-music/services/yt-api.ts` | `ytRadioStart`, `ytRadioReroll`, tipo `RadioSeedKind` |
| `src/modules/youtube-music/stores/queue-store.ts` | Campo `isRadio`, `toggleShuffle` ramificado |
| `src/modules/youtube-music/router/actions-context.tsx` | `onStartRadio` |
| `src/modules/youtube-music/index.tsx` | `handleStartRadio` (implementação do `onStartRadio`) |
| `src/modules/youtube-music/components/pages/artist-page.tsx` | Conectar botão existente |
| `src/modules/youtube-music/components/pages/playlist-page.tsx` | Item "Iniciar rádio" no menu |
| `src/modules/youtube-music/components/pages/album-page.tsx` | Item "Iniciar rádio" no menu |
| Menu de contexto de faixa (investigar no Task 15) | Item "Iniciar rádio" |

---

## Pre-flight: referências que ficam abertas durante todo o trabalho

O source da lib Python `ytmusicapi` é a referência canônica. Para abrir:

```bash
python -c "import inspect, ytmusicapi.mixins.watch as w; print(inspect.getsourcefile(w))"
# Abrir o arquivo retornado num editor separado ou via Read tool.
```

Os dois métodos-chave são:
- `WatchMixin.get_watch_playlist` — montagem de body e loop de continuation
- `ytmusicapi.parsers.watch.parse_watch_playlist` — parser de items
- `ytmusicapi.continuations.get_continuations` — como continuation tokens são iterados

Use-os como fonte da verdade quando dúvidas surgirem sobre formato de payload.

JSON de fixture empírico já capturado em `tmp/radio_results/` (testes de exploração inicial). Pode usar para testes de parser offline.

---

## Phase 1 — Crate ytmusic-api: tipos

Nada compilando ainda mexe até Task 2, então Task 1 fica limpo.

### Task 1: Estender `WatchPlaylistRequest` e tipos de watch

**Files:**
- Modify: `crates/ytmusic-api/src/types/watch.rs`

- [ ] **Step 1: Ler o arquivo atual para ver estrutura e imports**

```bash
# verificar conteúdo atual
```
Ler `crates/ytmusic-api/src/types/watch.rs`. Hoje ele tem `WatchPlaylist`, `WatchTrack`, `Lyrics`. Vamos estender.

- [ ] **Step 2: Substituir o conteúdo do arquivo pelo novo**

Conteúdo final de `crates/ytmusic-api/src/types/watch.rs`:

```rust
use serde::Serialize;
use super::common::{Thumbnail, ArtistRef, AlbumRef};
use super::common::LikeStatus;

/// Tipo do seed a partir do qual o rádio é gerado.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WatchSeedKind {
    Video,
    Playlist,
}

/// Requisição para `get_watch_playlist`. Reflete os parâmetros de
/// `ytmusicapi.WatchMixin.get_watch_playlist` em Python.
#[derive(Debug, Clone)]
pub struct WatchPlaylistRequest<'a> {
    pub video_id: Option<&'a str>,
    pub playlist_id: Option<&'a str>,
    pub radio: bool,
    pub shuffle: bool,
    /// Número mínimo de faixas a retornar; o loop de continuation pára quando atinge.
    pub limit: usize,
}

impl<'a> WatchPlaylistRequest<'a> {
    pub fn for_video_radio(video_id: &'a str, limit: usize) -> Self {
        Self {
            video_id: Some(video_id),
            playlist_id: None,
            radio: true,
            shuffle: false,
            limit,
        }
    }

    pub fn for_playlist_radio(playlist_id: &'a str, limit: usize) -> Self {
        Self {
            video_id: None,
            playlist_id: Some(playlist_id),
            radio: true,
            shuffle: false,
            limit,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchPlaylist {
    pub tracks: Vec<WatchTrack>,
    /// Token de continuation opaco para próxima página. `None` quando o pool esgotou.
    pub continuation: Option<String>,
    pub lyrics_browse_id: Option<String>,
    pub related_browse_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchTrack {
    pub title: String,
    pub video_id: String,
    pub artists: Vec<ArtistRef>,
    pub album: Option<AlbumRef>,
    /// Duração como string no formato "M:SS" — a API chama isso de `lengthText`.
    pub length: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
    pub like_status: Option<LikeStatus>,
    pub video_type: Option<String>,
    pub views: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Lyrics {
    pub text: String,
    pub source: Option<String>,
}
```

Atenção: o tipo `LikeStatus` já existe em `crates/ytmusic-api/src/types/common.rs` (o `client.rs` de `src-tauri` importa dele). Se o `use` falhar porque `common::LikeStatus` não existe, procurar onde `LikeStatus` é definido (grep `pub enum LikeStatus`) e ajustar o `use`.

- [ ] **Step 3: Compilar o crate para ver os erros em watch.rs**

Run: `cargo check -p ytmusic-api`
Expected: falhas compiláveis em `api/watch.rs` e `parsers/watch.rs` — esses arquivos usam o tipo antigo. Isso é esperado. Serão corrigidos nas Tasks 2 e 3.

- [ ] **Step 4: Commit**

```bash
git add crates/ytmusic-api/src/types/watch.rs
git commit -m "$(cat <<'EOF'
Extend WatchPlaylist types for radio mode

Add WatchPlaylistRequest (mirrors the Python ytmusicapi parameters),
continuation token on WatchPlaylist, and the extra fields the parser
will populate (length, like_status, video_type, views).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Atualizar parser `parsers/watch.rs` para extrair continuation e campos novos

**Files:**
- Modify: `crates/ytmusic-api/src/parsers/watch.rs`

Referência Python: `ytmusicapi.parsers.watch.parse_watch_playlist` (leitura recomendada antes de começar).

- [ ] **Step 1: Adicionar função `extract_continuation_token`**

Adicione (no final da seção de helpers do arquivo, antes ou depois das funções existentes):

```rust
/// Extrai o próximo continuation token de um `playlistPanelRenderer` ou de uma
/// `playlistPanelContinuation`. Retorna `None` se não houver mais páginas.
fn extract_continuation_token(container: &Value) -> Option<String> {
    let continuations = container.get("continuations").and_then(|c| c.as_array())?;
    for cont in continuations {
        if let Some(token) = cont
            .get("nextContinuationData")
            .and_then(|n| n.get("continuation"))
            .and_then(|c| c.as_str())
        {
            return Some(token.to_string());
        }
        if let Some(token) = cont
            .get("nextRadioContinuationData")
            .and_then(|n| n.get("continuation"))
            .and_then(|c| c.as_str())
        {
            return Some(token.to_string());
        }
    }
    None
}
```

- [ ] **Step 2: Modificar `parse_watch_response` para retornar continuation**

Substituir `parse_watch_response` por:

```rust
pub fn parse_watch_response(response: &Value) -> Result<WatchPlaylist> {
    let tabs = nav_array(response, &[
        "contents", "singleColumnMusicWatchNextResultsRenderer",
        "tabbedRenderer", "watchNextTabbedResultsRenderer", "tabs",
    ]);

    let mut tracks = Vec::new();
    let mut continuation: Option<String> = None;

    if let Some(tab0) = tabs.first() {
        // Navega até o playlistPanelRenderer para pegar tanto contents quanto continuations
        let panel = tab0
            .get("tabRenderer")
            .and_then(|r| r.get("content"))
            .and_then(|c| c.get("musicQueueRenderer"))
            .and_then(|q| q.get("content"))
            .and_then(|c| c.get("playlistPanelRenderer"));

        if let Some(panel) = panel {
            if let Some(contents) = panel.get("contents").and_then(|c| c.as_array()) {
                for item in contents {
                    let renderer = item.get("playlistPanelVideoWrapperRenderer")
                        .and_then(|w| w.get("primaryRenderer"))
                        .and_then(|p| p.get("playlistPanelVideoRenderer"))
                        .or_else(|| item.get("playlistPanelVideoRenderer"));

                    if let Some(r) = renderer {
                        if let Some(track) = parse_watch_track(r) {
                            tracks.push(track);
                        }
                    }
                }
            }
            continuation = extract_continuation_token(panel);
        }
    }

    let lyrics_browse_id = tabs.get(1)
        .and_then(|t| nav_str(t, &[
            "tabRenderer", "endpoint", "browseEndpoint", "browseId",
        ]));

    let related_browse_id = tabs.get(2)
        .and_then(|t| nav_str(t, &[
            "tabRenderer", "endpoint", "browseEndpoint", "browseId",
        ]));

    Ok(WatchPlaylist { tracks, continuation, lyrics_browse_id, related_browse_id })
}
```

- [ ] **Step 3: Adicionar `parse_watch_continuation_response` para respostas de continuation**

Respostas de continuation têm shape diferente — o top-level é `continuationContents.playlistPanelContinuation` em vez de `contents.singleColumnMusicWatchNextResultsRenderer...`.

Adicionar (pode ser logo após `parse_watch_response`):

```rust
/// Parser para respostas de continuation do endpoint `next`. O root é
/// `continuationContents.playlistPanelContinuation` em vez do wrapper de tabs.
pub fn parse_watch_continuation_response(response: &Value) -> Result<WatchPlaylist> {
    let panel = response
        .get("continuationContents")
        .and_then(|c| c.get("playlistPanelContinuation"));

    let mut tracks = Vec::new();
    let mut continuation: Option<String> = None;

    if let Some(panel) = panel {
        if let Some(contents) = panel.get("contents").and_then(|c| c.as_array()) {
            for item in contents {
                let renderer = item.get("playlistPanelVideoWrapperRenderer")
                    .and_then(|w| w.get("primaryRenderer"))
                    .and_then(|p| p.get("playlistPanelVideoRenderer"))
                    .or_else(|| item.get("playlistPanelVideoRenderer"));

                if let Some(r) = renderer {
                    if let Some(track) = parse_watch_track(r) {
                        tracks.push(track);
                    }
                }
            }
        }
        continuation = extract_continuation_token(panel);
    }

    Ok(WatchPlaylist {
        tracks,
        continuation,
        lyrics_browse_id: None,
        related_browse_id: None,
    })
}
```

- [ ] **Step 4: Estender `parse_watch_track` para popular novos campos**

Substituir a função `parse_watch_track` inteira por:

```rust
fn parse_watch_track(renderer: &Value) -> Option<WatchTrack> {
    let title = nav_str(renderer, &["title", "runs", "0", "text"])?;

    let video_id = renderer.get("videoId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_default();

    let length = nav_str(renderer, &["lengthText", "runs", "0", "text"]);

    let byline_runs = renderer.get("longBylineText")
        .and_then(|b| b.get("runs"))
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();

    let artists = parse_artists_from_runs(&byline_runs);
    let album = parse_album_from_runs(&byline_runs);

    let thumbnails = renderer.get("thumbnail")
        .and_then(|t| t.get("thumbnails"))
        .and_then(|t| t.as_array())
        .map(|arr| {
            arr.iter().map(|t| Thumbnail {
                url: t.get("url").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                width: t.get("width").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                height: t.get("height").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
            }).collect()
        })
        .unwrap_or_default();

    // LikeStatus via menu endpoint — segue o parser existente para tracks
    // (copiar de parsers/playlist.rs ou equivalente se já existir um helper).
    let like_status = parse_like_status_from_menu(renderer);

    let video_type = nav_str(renderer, &[
        "navigationEndpoint", "watchEndpoint", "watchEndpointMusicSupportedConfigs",
        "watchEndpointMusicConfig", "musicVideoType",
    ]);

    let views = nav_str(renderer, &["longBylineText", "runs", "last", "text"])
        .filter(|s| s.contains(" views") || s.contains("visual"));

    Some(WatchTrack { title, video_id, artists, album, length, thumbnails, like_status, video_type, views })
}

/// Extrai LikeStatus do menu buttons. Retorna `None` se não encontrar.
fn parse_like_status_from_menu(renderer: &Value) -> Option<crate::types::common::LikeStatus> {
    // ytmusicapi procura em menu.menuRenderer.items[] por um toggleMenuServiceItemRenderer
    // com defaultIcon.iconType == "FAVORITE" (liked) ou "INDIFFERENT". Simplificamos:
    let items = renderer
        .get("menu")
        .and_then(|m| m.get("menuRenderer"))
        .and_then(|r| r.get("items"))
        .and_then(|i| i.as_array())?;

    for item in items {
        if let Some(toggle) = item.get("toggleMenuServiceItemRenderer") {
            let icon = toggle
                .get("defaultIcon")
                .and_then(|i| i.get("iconType"))
                .and_then(|t| t.as_str())
                .unwrap_or("");
            if icon == "FAVORITE" {
                return Some(crate::types::common::LikeStatus::Indifferent);
            }
        }
    }
    None
}
```

Nota sobre `parse_like_status_from_menu`: é uma implementação mínima. Se o crate já tiver um helper equivalente (procurar por `parse_like_status` via grep), **usar o existente** em vez de criar duplicata. Este helper é só um fallback se não houver.

- [ ] **Step 5: Ajustar a importação de `Value` se o `nav_array` já traz**

No topo do arquivo, garantir que os imports cobrem `Value`:
```rust
use serde_json::Value;
```
Se já estiver, não mexer.

- [ ] **Step 6: Compilar**

Run: `cargo check -p ytmusic-api`
Expected: agora `parsers/watch.rs` deve compilar. Erros restantes em `api/watch.rs` — esperado, próxima task.

- [ ] **Step 7: Commit**

```bash
git add crates/ytmusic-api/src/parsers/watch.rs
git commit -m "$(cat <<'EOF'
Parse continuation tokens and extra WatchTrack fields

parse_watch_response now returns the continuation token from the
playlistPanelRenderer, and parse_watch_continuation_response handles
the different shape of continuation replies. WatchTrack gains
length (renamed from duration), like_status, video_type, and views.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Reescrever `api/watch.rs` com `WatchPlaylistRequest` e loop de continuation

**Files:**
- Modify: `crates/ytmusic-api/src/api/watch.rs`

Referência Python essencial: `WatchMixin.get_watch_playlist` (ler antes). A montagem do body está lá.

- [ ] **Step 1: Substituir o arquivo inteiro**

Novo conteúdo de `crates/ytmusic-api/src/api/watch.rs`:

```rust
use serde_json::json;

use crate::client::YtMusicClient;
use crate::constants::*;
use crate::error::{Error, Result};
use crate::parsers::watch::{parse_lyrics_response, parse_watch_continuation_response, parse_watch_response};
use crate::types::watch::{Lyrics, WatchPlaylist, WatchPlaylistRequest};

impl YtMusicClient {
    /// Get a watch or radio playlist.
    ///
    /// Port of `ytmusicapi.WatchMixin.get_watch_playlist` (Python reference).
    ///
    /// When `radio=true`, iterates continuation tokens until at least `limit`
    /// tracks are collected or the continuation stream ends. Logs progress at
    /// every step.
    pub async fn get_watch_playlist(&self, req: WatchPlaylistRequest<'_>) -> Result<WatchPlaylist> {
        println!(
            "[ytmusic-api] get_watch_playlist video_id={:?} playlist_id={:?} radio={} shuffle={} limit={}",
            req.video_id, req.playlist_id, req.radio, req.shuffle, req.limit
        );

        if req.video_id.is_none() && req.playlist_id.is_none() {
            return Err(Error::Api {
                message: "get_watch_playlist: provide video_id, playlist_id, or both".into(),
            });
        }
        if req.radio && req.shuffle {
            return Err(Error::Api {
                message: "get_watch_playlist: radio=true is incompatible with shuffle=true".into(),
            });
        }

        // ---- Montagem do body (match 1:1 com Python) ----
        let mut body = json!({
            "enablePersistentPlaylistPanel": true,
            "isAudioOnly": true,
            "tunerSettingValue": "AUTOMIX_SETTING_NORMAL",
        });

        // Compute playlist id (falls back to RDAMVM<videoId> when video is set alone).
        let effective_playlist_id: Option<String> = match (req.video_id, req.playlist_id) {
            (Some(vid), None) => {
                body["videoId"] = json!(vid);
                Some(format!("RDAMVM{vid}"))
            }
            (Some(vid), Some(pid)) => {
                body["videoId"] = json!(vid);
                Some(pid.to_string())
            }
            (None, Some(pid)) => Some(pid.to_string()),
            (None, None) => None, // já rejeitado acima
        };

        // watchEndpointMusicSupportedConfigs só em modo "normal watch" (sem radio/shuffle).
        if req.video_id.is_some() && !req.radio && !req.shuffle {
            body["watchEndpointMusicSupportedConfigs"] = json!({
                "watchEndpointMusicConfig": {
                    "hasPersistentPlaylistPanel": true,
                    "musicVideoType": "MUSIC_VIDEO_TYPE_ATV",
                }
            });
        }

        // `is_playlist` segue a convenção do Python: detecta prefixo PL ou OLA.
        let is_playlist = effective_playlist_id
            .as_deref()
            .map(|pid| pid.starts_with("PL") || pid.starts_with("OLA"))
            .unwrap_or(false);

        if let Some(ref pid) = effective_playlist_id {
            body["playlistId"] = json!(pid);
        }

        // params: radio/shuffle flags encoded.
        if req.shuffle && effective_playlist_id.is_some() {
            body["params"] = json!("wAEB8gECKAE%3D");
        }
        if req.radio {
            body["params"] = json!("wAEB");
        }

        println!("[ytmusic-api] get_watch_playlist request body keys: {:?}", body.as_object().map(|o| o.keys().collect::<Vec<_>>()));

        // ---- Primeira página ----
        let response = self.post_innertube(ENDPOINT_NEXT, body).await?;
        let mut result = parse_watch_response(&response)?;

        println!(
            "[ytmusic-api] get_watch_playlist first page: tracks={} has_continuation={}",
            result.tracks.len(),
            result.continuation.is_some()
        );

        // ---- Loop de continuation ----
        let mut pages = 1usize;
        while result.tracks.len() < req.limit {
            let Some(token) = result.continuation.clone() else {
                println!("[ytmusic-api] get_watch_playlist: continuation exhausted at {} tracks", result.tracks.len());
                break;
            };

            let cont_result = self
                .get_watch_playlist_continuation(&token, is_playlist)
                .await?;
            pages += 1;

            if cont_result.tracks.is_empty() && cont_result.continuation.is_none() {
                println!("[ytmusic-api] get_watch_playlist: continuation returned empty — stopping");
                break;
            }

            let added = cont_result.tracks.len();
            result.tracks.extend(cont_result.tracks);
            result.continuation = cont_result.continuation;

            println!(
                "[ytmusic-api] get_watch_playlist page {pages}: +{added} → {} total, has_next={}",
                result.tracks.len(),
                result.continuation.is_some()
            );
        }

        println!(
            "[ytmusic-api] get_watch_playlist returned: tracks={} pages={} lyrics={:?} related={:?}",
            result.tracks.len(), pages, result.lyrics_browse_id, result.related_browse_id
        );

        Ok(result)
    }

    /// Fetch a single continuation page. `is_playlist` controls the ctoken type
    /// that the Python lib calls "" vs "Radio" — playlists use no prefix,
    /// radios prefix with "Radio".
    pub async fn get_watch_playlist_continuation(
        &self,
        continuation: &str,
        is_playlist: bool,
    ) -> Result<WatchPlaylist> {
        println!(
            "[ytmusic-api] watch_continuation is_playlist={is_playlist} token={}…",
            &continuation[..continuation.len().min(12)]
        );

        // The continuation parameter is passed as query string (ctoken + continuation + type).
        // For radio streams, ytmusicapi appends "Radio" to the type. We build the URL variant
        // of post_innertube here because the base post_innertube takes a path and we need
        // extra query params.
        let ctype = if is_playlist { "" } else { "Radio" };
        let endpoint = format!(
            "{ENDPOINT_NEXT}?ctoken={continuation}&continuation={continuation}&type=next{ctype}"
        );

        let body = json!({
            "enablePersistentPlaylistPanel": true,
            "isAudioOnly": true,
            "tunerSettingValue": "AUTOMIX_SETTING_NORMAL",
        });

        let response = self.post_innertube(&endpoint, body).await?;
        let result = parse_watch_continuation_response(&response)?;
        println!(
            "[ytmusic-api] watch_continuation: +{} tracks, has_next={}",
            result.tracks.len(),
            result.continuation.is_some()
        );
        Ok(result)
    }

    /// Get lyrics for a song by its lyrics browse ID (e.g. "MPLYt_...").
    pub async fn get_lyrics(&self, browse_id: &str) -> Result<Lyrics> {
        println!("[ytmusic-api] get_lyrics(browse_id=\"{browse_id}\")");

        let body = json!({ "browseId": browse_id });
        let response = self.post_innertube(ENDPOINT_BROWSE, body).await?;
        let result = parse_lyrics_response(&response)?;

        println!(
            "[ytmusic-api] get_lyrics returned: text_len={} source={:?}",
            result.text.len(), result.source
        );

        Ok(result)
    }
}
```

**Nota crítica sobre `post_innertube` aceitar endpoint com query**: ver `crates/ytmusic-api/src/client.rs:126`. A implementação atual constrói `url = "{BASE_URL}{endpoint}?key={API_KEY}&prettyPrint=false"`. Nosso `endpoint` já tem `?ctoken=...&type=...` — isso viraria `?ctoken=...&type=...?key=...` (URL inválida).

- [ ] **Step 2: Patch em `client.rs::post_innertube` para aceitar endpoint com query**

**Files:**
- Modify: `crates/ytmusic-api/src/client.rs` (linha 126-127)

Substituir:

```rust
pub async fn post_innertube(&self, endpoint: &str, body: Value) -> Result<Value> {
    let url = format!("{BASE_URL}{endpoint}?key={API_KEY}&prettyPrint=false");
```

Por:

```rust
pub async fn post_innertube(&self, endpoint: &str, body: Value) -> Result<Value> {
    let separator = if endpoint.contains('?') { '&' } else { '?' };
    let url = format!("{BASE_URL}{endpoint}{separator}key={API_KEY}&prettyPrint=false");
```

- [ ] **Step 3: Verificar que nenhum outro caller de `get_watch_playlist` quebrou**

Run: `grep -rn "get_watch_playlist" src-tauri/ src/ crates/ 2>&1`
Expected: único caller é `src-tauri/src/youtube_music/commands.rs` em `yt_get_watch_playlist`. Ele vai quebrar — **isso é OK**, vamos tratar no Step 4.

- [ ] **Step 4: Atualizar a única chamada existente em `commands.rs`**

**Files:**
- Modify: `src-tauri/src/youtube_music/commands.rs` (procurar `yt_get_watch_playlist`, linha ~787)

Substituir a chamada antiga:

```rust
let result = state.client.get_watch_playlist(&video_id).await
```

Por:

```rust
use ytmusic_api::types::watch::WatchPlaylistRequest;
// ...
let result = state.client
    .get_watch_playlist(WatchPlaylistRequest::for_video_radio(&video_id, 25))
    .await
```

Nota: o comando `yt_get_watch_playlist` existente continua servindo como "watch queue rápida" com limite 25. Os novos comandos de rádio usam a mesma função com outros parâmetros.

O import `WatchPlaylistRequest` pode ir no topo do arquivo junto dos outros.

**Importante**: este `yt_get_watch_playlist` antigo também **deveria** passar por `with_session_refresh`. Verificar se já está. Se não estiver, **não alterar agora** — o comando nunca é chamado pelo frontend (verificado durante pesquisa). Vamos deixar como está e os novos comandos de rádio já nascem no pattern correto.

- [ ] **Step 5: Compilar**

Run: `cargo check -p ytmusic-api && cargo check -p tauri-app` (ou o nome real do crate do src-tauri — ver `Cargo.toml`)
Expected: PASS. Se falhar, ler as mensagens com cuidado — erros mais prováveis: `LikeStatus` path errado, imports faltando, `Value` não importado.

- [ ] **Step 6: Commit**

```bash
git add crates/ytmusic-api/src/api/watch.rs crates/ytmusic-api/src/client.rs src-tauri/src/youtube_music/commands.rs
git commit -m "$(cat <<'EOF'
Port Python radio logic with continuation loop to Rust

get_watch_playlist now takes WatchPlaylistRequest and iterates
continuation tokens until limit is reached or the pool is exhausted,
matching the Python ytmusicapi reference. post_innertube gains
query-string-safe URL construction for continuation endpoints.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Testes de unidade para `api/watch.rs` (validação do body)

**Files:**
- Modify: `crates/ytmusic-api/src/api/watch.rs` — adicionar bloco `#[cfg(test)] mod tests`

Não podemos testar a chamada HTTP real sem mockar, mas podemos testar **a validação** (rejeição de combinações inválidas) e os helpers de montagem — **desde que** expongamos a montagem como função pura. Refatoração leve:

- [ ] **Step 1: Extrair a montagem do body para uma função pura**

Em `api/watch.rs`, acima do `impl YtMusicClient`, adicionar:

```rust
/// Pure helper: builds the innertube body for `get_watch_playlist`.
/// Returns `Err` if the request is invalid. Testable without I/O.
pub(crate) fn build_watch_body(req: &WatchPlaylistRequest<'_>) -> Result<serde_json::Value> {
    use serde_json::json;

    if req.video_id.is_none() && req.playlist_id.is_none() {
        return Err(Error::Api {
            message: "get_watch_playlist: provide video_id, playlist_id, or both".into(),
        });
    }
    if req.radio && req.shuffle {
        return Err(Error::Api {
            message: "get_watch_playlist: radio=true is incompatible with shuffle=true".into(),
        });
    }

    let mut body = json!({
        "enablePersistentPlaylistPanel": true,
        "isAudioOnly": true,
        "tunerSettingValue": "AUTOMIX_SETTING_NORMAL",
    });

    let effective_playlist_id: Option<String> = match (req.video_id, req.playlist_id) {
        (Some(vid), None) => {
            body["videoId"] = json!(vid);
            Some(format!("RDAMVM{vid}"))
        }
        (Some(vid), Some(pid)) => {
            body["videoId"] = json!(vid);
            Some(pid.to_string())
        }
        (None, Some(pid)) => Some(pid.to_string()),
        (None, None) => unreachable!(),
    };

    if req.video_id.is_some() && !req.radio && !req.shuffle {
        body["watchEndpointMusicSupportedConfigs"] = json!({
            "watchEndpointMusicConfig": {
                "hasPersistentPlaylistPanel": true,
                "musicVideoType": "MUSIC_VIDEO_TYPE_ATV",
            }
        });
    }

    if let Some(ref pid) = effective_playlist_id {
        body["playlistId"] = json!(pid);
    }

    if req.shuffle && effective_playlist_id.is_some() {
        body["params"] = json!("wAEB8gECKAE%3D");
    }
    if req.radio {
        body["params"] = json!("wAEB");
    }

    Ok(body)
}
```

Substituir o código duplicado dentro de `get_watch_playlist` por uma chamada: `let body = build_watch_body(&req)?;`. Os dois `if` de validação iniciais dentro do `get_watch_playlist` podem ser removidos (`build_watch_body` já os faz).

- [ ] **Step 2: Adicionar módulo de testes no final do arquivo**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_both_missing() {
        let req = WatchPlaylistRequest {
            video_id: None,
            playlist_id: None,
            radio: false,
            shuffle: false,
            limit: 25,
        };
        assert!(build_watch_body(&req).is_err());
    }

    #[test]
    fn rejects_radio_plus_shuffle() {
        let req = WatchPlaylistRequest {
            video_id: Some("abc"),
            playlist_id: None,
            radio: true,
            shuffle: true,
            limit: 25,
        };
        assert!(build_watch_body(&req).is_err());
    }

    #[test]
    fn video_only_falls_back_to_rdamvm() {
        let req = WatchPlaylistRequest::for_video_radio("abc123", 100);
        let body = build_watch_body(&req).unwrap();
        assert_eq!(body["videoId"], "abc123");
        assert_eq!(body["playlistId"], "RDAMVMabc123");
        assert_eq!(body["params"], "wAEB");
        assert!(body.get("watchEndpointMusicSupportedConfigs").is_none());
    }

    #[test]
    fn playlist_radio_uses_raw_id() {
        let req = WatchPlaylistRequest::for_playlist_radio("PLabcdef", 50);
        let body = build_watch_body(&req).unwrap();
        assert_eq!(body["playlistId"], "PLabcdef");
        assert_eq!(body["params"], "wAEB");
        assert!(body.get("videoId").is_none());
    }

    #[test]
    fn normal_watch_adds_music_supported_configs() {
        let req = WatchPlaylistRequest {
            video_id: Some("xyz"),
            playlist_id: None,
            radio: false,
            shuffle: false,
            limit: 25,
        };
        let body = build_watch_body(&req).unwrap();
        assert!(body.get("watchEndpointMusicSupportedConfigs").is_some());
        assert!(body.get("params").is_none());
    }

    #[test]
    fn shuffle_playlist_uses_shuffle_params() {
        let req = WatchPlaylistRequest {
            video_id: None,
            playlist_id: Some("PLabcdef"),
            radio: false,
            shuffle: true,
            limit: 50,
        };
        let body = build_watch_body(&req).unwrap();
        assert_eq!(body["params"], "wAEB8gECKAE%3D");
    }
}
```

- [ ] **Step 3: Rodar os testes**

Run: `cargo test -p ytmusic-api build_watch_body`
Expected: 6 tests passed.

- [ ] **Step 4: Commit**

```bash
git add crates/ytmusic-api/src/api/watch.rs
git commit -m "$(cat <<'EOF'
Add unit tests for watch request body assembly

Extract build_watch_body as a pure helper and cover the six
combinations of video/playlist/radio/shuffle we care about.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — PlaybackQueue: radio_state

### Task 5: Adicionar `RadioState` a `PlaybackQueue`

**Files:**
- Modify: `src-tauri/src/playback_queue.rs`

- [ ] **Step 1: Ler o arquivo atual**

Ler `src-tauri/src/playback_queue.rs` em chunks até entender `PlaybackQueue`, `set_queue`, `handle_track_end`, `clear`, `append_playlist_batch` e a estrutura de `QueueSnapshot`. O arquivo é longo (~1100 linhas). Foque nos primeiros 200 linhas primeiro (struct + set_queue + snapshot) e depois nos métodos citados.

- [ ] **Step 2: Adicionar tipos `RadioSeedKind`, `RadioSeed`, `RadioState`**

Logo após `enum RepeatMode { ... }` (linha ~45), adicionar:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RadioSeedKind {
    Video,
    Playlist,
    Album,
    Artist,
}

impl RadioSeedKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Video => "video",
            Self::Playlist => "playlist",
            Self::Album => "album",
            Self::Artist => "artist",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "video" => Some(Self::Video),
            "playlist" => Some(Self::Playlist),
            "album" => Some(Self::Album),
            "artist" => Some(Self::Artist),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct RadioSeed {
    pub kind: RadioSeedKind,
    pub id: String,
}

#[derive(Debug, Clone)]
pub struct RadioState {
    pub seed: RadioSeed,
    pub continuation: Option<String>,
    pub pool_exhausted: bool,
    pub loaded_count: usize,
}
```

- [ ] **Step 3: Adicionar campo `radio_state` em `PlaybackQueue`**

Dentro de `struct PlaybackQueue` (linha ~77), adicionar uma linha nova:

```rust
radio_state: Option<RadioState>,
```

O `#[derive(Default)]` existente cuida do default (`None`).

- [ ] **Step 4: Incluir `is_radio` no `QueueSnapshot`**

Atualizar o struct (linha ~15):

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueSnapshot {
    pub current_index: i64,
    pub total_loaded: usize,
    pub playlist_id: Option<String>,
    pub is_complete: bool,
    pub shuffle: bool,
    pub repeat: String,
    pub is_radio: bool,
}
```

E no `fn snapshot` (linha ~93), adicionar:

```rust
is_radio: self.radio_state.is_some(),
```

- [ ] **Step 5: Resetar `radio_state` em todos os mutators que "trocam de contexto"**

Adicionar `self.radio_state = None;` no início de:
- `set_queue` (logo após a entrada, junto das outras limpezas)
- `clear` (garantir que clear também limpa)

**Não** mexer em `append_playlist_batch`, `add_collection_next`, `append_collection`, `handle_track_end`, `next_track`, `previous_track` — essas operações acontecem **dentro** de um contexto de rádio também e não devem limpar o estado.

- [ ] **Step 6: Adicionar métodos `set_radio_state`, `radio_state`, `radio_state_mut`, `clear_radio`**

No `impl PlaybackQueue`, adicionar (pode ser logo após `fn snapshot`):

```rust
pub fn set_radio_state(&mut self, state: RadioState) {
    println!(
        "[PlaybackQueue] set_radio_state kind={} id={} loaded={} continuation={}",
        state.seed.kind.as_str(),
        state.seed.id,
        state.loaded_count,
        state.continuation.is_some(),
    );
    self.radio_state = Some(state);
}

pub fn radio_state(&self) -> Option<&RadioState> {
    self.radio_state.as_ref()
}

pub fn radio_state_mut(&mut self) -> Option<&mut RadioState> {
    self.radio_state.as_mut()
}

pub fn clear_radio(&mut self) {
    if self.radio_state.is_some() {
        println!("[PlaybackQueue] clear_radio");
    }
    self.radio_state = None;
}

/// Quantas faixas sobram depois da posição atual. Usado pelo trigger de continuation.
pub fn remaining_after_current(&self) -> usize {
    match self.current_index {
        Some(idx) if idx < self.playback_items.len() => {
            self.playback_items.len().saturating_sub(idx + 1)
        }
        _ => 0,
    }
}
```

- [ ] **Step 7: Compilar**

Run: `cargo check -p tauri-app` (ou o nome real; ver `src-tauri/Cargo.toml`)
Expected: PASS. O `QueueSnapshot` agora tem campo novo `is_radio`; o frontend vai ter que aceitar isso (Task 10).

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/playback_queue.rs
git commit -m "$(cat <<'EOF'
Add RadioState to PlaybackQueue

set_queue and clear now reset radio_state. Snapshot exposes is_radio
so the frontend can render the radio indicator and re-route the
shuffle button.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Método `truncate_after_current` para suportar re-roll

**Files:**
- Modify: `src-tauri/src/playback_queue.rs`

O re-roll precisa descartar tudo **depois** da faixa atual. Precisamos de um método que faça isso de forma consistente com `source_items`, `playback_items`, `history_item_ids`, `queued_next_item_ids`.

- [ ] **Step 1: Ler os métodos `rebuild_playback` e `add_collection_next`** para entender o modelo (source vs playback, history).

Abrir `src-tauri/src/playback_queue.rs` e grep por `rebuild_playback`, `source_items`, `queued_next_item_ids`.

- [ ] **Step 2: Adicionar `truncate_after_current` + `append_radio_batch`**

Dentro do `impl PlaybackQueue`, adicionar:

```rust
/// Descarta as faixas depois do currentIndex, tanto na ordem linear quanto na shuffled.
/// Preserva a faixa atual, o histórico e as marcações de priority-next.
/// Retorna quantas faixas foram removidas.
pub fn truncate_after_current(&mut self) -> usize {
    let Some(current_idx) = self.current_index else { return 0; };

    let total = self.playback_items.len();
    if current_idx + 1 >= total { return 0; }

    let removed_entries: Vec<QueueEntry> = self.playback_items.drain(current_idx + 1..).collect();
    let removed_ids: HashSet<u64> = removed_entries.iter().map(|e| e.item_id).collect();

    // Também remover os mesmos item_ids de source_items (se não for re-usado).
    // source_items mantém a ordem original; removemos por item_id.
    self.source_items.retain(|e| !removed_ids.contains(&e.item_id));

    // Limpa queued_next_item_ids que foram descartados.
    self.queued_next_item_ids.retain(|id| !removed_ids.contains(id));

    let removed = removed_entries.len();
    println!(
        "[PlaybackQueue] truncate_after_current removed={} kept_before={} current={}",
        removed,
        current_idx + 1,
        current_idx
    );
    removed
}

/// Anexa track_ids ao fim da playback_items (após posição atual) e também
/// ao source_items. Usado para continuation de rádio e para a segunda metade
/// do re-roll. Retorna a quantidade anexada.
pub fn append_radio_batch(&mut self, track_ids: &[String]) -> usize {
    for video_id in track_ids {
        let item_id = self.alloc_item_id();
        let entry = QueueEntry { item_id, video_id: video_id.clone() };
        self.source_items.push(entry.clone());
        self.playback_items.push(entry);
    }
    // Se antes estava vazio, inicializa o índice.
    if self.current_index.is_none() && !self.playback_items.is_empty() {
        self.current_index = Some(0);
    }
    println!(
        "[PlaybackQueue] append_radio_batch added={} total={} current={:?}",
        track_ids.len(),
        self.playback_items.len(),
        self.current_index
    );
    track_ids.len()
}
```

Nota: `append_radio_batch` intencionalmente **ignora shuffle** — em modo rádio o shuffle é sempre `false` (verificar em Task 8).

- [ ] **Step 3: Adicionar testes unitários**

No bloco `#[cfg(test)] mod tests` do final do arquivo (ele já existe), adicionar:

```rust
#[test]
fn truncate_after_current_preserves_current_and_history() {
    let mut queue = PlaybackQueue::default();
    queue.set_queue(
        vec!["a".into(), "b".into(), "c".into(), "d".into(), "e".into()],
        0, None, false, false,
    );
    // avança para o índice 2
    queue.play_index(2);
    let removed = queue.truncate_after_current();
    assert_eq!(removed, 2);
    assert_eq!(queue.playback_items.len(), 3);
    assert_eq!(queue.current_index, Some(2));
    assert_eq!(queue.current_track_id().as_deref(), Some("c"));
}

#[test]
fn append_radio_batch_grows_queue() {
    let mut queue = PlaybackQueue::default();
    queue.set_queue(vec!["a".into()], 0, None, false, false);
    let added = queue.append_radio_batch(&["b".to_string(), "c".to_string()]);
    assert_eq!(added, 2);
    assert_eq!(queue.playback_items.len(), 3);
    assert_eq!(queue.remaining_after_current(), 2);
}

#[test]
fn set_queue_clears_radio_state() {
    let mut queue = PlaybackQueue::default();
    queue.set_radio_state(RadioState {
        seed: RadioSeed { kind: RadioSeedKind::Video, id: "x".into() },
        continuation: Some("tok".into()),
        pool_exhausted: false,
        loaded_count: 10,
    });
    assert!(queue.radio_state().is_some());
    queue.set_queue(vec!["a".into()], 0, None, true, false);
    assert!(queue.radio_state().is_none());
}
```

- [ ] **Step 4: Rodar os testes**

Run: `cargo test -p tauri-app playback_queue`
Expected: todos os testes existentes + 3 novos passando. Se `current_track_id` não existir como `pub`, usar o método que existir (ver `Grep` local).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/playback_queue.rs
git commit -m "$(cat <<'EOF'
Add truncate_after_current and append_radio_batch helpers

truncate_after_current powers the re-roll semantics (keep current track,
drop everything after). append_radio_batch is used by continuation and
re-roll to grow the queue without touching shuffle/priority logic.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Tauri commands

### Task 7: Helper interno `continue_radio_background`

**Files:**
- Modify: `src-tauri/src/youtube_music/commands.rs`

Esse helper é chamado em background por `yt_queue_handle_track_end` quando a fila tá curta. Não é um `#[tauri::command]`.

- [ ] **Step 1: Adicionar imports no topo de `commands.rs`**

Verificar se os imports abaixo estão presentes; adicionar o que faltar:

```rust
use ytmusic_api::types::watch::{WatchPlaylistRequest, WatchTrack};
use crate::playback_queue::{RadioSeed, RadioSeedKind, RadioState};
```

- [ ] **Step 2: Adicionar helper de mapeamento `WatchTrack → CachedTrack`**

Em algum lugar perto dos outros helpers de cache do arquivo (grep `CachedTrack`), adicionar:

```rust
/// Converte um WatchTrack (shape do endpoint /next) em CachedTrack (shape do cache SQLite).
fn cached_from_watch(t: &WatchTrack) -> CachedTrack {
    CachedTrack {
        video_id: t.video_id.clone(),
        title: t.title.clone(),
        artists: t.artists.iter().map(|a| (a.name.clone(), a.id.clone())).collect(),
        album_id: t.album.as_ref().and_then(|a| a.id.clone()),
        album_name: t.album.as_ref().map(|a| a.name.clone()),
        duration: t.length.clone().unwrap_or_default(),
        thumbnails: t.thumbnails.iter().map(|th| (th.url.clone(), th.width, th.height)).collect(),
        like_status: t.like_status,
    }
}
```

**Verificar** a struct real de `CachedTrack` em `src-tauri/src/playlist_cache.rs` — se campos tiverem nomes diferentes, ajustar. Este helper existe **só** para não repetir a lógica.

- [ ] **Step 3: Adicionar helper de mapeamento de seed kind**

```rust
fn radio_request<'a>(seed: &'a RadioSeed, limit: usize) -> WatchPlaylistRequest<'a> {
    match seed.kind {
        RadioSeedKind::Video | RadioSeedKind::Artist => {
            WatchPlaylistRequest::for_video_radio(&seed.id, limit)
        }
        RadioSeedKind::Playlist | RadioSeedKind::Album => {
            WatchPlaylistRequest::for_playlist_radio(&seed.id, limit)
        }
    }
}
```

Nota sobre Artist: o campo `artist.radioId` do YouTube Music é um `videoId` especial que, quando usado como seed de rádio, gera a estação do artista. A lib Python trata igual a rádio de música.

- [ ] **Step 4: Implementar `continue_radio_background`**

Adicionar, junto aos outros helpers:

```rust
/// Extend the queue with the next ~50 tracks from the radio pool.
/// Spawned in background by yt_queue_handle_track_end when the queue runs low.
pub async fn continue_radio_background(
    app: AppHandle,
) {
    let state = app.state::<Arc<RwLock<YtMusicState>>>();
    let activity = app.state::<Arc<SessionActivity>>();
    let queue = app.state::<Arc<Mutex<PlaybackQueue>>>();

    // 1. Snapshot do radio_state sem segurar o lock da queue.
    let (token, is_playlist_seed) = {
        let q = queue.lock().await;
        let Some(rs) = q.radio_state() else {
            println!("[continue_radio] queue no longer in radio mode — aborting");
            return;
        };
        if rs.pool_exhausted {
            println!("[continue_radio] pool already exhausted — aborting");
            return;
        }
        let Some(tok) = rs.continuation.clone() else {
            println!("[continue_radio] no continuation token — aborting");
            return;
        };
        let is_playlist = matches!(rs.seed.kind, RadioSeedKind::Playlist | RadioSeedKind::Album);
        (tok, is_playlist)
    };

    // 2. Chamar o client via with_session_refresh.
    let result = session::with_session_refresh(
        &state,
        &app,
        &activity,
        "continue_radio",
        |client| {
            let tok = token.clone();
            async move { client.get_watch_playlist_continuation(&tok, is_playlist_seed).await }
        },
    ).await;

    let page = match result {
        Ok(p) => p,
        Err(e) => {
            println!("[continue_radio] error: {e} — aborting");
            return;
        }
    };

    // 3. Anexar faixas ao queue e atualizar radio_state.
    let track_ids: Vec<String> = page.tracks.iter().map(|t| t.video_id.clone()).collect();
    let cached: Vec<CachedTrack> = page.tracks.iter().map(cached_from_watch).collect();

    // Alimentar o cache SQLite para o L1/L2 do frontend funcionar.
    if let Some(cache) = app.try_state::<Arc<Mutex<PlaylistCache>>>() {
        let cache = cache.lock().await;
        if let Err(e) = cache.put_tracks(&cached) {
            println!("[continue_radio] cache put_tracks error: {e}");
        }
    }

    {
        let mut q = queue.lock().await;
        let added = q.append_radio_batch(&track_ids);
        if let Some(rs) = q.radio_state_mut() {
            rs.continuation = page.continuation.clone();
            rs.loaded_count += added;
            if track_ids.is_empty() || page.continuation.is_none() {
                rs.pool_exhausted = true;
                println!("[continue_radio] pool_exhausted=true");
            }
        }
    }

    // 4. Emitir evento para o frontend redesenhar pages.
    use tauri::Emitter;
    let _ = app.emit("radio-extended", ());
    println!("[continue_radio] done — added {} tracks", track_ids.len());
}
```

**Verificar nome real** do método de cache (`put_tracks` pode ser outro nome, ex: `upsert_tracks`, `cache_tracks`). Grep `fn.*tracks` em `playlist_cache.rs` antes.

- [ ] **Step 5: Compilar**

Run: `cargo check -p tauri-app`
Expected: PASS. Se falhar, os erros mais prováveis são nomes de métodos de cache e estrutura de `CachedTrack`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/youtube_music/commands.rs
git commit -m "$(cat <<'EOF'
Add continue_radio_background helper

Extends the queue with the next page of radio tracks using the
continuation token, caches them in the playlist cache, and emits
radio-extended for the frontend to sync.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Comando `yt_radio_start`

**Files:**
- Modify: `src-tauri/src/youtube_music/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Implementar `yt_radio_start`**

Adicionar junto com os outros comandos de watch/radio:

```rust
#[tauri::command]
pub async fn yt_radio_start(
    seed_kind: String,
    seed_id: String,
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
    queue: State<'_, Arc<Mutex<PlaybackQueue>>>,
) -> Result<String, String> {
    println!("[yt_radio_start] seed_kind={seed_kind} seed_id={seed_id}");

    validate_string_len(&seed_id, "seed_id")?;

    let kind = RadioSeedKind::parse(&seed_kind)
        .ok_or_else(|| format!("[yt_radio_start] invalid seed_kind={seed_kind}"))?;

    let seed = RadioSeed { kind, id: seed_id.clone() };
    let req = radio_request(&seed, 50);

    let page = session::with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_radio_start",
        |client| {
            let r = WatchPlaylistRequest {
                video_id: req.video_id,
                playlist_id: req.playlist_id,
                radio: req.radio,
                shuffle: req.shuffle,
                limit: req.limit,
            };
            async move { client.get_watch_playlist(r).await }
        },
    )
    .await
    .map_err(|e| format!("[yt_radio_start] {e}"))?;

    let track_ids: Vec<String> = page.tracks.iter().map(|t| t.video_id.clone()).collect();
    if track_ids.is_empty() {
        return Err("[yt_radio_start] radio returned no tracks".into());
    }

    // Alimentar o cache SQLite
    let cached: Vec<CachedTrack> = page.tracks.iter().map(cached_from_watch).collect();
    if let Some(cache) = app.try_state::<Arc<Mutex<PlaylistCache>>>() {
        let cache = cache.lock().await;
        if let Err(e) = cache.put_tracks(&cached) {
            println!("[yt_radio_start] cache put_tracks error: {e}");
        }
    }

    let loaded_count = track_ids.len();
    let response = {
        let mut q = queue.lock().await;
        // set_queue limpa radio_state automaticamente (Task 5).
        q.set_queue(track_ids, 0, None, /* is_complete */ false, /* shuffle */ false);
        q.set_radio_state(RadioState {
            seed,
            continuation: page.continuation,
            pool_exhausted: false,
            loaded_count,
        });
        q.snapshot_response_current()
    };

    serde_json::to_string(&response)
        .map_err(|e| format!("[yt_radio_start] serialization: {e}"))
}
```

Nota: `snapshot_response_current` é um método-auxiliar que não existe ainda — queremos um `QueueCommandResponse { track_id, snapshot }` a partir da queue. Verificar se `PlaybackQueue` já expõe algo equivalente (provavelmente sim — os outros comandos montam `QueueCommandResponse` à mão). Se sim, copiar o pattern:

```rust
// Substituir a linha do snapshot por:
QueueCommandResponse {
    track_id: q.current_track_id(),
    snapshot: q.snapshot(),
}
```

Usar esse pattern inline em vez de inventar método novo. Ajustar.

`validate_string_len` é um helper que já existe em `commands.rs` (ver `MAX_STRING_LEN`). Se não existir exatamente com esse nome, grep e usar o equivalente.

- [ ] **Step 2: Registrar o comando em `lib.rs`**

Adicionar `youtube_music::commands::yt_radio_start,` no `invoke_handler` — inserir junto dos outros comandos `yt_queue_*` ou `yt_get_watch_playlist`.

- [ ] **Step 3: Compilar**

Run: `cargo check -p tauri-app`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/youtube_music/commands.rs src-tauri/src/lib.rs
git commit -m "$(cat <<'EOF'
Add yt_radio_start command

Fetches the first page of a radio for any seed kind
(video/playlist/album/artist), populates the queue, and installs
RadioState so continuation and re-roll know the seed.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Comando `yt_radio_reroll` + trigger de continuation

**Files:**
- Modify: `src-tauri/src/youtube_music/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Implementar `yt_radio_reroll`**

```rust
#[tauri::command]
pub async fn yt_radio_reroll(
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
    queue: State<'_, Arc<Mutex<PlaybackQueue>>>,
) -> Result<String, String> {
    println!("[yt_radio_reroll] entering");

    // 1. Clone do seed sem segurar lock durante network I/O.
    let seed = {
        let q = queue.lock().await;
        let Some(rs) = q.radio_state() else {
            return Err("[yt_radio_reroll] not in radio mode".into());
        };
        rs.seed.clone()
    };

    let req = radio_request(&seed, 50);

    let page = session::with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_radio_reroll",
        |client| {
            let r = WatchPlaylistRequest {
                video_id: req.video_id,
                playlist_id: req.playlist_id,
                radio: req.radio,
                shuffle: req.shuffle,
                limit: req.limit,
            };
            async move { client.get_watch_playlist(r).await }
        },
    )
    .await
    .map_err(|e| format!("[yt_radio_reroll] {e}"))?;

    let track_ids: Vec<String> = page.tracks.iter().map(|t| t.video_id.clone()).collect();
    if track_ids.is_empty() {
        return Err("[yt_radio_reroll] radio returned no tracks".into());
    }

    // Cache
    let cached: Vec<CachedTrack> = page.tracks.iter().map(cached_from_watch).collect();
    if let Some(cache) = app.try_state::<Arc<Mutex<PlaylistCache>>>() {
        let cache = cache.lock().await;
        if let Err(e) = cache.put_tracks(&cached) {
            println!("[yt_radio_reroll] cache put_tracks error: {e}");
        }
    }

    // 2. Trunca e anexa.
    let response = {
        let mut q = queue.lock().await;
        let removed = q.truncate_after_current();
        // A primeira faixa da página pode ser a faixa atual (radio costuma começar pelo seed) —
        // nesse caso, descartamos ela para não repetir.
        let track_ids_to_append: Vec<String> = {
            let current = q.current_track_id();
            track_ids
                .iter()
                .filter(|id| Some(id.as_str()) != current.as_deref())
                .cloned()
                .collect()
        };
        let added = q.append_radio_batch(&track_ids_to_append);
        if let Some(rs) = q.radio_state_mut() {
            rs.continuation = page.continuation.clone();
            rs.loaded_count = added; // reseta — nova "sessão" do mesmo seed
            rs.pool_exhausted = page.continuation.is_none();
        }
        println!(
            "[yt_radio_reroll] removed={} added={} pool_exhausted={}",
            removed, added,
            q.radio_state().map(|rs| rs.pool_exhausted).unwrap_or(false)
        );
        QueueCommandResponse {
            track_id: q.current_track_id(),
            snapshot: q.snapshot(),
        }
    };

    serde_json::to_string(&response)
        .map_err(|e| format!("[yt_radio_reroll] serialization: {e}"))
}
```

- [ ] **Step 2: Hook no `yt_queue_handle_track_end` para disparar continuation**

Localizar a função `yt_queue_handle_track_end` em `commands.rs`. Após a chamada a `queue.handle_track_end()`, adicionar um check:

```rust
// (código existente que chama handle_track_end e produz a response)
let response = { /* ... */ };

// Novo — disparar continuation de rádio em background se estivermos curtos.
{
    let q = queue.lock().await;
    if let Some(rs) = q.radio_state() {
        let remaining = q.remaining_after_current();
        if remaining <= 10 && !rs.pool_exhausted && rs.continuation.is_some() {
            drop(q); // solta o lock antes de spawnar
            let app_clone = app.clone();
            tokio::spawn(async move {
                continue_radio_background(app_clone).await;
            });
        }
    }
}

serde_json::to_string(&response).map_err(/* ... */)
```

Se a função atual não tem `app: AppHandle` na assinatura, **adicionar** — ela precisa agora. O comando fica:

```rust
#[tauri::command]
pub async fn yt_queue_handle_track_end(
    app: AppHandle,
    queue: State<'_, Arc<Mutex<PlaybackQueue>>>,
) -> Result<String, String> { /* ... */ }
```

Tauri resolve `AppHandle` via injeção, não precisa ser passado pelo frontend.

- [ ] **Step 3: Registrar `yt_radio_reroll` em `lib.rs`**

Adicionar `youtube_music::commands::yt_radio_reroll,` no `invoke_handler`.

- [ ] **Step 4: Compilar**

Run: `cargo check -p tauri-app`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/youtube_music/commands.rs src-tauri/src/lib.rs
git commit -m "$(cat <<'EOF'
Add yt_radio_reroll and auto-continuation trigger

yt_radio_reroll truncates after the current track and re-fetches the
station from the same seed. yt_queue_handle_track_end now spawns
continue_radio_background when the queue is in radio mode and about
to run out of tracks.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Frontend: services, store, actions

### Task 10: Aceitar `isRadio` no snapshot e expor `ytRadioStart` / `ytRadioReroll`

**Files:**
- Modify: `src/modules/youtube-music/services/yt-api.ts`

- [ ] **Step 1: Ler o arquivo e localizar `QueueSnapshot` e `QueueCommandResponse`**

```bash
# abrir no editor
```

Achar o `interface QueueSnapshot` — provavelmente tem fields `currentIndex`, `totalLoaded`, `playlistId`, `isComplete`, `shuffle`, `repeat`.

- [ ] **Step 2: Adicionar `isRadio` em `QueueSnapshot`**

Acrescentar o campo ao tipo:

```typescript
export interface QueueSnapshot {
  currentIndex: number;
  totalLoaded: number;
  playlistId: string | null;
  isComplete: boolean;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  isRadio: boolean;
}
```

- [ ] **Step 3: Adicionar `RadioSeedKind` e as funções de serviço**

Acrescentar perto dos outros `ytQueue*`:

```typescript
export type RadioSeedKind = "video" | "playlist" | "album" | "artist";

export async function ytRadioStart(
  seedKind: RadioSeedKind,
  seedId: string,
): Promise<QueueCommandResponse> {
  const json = await invoke<string>("yt_radio_start", { seedKind, seedId });
  return parseJson<QueueCommandResponse>(json);
}

export async function ytRadioReroll(): Promise<QueueCommandResponse> {
  const json = await invoke<string>("yt_radio_reroll");
  return parseJson<QueueCommandResponse>(json);
}
```

- [ ] **Step 4: Compilar o frontend**

Run: `npm run -s tsc --noEmit` (ou `npm run build --dry-run` — usar o comando de tipo do projeto; ver `package.json`)
Expected: PASS. Se `parseJson` tiver nome diferente, usar o existente.

- [ ] **Step 5: Commit**

```bash
git add src/modules/youtube-music/services/yt-api.ts
git commit -m "$(cat <<'EOF'
Add ytRadioStart/ytRadioReroll service functions

Also exposes isRadio on QueueSnapshot so the queue store can react.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Queue store aceita `isRadio`; shuffle vira re-roll em modo rádio

**Files:**
- Modify: `src/modules/youtube-music/stores/queue-store.ts`

- [ ] **Step 1: Ler o store e identificar `isRadio` onde for derivado**

Procurar onde o store aceita o `snapshot` do backend (provavelmente `hydrateFromSnapshot` ou `applyResponse`). Cada vez que um `QueueCommandResponse` chega, precisamos setar `isRadio: snapshot.isRadio`.

- [ ] **Step 2: Adicionar `isRadio` ao state e aos mutators de snapshot**

No `interface QueueState`, adicionar:

```typescript
isRadio: boolean;
```

No `create<QueueState>((set, get) => ({ ... }))`, adicionar valor inicial `isRadio: false`.

Em todos os lugares onde o store atualiza o snapshot do backend (procurar `snapshot.shuffle` ou `snapshot.repeat` — são os campos já tratados), adicionar:

```typescript
isRadio: response.snapshot.isRadio,
```

- [ ] **Step 3: Modificar `toggleShuffle` para virar re-roll quando `isRadio=true`**

Atual (aproximação):

```typescript
toggleShuffle: async () => {
  const r = await ytQueueToggleShuffle();
  set({ /* ...update de pages, shuffle... */, isRadio: r.snapshot.isRadio });
},
```

Novo:

```typescript
toggleShuffle: async () => {
  if (get().isRadio) {
    console.log("[queue-store] toggleShuffle in radio mode → re-roll");
    try {
      const r = await ytRadioReroll();
      // Re-roll mudou a queue — limpar pages e recarregar janelas.
      set({
        pages: {},
        pagesVersion: get().pagesVersion + 1,
        totalLoaded: r.snapshot.totalLoaded,
        currentIndex: r.snapshot.currentIndex,
        isComplete: r.snapshot.isComplete,
        shuffle: r.snapshot.shuffle,
        isRadio: r.snapshot.isRadio,
        repeat: r.snapshot.repeat as RepeatMode,
      });
      // Feedback visual é responsabilidade do caller (ex: toast).
    } catch (err) {
      console.error("[queue-store] re-roll failed", err);
      throw err;
    }
    return;
  }
  // comportamento original
  const r = await ytQueueToggleShuffle();
  set({ /* ... original ... */ });
},
```

Ajustar o set do ramo original para **também** setar `isRadio: r.snapshot.isRadio` (pra manter consistência).

- [ ] **Step 4: Adicionar listener para o evento `radio-extended`**

Em algum ponto do módulo (provavelmente no `index.tsx` do módulo), adicionar listener Tauri que dispara um refetch de pages quando o backend emite `radio-extended`. Se o store já tem um mecanismo similar para eventos tipo `playlist-tracks-updated` (procurar), seguir o mesmo pattern.

No próprio store, adicionar o method:

```typescript
applyRadioExtended: async () => {
  console.log("[queue-store] radio-extended event received");
  // Invalida pages e re-obtém window atual.
  set({
    pages: {},
    pagesVersion: get().pagesVersion + 1,
  });
  // O componente que renderiza a fila vai automaticamente refazer ensureRange
  // na próxima render, então não precisamos recarregar aqui.
},
```

E no `index.tsx` do módulo adicionar listener:

```typescript
import { listen } from "@tauri-apps/api/event";
// ...
useEffect(() => {
  const unlisten = listen("radio-extended", () => {
    useQueueStore.getState().applyRadioExtended();
  });
  return () => { unlisten.then(fn => fn()); };
}, []);
```

- [ ] **Step 5: Compilar**

Run: `npm run -s tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/youtube-music/stores/queue-store.ts src/modules/youtube-music/index.tsx
git commit -m "$(cat <<'EOF'
Queue store: isRadio flag and shuffle re-routing

In radio mode, toggleShuffle calls ytRadioReroll instead of the normal
shuffle endpoint. Listens for the radio-extended Tauri event to
invalidate pages when the backend grows the queue.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Actions context com `onStartRadio`

**Files:**
- Modify: `src/modules/youtube-music/router/actions-context.tsx`
- Modify: `src/modules/youtube-music/index.tsx`

- [ ] **Step 1: Adicionar o novo action type**

No `actions-context.tsx`, dentro da interface `YtActions`:

```typescript
onStartRadio: (seed: { kind: RadioSeedKind; id: string }) => Promise<void>;
```

Importar `RadioSeedKind` do services.

- [ ] **Step 2: Implementar `handleStartRadio` em `index.tsx`**

Localizar onde os outros handlers (`handlePlayAll`, `handleAddPlaylistNext` etc) são definidos. Adicionar:

```typescript
const handleStartRadio = useCallback(async (seed: { kind: RadioSeedKind; id: string }) => {
  console.log("[yt-module] handleStartRadio", seed);
  try {
    const response = await ytRadioStart(seed.kind, seed.id);
    const firstTrackId = response.trackId;
    // Propaga o snapshot para o queue store.
    queueApplyCommandResponse(response);
    if (firstTrackId) {
      playerPlay(firstTrackId);
    }
    toast("Rádio iniciado");
  } catch (err) {
    console.error("[yt-module] start radio failed", err);
    toast("Não foi possível iniciar o rádio");
  }
}, []);
```

`queueApplyCommandResponse` é o pattern já usado pelos outros handlers (grep `set({.*snapshot` dentro do store). Se for um método do store, chamar como `useQueueStore.getState().applyCommand(response)` ou equivalente.

Incluir `handleStartRadio` no `<YtActionsProvider value={{ ..., onStartRadio: handleStartRadio }}>`.

- [ ] **Step 3: Compilar**

Run: `npm run -s tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/modules/youtube-music/router/actions-context.tsx src/modules/youtube-music/index.tsx
git commit -m "$(cat <<'EOF'
Wire onStartRadio through the actions context

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — UI

### Task 13: Conectar botão existente em `artist-page.tsx`

**Files:**
- Modify: `src/modules/youtube-music/components/pages/artist-page.tsx`

- [ ] **Step 1: Ler o botão atual (linha 143)**

```tsx
{artist.radioId && (
  <Button variant="outline" onClick={() => {}}>
    <Radio data-icon="inline-start" />
    Rádio
  </Button>
)}
```

- [ ] **Step 2: Substituir o onClick**

```tsx
{artist.radioId && (
  <Button
    variant="outline"
    onClick={() => onStartRadio({ kind: "artist", id: artist.radioId! })}
  >
    <Radio data-icon="inline-start" />
    Rádio
  </Button>
)}
```

Consumir `onStartRadio` via `useYtActions()` (ou o hook que o projeto usa para acessar o actions context).

- [ ] **Step 3: Testar compilação**

Run: `npm run -s tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/modules/youtube-music/components/pages/artist-page.tsx
git commit -m "$(cat <<'EOF'
Wire artist radio button to onStartRadio

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Item "Iniciar rádio" no menu de playlist e álbum

**Files:**
- Modify: `src/modules/youtube-music/components/pages/playlist-page.tsx`
- Modify: `src/modules/youtube-music/components/pages/album-page.tsx`

- [ ] **Step 1: Localizar o DropdownMenu / contexto em `playlist-page.tsx`**

Procurar pelo menu que tem "Tocar a seguir", "Adicionar à fila", "Baixar", etc. É onde vamos adicionar "Iniciar rádio".

- [ ] **Step 2: Adicionar o item**

Exemplo de item (adaptar ao pattern real do menu):

```tsx
<DropdownMenuItem
  onSelect={() => onStartRadio({ kind: "playlist", id: playlist.id })}
>
  <Radio className="size-4" />
  Iniciar rádio
</DropdownMenuItem>
```

Posicionar logo abaixo do botão "Aleatório" do menu (como no YouTube Music oficial — ver a screenshot do spec §2).

- [ ] **Step 3: Repetir em `album-page.tsx`**

Mesma mudança, mas com `kind: "album"` e `id: album.audioPlaylistId`. Se o campo `audioPlaylistId` não existe no type `Album`, verificar `types/music.ts` — deve ter (é o que vem do parser). Se não estiver sendo exposto, adicionar.

- [ ] **Step 4: Compilar**

Run: `npm run -s tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/youtube-music/components/pages/playlist-page.tsx src/modules/youtube-music/components/pages/album-page.tsx
git commit -m "$(cat <<'EOF'
Add 'Iniciar rádio' to playlist and album context menus

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Item "Iniciar rádio" no menu de faixa

**Files:**
- Investigar primeiro; provavelmente `src/modules/youtube-music/components/ui/track-row.tsx` ou similar

- [ ] **Step 1: Localizar o componente de menu de faixa**

```bash
grep -rln "onAddToQueue" src/modules/youtube-music/components/
```

O componente que expõe "Tocar a seguir", "Adicionar à fila", "Ir para a página do artista" é onde adicionamos "Iniciar rádio".

- [ ] **Step 2: Adicionar o item ao menu**

```tsx
<DropdownMenuItem
  onSelect={() => onStartRadio({ kind: "video", id: track.videoId })}
>
  <Radio className="size-4" />
  Iniciar rádio
</DropdownMenuItem>
```

- [ ] **Step 3: Compilar**

Run: `npm run -s tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/modules/youtube-music/components/ui/...
git commit -m "$(cat <<'EOF'
Add 'Iniciar rádio' to track context menu

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Badge visual de modo rádio no player bar

**Files:**
- Modify: `src/modules/youtube-music/components/player/player-bar.tsx` (ou equivalente)

- [ ] **Step 1: Ler o player bar e localizar onde estão os controles**

```bash
grep -rn "shuffle\|repeat" src/modules/youtube-music/components/
```

- [ ] **Step 2: Adicionar badge condicional**

Perto do título da faixa que está tocando:

```tsx
import { useQueueStore } from "@/modules/youtube-music/stores/queue-store";
import { Radio } from "lucide-react";
// ...
const isRadio = useQueueStore((s) => s.isRadio);
// ...
{isRadio && (
  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
    <Radio className="size-3" />
    Rádio
  </span>
)}
```

- [ ] **Step 3: Compilar**

Run: `npm run -s tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/modules/youtube-music/components/player/player-bar.tsx
git commit -m "$(cat <<'EOF'
Show radio badge in player bar when queue is in radio mode

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6 — Validação end-to-end manual

### Task 17: Teste manual em dev mode

Não há como automatizar isso sem mockar todo o YouTube Music. O usuário precisa validar que tudo funciona com cookies reais.

**Pré-requisito:** estar autenticado no YouTube Music via o cookie extractor do app.

- [ ] **Step 1: Rodar o app em modo dev**

```bash
npm run tauri dev
```

- [ ] **Step 2: Testar rádio de faixa**

1. Abrir qualquer playlist, clicar no menu de 3 pontinhos de uma música → "Iniciar rádio"
2. Confirmar: player começa a tocar em ≤ 2s
3. Confirmar: badge "Rádio" aparece no player bar
4. Confirmar: fila (sheet) mostra ~50 faixas, a primeira igual à clicada
5. Avançar pelas faixas (botão next) até faltarem ~10 na fila
6. Abrir DevTools → Console e verificar logs do backend `[continue_radio] done — added N tracks`
7. Confirmar que a fila cresceu sem interrupção de playback

- [ ] **Step 3: Testar rádio de playlist**

1. Abrir uma playlist → menu → "Iniciar rádio"
2. Confirmar: as primeiras N faixas da fila são da playlist original
3. Confirmar: badge Rádio
4. Avançar e verificar continuation

- [ ] **Step 4: Testar rádio de álbum**

1. Abrir um álbum → menu → "Iniciar rádio"
2. Confirmar: faixas do álbum começam a fila
3. Confirmar: mesmo comportamento de continuation (nota: álbum tem pool menor, pode esgotar mais rápido)

- [ ] **Step 5: Testar rádio de artista**

1. Abrir página de artista → botão "Rádio"
2. Confirmar funcionamento

- [ ] **Step 6: Testar re-roll**

1. Com qualquer rádio tocando, clicar o botão shuffle
2. Confirmar: a faixa atual **não para**
3. Confirmar: a fila depois da faixa atual foi substituída
4. Confirmar: toast "Rádio atualizado" (ou o texto do spec)

- [ ] **Step 7: Testar saída do rádio**

1. Com rádio tocando, abrir qualquer playlist e clicar "Reproduzir"
2. Confirmar: badge Rádio some
3. Confirmar: shuffle volta a ser shuffle normal (testa clicando)

- [ ] **Step 8: Teste de regressão — queue normal ainda funciona**

1. Tocar uma playlist normal, usar next/previous/shuffle/repeat
2. Confirmar: tudo igual antes da mudança

- [ ] **Step 9: Reportar bugs encontrados**

Abrir issues ou corrigir inline conforme aparecem. Commit final se houver fixes.

- [ ] **Step 10: Commit de encerramento**

Se tudo passou, não precisa commit — feature está verde. Se houver ajustes:

```bash
git add -A
git commit -m "$(cat <<'EOF'
Fix issues discovered during radio E2E validation

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Fechamento

Depois de todas as tasks:

```bash
git log --oneline d59bca0..HEAD
```

Deve mostrar ~12-17 commits sequenciais. A feature está pronta para merge no master principal.

**Próximos passos fora do escopo deste plano:**
- Persistência do radio_state entre reinícios do app
- Rádio de resultado de busca
- Badge visual em algum outro lugar além do player bar (queue sheet header, p. ex.)
- Lyrics integradas via `lyricsBrowseId` que já é retornado pelo parser
