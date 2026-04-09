# YouTube Music: Playback, Queue, Shuffle e Repeat

## Objetivo

Documentar a arquitetura atual de reprodução do módulo YouTube Music, com foco em:

- coleções reproduzíveis
- fila global
- likes de track como estado backend-first adjacente ao playback
- semântica de `shuffle`
- semântica de `repeat`
- responsabilidades entre backend Rust e frontend React

Para o coração de músicas, ver também:

- [YouTube Music Track Likes](./docs/youtube-music-track-likes.md)

Esta documentação existe para evitar que mudanças futuras corrijam apenas uma página e deixem o restante do app para trás.

## Princípio central

Toda lista reproduzível deve seguir a mesma regra:

- a página define a coleção e o índice inicial
- o backend passa a ser dono da fila lógica
- o frontend só projeta estado visual e toca o áudio

Isso vale para:

- playlist
- álbum
- top songs de artista
- artist songs
- search songs
- coleções de músicas vindas de home/explore

## Modelo mental

Existem três camadas separadas.

### 1. Coleção reproduzível

Representa uma lista ordenada de músicas oriunda de alguma página.

Exemplos:

- `playlist`
- `album`
- `artist-songs`
- `search-songs`
- `home-section`
- `explore-section`

Ela define:

- ordem original da origem
- `trackIds`
- metadados persistidos da coleção

### 2. Fila global

Representa a ordem efetiva de reprodução da coleção no momento atual.

Ela define:

- faixa atual
- ordem efetiva do ciclo
- histórico de reprodução
- `shuffle`
- `repeat`
- inserções de `add next`

### 3. Player visual

Fica no frontend.

Ele define:

- `HTMLAudio`
- play/pause
- seek
- volume
- barra de progresso
- projeção visual da queue

O frontend não é a fonte de verdade da lógica de navegação da fila.

## Responsabilidades por camada

### Backend Rust

Arquivos principais:

- `src-tauri/src/playback_queue.rs`
- `src-tauri/src/youtube_music/commands.rs`
- `src-tauri/src/playlist_cache.rs`

Responsabilidades:

- manter a fila lógica global
- manter ordem original da coleção
- derivar ordem efetiva de reprodução
- decidir `next`, `previous`, `track end`
- aplicar `shuffle` e `repeat`
- inserir `add next`
- manter cache SQLite de coleções reproduzíveis
- expor snapshots e janelas da queue

### Frontend React

Arquivos principais:

- `src/modules/youtube-music/stores/player-store.ts`
- `src/modules/youtube-music/stores/queue-store.ts`
- `src/modules/youtube-music/components/layout/player-bar.tsx`
- `src/modules/youtube-music/components/queue/queue-sheet.tsx`
- `src/modules/youtube-music/services/track-collections.ts`

Responsabilidades:

- tocar o stream da faixa atual
- refletir o snapshot do backend
- abrir e renderizar a queue
- hidratar metadados visíveis de tracks
- enviar comandos globais de fila

## Coleções reproduzíveis

O app usa um cache genérico de coleções em SQLite.

Tabelas principais:

- `collection_meta`
- `collection_tracks`

Cada item persistido guarda pelo menos:

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

### Regra de integração

Qualquer página com:

- play all
- play por linha
- ordem consistente
- integração com queue

deve persistir a coleção no backend antes de iniciar playback.

### Fluxos existentes

#### Playlist

Fluxo especial:

- `yt_load_playlist`
- snapshot inicial
- continuação em background
- `playlist-tracks-updated`
- batches incrementais para a fila

#### Coleções finitas

Fluxo padrão:

- buscar origem remota
- mapear para `Track[]`
- persistir via `yt_cache_collection_snapshot`
- ler `trackIds` via `yt_get_collection_track_ids`
- ler janela via `yt_get_collection_window`

Essas coleções ficam `isComplete=true` após o snapshot inicial.

## Estrutura da fila global

`PlaybackQueue` mantém:

- `source_items`
  - ordem original da coleção
- `playback_items`
  - ordem efetiva de reprodução do ciclo atual
- `current_index`
  - posição atual em `playback_items`
- `history_item_ids`
  - histórico real para `previous` em shuffle
- `queued_next_item_ids`
  - itens inseridos manualmente para tocar em seguida
- `shuffle`
- `repeat`
- `playlist_id`
- `is_complete`

## Semântica oficial de shuffle

### Estado desligado

Quando `shuffle=false`:

- `playback_items = source_items`
- `next` e `previous` usam a ordem original
- desligar o shuffle deve reposicionar a faixa atual na ordem original sem trocar a música atual

### Estado ligado

Quando `shuffle=true`:

- a faixa atual deve permanecer tocando
- apenas o futuro da fila pode ser embaralhado
- o histórico já tocado não deve ser reorganizado retroativamente
- `previous` deve usar histórico real, não “índice anterior do array”

