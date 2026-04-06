# Singular Haven — Guia de Otimização de Memória RAM

> Referência técnica consolidada para manter o consumo de memória mínimo.
> Baseado em pesquisa de documentação oficial, artigos técnicos e issues reais.

---

## 1. Anatomia de Memória de um App Tauri 2

| Componente | RAM típica | Controlável? |
|---|---|---|
| Processo Rust (Tauri core) | ~5 MB | Sim — allocator, state management |
| WebView (WebView2/WKWebView/WebKitGTK) | ~115 MB | Parcial — DOM, JS heap, GPU layers |
| Sidecar (yt-dlp, ytmusic-api) | ~20-80 MB cada | Sim — lifecycle on-demand |
| **Total idle (single window)** | **~30-50 MB** | — |

**Conclusão arquitetural**: O WebView domina o consumo. Otimizar o frontend é o maior alavancador. O processo Rust é leve por natureza. Sidecars são o segundo maior custo e devem ser gerenciados agressivamente.

**Fontes**: [Tauri Discussion #3162](https://github.com/tauri-apps/tauri/discussions/3162), [Tauri vs Electron - Hopp](https://www.gethopp.app/blog/tauri-vs-electron)

---

## 2. Arquitetura: Single Window + Single WebView

**Regra**: Uma janela, um WebView, módulos trocados via React. Nunca multi-window para módulos.

**Por quê**: Cada WebView adicional no Windows spawna processos Chromium separados (renderer, GPU, network). Um segundo WebView pode custar +80-120 MB. No macOS/Linux (WKWebView/WebKitGTK) o custo é menor, mas ainda significativo.

**Exceção**: Janelas verdadeiramente independentes (player destacável) podem usar janela separada, mas com `set_memory_usage_level(Low)` quando inativas.

**Fontes**: [Microsoft WebView2 Performance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/performance), [Tauri Issue #2975](https://github.com/tauri-apps/tauri/issues/2975)

---

## 3. Módulos: Lazy Loading + Desmontagem Real

### O que É liberado ao desmontar

| Recurso | Liberado? | Mecanismo |
|---|---|---|
| Fiber tree React (componentes, state, closures) | Sim | GC após unmount |
| DOM nodes do módulo | Sim | Removidos da árvore |
| Event listeners (se cleanup correto) | Sim | `useEffect` return |
| Timers, intervals | Sim | `clearInterval`/`clearTimeout` |
| WebSocket/WebRTC connections | Sim | `.close()` no cleanup |
| AudioContext e buffers | Sim | `.close()` libera tudo |
| Web Workers | Sim | `.terminate()` libera heap inteiro do worker |
| Sidecars (yt-dlp) | Sim | Kill do processo via Rust |
| Blob URLs | Sim | `URL.revokeObjectURL()` |

### O que NÃO é liberado

| Recurso | Por quê |
|---|---|
| Código JS do módulo (~50-200KB) | ES modules ficam no cache do V8 permanentemente. Não há API para descarregar módulos importados. |
| Variáveis de nível de módulo já inicializadas | Singleton patterns no top-level persistem |

**Conclusão**: O código cached é aceitável (~50-200KB). O custo real de memória são os recursos runtime (audio buffers, connections, sidecars) — esses DEVEM ser liberados.

### Template de cleanup obrigatório

```tsx
// Cada módulo DEVE seguir este padrão
function MeuModulo() {
  useEffect(() => {
    const controller = new AbortController();
    const interval = setInterval(poll, 5000);
    const unlisten = await listen('evento-tauri', handler);
    const audioCtx = new AudioContext();
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

    return () => {
      controller.abort();          // Cancela fetches pendentes
      clearInterval(interval);     // Remove timers
      unlisten();                  // Remove listeners Tauri
      audioCtx.close();            // Libera TODOS os nodes e buffers de áudio
      worker.terminate();          // Libera heap inteiro do worker
      // + kill sidecar via comando Tauri
      // + URL.revokeObjectURL() de qualquer blob
      // + socket.close() para WebSocket/WebRTC
    };
  }, []);
}
```

**Fontes**: [React Memory Leaks - Medium](https://medium.com/@90mandalchandan/understanding-and-managing-memory-leaks-in-react-applications-bcfcc353e7a5), [ES Modules GC Discussion](https://esdiscuss.org/topic/are-es-modules-garbage-collected-if-so-do-they-re-execute-on-next-import), [5 React Memory Leaks - CodeWalnut](https://www.codewalnut.com/insights/5-react-memory-leaks-that-kill-performance)

---

## 4. Sidecar Lifecycle Management

**Regra**: Sidecars são processos OS completos. Spawn on-demand, kill on deactivation.

### Riscos

- **Processos órfãos**: Se o shutdown handler falhar, o sidecar continua consumindo RAM indefinidamente.
- **Sem lifecycle automático**: Tauri não gerencia ciclo de vida de sidecars — é responsabilidade do dev.

### Padrão recomendado (Rust)

```rust
struct SidecarManager {
    process: Arc<Mutex<Option<CommandChild>>>,
}

impl SidecarManager {
    async fn start(&self) -> Result<()> {
        let child = Command::new_sidecar("yt-dlp")?.spawn()?;
        *self.process.lock().await = Some(child);
        Ok(())
    }

    async fn stop(&self) -> Result<()> {
        if let Some(child) = self.process.lock().await.take() {
            child.kill()?; // SIGTERM -> timeout -> SIGKILL
        }
        Ok(())
    }
}

// Registrar handler de saída do app para matar TODOS os sidecars
```

### Comunicação

Preferir **stdout/stdin pipes** sobre HTTP localhost. HTTP carrega overhead do stack HTTP + socket aberto. Pipes são leves e fecham automaticamente quando o processo termina.

**Fontes**: [Tauri Plugin Request #3062](https://github.com/tauri-apps/plugins-workspace/issues/3062), [tauri-sidecar-manager](https://github.com/radical-data/tauri-sidecar-manager)

---

## 5. WebView Memory Level (Windows)

### API: `set_memory_usage_level`

Disponível via wry 0.35.0+. Sinaliza ao WebView2 para reduzir consumo de memória swapando dados para disco.

```rust
use wry::WebViewExtWindows;

// Quando o app é minimizado ou vai para a tray:
webview.set_memory_usage_level(MemoryUsageTargetLevel::Low);

// Quando o app volta ao foco:
webview.set_memory_usage_level(MemoryUsageTargetLevel::Normal);
```

**Importante**: Não misturar com `TrySuspendAsync`. Escolher uma abordagem. O restore para `Normal` NÃO é automático.

**Fontes**: [Wry 0.35.0 Release](https://v2.tauri.app/release/wry/v0.35.0/), [WebView2 MemoryUsageTargetLevel Spec](https://github.com/MicrosoftEdge/WebView2Feedback/blob/main/specs/MemoryUsageTargetLevel.md)

---

## 6. IPC: Evitar Pressão de Memória

### O problema

`invoke` do Tauri serializa: Rust struct → serde_json → JSON string → escaped string → eval no WebView. Cada passo copia dados na memória.

- Payloads de 500MB: ~30 segundos via invoke vs 5s via file I/O direto
- Payloads de 10MB: ~5ms no macOS, ~200ms no Windows

### Regras

| Tamanho do payload | Abordagem |
|---|---|
| < 10KB | `invoke` normal |
| 10KB - 1MB | Batch múltiplas chamadas em uma |
| > 1MB | Escrever em arquivo temp, passar o path |
| Streaming (áudio) | Pipe via sidecar, nunca via IPC |

### Bug conhecido

Emitir eventos frequentes de Rust para JS (`tauri::event::emit`) causa leak lento de memória. Quanto mais eventos/segundo, mais rápido o leak. Sempre chamar `unlisten()` no unmount.

**Fontes**: [Tauri Issue #5641](https://github.com/tauri-apps/tauri/issues/5641), [Tauri Discussion #5690](https://github.com/tauri-apps/tauri/discussions/5690), [Tauri Issue #852](https://github.com/tauri-apps/tauri/issues/852)

---

## 7. CSS e Estilos: Impacto na Memória

### Tailwind CSS (zero runtime) vs CSS-in-JS

| Métrica | CSS-in-JS (styled-components) | Tailwind v4 |
|---|---|---|
| JS bundle extra | 16KB JS + 18.7KB CSS | 0KB JS + 12.3KB CSS |
| Runtime blocking | 35ms por render | 0ms |
| DOM nodes extras | `<style>` tags injetadas | Nenhum |
| Rendering speed | Baseline | ~63% mais rápido |

**Conclusão**: Tailwind é a escolha correta. Zero overhead runtime.

### CSS Custom Properties (variáveis)

- 50-100 custom properties no `:root` têm **overhead zero mensurável**
- CSS com `var()` é ~50% menor que CSS com valores literais duplicados
- Tailwind v4 já usa CSS custom properties via `@theme` — arquitetura correta

### Backdrop-blur: custo real

| Fator | Impacto |
|---|---|
| GPU layer por elemento | ~4 bytes/pixel (~8MB para overlay fullscreen 1080p) |
| Kernel de blur | Roda por-pixel por frame quando background muda |
| Múltiplos elementos simultâneos | Frame drops documentados em GPUs integradas |

**Regras para backdrop-blur**:
- Usar APENAS em overlays/modais temporários, NUNCA em elementos persistentes (sidebar, navbar)
- `backdrop-blur-xs` (4px) é muito mais barato que `backdrop-blur-lg` (16px)
- Oferecer fallback sem blur para máquinas com GPU limitada: `background: hsl(var(--background) / 0.85)`
- Remover `will-change: backdrop-filter` após animações

**Fontes**: [shadcn/ui Issue #327](https://github.com/shadcn-ui/ui/issues/327), [Foundry VTT Issue #10400](https://github.com/foundryvtt/foundryvtt/issues/10400), [GPU Compositing in Chrome](https://www.chromium.org/developers/design-documents/gpu-accelerated-compositing-in-chrome/)

---

## 8. Design System Unificado = Menos Memória

### Por que componentes reutilizáveis economizam RAM

1. **Código compartilhado**: Um `Button` usado em 50 lugares = 1 definição de função. 50 buttons custom = 50 definições.
2. **JIT optimization**: V8 otimiza funções chamadas frequentemente (inline caching). Componentes consistentes = hot paths otimizados. Componentes variados = cold paths sem otimização.
3. **CSS menor**: Design system converge para ~50-100 utility classes. Componentes ad-hoc geram classes arbitrárias ilimitadas.
4. **DOM previsível**: Estrutura consistente = menos computações de layout únicas. O engine de estilo do browser cacheia matches de seletores.

### Regras para Singular Haven

- Usar APENAS `src/components/ui/` (shadcn) e ReUI
- NUNCA criar componente visual do zero
- Customizar via `className`, nunca editando o componente base
- Sem valores arbitrários Tailwind (`bg-[#xxx]`) — usar tokens do tema

**Fontes**: [shadcn/ui Handbook 2026](https://shadcnspace.com/blog/shadcn-ui-handbook), [Component-Based Architecture Performance](https://blog.pixelfreestudio.com/the-impact-of-component-based-architecture-on-web-performance/)

---

## 9. Ícones: Lucide Inline SVG

| Fator | Lucide (inline SVG) | Icon Font |
|---|---|---|
| DOM nodes por ícone | 3-8 | 1 |
| Tree-shaking | Perfeito (unused = eliminado) | Impossível (font inteira) |
| Cache | No JS bundle | Font file cacheado pelo browser |
| Performance com 1000+ ícones | Degradação | Mínimo impacto |

**Para Singular Haven**: Lucide inline SVG é a escolha correta. Dezenas de ícones na tela = overhead negligível. Usar import por path direto para dev performance:

```tsx
// Correto — tree-shaken, dev server rápido
import Music from "lucide-react/icons/music";

// Evitar — carrega todos os 1600+ ícones no dev server
import { Music } from "lucide-react";
```

**Fontes**: [Cloud Four SVG Stress Test](https://cloudfour.com/thinks/svg-icon-stress-test/), [Lucide Tree-shaking with Vite](https://javascript.plainenglish.io/tree-shaking-lucide-react-icons-with-vite-and-vitest-57bf4cfe6032)

---

## 10. Áudio: Streaming, Não Buffering

### Custo de AudioBuffer

Um track de 3 min, stereo, 44.1kHz = `180 × 44100 × 2 × 4 bytes = ~60MB` em RAM.

### Abordagem correta: MediaElement streaming

```tsx
// Streaming via <audio> — NÃO carrega o track inteiro na memória
const audio = new Audio(streamUrl);
const ctx = new AudioContext();
const source = ctx.createMediaElementSource(audio);
source.connect(ctx.destination);
audio.play();

// Cleanup no unmount:
audio.pause();
audio.src = '';
ctx.close(); // Libera TODOS os nodes e buffers
```

### Regras para Web Audio

- NUNCA carregar tracks inteiros em `AudioBuffer` — usar `MediaElementAudioSourceNode`
- `disconnect()` source nodes no `onended`
- Usar `copyFromChannel()` em vez de `getChannelData()` (evita alocação extra)
- `AudioContext.close()` no unmount do módulo — libera tudo de uma vez
- Revogar TODOS os Blob URLs com `URL.revokeObjectURL()`

**Fontes**: [Web Audio API Performance Notes](https://padenot.github.io/web-audio-perf/), [AudioNode Memory Issue - WebAudio GitHub](https://github.com/WebAudio/web-audio-api/issues/904)

---

## 11. Listas Longas: Virtual Scrolling

**Quando usar**: Qualquer lista com 100+ itens (tracks, downloads, histórico).

**Impacto**: Memória passa de O(dados) para O(viewport). Uma lista de 10.000 tracks renderiza ~20-50 DOM nodes em vez de 10.000.

**Lib recomendada**: `@tanstack/react-virtual` (headless, ativo, framework-agnostic).

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function TrackList({ tracks }) {
  const parentRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 5,
  });
  // ... render apenas virtualizer.getVirtualItems()
}
```

**Fontes**: [Virtualization in React - Medium](https://medium.com/@ignatovich.dm/virtualization-in-react-improving-performance-for-large-lists-3df0800022ef)

---

## 12. Web Workers

**Quando usar**: Processamento de áudio, parsing de dados grandes, indexação de busca.

**Por que ajuda**: Workers rodam em thread separada com heap próprio. Quando terminados, o heap inteiro é liberado.

```tsx
useEffect(() => {
  const worker = new Worker(
    new URL('./worker.ts', import.meta.url),
    { type: 'module' }
  );
  return () => worker.terminate(); // Libera heap inteiro
}, []);
```

**Regra**: Usar **transferable objects** (`ArrayBuffer`) para zero-copy entre thread principal e worker.

**Fontes**: [React with Web Workers - DEV](https://dev.to/hexshift/how-to-use-react-with-web-workers-for-offloading-heavy-computation-4p0m)

---

## 13. SPAs Long-Running: Prevenção de Acúmulo

**Problema**: Apps desktop ficam abertos por horas/dias. Memória acumula de:
- Caches de memoização sem limite (`useMemo`, `createSelector`)
- `console.log` retém objetos na memória mesmo sem DevTools
- Libraries com bugs de leak (sempre atualizar deps)

### Caso real: Kustomer

- Fix de memoização ineficiente: **~120 MiB redução** no p90 de heap
- "Potential crashes" (heap >= 90%) caíram de **centenas/dia para < 50**

### Regras

- Auditar `useMemo`/`useCallback` para inputs de alta cardinalidade
- Implementar `console.clear()` periódico em produção
- Manter dependências atualizadas (bugs de leak em libs)
- Monitorar heap com `performance.memory.usedJSHeapSize` em dev

**Fontes**: [Kustomer SPA Memory Case Study](https://medium.com/kustomerengineering/optimizing-memory-usage-in-single-page-apps-a-kustomer-case-study-de81ca9b105a)

---

## 14. Build: Configuração Rust

```toml
# src-tauri/Cargo.toml
[profile.release]
codegen-units = 1    # Melhor otimização LLVM
lto = true           # Link-time optimization (dead code elimination)
opt-level = "s"      # Otimizar para tamanho (menos código mapeado em RAM)
panic = "abort"      # Remove código de unwinding
strip = true         # Remove debug symbols
```

### Opções adicionais

- **mimalloc**: Allocator alternativo que reduz fragmentação em workloads multithreaded
- **`OnceLock`** (std): Preferir sobre `lazy_static` para inicialização global
- **`removeUnusedCommands: true`** (Tauri 2.4+): Strip de comandos não usados no ACL

**Fontes**: [Tauri App Size Docs](https://v2.tauri.app/concept/size/)

---

## 15. Ferramentas de Profiling

| Ferramenta | O que mede | Como usar |
|---|---|---|
| Chrome DevTools Memory | Heap snapshots, allocation timeline | Snapshot antes/depois de navegar entre módulos |
| `performance.memory` | Heap size em runtime | Logar periodicamente em dev |
| MemLab (Facebook) | Detecção automatizada de leaks | `npx memlab run --scenario scenario.js` |
| Browser Task Manager | Memória por processo | `Shift+Esc` no WebView |
| WeakRef + FinalizationRegistry | Verificar se objetos são GC'd | Safety net para validar cleanup |
| DHAT / heaptrack | Profiling do processo Rust | Separado do WebView |

### Workflow de verificação de leak

1. Heap snapshot no estado base
2. Navegar para módulo, usar features
3. Navegar para fora (unmount)
4. Forçar GC (DevTools → Performance → Collect garbage)
5. Segundo heap snapshot
6. View "Comparison" — objetos que sobreviveram step 3 são leaks

**Fontes**: [Chrome DevTools Memory](https://developer.chrome.com/docs/devtools/memory-problems/heap-snapshots), [MemLab - Facebook](https://facebook.github.io/memlab/)

---

## Resumo: Top 10 Ações por Impacto

| # | Técnica | Impacto | Esforço |
|---|---|---|---|
| 1 | Single window + single WebView, módulos via React | ALTO | Médio |
| 2 | Cleanup completo no `useEffect` return de cada módulo | ALTO | Médio |
| 3 | Kill sidecars on-demand quando módulo desativa | ALTO | Médio |
| 4 | `set_memory_usage_level(Low)` ao minimizar (Windows) | ALTO | Baixo |
| 5 | Streaming de áudio via MediaElement, não AudioBuffer | ALTO | Baixo |
| 6 | Virtual scrolling para listas 100+ itens | MÉDIO | Médio |
| 7 | Batch IPC, evitar payloads grandes via invoke | MÉDIO | Baixo |
| 8 | Design system unificado (shadcn/ReUI only) | MÉDIO | Baixo |
| 9 | Lucide imports por path direto | BAIXO | Baixo |
| 10 | Cargo release profile otimizado | BAIXO | Baixo |
