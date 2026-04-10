# Shadcn Menu Composition

## Objetivo

Registrar as regras de composição de `DropdownMenu` e `ContextMenu` usadas no app, com foco nas lições aprendidas durante a implementação da sidebar do YouTube Music.

Esta doc existe para evitar quatro regressões:

- customizar espaçamento e largura de menu no lugar errado
- tratar `DropdownMenu` e `ContextMenu` como se fossem o mesmo componente
- quebrar a relação visual entre menu, item alvo e backdrop blur
- reintroduzir complexidade acidental em listas virtualizadas

## Regra central

Antes de customizar um menu, descobrir **qual primitive está realmente no controle**:

- `Trigger`
- `Positioner`
- `Popup`
- `Backdrop`

Quando o visual estiver estranho, o primeiro diagnóstico deve ser estrutural, não cosmético.

## Dropdown vs Context Menu

### `DropdownMenu`

Usar quando existe um acionador explícito:

- botão `...`
- botão de overflow
- botão de ações

Semântica:

- o menu pertence a um trigger visível
- normalmente abre ancorado ao trigger ou ao elemento que o trigger representa

### `ContextMenu`

Usar para gesto contextual:

- `right click`
- long press

Semântica:

- o menu pertence ao item clicado
- a posição segue o ponteiro
- ele não precisa abrir “embaixo” do item como um dropdown

## Regras de composição visual

### 1. Confiar primeiro no wrapper base

O shadcn/Base UI já resolve:

- densidade do item
- relação ícone/texto
- destructive state
- separator
- focus state

Então o default é:

- não adicionar `mr-*` manual em ícones
- não forçar largura dos itens
- não criar padding local para “consertar” espaçamento

### 2. Largura é responsabilidade do content, não do item

Quando o menu ficar “esmagado”, a primeira suspeita deve ser:

- `DropdownMenuContent`
- `ContextMenuContent`
- herança da largura do anchor

Não resolver com:

- padding extra no item
- gaps artificiais entre ícone e texto
- hacks por label

No projeto, o ajuste correto foi:

- deixar os itens no padrão do wrapper
- e controlar largura no `Content` quando necessário

### 3. Labels de grupo são exceção, não default

Se o menu funcionar com:

- `Group`
- `Item`
- `Separator`

isso deve ser preferido.

`Label` só entra quando a distinção semântica realmente melhora o menu.  
Em menus curtos e frequentes, labels demais deixam o resultado menos shadcn-like.

### 4. Variantes destrutivas devem usar a API do menu

Usar:

- `variant="destructive"`

Evitar:

- classes locais para colorir item destrutivo
- customizações pontuais que desviem do wrapper

## Backdrop blur

### Regra

O blur deve ficar no **resto da tela**, não dentro do popup.

Então:

- o `Backdrop` pertence ao wrapper do menu
- o `Popup` continua nítido

### O que não fazer

- aplicar `backdrop-blur` no próprio menu
- blur item a item
- espalhar blur nos consumidores do menu

## Relação visual com o item alvo

### Casos sem virtualização

Se o trigger e o item real vivem no mesmo contexto visual, o normal é:

- trigger nítido
- popup nítido
- resto desfocado

Nesses casos, não é necessário criar camada extra de highlight.

### Casos com virtualização

Em listas virtualizadas, a row costuma usar `transform`, o que cria `stacking context`.

Consequência:

- subir o trigger com `z-index` pode não bastar
- o item alvo pode continuar desfocado atrás do backdrop

Solução adotada no projeto:

- manter a virtualização
- manter o `Backdrop`
- renderizar um **highlight overlay** do item alvo acima do blur

Essa camada:

- não substitui a row real
- não mexe no cálculo do virtualizer
- existe só enquanto o menu estiver aberto

## Ancoragem em listas virtualizadas

### O erro que não deve voltar

Não usar trigger destacado invisível como âncora de dropdown quando isso introduzir lifecycle indesejado do próprio primitive.

No caso da sidebar, isso levou a:

- `reason: "trigger-hover"`
- `eventType: "mouseleave"`
- fechamento do menu ao mover o mouse da row para o popup

### Regra adotada

Para dropdown em row virtualizada:

- o botão `...` continua sendo o `DropdownMenuTrigger`
- o `DropdownMenuContent` pode ser ancorado à row real com `anchor`
- o botão é o acionador
- a row é a âncora visual

Isso é mais simples e mais estável do que usar trigger invisível + `handle`.

## Highlight do item alvo

### Regra

Quando houver blur global e a row real não puder ficar nítida por causa da árvore visual, o item alvo deve ganhar highlight próprio.

### Comportamento esperado

- aparece quando o menu abre
- some quando o menu fecha
- acompanha resize/scroll enquanto o menu estiver aberto
- não interfere com clique/scroll da lista

### Títulos longos

O highlight não deve ser tratado como cópia literal comprimida da row original.

Regra adotada:

- a row original pode truncar
- o highlight pode expandir horizontalmente quando houver espaço
- o texto do highlight pode deixar de usar `truncate`

Motivo:

- o highlight é affordance contextual temporária
- ele deve privilegiar clareza do alvo, não densidade da lista

## Regras práticas para este projeto

- `ContextMenu` da sidebar continua sendo o menu de `right click`
- `DropdownMenu` do botão `...` continua existindo como affordance explícita
- ambos compartilham o mesmo conteúdo de ações
- em listas virtualizadas, blur + highlight são parte do comportamento oficial
- ajustes de spacing e largura devem ser feitos no wrapper/base do menu ou no `Content`, não nos itens

## Checklist antes de “consertar” um menu

1. O problema está no `Trigger`, no `Content`, no `Positioner` ou no `Backdrop`?
2. O caso é `DropdownMenu` ou `ContextMenu`?
3. O item vive em lista virtualizada?
4. O problema é largura do popup ou espaçamento interno do item?
5. O wrapper já oferece uma API para isso antes de criarmos workaround?
6. A correção pode ser centralizada no componente base ou precisa mesmo ser local?

## Relação com outras docs

- [UI Invariants](./docs/reference/ui-invariants.md)
- [YouTube Music Sidebar Architecture](./docs/explanation/youtube-music-sidebar-architecture.md)
- [YouTube Music Playlist Management](./docs/explanation/youtube-music-playlist-management.md)