### Novo ciclo com repeat all

Quando:

- `shuffle=true`
- `repeat=all`
- a última faixa do ciclo termina

então o backend deve:

- iniciar um novo ciclo embaralhado
- limpar o histórico do ciclo anterior
- escolher uma nova faixa inicial do novo ciclo
- reconstruir o futuro da fila para o próximo loop

Isso evita que a repetição do ciclo volte para um prefixo antigo que pareça ordem normal.

## Semântica oficial de repeat

### `off`

- ao chegar no fim da fila, a reprodução para
- `next` no fim retorna sem próxima faixa

### `all`

- em fila linear, o fim faz wrap para o começo
- em fila com shuffle, o fim inicia um novo ciclo embaralhado

### `one`

- no fim natural da faixa, a mesma faixa recomeça
- `next` manual não deve ficar preso na mesma faixa
- `previous` manual mantém seu comportamento normal

## Semântica oficial de navegação

### `next`

Regra:

- avança para o próximo item da ordem efetiva
- no fim:
  - `repeat=off`: para
  - `repeat=all` linear: vai para o primeiro item
  - `repeat=all` com shuffle: cria novo ciclo embaralhado

### `previous`

Regra:

- se o player já passou de alguns segundos, o frontend só faz `seek(0)`
- se não, chama o backend

Com `shuffle=false`:

- volta para o item anterior da ordem efetiva
- no início com `repeat=all`, faz wrap para o último

Com `shuffle=true`:

- volta para a faixa realmente tocada antes, via `history_item_ids`
- no início do histórico com `repeat=all`, pode fazer wrap para o fim do ciclo atual

### `add next`

Regra:

- sempre entra logo após a atual
- vários `add next` preservam ordem de inserção
- têm precedência sobre o bloco futuro do shuffle

## Queue visual

O backend é dono da fila lógica.

O frontend mantém só a projeção visual em [queue-store.ts](/./src/modules/youtube-music/stores/queue-store.ts):

- `totalLoaded`
- `revealedCount`
- páginas já carregadas
- `currentIndex`
- estado visual de reveal

### Regra importante

`revealedCount` é estado visual. Ele não é a fila lógica.

Fechar a queue:

- desmonta a lista visual
- reseta o reveal
- pode descartar tracks carregadas só pela queue
- não destrói a fila lógica global no backend

## Player frontend

O player continua com `HTMLAudio` em [player-store.ts](/./src/modules/youtube-music/stores/player-store.ts).

Regras:

- o backend escolhe a próxima faixa
- o frontend só toca o `videoId` retornado
- em `repeat one`, se a mesma faixa voltar, o frontend deve reutilizar a instância atual:
  - `seek(0)`
  - `play()`
- não criar semântica paralela de shuffle ou repeat na UI

## Contratos IPC relevantes

### Coleções

- `yt_cache_collection_snapshot`
- `yt_get_collection_track_ids`
- `yt_get_collection_window`

### Queue

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

## Debugs recomendados

Os debugs do backend da fila devem continuar sendo a referência principal para validar semântica:

- `set_queue`
- `append_playlist_batch`
- `play_index`
- `next_track`
- `previous_track`
- `handle_track_end`
- `add_next`
- `remove_index`
- `toggle_shuffle`
- `cycle_repeat`
- `clear`

Campos mínimos úteis:

- `current_index`
- `current_track`
- `history_len`
- `queued_next_len`
- próximos itens do bloco futuro

## Regras para futuras mudanças

Qualquer mudança em playback deve respeitar estas regras:

- não implementar lógica de fila específica por página
- não decidir `shuffle` ou `repeat` no frontend
- não usar `findIndex(videoId)` como verdade da posição de reprodução
- não fazer `previous` em shuffle por índice simples
- não tratar queue visual como dona da fila lógica

Se uma nova tela tiver lista reproduzível, ela deve:

- persistir coleção no backend
- usar `trackIds` do backend para `Play All`
- usar índice absoluto da linha clicada
- delegar shuffle/repeat/next/previous à fila global

## Checklist de validação manual

- playlist grande com `shuffle` ligado
- álbum pequeno com `repeat one`
- `previous` após sequência embaralhada
- `add next` com shuffle ligado
- `repeat all` no fim do ciclo linear
- `repeat all` no fim do ciclo embaralhado
- abrir/fechar/reabrir queue sem perder consistência
- conferir queue visual refletindo a ordem efetiva atual

## Relação com a documentação anterior

Existe uma doc anterior focada em coleções reproduzíveis em:

- `doc/youtube-music-track-collections.md`

Esta nova doc em `/docs/` complementa a anterior com o comportamento global de playback, queue, shuffle e repeat.
