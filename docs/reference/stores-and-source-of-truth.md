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

## Playlist library

- Fonte de verdade:
  - backend `guide` para sidebar
  - backend `FEmusic_liked_playlists` para Biblioteca
- Store frontend:
  - `playlist-library-store`

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
