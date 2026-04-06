# Referencia Completa: ytmusicapi (Python)

> Biblioteca Python nao-oficial para interagir com a API do YouTube Music.
> Repositorio: https://github.com/sigma67/ytmusicapi
> Documentacao: https://ytmusicapi.readthedocs.io
> PyPI: https://pypi.org/project/ytmusicapi/

---

## 1. Visao Geral

### O que e

`ytmusicapi` e uma biblioteca Python que emula as requisicoes do cliente web do YouTube Music, interagindo com a **InnerTube API** interna do Google. Nao usa a YouTube Data API v3 oficial — em vez disso, replica os mesmos endpoints que o navegador acessa ao usar o YouTube Music.

### Informacoes do Projeto

| Campo              | Valor                                    |
|--------------------|------------------------------------------|
| Versao atual       | **1.11.5** (31 de janeiro de 2026)       |
| Licenca            | MIT                                      |
| Python             | >= 3.10                                  |
| Mantenedor         | sigma67 (ytmusicapi@gmail.com)           |
| Status             | Ativamente mantido (~93 releases, 770+ commits) |
| Stars              | 2.600+                                   |
| Tamanho (wheel)    | 102.3 KB                                 |

### Como Funciona

1. A biblioteca constroi payloads JSON identicos aos que o cliente web do YouTube Music envia
2. Envia requisicoes POST para `https://music.youtube.com/youtubei/v1/` com uma API key publica
3. Parseia as respostas JSON complexas do InnerTube, extraindo os dados relevantes
4. Autenticacao e feita via headers OAuth ou cookies do navegador

### Constantes Internas

```python
YTM_DOMAIN = "https://music.youtube.com"
YTM_BASE_API = "https://music.youtube.com/youtubei/v1/"
YTM_PARAMS_KEY = "&key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30"
OAUTH_SCOPE = "https://www.googleapis.com/auth/youtube"
OAUTH_CODE_URL = "https://www.youtube.com/o/oauth2/device/code"
OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
```

### Idiomas Suportados (17)

Arabe, Tcheco, Alemao, Ingles, Espanhol, Frances, Hindi, Italiano, Japones, Coreano, Holandes, Portugues, Russo, Turco, Urdu, Chines Simplificado, Chines Tradicional.

### Regioes Suportadas

104 codigos de pais ISO 3166-1 Alpha-2 (incluindo BR, US, JP, GB, DE, etc.).

---

## 2. Autenticacao

### Tipos de Autenticacao

```python
class AuthType(int, Enum):
    UNAUTHORIZED          # Sem autenticacao
    BROWSER               # Cookies do navegador (depreciado)
    OAUTH_CUSTOM_CLIENT   # OAuth com client credentials customizados
    OAUTH_CUSTOM_FULL     # OAuth completo com headers formados
```

### 2.1 OAuth (Recomendado)

O metodo principal e recomendado de autenticacao. Usa o **Device Code Flow** do Google OAuth 2.0.

#### Fluxo Passo a Passo

```python
from ytmusicapi import YTMusic

# 1. Iniciar o setup OAuth (interativo)
YTMusic.setup(filepath="oauth.json")

# Ou programaticamente:
from ytmusicapi import setup_oauth
token = setup_oauth(
    client_id="SEU_CLIENT_ID",
    client_secret="SEU_CLIENT_SECRET",
    filepath="oauth.json",       # Onde salvar o token
    session=None,                # requests.Session opcional
    proxies=None,                # Proxies para autenticacao
    open_browser=False           # True para abrir navegador automaticamente
)
```

#### Como o Device Code Flow Funciona

1. A biblioteca solicita um **device code** ao Google (`OAUTH_CODE_URL`)
2. O usuario recebe uma URL de verificacao e um codigo
3. O usuario acessa a URL no navegador, faz login no Google e insere o codigo
4. A biblioteca troca o device code por um **access token + refresh token** (`OAUTH_TOKEN_URL`)
5. Os tokens sao salvos no arquivo `oauth.json`

#### Estrutura do `oauth.json`

```json
{
    "scope": "https://www.googleapis.com/auth/youtube",
    "token_type": "Bearer",
    "access_token": "ya29.a0...",
    "refresh_token": "1//0d...",
    "expires_at": 1706745600,
    "expires_in": 3600
}
```

#### Refresh Automatico de Tokens

A classe `RefreshingToken` intercepta todo acesso ao `access_token`. Se o token expira em menos de 60 segundos, automaticamente:

1. Chama `credentials.refresh_token(self.refresh_token)`
2. Atualiza `access_token` e `expires_at`
3. Salva o token atualizado no arquivo local (se `local_cache` estiver configurado)

```python
# Internamente:
class RefreshingToken(OAuthToken):
    def __getattribute__(self, item):
        if item == "access_token" and self.is_expiring:
            fresh = self.credentials.refresh_token(self.refresh_token)
            self.update(fresh)
            self.store_token()
        return super().__getattribute__(item)

    @property
    def is_expiring(self) -> bool:
        return self.expires_at - int(time.time()) < 60
```

#### Usando OAuth

```python
from ytmusicapi import YTMusic

# Com arquivo
yt = YTMusic("oauth.json")

# Com dict
yt = YTMusic(auth={"access_token": "...", "refresh_token": "...", ...})

# Com credenciais customizadas
from ytmusicapi.auth.oauth import OAuthCredentials
creds = OAuthCredentials(client_id="...", client_secret="...")
yt = YTMusic("oauth.json", oauth_credentials=creds)
```

### 2.2 Browser Headers (Depreciado)

Extrai headers de autenticacao do navegador manualmente.

```python
from ytmusicapi import YTMusic

# Setup interativo — cola os headers do DevTools
YTMusic.setup(filepath="browser.json")

# Ou com headers como string
YTMusic.setup(filepath="browser.json", headers_raw="cookie: ...\nx-goog-authuser: 0\n...")
```

#### Headers Necessarios

- `cookie` (obrigatorio)
- `authorization` (obrigatorio)
- `x-goog-authuser` (obrigatorio)

Headers removidos automaticamente: `sec-*`, `host`, `content-length`, `accept-encoding`.

O arquivo gerado e um JSON com os headers parseados. **Problema**: cookies expiram e nao ha refresh automatico.

