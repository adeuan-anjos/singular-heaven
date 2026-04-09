# YouTube Music: Arquitetura de Coleções Reproduzíveis

## Objetivo

Padronizar todas as listas reproduzíveis do módulo YouTube Music para um único modelo:

- backend como fonte de verdade da ordem lógica
- cache SQLite como fonte de metadados persistidos
- frontend como projeção visual paginada
- queue desacoplada de arrays locais do React

Essa arquitetura existe para evitar que páginas visualmente iguais tenham comportamentos diferentes de playback, queue e cache.

## Problema que motivou a mudança

Antes desta arquitetura, o projeto tinha dois modelos convivendo:

- `PlaylistPage` já vinha sendo migrada para um fluxo backend-first
- `AlbumPage`, `ArtistPage`, `ArtistSongsPage` e `SearchResultsPage` ainda usavam arrays locais em React

Consequências:

- a `Queue` podia receber os `videoId`s corretos, mas não conseguir resolver `Track` no cache
- páginas com a mesma tabela visual se comportavam de forma diferente
- clique em faixa podia depender de `findIndex(videoId)`
- duplicatas e ordem absoluta ficavam frágeis
- mudanças feitas em `playlist` não se propagavam automaticamente para as demais páginas

## Conceitos principais

### Coleção reproduzível

Qualquer origem que represente uma lista ordenada de músicas reproduzíveis:

- playlist
- álbum
- top songs do artista
- artist songs
- search songs
- seções de músicas em home/explore

Se a UI tem:

- play all
- play por linha
- ordem
- queue

então ela deve ser tratada como coleção reproduzível.

### Duas camadas separadas

#### Fila lógica

Fica no backend Rust:

- ordem real de reprodução
- `currentIndex`
- `shuffle`
- `repeat`
- `next/previous`
- adição/remoção de itens

#### Lista visual

Fica no frontend:

- renderização da tabela
- paginação visual
- reveal progressivo da queue
- filtros locais de UI

O frontend não é mais a fonte de verdade da ordem da fila.

## Estrutura atual

### Backend

Arquivos principais:

- `src-tauri/src/playlist_cache.rs`
- `src-tauri/src/youtube_music/commands.rs`
- `src-tauri/src/playback_queue.rs`

#### Cache SQLite

Hoje o cache cobre dois usos:

- legado de playlist
  - `playlist_meta`
  - `playlist_tracks`
- cache genérico de coleções
  - `collection_meta`
  - `collection_tracks`

`collection_tracks` é a base para qualquer origem reproduzível fora do fluxo clássico de playlist.

Cada item de coleção é persistido com:

- `collection_type`
- `collection_id`
- `position`
- `video_id`
- `title`
- `artists_json`
- `album_name`
- `album_id`
- `duration`
- `duration_secs`
- `thumbnail_url`

#### Queue

`PlaybackQueue` em `src-tauri/src/playback_queue.rs` mantém:

- `source_items`
- `playback_items`
- `current_index`
- `playlist_id`
- `is_complete`
- `shuffle`
- `repeat`

Ela expõe:

- snapshot da fila
- janela paginada da fila
- comandos de navegação e mutação

### Frontend

Arquivos principais:

- `src/modules/youtube-music/index.tsx`
- `src/modules/youtube-music/stores/queue-store.ts`
- `src/modules/youtube-music/stores/track-cache-store.ts`
- `src/modules/youtube-music/services/track-collections.ts`
- `src/modules/youtube-music/components/queue/queue-sheet.tsx`

#### Queue visual

`queue-store.ts` mantém somente estado visual e projeção:

- páginas já carregadas da queue
- `revealedCount`
- `totalLoaded`
- janela atual

Ele não é dono da fila lógica.

#### Cache de tracks no frontend

`track-cache-store.ts` é um cache L1 em memória:

- usado para hidratar rapidamente itens visíveis
- alimentado por `yt_get_cached_tracks`
- usado pela `Queue` e por trechos da UI que precisam resolver `videoId -> Track`

