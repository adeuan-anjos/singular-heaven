# Known Bugs

Lista de bugs e dívidas técnicas já observados no projeto e deixados para corrigir depois.

## Blockers para open source

### OAuth client secret no git history

- Descrição:
  - O secret `REDACTED_OAUTH_SECRET` está commitado em `docs/archive/session-handoff-2026-04-07.md` e em diffs de source Rust.
- Impacto:
  - Qualquer pessoa que clone o repo pode extrair o secret do histórico git.
- Fix necessário:
  - Rotacionar o secret no Google Cloud Console.
  - Executar `git filter-repo --replace-text` com scrub por conteúdo (não por path) para remover de todos os commits.
  - Os relatórios de auditoria (`SECURITY-AUDIT-*.md`) também contêm o secret — garantir que estão no `.gitignore` antes do push.

### Scripts de probe são ferramentas de exfiltração de credenciais

- Descrição:
  - `scripts/ytmusic_like_probe.py` e `scripts/ytmusic_playlist_probe.py` leem `yt_cookies.txt`, calculam SAPISIDHASH e fazem requests autenticadas.
- Impacto:
  - Para um avaliador de segurança, são ferramentas documentadas de roubo de credenciais dentro do repo.
- Fix necessário:
  - Remover do repo ou mover para um repositório privado separado.

### Paths pessoais com username em docs

- Descrição:
  - Qualquer arquivo em `docs/` (ou em outras fontes versionadas) que contenha paths absolutos com `~\...` ou similares vaza PII (username do sistema) para quem clonar o repo.
- Impacto:
  - Vaza PII. Um path absoluto também quebra em qualquer máquina diferente da do autor.
- Status atual:
  - `docs/README.md` foi convertido para paths relativos (sessão 2026-04-11).
  - Outros arquivos ainda podem conter paths absolutos — auditar antes de cada release ou push público.
- Fix necessário sempre que reaparecer:
  - Substituir por paths relativos à raiz do repo (ou ao arquivo que contém o link).
  - Grep sugerido: `rg "C:[\\/]Users[\\/]" docs/` antes de abrir PR.
- Por que o item fica aberto:
  - Serve como guardrail permanente: novas docs podem reintroduzir paths absolutos sem querer. Só remover deste arquivo se a regra for automatizada (lint/CI).

### PII em debug logs (emails e page_ids)

- Descrição:
  - `println!` em Rust loga email completo do usuário e page_id em plaintext.
  - Arquivos afetados: `account.rs:35`, `commands.rs:920`, `commands.rs:782`, `lib.rs:363`, `client.rs:134`.
- Impacto:
  - Se um usuário colar o log numa issue pública do GitHub, vaza dados pessoais.
- Fix necessário:
  - Redactar nos logs: `k***@gmail.com`, `1124...687`.
  - Ou gatar com `#[cfg(debug_assertions)]`.

### Código morto de parsing de email do InnerTube

- Descrição:
  - Campo `email` adicionado a `AccountInfo` e `GoogleAccountInfo` com parsing de `accountByline` e `activeAccountHeaderRenderer`. O InnerTube não retorna email por nenhuma dessas vias — o campo é sempre `None`.
- Impacto:
  - Código morto no codebase. Não causa bug, mas polui a API com campo que nunca tem valor.
- Fix necessário:
  - Remover campo `email` de `AccountInfo`, `GoogleAccountInfo`, `ApiGoogleAccountInfo` e o parsing morto em `account.rs`.
  - Ou manter se houver plano futuro de obter email por outra via.

## Alta prioridade

### Cookies armazenados em plaintext no disco

- Sintoma:
  - Cookies do YouTube (sessão Google completa) ficam em `yt_cookies.txt` como texto plano no app data dir.
- Impacto:
  - Qualquer processo rodando como o mesmo usuário pode ler os cookies e sequestrar a sessão Google.
  - Em cenário de open source, um usuário pode acidentalmente compartilhar o arquivo pensando ser um log.
- Causa raiz:
  - O app usa `std::fs::write` (Windows) ou `OpenOptions` com `0600` (Unix) — sem criptografia.
- Fix necessário:
  - Usar o crate `keyring` para armazenar cookies no OS credential store:
    - Windows: Credential Manager
    - macOS: Keychain
    - Linux: libsecret/kwallet
  - Fallback para arquivo criptografado se o credential store não estiver disponível.
- Área afetada:
  - [client.rs (tauri)](/src-tauri/src/youtube_music/client.rs) — `save_cookies`, `load_cookies`, `write_sensitive_file`

### HomeView falha ao cachear coleções de tracks

- Sintoma:
  - No log aparece `failed to cache section collection invalid args 'snapshot' for command 'yt_cache_collection_snapshot': missing field 'videoId'`