### 2.3 Sem Autenticacao

```python
yt = YTMusic()  # Sem argumento auth
```

### O que Funciona Sem vs Com Autenticacao

| Funcionalidade           | Sem Auth | Com Auth |
|--------------------------|----------|----------|
| `search()`               | Sim      | Sim      |
| `get_artist()`           | Sim      | Sim      |
| `get_album()`            | Sim      | Sim      |
| `get_song()`             | Sim      | Sim      |
| `get_lyrics()`           | Sim      | Sim      |
| `get_watch_playlist()`   | Sim      | Sim      |
| `get_home()`             | Sim      | Sim (personalizado) |
| `get_charts()`           | Parcial* | Sim      |
| ~~`get_explore()`~~      | **Removido na v1.11.5** | — |
| `get_mood_categories()`  | Sim      | Sim      |
| Biblioteca pessoal       | Nao      | **Sim**  |
| Gerenciar playlists      | Nao      | **Sim**  |
| Avaliar musicas          | Nao      | **Sim**  |
| Historico                 | Nao      | **Sim**  |
| Inscrever em artistas    | Nao      | **Sim**  |
| Uploads                  | Nao      | **Sim** (apenas browser auth) |
| `get_account_info()`     | Nao      | **Sim**  |
| `get_tasteprofile()`     | Nao      | **Sim**  |

\* `get_charts()` sem auth retorna artistas sem ranking. `get_explore()` foi removido na v1.11.5.

---

## 3. Referencia Completa da API

### Instanciacao

```python
class YTMusic(
    auth: str | dict | None = None,      # Caminho do arquivo, JSON string, ou dict de tokens
    user: str | None = None,              # User ID para brand accounts
    requests_session: requests.Session | None = None,
    proxies: dict[str, str] | None = None,
    language: str = "en",                 # Idioma das respostas
    location: str = "",                   # Codigo de pais ISO
    oauth_credentials: OAuthCredentials | None = None
)
```

#### Context Manager (Interno)

> **Nota**: `as_mobile()` nao consta na referencia oficial da API. Pode ser interno ou experimental.

```python
# Emular cliente mobile Android (retorna resultados diferentes)
with yt.as_mobile():
    results = yt.search("query")
```

### Funcoes Standalone de Setup

#### `ytmusicapi.setup()`

Setup de browser auth via terminal. Solicita headers do navegador.

```python
def setup(
    filepath: str | None = None,
    headers_raw: str | None = None
) -> str
```

| Parametro     | Descricao |
|---------------|-----------|
| `filepath`    | Caminho para salvar os headers |
| `headers_raw` | Headers copiados do navegador. Caso contrario, solicitados via terminal |

**Retorno**: String de configuracao de headers.

#### `ytmusicapi.setup_oauth()`

Setup de OAuth via terminal. Inicia o Device Code Flow.

```python
def setup_oauth(
    client_id: str,
    client_secret: str,
    filepath: str | None = None,
    session: requests.Session | None = None,
    proxies: dict[str, str] | None = None,
    open_browser: bool = False
) -> RefreshingToken
```

| Parametro       | Descricao |
|-----------------|-----------|
| `client_id`     | Client ID do OAuth |
| `client_secret` | Client secret do OAuth |
| `filepath`      | Caminho para salvar o token |
| `session`       | Session HTTP opcional para autenticacao |
| `proxies`       | Configuracao de proxies para autenticacao |
| `open_browser`  | Abrir navegador automaticamente com o link de setup |

**Retorno**: `RefreshingToken` com os tokens de acesso.

---

### 3.1 Busca (Search)

#### `search()`

Busca no YouTube Music com filtros opcionais.

```python
def search(
    self,
    query: str,
    filter: str | None = None,
    scope: str | None = None,
    limit: int = 20,
    ignore_spelling: bool = False
) -> list[dict]
```

| Parametro         | Descricao |
|-------------------|-----------|
| `query`           | Texto da busca |
| `filter`          | `"songs"`, `"videos"`, `"albums"`, `"artists"`, `"playlists"`, `"community_playlists"`, `"featured_playlists"`, `"uploads"` |
| `scope`           | `"library"` (biblioteca pessoal) ou `"uploads"` (uploads do usuario) |
| `limit`           | Maximo de resultados (padrao: 20) |
| `ignore_spelling` | `True` para ignorar correcao ortografica |

**Requer auth**: Nao (mas `scope="library"` ou `scope="uploads"` requer)

**Retorno**: Lista de dicts com `resultType` indicando o tipo. Estrutura varia por tipo:

```typescript
// Song
{
  resultType: "song",
  category: string,
  videoId: string,
  videoType: string,
  title: string,
  artists: Array<{ name: string, id: string }>,
  album: { name: string, id: string },
  duration: string,            // "3:45"
  duration_seconds: number,
  year: string | null,
  isExplicit: boolean,
  inLibrary: boolean,
  feedbackTokens: { add: string | null, remove: string | null },
  pinnedToListenAgain: boolean,
  listenAgainFeedbackTokens: { pin: string | null, unpin: string | null },
  thumbnails: Array<{ url: string, width: number, height: number }>
}

// Video
{
  resultType: "video",
  category: string,
  videoId: string,
  videoType: string,
  title: string,
  artists: Array<{ name: string, id: string }>,
  views: string,               // "1.4M"
  duration: string,
  duration_seconds: number,
  thumbnails: [...]
}

// Episode
{
  resultType: "episode",
  category: string,
  videoId: string,
  videoType: string,
  title: string,
  date?: string,
  podcast?: { name: string, id: string },
  live?: boolean,
  duration: string,
  thumbnails: [...]
}

// Album
{
  resultType: "album",
  category: string,
  title: string,
  type: string,
  browseId: string,            // "MPREb_..."
  playlistId: string,
  artist: string,              // Nota: string simples, nao array
  year: string,
  isExplicit: boolean,
  thumbnails: [...]
}

// Artist
{
  resultType: "artist",
  category: string,
  artist: string,
  browseId: string,            // channelId
  shuffleId: string,
  radioId: string,
  subscribers: string | null,
  thumbnails: [...]
}

// Playlist
{
  resultType: "playlist",
  category: string,
  title: string,
  playlistId: string,
  browseId: string,            // "VL" + playlistId
  author: string,
  itemCount: string,
  thumbnails: [...]
}

// Profile
{
  resultType: "profile",
  category: string,
  title: string,
  name: string,                // "@handle"
  browseId: string,
  thumbnails: [...]
}
```

