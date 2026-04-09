# Keep-Alive Screens — Referência de Módulos

## Regra Geral

Todos os módulos são **desmontados** quando inativos. Nenhum módulo mantém estado, listeners, timers ou sidecars quando não está visível.

## Como funciona

1. Módulos são carregados via `React.lazy()` e montados com `<Suspense>`
2. Cada módulo recebe uma `key` única no `ModuleHost` — trocar de módulo força unmount completo
3. O `useEffect` cleanup de cada módulo DEVE liberar todos os recursos (ver `docs/explanation/memory-optimization.md` seção 3)

## Quando NÃO desmontar

Se no futuro um módulo precisar manter estado entre navegações (ex: player de música tocando em background), ele deve:

1. Extrair o estado persistente para um store global (Zustand)
2. Manter o sidecar vivo via gerenciador no nível do app (não do módulo)
3. Documentar aqui qual módulo e por quê

## Módulos Ativos

| Módulo | Desmonta? | Sidecars | Notas |
|---|---|---|---|
| YouTube Music | Sim | yt-dlp, ytmusic-api | Futuro: player pode precisar de keep-alive |
| Download Manager | Sim | yt-dlp (compartilhado) | Downloads ativos devem continuar em background via Rust |
