# Crownflux.io

Crownflux.io é um jogo de estratégia em tempo real inspirado em xadrez, com modos locais e um backend para partidas 1v1 pela internet.

## Requisitos

- Node.js 20 ou superior.
- Conexão com a internet para instalar a dependência `ws` na primeira execução.

## Executar localmente

1. Extraia o ZIP.
2. Abra um terminal dentro da pasta `crownflux`.
3. Instale as dependências:

   ```bash
   npm install
   ```

4. Inicie o servidor:

   ```bash
   npm start
   ```

5. Abra `http://localhost:3000` no navegador.

O frontend e o backend são servidos pelo mesmo processo. Para testar o multiplayer com duas contas, abra o endereço em dois navegadores ou em dois dispositivos conectados ao mesmo servidor.

### Testar em outro dispositivo na mesma rede

Descubra o endereço IP local do computador que está executando o servidor e abra `http://IP-DO-COMPUTADOR:3000` no outro dispositivo. O firewall do computador precisa permitir conexões na porta 3000.

## O que está implementado

### Modos de jogo

- **Arena:** quatro facções, com três adversários controlados pelo jogo.
- **Duelo local:** dois jogadores no mesmo dispositivo.
- **Desafie a CPU:** duelo individual contra a CPU.
- **Duelo online:** partida 1v1 entre duas contas em dispositivos diferentes.

### Recursos online

- Cadastro e login com nome de usuário e senha.
- Senhas armazenadas com hash `scrypt`, não em texto puro.
- Sessões com token.
- Busca de jogadores pelo nome de usuário.
- Solicitações de amizade, aceitação, recusa e remoção.
- Bloqueio de jogadores.
- Status online/offline dos amigos.
- Desafios diretos entre amigos que estejam online.
- Matchmaking público 1v1.
- Salas privadas com código de seis caracteres.
- Sincronização em tempo real do tabuleiro, movimentos, capturas, energia, experiência e cronômetro.
- Validação dos movimentos e do Surto no servidor.
- Reconexão durante uma janela de tolerância configurável (padrão: 45 segundos).
- Estatísticas e histórico recente de partidas online.
- Pedido de revanche.

### Interface e responsividade

- Interface mais sóbria, com menos brilhos e gradientes.
- Tabuleiro com cores inspiradas em jogos de xadrez tradicionais.
- Layout adaptável para desktop, notebook, tablet e celular.
- Controles por toque no tabuleiro.
- Layout específico para telas estreitas e celulares na horizontal.

## Configuração

O servidor lê as seguintes variáveis de ambiente. Também é possível defini-las em um arquivo `.env` na raiz do projeto:

```env
PORT=3000
DATA_FILE=./data/db.json
RECONNECT_GRACE_SECONDS=45
```

- `PORT`: porta HTTP e WebSocket.
- `DATA_FILE`: local do arquivo de dados persistentes.
- `RECONNECT_GRACE_SECONDS`: tempo permitido para reconexão durante uma partida.

O diretório de dados é criado automaticamente. Faça backup de `data/db.json` regularmente.

## Verificação de sintaxe

```bash
npm run check
```

O endpoint `http://localhost:3000/api/health` informa se o servidor está ativo e mostra a quantidade de jogadores conectados e partidas em andamento.

## Publicar para jogar pela internet

Para que pessoas fora da sua rede local joguem, é necessário publicar **o servidor Node.js**, não somente o arquivo HTML.

1. Hospede a pasta do projeto em um serviço que execute Node.js 20 ou superior.
2. Configure o comando de instalação como `npm install` e o comando de inicialização como `npm start`.
3. Configure o serviço para manter um volume/disco persistente e defina `DATA_FILE` apontando para esse volume.
4. Disponibilize o site por HTTPS. O frontend escolhe automaticamente WebSocket seguro (`wss://`) quando a página está em HTTPS.
5. Configure o domínio e teste o endpoint `/api/health` e uma partida entre duas contas em redes diferentes.

## Limitações importantes desta versão

- O multiplayer pela internet implementado é **1v1**. A Arena de quatro facções continua sendo local contra bots; ela ainda não foi convertida para quatro jogadores online.
- Desafios diretos só podem ser enviados a amigos que estejam online. O convite expira após 60 segundos; não há fila de convites offline.
- O banco atual é um arquivo JSON persistente e foi pensado para uma primeira versão/single instance. Para uma comunidade maior, múltiplas instâncias ou alta concorrência, migre usuários, amizades e partidas para PostgreSQL e adicione uma camada compartilhada de presença/fila (por exemplo, Redis).
- As sessões ficam em memória no servidor. Se o processo reiniciar, o jogador precisará entrar novamente. O registro e o histórico permanecem no arquivo de dados.
- Não foram implementados espectadores, ranking Elo/temporadas, personalização de avatar ou chat entre jogadores.
- A publicação do servidor, o domínio, HTTPS e o armazenamento persistente precisam ser configurados no provedor escolhido. O código do projeto, sozinho, não cria uma hospedagem pública.

## Estrutura

```text
crownflux/
├── public/
│   └── index.html
├── data/
├── scripts/
│   └── check-client.mjs
├── server.mjs
├── package.json
├── .env.example
└── README.md
```
