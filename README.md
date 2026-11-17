# Crownflux.io

Crownflux.io é um jogo de estratégia em tempo real inspirado no xadrez, com tabuleiro 16×16 sem turnos, tutorial interativo de 7 etapas, cinco níveis de inteligência artificial (CPU), guia visual interativo, sistema de contas, perfis, central de amigos e partidas 1v1 online via WebSockets.

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

## Funcionalidades Implementadas

### 1. Página Exclusiva "Como jogar"
- Guia interativo dividido em 5 categorias:
  1. **Objetivo & Vitória**
  2. **Tabuleiro & Peças (Simulador Interativo 7×7)** — permite selecionar cada peça (`♟`, `♞`, `♝`, `♜`, `♛`, `♚`), visualizar casas válidas, alcance, valor de captura e tempo real de recarga, além de movimentar a peça no mini-tabuleiro demonstrativo.
  3. **Capturas & Evolução (XP)**
  4. **Fragmentos Flux & Habilidade Surto**
  5. **Modos de Jogo & Partidas Online**

### 2. Boas-vindas no Primeiro Acesso & Tutorial Prático 1v1 (7 Etapas)
- Janela discreta no primeiro acesso perguntando se o jogador deseja aprender (`Sim, quero aprender`, `Já sei jogar, pode continuar`, `Talvez depois`), persistida na conta (para usuários autenticados) e no navegador (`localStorage`).
- **Tutorial prático 1v1 contra Bot Iniciante cooperativo**:
  - **Etapa 1**: Conhecendo o tabuleiro e a interface em tempo real.
  - **Etapa 2**: Selecionando uma peça com destaques visuais no tabuleiro.
  - **Etapa 3**: Realizando o primeiro movimento e entendendo o tempo de recarga individual (cooldown) com feedback amigável caso clique em casa inválida.
  - **Etapa 4**: Praticando capturas e evolução de XP/reforços.
  - **Etapa 5**: Posicionamento estratégico e proteção do Rei.
  - **Etapa 6**: Coletando um Fragmento Flux e ativando a habilidade especial **Surto**.
  - **Etapa 7**: Finalizando a partida contra o bot iniciante.
- Controles para pausar, avançar etapa, sair ou repetir o tutorial a qualquer momento.

### 3. Cinco Níveis de Dificuldade contra a CPU
1. **Iniciante** *(Recomendado para novos jogadores)*: Avalia um subconjunto de peças, ignora mapas de ameaça e faz movimentos simples.
2. **Fácil**: Reconhece capturas diretas e coleta fragmentos próximos, mas subestima defesas inimigas.
3. **Normal**: Estratégia equilibrada, protege peças ameaçadas, disputa Fragmentos Flux e usa o Surto.
4. **Difícil**: Antecipa ameaças, evita trocas desfavoráveis, verifica suporte de peças aliadas e pressiona o Rei adversário.
5. **Especialista**: Análise tática de 2 lances (lookahead), avaliando contra-ataques imediatos após o movimento, escoltando o próprio Rei e coordenando o Surto ofensivamente.

### 4. Sistema de Conta, Perfil, Segurança e Preferências
- Cadastro e Login com opção **"Lembrar de mim"** (sessão persistente de 30 dias armazenada com hash SHA-256 no banco de dados `data/db.json` + cookie `HttpOnly` + token Bearer).
- Senhas armazenadas exclusivamente com hash criptográfico `scrypt` (`N=16384, r=8, p=1`, salt aleatório de 16 bytes e comparação `timingSafeEqual`).
- **Redefinição segura de senha**: Geração de **Código de Recuperação** pessoal (`CFX-XXXX-XXXX`, armazenado apenas como hash `scrypt` no servidor) que permite redefinir a senha sem expor credenciais. *(Nota: como o projeto não depende de servidor SMTP externo obrigatório, a recuperação utiliza o Código de Recuperação criptografado gerado no cadastro/perfil).*
- Edição de nome de usuário (com validação de disponibilidade), nome de exibição, biografia, avatar (`♟ ♞ ♝ ♜ ♛ ♚ ⚔ 🛡 👑 ⚡ 🔥 💎`) e senha.
- Preferências sincronizadas com o backend (tema do tabuleiro, coordenadas, destaque de movimentos, pré-move na recarga, efeitos sonoros Web Audio e confirmação de saída).

### 5. Central de Amigos e Desafios Configuráveis
- Categorias organizadas em tempo real:
  - **Disponíveis Online**
  - **Atualmente em Partida**
  - **Offline**
  - **Solicitações Recebidas** e **Solicitações Enviadas** (com opção de cancelar)
- Busca de jogadores por `@username`, visualização de perfil com estatísticas, remoção e bloqueio/desbloqueio.
- **Desafios entre amigos com configuração de partida**:
  - Escolha de **Ritmo de Recarga** (`Padrão`, `Rápido -20%`, `Tático +25%`), **Fragmentos Flux** (`Normal`, `Abundantes`, `Sem Fragmentos`) e **Duração** (`Sem limite`, `3 min`, `5 min`), validados no servidor.

### 6. Responsividade Completa (Desktop, Tablet e Mobile)
- Navegação superior no desktop e barra de navegação inferior adaptada para toque no celular (`<= 760px`).
- O guia do tutorial fica posicionado acima do tabuleiro, sem cobrir casas ou peças em nenhuma resolução.

## Configuração e Deploy (Render / Koyeb / Fly.io / Railway)

Variáveis de ambiente suportadas (ou via arquivo `.env`):

```env
PORT=8080
HOST=0.0.0.0
DATA_FILE=./data/db.json
RECONNECT_GRACE_SECONDS=45
```

- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Health Check:** `/api/health` (ou `/healthz`)
