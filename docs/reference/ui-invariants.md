# UI Invariants

## Música vs playlist

- música usa coração
- playlist não usa coração de música
- playlist usa bookmark/ações de biblioteca

## Playlists especiais

- `LM` não mostra bookmark
- `LM` não mostra excluir
- `LM` não mostra remover da biblioteca
- `LM` não mostra editar

## Sidebar

- navegação fixa do app é separada da lista de playlists
- a seção `Todas as playlists` só mostra entradas playlist-like
- ordem da sidebar deve vir do backend `guide`
- a sidebar deve usar composição shadcn-first
- a lista de playlists pode ser virtualizada, mas a estrutura visual da sidebar não deve depender do virtualizer
- `Nova playlist` pertence ao header do grupo de playlists
- `Editar playlist` só aparece para playlist própria/editável
- `right click` na row usa `ContextMenu`
- botão `...` na row usa `DropdownMenu`
- em listas virtualizadas com blur global, o item alvo pode precisar de highlight overlay
- o highlight da row pode expandir além da largura original para mostrar melhor o título

## Queue

- queue visual não é dona da fila lógica
- fechar queue reseta estado visual, não a fila global

## Likes

- coração de track nunca usa `useState` local como source of truth
- update otimista precisa ter rollback

## Menus

- largura do menu é ajustada no `Content`, não no `Item`
- ícones de menu não devem ganhar margem manual se o wrapper já resolve spacing
- `variant="destructive"` é preferível a classes locais para itens destrutivos
- blur de menu deve afetar o resto da interface via `Backdrop`, não o popup

## Criação e edição de playlist

- o fluxo de criação deve expor privacidade explicitamente
- o default de criação é `PRIVATE`
- criar e editar playlist compartilham o mesmo card modal
- o card de playlist cobre:
  - título
  - descrição
  - privacidade
  - capa custom com crop inline 1:1
- o crop de capa acontece no mesmo dialog, sem segundo modal
- o fluxo de capa prioriza um editor inline simples e previsível; evitar reproduções excessivamente literais do cliente web do YT Music
- na criação com capa, a ordem é:
  - criar playlist primeiro
  - aplicar thumbnail depois
- o app só expõe ações de thumbnail que tenham endpoint confirmado
- remover thumbnail custom continua fora da UI até a shape de remoção ser confirmada
- colaboração e votação não devem aparecer como se já estivessem suportadas