- Impacto:
  - Seções da Home com músicas não estão entrando corretamente no cache backend-first.
  - Isso pode quebrar coerência de queue/playback quando uma seção da Home deveria funcionar como coleção reproduzível.
- Área afetada:
  - [home-view.tsx](/./src/modules/youtube-music/components/home/home-view.tsx)
  - [track-collections.ts](/./src/modules/youtube-music/services/track-collections.ts)
  - [commands.rs](/./src-tauri/src/youtube_music/commands.rs)
- Hipótese:
  - Algum item vindo da Home está sendo enviado para `yt_cache_collection_snapshot` com shape incompatível com `Track`, provavelmente sem `videoId` válido.

### Playback trava quando a queue encontra vídeo indisponível

- Sintoma:
  - No log aparece `playabilityStatus=UNPLAYABLE` seguido de `Video not playable: O vídeo não está disponível`.
  - Exemplo real observado:
    - `fetch_audio_bytes` inicia normalmente
    - `get_stream_url` retorna `UNPLAYABLE`
    - o stream falha para aquele `videoId`
- Impacto:
  - A reprodução pode parar no meio da queue quando encontra uma faixa indisponível.
  - A experiência correta deveria ser resiliente: pular a faixa indisponível, avançar para a próxima e informar o usuário sem travar o player.
- Área afetada:
  - [client.rs](/./src-tauri/src/youtube_music/client.rs)
  - [player-store.ts](/./src/modules/youtube-music/stores/player-store.ts)
  - [playback_queue.rs](/./src-tauri/src/playback_queue.rs)
  - pipeline `stream://`
- Observação:
  - Isso precisa de tratamento explícito para vídeos não disponíveis dentro da queue:
    - detectar falha de stream/playability
    - avançar automaticamente para a próxima faixa
    - evitar loop em sequência de faixas indisponíveis
    - idealmente mostrar feedback curto ao usuário

## Média prioridade

### Páginas de artista ainda usam subscribe local/fake

- Sintoma:
  - O botão “Inscrever-se” em páginas de artista usa `useState` local — não está conectado ao backend.
- Impacto:
  - A UI sugere suporte a inscrição, mas o estado é perdido ao navegar.
- Área afetada:
  - [artist-page.tsx](/./src/modules/youtube-music/components/pages/artist-page.tsx)
  - [artist-songs-page.tsx](/./src/modules/youtube-music/components/pages/artist-songs-page.tsx)
- Observação:
  - Após refatoração do `CollectionHeader` para composição shadcn-first, o estado de subscribe vive nas páginas consumidoras, não no componente compartilhado. Precisa decidir a semântica antes de implementar.

### Ações avançadas de playlist ainda não implementadas

- Sintoma:
  - O menu de playlist do YouTube Music oferece ações que o app ainda não cobre por completo.
- Impacto:
  - A gestão de playlists no app ainda não alcança a paridade funcional esperada.
- Área afetada:
  - [playlist-page.tsx](/./src/modules/youtube-music/components/pages/playlist-page.tsx)
  - [collection-header.tsx](/./src/modules/youtube-music/components/shared/collection-header.tsx)
  - [playback_queue.rs](/./src-tauri/src/playback_queue.rs)
  - [watch.rs](/./crates/ytmusic-api/src/api/watch.rs)
- Pendências conhecidas:
  - `Fixar em "Ouvir de novo"`
  - `Baixar` como feature dedicada
  - colaboração/votação na edição de playlist
  - remover imagem personalizada da playlist
- Observação:
  - `Salvar na playlist`, `Compartilhar`, `Aleatório`, `Tocar a seguir` e `Adicionar à fila` já estão no fluxo principal.

### Remover thumbnail custom de playlist ainda sem endpoint confirmado

- Sintoma:
  - O YouTube Music expõe `Remover imagem personalizada`, mas o app ainda não oferece essa ação.
- Impacto:
  - O usuário consegue aplicar uma capa custom, mas não consegue voltar para a thumbnail padrão da playlist pelo app.
- Área afetada:
  - [playlist-details-dialog.tsx](/./src/modules/youtube-music/components/shared/playlist-details-dialog.tsx)
  - [playlist.rs](/./crates/ytmusic-api/src/api/playlist.rs)
  - [commands.rs](/./src-tauri/src/youtube_music/commands.rs)
- Observação:
  - O fluxo de `set` da thumbnail foi validado e já está implementado.
  - A shape exata de remoção no `browse/edit_playlist` ainda não foi confirmada.
  - Tentativas óbvias de `ACTION_REMOVE_*` retornaram `INVALID_ARGUMENT`, então a ação ficou fora da UI por decisão explícita de segurança.

### StrictMode continua duplicando fetches em dev

