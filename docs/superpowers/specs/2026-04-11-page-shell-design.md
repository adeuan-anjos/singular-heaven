# Page Shell — Design unificado de layout do módulo YouTube Music

**Data:** 2026-04-11
**Módulo afetado:** `src/modules/youtube-music/`
**Status:** Aprovado para planejamento

## Contexto e problema

Hoje cada página do módulo YouTube Music declara o próprio wrapper de layout, repetindo literalmente `<div className="mx-auto max-w-screen-xl space-y-* p-4">` em 7 arquivos. A `playlist-page.tsx` é a única outlier e renderiza seu conteúdo sem wrapper — por isso o hover das track rows toca as bordas laterais, gerando inconsistência visual entre playlists e as demais coleções.

A duplicação também causa drift: algumas pages usam `space-y-4`, outras `space-y-6`; algumas envolvem em `<ScrollArea h-full>`, outras não. Cada mudança futura de espaçamento exige tocar 7 arquivos, com alto risco de divergência.

A razão técnica pela qual a playlist escapa do wrapper é real: ela usa `@tanstack/react-virtual` com um scroll container interno que depende de `ResizeObserver` sobre uma cadeia flex `flex min-h-0 flex-1 flex-col` ininterrupta entre a raiz da página e o `containerRef`. Aplicar o wrapper padrão quebraria a virtualização — e a virtualização é o que garante o consumo de memória em 333MB (linha de base documentada em memória do projeto, ex-pico de 1GB antes da otimização).

## Objetivo

Eliminar a duplicação de layout, padronizar largura, padding e espaçamento em todas as páginas do módulo, resolver o bug visual do hover full-width na playlist, e preservar o ganho de memória da virtualização.

Objetivos secundários:
- Adotar padrões shadcn v4 e TanStack Virtual v3 idiomáticos.
- Reduzir fricção futura: mexer em layout vira edição de um único componente.
- Manter comportamento de scroll restoration consistente entre rotas.

Fora de escopo:
- Redesenho visual (cores, tipografia, iconografia).
- Full-bleed / gradientes de herói em páginas de coleção (usuário prefere tudo centralizado no momento, mas a arquitetura deixa a porta aberta).
- Alterações no módulo `download-manager/`.

## Pesquisa consultada

Quatro relatórios de pesquisa foram consolidados antes deste design:
- **React / Wouter / shell patterns**: padrão de layout routes existe em React Router, Remix e Next App Router pelo mesmo motivo (single source of truth, persistência, isolamento de scroll). Em Wouter, o idioma canônico é envolver o `<Switch>` com um componente shell — não há primitiva mais elegante.
- **shadcn v4 blocks**: dashboard-01 e sidebar-01/07/16 usam `flex flex-1 flex-col gap-*` em vez de `space-y-*`, não usam `container`, colocam `@container/main` para container queries, e não envolvem o shell em `ScrollArea` — deixam o scroll nativo no `SidebarInset`.
- **TanStack Virtual v3**: suporta scroll element externo via `getScrollElement` retornando um elemento vindo de fora do componente; a recomendação é usar `useState` (não `useRef`) para o viewport, para que o virtualizer re-execute quando o elemento resolve. `scrollMargin` é obrigatório quando há header acima da lista dentro do mesmo scroll. Compatível com Radix ScrollArea desde que o `Viewport` tenha ref forwardado.
- **Music apps OSS (Feishin, Spotify clones, Navidrome)**: convergem em shell `overflow:hidden`, scroll único no nível do shell, `min-h-0` em toda a cadeia flex, e páginas lazy em `<Suspense>`. Feishin é o mais próximo do nosso stack e foi usado como referência de contrato.

Fontes completas listadas ao final.

## Decisões tomadas pelo usuário

- **Largura máxima**: `max-w-screen-xl` (~1280px), centralizada.
- **Padding lateral**: `p-6` (shadcn v4 dashboard-01 default).
- **Autorização ampla**: permitido editar `src/components/ui/scroll-area.tsx` para adicionar `viewportRef`, já que o trabalho será feito em git worktree e é reversível.

