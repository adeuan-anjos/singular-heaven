# YouTube Music: Playlist Management

## Objetivo

Documentar a arquitetura atual de gestão de playlists no módulo YouTube Music.

Esta doc cobre:

- salvar/remover playlist da biblioteca
- criar/editar/excluir playlist
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

- mostra `Editar playlist`
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
- criação e edição usam o mesmo card modal
- o card de criação expõe:
  - título
  - descrição
  - privacidade
  - capa custom opcional com crop 1:1 inline
- a criação com capa segue a ordem backend-first:
  - primeiro cria a playlist
  - só depois do `playlistId` confirmado envia e aplica a thumbnail
- o modal de criação expõe privacidade:
  - `Pública`
  - `Não listada`
  - `Particular`
- o default é `PRIVATE`

### Editar playlist

Comando:

- `yt_edit_playlist`

Disponível apenas para playlists próprias/editáveis.

Escopo atual:

- título
- descrição
- privacidade
- capa custom com crop 1:1 inline no mesmo card

Fora desta entrega:

- colaboração
- votação
- remoção explícita de capa custom

Observações de implementação:

- o card unificado `PlaylistDetailsDialog` atende `create` e `edit`
- a escolha de imagem é inline no mesmo dialog; não existe segundo modal de crop no app
- o crop usa `react-easy-crop` embutido no card
- o fluxo visual do crop foi mantido simples e próximo do uso recomendado da lib
- ajustes finos do crop devem priorizar entendimento e previsibilidade do usuário, não reproduzir o cliente web do YouTube Music em detalhes arbitrários
- a remoção de thumbnail custom continua pendente porque a shape exata do `browse/edit_playlist` ainda não foi confirmada com segurança

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

## Matriz de ações de playlist

Esta seção registra o estado atual das ações de playlist no app e a estratégia recomendada para as próximas.

### Já suportadas

- `Excluir playlist`
- `Remover playlist` da biblioteca
- `Criar playlist`
- `Editar playlist`
- `Adicionar música à playlist`
- `Remover música da playlist`
- `Salvar/remover playlist` da biblioteca
- `Compartilhar`
- `Salvar na playlist`
- `Aleatório`
- `Tocar a seguir`
- `Adicionar à fila`

### Edição de playlist

Semântica:

- a UI só expõe `Editar playlist` quando a playlist é própria e editável
- o modal atual cobre apenas o bloco `Geral`
- ao salvar:
  - a página da playlist precisa recarregar metadados
  - sidebar e biblioteca precisam convergir para o título atualizado

Estratégia:

- usar `yt_edit_playlist`
- usar `yt_set_playlist_thumbnail` quando houver nova imagem
- persistir título, descrição e privacidade no cache backend-first
- aplicar a capa via upload para `playlist_image_upload/playlist_custom_thumbnail`
- finalizar com `ACTION_SET_CUSTOM_THUMBNAIL` usando `playlistScottyEncryptedBlobId`
- reidratar biblioteca/sidebar após a mutação

Limites conhecidos:

- o backend já suporta aplicar nova thumbnail custom
- o backend ainda não suporta remover a thumbnail custom existente
- tentativas óbvias de `ACTION_REMOVE_*` retornaram `INVALID_ARGUMENT`
- isso foi deliberadamente deixado para um spike posterior, em vez de entrar no app por adivinhação

### Suportadas e semântica adotada

#### Aleatório

Semântica:

- abre a playlist na queue global com `shuffle=true`

Estratégia:

- não requer endpoint novo do YouTube Music
- usa os `trackIds` da coleção atual e a semântica global já existente de queue/playback

#### Salvar na playlist

Semântica:

- copia todas as músicas da playlist atual para outra playlist escolhida pelo usuário

Estratégia:

- usar `yt_add_playlist_items`
- usar dialog shadcn com busca/lista das playlists de destino
- perguntar sempre a política de duplicatas no destino
- quando `permitir duplicatas`, o app pode copiar direto da playlist de origem
- quando `evitar novas duplicatas`, o app resolve `trackIds` completos de origem e destino antes de adicionar

