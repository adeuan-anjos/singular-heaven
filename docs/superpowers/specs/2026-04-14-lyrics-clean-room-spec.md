# Lyrics Visual Behavior — Clean-Room Spec

> **Documento de engenharia reversa limpa (clean-room)**
> Este documento descreve o comportamento *visual observável* de um player de letras estilo Apple Music iPad, baseado em estudo do projeto de código aberto referência. Nenhum trecho de código, nome de função, nome de variável ou estrutura de arquivo da fonte estudada foi reproduzido. Um engenheiro independente, sem acesso ao projeto original, deve conseguir implementar o mesmo visual apenas lendo este documento.

---

## 1. Visão Geral

Este spec descreve um componente de exibição de letras sincronizadas com o estilo visual do Apple Music para iPad. O componente possui as seguintes características observáveis:

- Lista vertical de linhas com rolagem automática suave centrada na linha ativa
- Cada linha exibe escala, opacidade e blur CSS em função da sua distância à linha ativa
- Transições realizadas com física de mola (spring), não com curvas cúbicas simples
- Modo "enhanced" (letra por palavra) onde cada palavra acende com um gradiente de máscara que passa da esquerda para a direita conforme o tempo
- Modo "karaoke por sílaba" para letras com ruby/romaji
- Linhas de fundo (backing vocals) usam escala menor e opacidade reduzida
- Interlude (silêncio > 4 s) exibe três pontos animados
- Background: gradiente de malha (mesh gradient) animado derivado da capa do álbum, renderizado via WebGL
- Toda a rolagem e posicionamento é calculado em JavaScript e aplicado via `transform: translateY(...)` — não usa `overflow: scroll` nativo para as linhas
- O container pai usa `mix-blend-mode: plus-lighter` para produzir o efeito de brilho luminoso branco sobre o fundo escuro

---

## 2. Estados Visuais por Linha (em Função da Distância da Linha Ativa)

A "distância" é o índice da linha menos o índice da linha ativa. Distância 0 = linha sendo tocada agora.

| Distância | Escala | Opacidade (main text) | Blur (px) — tela ≥ 1024px | Blur (px) — tela < 1024px | Translação Y | Origem da transformação |
|-----------|--------|-----------------------|---------------------------|---------------------------|--------------|-------------------------|
| 0 (ativa) | 1.00 (100%) | 0.85 | 0 | 0 | posição calculada pelo layout | left center (linhas normais) |
| ±1 | 0.97 (97%) | 1.00 (não ativa = sem mask gradient) | 2 | 1.6 | posição calculada pelo layout | left center |
| ±2 | 0.97 | 1.00 | 3 | 2.4 | posição calculada pelo layout | left center |
| ±3 | 0.97 | 1.00 | 4 | 3.2 | posição calculada pelo layout | left center |
| ≥4 | 0.97 | 1.00 | 5+ (n+1 por distância extra) | 0.8 × (n+1) | posição calculada pelo layout | left center |
| BG line (ativa) | 1.00 | 0.40 | 0 | 0 | mesma regra | left center |
| BG line (inativa) | 0.75 (75%) | 0.0001 (quase invisível) | igual às normais | igual às normais | mesma regra | left center |

**Notas importantes:**
- A escala padrão para linhas não ativas é 97% (3% de redução). A feature de escala pode ser desabilitada, retornando todas para 100%.
- O blur é calculado como: `blurLevel = 1 + distância_adicional`. Para linhas *acima* da ativa: `distância_adicional = |índiceAtivo - índiceLinha| + 1`. Para linhas *abaixo* da ativa: `distância_adicional = |índiceLinha - max(índiceAtivo, índiceBufferMaisRecente)|`. Blur máximo aplicado ao DOM: 5px (limitado via `Math.min(5, blurLevel)`).
- Em telas com largura ≤ 1024px, o blur é multiplicado por 0.8.
- O blur é zerado completamente quando o usuário está rolando manualmente.
- A opacidade 0.85 na linha ativa refere-se ao elemento de texto principal (main). A linha inteira tem `opacity` controlada via CSS transition `opacity 0.25s`.
- Linhas passadas com `hidePassedLines = true` recebem `opacity: 0.00001` (não zero, para evitar otimização do browser).
- Para letras não-dinâmicas (linha inteira, sem timing por palavra), linhas inativas ficam com opacidade 0.2.