## Arquitetura proposta

### Visão geral do shell

```
<YouTubeMusicModule>                              // overflow:hidden, h-full, flex-col
  <TopBar />
  <div flex min-h-0 flex-1>                       // chrome row (inalterado)
    <SidePanel />
    <ScrollRegion>                                // NOVO — único scroll container da tela
      <PageContainer>                             // NOVO — largura máxima, padding, gap
        <Switch>…rotas…</Switch>
      </PageContainer>
    </ScrollRegion>
  </div>
  <PlayerBar />
</YouTubeMusicModule>
```

A raiz do módulo mantém `overflow: hidden` — nunca scrolla. O `ScrollRegion` passa a ser o único elemento scrollável. O `PageContainer` aplica largura, padding e gap uniformes em torno do `<Switch>`, de modo que nenhuma página precisa reinstalar esse wrapper.

### Componentes novos

Todos em `src/modules/youtube-music/components/layout/`:

**1. `scroll-viewport-context.tsx`**

Contexto React que expõe o elemento DOM do viewport do `ScrollRegion` para consumers aninhados (especialmente virtualizadores).

```tsx
import { createContext, useContext } from "react";

export type ScrollViewportElement = HTMLDivElement | null;

export const ScrollViewportContext = createContext<ScrollViewportElement>(null);

export function useScrollViewport(): ScrollViewportElement {
  return useContext(ScrollViewportContext);
}
```

Retornar `null` em renderizações antes do elemento resolver é aceitável — virtualizadores já lidam com isso quando `getScrollElement` retorna `null`.

**2. `scroll-region.tsx`**

Componente que encapsula `ScrollAreaPrimitive` do Radix diretamente (sem passar pelo wrapper shadcn), medindo o viewport em `useState` e publicando via `ScrollViewportContext`.

Contrato:
- Classes externas: `flex min-h-0 flex-1 flex-col`
- Viewport: `h-full w-full` (captura scroll nativo)
- Scrollbar: estilo idêntico ao `src/components/ui/scroll-area.tsx` atual (reaproveitar tokens)
- Publica o viewport via `ScrollViewportContext.Provider`

```tsx
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { useState, type ReactNode } from "react";
import { ScrollViewportContext, type ScrollViewportElement } from "./scroll-viewport-context";

export function ScrollRegion({ children }: { children: ReactNode }) {
  const [viewport, setViewport] = useState<ScrollViewportElement>(null);
  return (
    <ScrollAreaPrimitive.Root className="flex min-h-0 flex-1 flex-col">
      <ScrollAreaPrimitive.Viewport
        ref={setViewport}
        className="h-full w-full"
        data-singular-scroll-region
      >
        <ScrollViewportContext.Provider value={viewport}>
          {children}
        </ScrollViewportContext.Provider>
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        orientation="vertical"
        className="/* mesmos tokens da ui/scroll-area.tsx */"
      >
        <ScrollAreaPrimitive.Thumb className="/* … */" />
      </ScrollAreaPrimitive.Scrollbar>
    </ScrollAreaPrimitive.Root>
  );
}
```

O callback-ref `setViewport` garante que a mudança do elemento re-dispara consumers (requisito do `useState` em vez de `useRef`).

**3. `page-container.tsx`**

Aplica largura, padding, gap e container query. Sem props configuráveis neste momento — uniformidade total.

```tsx
import type { ReactNode } from "react";

export function PageContainer({ children }: { children: ReactNode }) {
  return (
    <div className="@container/main mx-auto flex w-full max-w-screen-xl flex-col gap-6 p-6">
      {children}
    </div>
  );
}
```

Decisões embutidas:
- `mx-auto` + `max-w-screen-xl`: conforme preferência do usuário.
- `p-6`: padrão shadcn v4.
- `flex flex-col gap-6`: substitui `space-y-*` (shadcn v4 convention, evita margin-collapsing edge cases).
- `@container/main`: habilita container queries em grids internos; qualquer filho pode usar `@md:`, `@lg:` baseados na largura do conteúdo (útil quando o sidebar colapsa no futuro).
- Sem props de opt-out agora. Se uma página futura precisar full-bleed, criamos uma variante ou adicionamos prop — YAGNI por enquanto.

