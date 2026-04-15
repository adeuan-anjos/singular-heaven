# Lyrics Responsive Layout — Clean-Room Spec

> **Documento de engenharia reversa limpa (clean-room)**
> Descreve o comportamento *responsivo observável* do layout de letras estilo Apple Music, derivado
> de estudo do projeto de referência de código aberto. Nenhum trecho de código, nome de função,
> nome de classe CSS, nome de variável ou identificador do projeto estudado foi reproduzido.
> Um engenheiro independente, sem acesso ao projeto original, deve conseguir implementar o layout
> correto lendo apenas este documento e os arquivos do nosso próprio projeto.

---

## 1. Visão Geral

O layout de letras apresenta dois modos estruturais dependentes da proporção do container:

- **Modo horizontal (landscape):** capa + controles na coluna esquerda, letras na coluna direita. Ativado quando a largura do container é maior que a altura.
- **Modo vertical (portrait):** capa centralizada na parte superior, letras abaixo. Ativado quando a altura do container é maior que a largura.

A troca entre modos é detectada via `ResizeObserver` na proporção do container (`largura < altura` → vertical). Não é um breakpoint fixo de viewport — é a forma do elemento que decide.

O problema principal que esta spec resolve: em monitores ultrawide (21:9, 32:9) ou em telas 4K, o layout horizontal se expande indefinidamente, produzindo capa gigante e linhas de letra muito largas. A spec define como controlar esse crescimento.

---

## 2. Larguras Responsivas das Colunas (Modo Horizontal)

O grid tem sempre duas colunas: coluna de informações (capa + controles) e coluna de letras. A proporção padrão é **45% info / 55% letras**, expressa como `0.45fr` e `0.55fr`.

| Viewport width | Coluna de capa (info) | Coluna de letras | Gap entre colunas |
|---|---|---|---|
| < 768px | Layout vertical (não horizontal) | Layout vertical | — |
| 768px–1024px | Horizontal, ~45% | ~55% | 8px |
| 1024px–1600px | 45% (`0.45fr`) | 55% (`0.55fr`) | 8px |
| 1600px–1920px | 45% (`0.45fr`) | 55% (`0.55fr`) | 8px |
| ≥ 1920px | 45% (`0.45fr`) | 55% (`0.55fr`) | 8px |

**Importante:** as proporções `fr` não mudam com a largura — o que muda é o tamanho máximo da capa dentro dessa coluna (ver seção 3).

A coluna de letras tem recuo direito interno (`padding-right`) de **15%** da sua própria largura em telas ≥ 1600px, reduzindo para **8%** em telas < 1600px ou altura < 1000px. Isso garante que as linhas de letra não encostem na borda direita da tela.

---

## 3. Tamanho da Capa (Artwork)

A capa tem `aspect-ratio: 1 / 1` e cresce até uma largura máxima calculada dinamicamente pela seguinte fórmula:

```
tamanho_máximo_capa = min(50vh, 38vw)
```

Em telas com altura ≤ 1000px, a fórmula se torna ligeiramente mais conservadora:

```
tamanho_máximo_capa = min(45vh, 38vw)
```

Isso significa:
- Em 1920×1080: `min(540px, 729.6px)` → **540px** (limitado pela altura)
- Em 2560×1440: `min(720px, 972.8px)` → **720px** (limitado pela altura)
- Em 3840×2160: `min(1080px, 1459.2px)` → **1080px** (limitado pela altura)
- Em 1280×800: `min(400px, 486.4px)` → **400px** (limitado pela altura)
- Em 1280×800 com altura ≤ 1000px: `min(360px, 486.4px)` → **360px**

A capa é centralizada dentro da coluna de informações tanto horizontal quanto verticalmente.

**Comportamento quando a música está pausada:** a capa encolhe ligeiramente — a implementação usa `transform: scale(var(--scale-level))` onde `--scale-level` é menor que 1.0 (em torno de 0.95). A sombra (`drop-shadow`) também diminui proporcionalmente.

