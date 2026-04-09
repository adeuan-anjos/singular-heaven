# Changelog

Registro técnico de mudanças relevantes do projeto. Não é release note de marketing.

O formato segue o espírito de [Keep a Changelog](https://keepachangelog.com/), com foco em engenharia e links para docs detalhadas.

## Unreleased

### Added

- Arquitetura backend-first para likes de track, com mutação real via cookies/InnerTube.
- Gestão backend-first de playlists: salvar/remover da biblioteca, criar/excluir playlist, adicionar/remover músicas.
- Sidebar de playlists baseada no `guide` do YouTube Music para refletir a ordem real do produto.
- Documentação específica da sidebar e das regras de composição com shadcn + virtualização.

### Changed

- Queue e playback agora têm semântica global consistente de `shuffle`, `repeat`, `next`, `previous` e `add next`.
- Coleções reproduzíveis deixaram de depender de arrays locais como fonte de verdade.

### Docs

- Estrutura de documentação reorganizada em `adr/`, `explanation/`, `reference/`, `how-to/` e `archive/`.
- Novas docs:
  - [Playback Architecture](./docs/explanation/youtube-music-playback-architecture.md)
  - [Sidebar Architecture](./docs/explanation/youtube-music-sidebar-architecture.md)
  - [Track Collections](./docs/explanation/youtube-music-track-collections.md)
  - [Track Likes](./docs/explanation/youtube-music-track-likes.md)
  - [Playlist Management](./docs/explanation/youtube-music-playlist-management.md)
  - [Known Bugs](./docs/known-bugs.md)

## 2026-04

### 2026-04-09

- Refino global de semântica de playback da queue.
- Implementação backend-first de likes de track.
- Implementação inicial backend-first de playlist management.
- Início da separação entre sidebar order (`guide`) e library playlists (`FEmusic_liked_playlists`).