#### Compartilhar

Semântica:

- copiar ou exibir o link público da playlist

Estratégia:

- não requer endpoint
- o app pode montar a URL localmente:
  - `https://music.youtube.com/playlist?list=<playlistId>`

#### Tocar a seguir

Semântica:

- inserir a playlist inteira logo após a faixa atual na queue global

Estratégia:

- isso não é mutação de playlist do YouTube Music; é mutação da nossa fila
- usa `yt_queue_add_collection_next(trackIds)`
- preserva a ordem original da playlist
- cria bloco de `priority future`
- esse bloco continua preservado mesmo se o usuário ligar `shuffle` depois

#### Adicionar à fila

Semântica:

- anexar a playlist inteira ao final da queue global

Estratégia:

- também é mutação da nossa fila
- usa `yt_queue_append_collection(trackIds)`
- insere a playlist inteira no fim da fila lógica
- quando `shuffle=true`, os itens entram no `regular future` e participam do embaralhamento do futuro

### Dependem de spike de endpoint / pesquisa dedicada

#### Iniciar rádio

Semântica:

- iniciar uma fila de rádio derivada da playlist atual

Situação:

- o projeto hoje só implementa rádio baseado em `videoId` individual
- o `ytmusicapi` documenta `get_watch_playlist(..., playlistId=..., radio=True)`
- isso merece um spike próprio porque a semântica e o payload são diferentes do fluxo atual de playlist management

#### Fixar em "Ouvir de novo"

Semântica:

- adicionar a playlist ao carrossel personalizado da Home

Situação:

- a referência documenta `pinnedToListenAgain`, `listenAgainFeedbackTokens` e `edit_song_library_status(feedbackTokens)`
- isso parece fazer parte do feed personalizado do usuário, não da gestão comum de playlists
- merece investigação separada sobre os tokens vindos de `get_home()` e o impacto real no app

### Fora de escopo por enquanto

#### Baixar

Situação:

- não deve ser tratada como ação oportunista de menu
- merece uma feature dedicada com semântica, UI e camada de storage próprias

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
- criar e editar playlist compartilham o mesmo card modal
- o crop de capa acontece inline no mesmo dialog, não em um segundo modal
- a remoção de capa custom não aparece na UI enquanto o endpoint de remoção não estiver confirmado
- ações destrutivas usam `AlertDialog` shadcn
- clique direito em playlist usa `ContextMenu` shadcn
- botão `...` em playlist usa `DropdownMenu` shadcn
- sidebar usa composição shadcn-first, não painel manual genérico
- blur e highlight do item alvo fazem parte do comportamento oficial da sidebar virtualizada

## Invariantes

- `LM` não mostra bookmark, remover ou excluir
- `LM` não mostra editar
- `Editar playlist` só aparece para playlist própria/editável
- na criação com capa, a thumbnail nunca é enviada antes do `playlistId` existir
- o app nunca deve tentar remover thumbnail custom no chute; essa ação depende de endpoint confirmado
- `Excluir playlist` só aparece para playlist própria
- `Remover playlist` só aparece para playlist salva de terceiros
- `Adicionar à playlist` sempre passa pelo backend
- `Remover da playlist` só aparece em playlist editável
- `Aleatório` em playlist usa a queue global com `shuffle=true`
- `Tocar a seguir` e `Adicionar à fila` pertencem à queue global, não à API de playlist do YouTube Music
- `Iniciar rádio` e `Fixar em "Ouvir de novo"` não devem ser improvisados na UI sem spike de endpoint

## Doc relacionada

Para a arquitetura visual e estrutural da sidebar:

- [YouTube Music Sidebar Architecture](./docs/explanation/youtube-music-sidebar-architecture.md)

Para regras de composição de menus, blur e spacing:

- [Shadcn Menu Composition](./docs/reference/shadcn-menu-composition.md)

Para a arquitetura global da queue e do playback:

- [YouTube Music Playback Architecture](./docs/explanation/youtube-music-playback-architecture.md)
