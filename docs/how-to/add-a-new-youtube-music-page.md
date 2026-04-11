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

## Header da página

Se a página tiver header com thumbnail, título e ações, usar os sub-componentes de `CollectionHeader`:

```tsx
<CollectionHeader>
  <CollectionHeaderInfo>
    <CollectionHeaderThumbnail src="..." alt="..." fallback="X" />
    <CollectionHeaderContent>
      <h1 className="text-4xl font-bold text-foreground">Título</h1>
      <p className="text-sm text-muted-foreground">Subtítulo</p>
    </CollectionHeaderContent>
  </CollectionHeaderInfo>
  <CollectionHeaderActions>
    <ButtonGroup>
      <Button variant="outline">
        <Play data-icon="inline-start" /> Reproduzir
      </Button>
    </ButtonGroup>
  </CollectionHeaderActions>
</CollectionHeader>
```

Ver [Shadcn Component Composition](../reference/shadcn-component-composition.md) para regras completas.

## Anti-patterns

- `findIndex(videoId)` como verdade de posição
- arrays locais do React como fonte de playback
- like de música em estado local
- componente monolítico com props `actions[]`, `menuContent`, `trailingActions` — usar composição
- `className="mr-2 h-4 w-4"` em ícones de botão — usar `data-icon="inline-start"`
- `flex gap-*` manual para agrupar botões — usar `ButtonGroup`