---

## 4. Tipografia da Coluna de Capa

### 4.1 Título da Música

```
font-size: max(2vh, 1em)
```

onde `1em` é herdado do container pai (que por sua vez pode ter `font-size: 0.8em` em altura ≤ 768px).

- Peso: 500 (medium)
- Letter-spacing: 0.4px
- Opacidade: 0.9

### 4.2 Nome do Artista / Álbum

Mesma fórmula base do container. Opacidade: 0.45. Peso: 400.

### 4.3 Rótulos de Tempo (progresso)

```
font-size: max(1.2vh, 0.8em)
```

Opacidade: 0.5. Peso: 500.

### 4.4 Botões de Controle (media buttons)

Cada botão tem `aspect-ratio: 1 / 1` e largura de **18%** da largura disponível dos controles (que é igual ao tamanho máximo da capa). O ícone SVG interno é escalado separadamente:

| Altura do viewport | Escala do ícone (botão secundário) | Escala do ícone (botão play) |
|---|---|---|
| > 1080px | 3× | 2× |
| ≤ 1080px | 2× | 1.1× |
| ≤ 768px | 1.5× | 0.8× |
| ≤ 512px | 1× | 0.5× |
| Largura ≤ 480px | 0.5× | 0.5× |

### 4.5 Escala do Layout em Altura Pequena

Quando a altura do viewport é ≤ 768px, o layout horizontal inteiro aplica `font-size: 0.8em` ao seu container raiz (redução de 20%). O gap interno também cai de 8px para 2px.

---

## 5. Tipografia da Coluna de Letras

### 5.1 Font-size base do player de letras

O container do player de letras herda uma `font-size` base calculada como:

**Em telas > 768px de largura:**
```
font-size: max(5vh, 2.5vw)
```
com mínimo absoluto de 12px.

**Em telas ≤ 768px de largura:**
```
font-size: max(8vw, 12px)
```

Exemplos do valor em telas > 768px:
- 1280×800: `max(40px, 32px)` → **40px**
- 1920×1080: `max(54px, 48px)` → **54px**
- 2560×1440: `max(72px, 64px)` → **72px**
- 3840×2160: `max(108px, 96px)` → **108px**

Toda a tipografia das letras usa `em` relativo a esse valor base.

### 5.2 Linha de Letra Principal

```
line-height: 1.2em
```

Padding interno por linha: `0.5em 1em` em telas > 500px; `0.5em 20px` em telas ≤ 500px.

O texto usa `text-wrap: balance` e `overflow-wrap: break-word`. Para idiomas CJK, `word-break: keep-all`.

### 5.3 Linha de Letra Secundária (tradução / romanização)

```
font-size: max(0.5em, 10px)
line-height: 1.5em
opacity: 0.3
```

### 5.4 Linha de Letra de Fundo (backing vocals)

```
font-size: max(0.7em, 10px)   /* 0.7 = fator de escala padrão */
opacity: 0.4 (quando ativa) / quase-invisível (quando inativa)
```

### 5.5 Largura e Alinhamento das Linhas

Cada linha de letra ocupa **80%** (`0.8` × largura total do container de letras) — a variável de aspecto que controla isso é aplicada a `width`, `min-width` e `max-width` simultaneamente.

Em telas ≤ 768px, esse aspecto sobe para **100%** e o padding horizontal lateral é zerado.

As linhas são alinhadas à **esquerda** por padrão. Linhas de dueto (backing vocal da outra voz) são alinhadas à **direita** com `transform-origin: right`.

Em layouts com dueto, a linha principal recebe `padding-right: 15%` e a linha de dueto recebe `padding-left: 15%` para criar separação visual.

---

## 6. Comportamento Ultrawide (≥ 2560px)

Não há `max-width` global no container raiz — o layout preenche o viewport inteiro. O controle de tamanho é feito pelo `min(50vh, 38vw)` da capa (seção 3), que naturalmente limita a expansão da coluna de informações.

