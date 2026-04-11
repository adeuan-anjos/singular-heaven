# YouTube Music — Iniciar rádio (Start Radio)

**Status**: design proposto, aguardando revisão
**Data**: 2026-04-11
**Módulo afetado**: `youtube-music`
**Pré-requisito merged**: `e40583a` (session refresh)

## 1. Contexto

O YouTube Music oferece um recurso chamado **Iniciar rádio**, disponível no
menu de contexto de música, playlist, álbum e artista. Ao acionar, a fila
de reprodução é substituída por uma **estação dinâmica** de recomendações
relacionadas ao item selecionado, que continua carregando novas faixas
conforme o usuário avança.

Hoje o app ainda não suporta essa feature. O crate `ytmusic-api` em Rust
possui um método `get_watch_playlist` rudimentar que:

- aceita somente `videoId`
- sempre monta `playlistId = RDAMVM{video_id}` hardcoded
- não aceita a flag `radio` nem `playlist_id`
- não itera continuation tokens — retorna apenas a primeira página (~25 faixas)
- expõe apenas o comando Tauri `yt_get_watch_playlist`, que nunca é chamado
  pelo frontend

A versão Python de referência (`ytmusicapi`) aceita todos esses parâmetros e
itera continuation tokens internamente até satisfazer `limit`. Nosso trabalho
é portar fielmente esse comportamento para o Rust e expor uma experiência
de rádio completa na UI.

## 2. Validação empírica da API

Os números abaixo foram obtidos chamando `ytmusicapi.YTMusic().get_watch_playlist`
sem autenticação contra o YouTube Music real (vide `tmp/test_radio.py`).

**Rádio de música** (`videoId=X, radio=True`):

| limit pedido | faixas retornadas |
|-------------:|------------------:|
|           25 |                50 |
|          100 |               148 |
|          500 |               504 |
|        1 000 |             1 001 |
|        2 000 |         1 748 cap |

O "pool" por seed é de aproximadamente **1 700 faixas** — efetivamente
infinito para o usuário, mas finito o suficiente para dimensionar cache.

**Rádio de playlist** (`playlistId=X, radio=True`):

- As N primeiras faixas são as próprias faixas da playlist (overlap 50/50
  entre `shuffle=True` e `radio=True` nas primeiras posições).
- Depois estende com recomendações.

**Rádio de álbum** (`audioPlaylistId` do álbum, `radio=True`):

- Retorna apenas ~20 faixas (faixas do álbum + poucas recomendações).
- É isso que a API devolve mesmo; o cliente oficial do YouTube Music faz
  continuation adicional enquanto o usuário rola a lista. Precisamos
  replicar essa continuation.

**Shuffle vs radio são mutuamente exclusivos**. A lib Python bloqueia
`shuffle=True` quando `radio=True`.

**Re-roll**: duas chamadas consecutivas do mesmo seed retornam
aproximadamente as mesmas faixas em ordem diferente. É assim que o botão
shuffle se comporta quando a fila está em modo rádio.

## 3. Escopo funcional

### 3.1 Pontos de entrada

O botão **Iniciar rádio** aparece em:

1. Menu de contexto de uma faixa (qualquer lugar: playlist, álbum, fila, search).
2. Menu de contexto de uma playlist.
3. Menu de contexto de um álbum.
4. Menu de contexto de um artista (quando `artist.radioId` está presente).
5. Página do artista: botão "Rádio" existente, que hoje é stub vazio
   (`src/modules/youtube-music/components/pages/artist-page.tsx:143`).

### 3.2 Comportamento ao iniciar um rádio

1. A fila atual é substituída pela estação.
2. O player começa a tocar a primeira faixa da estação imediatamente.
3. A fila entra em **modo rádio**, sinalizado visualmente por um badge discreto
   (detalhes em §7.5).
4. O botão de shuffle passa a significar **re-rolar a estação** (ver §3.4).
5. O repeat continua funcionando normalmente (`off`, `all`, `one`).
6. Sair do modo rádio acontece quando o usuário toca outra playlist, álbum
   ou música avulsa — a fila é substituída e a flag é limpa.

### 3.3 Continuation sob demanda

