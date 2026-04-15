# Lyrics View — Design Spec

**Data:** 2026-04-14
**Módulo:** `youtube-music`
**Escopo desta fase:** UI fullscreen com dados mockados. Backend (LRCLIB), extração de cores dominantes e modo karaokê word-level ficam para fases seguintes.

---

## 1. Objetivo

Adicionar uma visão de letras de música fullscreen com a mesma linguagem visual do Apple Music Desktop — capa grande à esquerda, controles inline embaixo da capa, letras sincronizadas scrollando à direita, gradient animado de cores dominantes ao fundo. Substitui temporariamente o `PlayerBar` enquanto está aberta.

---

## 2. Decisões de UX (validadas com o usuário)

| Decisão | Escolha |
|---------|---------|
| Como abrir | Botão dedicado "Aa" no `PlayerBar` **+** clique na thumbnail/título do `PlayerBar` |
| Sem lyrics disponíveis | Fallback "Now Playing" — capa ampliada + título/artista centralizados |
| Background | Gradient animado derivado das cores dominantes da capa |
| Estilo de letras | Apple Music clássico (linha atual destacada, adjacentes esmaecidas, scroll automático suave, clique pula). Karaokê word-level quando LRCLIB retornar formato enhanced |
| Controles do player | Player bar atual desaparece; controles inline integrados ao layout fullscreen |
| Transição | Slide vertical de baixo pra cima (`Sheet side="bottom"`) |
| Layout horizontal | Apple Music Desktop — capa grande à esquerda, letras à direita, controles inline embaixo da capa |

---

## 3. Arquitetura

### 3.1 Trigger via Sheet (não via rota Wouter)

- O projeto usa `Sheet` (Base UI Dialog) que já implementa slide-up nativo via `side="bottom"`. Misturar Sheet com rota seria um anti-padrão.
- Novo store Zustand `lyrics-store.ts` controla o estado `open`.
- `<LyricsSheet />` é montada **uma vez** no top-level de `youtube-music/index.tsx` (após o `<Router>`).
- Botões e clicks no `PlayerBar` chamam `useLyricsStore.getState().openLyrics()`.

### 3.2 Sheet fullscreen

```tsx
<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent
    side="bottom"
    className="h-svh w-screen max-w-none p-0 gap-0 border-0"
    showCloseButton={false}
  >
    <LyricsBackground colors={colors} />
    <LyricsHeader />
    <div className="flex-1 grid grid-cols-2 gap-12 px-12 pb-8 overflow-hidden">
      <LyricsArtworkPanel track={track} />
      {hasLyrics ? <LyricsLines data={data} /> : <LyricsEmpty />}
    </div>
  </SheetContent>
</Sheet>
```

`showCloseButton={false}` desliga o `X` padrão no canto superior direito do `SheetContent`. O botão de fechar custom (`<ChevronDown />`) fica no `<LyricsHeader />` à esquerda, dentro de um `<SheetClose render={<Button variant="ghost" size="icon" />}>`.

`SheetTitle` continua sendo renderizado como `sr-only` para acessibilidade (Base UI Dialog exige título acessível).

---

## 4. Estrutura de arquivos

### Novos arquivos

```
src/modules/youtube-music/
├── stores/
│   └── lyrics-store.ts                # { open, openLyrics, closeLyrics }
├── mocks/
│   └── lyrics-mock.ts                 # 3 músicas mockadas: synced, enhanced, missing
├── types/
│   └── lyrics.ts                      # LyricsLine, LyricsData, DominantColors
├── hooks/
│   └── use-lyrics.ts                  # Hook que retorna { data, activeLineIndex } (mock por enquanto)
└── components/
    └── lyrics/
        ├── lyrics-sheet.tsx           # Raiz — Sheet wrapper, lê store, monta children
        ├── lyrics-header.tsx          # Botão fechar (ChevronDown) + ações futuras
        ├── lyrics-artwork-panel.tsx   # Coluna esquerda: Avatar + título/artista + Slider + LyricsControls
        ├── lyrics-controls.tsx        # Linha de Buttons/Toggles — reaproveita stores existentes
        ├── lyrics-lines.tsx           # ScrollArea + map de linhas + auto-scroll para linha ativa
        ├── lyrics-line.tsx            # Uma linha — React.memo, recebe state: active|near|far
        ├── lyrics-empty.tsx           # Fallback quando type === "missing"
        └── lyrics-background.tsx      # Gradient animado de cores dominantes
```

