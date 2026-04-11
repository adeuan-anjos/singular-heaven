# Shadcn Component Composition

## Objetivo

Registrar as regras de composição de componentes customizados construídos sobre shadcn/ui neste projeto, com foco nos padrões que todo componente compartilhado deve seguir.

Esta doc existe para evitar três regressões:

- criar componentes monolíticos que aceitam dados via props ao invés de composição
- usar espaçamento e sizing manual em ícones quando o Button já resolve
- agrupar botões com `flex gap-*` manual ao invés de `ButtonGroup`

## Regra central

Todo componente compartilhado em `src/modules/*/components/shared/` deve seguir os mesmos padrões dos componentes em `src/components/ui/`.

## Anatomia de um sub-componente shadcn

```tsx
function ComponentName({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="component-name"
      className={cn("classes-padrão", className)}
      {...props}
    />
  );
}
```

Checklist obrigatório:

1. **`data-slot`** no elemento raiz — identificação para styling via seletores CSS
2. **`className` + `cn()`** — funde classes padrão com customização do consumidor
3. **`...props` spreading** — permite atributos HTML arbitrários (`aria-*`, `id`, `data-*`)
4. **`React.ComponentProps<"element">`** — props estendem do elemento HTML base
5. **plain function** — sem `forwardRef`, sem `displayName`

## Decomposição em sub-componentes

Seguir o padrão do Card:

```
Card
├── CardHeader
│   ├── CardTitle
│   ├── CardDescription
│   └── CardAction
├── CardContent
└── CardFooter
```

Quando criar um sub-componente:

- o elemento tem **styling específico e recorrente** entre consumidores
- o elemento tem **lógica interna** (como fallback de imagem)
- o elemento representa uma **região semântica** do componente

Quando NÃO criar:

- o elemento é só um `<p>` ou `<span>` com classe simples
- o styling varia muito entre consumidores
- só existe um consumidor

Todos os sub-componentes vivem no mesmo arquivo e são exportados como named exports.

## Botões com ícones

### Ícone com texto

Usar `data-icon="inline-start"` ou `data-icon="inline-end"`. O Button já cuida de:

- sizing do ícone via `[&_svg:not([class*='size-'])]:size-4`
- gap entre ícone e texto via `gap-1.5`
- ajuste de padding via `has-data-[icon=inline-start]:pl-2`

```tsx
// Correto
<Button variant="outline">
  <Play data-icon="inline-start" />
  Reproduzir
</Button>

// Errado — não usar className manual para spacing/sizing
<Button variant="outline">
  <Play className="mr-2 h-4 w-4" />
  Reproduzir
</Button>
```

### Ícone solo (icon button)

Usar `size="icon"` e `aria-label`. O Button auto-dimensiona o SVG.

```tsx
// Correto
<Button variant="outline" size="icon" aria-label="Favoritar">
  <Bookmark />
</Button>

// Errado — não forçar tamanho quando o Button já resolve
<Button variant="ghost" size="icon">
  <Bookmark className="h-5 w-5" />
</Button>
```

## Agrupamento de botões

### Quando usar `ButtonGroup`

Usar `ButtonGroup` quando botões são **ações relacionadas** que devem ser visualmente conectados (bordas compartilhadas, sem gap entre eles).

### Nested ButtonGroups

Usar nested `ButtonGroup` para separar **clusters funcionais** com gap entre os grupos:

```tsx
<ButtonGroup>
  <ButtonGroup>
    <Button>Reproduzir</Button>
    <Button>Aleatório</Button>
  </ButtonGroup>
  <ButtonGroup>
    <Button size="icon">Bookmark</Button>
    <Button size="icon">Menu</Button>
  </ButtonGroup>
</ButtonGroup>
```

O `ButtonGroup` raiz aplica `gap-2` entre grupos filhos. Botões dentro do mesmo grupo ficam conectados.

### Quando NÃO usar `ButtonGroup`

- botões são **independentes** sem relação semântica
- botão é um toggle isolado (como "Inscrever-se")
- o espaçamento entre botões deve ser livre

## O que não fazer

### Componentes monolíticos