A coluna de letras cresce proporcionalmente com os 55% restantes, mas o `font-size` calculado em `vh` e `vw` (seção 5.1) cresce de forma sub-linear — dobrar a largura não dobra o texto.

Em 3840×2160 (4K): capa de ~1080px, texto base de ~108px, coluna de letras de ~1700px de largura mas com recuo direito de ~255px.

**Recomendação para o nosso projeto:** aplicar um `max-width` no container raiz do `LyricsSheet` (por exemplo `max-w-screen-2xl mx-auto`) para não deixar a tela 4K completamente desestruturada. O AMLL não faz isso — considera que a janela do app será redimensionada pelo usuário.

---

## 7. Estado Centralizado (Sem Letras / Apenas Capa)

Quando não há letras disponíveis (carregando ou ausentes), o painel de capa fica **centralizado** no eixo horizontal do container.

**Tamanho da capa no estado centralizado:** usa as mesmas fórmulas `min(50vh, 38vw)` da seção 3 — o tamanho não muda entre os modos centralizado e encostado à esquerda.

**A transição entre os modos** (centralizado ↔ encostado à esquerda) é animada via `Framer Motion` com `layout` e `layoutId` — os elementos de capa, título e controles têm o mesmo `layoutId` nos dois modos, produzindo uma transição de posição fluida quando as letras aparecem ou somem.

No estado centralizado, os controles grandes (`bigControls`) ficam visíveis abaixo da capa. No estado com letras, esses controles grandes somem e os controles compactos (`smallControls`) aparecem na posição de coluna esquerda.

**Hierarquia visual no estado centralizado:**
1. Capa centralizada — tamanho pleno `min(50vh, 38vw)`
2. Título + Artista abaixo da capa (sem margem extra)
3. Slider de progresso abaixo
4. Botões de controle grandes abaixo do slider: altura e largura de **10vh** cada

---

## 8. Modo Vertical (Portrait)

Ativado quando `largura_container < altura_container`.

O layout vertical usa um grid de linhas:
- Linha de drag area: 30px
- Linha de thumb/controles: 30px
- Linha principal (capa + letras): `1fr`
- Linha de controles inferiores: automática

A capa é posicionada via `ResizeObserver` + `framer-motion animate`: seu tamanho e posição são calculados em JavaScript medindo elementos fantasma (placeholder) no grid para determinar onde a capa deve estar. Não é posicionamento CSS puro.

**Quando as letras estão visíveis (portrait com letras):**
- Capa pequena no canto superior esquerdo, tamanho `6em` (≈ largura do ícone fantasma)
- Letras ocupam toda a altura restante
- Controles compactos visíveis ao lado da capa pequena

**Quando as letras estão ocultas (portrait sem letras):**
- Capa cresce para preencher a área principal disponível (medida pelo placeholder grande)
- Controles grandes aparecem abaixo

Margens laterais do grid vertical: `3em` em telas > 480px; `20px` em telas ≤ 480px.

O container de letras no modo vertical usa `mask-image: linear-gradient(transparent 0%, black 10%, black 100%)` para suavizar a borda superior.

---

## 9. Comportamento com Letras Ocultas (hideLyric)

Quando o usuário oculta as letras (mantendo a visualização fullscreen ativa):

**Modo horizontal:**
- A coluna de letras recebe `opacity: 0` e `pointer-events: none` com transição de 0.25s
- Os elementos de capa/título/controles deslizam para o **centro da tela** — equivalente a um deslocamento de `61.11%` à direita (calculado como `100% × 0.55 / (0.45 + 0.55) / 2` para centralizar dentro do espaço da coluna de informações)

**Modo vertical:**
- `smallControls`: `opacity: 0`, `pointer-events: none`
- `lyric`: `opacity: 0`, `pointer-events: none`
- `bigControls`: `opacity: 1` (aparece)

---