#### `get_search_suggestions()`

Obtem sugestoes de autocompletar para busca.

```python
def get_search_suggestions(
    self,
    query: str,
    detailed_runs: bool = False
) -> list[str] | list[dict]
```

| Parametro       | Descricao |
|-----------------|-----------|
| `query`         | Texto parcial da busca |
| `detailed_runs` | `False`: retorna lista de strings. `True`: retorna dicts com detalhes |

**Requer auth**: Nao

**Retorno com `detailed_runs=True`**:

```typescript
{
  text: string,
  runs: Array<{ text: string, bold: boolean }>,
  fromHistory: boolean,
  feedbackToken: string | null
}
```

#### `remove_search_suggestions()`

Remove sugestoes do historico de busca do usuario.

```python
def remove_search_suggestions(
    self,
    suggestions: list[dict],
    indices: list[int] | None = None
) -> bool
```

**Requer auth**: Sim

---

### 3.2 Navegacao (Browsing)

#### `get_home()`

Obtem a pagina inicial com sugestoes de musica organizadas em linhas.

```python
def get_home(self, limit: int = 3) -> list[dict]
```

**Requer auth**: Nao (mas retorna conteudo personalizado com auth)

**Retorno**:

```typescript
Array<{
  title: string,
  contents: Array<Song | Album | Playlist | Artist>  // tipos mistos
}>
```

#### `get_artist()`

Informacoes detalhadas de um artista e seus lancamentos.

```python
def get_artist(self, channelId: str) -> dict
```

**Requer auth**: Nao

**Retorno**:

```typescript
{
  description: string,
  views: string,
  name: string,
  channelId: string,               // AVISO: diferente do channelId passado; usar apenas com subscribe_artists()
  shuffleId: string,
  radioId: string,
  subscribers: string,
  monthlyListeners: string | null,
  subscribed: boolean,
  thumbnails: [...],
  songs: {                         // Passar browseId para get_playlist()
    browseId: string,
    results: Array<Song>,
    params: string | null
  },
  albums: {                        // Passar browseId + params para get_artist_albums()
    browseId: string,
    results: Array<Album>,
    params: string
  },
  singles: {                       // Passar browseId + params para get_artist_albums()
    browseId: string,
    results: Array<Album>,
    params: string
  },
  shows?: {                        // Passar browseId + params para get_artist_albums()
    browseId: string,
    results: Array<Album>,
    params: string
  },
  videos: {                        // Passar browseId para get_playlist()
    browseId: string,
    results: Array<Video>,
    params: string | null
  },
  episodes?: {
    browseId: string,
    results: Array<Episode>,
    params: string | null
  },
  podcasts?: {
    browseId: string | null,
    results: Array<Podcast>,
  },
  related: {
    results: Array<RelatedArtist>
  }
}

// Tipos de conteudo possiveis em get_artist():
// songs, albums, singles, shows, videos, episodes, podcasts, related
```

#### `get_artist_albums()`

Lista completa de albuns/singles/shows de um artista.

```python
def get_artist_albums(
    self,
    channelId: str,
    params: str,
    limit: int | None = 100,
    order: Literal["Recency", "Popularity", "Alphabetical order"] | None = None
) -> list[dict]
```

**Requer auth**: Nao

#### `get_album()`

Informacoes e faixas de um album.

```python
def get_album(self, browseId: str) -> dict
```

| Parametro  | Descricao |
|------------|-----------|
| `browseId` | ID comecando com `"MPRE"` (de resultados de busca ou get_artist) |

**Requer auth**: Nao

**Retorno**:

```typescript
{
  title: string,
  type: string,
  thumbnails: [...],
  description: string | null,
  artists: Array<{ name: string, id: string }>,
  year: string,
  trackCount: number,
  duration: string,
  duration_seconds: number,
  audioPlaylistId: string,      // "OLAK5uy_..."
  tracks: Array<PlaylistItem>,  // ver estrutura em Modelos de Dados
  other_versions: Array<Album> | null
}
```

#### `get_album_browse_id()`

Converte `audioPlaylistId` para `browseId`.

```python
def get_album_browse_id(self, audioPlaylistId: str) -> str | None
```

| Parametro         | Descricao |
|-------------------|-----------|
| `audioPlaylistId` | ID comecando com `"OLAK5uy_"` |

**Retorno**: `browseId` comecando com `"MPREb_"` ou `None`

#### `get_song()`

Metadados e informacoes de streaming de uma musica/video.

```python
def get_song(
    self,
    videoId: str,
    signatureTimestamp: int | None = None
) -> dict
```

**Requer auth**: Nao

**Retorno**: Resposta completa da InnerTube contendo:

```typescript
{
  playabilityStatus: { status: string, ... },
  streamingData: {
    formats: Array<StreamFormat>,
    adaptiveFormats: Array<StreamFormat>,
    expiresInSeconds: string
  },
  videoDetails: {
    videoId: string,
    title: string,
    lengthSeconds: string,
    channelId: string,
    shortDescription: string,
    thumbnail: { thumbnails: [...] },
    viewCount: string,
    author: string,
    musicVideoType: string
  },
  microformat: { ... },
  playbackTracking: { ... }   // Usado por add_history_item()
}
```

#### `get_song_related()`

Conteudo relacionado a uma musica (aba "Relacionado" no player).

```python
def get_song_related(self, browseId: str) -> list[dict]
```

| Parametro  | Descricao |
|------------|-----------|
| `browseId` | Obtido de `get_watch_playlist()` |

**Requer auth**: Nao

#### `get_lyrics()`

Letras de uma musica com ou sem timestamps.

```python
def get_lyrics(
    self,
    browseId: str,
    timestamps: bool | None = False
) -> Lyrics | TimedLyrics | None
```

| Parametro    | Descricao |
|--------------|-----------|
| `browseId`   | ID comecando com `"MPLYt..."` (de `get_watch_playlist()`) |
| `timestamps` | `False`: texto simples. `True`: com marcacao de tempo por linha |