---

## 3. Animação de Transição entre Estados

### 3.1 Sistema de Mola (Spring Physics)

Todas as transições de posição Y e escala usam física de mola com amortecimento crítico ou sub-crítico. **Não usar `transition: transform` CSS** — as posições são calculadas em JavaScript a cada frame e aplicadas diretamente via `element.style.transform`.

**Parâmetros padrão das molas:**

| Mola | Massa | Amortecimento | Rigidez | Comportamento |
|------|-------|---------------|---------|---------------|
| Posição Y (normal) | 0.9 | 15 | 90 | Sub-crítico leve, sem overshoot perceptível |
| Posição Y (interlude/seek) | — | 15 | 90 | Idem |
| Escala (linhas normais) | 2 | 25 | 100 | Bem amortecido, ~300–450ms settling |
| Escala (linhas de fundo BG) | 1 | 20 | 50 | Mais lento, ~500–800ms settling |

**Parâmetros dinâmicos da mola de posição Y:**
A rigidez da mola de posição Y se ajusta com base no intervalo entre linhas consecutivas. Fórmula:

- Intervalo = `startTime[linha_atual] - startTime[palavra_0_da_linha_anterior]` (em ms)
- Intervalo é limitado entre 100ms e 800ms
- `ratio = 1 - (intervalo - 100) / (800 - 100)` normalizado em [0, 1]
- `ratio = ratio ^ 0.2` (suavização — linhas rápidas ficam mais rígidas)
- `targetStiffness = 170 + ratio × (220 - 170)` → entre 170 e 220
- `targetDamping = sqrt(targetStiffness) × 2.2` → amortecimento crítico aproximado

Isso faz com que músicas com letras rápidas usem molas mais rígidas (transição mais rápida) e músicas lentas usem molas mais suaves.

### 3.2 Fallback sem Spring (CSS Transition)

Se o modo spring estiver desabilitado (dispositivos fracos), as transições usam CSS:
```
filter 0.25s ease
transform 0.5s ease
background-color 0.25s ease
box-shadow 0.25s ease
```
Opacidade e filter recebem `transition-delay` escalonado para cada linha, criando um efeito em cascata.

### 3.3 Biblioteca Recomendada

Usar uma biblioteca de spring física publicada em vez de implementar o solver manualmente:

