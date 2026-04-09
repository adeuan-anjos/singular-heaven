# UI Invariants

## Música vs playlist

- música usa coração
- playlist não usa coração de música
- playlist usa bookmark/ações de biblioteca

## Playlists especiais

- `LM` não mostra bookmark
- `LM` não mostra excluir
- `LM` não mostra remover da biblioteca

## Sidebar

- navegação fixa do app é separada da lista de playlists
- a seção `Todas as playlists` só mostra entradas playlist-like
- ordem da sidebar deve vir do backend `guide`

## Queue

- queue visual não é dona da fila lógica
- fechar queue reseta estado visual, não a fila global

## Likes

- coração de track nunca usa `useState` local como source of truth
- update otimista precisa ter rollback