### Arquivos modificados

- `src/modules/youtube-music/index.tsx` — adicionar `<LyricsSheet />` no top-level (após o `<Router>`).
- `src/modules/youtube-music/components/layout/player-bar.tsx` — adicionar:
  - Botão "Aa" (ícone `Mic2` ou `Quote` do `lucide-react`) à direita do botão de queue, chamando `openLyrics()`.
  - Handler `onClick` no wrapper `<button>` da `<Avatar>` (atualmente navega para o álbum) → adicionar opção alternativa: clique direto na capa abre lyrics, clique no nome do álbum no texto continua indo para o álbum. **A definir na implementação:** se o clique na thumbnail muda comportamento (lyrics) ou se vira menu de contexto. Decisão padrão: clique na thumbnail abre lyrics; o link de álbum continua sendo o texto "• Álbum" no `<p>` abaixo do título.
  - Handler `onClick` no `<p>` do título → `openLyrics()`.

---

## 5. Layout interno (estrutura usando shadcn primitives)

### `<SheetContent>` (h-svh, p-0, gap-0)

```
SheetHeader (h-14 — sem padding extra)
└── flex items-center px-4
    ├── SheetClose (render={<Button variant="ghost" size="icon" />}) com <ChevronDown />
    └── SheetTitle (sr-only) "Letra"

div (flex-1 grid grid-cols-2 gap-12 px-12 pb-8 overflow-hidden)
├── LyricsArtworkPanel (flex flex-col items-start justify-center gap-6)
│   ├── Avatar (size-80, rounded-2xl)
│   │   ├── AvatarImage (object-cover)
│   │   └── AvatarFallback (rounded-2xl)
│   ├── div (font-heading)
│   │   ├── h2 (text-3xl font-semibold) — título
│   │   └── p (text-lg text-muted-foreground) — artista
│   ├── div (w-full) — progresso
│   │   ├── Slider (max=duration, step=1, value=[progress])
│   │   └── div (flex justify-between text-xs) — currentTime / duration
│   └── LyricsControls (flex items-center gap-2)
│       ├── Toggle Shuffle (size="sm")
│       ├── Button SkipBack (variant="ghost" size="icon")
│       ├── Button Play/Pause (size="icon-lg")
│       ├── Button SkipForward (variant="ghost" size="icon")
│       └── Toggle Repeat (size="sm")
└── LyricsLines (h-full)
    └── ScrollArea (h-full)
        └── div (max-w-2xl mx-auto py-[40vh] flex flex-col gap-4)
            └── LyricsLine[] (button — onClick={() => seek(line.time)})
                └── span (text-3xl font-semibold)
```

### Tipografia das linhas

| Estado | Classes |
|--------|---------|
| Linha ativa | `text-foreground opacity-100 scale-100` |
| Linhas adjacentes (±1, ±2) | `text-foreground/60 scale-95` |
| Linhas distantes | `text-foreground/30 scale-90` |
| Transições | `transition-all duration-500 ease-out` |

### Background gradient animado

- `<div className="absolute inset-0 -z-10 overflow-hidden">` dentro do `SheetContent`.
- 2 a 3 blobs com `bg-gradient-radial` (Tailwind v4 suporta) ou `<div className="absolute size-[60vw] rounded-full blur-3xl" style={{ background: color, transform: ... }}>`.
- Animação CSS via `@keyframes` simples (rotação/escala lenta), não JS — para não custar GPU.
- Cores na fase mock: hardcoded por música. Na fase backend: extraídas via `node-vibrant` ou `colorthief` (a decidir no plano de implementação backend).

---

## 6. Dados (UI-only)

### Tipos

```ts
// types/lyrics.ts
export interface LyricsWord {
  time: number      // segundos relativos ao início da música
  text: string
}

export interface LyricsLine {
  time: number      // segundos
  text: string      // linha completa
  words?: LyricsWord[]   // só presente em modo "enhanced"
}

export type LyricsType = "synced" | "enhanced" | "missing"

export interface LyricsData {
  type: LyricsType
  lines: LyricsLine[]
  colors: string[]   // hex/oklch — gradient background
}
```

### Mock

