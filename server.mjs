import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import fsSync from 'node:fs';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
try {
  const envText = fsSync.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !match[1].startsWith('#') && process.env[match[1]] === undefined) {
      const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
      process.env[match[1]] = value;
    }
  }
} catch {}
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = path.resolve(process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json'));
const PORT = Number(process.env.PORT || 3000);
const RECONNECT_GRACE_MS = Math.max(15, Number(process.env.RECONNECT_GRACE_SECONDS || 45)) * 1000;
const BOARD = 16;
const PIECE_VALUE = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 10 };
const PIECE_COOLDOWN = { P: .9, N: 1.4, B: 1.6, R: 1.8, Q: 2.2, K: 1.1 };
const ORTH = [[1,0],[-1,0],[0,1],[0,-1]];
const DIAG = [[1,1],[1,-1],[-1,1],[-1,-1]];
const KNIGHT = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
const LAYOUT = [[-2,'R'],[-1,'B'],[0,'K'],[1,'Q'],[2,'N']];
const TEAM = [
  { name: 'Azul', color: '#648fa8', forward: [0,-1], base: [8,14] },
  { name: 'Rubi', color: '#b96e72', forward: [0,1], base: [8,1] }
];

let db = { users: [], friendships: [], friendRequests: [], games: [] };
let saveChain = Promise.resolve();
const sessions = new Map();
const socketsByUser = new Map();
const queue = [];
const rooms = new Map();
const challenges = new Map();
const activeGames = new Map();
const socketRate = new WeakMap();
const loginAttempts = new Map();

async function loadDb() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    db = {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      friendships: Array.isArray(parsed.friendships) ? parsed.friendships : [],
      friendRequests: Array.isArray(parsed.friendRequests) ? parsed.friendRequests : [],
      games: Array.isArray(parsed.games) ? parsed.games : []
    };
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Não foi possível ler o banco local:', err);
    await persistDb();
  }
}
function persistDb() {
  const snapshot = JSON.stringify(db, null, 2);
  saveChain = saveChain.then(async () => {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    await fs.writeFile(tmp, snapshot, { mode: 0o600 });
    await fs.rename(tmp, DATA_FILE);
  }).catch(err => console.error('Falha ao persistir banco:', err));
  return saveChain;
}
function nowIso() { return new Date().toISOString(); }
function id() { return crypto.randomUUID(); }
function normalizeUsername(s) { return String(s || '').trim().replace(/^@/, '').toLowerCase(); }
function safeUser(user, includeStats = true) {
  if (!user) return null;
  const result = {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    avatar: user.avatar || '♟',
    createdAt: user.createdAt,
    online: isOnline(user.id)
  };
  if (includeStats) result.stats = { games: user.games || 0, wins: user.wins || 0, losses: user.losses || 0, draws: user.draws || 0 };
  return result;
}
function isOnline(uid) { return (socketsByUser.get(uid)?.size || 0) > 0; }
function socketsFor(uid) { return [...(socketsByUser.get(uid) || [])]; }
function send(ws, type, payload = {}) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...payload }));
}
function sendUser(uid, type, payload = {}) {
  for (const ws of socketsFor(uid)) send(ws, type, payload);
}
function sendError(ws, message, code = 'REQUEST_FAILED') { send(ws, 'error', { message, code }); }
function notifyPresence(uid, online) {
  const peers = new Set();
  for (const f of db.friendships) {
    if (f.a === uid) peers.add(f.b);
    if (f.b === uid) peers.add(f.a);
  }
  for (const peer of peers) sendUser(peer, 'presence:update', { userId: uid, online });
}
function makePair(a, b) { return [a, b].sort().join(':'); }
function areFriends(a, b) { return db.friendships.some(f => makePair(f.a, f.b) === makePair(a, b)); }
function isBlocked(a, b) { return db.users.some(u => u.id === a && (u.blocked || []).includes(b)) || db.users.some(u => u.id === b && (u.blocked || []).includes(a)); }
function friendPayload(uid) {
  return db.friendships
    .filter(f => f.a === uid || f.b === uid)
    .map(f => safeUser(db.users.find(u => u.id === (f.a === uid ? f.b : f.a))))
    .filter(Boolean)
    .sort((a,b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));
}
function requestsPayload(uid) {
  return db.friendRequests.filter(r => r.to === uid).map(r => ({ id: r.id, from: safeUser(db.users.find(u => u.id === r.from)) }));
}
function sessionUser(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const s = sessions.get(token);
  if (!s || s.expiresAt < Date.now()) return null;
  return db.users.find(u => u.id === s.uid) || null;
}
function createSession(user) {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { uid: user.id, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });
  return token;
}
function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function passwordMatches(password, user) {
  const actual = crypto.scryptSync(password, user.passwordSalt, 64);
  const expected = Buffer.from(user.passwordHash, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}
async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 24_000) throw new Error('Corpo da requisição muito grande.');
  }
  return raw ? JSON.parse(raw) : {};
}
function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
  res.end(body);
}
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, name: 'Crownflux.io', onlinePlayers: [...socketsByUser.values()].reduce((n, s) => n + (s.size ? 1 : 0), 0), activeMatches: activeGames.size });
  if (req.method === 'POST' && url.pathname === '/api/register') {
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'Dados inválidos.' }); }
    const username = String(body.username || '').trim();
    const key = normalizeUsername(username);
    const password = String(body.password || '');
    if (!/^[a-zA-Z0-9_]{3,18}$/.test(username)) return json(res, 400, { error: 'Use um nome de 3 a 18 caracteres: letras, números ou _.' });
    if (password.length < 8 || password.length > 100) return json(res, 400, { error: 'A senha precisa ter entre 8 e 100 caracteres.' });
    if (db.users.some(u => normalizeUsername(u.username) === key)) return json(res, 409, { error: 'Esse nome de usuário já está em uso.' });
    const pwd = passwordHash(password);
    const user = { id: id(), username, displayName: username, avatar: '♟', passwordSalt: pwd.salt, passwordHash: pwd.hash, createdAt: nowIso(), games: 0, wins: 0, losses: 0, draws: 0, blocked: [] };
    db.users.push(user); await persistDb();
    const token = createSession(user);
    return json(res, 201, { token, user: safeUser(user) });
  }
  if (req.method === 'POST' && url.pathname === '/api/login') {
    const ip=req.socket.remoteAddress||'unknown',attempt=loginAttempts.get(ip)||{count:0,until:0};
    if(attempt.until>Date.now()&&attempt.count>=12)return json(res,429,{error:'Muitas tentativas. Aguarde alguns minutos e tente novamente.'});
    if(attempt.until<Date.now()){attempt.count=0;attempt.until=Date.now()+10*60*1000;}
    attempt.count++;loginAttempts.set(ip,attempt);
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'Dados inválidos.' }); }
    const key = normalizeUsername(body.username);
    const user = db.users.find(u => normalizeUsername(u.username) === key);
    if (!user || !passwordMatches(String(body.password || ''), user)) return json(res, 401, { error: 'Usuário ou senha incorretos.' });
    loginAttempts.delete(ip);
    const token = createSession(user);
    return json(res, 200, { token, user: safeUser(user) });
  }
  if (req.method === 'GET' && url.pathname === '/api/me') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'Sessão expirada.' });
    return json(res, 200, { user: safeUser(user) });
  }
  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    sessions.delete(token);
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'Endpoint não encontrado.' });
}