**Requer auth**: Nao

**Retorno sem timestamps**:

```typescript
{
  lyrics: string,
  source: string | null,
  hasTimestamps: false
}
```

**Retorno com timestamps**:

```typescript
{
  lyrics: Array<{
    text: string,
    start_time: number,    // milissegundos
    end_time: number,      // milissegundos
    id: number
  }>,
  source: string | null,
  hasTimestamps: true
}
```

#### `get_user()`

Pagina de perfil de um usuario (videos e playlists publicas).

```python
def get_user(self, channelId: str) -> dict
```

**Requer auth**: Nao

#### `get_user_playlists()`

Lista completa de playlists de um usuario.

```python
def get_user_playlists(self, channelId: str, params: str) -> list[dict]
```

#### `get_user_videos()`

Lista completa de videos de um usuario.

```python
def get_user_videos(self, channelId: str, params: str) -> list[dict]
```

#### `get_tasteprofile()`

Obtem artistas sugeridos para o perfil de gosto musical.

```python
def get_tasteprofile(self) -> dict
```

**Requer auth**: Sim

**Retorno**: Dict mapeando nomes de artistas para `{ selectionValue, impressionValue }`.

#### `set_tasteprofile()`

Favorita artistas para melhorar recomendacoes.

```python
def set_tasteprofile(
    self,
    artists: list[str],
    taste_profile: dict | None = None
) -> None
```

**Requer auth**: Sim

#### `get_signatureTimestamp()` (Interno)

Obtem o signatureTimestamp necessario para URLs de streaming validas. Nao listado na referencia oficial, mas disponivel internamente.

```python
def get_signatureTimestamp(self, url: str | None = None) -> int
```

#### `get_basejs_url()` (Interno)

Extrai a URL do script `base.js` do YouTube Music. Nao listado na referencia oficial, mas disponivel internamente.

```python
def get_basejs_url(self) -> str
```

---

### 3.3 Exploracao (Explore)

#### `get_explore()` (REMOVIDO)

> **AVISO**: Este metodo foi removido da API oficial na versao 1.11.5. Nao consta mais na referencia. Usar `get_mood_categories()`, `get_mood_playlists()` e `get_charts()` como substitutos para explorar conteudo.

#### `get_mood_categories()`

Categorias de "Moods & Genres".

```python
def get_mood_categories(self) -> dict
```

**Requer auth**: Nao

**Retorno**: Dict de secoes com categorias, cada uma com titulo e parametro para `get_mood_playlists()`.

#### `get_mood_playlists()`

Playlists de uma categoria de mood/genero.

```python
def get_mood_playlists(self, params: str) -> list[dict]
```

| Parametro | Descricao |
|-----------|-----------|
| `params`  | Obtido de `get_mood_categories()` |

**Requer auth**: Nao

---

### 3.4 Charts

#### `get_charts()`

Paradas de sucesso por pais.

```python
def get_charts(self, country: str = "ZZ") -> dict
```

| Parametro | Descricao |
|-----------|-----------|
| `country` | Codigo ISO 3166-1 Alpha-2. `"ZZ"` = Global |

**Requer auth**: Nao (mas sem auth, artistas vem sem ranking)

**Retorno**:

```typescript
{
  countries: {
    selected: { text: string },
    options: Array<string>          // Codigos ISO dos paises disponiveis
  },
  videos: Array<{                   // Playlists de charts (daily/weekly separados com Premium)
    title: string,
    playlistId: string,
    thumbnails: [...]
  }>,
  artists: Array<{
    title: string,
    browseId: string,
    subscribers: string,
    thumbnails: [...],
    rank: string | null,            // null sem auth
    trend: string | null            // "up", "down", "neutral", null sem auth
  }>,
  genres?: Array<{                  // Apenas para US
    title: string,
    playlistId: string,
    thumbnails: [...]
  }>
}
```

---

### 3.5 Watch (Player)

#### `get_watch_playlist()`

Playlist de reproducao (fila "A seguir" ao tocar uma musica).

```python
def get_watch_playlist(
    self,
    videoId: str | None = None,
    playlistId: str | None = None,
    limit: int = 25,
    radio: bool = False,
    shuffle: bool = False
) -> dict
```

| Parametro    | Descricao |
|--------------|-----------|
| `videoId`    | ID do video sendo tocado |
| `playlistId` | ID da playlist/album |
| `limit`      | Minimo de itens a retornar |
| `radio`      | Gerar radio (muda a cada chamada) |
| `shuffle`    | Embaralhar playlist (requer `playlistId`, incompativel com `radio`) |

**Requer auth**: Nao

**Retorno**:

```typescript
{
  tracks: Array<PlaylistItem & { counterpart?: PlaylistItem }>,
  playlistId: string | null,
  lyrics: string,       // browseId para get_lyrics()
  related: string       // browseId para get_song_related()
}
```

> **Nota**: O campo `counterpart` aparece apenas quando uma musica tem um video correspondente (ou vice-versa). O `likeStatus` pode retornar `"INDIFFERENT"` ou `"DISLIKE"` de forma ambigua pela API.

---

### 3.6 Biblioteca Pessoal (Library)

> **Todos os metodos desta secao requerem autenticacao.**

#### `get_library_playlists()`

```python
def get_library_playlists(self, limit: int | None = 25) -> list[dict]
```

| Parametro | Descricao |
|-----------|-----------|
| `limit`   | Numero de playlists. `None` = todas |

**Retorno**: Lista de playlists com `playlistId`, `title`, `thumbnails`, `count`.

#### `get_library_songs()`

```python
def get_library_songs(
    self,
    limit: int = 25,
    validate_responses: bool = False,
    order: Literal["a_to_z", "z_to_a", "recently_added"] | None = None
) -> list[dict]
```

| Parametro            | Descricao |
|----------------------|-----------|
| `limit`              | Numero de musicas |
| `validate_responses` | Retentar se musicas estiverem faltando na resposta |
| `order`              | Ordenacao: `"a_to_z"`, `"z_to_a"`, `"recently_added"` |

#### `get_library_albums()`

```python
def get_library_albums(
    self,
    limit: int = 25,
    order: Literal["a_to_z", "z_to_a", "recently_added"] | None = None
) -> list[dict]
```

