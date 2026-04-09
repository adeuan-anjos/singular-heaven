# YouTube Music: Playlist Management

## Objetivo

Documentar a arquitetura atual de gestão de playlists no módulo YouTube Music.

Esta doc cobre:

- salvar/remover playlist da biblioteca
- criar/excluir playlist
- adicionar/remover músicas
- distinção entre playlist própria, salva e especial
- relação entre sidebar, biblioteca e página de playlist

## Princípio central

Gestão de playlists é backend-first.

Isso significa:

- o backend executa mutações reais da conta
- o frontend não decide ownership ou save state localmente
- a UI reflete stores e comandos que convergem para o estado real da conta

## Tipos de playlist

### Playlist própria

Características:

- criada pelo usuário
- editável
- pode ser excluída
- pode receber ou remover músicas

UI:

- mostra `Excluir playlist`

### Playlist salva de terceiros

Características:

- não pertence ao usuário
- pode ser salva na biblioteca
- não pode ser deletada da origem

UI:

- mostra `Remover playlist`
- isso remove da biblioteca, não apaga a playlist original

### Playlist especial

Hoje inclui pelo menos:

- `LM` / liked songs

UI:

- não mostra bookmark de playlist
- não mostra excluir
- não mostra remover da biblioteca

## Fonte de dados por superfície

### Sidebar

Fonte:

- `guide`

Objetivo:

- refletir a ordem real da lateral do YouTube Music

Composição visual:

- sidebar shadcn-first
- navegação fixa separada da lista de playlists
- virtualização restrita à lista de playlists

### Biblioteca

Fonte:

- `FEmusic_liked_playlists`

Objetivo:

- listar playlists salvas/gerenciáveis com metadados de biblioteca

### Página de playlist

Fonte:

- `yt_load_playlist`
- cache SQLite
- janela paginada e `trackIds`

Objetivo:

- refletir o conteúdo real da playlist
- suportar edição quando a playlist é editável

## Operações suportadas

### Salvar/remover playlist

Comando:

- `yt_rate_playlist`

Semântica:

- `LIKE` salva na biblioteca
- `INDIFFERENT` remove da biblioteca

### Criar playlist

Comando:

- `yt_create_playlist`

UI:

- `Nova playlist` no sidebar

### Excluir playlist

Comando:

- `yt_delete_playlist`

Disponível apenas para playlists próprias.

### Adicionar música

Comando:

- `yt_add_playlist_items`

UI:

- dialog shadcn “Adicionar à playlist”

### Remover música

Comando:

- `yt_remove_playlist_items`

Dependência importante:

- exige `setVideoId`

## `setVideoId`

`videoId` sozinho não é suficiente para remover um item de playlist com segurança.

Para remoção, o backend precisa da ocorrência específica:

- `videoId`
- `setVideoId`

Por isso a playlist editável precisa carregar esse dado no parser e mantê-lo no frontend.

## Stores principais

- `playlist-library-store`
  - estado compartilhado de playlists da biblioteca e sidebar
- store/página da playlist
  - estado visual e janela da playlist aberta

## Regras de UI

- track usa coração
- playlist usa bookmark/ações de biblioteca
- ações destrutivas usam `AlertDialog` shadcn
- clique direito em playlist usa `ContextMenu` shadcn
- sidebar usa composição shadcn-first, não painel manual genérico

## Invariantes

- `LM` não mostra bookmark, remover ou excluir
- `Excluir playlist` só aparece para playlist própria
- `Remover playlist` só aparece para playlist salva de terceiros
- `Adicionar à playlist` sempre passa pelo backend
- `Remover da playlist` só aparece em playlist editável

## Doc relacionada

Para a arquitetura visual e estrutural da sidebar:

- [YouTube Music Sidebar Architecture](./docs/explanation/youtube-music-sidebar-architecture.md)
