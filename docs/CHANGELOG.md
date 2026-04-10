# Changelog

Registro técnico de mudanças relevantes do projeto. Não é release note de marketing.

O formato segue o espírito de [Keep a Changelog](https://keepachangelog.com/), com foco em engenharia e links para docs detalhadas.

## Unreleased

### Added

- Autenticacao multi-conta Google: probing `X-Goog-AuthUser` 0-9 para listar todas as contas logadas no browser.
- Selecao de conta Google → canal em fluxo de dois passos (auto-pula se so ha uma opcao).
- Validacao silenciosa de sessao no startup (`yt_ensure_session`): re-extrai cookies do browser automaticamente se expirados.
- Persistencia de `auth_user` em disco junto com cookies e `page_id` — startup pula todos os pickers.
- Avatar do usuario com dropdown de logout no TopBar.
- Arquitetura backend-first para likes de track, com mutação real via cookies/InnerTube.
- Gestão backend-first de playlists: salvar/remover da biblioteca, criar/excluir playlist, adicionar/remover músicas.
- Edição backend-first de playlist cobrindo título, descrição e privacidade para playlists próprias/editáveis.
- Suporte backend-first para thumbnail custom de playlist via upload + `ACTION_SET_CUSTOM_THUMBNAIL`.
- Sidebar de playlists baseada no `guide` do YouTube Music para refletir a ordem real do produto.
- Documentação específica da sidebar e das regras de composição com shadcn + virtualização.
- Referência de composição de menus shadcn/Base UI com blur, highlight e ancoragem em listas virtualizadas.

### Changed

- Queue e playback agora têm semântica global consistente de `shuffle`, `repeat`, `next`, `previous` e `add next`.
- Coleções reproduzíveis deixaram de depender de arrays locais como fonte de verdade.
- Menus de playlist foram refinados para usar blur global, highlight do item alvo e regras explícitas de `DropdownMenu` vs `ContextMenu`.
- O fluxo de criação de playlist agora expõe privacidade explicitamente em vez de assumir sempre `PRIVATE`.
- Criar e editar playlist agora compartilham o mesmo card modal com capa inline e crop 1:1 no mesmo dialog.
- A remoção de thumbnail custom foi deixada fora da UI até o endpoint de remoção ser confirmado com segurança.
- Modo "sem login" removido da UI por estar incompleto (registrado como feature futura em `known-bugs.md`).

### Security

- CSP habilitado no WebView (antes era `null`).
- Allowlist de dominio no protocolo `thumb://` (previne SSRF).
- Validacao de `videoId` no protocolo `stream://` + CORS wildcard removido.
- Input validation com caps em 8 IPC commands (previne OOM via payloads gigantes).
- Limite de 200 paginas no background playlist fetch.
- Permissoes de arquivo `0600` no Unix para arquivos de credencial.
- Comando `greet()` (template Tauri) removido do IPC de producao.
- Limite de 10MB + allowlist de MIME no upload de thumbnail.
- `.env` e relatorios de auditoria adicionados ao `.gitignore`.

### Docs

- Estrutura de documentação reorganizada em `adr/`, `explanation/`, `reference/`, `how-to/` e `archive/`.
- Novas docs:
  - [Auth](docs/explanation/youtube-music-auth.md)
  - [ADR-005: Cookie Auth Multi-Account](docs/adr/ADR-005-cookie-auth-multi-account.md)
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
