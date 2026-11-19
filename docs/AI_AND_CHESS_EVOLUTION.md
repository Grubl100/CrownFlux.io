# Crownflux.io — Documentação Técnica: Evolução Global de IA, Xadrez Clássico e Temas

## 1. Arquitetura Global de Inteligência Artificial
Padronização de **5 níveis globais** (`1. Iniciante`, `2. Fácil`, `3. Intermediário`, `4. Difícil`, `5. Muito difícil`) em `src/ai/aiConfig.js`, mantendo motores especializados por modalidade:

- **Duelo 1v1 (`src/ai/duelAI.js`)**:
  - Postura dinâmica (`offensive`, `defensive`, `control`, `mobility`) adaptada ao estado da Coroa, progresso de Domínio Imperial e segurança do Rei.
  - Gestão estratégica de Energia de Fluxo (`Investida Real`, `Égide Real`, `Surto Imperial`).
  - Simulação tática de 2 lances (lookahead de ameaças e contra-ataques nos níveis 4–5) e memória anti-repetição por peça.
- **Arena 4 Jogadores (`src/ai/arenaAI.js`)**:
  - Motor multi-adversário FFA dedicado: avalia os 3 rivais simultaneamente, penaliza fogo cruzado (`>= 2` facções atacando a mesma casa), prioriza conversões de exército (Reis rivais vulneráveis) e evita exposição prematura no centro.
  - Seletor de 5 níveis integrado em `Duel4PlayersPage.jsx`.
- **Cerco Tático (`server-ai/tacticalAI.mjs` + `BotController` em `server.mjs`)**:
  - Respeita estritamente a **Névoa de Guerra** (raio 4 + visibilidade pública do portador da Coroa), sem acessar a mão ou posição oculta do adversário.
  - Avaliação utilitária de todas as 8 cartas (`short_teleport`, `flux_siphon`, `flux_wall`, `crown_dash`, `kinetic_push`, `royal_charge`, `transposition`, `stamina_overcharge`), planejamento de PA, memória anti-repetição e seleção estratégica no Draft.
  - Seletor de 5 níveis integrado em `TacticalPage.jsx`.
- **Xadrez Clássico (`src/ai/chessEngineWorker.js`)**:
  - Integração real do **Stockfish 19 Lite WASM** (`stockfish-19-lite-single.js` + `.wasm`, ~1.7 MB, single-threaded sem dependência de `SharedArrayBuffer` ou CDN externo), rodando em Web Worker via protocolo UCI.
  - Licenciamento: **GPL-3.0**, preservado em `public-assets/stockfish/LICENSE-GPL3.txt` (copiado automaticamente pelo script `scripts/copy-stockfish.mjs` no `postinstall` e `build`) e servido com `Content-Type: application/wasm` em `server.mjs`.
  - Cinco níveis calibrados com `Skill Level`, `UCI_LimitStrength`, `UCI_Elo`, profundidade, tempo de busca e MultiPV controlado nos níveis 1–2.

## 2. Evolução do Xadrez Clássico
- **Perspectiva Individual (`src/game/classicRenderer.js`)**: conversão bidirecional consistente (`boardToView` / `viewToBoard`) aplicada a casas, coordenadas (`a–h`, `1–8`), peças, último lance, movimentos legais, xeque, mate, clique, arrastar e soltar, setas e marcações.
- **Marcações e Setas**: botão direito no desktop (Shift/Alt/Ctrl para cores) e modo "Anotar (Toque)" no mobile/tablet. Nenhuma sugestão do motor é exibida em partidas ao vivo.
- **Relógios e Controles de Tempo**: 16 controles oficiais (`Bullet 1+0/1+1/2+0/2+1`, `Blitz 3+0/3+2/5+0/5+3`, `Rapid 10+0/10+5/15+10/25+0`, `Clássico 30+0/30+20/60+0/90+30`) + Controle Personalizado (validado no frontend e backend, restrito a salas privadas, bot e local). Destaque vermelho em `<= 10s` e alerta sonoro controlado uma única vez na transição para `<= 10s` (configurável em Configurações).
- **Análise Pós-Partida (`/analysis/:matchId`, `src/pages/ChessAnalysisPage.jsx`)**: reconstrução completa por UCI/SAN/PGN, avaliação Stockfish 19 em Web Worker com progresso e cancelamento, classificação de lances (`Melhor lance`, `Excelente`, `Bom`, `Imprecisão`, `Erro`, `Erro grave`), precisão 0–100 para Brancas e Pretas, gráfico SVG interativo, momentos decisivos, reprodução automática e exploração de variações isoladas.

## 3. Sistema de Temas Visuais
- **Azul Clássico (`uiTheme: 'blue'`, padrão)**: recuperado da identidade visual original do repositório (`#12171d`, `#1d2630`, `#7da3b5`, `#93b8c9`, `#385563`, `#cfaf72`).
- **Verde e Dourado (`uiTheme: 'emerald'`, alternativo)**: preservado integralmente.
- Seletor com prévia visual em `Configurações → Aparência & Tema Global`, persistido em `localStorage` e `/api/profile/preferences`.

## 4. Resultados dos Testes Executados (`scripts/test-all-systems.mjs`)
- **Duelo 1v1 AI (Lv5 vs Lv1)**: 6 partidas simuladas — Lv5 venceu/liderou **6/6** (placar médio 22.3 vs 5.7), zero lances ilegais.
- **Arena 4P AI**: 101 ações legais executadas entre 4 facções (Lv5 placar=37 vs Lv1 placar=20).
- **Cerco Tático AI**: ação estratégica respeitando névoa (`card:short_teleport`), Draft ótimo **10/10** no Lv5.
- **Perspectiva 8×8**: conversão bidirecional validada nas 64 casas para Brancas e Pretas.
- **Motor Clássico**: FEN, SAN (`e4`, `e5`, `Nf3`, `Nc6`, `Bb5`), PGN e reconstrução de estados validados.
- **Stockfish 19 Lite WASM (UCI)**: Lv5 encontrou mate-em-1 (`e1e8`, `mate=1`); Lv1 retornou resposta legal (`e7e5`).
- **Servindo WASM**: `GET /stockfish/stockfish-19-lite-single.wasm` → `200` com `Content-Type: application/wasm`.
- **Multiplayer Clássico E2E (2 sessões independentes)**: matchmaking `blitz3_2`, atribuição `side=0` / `side=1`, sincronização de `e4`/`e5` com `moveHistory`, reconexão das Pretas preservando `side=1` e histórico, rejeição de controle personalizado na fila ranqueada (`CUSTOM_NOT_RANKED`) e criação de sala privada custom `12+4`.

## 5. Limitações Conhecidas
- **Premoves em partidas online**: anotações de previsão (setas/marcações) estão disponíveis; fila de premove automático em Xadrez Clássico online foi deixada fora desta entrega para evitar dessincronização em conexões instáveis.
- **Histórico de Análise Pós-Partida**: registros detalhados de lances/PGN para `/analysis/:matchId` são persistidos localmente no navegador (`localStorage`, até 30 partidas recentes); o banco do servidor continua armazenando resumo da partida em `db.games`.
