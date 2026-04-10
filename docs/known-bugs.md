# Known Bugs

Lista de bugs e dívidas técnicas já observados no projeto e deixados para corrigir depois.

## Alta prioridade

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

### CollectionHeader de artista ainda usa like local/fake

- Sintoma:
  - Os corações de header em páginas de artista continuam locais.
- Impacto:
  - A UI pode sugerir suporte a “curtir artista/coleção”, mas isso não está conectado ao backend nem à conta real.
- Área afetada:
  - [artist-page.tsx](/./src/modules/youtube-music/components/pages/artist-page.tsx)
  - [artist-songs-page.tsx](/./src/modules/youtube-music/components/pages/artist-songs-page.tsx)
  - [collection-header.tsx](/./src/modules/youtube-music/components/shared/collection-header.tsx)
- Observação:
  - Isso é deliberadamente separado do coração de track. Precisa decidir a semântica antes de implementar.

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
  - `Iniciar rádio` a partir de playlist
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

### Logs de debug ainda misturam payload útil com `Object`

- Sintoma:
  - Parte do log ainda aparece como `Object`.
- Impacto:
  - Diagnóstico fica pior em `debug.txt`.
- Área afetada:
  - Vários componentes com `console.log("...", obj)` ainda não convertidos para `JSON.stringify(...)`
- Observação:
  - O fluxo de likes já foi melhorado; o restante pode ser limpo de forma incremental.

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
  - [thumb_cache.rs](/./src-tauri/src/thumb_cache.rs)
  - [client.rs](/./src-tauri/src/youtube_music/client.rs)

## Encerrados recentemente

- Likes de track agora são backend-first e usam a conta real via cookies.
- Alias `liked -> LM` corrigido no backend.
- Queue e playlist seguem ordem coerente com a fonte real.
- `shuffle` / `repeat` foram corrigidos no backend da fila.
- A sidebar de playlists agora usa composição shadcn-first mantendo a ordem backend-first via `guide`.