### Alterações em componentes existentes

**`src/components/ui/scroll-area.tsx`** — adicionar prop `viewportRef` forwardada para `ScrollAreaPrimitive.Viewport`. Motivação: hoje o wrapper shadcn esconde o viewport, bloqueando qualquer consumer que precise observá-lo (virtualizadores, scroll listeners). A mudança é backward-compatible — a prop é opcional. Embora o `ScrollRegion` do módulo use `ScrollAreaPrimitive` diretamente, essa melhoria desbloqueia futuros consumers e normaliza o wrapper do design system.

**`src/modules/youtube-music/index.tsx`** — o bloco que hoje contém:

```tsx
<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
  <Switch>…</Switch>
</div>
```

Passa a:

```tsx
<ScrollRegion>
  <PageContainer>
    <Switch>…</Switch>
  </PageContainer>
</ScrollRegion>
```

O `<div flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden>` externo pode ser dispensado — `ScrollRegion` já tem `flex min-h-0 flex-1 flex-col` no Root. Validar que `min-w-0` não se perde (pode ser necessário manter como wrapper intermediário se sidebar causar overflow horizontal).

**`src/modules/youtube-music/components/shared/track-table.tsx`** — reescrita cirúrgica do modelo de scroll:

Remover:
- `containerRef` e `scrollRef`
- `ResizeObserver` que lê altura do container
- `containerHeight` state
- `<div ref={containerRef} className="flex min-h-0 flex-1 flex-col">` wrapper externo
- `<div ref={scrollRef} className="styled-scrollbar overflow-y-auto" style={{ height: containerHeight }}>`
- O wrapper `<div className="sticky top-0 z-10 bg-background">` — não é mais necessário porque o scroll é o viewport externo, não esse div

Adicionar:
- `const scrollViewport = useScrollViewport()`
- `const listRef = useRef<HTMLDivElement>(null)` — anchor no topo da lista virtualizada, para medir `scrollMargin`
- `const [scrollMargin, setScrollMargin] = useState(0)`
- `useLayoutEffect` com `ResizeObserver` no `listRef` e `headerContent` que recalcula `scrollMargin` quando o header acima da lista muda de altura:
  ```tsx
  const distance = list.getBoundingClientRect().top
    - viewport.getBoundingClientRect().top
    + viewport.scrollTop;
  setScrollMargin(distance);
  ```
- `useVirtualizer({ count, getScrollElement: () => scrollViewport, estimateSize: () => 56, overscan: 6, scrollMargin })` — `overscan` baixado de 8 (padrão) para 6, mitigando a preocupação de memória com viewport maior
- No render das rows, subtrair `scrollMargin` do `row.start`: `transform: translateY(${row.start - virtualizer.options.scrollMargin}px)`
- Header da tabela passa a `sticky top-0 z-10 bg-background` como classe simples (sem wrapper extra)

`estimateSize` permanece fixo em 56px — usar `measureElement` dinâmico reativaria o bug TanStack/virtual #997 em combinação com scroll restoration.

**`src/modules/youtube-music/components/shared/section-header.tsx`** — remover `px-2` do elemento root (linha 10). Hoje o `px-2` compondo com o `p-4` do wrapper da página gera deslocamento de 8px entre o título da section e os grids irmãos. Com o `PageContainer` sendo a única fonte de padding horizontal, o root do section-header deve ser limpo.

**Páginas — remover wrappers duplicados:**

