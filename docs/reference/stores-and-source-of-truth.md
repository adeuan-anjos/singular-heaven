# Stores and Source of Truth

## Regra geral

O projeto favorece backend-first. O frontend mantém projeção visual e estado derivado, não a verdade principal do sistema.

## Queue

- Fonte de verdade:
  - backend `PlaybackQueue`
- Store frontend:
  - `queue-store`
- Papel do frontend:
  - janela visual
  - reveal progressivo
  - renderização

## Track likes

- Fonte de verdade:
  - conta real do usuário via backend
- Store frontend:
  - `track-like-store`
- Cache auxiliar:
  - `track-cache-store`
- Cache SWR (SQLite):
  - tabela `swr_json_cache` com `cache_key = "liked_track_ids"`
  - hydration usa `yt_get_liked_track_ids_cached` que retorna do cache e faz refresh em background se stale (>5min)
  - evento `liked-track-ids-updated` atualiza a store quando o refresh completa

## Playlist library

- Fonte de verdade:
  - backend `guide` para sidebar
  - backend `FEmusic_liked_playlists` para Biblioteca
- Store frontend:
  - `playlist-library-store`
- Cache SWR (SQLite):
  - tabela `swr_json_cache` com `cache_key = "library_playlists"`
  - hydration usa `yt_get_library_playlists_cached` (SWR)
  - sidebar usa `yt_get_sidebar_playlists_cached` (lê cache + 1 request guide)
  - evento `library-playlists-updated` atualiza a store quando o refresh completa

## Track metadata

- Fonte de verdade persistida:
  - SQLite (`playlist_cache.rs`)
- Cache frontend:
  - `track-cache-store`

## UI

A UI nunca deve:

- reimplementar semântica de fila
- inferir ownership de playlist por conta própria
- manter like de música em `useState` local como verdade