**Retorno**: Lista com `browseId`, `playlistId`, `title`, `type`, `thumbnails`, `artists`, `year`.

#### `get_library_artists()`

```python
def get_library_artists(
    self,
    limit: int = 25,
    order: Literal["a_to_z", "z_to_a", "recently_added"] | None = None
) -> list[dict]
```

**Retorno**: Lista com `browseId`, `artist`, `subscribers`, `thumbnails`.

#### `get_library_subscriptions()`

```python
def get_library_subscriptions(
    self,
    limit: int = 25,
    order: Literal["a_to_z", "z_to_a", "recently_added"] | None = None
) -> list[dict]
```

Mesmo formato que `get_library_artists()`.

#### `get_library_podcasts()`

```python
def get_library_podcasts(
    self,
    limit: int = 25,
    order: Literal["a_to_z", "z_to_a", "recently_added"] | None = None
) -> list[dict]
```

**Retorno**: Lista com `title`, `channel`, `browseId`, `podcastId`, `thumbnails`. A playlist "New Episodes" aparece primeiro se houver conteudo relevante.

#### `get_library_channels()`

```python
def get_library_channels(
    self,
    limit: int = 25,
    order: Literal["a_to_z", "z_to_a", "recently_added"] | None = None
) -> list[dict]
```

**Retorno**: Lista com `browseId`, `artist`, `subscribers`, `thumbnails`.

#### `get_liked_songs()`

```python
def get_liked_songs(self, limit: int = 100) -> dict
```

Retorna a playlist especial "Liked Songs" no formato de `get_playlist()`.

#### `get_saved_episodes()`

```python
def get_saved_episodes(self, limit: int = 100) -> dict
```

Retorna a playlist especial "Saved Episodes" no formato de `get_playlist()`.

#### `get_history()`

```python
def get_history(self) -> list[dict]
```

Retorna historico de reproducao em ordem cronologica reversa. Cada item inclui `played` (timestamp) e `feedbackToken` (para `remove_history_items()`).

#### `add_history_item()`

```python
def add_history_item(self, song: dict) -> Response
```

| Parametro | Descricao |
|-----------|-----------|
| `song`    | Dict retornado por `get_song()` (usa o `playbackTracking` URI) |

Status 204 = sucesso. Deve usar a mesma instancia de `YTMusic` que chamou `get_song()`.

#### `remove_history_items()`

```python
def remove_history_items(self, feedbackTokens: list[str]) -> dict
```

> **Aviso**: Nao funciona com brand accounts atualmente.

#### `rate_song()`

```python
def rate_song(
    self,
    videoId: str,
    rating: LikeStatus = LikeStatus.INDIFFERENT  # "LIKE", "DISLIKE", "INDIFFERENT"
) -> dict | None
```

`INDIFFERENT` remove avaliacao anterior.

**Raises**: `YTMusicUserError` se um rating invalido for fornecido.

#### `rate_playlist()`

```python
def rate_playlist(
    self,
    playlistId: str,
    rating: LikeStatus = LikeStatus.INDIFFERENT
) -> dict
```

`LIKE` adiciona a biblioteca. `INDIFFERENT` remove. `DISLIKE` afeta recomendacoes.

**Raises**: `YTMusicUserError` se um rating invalido for fornecido.

#### `edit_song_library_status()`

```python
def edit_song_library_status(self, feedbackTokens: list[str] | None = None) -> dict
```

Adiciona/remove musicas da biblioteca ou fixa/desfixa do carrossel "Ouvir novamente". Usa `feedbackTokens` de respostas autenticadas.

> **Aviso**: Bug conhecido do YouTube Music pode impedir "desafixar".

#### `subscribe_artists()`

```python
def subscribe_artists(self, channelIds: list[str]) -> dict
```

#### `unsubscribe_artists()`

```python
def unsubscribe_artists(self, channelIds: list[str]) -> dict
```

#### `get_account_info()`

```python
def get_account_info(self) -> dict
```

**Retorno**: `{ accountName, channelHandle, accountPhotoUrl }`.

---

### 3.7 Playlists

#### `get_playlist()`

```python
def get_playlist(
    self,
    playlistId: str,
    limit: int | None = 100,
    related: bool = False,
    suggestions_limit: int = 0
) -> dict
```

| Parametro           | Descricao |
|---------------------|-----------|
| `playlistId`        | ID da playlist |
| `limit`             | Max de musicas. `None` = todas |
| `related`           | Incluir playlists relacionadas |
| `suggestions_limit` | Sugestoes (7 por requisicao) |

**Requer auth**: Nao (para playlists publicas)

**Retorno**:

```typescript
{
  id: string,
  privacy: "PUBLIC" | "PRIVATE" | "UNLISTED",
  title: string,
  thumbnails: [...],
  description: string,
  author: { name: string, id: string },
  // Para playlists colaborativas, author e substituido por:
  collaborators?: {
    text: string,                  // "by Sample Author and 1 other"
    avatars: Array<{ url: string }>
  },
  year: string,
  duration: string,
  duration_seconds: number,
  trackCount: number,
  tracks: Array<PlaylistItem>,
  suggestions?: Array<PlaylistItem>,
  related?: Array<Playlist>
}
```

#### `create_playlist()`

```python
def create_playlist(
    self,
    title: str,
    description: str,
    privacy_status: str = "PRIVATE",   # "PUBLIC", "PRIVATE", "UNLISTED"
    video_ids: list[str] | None = None,
    source_playlist: str | None = None
) -> str | dict
```

**Requer auth**: Sim

**Retorno**: `playlistId` (string) ou resposta completa em caso de erro.

#### `edit_playlist()`

```python
def edit_playlist(
    self,
    playlistId: str,
    title: str | None = None,
    description: str | None = None,
    privacyStatus: str | None = None,
    moveItem: str | tuple[str, str] | None = None,
    addPlaylistId: str | None = None,
    addToTop: bool | None = None
) -> str | dict
```

| Parametro      | Descricao |
|----------------|-----------|
| `moveItem`     | `setVideoId` ou tupla `(setVideoId, afterSetVideoId)` para reordenar |
| `addPlaylistId`| Adicionar todas as musicas de outra playlist |
| `addToTop`     | Adicionar novos itens no topo |

