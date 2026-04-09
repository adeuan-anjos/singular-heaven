# ADR-001: Backend-First Queue

## Status

Accepted

## Context

O frontend estava acumulando responsabilidade demais sobre:

- ordem da fila
- `shuffle`
- `repeat`
- `next` / `previous`
- carga de centenas de tracks em memória

Isso gerava divergência entre páginas, queue e comportamento real do player.

## Decision

A fila lógica passa a ser responsabilidade do backend Rust.

O frontend fica responsável apenas por:

- tocar o `HTMLAudio`
- projetar a queue visual
- enviar comandos para a fila global

## Consequences

- `shuffle` e `repeat` passam a ser globais, não por página
- a queue visual pode ser paginada/revelada sem ser dona da ordem real
- páginas reproduzíveis precisam fornecer coleção + índice inicial, não lógica própria de fila
