# WebView2 Memory Level — Redução de RAM ao Minimizar

## Resultado

| Estado | RAM WebView2 | RAM Rust | Total |
|---|---|---|---|
| App ativo (focado) | ~147 MB | ~3 MB | ~150 MB |
| App minimizado/desfocado | ~28 MB | ~3 MB | ~31 MB |
| **Redução** | **81%** | — | **79%** |

## Como funciona

O WebView2 (Chromium) possui a API `ICoreWebView2_19::SetMemoryUsageTargetLevel` que sinaliza ao engine para swappar dados da memória RAM para disco quando o app não está visível.

- **Low**: O WebView2 descarta caches, comprime estruturas internas e swapa processos para disco. Scripts continuam rodando (o player de música não para), mas acesso a dados swapados tem overhead de I/O.
- **Normal**: Restaura o comportamento padrão, trazendo dados de volta para RAM.

## Implementação

### Arquivo: `src-tauri/src/lib.rs`

```rust
#[cfg(target_os = "windows")]
fn set_webview_memory_level(window: &tauri::WebviewWindow, low: bool) {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use windows_core::Interface;

    let _ = window.with_webview(move |webview| {
        unsafe {
            let controller = webview.controller();
            let core: ICoreWebView2 = controller.CoreWebView2().unwrap();
            if let Ok(core19) = core.cast::<ICoreWebView2_19>() {
                let level = if low {
                    COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
                } else {
                    COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
                };
                let _ = core19.SetMemoryUsageTargetLevel(level);
                println!("[Rust] Memory level set to {}", if low { "LOW" } else { "NORMAL" });
            }
        }
    });
}
```

### Trigger: Window Focus Events

```rust
.on_window_event(|window, event| {
    match event {
        tauri::WindowEvent::Focused(focused) => {
            #[cfg(target_os = "windows")]
            set_webview_memory_level(window, !focused);
        }
        _ => {}
    }
})
```

### Dependências (Cargo.toml, Windows only)

```toml
[target.'cfg(target_os = "windows")'.dependencies]
webview2-com = "0.38"
windows-core = "0.61"
```

## Requisitos

- **Windows 10/11** com WebView2 Runtime v119+ (Evergreen, pré-instalado no Windows 11)
- A API `ICoreWebView2_19` só existe a partir do WebView2 Runtime versão 119
- Em macOS/Linux não há equivalente — o WKWebView/WebKitGTK não expõem esta API

## Cuidados

1. **Não misturar com `TrySuspendAsync`** — escolher uma abordagem. `SetMemoryUsageTargetLevel` é preferível porque scripts continuam rodando (o player de música não para).
2. **O restore para Normal NÃO é automático** — deve ser chamado explicitamente quando o app volta ao foco.
3. **Há latência ao restaurar** — o primeiro frame após restaurar pode ter micro-stutter enquanto dados voltam do disco para RAM. Imperceptível na prática.
4. **Funciona best-effort** — o WebView2 engine decide quanto pode reduzir. O resultado de 28 MB foi observado em um Ryzen 5 5600X com 32GB RAM, pode variar.

## Quando usar

- Quando o app é **minimizado** ou **perde foco** (implementado)
- Quando o app vai para a **system tray** (futuro)
- Quando um **módulo é desmontado** e não há atividade (futuro — considerar para o Download Manager)

## Referências

- [Wry 0.35.0 Release Notes](https://v2.tauri.app/release/wry/v0.35.0/)
- [WebView2 MemoryUsageTargetLevel Spec](https://github.com/MicrosoftEdge/WebView2Feedback/blob/main/specs/MemoryUsageTargetLevel.md)
- [Microsoft Learn: WebView2 Performance Best Practices](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/performance)