| Arquivo | Mudança |
|---|---|
| `home-view.tsx:181` | remover `<div className="mx-auto max-w-screen-xl space-y-6 p-4">`; conteúdo interno passa a renderizar direto; se precisar de gap, é herdado do `PageContainer` (`gap-6`) |
| `explore-view.tsx:119` | idem |
| `library-view.tsx:103` | idem |
| `search/search-results-page.tsx:292` | idem |
| `album-page.tsx:116-117` | remover `<ScrollArea h-full>` externa + `<div mx-auto max-w-screen-xl space-y-4 p-4>`; o scroll e a largura já vêm do shell |
| `artist-page.tsx:117` | idem |
| `artist-songs-page.tsx:142` | idem |
| `playlist-page.tsx:547-548` | remover `<div flex min-h-0 flex-1 flex-col>`; `TrackTable` passa a ser filho direto do `PageContainer`, usando o scroll externo |

Após a mudança, todas as páginas retornam conteúdo semântico direto — nenhuma declara largura, padding ou scroll próprios.

## Fluxo de dados do scroll

```
ScrollRegion monta
  └─ useState captura viewport via setViewport (callback ref)
  └─ ScrollViewportContext.Provider publica viewport
       └─ PageContainer renderiza
            └─ <Switch> troca de rota
                 └─ TrackTable (na playlist/album/artist-songs)
                      └─ useScrollViewport() lê viewport
                      └─ useVirtualizer observa scroll events no viewport
                      └─ ResizeObserver mede scrollMargin dinamicamente
                      └─ virtualizer re-render apenas rows visíveis
```

Quando o usuário navega entre rotas, o `ScrollRegion` persiste (fora do `<Switch>`). O viewport permanece o mesmo elemento DOM, mas o `scrollTop` reseta para 0 em cada navegação porque o conteúdo interno muda. Scroll restoration por rota é fora do escopo desta entrega — será abordada em spec separada se necessário.

## Tratamento de erros

- Se `useScrollViewport()` retornar `null` no primeiro render, o virtualizer calcula `count = 0` visualmente e re-executa quando o viewport resolve. Nenhum log de erro esperado.
- Se `ResizeObserver` não disparar por causa de header não montado, o `scrollMargin` fica em 0 e as primeiras rows podem ficar sob o header até o próximo layout pass. Mitigação: chamar `virtualizer.measure()` manualmente após mudanças conhecidas de header.
- Se o `scrollMargin` calculado for negativo (edge case quando viewport ainda não renderizou), clampar para 0.

## Observabilidade

CLAUDE.md §4 exige debug logs e validação end-to-end. O que será instrumentado:

- `ScrollRegion`: log `[ScrollRegion] viewport mounted` quando `setViewport` recebe elemento não-nulo.
- `TrackTable`: log `[TrackTable] virtualizer init { scrollElement, scrollMargin, count }` no primeiro render efetivo; log `[TrackTable] scrollMargin update { previous, current, cause }` em cada recálculo.
- Debug overlay (`src/lib/debug`): adicionar stat `visibleRows` e `scrollMargin` para páginas virtualizadas. Render count tracker nos novos componentes (`useRenderTracker`).
- `useLeakDetector` em `ScrollRegion`, `PageContainer` e na reescrita do `TrackTable` — confirma unmount limpo quando o módulo desativa.

Os logs de debug ficam no código até autorização explícita do usuário para remover (CLAUDE.md §4).

## Estratégia de testes

- **Type-check**: `npm run tauri build` ou `tsc --noEmit` passa sem warnings.
- **Lint**: `npm run lint` passa.
- **Verificação visual manual** nas 8 rotas do módulo (home, explore, library, album, artist, artist-songs, playlist, search). Comparação antes/depois com screenshots.
- **Teste de memória da playlist**: abrir uma playlist com 1000+ tracks (ex.: "Liked Music" cheia). Baseline: 333MB. Critério de falha: pico acima de 380MB (margem de 14%). Ferramenta: debug overlay + `startMemoryMonitor` já existentes.
- **Teste de scroll smoothness**: rolar 200+ tracks na playlist; verificar ausência de jank (FPS ≥ 55 no devtools).
- **Teste de virtualização**: console `document.querySelectorAll('[data-slot=track-row]').length` deve ser próximo do `overscan * 2 + visível`, nunca próximo do total.
- **Teste de scroll restoration**: navegar playlist → artist → voltar; confirmar que o viewport não quebra (scroll volta a 0 é esperado, mas nada pode travar).
- **Teste de memory leak**: desativar o módulo (navegar para outro), reativar, inspecionar `FinalizationRegistry` via `useLeakDetector`. Nenhum componente do shell pode ficar reachable.

