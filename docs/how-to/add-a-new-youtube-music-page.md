# Add a New YouTube Music Page

Se a página tiver lista reproduzível, ela deve seguir o fluxo backend-first.

## Regra

Não começar pelo componente visual. Começar pela fonte de verdade.

## Checklist

1. Definir se a página cria uma coleção reproduzível.
2. Persistir a coleção no backend/cache.
3. Usar `trackIds` e índice absoluto para playback.
4. Integrar com queue global.
5. Passar `currentTrackId` e `isPlaying` para a tabela quando necessário.
6. Atualizar docs:
   - ADR, se houver decisão nova
   - changelog
   - explanation/reference

## Anti-patterns

- `findIndex(videoId)` como verdade de posição
- arrays locais do React como fonte de playback
- like de música em estado local