Quando o usuário está em modo rádio e a fila está próxima do fim, o **Rust**
(não o frontend) dispara uma continuation em background e estende a fila.

- Primeira chamada: `limit = 50` para latência baixa (~1s para começar a tocar).
- Trigger de continuation: quando faltam 10 ou menos faixas não tocadas na fila.
- Próxima chamada: pede mais 50 faixas com continuation token.
- Limite prático: parar de pedir quando o pool do seed esgotar ou atingir
  um cap defensivo (sugestão: 2 000 faixas acumuladas no pior caso).
- Se a continuation falhar, logar e deixar a fila finalizar naturalmente.

### 3.4 Re-roll (shuffle em modo rádio)

O ícone de shuffle continua visível e clicável quando a fila está em modo
rádio, mas seu clique agora:

1. Mantém a faixa atual tocando sem interrupção.
2. Mantém o histórico (faixas já tocadas) intocado.
3. Descarta o "a seguir" (faixas depois de `currentIndex`).
4. Chama a API de rádio novamente com o mesmo seed.
5. Insere as novas faixas depois da atual.
6. Exibe um toast `Estação atualizada` para confirmar a ação.

O ícone de shuffle **não fica aceso** em modo rádio — ele é um botão de ação,
não um toggle de estado.

### 3.5 Semântica por tipo de seed

| Tipo de seed | Identificador usado | Comportamento da fila inicial |
|---|---|---|
| Música    | `videoId`                      | Primeira faixa = seed, depois recomendações |
| Playlist  | `playlistId`                   | Faixas da playlist, depois recomendações    |
| Álbum     | `audioPlaylistId` do álbum     | Faixas do álbum, depois recomendações       |
| Artista   | `artist.radioId` (é um videoId)| Igual rádio de música                       |

## 4. Arquitetura: backend-first

O Rust é o dono único do estado do rádio. O frontend não conhece continuation
tokens, não sabe quantas faixas já foram carregadas, não decide quando
buscar mais. O frontend faz três coisas apenas:

1. Disparar `yt_radio_start` quando o usuário clica iniciar rádio.
2. Disparar `yt_radio_reroll` quando o usuário clica shuffle em modo rádio.
3. Refletir o estado da fila no UI, via o mesmo mecanismo de paginação que
   já existe (`pages`, `revealedCount`, `pagesVersion`).

Todo o resto — continuation, re-roll, evict de faixas antigas, troca entre
modo rádio e modo normal — acontece no Rust.

### 4.1 Reutilização da queue existente

Não criamos uma "queue de rádio" separada. A `PlaybackQueue` em
`src-tauri/src/playback_queue.rs` já tem tudo que precisamos:

- trilhos de `trackIds` ordenados
- `currentIndex`
- flags `shuffle`, `repeat`, `isComplete`
- `playlistId` como identificador de contexto

Precisamos apenas estender `PlaybackQueue` com:

- `radio_state: Option<RadioState>` — quando `Some(_)`, a fila está em modo rádio.
- `RadioState { seed: RadioSeed, continuation: Option<String>, pool_exhausted: bool, loaded_count: usize }`.
- `RadioSeed { kind: RadioSeedKind, id: String }`, onde `RadioSeedKind ∈ {Video, Playlist, Album, Artist}`.

Quando `radio_state` está `Some`:

- `isComplete` é sempre `false`.
- O botão shuffle vira re-roll (o backend expõe isso via snapshot).
- `yt_queue_handle_track_end` verifica se faltam ≤ 10 faixas e, se sim,
  dispara continuation em background via `tokio::spawn`.

Quando o usuário toca outra playlist/álbum/música via `yt_queue_set`, o
`radio_state` é resetado para `None`.

### 4.2 Pattern de session refresh (já no master)

Toda chamada nova ao `YtMusicClient` precisa passar por `with_session_refresh`
(`src-tauri/src/youtube_music/session.rs`), do mesmo jeito que `yt_search`
foi adaptado no commit `e40583a`. A assinatura de cada comando novo é:

```rust
pub async fn yt_radio_start(
    seed_kind: String,
    seed_id: String,
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
    queue: State<'_, Arc<Mutex<PlaybackQueue>>>,
    cache: State<'_, Arc<Mutex<PlaylistCache>>>,
) -> Result<String, String>
```

