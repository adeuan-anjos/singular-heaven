# YouTube Music: Track Likes

## Objetivo

Documentar a arquitetura atual do coração de músicas no módulo YouTube Music.

Escopo desta doc:

- curtir/descurtir faixa de verdade na conta do usuário
- fonte de verdade do `likeStatus`
- sincronização com a pseudo-playlist `liked`
- relação entre backend, cache local e UI

Fora de escopo:

- `DISLIKE` na UI principal
- “adicionar à biblioteca” de música
- like de artista, álbum ou playlist

## Regra de produto

Na UI atual, o coração de uma faixa significa apenas:

- `LIKE`
- `INDIFFERENT`

Ou seja:

- clicar quando não está curtida envia `LIKE`
- clicar quando já está curtida envia `INDIFFERENT`

Isso deve afetar a conta real do usuário no YouTube Music.

## Princípio central

Likes de track são `backend-first`.

Isso significa:

- o backend é a fonte de verdade da mutação
- a conta do usuário é a fonte de verdade final
- o frontend faz update otimista, mas precisa convergir para o estado real

O frontend não pode manter `useState` local como verdade do coração.

## Autenticação

O fluxo usa a mesma autenticação já adotada pelo módulo YouTube Music:

- cookies extraídos do navegador
- `SAPISIDHASH`
- `onBehalfOfUser` quando houver conta de marca

Arquivos principais:

- [auth.rs](/./crates/ytmusic-api/src/auth.rs)
- [client.rs](/./crates/ytmusic-api/src/client.rs)
- [commands.rs](/./src-tauri/src/youtube_music/commands.rs)

## Backend

### Mutação real de like

O crate `ytmusic-api` expõe a mutação real via InnerTube:

- `like/like`
- `like/removelike`

Arquivo:

- [library.rs](/./crates/ytmusic-api/src/api/library.rs)

Comando Tauri:

- `yt_rate_song(videoId, rating)`

Retorno:

- `videoId`
- `likeStatus`

### Leitura da coleção de curtidas

A fonte de verdade para a playlist “Gostei” é a playlist real `LM`:

- browse remoto: `VLLM`
- id lógico interno do app: `LM`

O backend expõe:

- `yt_get_liked_track_ids()`

Esse comando retorna os `videoId`s na ordem da playlist de curtidas.

Importante:

- essa lista pode conter entradas repetidas
- por isso o backend/store precisam distinguir contagem de itens da playlist de contagem única de `videoId`

### Alias `liked -> LM`

Na navegação do frontend, a página especial continua usando:

- `playlistId: "liked"`

No backend, isso é normalizado para:

- `LM`

Arquivo:

- [commands.rs](/./src-tauri/src/youtube_music/commands.rs)

## Frontend

### Store única de likes

O estado compartilhado de likes vive em:

- [track-like-store.ts](/./src/modules/youtube-music/stores/track-like-store.ts)

Responsabilidades:

- hidratar likes reais da conta
- aplicar update otimista
- fazer rollback em caso de erro
- sincronizar `likeStatus` com o cache L1 de tracks
- distinguir:
  - `playlistEntryCount`
  - `uniqueVideoIdCount`

### Cache L1 de tracks

O cache local de tracks em memória fica em:

- [track-cache-store.ts](/./src/modules/youtube-music/stores/track-cache-store.ts)

Ele não é dono da verdade do like, mas recebe atualização parcial de:

- `track.likeStatus`

Isso garante que:

- player
- tabelas
- rows
- queue

consigam refletir o mesmo coração sem estados paralelos.

### Componentes que consomem o estado compartilhado

Hoje os corações de track já leem do store compartilhado em:

- [player-bar.tsx](/./src/modules/youtube-music/components/layout/player-bar.tsx)
- [track-table.tsx](/./src/modules/youtube-music/components/shared/track-table.tsx)
- [track-row.tsx](/./src/modules/youtube-music/components/shared/track-row.tsx)

Isso substituiu os `useState` locais anteriores.

## Fluxo de interação

### Curtir/descurtir no app

Fluxo:

1. usuário clica no coração
2. frontend calcula próximo estado:
   - `INDIFFERENT -> LIKE`
   - `LIKE -> INDIFFERENT`
3. store aplica update otimista
4. backend chama `yt_rate_song`
5. em sucesso:
   - estado otimista é confirmado
6. em falha:
   - store faz rollback

### Mudança fora do app

Se o usuário:

- curtir no app
- descurtir no YouTube Music Web

então o app pode ficar stale por um tempo curto, mas deve convergir ao revalidar.

Gatilhos atuais de revalidação:

- autenticação pronta
- foco da janela
- abertura da playlist `liked`

Para evitar excesso de requests, existe cooldown no store.

## Playlist `liked`

### Fonte de dados

A playlist `liked` continua sendo uma playlist backend-first.

Ela usa:

- `yt_load_playlist("liked")`
- normalização backend para `LM`

### Convergência visual

Além do snapshot de playlist, a página `liked` também cruza o estado com o store de likes.

Arquivo:

- [playlist-page.tsx](/./src/modules/youtube-music/components/pages/playlist-page.tsx)

Objetivo:

- se a conta mudou fora do app, ao reabrir a página a UI converge
- uma faixa descurtida pode deixar de aparecer visualmente na lista

## Contagem: itens vs IDs únicos

Esta distinção é importante.

### `playlistEntryCount`

Representa:

- quantos itens existem na playlist `LM`

Pode incluir repetição do mesmo `videoId`.

### `uniqueVideoIdCount`

Representa:

- quantos `videoId`s únicos existem no snapshot usado para coração

Esse é o número usado para estado compartilhado de likes.

### Consequência

Os dois números podem divergir.

Isso não significa bug por si só.

## Debug

Logs principais:

- `yt_rate_song`
- `yt_get_liked_track_ids`
- `[TrackLikeStore] hydrate`
- `[TrackLikeStore] replaceLikedTrackIds`
- `[TrackLikeStore] optimistic update`
- `[TrackLikeStore] toggleTrackLike confirmed`
- `[TrackLikeStore] toggleTrackLike rollback`
- `[PlayerBar] like click`
- `[TrackTableRow] like click`
- `[TrackRow] like click`
- `[PlaylistPage] liked filter applied`

Esses logs devem sair serializados com `JSON.stringify(...)`, não como `Object`.

## Limitações conhecidas

- `CollectionHeader` de artista/coleção ainda não representa like real da conta.
- Parte do app ainda tem logs antigos saindo como `Object`.
- A revalidação ainda é por pull orientado a eventos locais; não existe push/websocket do YouTube Music.

## Regra para mudanças futuras

Nenhum novo coração de track deve:

- manter `useState` local como verdade
- enviar mutação direto da UI sem passar pelo store compartilhado
- confundir like de track com “salvar na biblioteca”

Se a mudança for sobre coração de música, ela deve passar por:

- backend cookie-auth
- `track-like-store`
- sincronização com `track-cache-store`
- convergência com a playlist `liked`
