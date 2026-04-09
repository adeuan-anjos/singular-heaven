# Contributing Docs

Guia de manutenção da documentação do projeto.

## Objetivo

Evitar três problemas típicos de projetos acelerados:

- conhecimento importante só existe em conversa
- decisão arquitetural não fica registrada
- docs viram histórico solto, e não source of truth

## Estrutura oficial

- `docs/adr/`
  - decisões arquiteturais
- `docs/explanation/`
  - por que o sistema funciona assim
- `docs/reference/`
  - contratos, invariantes, comandos e fontes de verdade
- `docs/how-to/`
  - guias operacionais e testes manuais
- `docs/archive/`
  - histórico útil, mas não normativo

## Regra de ouro

Toda mudança relevante deve atualizar pelo menos um destes:

- `ADR`
- `CHANGELOG`
- doc temática em `explanation/` ou `reference/`
- `known-bugs.md`

## Quando criar ou atualizar uma ADR

Crie ou atualize ADR quando houver decisão como:

- fonte de verdade mudou
- contrato backend/frontend mudou
- semântica oficial de produto mudou
- o sistema passou a depender de uma distinção importante

Exemplos deste projeto:

- sidebar usa `guide`
- likes de track são backend-first
- queue é dona da lógica de playback

## Quando atualizar o changelog

Atualize `docs/CHANGELOG.md` quando:

- uma feature relevante foi adicionada
- uma semântica importante mudou
- uma doc estrutural nova foi criada

Não usar changelog para logs de sessão ou experimentos abortados.

## Quando atualizar known bugs

Atualize `docs/known-bugs.md` quando:

- você identifica um bug real ainda não corrigido
- aceita conscientemente uma dívida técnica
- decide adiar uma refatoração visual/arquitetural

Remova do backlog quando:

- o bug foi corrigido e validado

## Regras para vibecode

Para mudanças feitas em sessões rápidas ou longas:

- não deixar decisão importante só no chat
- toda regra não óbvia deve ir para doc ou ADR
- se algo ainda não ficou bom, documentar em `known-bugs.md`
- se um fluxo virou “oficial”, documentar em `explanation/` e `reference/`

## Estilo de escrita

- usar frases diretas
- evitar narrativa de conversa
- separar claramente:
  - o que é regra atual
  - o que é exceção
  - o que é pendência
- preferir linkar outra doc a duplicar conteúdo

## Checklist antes de encerrar uma feature

1. O comportamento oficial ficou documentado?
2. A decisão arquitetural ficou documentada?
3. O changelog precisa registrar essa mudança?
4. Há bug conhecido ou dívida aceita a registrar?
5. Os links do `docs/README.md` continuam corretos?