function pieceMoves(game, p, attacks = false) {
  const result = [];
  const ok = (x,y) => x >= 0 && y >= 0 && x < BOARD && y < BOARD;
  const add = (x,y) => {
    if (!ok(x,y)) return false;
    const target = game.grid[y][x];
    if (target && target.owner === p.owner && !attacks) return false;
    result.push([x,y]);
    return !target;
  };
  const slide = dirs => {
    for (const [dx,dy] of dirs) {
      let x = p.x + dx, y = p.y + dy;
      while (add(x,y)) { x += dx; y += dy; }
    }
  };
  if (p.type === 'R' || p.type === 'Q') slide(ORTH);
  if (p.type === 'B' || p.type === 'Q') slide(DIAG);
  if (p.type === 'N') for (const [dx,dy] of KNIGHT) add(p.x+dx,p.y+dy);
  if (p.type === 'K') for (const [dx,dy] of [...ORTH,...DIAG]) add(p.x+dx,p.y+dy);
  if (p.type === 'P') {
    const [fx,fy] = TEAM[p.owner].forward;
    const x = p.x + fx, y = p.y + fy;
    if (!attacks && ok(x,y) && !game.grid[y][x]) result.push([x,y]);
    for (const side of [-1,1]) {
      const tx = p.x + (fx ? fx : side), ty = p.y + (fy ? fy : side);
      if (!ok(tx,ty)) continue;
      if (attacks) result.push([tx,ty]);
      else { const target = game.grid[ty][tx]; if (target && target.owner !== p.owner) result.push([tx,ty]); }
    }
  }
  return result;
}
function addPiece(game, type, owner, x, y) {
  const p = { id: game.nextPieceId++, type, owner, x, y, ready: game.T + 1, cooldown: 1, shield: 0 };
  game.grid[y][x] = p; game.pieces.push(p); return p;
}
function spawnArmy(game, owner) {
  const { base, forward } = TEAM[owner];
  const [bx,by] = base, [fx,fy] = forward, rx = -fy, ry = fx;
  const cells = LAYOUT.map(([off,type]) => [bx+rx*off, by+ry*off, type]);
  for (let off=-2; off<=2; off++) cells.push([bx+rx*off+fx, by+ry*off+fy, 'P']);
  if (game.grid[by][bx]) return false;
  for (const [x,y,type] of cells) if (x>=0 && y>=0 && x<BOARD && y<BOARD && !game.grid[y][x]) addPiece(game,type,owner,x,y);
  return true;
}
function spawnFood(game) {
  for (let k=0;k<50;k++) {
    const x=Math.floor(Math.random()*BOARD), y=Math.floor(Math.random()*BOARD);
    if (game.grid[y][x]) continue;
    const r=Math.random(), type=r<.78?'P':r<.88?'N':r<.95?'B':'R';
    const p=addPiece(game,type,-1,x,y);p.ready=0;return;
  }
}
function spawnOrb(game) {
  if (game.orbs.length>=5) return;
  for(let k=0;k<90;k++) {
    const x=Math.floor(Math.random()*BOARD), y=Math.floor(Math.random()*BOARD);
    if(game.grid[y][x] || game.orbs.some(o=>o.x===x&&o.y===y)) continue;
    game.orbs.push({x,y}); return;
  }
}
function addEvent(game, text) { game.events.unshift({ text, at: game.T }); game.events = game.events.slice(0,6); }
function removePiece(game,p) {
  if(game.grid[p.y]?.[p.x]===p) game.grid[p.y][p.x]=null;
  game.pieces=game.pieces.filter(x=>x!==p);
}
function levelNeed(team) { return 4 + team.level * 3; }
function spawnGrowth(game, owner) {
  const king=game.pieces.find(p=>p.owner===owner && p.type==='K'); if(!king) return;
  const types=['P','P','N','B','R','N','B','R','Q','Q'];
  const type=types[Math.min(game.teams[owner].level-1,types.length-1)];
  for(let radius=1;radius<=6;radius++) {
    const free=[];
    for(let dy=-radius;dy<=radius;dy++) for(let dx=-radius;dx<=radius;dx++) {
      if(Math.max(Math.abs(dx),Math.abs(dy))!==radius) continue;
      const x=king.x+dx,y=king.y+dy;
      if(x>=0&&y>=0&&x<BOARD&&y<BOARD&&!game.grid[y][x]) free.push([x,y]);
    }
    if(free.length) {
      const [x,y]=free[Math.floor(Math.random()*free.length)];
      const p=addPiece(game,type,owner,x,y);p.ready=game.T+.6;
      addEvent(game, `${TEAM[owner].name} recebeu um reforço: ${type}.`); return;
    }
  }
}
function award(game, owner, value) {
  if(owner<0) return;
  const team=game.teams[owner];team.score+=value;team.xp+=value;team.energy=Math.min(100,team.energy+value*9);team.captures++;
  while(team.xp>=levelNeed(team)) { team.xp-=levelNeed(team);team.level++;spawnGrowth(game,owner); }
}
function collectOrb(game,p) {
  const index=game.orbs.findIndex(o=>o.x===p.x&&o.y===p.y);
  if(index<0||p.owner<0)return;
  game.orbs.splice(index,1);award(game,p.owner,3);
  game.teams[p.owner].energy=Math.min(100,game.teams[p.owner].energy+24);
  addEvent(game,`${TEAM[p.owner].name} coletou um Fragmento Flux.`);
}
function finishGame(game, winner, reason) {
  if(game.over)return;
  game.over=true;game.winner=winner;game.reason=reason;game.endedAt=Date.now();
  const [a,b]=game.players.map(uid=>db.users.find(u=>u.id===uid));
  if(a&&b) {
    a.games=(a.games||0)+1;b.games=(b.games||0)+1;
    if(winner===0){a.wins=(a.wins||0)+1;b.losses=(b.losses||0)+1;}
    else if(winner===1){b.wins=(b.wins||0)+1;a.losses=(a.losses||0)+1;}
    else {a.draws=(a.draws||0)+1;b.draws=(b.draws||0)+1;}
    db.games.unshift({id:game.id,players:[a.id,b.id],winner,reason,duration:Math.floor(game.T),createdAt:nowIso(),scores:game.teams.map(t=>t.score)});
    db.games=db.games.slice(0,5000);
    persistDb();
    sendUser(a.id,'profile:stats',{user:safeUser(a)});sendUser(b.id,'profile:stats',{user:safeUser(b)});
  }
  addEvent(game, winner===null?'Partida empatada.':`${TEAM[winner].name} venceu a partida.`);
}
function serializeGame(game, side) {
  const opponentId=game.players[1-side];
  const opponent=db.users.find(u=>u.id===opponentId);
  return {
    gameId:game.id, side, opponent:opponent ? safeUser(opponent) : {username:'Adversário'},
    T:game.T, over:game.over, winner:game.winner, reason:game.reason || '',
    pieces:game.pieces.map(p=>({id:p.id,type:p.type,owner:p.owner,x:p.x,y:p.y,ready:p.ready,cd0:p.cooldown,shield:p.shield})),
    orbs:game.orbs.map(o=>({...o})),
    teams:game.teams.map(t=>({...t})),
    events:game.events.map(e=>({msg:e.text,t:e.at})),
    lastMove:game.lastMove ? {...game.lastMove} : null
  };
}
function publishGame(game, type='game:state') {
  for(let side=0;side<2;side++) sendUser(game.players[side],type,{state:serializeGame(game,side)});
}
function makeGame(room) {
  const game={id:id(),roomId:room.id,players:[...room.players],T:0,lastTick:Date.now(),lastBroadcast:0,
    grid:Array.from({length:BOARD},()=>Array(BOARD).fill(null)),pieces:[],orbs:[],teams:[0,1].map(id=>({id,score:0,xp:0,level:0,energy:18,boostUntil:0,captures:0,kings:0,alive:true})),
    nextPieceId:1,foodTimer:0,orbTimer:4.5,events:[],lastMove:null,over:false,winner:null,disconnects:new Map()};
  spawnArmy(game,0);spawnArmy(game,1);
  for(let i=0;i<18;i++)spawnFood(game);
  addEvent(game,'Duelo online iniciado. Boa partida!');
  return game;
}
function beginRoom(room) {
  if(room.players.length!==2 || room.gameId) return;
  const game=makeGame(room);room.gameId=game.id;activeGames.set(game.id,game);
  for(let side=0;side<2;side++) {
    sendUser(room.players[side],'game:started',{state:serializeGame(game,side),roomCode:room.code || null});
  }
}
function randomRoomCode() {
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code='';for(let i=0;i<6;i++)code+=alphabet[Math.floor(Math.random()*alphabet.length)];
  return code;
}
function createRoom(players, kind='private') {
  for(const player of players){const queued=queue.indexOf(player);if(queued>=0)queue.splice(queued,1);}
  const room={id:id(),code:kind==='private'?randomRoomCode():null,kind,players:[...players],createdAt:Date.now(),gameId:null};
  rooms.set(room.id,room);
  if(players.length===2) beginRoom(room);
  return room;
}
function findGameFor(uid) { return [...activeGames.values()].find(g=>g.players.includes(uid)&&!g.over); }
function gameForSocket(ws) {
  if(!ws.userId) return null;
  return findGameFor(ws.userId);
}
function handleMove(ws,msg) {
  const game=gameForSocket(ws);if(!game)return sendError(ws,'Você não está em uma partida ativa.','NO_GAME');
  const side=game.players.indexOf(ws.userId);
  const p=game.pieces.find(piece=>piece.id===Number(msg.pieceId));
  if(!p||p.owner!==side)return sendError(ws,'Você só pode mover suas próprias peças.','NOT_YOUR_PIECE');
  if(p.ready>game.T)return sendError(ws,'Essa peça ainda está se recuperando.','COOLDOWN');
  const x=Number(msg.x),y=Number(msg.y);
  if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=BOARD||y>=BOARD)return sendError(ws,'Destino inválido.','BAD_MOVE');
  if(!pieceMoves(game,p).some(([a,b])=>a===x&&b===y))return sendError(ws,'Movimento não permitido.','ILLEGAL_MOVE');
  const fromX=p.x,fromY=p.y,target=game.grid[y][x];
  if(target?.shield>0){target.shield--;addEvent(game,'Um escudo bloqueou o ataque.');publishGame(game);return;}
  if(target) {
    const owner=target.owner,value=PIECE_VALUE[target.type]||1;
    award(game,side,value);
    removePiece(game,target);
    if(target.type==='K'&&owner>=0) {
      game.teams[side].kings++;
      game.teams[owner].alive=false;
      finishGame(game,side,'O rei adversário foi capturado.');
    } else if(owner>=0) addEvent(game,`${TEAM[side].name} capturou uma peça de ${TEAM[owner].name}.`);
    else addEvent(game,`${TEAM[side].name} capturou uma peça neutra.`);
  }
  game.grid[p.y][p.x]=null;game.grid[y][x]=p;p.x=x;p.y=y;
  const distance=Math.max(Math.abs(x-fromX),Math.abs(y-fromY));
  let cooldown=PIECE_COOLDOWN[p.type]+(p.type==='N'?.25:distance*.12);
  if(game.teams[side].boostUntil>game.T)cooldown*=.58;
  p.cooldown=cooldown;p.ready=game.T+cooldown;
  game.lastMove={x0:fromX,y0:fromY,x1:x,y1:y,t:game.T};
  if(p.type==='P') {
    const [fx,fy]=TEAM[side].forward;
    if(x+fx<0||y+fy<0||x+fx>=BOARD||y+fy>=BOARD){p.type='Q';addEvent(game,'Promoção: um peão virou rainha.');}
  }
  collectOrb(game,p);
  publishGame(game);
}
function handleBoost(ws) {
  const game=gameForSocket(ws);if(!game)return sendError(ws,'Você não está em uma partida ativa.','NO_GAME');
  const side=game.players.indexOf(ws.userId),team=game.teams[side];
  if(team.energy<100)return sendError(ws,'Sua energia ainda não chegou a 100%.','NOT_READY');
  team.energy=0;team.boostUntil=game.T+6;
  for(const p of game.pieces)if(p.owner===side&&p.ready>game.T)p.ready=game.T+(p.ready-game.T)*.48;
  addEvent(game,`${TEAM[side].name} ativou Surto por 6 segundos.`);publishGame(game);
}
function startRematch(ws) {
  const old=gameForSocket(ws);
  const game=[...activeGames.values()].find(g=>g.players.includes(ws.userId)&&g.over);
  const target=game||old;
  if(!target)return sendError(ws,'Não há partida para revanche.','NO_GAME');
  const key=target.id;
  target.rematch ||= new Set();target.rematch.add(ws.userId);
  const other=target.players.find(u=>u!==ws.userId);
  sendUser(other,'game:rematch-request',{from:safeUser(db.users.find(u=>u.id===ws.userId))});
  send(ws,'game:rematch-waiting',{});
  if(target.rematch.size===2) {
    const room=createRoom(target.players,'rematch');
    sendUser(target.players[0],'game:rematch-started',{roomId:room.id});
    sendUser(target.players[1],'game:rematch-started',{roomId:room.id});
    activeGames.delete(key);
  }
}