A chamada ao client fica dentro de `with_session_refresh(...)`, que já trata
401 automático e mark_success.

## 5. Mudanças no crate `ytmusic-api`

### 5.1 Nova assinatura de `get_watch_playlist`

`crates/ytmusic-api/src/api/watch.rs`:

```rust
pub struct WatchPlaylistRequest<'a> {
    pub video_id: Option<&'a str>,
    pub playlist_id: Option<&'a str>,
    pub radio: bool,
    pub shuffle: bool,
    pub limit: usize,
}

impl YtMusicClient {
    pub async fn get_watch_playlist(
        &self,
        req: WatchPlaylistRequest<'_>,
    ) -> Result<WatchPlaylist>;

    pub async fn get_watch_playlist_continuation(
        &self,
        continuation: &str,
        limit: usize,
    ) -> Result<WatchPlaylist>;
}
```

### 5.2 Lógica de montagem do `playlistId`

Port direto de `ytmusicapi/mixins/watch.py`:

- Se `radio=True` e há `video_id` sem `playlist_id`: `playlistId = "RDAMVM" + video_id`.
- Se `radio=True` e há `playlist_id`: prefixa com `"RDAMPL"` quando o id não
  começa com `RD`.
- Se `shuffle=True` e `radio=False`: prefixa com `"RDAMPL"` idem.
- `shuffle=True` + `radio=True` é rejeitado com erro de validação.

Validar o comportamento exato lendo `get_watch_playlist` em
`ytmusicapi/mixins/watch.py` na lib instalada (referência, não runtime).

### 5.3 Loop de continuation dentro do crate

O método `get_watch_playlist(..., limit=N)` faz:

1. POST inicial em `next` com o body correto.
2. Parse → `WatchPlaylist { tracks, continuation, lyrics_browse_id, related_browse_id }`.
3. Enquanto `tracks.len() < limit` e `continuation.is_some()`:
   - POST em `next` com `{continuation, type: "NEXT"}`.
   - Parse da nova página, concatena tracks, atualiza `continuation`.
4. Retorna quando atingir limite ou acabar o pool.

Adicionar logging denso em cada iteração (quantas tracks, ms por chamada).

### 5.4 Tipo `WatchPlaylist` estendido

`crates/ytmusic-api/src/types/watch.rs`:

```rust
pub struct WatchPlaylist {
    pub tracks: Vec<WatchTrack>,
    pub continuation: Option<String>,
    pub lyrics_browse_id: Option<String>,
    pub related_browse_id: Option<String>,
}

pub struct WatchTrack {
    pub video_id: String,
    pub title: String,
    pub artists: Vec<ArtistRef>,
    pub length: Option<String>,      // renomeado de duration — é o que a API retorna
    pub thumbnails: Vec<Thumbnail>,
    pub like_status: Option<LikeStatus>,
    pub video_type: Option<String>,  // MUSIC_VIDEO_TYPE_OMV, etc
    pub views: Option<String>,
}
```

`album` é removido porque a API de watch nunca popula esse campo. Manter
`duration` renomeado para `length` por fidelidade ao JSON raw; mapping para
`durationSeconds` acontece no frontend como hoje.

### 5.5 Parser

`crates/ytmusic-api/src/parsers/watch.rs` precisa:

- extrair `continuation` de `continuationContents.playlistPanelContinuation.continuations`
- distinguir entre primeira página (`next` response) e página continuation
- porte direto do parser Python

## 6. Mudanças no Rust (src-tauri)

### 6.1 Novos comandos Tauri

```rust
#[tauri::command]
pub async fn yt_radio_start(
    seed_kind: String,    // "video" | "playlist" | "album" | "artist"
    seed_id: String,
    ...
) -> Result<String, String>;

#[tauri::command]
pub async fn yt_radio_reroll(
    ...
) -> Result<String, String>;
```

Ambos retornam um `QueueCommandResponse` JSON-serializado — mesma shape que
os demais comandos de queue, para o frontend reutilizar o código de sync.

Não há `yt_radio_continuation` público. Continuation é um detalhe interno
disparado pelo `yt_queue_handle_track_end` quando detecta `radio_state` ativo
e fila curta.