```tsx
// Errado — props controlam tudo, consumidor não tem flexibilidade
<CollectionHeader
  title="..."
  subtitle="..."
  actions={[{ label: "Play", icon: Play, onClick: fn }]}
  menuContent={<MenuItems />}
/>

// Correto — consumidor compõe livremente
<CollectionHeader>
  <CollectionHeaderInfo>
    <CollectionHeaderThumbnail src="..." />
    <CollectionHeaderContent>
      <h1>...</h1>
    </CollectionHeaderContent>
  </CollectionHeaderInfo>
  <CollectionHeaderActions>
    <Button>Play</Button>
  </CollectionHeaderActions>
</CollectionHeader>
```

### Flex gap manual para ações

```tsx
// Errado
<div className="flex items-center gap-3">
  <Button>Play</Button>
  <Button>Shuffle</Button>
</div>

// Correto
<ButtonGroup>
  <Button>Play</Button>
  <Button>Shuffle</Button>
</ButtonGroup>
```

### Margin/padding manual em ícones de menu

Já coberto em [Shadcn Menu Composition](shadcn-menu-composition.md) — os wrappers de menu e botão já resolvem spacing.

## Listas de items (rows com avatar + texto + ação)

Para qualquer lista de linhas com avatar/imagem + título + descrição + ação — account pickers, team members, device lists, search results densos — usar o componente `Item` (`@/components/ui/item`).

### Regra central

Não empilhar `Button variant="outline"` nem `<button>` manual pra criar rows. Não embrulhar em `Card`. O `Item` já é o container da linha, com `variant` e `size` próprios.

```tsx
<ItemGroup>
  {items.map((item) => (
    <Item key={item.id} variant="outline" size="xs">
      <ItemMedia>
        <Avatar>
          <AvatarImage src={item.photoUrl} alt={item.name} />
          <AvatarFallback>{item.name.charAt(0)}</AvatarFallback>
        </Avatar>
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{item.name}</ItemTitle>
        <ItemDescription>{item.subtitle}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button variant="outline" size="sm" onClick={() => handleSelect(item)}>
          Selecionar
        </Button>
      </ItemActions>
    </Item>
  ))}
</ItemGroup>
```

### Não customizar sub-componentes

`Item`, `ItemMedia`, `ItemContent`, `ItemTitle`, `ItemDescription`, `ItemActions` já cuidam de sizing, spacing, typography e truncation. O `Avatar` dentro de `ItemMedia` também: não passar `className="size-*"` — o Item escala sozinho pelo `size="xs"|sm|default"`.

A ação da linha é o `Button` dentro de `ItemActions`, não a linha inteira. Não transformar o `Item` num `<button>` via `render={<button>}` — além de exigir `className` compensatório (`text-left`, `disabled:*`), quebra a separação semântica entre "display row" e "action".

### Loading state

Usar `Skeleton` **dentro** de `Item`s com a mesma shape da lista final. Preserva o reservado visual, evita layout shift quando os dados chegam.

```tsx
<ItemGroup>
  {Array.from({ length: 4 }).map((_, i) => (
    <Item key={i} variant="outline" size="xs">
      <ItemMedia>
        <Skeleton className="size-8 rounded-full" />
      </ItemMedia>
      <ItemContent>
        <Skeleton className="h-4 w-32" />
      </ItemContent>
    </Item>
  ))}
</ItemGroup>
```

### O que NÃO fazer

```tsx
// Errado — Button empilhado vira "gigante e tosco", border duplo, padding gigante
{accounts.map(acc => (
  <Button variant="outline" className="h-auto justify-start gap-3 px-4 py-3">
    <img src={acc.photoUrl} className="size-10 rounded-full" />
    <div>...</div>
  </Button>
))}

// Errado — Card como wrapper duplica o container visual do Item
<Card>
  <CardContent>
    <ItemGroup>...</ItemGroup>
  </CardContent>
</Card>
```

## Componentes existentes que seguem esse padrão

- `CollectionHeader` — header de playlist, álbum e artista
  - `CollectionHeaderInfo`, `CollectionHeaderThumbnail`, `CollectionHeaderContent`
  - `CollectionHeaderActions` (usa `ButtonGroup` como raiz)
  - `CollectionHeaderMenu` (wrapper de conveniência para `DropdownMenu` com ellipsis)
- `GoogleAccountPicker` e `AccountPicker` — pickers de auth do YouTube Music
  - Usam `ItemGroup` + `Item` para as linhas
  - Ação via `Button` em `ItemActions`
  - Zero `className` nos sub-componentes de `Item`

## Relação com outras docs

- [UI Invariants](ui-invariants.md)
- [Shadcn Menu Composition](shadcn-menu-composition.md)
- [Memory Optimization](../explanation/memory-optimization.md)