function friendChanged(...uids) {
  for(const uid of new Set(uids)) sendUser(uid,'social:update',{friends:friendPayload(uid),requests:requestsPayload(uid)});
}
async function handleSocketMessage(ws,msg) {
  if(!ws.userId) {
    if(msg.type!=='auth')return sendError(ws,'Faça login para conectar.','AUTH_REQUIRED');
    const session=sessions.get(String(msg.token||''));
    if(!session||session.expiresAt<Date.now())return sendError(ws,'Sessão inválida. Entre novamente.','AUTH_EXPIRED');
    ws.userId=session.uid;
    const wasOnline=isOnline(ws.userId);
    if(!socketsByUser.has(ws.userId))socketsByUser.set(ws.userId,new Set());
    socketsByUser.get(ws.userId).add(ws);
    const user=db.users.find(u=>u.id===ws.userId);
    send(ws,'auth:ok',{user:safeUser(user),friends:friendPayload(ws.userId),requests:requestsPayload(ws.userId)});
    if(!wasOnline)notifyPresence(ws.userId,true);
    const active=findGameFor(ws.userId);
    if(active) {
      const side=active.players.indexOf(ws.userId);active.disconnects.delete(ws.userId);
      send(ws,'game:started',{state:serializeGame(active,side),reconnected:true});
      for(const peer of active.players)if(peer!==ws.userId)sendUser(peer,'game:connection',{userId:ws.userId,connected:true});
    }
    return;
  }
  const now=Date.now(),times=socketRate.get(ws)||[];
  const recent=times.filter(t=>now-t<10_000);recent.push(now);socketRate.set(ws,recent);
  if(recent.length>80)return sendError(ws,'Muitas ações em pouco tempo.','RATE_LIMIT');

  switch(msg.type) {
    case 'profile:search': {
      const q=normalizeUsername(msg.query);
      if(q.length<2)return send(ws,'profile:results',{users:[]});
      const users=db.users.filter(u=>u.id!==ws.userId&&normalizeUsername(u.username).includes(q)&&!isBlocked(ws.userId,u.id)).slice(0,10).map(u=>safeUser(u));
      send(ws,'profile:results',{users});break;
    }
    case 'friends:refresh': send(ws,'social:update',{friends:friendPayload(ws.userId),requests:requestsPayload(ws.userId)});break;
    case 'games:history': {
      const history=db.games.filter(g=>g.players.includes(ws.userId)).slice(0,15).map(g=>{
        const side=g.players.indexOf(ws.userId),opponent=db.users.find(u=>u.id===g.players[1-side]);
        return {id:g.id,opponent:opponent?.username||'jogador',result:g.winner===null?'Empate':g.winner===side?'Vitória':'Derrota',duration:g.duration,createdAt:g.createdAt};
      });
      send(ws,'games:history',{games:history});break;
    }
    case 'friend:request': {
      const target=db.users.find(u=>normalizeUsername(u.username)===normalizeUsername(msg.username));
      if(!target)return sendError(ws,'Jogador não encontrado.','USER_NOT_FOUND');
      if(target.id===ws.userId)return sendError(ws,'Você não pode adicionar a si mesmo.','SELF_FRIEND');
      if(isBlocked(ws.userId,target.id))return sendError(ws,'Não é possível enviar solicitação para esse jogador.','BLOCKED');
      if(areFriends(ws.userId,target.id))return sendError(ws,'Vocês já são amigos.','ALREADY_FRIENDS');
      if(db.friendRequests.some(r=>r.from===ws.userId&&r.to===target.id))return sendError(ws,'Solicitação já enviada.','REQUEST_EXISTS');
      const reverse=db.friendRequests.find(r=>r.from===target.id&&r.to===ws.userId);
      if(reverse) {
        db.friendRequests=db.friendRequests.filter(r=>r.id!==reverse.id);
        db.friendships.push({a:ws.userId,b:target.id,createdAt:nowIso()});await persistDb();friendChanged(ws.userId,target.id);
        send(ws,'notice',{message:'Solicitação recíproca aceita. Vocês agora são amigos.'});return;
      }
      const request={id:id(),from:ws.userId,to:target.id,createdAt:nowIso()};db.friendRequests.push(request);await persistDb();
      send(ws,'notice',{message:'Solicitação de amizade enviada.'});
      sendUser(target.id,'social:update',{friends:friendPayload(target.id),requests:requestsPayload(target.id)});
      sendUser(target.id,'notice',{message:`@${db.users.find(u=>u.id===ws.userId).username} enviou uma solicitação de amizade.`});break;
    }
    case 'friend:respond': {
      const request=db.friendRequests.find(r=>r.id===msg.requestId&&r.to===ws.userId);
      if(!request)return sendError(ws,'Essa solicitação não está mais disponível.','REQUEST_MISSING');
      db.friendRequests=db.friendRequests.filter(r=>r.id!==request.id);
      if(msg.accept===true&&!isBlocked(ws.userId,request.from))db.friendships.push({a:ws.userId,b:request.from,createdAt:nowIso()});
      await persistDb();friendChanged(ws.userId,request.from);
      sendUser(request.from,'notice',{message:msg.accept===true?'Sua solicitação de amizade foi aceita.':'Sua solicitação de amizade foi recusada.'});break;
    }
    case 'friend:remove': {
      const target=String(msg.userId||'');
      db.friendships=db.friendships.filter(f=>makePair(f.a,f.b)!==makePair(ws.userId,target));await persistDb();friendChanged(ws.userId,target);break;
    }
    case 'friend:block': {
      const target=String(msg.userId||''),user=db.users.find(u=>u.id===ws.userId);
      if(!db.users.some(u=>u.id===target))return sendError(ws,'Jogador não encontrado.');
      user.blocked ||= [];if(!user.blocked.includes(target))user.blocked.push(target);
      db.friendships=db.friendships.filter(f=>makePair(f.a,f.b)!==makePair(ws.userId,target));
      db.friendRequests=db.friendRequests.filter(r=>!((r.from===ws.userId&&r.to===target)||(r.from===target&&r.to===ws.userId)));
      await persistDb();friendChanged(ws.userId,target);send(ws,'notice',{message:'Jogador bloqueado.'});break;
    }
    case 'challenge:send': {
      const target=db.users.find(u=>u.id===String(msg.userId||''));
      if(!target)return sendError(ws,'Jogador não encontrado.');
      if(!areFriends(ws.userId,target.id))return sendError(ws,'Adicione esse jogador antes de desafiá-lo.','NOT_FRIENDS');
      if(!isOnline(target.id))return sendError(ws,'Esse amigo está offline no momento.','USER_OFFLINE');
      if(findGameFor(ws.userId)||findGameFor(target.id))return sendError(ws,'Um dos jogadores já está em uma partida.','IN_GAME');
      if([...challenges.values()].some(c=>c.from===ws.userId&&c.to===target.id))return sendError(ws,'Você já enviou um desafio para esse amigo.');
      const challenge={id:id(),from:ws.userId,to:target.id,expiresAt:Date.now()+60_000};challenges.set(challenge.id,challenge);
      sendUser(target.id,'challenge:incoming',{id:challenge.id,from:safeUser(db.users.find(u=>u.id===ws.userId)),expiresAt:challenge.expiresAt});
      send(ws,'notice',{message:`Desafio enviado para @${target.username}.`});break;
    }
    case 'challenge:respond': {
      const c=challenges.get(String(msg.challengeId||''));
      if(!c||c.to!==ws.userId||c.expiresAt<Date.now()){challenges.delete(String(msg.challengeId||''));return sendError(ws,'Esse desafio expirou ou não existe.');}
      challenges.delete(c.id);
      if(msg.accept!==true){sendUser(c.from,'challenge:declined',{by:safeUser(db.users.find(u=>u.id===ws.userId))});return send(ws,'notice',{message:'Desafio recusado.'});}
      if(!isOnline(c.from))return sendError(ws,'Quem enviou o desafio se desconectou.');
      if(findGameFor(c.from)||findGameFor(c.to))return sendError(ws,'Um dos jogadores já entrou em outra partida.');
      const room=createRoom([c.from,c.to],'challenge');
      sendUser(c.from,'challenge:accepted',{by:safeUser(db.users.find(u=>u.id===c.to))});
      sendUser(c.to,'notice',{message:'Desafio aceito. Preparando o duelo.'});break;
    }
    case 'match:queue': {
      if(findGameFor(ws.userId))return sendError(ws,'Você já está em uma partida.');
      if(!queue.includes(ws.userId))queue.push(ws.userId);
      const index=queue.findIndex(uid=>uid!==ws.userId&&isOnline(uid)&&!findGameFor(uid));
      if(index>=0){const other=queue.splice(index,1)[0];queue.splice(queue.indexOf(ws.userId),1);const room=createRoom([other,ws.userId],'public');}
      else send(ws,'match:waiting',{position:queue.length});break;
    }
    case 'match:cancel': {
      const i=queue.indexOf(ws.userId);if(i>=0)queue.splice(i,1);send(ws,'match:cancelled',{});break;
    }
    case 'room:create': {
      if(findGameFor(ws.userId))return sendError(ws,'Você já está em uma partida.');
      const room=createRoom([ws.userId],'private');send(ws,'room:created',{code:room.code,roomId:room.id});break;
    }
    case 'room:join': {
      if(findGameFor(ws.userId))return sendError(ws,'Você já está em uma partida.');
      const code=String(msg.code||'').trim().toUpperCase();
      const room=[...rooms.values()].find(r=>r.code===code&&r.kind==='private');
      if(!room)return sendError(ws,'Sala não encontrada. Confira o código.','ROOM_NOT_FOUND');
      if(room.players.length>=2)return sendError(ws,'Essa sala já está cheia.','ROOM_FULL');
      if(!isOnline(room.players[0])){rooms.delete(room.id);return sendError(ws,'O criador da sala está offline. Peça um novo código.','ROOM_HOST_OFFLINE');}
      if(room.players.includes(ws.userId))return sendError(ws,'Você já está nessa sala.');
      room.players.push(ws.userId);beginRoom(room);break;
    }
    case 'game:move': handleMove(ws,msg);break;
    case 'game:boost': handleBoost(ws);break;
    case 'game:resign': {
      const game=gameForSocket(ws);if(!game)return sendError(ws,'Você não está em uma partida.');
      finishGame(game,1-game.players.indexOf(ws.userId),'O jogador abandonou a partida.');publishGame(game,'game:ended');break;
    }
    case 'game:rematch': startRematch(ws);break;
    default: sendError(ws,'Ação desconhecida.','UNKNOWN_ACTION');
  }
}