## 10. Breakpoints e Media Queries Recomendadas (Tailwind v4)

No nosso projeto, usar as utilidades de Tailwind v4 equivalentes:

```
/* Modo vertical vs horizontal: detectar por ResizeObserver, não media query */

/* Redução de font-size em altura pequena */
@media (max-height: 768px) { ... }   /* equivale a: não tem utilitário Tailwind direto */
@media (max-height: 1000px) { ... }

/* Largura pequena para padding das letras */
@media (max-width: 1600px) { ... }   /* Tailwind: max-[1600px]: */
@media (max-width: 768px) { ... }    /* Tailwind: max-md: */
@media (max-width: 500px) { ... }    /* Tailwind: max-[500px]: */
@media (max-width: 480px) { ... }    /* Tailwind: max-[480px]: */
```

**Tailwind v4 não tem utilitários `max-height` prontos.** Para altura do viewport, usar CSS direto com `@layer utilities` ou `style` prop com `container queries`.

**Recomendação**: usar container queries (`@container`) para os breakpoints de largura internos do `LyricsSheet`, pois ele sempre ocupa `100svh` e `100vw`. Isso garante que os valores respondam ao tamanho do elemento, não ao viewport.

---

## 11. Técnicas CSS Recomendadas

| Necessidade | Técnica |
|---|---|
| Tamanho da capa responsivo | `width: min(50vh, 38vw)` — CSS nativo puro |
| Font-size das letras | `font-size: max(5vh, 2.5vw)` com fallback `max(..., 12px)` |
| Font-size em tela pequena | `font-size: clamp(12px, 8vw, 5vh)` equivalente |
| Proporção colunas | `grid-template-columns: 0.45fr 0.55fr` |
| Aspecto da capa | `aspect-ratio: 1 / 1` |
| Largura de linha de letra | `width: 80%` no container de letras via variável CSS |
| Transição modo hideLyric | `opacity` + `pointer-events` com `transition: opacity 0.25s` |
| Detecção vertical/horizontal | `ResizeObserver` comparando `clientWidth` vs `clientHeight` |
| Animação de reposicionamento | `framer-motion` `layout` + `layoutId` (não CSS puro) |
| Máscara de fade nas letras | `mask-image: linear-gradient(transparent, black 10%, black 90%, transparent)` |

---

## 12. Compatibilidade com Nossa Implementação Atual

Nosso `LyricsSheet` atual (`src/modules/youtube-music/components/lyrics/lyrics-sheet.tsx`) usa:

- Capa fixa em `w-80` (320px) — não responsiva
- Colunas: `ARTWORK_COL_WIDTH = "28rem"` (448px) fixo, restante via `calc(100% - 28rem - 6rem)`
- Font-size das letras: não definido explicitamente (herda do DOM)

**Pontos que precisam de ajuste para seguir esta spec:**
1. Substituir `w-80` + `size-80` da `Avatar` por `width: min(50vh, 38vw)`
2. Substituir as colunas hardcoded por `grid-template-columns: 0.45fr 0.55fr`
3. Adicionar `font-size: max(5vh, 2.5vw)` no container do player de letras
4. Reduzir padding-right da coluna de letras de fixo para porcentagem (15% acima de 1600px, 8% abaixo)
5. Implementar modo vertical via `ResizeObserver`

---

## 13. NÃO Inclua

Esta spec descreve comportamento observável. Os seguintes itens do projeto de referência **não devem ser copiados**:

- Nomes de classes CSS do projeto de referência (ex: nomes específicos dos CSS Modules)
- Nomes de componentes internos do projeto de referência
- Lógica interna de cálculo de posição spring (coberta pelo spec de animações)
- Sistema de mesh gradient / background WebGL (coberto por spec separado)
- Animação de karaoke por sílaba / palavra (coberta pelo spec principal de letras)
- Implementação de interlude dots (coberta pelo spec principal de letras)
- Qualquer dependência npm específica do projeto de referência
