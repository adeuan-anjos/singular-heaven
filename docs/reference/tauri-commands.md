# Tauri Commands

Referência curta dos comandos mais importantes do módulo YouTube Music.

## Collections / Playback

- `yt_cache_collection_snapshot`
- `yt_get_collection_track_ids`
- `yt_get_collection_window`
- `yt_load_playlist`
- `yt_get_playlist_track_ids`
- `yt_get_playlist_track_ids_complete`
- `yt_get_playlist_window`

## Queue

- `yt_queue_set`
- `yt_queue_get_state`
- `yt_queue_get_window`
- `yt_queue_play_index`
- `yt_queue_next`
- `yt_queue_previous`
- `yt_queue_handle_track_end`
- `yt_queue_add_next`
- `yt_queue_add_collection_next`
- `yt_queue_append_collection`
- `yt_queue_remove`
- `yt_queue_toggle_shuffle`
- `yt_queue_cycle_repeat`
- `yt_queue_clear`

## Track Likes

- `yt_rate_song`
- `yt_get_liked_track_ids`
- `yt_get_liked_track_ids_cached` — SWR: retorna do cache SQLite instantaneamente, refresh em background se stale (>5min)

## Playlist Management

- `yt_rate_playlist`
- `yt_create_playlist`
- `yt_edit_playlist`
- `yt_set_playlist_thumbnail`
- `yt_delete_playlist`
- `yt_add_playlist_items`
- `yt_remove_playlist_items`
- `yt_get_library_playlists`
- `yt_get_library_playlists_cached` — SWR: retorna do cache SQLite, refresh em background se stale (>5min)
- `yt_get_sidebar_playlists`
- `yt_get_sidebar_playlists_cached` — usa cache de library playlists + apenas 1 request guide para ordenação

## Auth

- `yt_ensure_session` — valida cookies no startup e re-extrai silenciosamente se expirados (401). Delega para `refresh_cookies_and_rebuild_state`.
- `yt_auth_status` — retorna `{ authenticated, method, hasPageId }`
- `yt_detect_browsers` — lista browsers com cookies do YouTube
- `yt_auth_from_browser` — extrai cookies do browser selecionado (aceita `authUser`)
- `yt_detect_google_accounts` — probing `X-Goog-AuthUser` 0-9 para listar contas Google
- `yt_get_accounts` — lista canais/brand accounts da conta Google ativa
- `yt_switch_account` — seleciona canal via `pageId`, persiste em disco
- `yt_auth_logout` — deleta credenciais e reverte para nao-autenticado

## Debug only (`#[cfg(debug_assertions)]`)

Nao existem em build de producao. Chamar via `window.__TAURI_INTERNALS__.invoke(...)` no devtools console.

- `yt_dev_session_stats` — retorna `authenticated`, `auth_user`, `has_page_id`, `seconds_since`, `stale`
- `yt_dev_corrupt_cookies` — substitui cookies em memoria por lixo para forcar 401 na proxima chamada autenticada
- `yt_dev_backdate_activity` — antedata o timestamp de `SessionActivity::last_success` (default 2400s). Forca o focus handler a disparar refresh proativo quando a janela ganhar foco

Uso detalhado em [youtube-music-auth.md](../explanation/youtube-music-auth.md#comandos-de-teste-debug-only).

## Wrapper de retry de sessao

Todo comando autenticado nas secoes `Collections / Playback`, `Track Likes`, `Playlist Management` e `Auth` (exceto `yt_ensure_session`, `yt_auth_status`, `yt_detect_browsers` e `yt_auth_logout`) passa pelo wrapper `with_session_refresh`. Se a chamada falhar com 401, o wrapper dispara refresh de cookies e retenta uma unica vez — transparente para o frontend.

Comandos locais (cache SQLite, queue, collection windows) nao passam pelo wrapper porque nao chamam a API.

## Rule

Se uma feature nova mudar semântica de playback, likes, playlists ou auth, esta doc deve ser atualizada ou linkar para a referência mais específica.