function tickGames() {
  const now=Date.now();
  for(const [gameId,game] of activeGames) {
    if(game.over){if(now-(game.endedAt||now)>30*60*1000)activeGames.delete(gameId);continue;}
    const dt=Math.min(.25,Math.max(0,(now-game.lastTick)/1000));game.lastTick=now;game.T+=dt;
    game.foodTimer-=dt;if(game.foodTimer<=0){game.foodTimer=1.1;if(game.pieces.filter(p=>p.owner===-1).length<34)spawnFood(game);}
    game.orbTimer-=dt;if(game.orbTimer<=0){game.orbTimer=7+Math.random()*2;spawnOrb(game);}
    for(const [uid,disconnectedAt] of game.disconnects) {
      if(now-disconnectedAt>RECONNECT_GRACE_MS){
        const winner=1-game.players.indexOf(uid);finishGame(game,winner,'O adversário perdeu a conexão.');
        publishGame(game,'game:ended');break;
      }
    }
    if(now-game.lastBroadcast>=160){game.lastBroadcast=now;publishGame(game);}
  }
  for(const [cid,c] of challenges) if(c.expiresAt<now){challenges.delete(cid);sendUser(c.from,'challenge:expired',{id:cid});sendUser(c.to,'challenge:expired',{id:cid});}
  for(const [token,s] of sessions) if(s.expiresAt<now)sessions.delete(token);
}