**Requer auth**: Sim

#### `delete_playlist()`

```python
def delete_playlist(self, playlistId: str) -> str | dict
```

**Requer auth**: Sim

#### `add_playlist_items()`

```python
def add_playlist_items(
    self,
    playlistId: str,
    videoIds: list[str] | None = None,
    source_playlist: str | None = None,
    duplicates: bool = False
) -> str | dict
```

| Parametro        | Descricao |
|------------------|-----------|
| `videoIds`       | Lista de IDs de video para adicionar |
| `source_playlist`| Copiar musicas de outra playlist |
| `duplicates`     | Permitir duplicatas |

**Requer auth**: Sim

**Retorno**: Status com mapeamento de `videoId` para novos `setVideoId`.

#### `remove_playlist_items()`

```python
def remove_playlist_items(
    self,
    playlistId: str,
    videos: list[dict]    # Requer videoId + setVideoId
) -> str | dict
```

**Requer auth**: Sim

---

### 3.8 Podcasts

#### `get_channel()`

```python
def get_channel(self, channelId: str) -> dict
```

**Requer auth**: Nao

Retorna informacoes do canal de podcast, episodios (max 10) e podcasts. Usar `get_channel_episodes()` para lista completa.

#### `get_channel_episodes()`

```python
def get_channel_episodes(self, channelId: str, params: str) -> list[dict]
```

| Parametro | Descricao |
|-----------|-----------|
| `params`  | Obtido de `get_channel()` |

#### `get_podcast()`

```python
def get_podcast(self, playlistId: str, limit: int | None = 100) -> dict
```

**Retorno**: Dict com `author`, `title`, `description`, `saved` (bool), e `episodes` (lista).

> Para adicionar podcast a biblioteca: usar `rate_playlist()` com `LIKE`.

#### `get_episode()`

```python
def get_episode(self, videoId: str) -> dict
```

| Parametro | Descricao |
|-----------|-----------|
| `videoId` | `browseId` (MPED..) ou videoId do episodio |

**Retorno**: Dict com `author`, `title`, `date`, `duration`, `saved` (bool), `playlistId`, `description` (lista de objetos com `text` e opcionalmente `url` ou `seconds` para timestamps).

> Para salvar episodio: usar `add_playlist_items()` na playlist SE (Saved Episodes).

#### `get_episodes_playlist()`

```python
def get_episodes_playlist(self, playlist_id: str = "RDPN") -> dict
```

Retorna episodios da playlist "New Episodes" (auto-gerada). Formato similar a `get_podcast()`.

---

### 3.9 Uploads

> **Todos os metodos de upload requerem autenticacao. `upload_song()` requer especificamente browser auth (nao funciona com OAuth).**

#### `get_library_upload_songs()`

```python
def get_library_upload_songs(
    self,
    limit: int | None = 25,
    order: Literal["a_to_z", "z_to_a", "recently_added"] | None = None
) -> list[dict]
```

**Retorno**: Lista com `entityId`, `videoId`, `artists`, `title`, `album`, `likeStatus`, `thumbnails`.

#### `get_library_upload_albums()`

```python
def get_library_upload_albums(
    self,
    limit: int | None = 25,
    order: Literal["a_to_z", "z_to_a", "recently_added"] | None = None
) -> list[dict]
```

#### `get_library_upload_artists()`

```python
def get_library_upload_artists(
    self,
    limit: int | None = 25,
    order: Literal["a_to_z", "z_to_a", "recently_added"] | None = None
) -> list[dict]
```

#### `get_library_upload_artist()`

```python
def get_library_upload_artist(self, browseId: str, limit: int = 25) -> list[dict]
```

Retorna faixas enviadas de um artista especifico.

#### `get_library_upload_album()`

```python
def get_library_upload_album(self, browseId: str) -> dict
```

**Retorno**: `{ title, type, thumbnails, trackCount, duration, audioPlaylistId, tracks }`.

#### `upload_song()`

```python
def upload_song(self, filepath: str) -> ResponseStatus | Response
```

| Parametro  | Descricao |
|------------|-----------|
| `filepath` | Caminho do arquivo (mp3, m4a, wma, flac, ogg) |

**Limite**: 300 MB por arquivo.
**Requer**: Browser auth (NAO funciona com OAuth).

#### `delete_upload_entity()`

```python
def delete_upload_entity(self, entityId: str) -> str | dict
```

Remove musica ou album enviado anteriormente.

---

## 4. Modelos de Dados

### Enums

```python
class PrivacyStatus(str, Enum):
    PUBLIC = "PUBLIC"
    PRIVATE = "PRIVATE"
    UNLISTED = "UNLISTED"

class LikeStatus(str, Enum):
    LIKE = "LIKE"
    DISLIKE = "DISLIKE"
    INDIFFERENT = "INDIFFERENT"   # Valor padrao para status desconhecido

class VideoType(str, Enum):
    OMV = "MUSIC_VIDEO_TYPE_OMV"                        # Official Music Video
    UGC = "MUSIC_VIDEO_TYPE_UGC"                        # User Generated Content
    ATV = "MUSIC_VIDEO_TYPE_ATV"                        # Art Track Video (auto-gerado)
    OFFICIAL_SOURCE_MUSIC = "MUSIC_VIDEO_TYPE_OFFICIAL_SOURCE_MUSIC"

class ResponseStatus(str, Enum):
    SUCCEEDED = "STATUS_SUCCEEDED"

class LibraryOrderType:
    # Valores aceitos: "a_to_z", "z_to_a", "recently_added"

class ArtistOrderType:
    # Valores aceitos: "Recency", "Popularity", "Alphabetical order"
```

### Type Aliases

```python
JsonDict = dict[str, Any]
JsonList = list[JsonDict]
```

### Estrutura: PlaylistItem (Faixa/Musica)

Esta e a estrutura mais importante — retornada por `get_playlist()`, `get_watch_playlist()`, `get_library_songs()`, `get_album()` (campo tracks), etc.

