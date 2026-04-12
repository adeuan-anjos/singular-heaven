# Smooth Wheel Scroll — Referência Técnica

> Como o Singular Haven implementa scroll suave via mouse wheel sem libs externas.

---

## Problema

O Chromium (WebView2) trata eventos de `wheel` como saltos discretos — cada tick da roda do mouse avança o scroll em incrementos fixos (~100px). O resultado visual é um scroll "engasgado" em vez do deslize fluido que navegadores como Zen e Brave oferecem.

**Abordagens descartadas:**

| Abordagem | Por que não funciona |
|---|---|
| `scroll-behavior: smooth` (CSS) | Só afeta scrolls programáticos (`scrollTo`, `scrollIntoView`). Zero efeito em wheel input per spec. Além disso, causa lag no thumb da scrollbar nativa. |
| `--enable-features=SmoothScrolling` (Chromium flag) | Só suaviza scrolls via teclado. Wheel events rodam no compositor thread sem interpolação. |
| Lenis / locomotive-scroll | Substituem scroll nativo inteiro. Scrollbar thumb salta ([issue #168](https://github.com/darkroomengineering/lenis/issues/168)), scroll nativo é bloqueado durante animação ([issue #107](https://github.com/darkroomengineering/lenis/issues/107)). Conflito com TanStack Virtual ([discussion #701](https://github.com/TanStack/virtual/discussions/701)). |
| gblazex/smoothscroll | Licença proíbe apps nativos sem permissão escrita. Singleton global com fila compartilhada — conflita com múltiplos scroll containers. Abandonado (2020). |

---

## Solução: `useSmoothWheel` hook

**Arquivo:** `src/hooks/use-smooth-wheel.ts`

Hook React que intercepta eventos de `wheel` em um elemento scrollável específico e anima `scrollTop` via `requestAnimationFrame` com curva ease-out.

### Como funciona

```
wheel event
  → preventDefault() cancela o salto nativo
  → deltaY * speed acumulado no targetY (clampado a [0, scrollHeight - clientHeight])
  → rAF loop: currentY += (targetY - currentY) * (1 - friction) a cada frame
  → element.scrollTop = round(currentY)
  → para quando |diff| < 0.5px
```

### Parâmetros

| Parâmetro | Default | Efeito |
|---|---|---|
| `element` | — | Elemento scrollável (viewport do `ScrollRegion`) |
| `speed` | 1 | Multiplicador do `deltaY`. >1 = mais rápido, <1 = mais lento |
| `friction` | 0.95 | Fator de retenção por frame. Mais alto = mais suave/longo. Mais baixo = mais responsivo/seco |

**Referência de friction:**

| Valor | Sensação |
|---|---|
| 0.85 | Responsivo, quase discreto |
| 0.90 | Suave leve |
| 0.95 | Deslize natural (padrão atual) |
| 0.97 | Quase "gelo" — coast longo |

### O que fica nativo

- **Scrollbar drag** — `wheel` handler não intercepta `mousedown`/`mousemove` na scrollbar
- **Teclado** — setas, Page Up/Down, Home/End passam direto
- **Touch** — eventos de touch não são interceptados
- **Scroll programático** — `scrollTo()`, `scrollBy()` chamados por código não passam pelo handler

### Onde é aplicado

Apenas no `ScrollRegion` (conteúdo principal do módulo YouTube Music). A sidebar usa scroll nativo com virtualização própria e não recebe o hook.

```tsx
// scroll-region.tsx
export function ScrollRegion({ children }: ScrollRegionProps) {
  const [viewport, setViewport] = useState<ScrollViewportElement>(null);
  useSmoothWheel(viewport);
  // ...
}
```

---

## Flags do WebView2

**Arquivo:** `src-tauri/src/lib.rs`

Antes do `tauri::Builder`, o app seta flags do Chromium via env var (Windows only):

```rust
#[cfg(target_os = "windows")]
std::env::set_var(
    "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection \
     --enable-features=SmoothScrolling,FractionalScrollOffsets",
);
```

| Flag | Efeito |
|---|---|
| `SmoothScrolling` | Suaviza scrolls via teclado (compositor-level). Defensiva — já é default no Chromium ~v91+. |
| `FractionalScrollOffsets` | Armazena posição de scroll como float em vez de truncar pra int. Melhora posicionamento sub-pixel em telas HiDPI. |
| `--disable-features=msWebOOUI,...` | Re-adiciona as flags padrão do wry que são perdidas ao customizar `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`. |

**Caveats:**
- Só Windows (WebView2/Chromium). macOS/Linux usam WebKit — gateado por `#[cfg(target_os = "windows")]`.
- Microsoft avisa que flags podem ser removidas sem aviso em versões futuras do WebView2 Runtime.

---

## Interação com virtualização

O `useSmoothWheel` é compatível com `@tanstack/react-virtual` porque:

1. **Não substitui o scroll container** — o viewport do `ScrollRegion` continua sendo um `<div overflow: auto>` nativo.
2. **`scrollTop = value` dispara `scroll` event** — o virtualizer escuta esse evento normalmente e recalcula itens visíveis.
3. **Frequência**: ~60 scroll events/s durante animação. O virtualizer com `useFlushSync: false` batcha atualizações via microtask sem bloquear o rAF loop.

**Onde NÃO usar com virtualização:**
- Containers com sidebar highlight sync que faz `getBoundingClientRect()` + `setState()` por scroll event — causa layout thrash. A sidebar do YouTube Music usa virtualização própria com highlight sync e por isso NÃO recebe o smooth wheel.

---

## Histórico de decisões

- **0.85 → 0.92 → 0.95 → 0.97 → 0.96 → 0.95**: tuning iterativo com o usuário. 0.95 escolhido como equilíbrio entre fluidez e responsividade.
- **Global → per-element**: inicialmente o hook era global (listener no `document`, `WeakMap` por elemento). Causou lag na sidebar virtualizada. Revertido para per-element aplicado apenas no `ScrollRegion`.
- **CSS `scroll-behavior: smooth` removido**: causava ~300-500ms de delay no thumb da scrollbar e jank na virtualização. `scroll-behavior: auto` é o correto para scroll nativo; a suavidade vem do hook JS apenas em wheel events.

---

## Fontes

- [Chromium bug: mouse wheel needs rate-smoother](https://issues.chromium.org/issues/41077951)
- [SmoothScroll extension source (gblazex)](https://github.com/gblazex/smoothscroll)
- [Lenis scrollbar jump issue](https://github.com/darkroomengineering/lenis/issues/168)
- [TanStack Virtual smooth scroll loop](https://github.com/TanStack/virtual/discussions/701)
- [WebView2 browser flags — Microsoft Docs](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/webview-features-flags)
- [MDN scroll-behavior spec](https://developer.mozilla.org/en-US/docs/Web/CSS/scroll-behavior)
