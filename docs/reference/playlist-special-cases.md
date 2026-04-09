# Playlist Special Cases

## `LM` / liked songs

- representa a playlist real de músicas curtidas
- é especial
- não mostra bookmark de playlist
- não mostra excluir
- não mostra remover da biblioteca

## Sidebar vs Biblioteca

- sidebar usa `guide`
- biblioteca usa `FEmusic_liked_playlists`

Isso é intencional. As duas superfícies têm fontes backend diferentes.

## Remoção de item

Para remover música de playlist editável, não basta `videoId`.

É obrigatório:

- `videoId`
- `setVideoId`

## Ownership

Ownership de playlist deve vir do backend/parsers, não de heurística no frontend.