```typescript
interface PlaylistItem {
  videoId: string | null;
  title: string | null;
  artists: Array<{ name: string, id: string | null }> | null;
  album: { name: string, id: string } | null;
  likeStatus: "LIKE" | "DISLIKE" | "INDIFFERENT" | null;
  inLibrary: boolean | null;
  pinnedToListenAgain: boolean | null;
  thumbnails: Array<{ url: string, width: number, height: number }> | null;
  isAvailable: boolean;
  isExplicit: boolean;
  videoType: string | null;       // VideoType enum value
  views: string | null;
  trackNumber: number | null;     // Apenas em faixas de album
  duration: string;               // "3:45"
  duration_seconds: number;
  setVideoId?: string;            // ID unico dentro de uma playlist (para reordenacao/remocao)
  feedbackTokens?: {              // Para edit_song_library_status()
    add: string,
    remove: string
  };
  counterpart?: PlaylistItem;     // Video correspondente (em watch playlist)
}
```

### Estrutura: Album

```typescript
interface Album {
  title: string;
  type: string;                   // "Album", "Single", "EP"
  browseId: string;               // "MPREb_..."
  audioPlaylistId: string;        // "OLAK5uy_..."
  playlistId?: string;
  thumbnails: Array<Thumbnail>;
  isExplicit: boolean;
  year: string;
  artists?: Array<{ name: string, id: string }>;
  description?: string;
  trackCount?: number;
  duration?: string;
  duration_seconds?: number;
  tracks?: Array<PlaylistItem>;
  other_versions?: Array<Album>;
}
```

### Estrutura: Artist

```typescript
interface Artist {
  name: string;
  browseId: string;               // channelId
  subscribers?: string;           // "1.5M subscribers"
  thumbnails: Array<Thumbnail>;
}
```

### Estrutura: Playlist

```typescript
interface Playlist {
  title: string;
  playlistId: string;
  thumbnails: Array<Thumbnail>;
  description?: string;
  count?: string;
  author?: { name: string, id: string };
}
```

### Estrutura: Lyrics / TimedLyrics

```typescript
interface Lyrics {
  lyrics: string;
  source: string | null;
  hasTimestamps: false;
}

interface TimedLyrics {
  lyrics: Array<LyricLine>;
  source: string | null;
  hasTimestamps: true;
}

interface LyricLine {
  text: string;
  start_time: number;     // milissegundos
  end_time: number;        // milissegundos
  id: number;
}
```

### Estrutura: Thumbnail

```typescript
interface Thumbnail {
  url: string;
  width: number;
  height: number;
}
```

### Estrutura: Song (de get_song)

```typescript
interface SongResponse {
  playabilityStatus: {
    status: string;         // "OK", "ERROR", etc.
  };
  streamingData: {
    formats: Array<StreamFormat>;
    adaptiveFormats: Array<StreamFormat>;
    expiresInSeconds: string;
  };
  videoDetails: {
    videoId: string;
    title: string;
    lengthSeconds: string;
    channelId: string;
    shortDescription: string;
    thumbnail: { thumbnails: Array<Thumbnail> };
    viewCount: string;
    author: string;
    musicVideoType: string;
  };
  microformat: { ... };
  playbackTracking: { ... };   // Necessario para add_history_item()
}
```

---

## 5. Arquitetura Sidecar (Tauri)

### Visao Geral

Para integrar `ytmusicapi` em um app Tauri, a abordagem recomendada e empacotar um executavel Python como **sidecar** usando PyInstaller.

### 5.1 Empacotamento com PyInstaller

```bash
# Instalar dependencias
pip install ytmusicapi pyinstaller

# Criar executavel standalone
pyinstaller --onefile --name ytmusic-sidecar sidecar_server.py
```

O executavel gerado deve ser colocado em `src-tauri/binaries/` com sufixo de target triple:

```
src-tauri/binaries/
  ytmusic-sidecar-x86_64-pc-windows-msvc.exe
  ytmusic-sidecar-x86_64-unknown-linux-gnu
  ytmusic-sidecar-aarch64-apple-darwin
```

Obter o target triple da maquina:

```bash
rustc --print host-tuple
# Exemplo: x86_64-pc-windows-msvc
```

### 5.2 Configuracao no Tauri

```json
// src-tauri/tauri.conf.json
{
  "bundle": {
    "externalBin": [
      "binaries/ytmusic-sidecar"
    ]
  }
}
```

### 5.3 Padrao de Comunicacao: HTTP Local (Recomendado)

A abordagem mais robusta e rodar um servidor HTTP local (FastAPI/Flask) dentro do sidecar:

```python
# sidecar_server.py
from fastapi import FastAPI
from ytmusicapi import YTMusic
import uvicorn, sys, json

app = FastAPI()
yt = None

@app.post("/init")
async def init(body: dict):
    global yt
    yt = YTMusic(body.get("auth"))
    return {"status": "ok"}

@app.get("/search")
async def search(query: str, filter: str = None, limit: int = 20):
    return yt.search(query, filter=filter, limit=limit)

@app.get("/artist/{channel_id}")
async def get_artist(channel_id: str):
    return yt.get_artist(channel_id)

# ... mais endpoints conforme necessidade

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    uvicorn.run(app, host="127.0.0.1", port=port)
```

**Spawning do Rust/JS**:

```javascript
// Frontend (JS)
import { Command } from '@tauri-apps/plugin-shell';

const command = Command.sidecar('binaries/ytmusic-sidecar', ['8765']);
const child = await command.spawn();

// Depois comunicar via fetch
const results = await fetch('http://127.0.0.1:8765/search?query=Oasis');
```

```rust
// Backend (Rust)
use tauri_plugin_shell::ShellExt;

let sidecar = app.shell().sidecar("ytmusic-sidecar").unwrap();
let (mut rx, child) = sidecar.args(["8765"]).spawn()?;
```

### 5.4 Padrao Alternativo: stdin/stdout JSON-RPC

Comunicacao via stdin/stdout sem servidor HTTP:

```python
# sidecar_jsonrpc.py
import sys, json
from ytmusicapi import YTMusic

yt = None

for line in sys.stdin:
    request = json.loads(line.strip())
    method = request["method"]
    params = request.get("params", {})

    try:
        if method == "init":
            yt = YTMusic(params.get("auth"))
            result = {"status": "ok"}
        elif method == "search":
            result = yt.search(**params)
        elif method == "get_artist":
            result = yt.get_artist(**params)
        # ... mais metodos
        else:
            result = {"error": f"Unknown method: {method}"}

        print(json.dumps({"id": request.get("id"), "result": result}))
        sys.stdout.flush()

    except Exception as e:
        print(json.dumps({"id": request.get("id"), "error": str(e)}))
        sys.stdout.flush()
```

