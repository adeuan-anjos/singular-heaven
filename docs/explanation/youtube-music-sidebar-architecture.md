# YouTube Music: Sidebar Architecture

## Objetivo

Documentar a arquitetura atual da sidebar do módulo YouTube Music, incluindo:

- fonte de verdade da ordem das playlists
- separação entre navegação fixa e playlists
- composição visual no padrão shadcn
- uso de virtualização para listas longas

Esta doc existe para evitar duas regressões comuns:

- tratar a sidebar como um painel arbitrário e quebrar a consistência visual
- tentar corrigir ordem ou comportamento da sidebar no frontend sem respeitar a fonte backend-first

## Regra central

A sidebar tem duas camadas independentes:

- **navegação fixa do app**
  - `Início`
  - `Explorar`
  - `Biblioteca`
- **lista de playlists**
  - ordenada pelo `guide` do YouTube Music

Essas duas camadas compartilham o mesmo painel lateral, mas não compartilham a mesma fonte de dados.

## Fonte de verdade

### Navegação fixa

É local do app.

O frontend define:

- quais itens existem
- qual item está ativo
- para onde navega

### Playlists da sidebar

São backend-first.

Fonte:

- `guide` do YouTube Music

Motivo:

- o `guide` reflete a ordem real da lateral do YT Music
- `FEmusic_liked_playlists` reflete a biblioteca, não a navegação lateral

### Biblioteca

Continua usando outra fonte:

- `FEmusic_liked_playlists`

Então:

- sidebar e biblioteca não devem ser forçadas a usar a mesma ordenação
- ambas estão corretas quando usam a fonte backend apropriada

## O que o `guide` realmente é

O `guide` não é uma “lista de playlists”.

Ele é a árvore de navegação do YouTube Music e mistura:

- entradas de navegação global
- playlists especiais
- playlists normais

Por isso o parser da sidebar precisa filtrar apenas entradas playlist-like.

Regra:

- `Início`, `Explorar` e `Biblioteca` nunca entram em `Todas as playlists`
- playlists especiais como `LM` entram
- playlists normais entram na ordem devolvida pelo `guide`

## Composição visual com shadcn

A sidebar agora segue uma composição shadcn-first usando primitives locais em:

- [sidebar.tsx](/./src/components/ui/sidebar.tsx)

Peças principais:

- `Sidebar`
- `SidebarHeader`
- `SidebarContent`
- `SidebarGroup`
- `SidebarGroupHeader`
- `SidebarGroupLabel`
- `SidebarGroupAction`
- `SidebarMenu`
- `SidebarMenuItem`
- `SidebarMenuButton`

O objetivo não é usar um “componente mágico pronto”, mas sim compor a sidebar com os mesmos princípios do shadcn:

- estrutura clara
- estados visuais previsíveis
- acessibilidade
- consistência de spacing e active state

## O que aprendemos com o shadcn

### 1. Sidebar é composição, não widget fechado

O shadcn não entrega uma sidebar pronta para qualquer caso complexo.  
Ele entrega primitives e espera composição local.

Então o certo é:

- usar primitives para estrutura e semântica visual
- manter a lógica da feature fora delas

### 2. Lista longa continua sendo problema da aplicação

O shadcn não resolve virtualização de listas longas por conta própria.

Se a lista pode crescer bastante, a aplicação continua responsável por:

- virtualização
- scroll container
- integração com menu/context menu

### 3. O visual deve ser shadcn-first, não virtualizer-first

Mesmo com `react-virtual`, a composição correta é:

- sidebar define estrutura visual
- virtualizer só decide quais itens estão montados

Não fazer o contrário.

### 4. Ações de grupo devem ficar no grupo

`Nova playlist` não deve ser um botão solto perdido no layout.

Ela pertence ao header do grupo `Todas as playlists`.

### 5. Estados visuais precisam ser tratados como invariantes

Itens da sidebar precisam manter consistência para:

- active
- hover
- focus
- pending
- disabled

Isso é parte da arquitetura visual, não detalhe cosmético.

## Virtualização da lista

### Decisão

`react-virtual` foi mantido.

Motivo:

- a lista de playlists pode crescer bastante
- não há ganho em renderizar todas as linhas se só uma janela está visível

### Regra

A virtualização vale apenas para a seção de playlists.

Ela não deve afetar:

- navegação fixa
- lógica de ordenação
- ações destrutivas
- criação de playlist

### Invariantes

- a lista não deve renderizar todos os itens de uma vez
- o range visível deve acompanhar o scroll
- a linha clicada deve continuar resolvendo o `playlistId` correto
- context menu deve funcionar para o item certo mesmo fora da primeira janela

## Stores e fluxo

### Store principal

- [playlist-library-store.ts](/./src/modules/youtube-music/stores/playlist-library-store.ts)

Ela mantém:

- `playlists`
  - biblioteca
- `sidebarPlaylists`
  - sidebar

### Fluxo da sidebar

1. `SidePanel` monta
2. chama `hydrateSidebar`
3. backend busca `guide`
4. parser filtra apenas playlist-like entries
5. frontend renderiza a navegação fixa local + playlists backend-first

## Regras para mudanças futuras

Não fazer:

- ordenar playlists no React para “parecer igual” ao YT Music
- usar a lista da biblioteca como fonte da sidebar
- misturar `Início`/`Explorar`/`Biblioteca` dentro de `Todas as playlists`
- remover a virtualização sem medir impacto
- deixar a composição visual voltar para um painel manual sem primitives

Fazer:

- preservar `guide` como fonte da ordem da sidebar
- preservar a separação entre navegação fixa e playlists
- tratar a sidebar como sidebar de verdade, não como painel genérico
- manter as regras visuais em sync com `ui-invariants`

## Relação com outras docs

- [Playlist Management](./docs/explanation/youtube-music-playlist-management.md)
- [UI Invariants](./docs/reference/ui-invariants.md)
- [ADR-003: Sidebar Uses Guide](./docs/adr/ADR-003-sidebar-uses-guide.md)
