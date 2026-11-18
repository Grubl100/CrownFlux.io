# Crownflux.io — Disputa pela Coroa Imperial

Crownflux.io é um jogo competitivo de estratégia em tempo real inspirado no xadrez (**tabuleiro 16×16 sem turnos**), acompanhado do modo **Cerco Tático (Draft de Cartas 12×12)** e do modo **Xadrez Clássico 8×8**. Inclui tutorial interativo, cinco níveis de inteligência artificial (CPU), sistema de contas, ranking competitivo Elo por divisões, conquistas, central de amigos e partidas 1v1 online via WebSockets.

## Requisitos

- Node.js 20 ou superior.
- Dependência `ws` (`^8.18.0`) para comunicação WebSocket em tempo real.

## Executar localmente

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Inicie o servidor:
   ```bash
   npm start
   ```
3. Abra `http://localhost:8080` no navegador.

## Arquitetura do Projeto

- `server.mjs`: Servidor HTTP e WebSocket autoritativo (simulação de partidas online, Coroa Imperial, Regiões Estratégicas, Habilidades de Fluxo, Doutrinas, Xadrez Clássico, Cerco Tático, autenticação `scrypt`, amigos e persistência em `data/db.json`).
- `public/index.html`: Shell principal e carregador dinâmico das telas modulares.
- `public/screens/`: Telas modulares (`play.html`, `guide.html`, `friends.html`, `profile.html`, `history.html`, `settings.html`, `shared.html` e `tactical.html`).
- `public/styles.css`: Sistema visual completo (tema *Império Dourado*, barra de Domínio Imperial, HUD tático, animações e responsividade).
- `public/app.js`: Motor do modo principal 16×16 e Xadrez Clássico 8×8 no cliente, IA de 5 níveis, renderizador Canvas HD com peças em estilo *Medalhão Real* e recarga radial.
- `public/tactical.js`: Lógica e interface do modo adicional Cerco Tático (Draft de Cartas).
- `scripts/check-client.mjs`: Validador de sintaxe e presença das telas.

---

## Reformulação Completa do Modo Principal (16×16)

### 1. A Coroa Imperial (`👑`) e Duas Formas de Vitória
- **Regicídio (`⚔️`)**: Capture o **Rei (`♚`)** adversário para vencer imediatamente.
- **Soberania Imperial (`👑`)**: A Coroa surge no **Trono Imperial `(8,9)`** e desperta após **12 segundos** (Fase I → Fase II).
  - Mover qualquer peça aliada até a Coroa livre transforma essa peça no **Portador da Coroa**, concedendo **+1 Escudo Real** imediato, porém adicionando **+22% de tempo de recarga** aos seus movimentos (`+10%` com a doutrina *Céleres*).
  - Enquanto mantiver a Coroa, sua facção acumula **Domínio Imperial (0% a 100%)**: **+3,5%/s** no Trono Central, **+2,5%/s** em campo aberto ou apenas **+0,6%/s** se recuar para a própria base (impedindo retranca passiva). Ao atingir **100%**, a vitória é imediata.
  - **Contra-ataque e Recuperação**: Abater o Portador inimigo derruba a Coroa no local (com **3,5s de bloqueio** para a equipe que a perdeu), reduz o Domínio adversário em **12%** e concede **+4 XP** e **+28% de Energia de Fluxo** ao atacante.

### 2. Controle Territorial — 3 Regiões Estratégicas
- **⚡ Santuário de Fluxo (`x: 2..3, y: 7..8`)**: Gera **+3% de Energia de Fluxo por segundo** para a facção que ocupá-lo sem contestação inimiga.
- **👑 Trono Imperial (`x: 7..8, y: 7..8`)**: Altar central onde a Coroa desperta; acelera o Domínio Imperial para **+3,5%/s**.
- **🏰 Fortaleza Real (`x: 12..13, y: 7..8`)**: A cada **14 segundos** de controle incontestado, concede automaticamente **+1 Escudo Real** ao seu Rei (`♚`).

### 3. Três Habilidades Táticas de Fluxo (`0% a 100%`)
- **`[1]` ⚡ Investida Real (45% Fluxo)**: Zera imediatamente a recarga da peça aliada selecionada (ou da peça de maior valor em recuperação) e concede **-45% de recarga** no próximo movimento.
- **`[2]` 🛡️ Égide Real (60% Fluxo · 8s de recarga)**: Concede **+1 Escudo Real** (bloqueia 1 captura) à peça selecionada, ao Portador da Coroa ou ao Rei, além de cortar metade da recarga atual.
- **`[3 / Espaço]` 🔥 Surto Imperial (100% Fluxo)**: Corta **52%** da recarga atual de todo o exército aliado e acelera todas as peças em **42%** durante **6 segundos**.

### 4. Três Doutrinas Estratégicas Pré-Partida
- **⚔️ Vanguarda (Ofensiva)**: `-12%` de recarga após capturas e inicia com `28%` de Energia de Fluxo (`-10%` na taxa de Domínio da Coroa).
- **🛡️ Bastião (Defensiva & Controle)**: O Rei inicia a partida com `+1 Escudo Real` e as Regiões Estratégicas rendem `+25%` mais rápido (`+10%` de recarga em movimentos sem captura de Torre/Rainha).
- **🐎 Céleres (Mobilidade & Coroa)**: Peões, Cavalos e Rei têm `-12%` de recarga em movimentos de deslocamento e o Portador da Coroa sofre metade da penalidade de peso (`+10%`).

### 5. Ritmo em 3 Fases Naturais
1. **Fase I — Desenvolvimento (`0s–12s`)**: A Coroa permanece selada no centro enquanto os jogadores disputam o Santuário e a Fortaleza.
2. **Fase II — Confronto (`12s–150s`)**: A Coroa desperta e abre a corrida estratégica entre Soberania Imperial e Regicídio.
3. **Fase III — Ascensão Imperial (`150s+` ou `≥ 70%` de Domínio)**: A velocidade de Domínio da Coroa sobe em **+35%**, forçando o desfecho decisivo.

### 6. Identidade Visual, Ranking Competitivo e Conquistas
- **Tabuleiro Ampliado & Peças Medalhão Real**: Quatro temas de tabuleiro (*Império Dourado*, *Esmeralda Clássico*, *Ardósia Noturna*, *Madeira Real*), três estilos de peças (*Medalhão Real*, *Heráldico Imperial*, *Minimalista*), interpolação suave de movimento e arco circular de recarga.
- **Ranking Crownflux & Divisões**: Rating Elo competitivo iniciando em `1200` com 6 divisões (*Bronze, Prata, Ouro, Platina, Diamante e Mestre da Coroa*) e quadro de **7 Conquistas** reais no perfil.
