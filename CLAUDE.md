**# CLAUDE.md**



**App desktop opensource de utilidades pessoais unificadas. Reprodução de YouTube Music com UI própria e leve (ytmusicapi Python + yt-dlp). Canal de voz P2P entre amigos via WebRTC. Download manager nativo. Browser minimalista. Participante virtual de IA no canal de voz ("Anjo"). Módulos inativos ficam desligados da memória.**



**\*\*Stack\*\*: Tauri 2.0 (Rust) + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui + ReUI**



**## Plataforma**



**- Multiplataforma desde o início — Windows, macOS, Linux**

**- Código DEVE usar APIs multiplataforma sempre**

**- Nunca usar APIs nativas de SO diretamente sem abstrair**

**- Testar comportamento esperado nas três plataformas ao implementar qualquer feature**



**## Comandos**



**```bash**

**npm run tauri dev    # Dev com hot reload**

**npm run tauri build  # Build de produção**

**```**



**## Regras**



**### 1. Idioma**

**- Texto voltado ao usuário DEVE seguir normas do português brasileiro — acentuação, gramática, pontuação corretas**

**- Independente de como o usuário escreve no chat, o app escreve pt-BR correto**

**- Código, identificadores e nomes de variáveis em inglês**



**### 2. Componentes e Estilo**

**- SEMPRE usar componentes shadcn/ui ou ReUI existentes — nunca recriar componente do zero**

**- NUNCA editar arquivos em `src/components/ui/` — customizar via `className`**

**- NUNCA usar valores arbitrários do Tailwind (`bg-\[#xxx]`, `px-\[455px]`) — usar classes semânticas do tema**



**### 3. Módulos**

**- Cada módulo vive em sua própria pasta isolada em `src/modules/`**

**- Módulos são carregados via `React.lazy` + `Suspense` — nunca importar diretamente no bundle principal**

**- Módulos inativos são desmontados — nenhum estado, listener ou sidecar deve persistir quando o módulo não está ativo**

**- Sidecars Rust (yt-dlp, ytmusic-api) são iniciados sob demanda e encerrados quando o módulo desativa**

**- Antes de adicionar ou modificar telas, consultar `@docs/keep-alive-screens.md`**



**### 4. Debug**

**- Após implementar qualquer feature, adicionar logs de debug completos em cada etapa**

**- Validação end-to-end obrigatória antes de considerar pronto para produção**



**## Qualidade de Código**



**### 5. Padrão Sênior**

**- Escrever código como engenheiro sênior de empresa de alto padrão — limpo, enxuto, profissional, otimizado**

**- Sempre pesquisar na internet por libs, plugins e referências antes de implementar do zero**

**- Não reinventar a roda — se existe lib madura, usar**

**- Se arquitetura está falha, estado duplicado ou padrões inconsistentes — propor e implementar fix estrutural**

**- Filtro: "o que um dev sênior perfeccionista rejeitaria no code review?" Corrigir tudo**



**### 6. Elegância (Balanceado)**

**- Para mudanças não-triviais: pausar e perguntar "existe uma forma mais elegante?"**

**- Se o fix parece gambiarra: "Sabendo tudo que sei agora, implementar a solução elegante"**

**- Pular isso para fixes simples e óbvios — não over-engineer**



**### 7. Bug Fix Autônomo**

**- Recebeu bug report: resolver direto. Não pedir ajuda**

**- Olhar logs, erros, testes falhando — corrigir**

**- Zero context switching do usuário**

**- Se algo der errado durante implementação, PARAR e re-planejar — não insistir num caminho quebrado**



**### 8. Princípios**

**- \*\*Sem preguiça\*\*: encontrar causas raiz, sem fixes temporários, sem gambiarras**

**- \*\*Filtro\*\*: "um staff engineer aprovaria este código?"**

**- \*\*Reverter tentativas fracassadas\*\*: ao aplicar um fix que não resolve, desfazer imediatamente antes de tentar a próxima abordagem. Nunca acumular código de tentativas fracassadas**