### 6.2 `yt_queue_set` reseta o rádio

Todas as chamadas existentes de `yt_queue_set`, `yt_queue_add_collection_next`,
`yt_queue_append_collection` passam a limpar `radio_state` para `None` — o
usuário saindo do rádio ao tocar qualquer coisa "normal".

### 6.3 Integração com `PlaylistCache`

Os track ids do rádio precisam alimentar o mesmo cache SQLite que playlists
e álbuns usam (`playlist_cache.rs::cache_collection_snapshot`), para o L1/L2
cache do frontend funcionar igual. O `collection_type` ganha o valor
`"radio"`, e o `isComplete` fica `false` sempre.

### 6.4 Continuation em background

Dentro de `yt_queue_handle_track_end`:

```rust
if let Some(radio) = queue.radio_state.as_ref() {
    let remaining = queue.track_ids.len() - queue.current_index - 1;
    if remaining <= 10 && !radio.pool_exhausted && radio.continuation.is_some() {
        let app = app_handle.clone();
        tokio::spawn(async move {
            continue_radio(app).await;
        });
    }
}
```

`continue_radio` pega lock do state, chama
`client.get_watch_playlist_continuation(token, 50)` via `with_session_refresh`,
appenda os novos track ids na queue, atualiza `radio_state.continuation` e
`loaded_count`, marca `pool_exhausted` se a API retornar vazio. Emite um
event `"radio-extended"` que o frontend usa para refazer `pages` apenas da
região afetada.

## 7. Mudanças no frontend

### 7.1 Services

`src/modules/youtube-music/services/yt-api.ts`:

```typescript
export type RadioSeedKind = "video" | "playlist" | "album" | "artist";

export async function ytRadioStart(
  seedKind: RadioSeedKind,
  seedId: string,
): Promise<QueueCommandResponse>;

export async function ytRadioReroll(): Promise<QueueCommandResponse>;
```

### 7.2 Queue store

`queue-store.ts` ganha um campo `isRadio: boolean` derivado do snapshot que o
backend retorna. O `shuffle` existente continua existindo, mas quando
`isRadio=true`, o `toggleShuffle()` é substituído por `rerollRadio()`:

```typescript
toggleShuffle: async () => {
  if (get().isRadio) {
    await ytRadioReroll();
    toast("Estação atualizada");
    return;
  }
  // ... comportamento atual
}
```

### 7.3 Actions context

`actions-context.tsx` ganha:

```typescript
onStartRadio: (seed: { kind: RadioSeedKind; id: string }) => Promise<void>;
```

### 7.4 UI — pontos de entrada

Adicionar o item "Iniciar rádio" nos menus de contexto:

- `artist-page.tsx:143` — conectar o botão existente
- menu de contexto de faixa (wherever ele mora; investigar antes de editar)
- menu de contexto de playlist
- menu de contexto de álbum
- menu de contexto de artista card

Cada ponto chama `onStartRadio({ kind, id })` e nada mais. A UI não se
importa com continuation, cache, ordem — tudo isso está no Rust.

### 7.5 Indicador visual de modo rádio

Um badge discreto na fila ou no player bar mostrando "Rádio" + pequeno ícone
de ondas (lucide `Radio`). Quando `isRadio=true`, mostrar. Quando `false`,
esconder. Sem animação, sem cor destacada — é só informativo.

## 8. Memória

- O cap defensivo de 2 000 faixas acumuladas protege o caso patológico do
  usuário deixar o rádio rodando por horas. Quando atinge o cap, paramos
  de pedir continuation (o pool do seed normalmente esgota antes disso de qualquer jeito).
- O L1 cache de tracks no frontend (`track-cache-store.ts`) já tem LRU com
  teto de 2 000 tracks. Rádio não requer mudança nisso.
- O SQLite do `PlaylistCache` tem append-only para o tipo `radio`. Ao sair
  do modo rádio (usuário toca outra coisa), o snapshot antigo permanece no
  SQLite até o próximo cleanup — aceitável porque o peso é pequeno (~1 KB por faixa).
- Sidecars: não há sidecar envolvido. Toda a lógica é in-process Rust.