#### Serviço compartilhado de coleção

`track-collections.ts` é a ponte frontend para coleções reproduzíveis.

Hoje ele oferece:

- `createTrackCollectionId(...)`
- `toTrackCollectionEntry(...)`
- `fromCollectionWindowItem(...)`
- `cacheFiniteTrackCollection(...)`

Uso esperado:

1. a página obtém tracks da origem remota
2. persiste a coleção no backend
3. lê a janela e os `trackIds` da coleção persistida
4. passa esses dados para a UI e para o playback

## Contratos IPC relevantes

### Playlist

Ainda existe um fluxo específico para playlist:

- `yt_load_playlist`
- `yt_get_playlist_track_ids`
- `yt_get_playlist_window`

Além disso, a playlist também grava no cache genérico de coleção.

### Coleção genérica

Novos comandos:

- `yt_cache_collection_snapshot`
- `yt_get_collection_track_ids`
- `yt_get_collection_window`

Objetivo:

- permitir que qualquer página reproduzível persista suas tracks no backend
- expor playback/queue com a mesma semântica entre origens diferentes

### Queue

Comandos principais:

- `yt_queue_set`
- `yt_queue_get_state`
- `yt_queue_get_window`
- `yt_queue_play_index`
- `yt_queue_next`
- `yt_queue_previous`
- `yt_queue_handle_track_end`
- `yt_queue_add_next`
- `yt_queue_remove`
- `yt_queue_toggle_shuffle`
- `yt_queue_cycle_repeat`
- `yt_queue_clear`

## Como cada tipo de página deve funcionar

### Playlist

Fluxo especial:

1. carregar via `yt_load_playlist`
2. persistir primeira página
3. continuar em background via continuação
4. emitir `playlist-tracks-updated`
5. atualizar queue e cache conforme batches chegam

### Álbum / Artist Songs / Top Songs / Search Songs

Fluxo finito padrão:

1. buscar dados remotos
2. mapear para `Track[]`
3. persistir snapshot inteiro como coleção reproduzível
4. ler `trackIds` e janela persistida
5. usar índice absoluto para `play` e `play all`

Essas coleções devem ser tratadas como `isComplete=true` logo após o snapshot inicial.

### Home / Explore

Hoje essas telas ainda têm duas categorias de interação:

- navegação para outra página
- toque direto de item/coleção

Regra:

- se a UI só navega, não precisa de paginação própria
- se a UI toca uma lista coerente de músicas, essa lista deve ser registrada como coleção reproduzível

## Estado visual de reprodução

O componente visual compartilhado é `TrackTable`.

Para que a linha tocando mostre:

- fundo selecionado
- equalizer no lugar do número
- play/pause correto

a página precisa passar:

- `currentTrackId`
- `isPlaying`

Isso é responsabilidade da página chamadora, não do `TrackTable`.

## Regras obrigatórias para novas páginas

Qualquer nova página com lista reproduzível deve obedecer estas regras:

1. Não usar array local do React como fonte de verdade da queue.
2. Não usar `findIndex(videoId)` como estratégia principal de playback.
3. Persistir a lista no backend como coleção reproduzível.
4. Usar índice absoluto da coleção para tocar a faixa correta.
5. Alimentar `onPlayAll` com `queueTrackIds` vindos da coleção persistida.
6. Passar `currentTrackId` e `isPlaying` ao componente visual quando houver linha tocando.

Se a página não obedecer isso, ela vai divergir de `playlist` e voltar a ter bugs de:

- ordem
- queue
- cache
- destaque visual

## Decisão arquitetural importante

O `TrackTable` continua sendo somente UI.

Ele não deve:

- decidir ordem real
- decidir fila
- resolver cache
- inferir coleção

Toda regra de playback/queue/cache deve ficar na camada de coleção reproduzível.

## Queue: funcionamento esperado

### Backend

A queue lógica pode conter a lista inteira.

### Frontend