```ts
// mocks/lyrics-mock.ts
export const LYRICS_MOCKS: Record<string, LyricsData> = {
  "mock-synced":   { type: "synced",   lines: [...], colors: ["#7c3aed", "#ec4899", "#f59e0b"] },
  "mock-enhanced": { type: "enhanced", lines: [...], colors: [...] },
  "mock-missing":  { type: "missing",  lines: [],    colors: [...] },
}

export const FALLBACK_COLORS = ["#1e293b", "#334155", "#475569"]
```

### Hook

```ts
// hooks/use-lyrics.ts
export function useLyrics(videoId: string | null): {
  data: LyricsData | null
  activeLineIndex: number
} {
  const progress = usePlayerStore(s => s.progress)
  const data = videoId ? (LYRICS_MOCKS[videoId] ?? LYRICS_MOCKS["mock-synced"]) : null
  const activeLineIndex = useMemo(() => {
    if (!data || !data.lines.length) return -1
    let i = 0
    for (let n = 0; n < data.lines.length; n++) {
      if (data.lines[n].time <= progress) i = n
      else break
    }
    return i
  }, [data, progress])
  return { data, activeLineIndex }
}
```

Quando o backend chegar, a única mudança é a fonte de `data` — a assinatura permanece.

---

## 7. Comportamento e edge cases

| Caso | Comportamento |
|------|---------------|
| Sheet aberta + usuário troca música | Lyrics atualizam (componente reage ao `currentTrackId`) |
| Sheet aberta + Esc / clique fora | Fecha (Sheet trata via `onOpenChange`) |
| Música sem lyrics (`type === "missing"`) | Renderiza `<LyricsEmpty />` no lugar de `<LyricsLines />` |
| Música com lyrics enhanced | `<LyricsLines mode="enhanced" />` — palavra-por-palavra (fase visual posterior) |
| Clique em uma linha | Chama `usePlayerStore.getState().seek(line.time)` |
| Auto-scroll | `useEffect` em `activeLineIndex` chama `lineRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })` |
| Player bar visível atrás | Sheet cobre tudo (fullscreen `h-svh`); player bar fica oculto pelo overlay |
| Track sem `currentTrackId` | Sheet não abre (botão "Aa" desabilitado quando `!currentTrackId`) |

---

## 8. Performance e memória

Seguindo `CLAUDE.md` §4.1 e `docs/explanation/memory-optimization.md`:

- `<LyricsLine />` é `React.memo` — recebe `state: "active" | "near" | "far"` calculado pelo pai.
- `useLyrics` deriva `activeLineIndex` em `useMemo`, evitando recálculo a cada render.
- Sem `useState` para progresso na raiz — `progress` vem direto do `usePlayerStore` via seletor granular.
- `<LyricsBackground />` usa apenas CSS animations (zero JS no loop de animação).
- `<LyricsSheet />` é montada uma única vez no nível do módulo, mas o conteúdo interno (`<LyricsContent />`) só renderiza quando `open === true` — guard precoce.
- `ScrollArea` (Base UI) já é virtualizada nativamente; lyrics raramente passam de 100 linhas.

---

## 9. Verificação

1. `npm run tauri dev` e abrir o módulo YouTube Music.
2. Tocar qualquer música; clicar no botão **Aa** no `PlayerBar` → Sheet sobe.
3. Validar:
   - Gradient anima suavemente.
   - Capa renderiza no tamanho `size-80`.
   - Linhas avançam com o progresso (active scrollIntoView centro).
   - Clique em uma linha pula o player para aquele tempo.
4. Testar `Esc` / clique fora / botão `ChevronDown` → fecha.
5. Trocar para música com `mock-missing` → fallback "Now Playing" aparece.
6. Validar (via DevTools React Profiler) que abrir/fechar a Sheet não causa re-render no `<App />` raiz nem em outros componentes do módulo além de `<LyricsSheet />`.
7. `npm run lint` (se configurado) e `tsc --noEmit` para garantir tipos.

---

## 10. Fora de escopo (próximas fases)

- Integração com LRCLIB (HTTP fetch, cache em SQLite via sidecar Rust).
- Extração real de cores dominantes da capa.
- Modo karaokê word-level visual (renderização palavra-por-palavra).
- Botão para alternar entre lyrics e fila no mesmo Sheet.
- Sincronização com a tela de "Now Playing" do macOS / Windows media controls.
