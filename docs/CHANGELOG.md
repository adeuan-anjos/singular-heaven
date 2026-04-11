# Changelog

Registro técnico de mudanças relevantes do projeto. Não é release note de marketing.

O formato segue o espírito de [Keep a Changelog](https://keepachangelog.com/), com foco em engenharia e links para docs detalhadas.

## Unreleased

### Added

- Refresh de sessao mid-uptime: wrapper `with_session_refresh` envelopa todos os ~30 comandos Tauri autenticados do YouTube Music. Detecta 401, dispara re-extracao de cookies via `rookie`, substitui o state e retenta uma vez. Transparente para o frontend — nenhum toast ou dialog.
- Trigger proativo no `WindowEvent::Focused`: quando a janela ganha foco apos 30 min idle, refresh roda em background antes do usuario interagir. Elimina a latencia extra do retry reativo no caminho feliz pos-idle.
- `SessionActivity` em managed state (`AtomicU64` para timestamp + `tokio::sync::Mutex` para serializacao de refresh concorrente). Evita thundering herd — N comandos paralelos pegando 401 disparam apenas uma invocacao de `rookie`, os outros usam double-check via `get_accounts`.
- Modulo `src-tauri/src/youtube_music/session.rs` centraliza `is_session_expired`, `refresh_cookies_and_rebuild_state`, `with_session_refresh`, `extract_cookies_auto`, `extract_cookies_from_browser`. `yt_ensure_session` foi refatorada para reusar o mesmo helper.
- Comandos debug-only gateados por `#[cfg(debug_assertions)]`: `yt_dev_session_stats`, `yt_dev_corrupt_cookies`, `yt_dev_backdate_activity`. Permitem validar os fluxos de refresh sem esperar expiracao real — documentados em [youtube-music-auth.md](explanation/youtube-music-auth.md#comandos-de-teste-debug-only).
- Componentes shadcn `Item` (list row composition) e `Spinner` instalados via CLI e usados nos pickers de auth.
- Performance: `Arc<Mutex>` → `Arc<RwLock>` — todas as chamadas API rodam em paralelo (startup 10.3s → 1.36s).
- Cache SWR (stale-while-revalidate) em SQLite para liked track IDs e library playlists — warm start instantâneo (~21ms vs 5-8s).
- Sidebar otimizada: usa cache de library playlists + 1 request `guide` (elimina fetch duplicado de 6-8s).
- Instrumentação de performance (`services/perf.ts`) com timeline, waterfall e `__perfDump()` no console.
- Manifesto UAC no build Windows (`requireAdministrator`) para compatibilidade com Chromium 130+ appbound encryption.
- Novos comandos cached: `yt_get_liked_track_ids_cached`, `yt_get_library_playlists_cached`, `yt_get_sidebar_playlists_cached`.
- Eventos Tauri `liked-track-ids-updated` e `library-playlists-updated` para refresh silencioso de dados cached.
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

### Fixed

- Sessao `HTTP 401` apos uptime prolongado (8-10h+): o app mantinha cookies extraidos uma unica vez no startup/login e nunca refrescava durante uptime. Quando o Google rotacionava SIDCC/sessao em background, a proxima chamada autenticada (ex: abrir playlist) retornava `401 Unauthorized` enquanto a musica que ja estava tocando continuava normal (porque `fetch_audio_bytes` usa stream URL pre-assinada sem cookies). Fix: `with_session_refresh` wrapper detecta 401, dispara refresh via `rookie` e retenta — transparente para o usuario. Focus-triggered refresh antecipa o mesmo fluxo quando a janela volta ao foco apos idle > 30 min. Detalhes em [youtube-music-auth.md](explanation/youtube-music-auth.md#refresh-de-sessao).
- CSP corrigido para incluir `http://thumb.localhost` e `http://stream.localhost` (imagens e áudio quebrados em build de produção).
- Dead code `is_cached` removido de `thumb_cache.rs`.
- Indicador de "tocando agora" (barrinhas do equalizer no `TrackTableRow`) consumia 3-6% de CPU do WebView2 na tela de playlist e ~6.5% com o app minimizado. A animação CSS usava `height` (não-composable, força style+layout+paint a cada frame × 144Hz × 3 spans) e o Chromium não pausa CSS animations automaticamente enquanto há áudio reproduzindo. Fix troca a animação para `transform: scaleY` (composable, roda só no compositor thread da GPU) e adiciona um hook `useDocumentHiddenClass` em `src/lib/hooks/` que sincroniza uma classe `document-hidden` no `<html>` via `visibilitychange` — uma regra CSS (`html.document-hidden .equalizer span { animation-play-state: paused }`) pausa completamente a animação quando o app está minimizado. Aplica-se a qualquer animação `infinite` visível durante playback: usar apenas `transform`/`opacity` e pausar em `document-hidden`.

### Changed

- `yt_detect_google_accounts` agora faz o probing de `X-Goog-AuthUser` 0-9 em paralelo via `futures::future::join_all` (antes era um `for` sequencial). Reduz o tempo da tela de seleção de conta Google de ~5-10s para ~500ms-1s em contas com múltiplos perfis logados. Dedup determinístico mantido via iteração ordenada por `auth_user`. Dependência `futures = "0.3"` adicionada em `src-tauri/Cargo.toml`.
- `GoogleAccountPicker` e `AccountPicker` refatorados para usar o componente `Item` (shadcn/ReUI) ao invés de `<button>` nativo ou `Button variant="outline"` empilhado. Linhas agora seguem a composição `Item > ItemMedia/ItemContent/ItemActions` com `Button` de ação em `ItemActions` (padrão do demo ReUI, zero customização via `className` nos sub-componentes de `Item`). Visual mais compacto e idiomático. `Card` externo removido — o `Item variant="outline"` já fornece o container visual. Loading state usa `Skeleton` dentro de `Item`s ao invés de `Loader2` solto.
- `CollectionHeader` refatorado de componente monolítico (props-driven) para composição shadcn-first com sub-componentes (`CollectionHeaderInfo`, `CollectionHeaderThumbnail`, `CollectionHeaderContent`, `CollectionHeaderActions`, `CollectionHeaderMenu`).
- Botões de ação em headers agora usam `ButtonGroup` (componente shadcn instalado) ao invés de `flex gap-*` manual.
- Ícones em botões agora usam `data-icon="inline-start"` ao invés de `className="mr-2 h-4 w-4"` — delega sizing e spacing ao Button.
- Referência de composição de componentes shadcn documentada em `docs/reference/shadcn-component-composition.md`.
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