## Riscos e mitigações

| Risco | Severidade | Mitigação |
|---|---|---|
| Regressão de memória na playlist virtualizada | **Alta** | Teste de memória obrigatório após a Fase 3. Reverter a fase inteira se exceder 380MB. Baixar `overscan` para 6. |
| `scrollMargin` dessincroniza quando header muda (filtro, tabs, ações) | Média | `ResizeObserver` no `listRef`, recálculo em `useLayoutEffect`. Chamar `virtualizer.measure()` explicitamente após mutações conhecidas. |
| Scroll da playlist fica sob o header sticky em `scrollToIndex` | Baixa | Usar `{ align: 'start' }` + CSS `scroll-margin-top` se necessário. Fora do escopo imediato; anotar como follow-up. |
| ScrollArea do Radix perde estilo de scrollbar após reescrita | Baixa | Copiar tokens do `src/components/ui/scroll-area.tsx` atual diretamente no `ScrollRegion`. |
| Pages que usavam `<ScrollArea>` local perdem comportamento | Baixa | Auditoria na Fase 5 confirma que nada de `ScrollArea` interno sobra nas pages de álbum/artist/artist-songs. |
| `flex-1 + min-h-0` quebra em alguma camada intermediária | Baixa | Testes visuais nas 8 rotas; se quebrar, inspecionar a cadeia e ajustar camada por camada. |

## Fases de execução

Conforme CLAUDE.md §13, máximo 5 arquivos por fase. Cada fase encerra com verificação antes da próxima.

**Fase 0 — Worktree + branch** (0 arquivos): criar worktree isolada via `superpowers:using-git-worktrees`, branch `refactor/page-shell`.

**Fase 1 — Fundação** (4 arquivos):
1. `src/components/ui/scroll-area.tsx` — adicionar `viewportRef`
2. `src/modules/youtube-music/components/layout/scroll-viewport-context.tsx` (novo)
3. `src/modules/youtube-music/components/layout/scroll-region.tsx` (novo)
4. `src/modules/youtube-music/components/layout/page-container.tsx` (novo)

Verificação: type-check passa; app roda idêntico ao baseline (shell novo ainda não conectado).

**Fase 2 — Integração no shell** (1 arquivo):
1. `src/modules/youtube-music/index.tsx` — envolver `<Switch>` com `<ScrollRegion><PageContainer>`

Verificação: 8 rotas abrem sem erro. Visualmente ainda haverá wrapper duplicado (cada page tem o próprio `mx-auto max-w-screen-xl p-4`), o que é esperado; Fase 4 e 5 resolvem.

**Fase 3 — TrackTable para scroll externo** (1 arquivo + teste crítico):
1. `src/modules/youtube-music/components/shared/track-table.tsx`

Verificação crítica: **teste de memória da playlist**. Se falhar, reverter fase inteira.

**Fase 4 — Limpeza das pages estáticas + section-header** (5 arquivos):
1. `src/modules/youtube-music/components/shared/section-header.tsx` — remover `px-2`
2. `src/modules/youtube-music/components/home/home-view.tsx`
3. `src/modules/youtube-music/components/explore/explore-view.tsx`
4. `src/modules/youtube-music/components/library/library-view.tsx`
5. `src/modules/youtube-music/components/search/search-results-page.tsx`

Verificação: as 4 pages estáticas visualmente íntegras, alinhamento de section-headers corrigido.

**Fase 5 — Limpeza das pages de coleção** (4 arquivos):
1. `src/modules/youtube-music/components/pages/album-page.tsx`
2. `src/modules/youtube-music/components/pages/artist-page.tsx`
3. `src/modules/youtube-music/components/pages/artist-songs-page.tsx`
4. `src/modules/youtube-music/components/pages/playlist-page.tsx`

Verificação: layout uniforme em todas as coleções. Teste de memória repetido na playlist.

