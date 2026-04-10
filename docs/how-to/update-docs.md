# Update Docs

## Quando atualizar

Atualize docs sempre que uma mudança:

- altera semântica oficial
- cria nova fonte de verdade
- introduz exceção importante
- adiciona bug conhecido

## Ordem recomendada

1. Atualizar doc temática em `explanation/` ou `reference/`
2. Atualizar `CHANGELOG.md`
3. Atualizar ou criar ADR, se a decisão for arquitetural
4. Atualizar `known-bugs.md` se algo foi adiado
5. Conferir `docs/README.md`

## Para mudanças de design

Se a mudança ensinou algo reutilizável sobre:

- shadcn/Base UI
- composição visual
- blur, overlay ou highlight
- spacing, anchor ou trigger

o correto é registrar isso em `docs/reference/`, não deixar como observação implícita no código.

## Para sessões de vibecode

- não deixar regra importante só no chat
- documentar o que virou verdade do sistema
- mover planos antigos para `archive/` quando deixarem de ser ativos
- documentar o que deu errado e a correção estrutural adotada