- **`motion`** (formerly Framer Motion) v11+ — `animate()` imperativo + `spring()` — MIT, [npm](https://www.npmjs.com/package/motion)
- **`react-spring`** v9+ — hooks `useSpring` — MIT, [npm](https://www.npmjs.com/package/@react-spring/web)
- **`@juliangarnierorg/anime-utils`** + `anime.js` v4 — com suporte a spring — MIT

Para este projeto, `motion` é preferível por suporte a animações imperativas (fora do React render cycle), essencial para animar 100+ linhas sem re-render.

---

## 4. Auto-scroll para a Linha Ativa

### 4.1 Posicionamento

O scroll é implementado via `transform: translateY(px)` em cada linha, não via `scrollTop`. O container inteiro é `position: relative; overflow: hidden`.

**Algoritmo de posicionamento:**

1. A posição-alvo de cada linha é calculada de cima para baixo somando as alturas reais de cada linha
2. A linha ativa deve ficar alinhada a uma âncora configurável dentro do container. O valor padrão é `alignPosition = 0.35` (35% da altura do container, medido do topo)
3. `alignAnchor` controla qual borda da linha ativa fica na âncora: `"top"`, `"center"` (padrão) ou `"bottom"`
4. Há um `scrollOffset` adicional que o usuário pode controlar manualmente; o sistema retorna ao scroll automático após 5 segundos de inatividade
5. Linhas BG ativas não somam sua altura ao cálculo de posição quando a música está tocando (elas "se encaixam" dentro da linha principal correspondente)

### 4.2 Delay Cascata

Quando múltiplas linhas estão se movendo ao mesmo tempo (transição de bloco), cada linha recebe um delay incremental de 50ms para criar um efeito de onda. O delay base começa em 50ms e decresce 5% para cada linha após a âncora de scroll.

- Linhas BG não recebem delay adicional
- Delay máximo realista: ~300–400ms para listas longas
- Em modo force/seek: delay = 0 (tudo se tele-transporta)

### 4.3 Scroll Manual

- Suporte a touch (touchstart/touchmove/touchend) e roda do mouse (wheel)
- Após touchend, o scroll continua com inércia, com atrito de `0.95 ^ (dt/16)` por frame
- Se velocidade de deslize < 0.1 px/ms, para imediatamente
- Se o movimento foi menor que 10px em X e Y, trata como clique

---

## 5. Mask Gradient nas Bordas do Container

O container do player aplica um gradiente de máscara vertical para desvanecer as linhas nas bordas superior e inferior, usando `mask-image` (com prefixo `-webkit-mask-image` para compatibilidade).

**Configuração:**

O container não possui um fade fixo — o gradiente é definido via CSS customizável. A implementação de referência usa a propriedade CSS `mask-image` com `linear-gradient`. O implementador deve aplicar:

```
mask-image: linear-gradient(
  to bottom,
  transparent 0%,
  black 15%,
  black 85%,
  transparent 100%
)
```

Ajustar as paradas conforme o tamanho do container. Em containers menores que ~200px de altura, reduzir o fade para 8–10% nas bordas para não cortar demais.

**Detecção de suporte:**
```
CSS.supports("mask-image", "none")
CSS.supports("mix-blend-mode", "plus-lighter")
```

Se `mask-image` não for suportado, o fade de borda pode ser omitido como degradação graciosa.

---

## 6. Word-level Karaoke (Modo "Enhanced")

No modo enhanced, cada palavra dentro de uma linha tem seu próprio timing (`startTime`, `endTime`). O efeito de "acender" uma palavra é realizado por uma máscara gradiente que se move da esquerda para a direita.

### 6.1 Máscara de Gradiente por Palavra

Cada `<span>` de palavra recebe:

- `mask-image: linear-gradient(to right, rgba(0,0,α_bright) LEFT%, rgba(0,0,0,α_dark) RIGHT%)`
- `mask-size: (2 + fadeWidth + padding) * 100% 100%`
- `mask-repeat: no-repeat`
- `mask-origin: left`
- `mask-position`: animado da esquerda para a direita

**Onde:**
- `fadeWidth` = altura da palavra × `wordFadeWidth` (padrão: 0.5× a altura em pixels)
  - Apple Music para iPad: `wordFadeWidth = 0.5`
  - Apple Music para Android: `wordFadeWidth = 1.0`
- O gradiente começa com a palavra "apagada" (posição esquerda negativa) e termina com ela "iluminada" (posição 0)

### 6.2 Cálculo do Tamanho do Gradiente

Para uma palavra de largura `W` e altura `H`, com `fadeWidth = H × wordFadeWidth`:

- `totalAspect = 2 + (fadeWidth/W) + padding`
- `maskSize = totalAspect × 100% 100%`
- A posição inicial da máscara: `-(W + fadeWidth)px`
- A posição final: `0px`
- A posição da máscara começa em `-(W + fadeWidth)px` e avança linearmente até `0px` ao longo do `endTime - startTime` da palavra

### 6.3 Alphas Dinâmicos da Máscara

A máscara tem dois alphas: `α_bright` (parte iluminada) e `α_dark` (parte ainda não iluminada):

- **Linha em modo GRADIENT (ativa):**
  - `scale_normalized = (escala_atual - 0.97) / 0.03` clampado em [0, 1]
  - `α_dark = scale_normalized × 0.2 + 0.2` (entre 0.2 e 0.4)
  - `α_bright = scale_normalized × 0.8 + 0.2` (entre 0.2 e 1.0)
- **Linha em modo SOLID (inativa):**
  - `α_bright = α_dark = scale_normalized × 0.2 + 0.2`

A transição entre os alphas usa interpolação exponencial por frame:
- Velocidade de ataque (quando vai ficar mais brilhante): `factor = 1 - e^(-50 × dt)`
- Velocidade de liberação (quando vai escurecer): `factor = 1 - e^(-7 × dt)`

Isso garante que quando uma palavra começa, ela acende quase instantaneamente (attack rápido), e quando termina, ela apaga devagar (release lento).

### 6.4 Animação via Web Animations API

A posição da máscara é animada usando a Web Animations API (`element.animate(frames, options)`) em vez de CSS `transition`. Isso permite sincronização precisa com timestamps do áudio.

Os keyframes são gerados de acordo com todos os timestamps de palavras da linha, criando segmentos de pausa (posição estática) e segmentos de avanço (posição animada). Nenhuma `easing` é adicionada aos frames da máscara para manter precisão temporal.

### 6.5 Animação de Float (Subida de Palavra)

Cada palavra possui uma animação sutil de flutuação vertical ao ser ativada:
- A palavra sobe 0.05em durante o tempo de exibição
- Para linhas BG: amplitude 0.10em (dobro)
- `easing: "ease-out"`, `fill: "both"`, composta com `composite: "add"`
- Ao desativar a linha, a animação é reproduzida ao contrário (`playbackRate = -1`)

### 6.6 Efeito de Ênfase (Palavras Longas)

Palavras que cumprem ambas as condições:
- Duração ≥ 1000ms
- Idioma latino: comprimento 2–7 caracteres; CJK: duração ≥ 1000ms (sem limite de comprimento)

Recebem um efeito de "ênfase" adicional:
- Cada caractere é envolvido em um `<span>` individual
- Escala até `1 + amount × 0.1` (levemente maior no pico)
- Deslocamento X por caractere: `-0.03 × amount × (total/2 - índice)em` (efeito de abertura/fechamento)
- Deslocamento Y: `-0.025 × amount em`
- Glow via `text-shadow: 0 0 ${blur × 0.3}em rgba(255,255,255,glowLevel)`, máximo 0.3em
- Onde `amount` e `blur` são escalados pela duração da palavra (palavras mais longas têm ênfase maior)
- Os caracteres são animados em cascata: delay de `duration / 2.5 / totalChars × índice`
- A última palavra da linha tem ênfase 1.6× maior e blur 1.5× maior, com duração 1.2×
- `amount` máximo: 1.2; `blur` máximo: 0.8

---

## 7. Tipografia e Layout das Linhas

### 7.1 Tamanho de Fonte do Container

Responsivo via CSS, usando a maior entre duas medidas relativas:

| Viewport | Fórmula CSS | Valor mínimo |
|----------|-------------|--------------|
| ≥ 768px | `max(5vh, 2.5vw)` | 12px |
| < 768px | `8vw` | 12px |

Pode ser sobrescrito via variável CSS `--amll-lp-font-size`.

### 7.2 Line Height

`line-height: 1.2em` no container. As linhas de sub-texto (tradução, romanização) usam `font-size: max(0.5em, 10px)` e `line-height: 1.5em`.

### 7.3 Padding das Linhas

- Padding horizontal padrão: `1em` em cada lado (left e right)
- Em viewport ≤ 500px: padding fixo de `20px` em cada lado
- Em viewport ≤ 768px: padding horizontal zerado (linhas ocupam 100% da largura)
- Padding vertical: `0.5em` top e bottom
- O container tem `box-sizing: border-box` e `border-radius: 0.25em`

### 7.4 Linhas de Dueto

Quando há linhas de dueto no conjunto de letras:
- Linhas normais recebem `padding-right: 15%` (para dar espaço ao dueto)
- Linhas de dueto: `text-align: right`, `padding-left: 15%`, `transform-origin: right center`

### 7.5 Texto Equilibrado

O texto da linha principal usa `text-wrap: balance` + `word-break: keep-all` + `overflow-wrap: break-word`.

### 7.6 Linhas de Fundo (Backing Vocals)

Escala do font: `max(0.7em × var(--amll-lp-bg-line-scale, 0.7), 10px)` → 70% do tamanho normal.
Padding ajustado inversamente à escala: `padding = realPadding / 0.7`.

### 7.7 Sub-linhas (Tradução e Romanização)

Opacidade: 0.3 em modo normal; 0.3 com `mix-blend-mode: plus-lighter` ativo.
Transition: `opacity 0.2s 0.25s` (delayed após a linha principal aparecer).

### 7.8 Ruby / Romaji acima das Palavras

Para letras com ruby (kana acima do kanji) ou romaji:
- Font-size da ruby: `0.5em`
- Line-height: `1em`
- Exibidas em `flex-direction: column` com a palavra abaixo
- Romanização (line footer): também `0.5em`, `line-height: 1em`, `padding-inline-end: 0.3em`

---

## 8. Interlude Dots (Pontos de Intervalo)

Quando há um silêncio de pelo menos **4000ms** entre duas linhas, três pontos animados são exibidos no lugar das linhas.

### 8.1 Posicionamento

Os pontos ficam na posição vertical que ocuparia a linha seguinte, com margem de `0.4em` acima e abaixo. Em músicas com dueto, os pontos aparecem à direita (alinhados com as linhas de dueto).

### 8.2 Animação de Respiração

Os três pontos pulsam em escala usando uma onda senoidal:
- Frequência: `intervalo_ms / ceil(intervalo_ms / 1500)` ms por ciclo (aproximadamente 1500ms por ciclo, ajustado para dividir igualmente o intervalo)
- Amplitude de escala: oscila ±5% em torno de 1.0 (i.e., de 0.95 a 1.05), reduzida por 0.7× na escala final: ~±3.5%
- Aparecimento: nos primeiros 2000ms, a escala faz easeOutExpo desde 0
- Desaparecimento: nos últimos 750ms, a escala retrai com easeInOutBack, nos últimos 375ms a opacidade vai a zero

### 8.3 Iluminação Progressiva dos Pontos

Os três pontos acendem sequencialmente ao longo do intervalo:
- Ponto 1: começa em 0.25 de opacidade, vai para 1.0 ao longo do primeiro terço do intervalo
- Ponto 2: começa no segundo terço
- Ponto 3: começa no terceiro terço

Opacidade global: zero nos primeiros 500ms, sobe para 1.0 entre 500–1000ms.

### 8.4 Tamanho

`clamp(0.5em, 1vh, 3em)` de diâmetro. Gap entre pontos: `0.25em`. Cor: `var(--amll-lp-color, white)`.

---

## 9. Background Dinâmico (Fluid Mesh Gradient)

O background é um `<canvas>` renderizado via WebGL, posicionado atrás do player de letras (`z-index: -1`, `pointer-events: none`).

### 9.1 Conceito Visual

É um gradiente de malha (mesh gradient) inspirado na técnica descrita em https://movingparts.io/gradient-meshes. O fundo deriva as cores da capa do álbum atual.

As cores da capa são extraídas ao processar a imagem em escala reduzida (blur forte aplicado antes de amostrar as cores). Os pontos de controle da malha são posicionados em uma grade (ex: 5×5) e cada ponto "puxa" uma cor da imagem da capa.

### 9.2 Animação

A malha de gradiente anima continuamente com os pontos de controle se deslocando suavemente em órbitas ou trajetórias orgânicas. A velocidade é controlável (padrão: 8 unidades arbitrárias). O FPS padrão do background é 30 FPS.

Integração com áudio de baixa frequência (80–120 Hz, normalizado 0–1): a amplitude de oscilação da malha aumenta com o volume de baixa frequência — efeito de "pulsar com a batida". Sem dados de áudio, usar `volume = 1.0` como padrão.

### 9.3 Escala de Renderização

O canvas é renderizado em escala reduzida (padrão: 0.5× a resolução física do elemento × devicePixelRatio) e depois esticado via CSS para o tamanho real. Isso reduz o custo de GPU significativamente. A escala é ajustável; 0.5 é o equilíbrio entre qualidade e performance.

### 9.4 Transição de Capa

Quando a capa muda, a nova imagem faz crossfade com a anterior usando alpha animation no WebGL, com duração aproximada de 1–2 segundos. A transição usa `easeInOutSine`.

### 9.5 Requisitos de Hardware

GPU capaz de rodar 60fps em 1080p: NVIDIA GTX 10-series ou equivalente AMD/Intel. Em 4K: RTX 2070 ou equivalente.

---

## 10. Acessibilidade e `prefers-reduced-motion`

Quando o usuário ativou `prefers-reduced-motion: reduce` no sistema:

1. **Desativar o sistema de spring**: substituir por CSS transitions simples (`transform 0.3s ease`, `opacity 0.25s ease`)
2. **Desativar o blur**: não aplicar `filter: blur()` em nenhuma linha
3. **Desativar a animação de background**: congelar o canvas em um frame estático (chamar `setStaticMode(true)`)
4. **Desativar o float de palavras**: não animar `translateY` em palavras individuais
5. **Desativar o efeito de ênfase**: não aplicar escala/glow por caractere
6. **Manter**: o scroll para a linha ativa (mas instantâneo, sem animação), o gradiente de máscara das palavras (feedback sincronizado com o áudio é informacional, não decorativo)

Implementação sugerida:

```css
@media (prefers-reduced-motion: reduce) {
  .lyric-container {
    /* override spring com transition simples */
  }
}
```

Detectar via `window.matchMedia("(prefers-reduced-motion: reduce)")` e ajustar os parâmetros do spring em runtime.

---

## 11. Performance

### 11.1 Alvos de FPS

| Modo | CPU mínimo | GPU mínima |
|------|-----------|-----------|
| 30 FPS (padrão) | CPUs dos últimos 5 anos, qualquer frequência | Qualquer GPU integrada moderna |
| 60 FPS suave | CPU ≥ 3.0 GHz | GTX 10-series para 1080p |
| 144 FPS+ | CPU ≥ 4.2 GHz | RTX 2070+ para 1080p |

### 11.2 Custo Aproximado por Efeito

| Efeito | Custo relativo | Observação |
|--------|---------------|------------|
| Spring JS (posição Y) | Médio | ~100 linhas × 2 springs = 200 cálculos/frame |
| `filter: blur()` | Alto (GPU) | Causa repaints; limitar a `max: 5px` |
| Mask gradient | Médio | 1 Web Animation por palavra |
| Ênfase por caractere | Médio-alto | 32 keyframes × N caracteres |
| Background WebGL mesh | Alto | 30fps mitiga bastante; canvas reduzido a 0.5× |
| `mix-blend-mode: plus-lighter` | Médio | Cria stacking context extra, isolado via `contain: strict` |

### 11.3 Otimizações Obrigatórias

- `will-change: transform` em cada linha (prepara layer GPU)
- `backface-visibility: hidden` em cada linha e span de ênfase
- `contain: content` em cada linha (limita reflow ao elemento)
- `contain: strict` no container do player (isola completamente)
- **Virtualização de linhas**: linhas fora do viewport + `overscan de 300px` devem ser desmontadas do DOM (lazy mount/unmount). Apenas renderizar o HTML da linha quando ela entra na zona visível
- Recalcular layout apenas em: resize do container, mudança de música, seek manual do usuário
- Usar `ResizeObserver` para detectar mudanças de tamanho de linhas individuais (o texto pode quebrar em múltiplas linhas)
- **Spring**: calcular apenas as molas de linhas visíveis; linhas fora do viewport têm posição teleportada diretamente

### 11.4 Memory Budget

- O player deve manter ≤ 1 objeto de animação ativo por palavra ativa
- Ao desmontar uma linha, cancelar todos os `Animation` objects
- `WeakMap` para mapear elementos DOM a objetos de linha

---

## 12. Bibliotecas Públicas Recomendadas (Não AMLL)

Para implementar este spec sem usar nenhum código do projeto de referência:

| Biblioteca | Versão Recomendada | Licença | Uso |
|------------|-------------------|---------|-----|
| `motion` | 12.x | MIT | Spring animation imperativa, `animate()` com spring para posição Y e escala |
| `@react-spring/web` | 9.x | MIT | Alternativa ao `motion` com hooks React |
| `bezier-easing` | 2.x | MIT | Cálculo de curvas cúbicas para o easing de ênfase por caractere |
| `@vitest/browser` | — | MIT | Testes de comportamento visual |

Para o background WebGL, usar apenas WebGL 1.0 nativo (sem biblioteca Three.js — o efeito não precisa de geometria 3D). Alternativamente:

| Biblioteca | Versão | Licença | Uso |
|------------|--------|---------|-----|
| `ogl` | 1.x | MIT | WebGL minimalista, ~20KB |
| `pixi.js` | 8.x | MIT | Para efeitos de partículas/blur/composição |

### Versões Mínimas de Browser

| Browser | Versão mínima (funcional) | Versão para efeitos completos |
|---------|--------------------------|-------------------------------|
| Chromium/Edge | 91+ | 120+ |
| Firefox | 100+ | 100+ |
| Safari | 9.1+ | 15.4+ |

Recursos críticos que determinam a versão mínima:
- `mask-image` / `-webkit-mask-image`
- `mix-blend-mode: plus-lighter`
- Web Animations API
- `CSS.supports()`

---

## 13. Estrutura de Dados de Entrada (Interface Pública)

O implementador deve aceitar uma lista de linhas com o seguinte formato (nomes dos campos são descritivos, não os nomes da referência):

```
LyricLine {
  words: LyricWord[]          // array de palavras com timing
  translatedLyric: string     // tradução (pode estar vazio)
  romanLyric: string          // romanização (pode estar vazio)
  startTime: number           // ms de início da linha
  endTime: number             // ms de fim da linha
  isBG: boolean               // é linha de fundo (backing vocal)?
  isDuet: boolean             // é linha de dueto?
}

LyricWord {
  word: string                // texto da palavra
  startTime: number           // ms de início
  endTime: number             // ms de fim
  romanWord?: string          // romanização desta palavra
  ruby?: { word, startTime, endTime }[]  // ruby (kana sobre kanji)
  obscene?: boolean           // palavra sensível (para mascaramento)
}
```

---

## 14. NÃO Inclua (Lista de Exclusões)

Os seguintes aspectos do projeto de referência **não devem ser copiados** para manter a limpeza do clean-room:

- Nomes de classes CSS internas (ex: `.lyricLine`, `.lyricBgLine`, `.lyricMainLine`, etc.)
- Nomes de variáveis internas, funções, métodos da implementação
- Estrutura de arquivos e organização de módulos
- A implementação específica do solver de spring (a fórmula matemática é padrão e amplamente documentada, mas a estrutura de código não deve ser copiada — usar lib pública)
- Os keyframes exatos de 32 frames para a ênfase (pode usar mais ou menos frames com a mesma curva visual)
- O sistema interno de `hotLines` / `bufferedLines` para gerenciamento de estado — implementar com abordagem própria que produza o mesmo comportamento observável
- O pipeline de geração de mesh gradient — usar implementação própria baseada no artigo https://movingparts.io/gradient-meshes
- Qualquer comentário de código do projeto original

---

## 15. Checklist de Verificação Visual

Após implementar, verificar visualmente:

- [ ] Linha ativa está centralizada a ~35% da altura do container
- [ ] Linhas adjacentes estão visivelmente menores (3%) que a ativa
- [ ] Linhas distantes têm blur progressivo (não tudo igual)
- [ ] A transição de scroll tem "elasticidade" perceptível (undershoot → settle), não é linear
- [ ] Em letras com timing por palavra: o gradiente percorre a palavra da esquerda para a direita no tempo certo
- [ ] Palavras longas (≥ 1s) têm glow sutil quando atingem seu pico
- [ ] Intervalos longos (≥ 4s) exibem três pontos pulsantes
- [ ] Hover sobre o player remove o blur (linhas ficam todas nítidas)
- [ ] Durante scroll manual, blur é zerado
- [ ] Background muda de cores suavemente quando a capa do álbum muda
