# Crownflux.io (React + Vite + WebSocket)

Crownflux.io é um jogo competitivo de estratégia em tempo real com **Central de Modos** dedicada, frontend migrado para **React 18 + Vite + React Router** e backend autoritativo em **Node.js + WebSocket (`ws`)**.

## Arquitetura e Modalidades

1. **Duelo (`16×16` em tempo real)** — Modalidade principal competitiva:
   - **1v1 Online (Prioritário)**: fila pública ranqueada (Elo Crownflux + 6 Divisões), salas privadas com código e desafio direto entre amigos.
   - **Coroa Imperial (`👑`)**: desperta no Trono Central `(8,9)` após 12s; acumula Domínio Imperial (`0%–100%`) até a vitória por **Soberania Imperial** ou por **Regicídio (`♚`)**.
   - **3 Regiões Estratégicas**: *Santuário de Fluxo*, *Trono Imperial* e *Fortaleza Real*.
   - **3 Habilidades Táticas de Fluxo**: `[1] Investida Real`, `[2] Égide Real` e `[3 / Espaço] Surto Imperial`.
   - **3 Doutrinas Estratégicas**: *Vanguarda*, *Bastião* e *Céleres*.
   - **4 Jogadores (Arena)**: modo alternativo preservado com suas regras originais (conversão de exército ao capturar o Rei e Surto único).
   - **Contra Bot (5 níveis)**, **Duelo Local** e **Tutorial Prático em 8 etapas**.
2. **Cerco Tático (`12×12` por turnos com cartas)**:
   - Fila pública online, salas privadas (4 dígitos), desafios entre amigos, CrownBot (CPU) e Tutorial em 3 etapas.
   - *Limitação documentada*: não há modo pass-and-play offline local porque a névoa de guerra e as cartas ocultas dependem do estado autoritativo no servidor.
3. **Xadrez Clássico (`8×8`)**:
   - Regras oficiais independentes (roque, en passant, promoção, afogamento, repetição tripla e regra dos 50 lances), fila ranqueada por controle de tempo (`Bullet`, `Blitz`, `Rapid`, `Clássico`), salas privadas, Bot em 5 níveis e Duelo Local 8×8.

## Instalação e Execução Local

### Requisitos
- Node.js `>= 20.0.0` (testado com `v22.14.0`)

### Passos
1. Extraia o arquivo ZIP e entre na pasta do projeto.
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Configure as variáveis de ambiente (opcional — copie `.env.example` para `.env`):
   ```env
   PORT=8080
   HOST=0.0.0.0
   DATA_FILE=./data/db.json
   RECONNECT_GRACE_SECONDS=45
   ```
4. **Modo Desenvolvimento** (2 terminais):
   - Terminal 1 (backend + WebSocket na porta `8080`): `npm run dev:server`
   - Terminal 2 (frontend Vite HMR na porta `5173` com proxy `/api` e `/ws`): `npm run dev`
5. **Build e Execução de Produção**:
   ```bash
   npm run build
   npm start
   ```
   Acesse `http://localhost:8080`. O servidor `server.mjs` serve os arquivos gerados em `dist/` e resolve todas as rotas do React Router (`/modes`, `/modes/duelo`, `/friends`, `/ranking`, `/profile/:username`, `/game/:matchId`, `/results/:matchId`, etc.) diretamente no navegador.