### 5.5 Fluxo OAuth em App Desktop

O Device Code Flow e ideal para desktop porque nao requer redirect URI:

1. O sidecar chama `setup_oauth()` que retorna URL + codigo
2. O frontend exibe a URL e codigo para o usuario
3. O usuario abre o navegador, faz login e autoriza
4. O sidecar detecta a autorizacao e salva o token
5. Tokens sao salvos em `oauth.json` no diretorio de dados do app

```python
# No sidecar - endpoint de setup OAuth
@app.post("/auth/setup")
async def setup_oauth_flow(body: dict):
    from ytmusicapi.auth.oauth import OAuthCredentials, RefreshingToken

    creds = OAuthCredentials(body["client_id"], body["client_secret"])
    code_info = creds.get_code()

    # Retornar URL e codigo para o frontend exibir
    return {
        "verification_url": code_info["verification_url"],
        "user_code": code_info["user_code"]
    }

@app.post("/auth/complete")
async def complete_oauth(body: dict):
    # Trocar device code por token
    token = creds.token_from_code(body["device_code"])
    # Salvar token
    with open("oauth.json", "w") as f:
        json.dump(token, f)
    return {"status": "ok"}
```

### 5.6 Permissoes no Tauri (capabilities)

```json
// src-tauri/capabilities/default.json
{
  "permissions": [
    "shell:allow-spawn",
    "shell:allow-stdin-write",
    {
      "identifier": "shell:allow-execute",
      "allow": [
        { "name": "binaries/ytmusic-sidecar", "args": true }
      ]
    }
  ]
}
```

### 5.7 Ciclo de Vida do Sidecar

Seguindo a regra do CLAUDE.md de que modulos inativos devem ser desmontados:

1. **Iniciar**: Quando o modulo YouTube Music e ativado (`React.lazy`)
2. **Manter vivo**: Enquanto o modulo estiver ativo (mesmo em background se musica estiver tocando)
3. **Encerrar**: Quando o modulo e desmontado — enviar comando de shutdown ou `child.kill()`
4. **Reconectar**: Se o sidecar crashar, detectar via event listener e reiniciar

---

## 6. Limitacoes e Problemas Conhecidos

### 6.1 Rate Limiting

- A API do YouTube Music aplica rate limiting, especialmente para operacoes de escrita
- `create_playlist()` pode lancar `KeyError` quando rate limited (HTTP 429 com `RATE_LIMIT_EXCEEDED`)
- **Recomendacao**: Implementar retry com backoff exponencial para operacoes de escrita
- Nao ha documentacao oficial sobre limites exatos

### 6.2 Estabilidade da InnerTube API

- A ytmusicapi depende de uma API interna e nao-documentada do Google
- O Google pode mudar a estrutura de respostas a qualquer momento sem aviso
- Historicamente, mudancas quebram parsers de campos especificos — o mantenedor corrige rapidamente
- **Recomendacao**: Tratar todos os campos como potencialmente `null`/`undefined` no frontend

### 6.3 Issues Abertas Criticas (Abril 2026)

| Issue  | Descricao | Impacto |
|--------|-----------|---------|
| #813   | OAuth: "Request contains an invalid argument" (pinned, 35+ comentarios) | **Alto** — Autenticacao OAuth pode falhar por mudanca server-side |
| #887   | Campo inesperado `refresh_token_expires_in` no Device Flow | **Medio** — Pode quebrar novo setup OAuth |
| #892   | `get_playlist()` falhando para certas playlists | **Medio** — Algumas playlists nao carregam |
| #839   | `get_album()` com problemas em audiobooks | **Baixo** — Audiobooks retornam dados inesperados |
| #877   | Descricoes truncadas em pontos onde ha links | **Baixo** — Textos cortados |
| #874   | Busca de playlists retorna `view` ao inves de `itemCount` | **Baixo** — Campo com nome inconsistente |

### 6.4 Metodos com Restricoes

| Metodo                   | Restricao |
|--------------------------|-----------|
| `upload_song()`          | **Somente browser auth** — nao funciona com OAuth |
| `remove_history_items()` | Nao funciona com brand accounts |
| `get_charts()` sem auth  | Artistas retornam sem ranking (`rank`/`trend` = null) |
| ~~`get_explore()`~~        | Removido na v1.11.5 — usar `get_mood_categories()` + `get_charts()` |
| `edit_song_library_status()` | Bug do YTM pode impedir "desafixar" conteudo |

### 6.5 BotGuard / PO Token

Atualizacoes recentes de seguranca do YouTube incluem requisitos de PO Token (Proof of Origin) via BotGuard. Isso pode afetar:

- Obtencao de URLs de streaming (`streamingData` em `get_song()`)
- A biblioteca pode necessitar de atualizacoes frequentes para contornar essas mudancas

**Recomendacao**: Para streaming real de audio, usar **yt-dlp** em vez de extrair URLs diretamente da `get_song()`. A ytmusicapi e ideal para metadados, busca e gerenciamento de biblioteca; yt-dlp e ideal para download/streaming do audio em si.

### 6.6 Funcionalidade Async (Pendente)

Issue #850 planeja suporte async via `YTMusicAsync`. Nao disponivel na versao atual (1.11.5). Para agora, chamadas sao sincronas — no contexto do sidecar isso nao e problema pois cada requisicao HTTP do frontend e tratada em sua propria thread pelo servidor.

### 6.7 Consideracoes para o Projeto

1. **Nunca depender de streaming URLs da ytmusicapi** — usar yt-dlp para isso
2. **Sempre validar dados retornados** — campos podem ser `null` por mudancas da API
3. **Manter ytmusicapi atualizado** — mudancas na InnerTube podem quebrar metodos a qualquer momento
4. **Implementar fallback gracioso** — se um metodo falhar, exibir estado de erro no UI sem crashar
5. **Cache de metadados** — evitar chamadas excessivas; dados de artistas/albuns raramente mudam
6. **OAuth e o caminho** — browser auth esta depreciado, sempre preferir OAuth
