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
