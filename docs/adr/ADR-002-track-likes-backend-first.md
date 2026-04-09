# ADR-002: Track Likes Backend-First

## Status

Accepted

## Context

Os corações de música eram locais de UI e não refletiam a conta real do usuário.

## Decision

O coração de track passa a usar:

- cookies do navegador
- InnerTube
- store compartilhado de likes

O frontend pode fazer update otimista, mas a verdade final continua sendo a conta real.

## Consequences

- `LIKE` e `INDIFFERENT` são estados suportados na UI principal
- `liked` / `LM` vira coleção especial sincronizada com a conta
- nenhum coração de track pode usar `useState` local como source of truth