**Fase 6 — Auditoria final**:
- Screenshots antes/depois das 8 rotas
- RAM da playlist ≤ 333MB (idealmente; limite absoluto 380MB)
- `tsc --noEmit` limpo
- `npm run tauri build` limpo
- Debug overlay operacional

## Arquivos tocados

Total: **15 arquivos de código** (3 novos + 12 modificados), mais este spec.

Novos:
1. `src/modules/youtube-music/components/layout/scroll-viewport-context.tsx`
2. `src/modules/youtube-music/components/layout/scroll-region.tsx`
3. `src/modules/youtube-music/components/layout/page-container.tsx`

Modificados:
4. `src/components/ui/scroll-area.tsx`
5. `src/modules/youtube-music/index.tsx`
6. `src/modules/youtube-music/components/shared/track-table.tsx`
7. `src/modules/youtube-music/components/shared/section-header.tsx`
8. `src/modules/youtube-music/components/home/home-view.tsx`
9. `src/modules/youtube-music/components/explore/explore-view.tsx`
10. `src/modules/youtube-music/components/library/library-view.tsx`
11. `src/modules/youtube-music/components/search/search-results-page.tsx`
12. `src/modules/youtube-music/components/pages/album-page.tsx`
13. `src/modules/youtube-music/components/pages/artist-page.tsx`
14. `src/modules/youtube-music/components/pages/artist-songs-page.tsx`
15. `src/modules/youtube-music/components/pages/playlist-page.tsx`

## Critérios de aceitação

1. Todas as 8 rotas do módulo YouTube Music têm largura, padding horizontal e gap vertical idênticos — confirmado por screenshots sobrepostos.
2. Hover de track row na playlist respeita as bordas internas do `PageContainer` (resolve o bug visual original).
3. Nenhuma page declara `mx-auto`, `max-w-*`, `p-4`, `p-6`, `space-y-*` ou `<ScrollArea>` no seu wrapper externo.
4. `section-header` não tem padding horizontal no root.
5. Consumo de RAM ao abrir uma playlist de 1000+ tracks permanece ≤ 380MB.
6. Virtualização ativa: contagem de `track-row` no DOM muito menor que `count` total.
7. Type-check e build passam sem warnings novos.
8. Debug logs em `ScrollRegion`, `TrackTable` e debug overlay operacionais.

## Follow-ups fora do escopo

- Scroll restoration por rota.
- Variante `edgeToEdge` para possível futuro redesign com hero full-bleed.
- Migração das pages estáticas para `flex flex-col gap-*` em substituição a `space-y-*` internos (o `PageContainer` já usa `gap`, mas sub-seções ainda podem ter `space-y`).
- Aplicar `@container/main` em grids filhas para colapsar colunas com base na largura do conteúdo.

## Fontes

- TanStack Virtual — Virtualizer API: https://tanstack.com/virtual/latest/docs/api/virtualizer
- TanStack Virtual — React adapter: https://tanstack.com/virtual/latest/docs/framework/react/react-virtual
- Radix Primitives — ScrollArea: https://www.radix-ui.com/primitives/docs/components/scroll-area
- Radix discussion #1078 (virtualized lists + ScrollArea): https://github.com/radix-ui/primitives/discussions/1078
- TanStack/virtual issue #997 (scroll restoration gotcha): https://github.com/TanStack/virtual/issues/997
- shadcn/ui dashboard-01: https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/blocks/dashboard-01/page.tsx
- shadcn/ui sidebar-01: https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/blocks/sidebar-01/page.tsx
- shadcn/ui sidebar component: https://ui.shadcn.com/docs/components/sidebar
- feishin default-layout: https://github.com/jeffvli/feishin/blob/development/src/renderer/layouts/default-layout.tsx
- feishin animated-page: https://github.com/jeffvli/feishin/blob/development/src/renderer/features/shared/components/animated-page.tsx
- Wouter README: https://github.com/molefrog/wouter
- Tailwind v4 upgrade guide: https://tailwindcss.com/docs/upgrade-guide