A queue visual não precisa mostrar tudo de uma vez.

Ela usa:

- `revealedCount`
- janelas de 50 itens
- carregamento visual progressivo

Ao fechar:

- o conteúdo visual desmonta
- o estado visual é resetado
- o cache L1 só deve expulsar o que foi carregado especificamente pela queue, preservando o baseline anterior

## Cache de tracks: papel correto

`yt_get_cached_tracks` não é a origem primária de listas.

Ele serve para:

- resolver metadados de `videoId`s já persistidos
- hidratar queue e UI visível
- evitar que a UI dependa do payload bruto original da página

Se uma origem nunca persistiu suas tracks no backend, `yt_get_cached_tracks` não vai conseguir resolver a maioria dos itens. Esse foi exatamente o bug visto em álbum/artista antes da migração.

## Fluxo resumido de playback

### Play All

1. página resolve a coleção persistida
2. obtém `trackIds` ordenados
3. chama `onPlayAll(tracksVisiveis, startIndex, playlistId?, isComplete, { queueTrackIds })`
4. `index.tsx` chama `queueSetQueue(...)`
5. backend passa a ser dono da fila
6. player do frontend toca o `trackId` atual

### Play por linha

1. página usa posição absoluta da linha clicada
2. envia `startIndex` correto
3. queue nasce já alinhada com a coleção

## Checklist de validação manual

### Playlist

- abrir playlist grande
- tocar faixa no meio
- validar queue
- validar incremento em background

### Álbum

- tocar qualquer faixa
- abrir queue
- fechar e reabrir queue
- validar que não há placeholders indevidos

### Artist

- tocar item de `top songs`
- validar destaque visual
- validar queue

### Artist Songs

- tocar faixa
- validar índice correto
- validar queue

### Search Songs

- tocar faixa de busca
- validar queue e destaque visual

### Home / Explore

- tocar item de listas registradas
- validar que queue resolve metadados corretamente

## Debugs úteis

Logs importantes já existentes:

- `yt_queue_get_window`
- `yt_get_cached_tracks`
- `QueueStore loadWindow`
- `QueueSheet opening / closing`
- `QueueSheetContent render row mapping`

Esses logs ajudam a confirmar:

- ordem da queue
- janela pedida
- janela renderizada
- resolução de tracks no cache

## Limitações atuais

- `home` e `explore` hoje registram coleções, mas ainda não usam o mesmo fluxo rico de página paginada
- `playlist` continua com um caminho mais especial por causa do background fetch incremental
- ainda existe débito técnico para documentar testes automatizados desse fluxo

## Diretriz para evolução futura

Se uma página nova tiver lista reproduzível, o implementador deve começar pela camada de coleção reproduzível e só depois ligar a UI.

Nunca fazer o caminho inverso:

- primeiro montar a tabela
- depois improvisar playback/queue

Foi isso que gerou a divergência histórica entre `playlist` e as demais páginas.

## Arquivos principais para manutenção

Backend:

- `src-tauri/src/playlist_cache.rs`
- `src-tauri/src/youtube_music/commands.rs`
- `src-tauri/src/playback_queue.rs`

Frontend:

- `src/modules/youtube-music/services/yt-api.ts`
- `src/modules/youtube-music/services/track-collections.ts`
- `src/modules/youtube-music/stores/queue-store.ts`
- `src/modules/youtube-music/stores/track-cache-store.ts`
- `src/modules/youtube-music/components/queue/queue-sheet.tsx`

Páginas que já participam do modelo:

- `PlaylistPage`
- `AlbumPage`
- `ArtistPage`
- `ArtistSongsPage`
- `SearchResultsPage`

## Resumo final

A regra do módulo agora é simples:

- listas reproduzíveis são coleções backend-first
- queue é dona da lógica de reprodução
- frontend só projeta e renderiza
- `TrackTable` é UI, não arquitetura

Seguir essa regra é o que evita que mudanças futuras corrijam uma página e deixem as outras para trás.
