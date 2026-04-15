# Network Connection Pool

Por que todos os clientes `reqwest` do app são configurados com pool desativado.

## Regra atual

Todos os `reqwest::Client` criados no projeto **devem** desativar o connection pool e o TCP keepalive:

```rust
let http = reqwest::Client::builder()
    .user_agent(USER_AGENT)
    .pool_max_idle_per_host(0)   // não manter conexões idle no pool
    .tcp_keepalive(None)         // sem keepalive no nível TCP
    .build()?;
```

Aplica-se a:

- [`crates/ytmusic-api/src/client.rs`](../../crates/ytmusic-api/src/client.rs) — `new()`, `from_cookies()`, download client interno
- [`src-tauri/src/lib.rs`](../../src-tauri/src/lib.rs) — `reqwest::Client` do handler `thumb://`

## Por quê

Os defaults do reqwest 0.12 mantêm conexões TCP/TLS abertas após cada request:

- `pool_idle_timeout` = 90s
- `pool_max_idle_per_host` = ilimitado

Em um app desktop autenticado contra um único host (YouTube Music), isso resulta em N conexões persistentes idle conversando em background com a CDN/API da Google. O sistema operacional, o stack TLS e o lado servidor trocam pacotes pequenos periodicamente para manter essas conexões válidas — keepalive de TCP, renovação de TLS session ticket, etc.

Sintoma observado em produção:

- Janela visível e idle, sem música tocando, sem interação.
- Task Manager mostrava ~0.1 Mbps no processo Rust em bursts curtos várias vezes por minuto.
- DevTools Network do WebView estava vazio (a atividade não vinha do frontend).
- `resmon.exe` mostrava 2 conexões TCP idle vivas para um IP da Google na porta 443.

Diagnóstico final: pool keepalive das conexões persistentes do reqwest. Fix estrutural: desativar o pool para que cada request feche a conexão ao terminar.

## Trade-off aceito

Sem pool, cada request paga novamente:

- Resolução DNS (geralmente cacheada pelo OS)
- TCP handshake
- TLS handshake completo (~50–100ms a mais)

Para esta aplicação o trade-off é favorável:

- Requests autenticadas YouTube Music são esporádicas (não rajadas).
- Latência adicional é imperceptível para a UX (loadings já mostram spinner).
- Eliminar tráfego idle é mais importante do que micro-otimizar latência.

## Quando reativar pool

Reabra o pool **apenas** se aparecer um caso de uso com requests sequenciais frequentes (>5/s) onde o overhead de TLS handshake passe a importar. Mesmo nesse caso, prefira:

- Pool com `pool_idle_timeout` curto (1–5s) ao invés do default de 90s.
- Pool por escopo de operação, não global do app.

Não reative pool default (`Client::new()` puro) — quebra a regra desta doc.

## Histórico

- Identificado e corrigido em 2026-04-14 durante sessão de cleanup pós-build.
- Detalhes do diagnóstico no [CHANGELOG](../CHANGELOG.md) e [known-bugs.md](../known-bugs.md#encerrados-recentemente).