## 9. Casos de borda

- **Rádio dentro de rádio**: usuário inicia rádio a partir de uma faixa que
  foi recomendada por outro rádio. Comportamento: backend limpa `radio_state`
  e cria um novo com o novo seed. A faixa que estava tocando é interrompida
  pela faixa-seed do novo rádio — mesmo que o YouTube Music oficial.
- **Re-roll antes da primeira continuation**: a fila tem só as 50 iniciais e
  o usuário clica re-roll. Mesmo seed → nova chamada. Funciona normalmente,
  mesma semântica do re-roll em fila longa.
- **API retorna vazio na continuation**: backend marca `pool_exhausted = true`,
  não tenta de novo, fila termina naturalmente quando a última faixa toca.
  Player para. Frontend mostra o mesmo comportamento de fim de fila normal.
- **Falha de rede no re-roll**: o backend devolve erro, o frontend mostra toast
  de erro. A fila atual fica como estava (não destrói o estado sem sucesso).
- **Sessão expira durante continuation**: `with_session_refresh` cuida
  automaticamente via o pattern já merged.

## 10. Testes

- **Unidade** (Rust, crate `ytmusic-api`):
  - montagem de `playlistId` para cada combinação seed/radio/shuffle
  - parse de primeira página vs continuation
  - rejeição de `radio=true` + `shuffle=true`
- **Unidade** (Rust, `playback_queue.rs`):
  - `radio_state` é limpo por `yt_queue_set`
  - `handle_track_end` dispara continuation quando faltam ≤ 10 e não antes
  - re-roll preserva faixa atual e histórico
- **Integração end-to-end manual**:
  - iniciar rádio de música → tocar → verificar que extend acontece
  - iniciar rádio de playlist → primeiras N faixas são da playlist
  - iniciar rádio de álbum → primeiras N faixas são do álbum
  - clicar shuffle em modo rádio → fila é re-rolada, faixa atual continua
  - tocar outra playlist → modo rádio sai

Toda chamada real à API fica atrás de um env var `SINGULAR_HAVEN_INTEGRATION_TESTS=1`
para não rodar em CI normal. Não mockamos o endpoint do YouTube — em vez
disso, cacheamos os JSONs reais obtidos em `tmp/radio_results/` e
rodamos testes do parser contra esses fixtures.

## 11. Fora do escopo desta iteração

- Rádio de search result (clicar "iniciar rádio" num resultado de busca).
  Pode ser adicionado trivialmente depois, mas vamos focar nos 4 entry points principais.
- Configuração de "variedade" do rádio (filtros por gênero, década). O endpoint
  não expõe isso sem dados de filtro da própria resposta.
- Persistência do modo rádio entre reinícios do app — se o usuário fecha o app
  no meio de um rádio, ao reabrir ele NÃO recarrega a estação. A fila é
  restaurada como fila normal congelada no último snapshot.
- Rádio colaborativo (P2P voice canal). Completamente fora.
- Letra / lyrics do modo rádio — apesar do endpoint retornar `lyrics_browse_id`,
  a integração com o futuro módulo de letras é uma feature separada.

## 12. Plano de execução sugerido (alto nível)

Fases propostas, cada uma com commit próprio:

1. **Crate `ytmusic-api`**: estender `get_watch_playlist` com o novo request
   struct, continuation loop, e novo tipo. Testes de unidade de parser.
2. **`playback_queue.rs`**: adicionar `radio_state` e lógica de reset. Testes.
3. **Comandos Tauri**: `yt_radio_start`, `yt_radio_reroll`, integração com
   continuation em background. Logs em todas as transições.
4. **Frontend services + store**: `ytRadioStart`, `ytRadioReroll`, `isRadio`
   no queue store, toggleShuffle que vira reroll em modo rádio.
5. **UI**: conectar botão do artist-page, adicionar nos menus de contexto
   de faixa/playlist/álbum/artista. Badge visual de modo rádio.
6. **Validação end-to-end manual** nos 4 entry points + re-roll + saída de rádio.

O plano detalhado (com arquivos, diffs e checkpoints) será escrito depois
da aprovação deste design pela skill `writing-plans`.