**## Subagents**



**### 9. Estratégia de Subagents**

**- Usar subagents liberalmente para manter a janela de contexto principal limpa**

**- Offload pesquisa, exploração e análise paralela para subagents**

**- Para problemas complexos, jogar mais compute via subagents**

**- Uma tarefa por subagent para execução focada**

**- Sempre rodar subagents em background para ficar livre para mensagens do usuário**

**- Usar mais de dois subagents quando necessário**

**- Para tarefas tocando >5 arquivos independentes, lançar subagents paralelos (5-8 arquivos por agente)**



**### 10. Pares Opus + Sonnet**

**- Tarefas complexas com plano de execução: pares de subagents (1 Opus 4.6 + 1 Sonnet 4.6)**

**- Dois modelos, duas perspectivas — maior cobertura para encontrar o que um só não previu**



**| Fase | Agentes |**

**|------|---------|**

**| Análise do código | 2+ subagents explorando a codebase |**

**| Pesquisa | 2+ subagents buscando na web |**

**| Planejamento | 2+ subagents montando o plano |**

**| Auditoria do plano | 1 Opus 4.6 + 1 Sonnet 4.6 revisando/criticando |**

**| Verificação final | 1 Opus 4.6 + 1 Sonnet 4.6 validando implementação |**



**### 11. Pesquisa antes de implementação (REGRA CRÍTICA)**

**- NUNCA lançar um subagent que pesquisa E implementa ao mesmo tempo**

**- Fluxo correto: pesquisadores retornam → consolidar → implementador recebe visão completa**

**- Subagents de pesquisa: somente leem código e buscam na web, retornam recomendações**

**- Subagent implementador: recebe o consolidado de TODOS os pesquisadores antes de tocar no código**



**## Diretivas Mecânicas**



**### 12. Step 0 — Dead Code**

**- Antes de QUALQUER refactor estrutural em arquivo >300 LOC: remover dead props, exports não usados, imports não usados, debug logs órfãos**

**- Commitar essa limpeza separadamente antes de começar o trabalho real**

**- Dead code acelera compactação de contexto — eliminar primeiro**



**### 13. Execução em Fases**

**- Nunca tentar refactors multi-arquivo numa única resposta**

**- Quebrar trabalho em fases explícitas — no máximo 5 arquivos por fase**

**- Completar fase → rodar verificação → esperar aprovação antes da próxima**



**### 14. Verificação Forçada**

**- PROIBIDO reportar tarefa como completa sem ter rodado verificação**

**- Rodar type-check e lint do projeto após cada mudança**

**- Se não há type-checker configurado, declarar isso explicitamente — nunca assumir sucesso**



**### 15. Consciência de Contexto**

**- Após 10+ mensagens na conversa, OBRIGATÓRIO re-ler qualquer arquivo antes de editar**

**- Não confiar na memória de conteúdo de arquivos — auto-compactação pode ter destruído o contexto**

**- Para arquivos >500 LOC, ler em chunks com offset e limit — nunca assumir que viu o arquivo completo**

**- Se resultado de busca retorna poucos resultados suspeitos, re-rodar com escopo menor — truncamento silencioso acontece**



**### 16. Integridade de Edição**

**- Antes de CADA edit: re-ler o arquivo. Depois do edit: ler novamente para confirmar**

**- O Edit tool falha silenciosamente quando old\_string não casa por contexto stale**

**- Nunca mais que 3 edits no mesmo arquivo sem uma leitura de verificação**



**### 17. Busca Completa em Renomeações**

**- Ao renomear qualquer função/tipo/variável, buscar SEPARADAMENTE por:**

&#x20; **- Chamadas diretas e referências**

&#x20; **- Referências em tipos (interfaces, generics)**

&#x20; **- String literals contendo o nome**

&#x20; **- Imports dinâmicos e require()**

&#x20; **- Re-exports e barrel files**

&#x20; **- Arquivos de teste e mocks**

**- Não assumir que um único grep encontrou tudo**