const server = http.createServer(async (req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')) {
    try { await handleApi(req,res,url); } catch(err) { console.error(err);if(!res.headersSent)json(res,500,{error:'Erro interno do servidor.'}); }
    return;
  }
  let pathname=decodeURIComponent(url.pathname);
  if(pathname==='/')pathname='/index.html';
  const file=path.resolve(PUBLIC_DIR,'.'+pathname);
  if(!file.startsWith(PUBLIC_DIR+path.sep)&&file!==PUBLIC_DIR)return json(res,403,{error:'Acesso negado.'});
  try {
    const data=await fs.readFile(file);
    res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream','cache-control':path.extname(file)==='.html'?'no-cache':'public, max-age=3600'});
    res.end(data);
  } catch { res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('Not found'); }
});
const wss=new WebSocketServer({noServer:true,maxPayload:64*1024});
server.on('upgrade',(req,socket,head)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname!=='/ws'){socket.destroy();return;}
  const origin=req.headers.origin;
  if(origin){try{if(new URL(origin).host!==req.headers.host){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}}catch{socket.destroy();return;}}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});
wss.on('connection',ws=>{
  ws.isAlive=true;
  ws.on('error',err=>console.error('WebSocket client error:',err.message));
  ws.on('pong',()=>{ws.isAlive=true;});
  ws.on('message',raw=>{
    let msg;try{msg=JSON.parse(raw.toString());}catch{return sendError(ws,'Mensagem inválida.');}
    if(!msg||typeof msg.type!=='string')return sendError(ws,'Formato de mensagem inválido.');
    Promise.resolve(handleSocketMessage(ws,msg)).catch(err=>{console.error('WebSocket action failed:',err);sendError(ws,'Não foi possível concluir essa ação.');});
  });
  ws.on('close',()=>{
    const uid=ws.userId;if(!uid)return;
    const set=socketsByUser.get(uid);if(set){set.delete(ws);if(set.size===0)socketsByUser.delete(uid);}
    if(!isOnline(uid)){
      notifyPresence(uid,false);
      const i=queue.indexOf(uid);if(i>=0)queue.splice(i,1);
      const game=findGameFor(uid);
      if(game){game.disconnects.set(uid,Date.now());for(const peer of game.players)if(peer!==uid)sendUser(peer,'game:connection',{userId:uid,connected:false,graceSeconds:Math.floor(RECONNECT_GRACE_MS/1000)});}
      for(const [roomId,room] of rooms){if(room.players.includes(uid)&&!room.gameId)rooms.delete(roomId);}
    }
  });
});
const heartbeat=setInterval(()=>{
  for(const ws of wss.clients){if(ws.isAlive===false){ws.terminate();continue;}ws.isAlive=false;ws.ping();}
},30_000);
setInterval(tickGames,100);

await loadDb();
server.listen(PORT,'0.0.0.0',()=>console.log(`Crownflux.io disponível em http://localhost:${PORT}`));
process.on('SIGINT',()=>{clearInterval(heartbeat);server.close(()=>process.exit(0));});
process.on('SIGTERM',()=>{clearInterval(heartbeat);server.close(()=>process.exit(0));});
