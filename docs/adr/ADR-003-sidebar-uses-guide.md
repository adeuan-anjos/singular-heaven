# ADR-003: Sidebar Uses Guide

## Status

Accepted

## Context

A ordem de playlists da sidebar do app não batia com a sidebar real do YouTube Music quando a fonte usada era `FEmusic_liked_playlists`.

## Decision

A sidebar passa a usar o `guide` do YouTube Music como fonte backend-first de navegação lateral.

A Biblioteca continua usando `FEmusic_liked_playlists`.

## Consequences

- a ordem da sidebar reflete a ordem real do YT Music
- o parser do `guide` precisa filtrar apenas entradas playlist-like
- o frontend não deve inventar ordenação local para imitar o produto