- Sintoma:
  - mount/unmount/mount e chamadas duplicadas em desenvolvimento.
- Impacto:
  - Polui logs e aumenta custo local em dev.
- Área afetada:
  - [main.tsx](/./src/main.tsx)
  - páginas que fazem fetch em `useEffect`
- Observação:
  - Não é bug de produção. É principalmente problema de debug/ergonomia.

## Baixa prioridade

### Callback órfão do Tauri em reload/HMR

- Sintoma:
  - `[TAURI] Couldn't find callback id ...`
- Impacto:
  - Ruído em desenvolvimento quando a WebView recarrega durante operação async do Rust.
- Área afetada:
  - [commands.rs](/./src-tauri/src/youtube_music/commands.rs)
- Observação:
  - Não parece bug funcional do app em produção.

### Warnings técnicos no Rust

- Sintoma:
  - Warnings recorrentes em `cargo check`.
- Impacto:
  - Nenhum funcional imediato, mas suja validação técnica.
- Área afetada:
  - [client.rs](/./src-tauri/src/youtube_music/client.rs)
- Observação:
  - `is_cached` em `thumb_cache.rs` foi removido (dead code).

## Features futuras

### Modo sem login (acesso anônimo)

- Descrição:
  - Permitir usar o app sem autenticação, com acesso limitado a funcionalidades públicas (busca, explorar, reprodução).
  - A opção "Continuar sem login" existia na LoginScreen mas foi removida por estar incompleta — nenhuma tela ou funcionalidade tratava o estado sem autenticação corretamente.
- Requisitos para implementar:
  - Definir quais features funcionam sem login (busca, explorar, reprodução) e quais ficam bloqueadas (playlists, likes, biblioteca).
  - Tratar graciosamente chamadas de API que exigem autenticação no modo anônimo.
  - UI deve indicar claramente que o usuário não está logado e oferecer login a qualquer momento.

## Encerrados recentemente

- Tráfego de rede idle no processo Rust (~0.1 Mbps em bursts, sem ação do usuário) era causado por connection pool do `reqwest` mantendo conexões TCP/TLS persistentes vivas para a Google. Diagnóstico via `resmon.exe` mostrou 2 conexões idle no Task Manager mesmo com DevTools Network vazio. Fix: todos os builders de `reqwest::Client` agora usam `pool_max_idle_per_host(0)` + `tcp_keepalive(None)`. Ver [network-connection-pool.md](explanation/network-connection-pool.md).
- Logs de debug artificiais (~590 ocorrências entre `console.log` no frontend e `println!` no backend + crate `ytmusic-api`) removidos. Toda infra de debug-only (`src/lib/debug/`, `services/perf.ts`, IPC wrapper de timing) deletada. `console.error` e `eprintln!` em error paths preservados. `startMemoryMonitor(5000)` que rodava `setInterval` em produção sem cleanup também eliminado.
- Animações CSS infinitas no shell (`titlebar-glow` com `filter: drop-shadow` 6s e `animated-gradient-text` com `background-position` 4s) consumiam ~7% de CPU em idle por forçar repaint no main thread. Removidas; `text-shadow` estático preservou o visual.
- Sessão `HTTP 401` após uptime prolongado (8-10h+) agora se recupera transparente via `with_session_refresh` wrapper em todos os comandos autenticados, mais focus-triggered refresh proativo após 30 min idle. O bug se manifestava como "música toca a noite toda, mas abrir playlist de manhã retorna 401"; o fix mantém o usuário sem ver erro algum. Ver [youtube-music-auth.md](explanation/youtube-music-auth.md#refresh-de-sessao).
- Likes de track agora são backend-first e usam a conta real via cookies.
- Alias `liked -> LM` corrigido no backend.
- Queue e playlist seguem ordem coerente com a fonte real.
- `shuffle` / `repeat` foram corrigidos no backend da fila.
- A sidebar de playlists agora usa composição shadcn-first mantendo a ordem backend-first via `guide`.
- Cookies expirados agora são re-extraídos silenciosamente do browser via `yt_ensure_session`.
- Multi-conta Google implementado com seleção de email e canal.
- Performance: `Arc<Mutex>` → `Arc<RwLock>` — chamadas API agora rodam em paralelo (10.3s → 1.36s).
- Cache SWR para liked track IDs e library playlists — warm start instantâneo do SQLite.
- Sidebar otimizada — usa cache de library playlists + 1 request guide (eliminado fetch duplicado).
- Manifesto UAC adicionado para build Windows (necessário para `rookie` com Chromium 130+ appbound encryption).
- CSP corrigido para incluir `http://thumb.localhost` e `http://stream.localhost` (fix imagens quebradas em build).
- Dead code `is_cached` removido de `thumb_cache.rs`.
