# ADR-004: Playlist Management Backend-First

## Status

Accepted

## Context

O app precisava suportar:

- salvar/remover playlist da biblioteca
- criar/excluir playlist
- adicionar/remover músicas

Essas ações não podiam depender de UI local.

## Decision

Gestão de playlists passa a ser backend-first, com comandos dedicados e estado compartilhado no frontend.

Playlists especiais, como `LM`, têm tratamento próprio.

## Consequences

- playlist não usa coração de track como affordance de gestão
- remover música de playlist depende de `setVideoId`
- o frontend precisa distinguir:
  - playlist própria
  - playlist salva de terceiros
  - playlist especial
