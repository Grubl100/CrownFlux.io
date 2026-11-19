# DESIGN.md - CrownFlux.io (Xadrez Clássico)

## Design Read & Dials
- **Direção Visual:** Salão de Xadrez Contemporâneo (Editorial Club Room).
- **Dials:** `ENERGY 2 / RHYTHM 2 / MOTION 1`
  - **ENERGY 2 (Calma Competitiva):** Contraste limpo e silencioso para manter o olho no tabuleiro durante partidas rápidas e longas, sem ruído neon ou brilhos artificiais.
  - **RHYTHM 2 (Hierarquia Estruturada):** Tabuleiro como ponto focal dominante; relógios, barra de ferramentas e histórico em coluna lateral contida, sem repetição de cards idênticos.
  - **MOTION 1 (Funcional):** Transições curtas de estado (120-160ms) apenas em feedback de clique, foco e troca de turno; zero animações decorativas contínuas; respeito estrito a `prefers-reduced-motion`.

## Decisões de Design (uma linha por escolha)
- **Tipografia Display (`Fraunces`):** Serifa editorial para títulos de página e cabeçalhos de partida, evocando clubes clássicos de xadrez sem parecer genérico.
- **Tipografia UI (`Plus Jakarta Sans`):** Sans geométrica humanista de alta legibilidade para controles, rótulos e seletores de tempo.
- **Tipografia Numérica/SAN (`JetBrains Mono`):** Monoespaçada com `tabular-nums` para relógios, Elo, coordenadas e notação algébrica, evitando tremor horizontal durante a contagem regressiva.
- **Ausência de emojis decorativos:** Ícones SVG vetoriais de traço único (16px, `aria-hidden="true"`) substituem emojis em botões e rótulos para consistência entre sistemas operacionais.
- **Hierarquia do Tabuleiro:** O canvas 8x8 ocupa o centro visual com moldura sutil de 1px; barras de jogador ficam rentes às bordas superior e inferior do tabuleiro, alinhadas à mesma largura máxima.
- **Distinção das 3 Camadas Visuais no Tabuleiro:**
  1. **Indicadores de movimento legal:** bolinha centralizada translúcida em casas vazias e anel limpo nas casas de captura (incluindo en passant).
  2. **Marcação de movimentos legais (Setas Legais):** seta sólida com ponta preenchida (e traçado em L para Cavalo), restrita ao gerador legal real da posição e turno.
  3. **Marcação livre (Setas Livres):** seta tracejada com ponta vazada (também em L para Cavalo), permitindo planos hipotéticos mas respeitando obrigatoriamente a geometria da peça na casa de origem.

## Paleta e Temas (WCAG AA >= 4.5:1 texto normal, >= 3:1 UI/texto grande)

### Tema 1: Azul Clássico (`:root` padrão)
- Fundo base (`--bg`): `#111820`
- Elevação (`--bg-elev`): `#161f29`
- Painel (`--panel`): `#1c2733`
- Painel secundário (`--panel-2`): `#23303e`
- Borda (`--border`): `#344658`
- Texto primário (`--text`): `#edf2f7` (contraste > 12:1 sobre `--panel`)
- Texto secundário (`--muted`): `#a4b6c7` (contraste > 6.5:1 sobre `--panel`)
- Acento primário (`--primary-bg-1` / `--primary-bg-2`): `#88b4ca` / `#628fa6` com texto `--primary-text: #0b131a` (contraste > 6.5:1)
- Destaque sutil (`--gold`): `#98c3d8` (contraste > 7.5:1 sobre `--panel`)
- Perigo (`--danger-text`): `#ffd6d8` sobre `rgba(186, 56, 66, 0.30)`

### Tema 2: Verde e Dourado (`[data-ui-theme="emerald"]`)
- Fundo base (`--bg`): `#121815`
- Elevação (`--bg-elev`): `#18201b`
- Painel (`--panel`): `#1e2722`
- Painel secundário (`--panel-2`): `#26312b`
- Borda (`--border`): `#38483f`
- Texto primário (`--text`): `#f0eadc` (contraste > 12:1 sobre `--panel`)
- Texto secundário (`--muted`): `#aab6ad` (contraste > 6.5:1 sobre `--panel`)
- Acento primário (`--primary-bg-1` / `--primary-bg-2`): `#d9ba7b` / `#b6924f` com texto `--primary-text: #15120c` (contraste > 7:1)
- Destaque dourado (`--gold`): `#dec082` (contraste > 7.5:1 sobre `--panel`)

## Responsividade e Acessibilidade
- **Desktop (>= 1080px):** Grid 2 colunas assimétrico (tabuleiro + relógios à esquerda, histórico + ações à direita).
- **Tablet (768px a 1079px):** Tabuleiro centralizado em largura confortável; painel lateral rearranjado abaixo em 2 colunas (histórico + ações).
- **Mobile (<= 767px):** Fluxo vertical em coluna única, largura total sem overflow horizontal, alvos de toque mínimos de `44px x 44px`, controles de anotação e revisão empilhados de forma ergonômica.
- **Mobile Landscape (altura reduzida):** Tabuleiro dimensionado pela altura disponível mantendo relógios compactos visíveis.
- **Teclado e Foco:** `:focus-visible` com anel nítido de 2px em `--gold` e `outline-offset: 2px`; `Escape` fecha diálogos de confirmação e promoção; `aria-pressed` em modos de anotação; `aria-label` em controles somente ícone.
