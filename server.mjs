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

const DIST_DIR = path.join(__dirname, 'dist');
const PUBLIC_DIR = fsSync.existsSync(path.join(DIST_DIR, 'index.html'))
  ? DIST_DIR
  : fsSync.existsSync(path.join(__dirname, 'public', 'index.html'))
    ? path.join(__dirname, 'public')
    : __dirname;
const DATA_FILE = path.resolve(process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json'));
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const RECONNECT_GRACE_MS = Math.max(15, Number(process.env.RECONNECT_GRACE_SECONDS || 45)) * 1000;

const BOARD = 16;
const PIECE_VALUE = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 10 };
const PIECE_COOLDOWN = { P: 0.9, N: 1.4, B: 1.6, R: 1.8, Q: 2.2, K: 1.1 };
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const LAYOUT = [[-2, 'R'], [-1, 'B'], [0, 'K'], [1, 'Q'], [2, 'N']];
const TEAM = [
  { name: 'Azul', color: '#648fa8', forward: [0, -1], base: [8, 14] },
  { name: 'Rubi', color: '#b96e72', forward: [0, 1], base: [8, 1] }
];
const ALLOWED_AVATARS = ['♟', '♞', '♝', '♜', '♛', '♚', '⚔', '🛡', '👑', '⚡', '🔥', '💎'];
const DEFAULT_PREFERENCES = {
  boardTheme: 'imperial',
  pieceStyle: 'medallion',
  doctrine: 'vanguard',
  showCoords: true,
  highlightMoves: true,
  autoQueueMove: true,
  confirmResign: true,
  soundEffects: true,
  reducedMotion: false
};

const STRATEGIC_ZONES = [
  { id: 'sanctuary', name: 'Santuário de Fluxo', x0: 2, y0: 7, x1: 3, y1: 8 },
  { id: 'throne', name: 'Trono Imperial', x0: 7, y0: 7, x1: 8, y1: 8 },
  { id: 'fortress', name: 'Fortaleza Real', x0: 12, y0: 7, x1: 13, y1: 8 }
];

const ACHIEVEMENTS_CATALOG = [
  { id: 'first_blood', name: 'Primeira Vitória', icon: '⚔️', desc: 'Vença sua primeira partida no modo principal.' },
  { id: 'crown_sovereign', name: 'Soberano da Coroa', icon: '👑', desc: 'Vença alcançando 100% de Domínio da Coroa.' },
  { id: 'regicide', name: 'Regicida', icon: '♚', desc: 'Vença capturando diretamente o Rei adversário.' },
  { id: 'tactician', name: 'Mestre do Fluxo', icon: '⚡', desc: 'Utilize habilidades táticas de Fluxo em combate.' },
  { id: 'comeback_king', name: 'Virada Imperial', icon: '🔥', desc: 'Vença após o rival ultrapassar 50% de Domínio da Coroa.' },
  { id: 'veteran_10', name: 'Veterano da Arena', icon: '🛡️', desc: 'Dispute 10 partidas completas no Crownflux.io.' },
  { id: 'cpu_slayer', name: 'Desafiante Supremo', icon: '💎', desc: 'Vença a CPU na dificuldade Difícil ou Especialista.' }
];

function getCrownfluxDivision(rating = 1200) {
  const r = Number(rating) || 1200;
  if (r >= 1800) return { name: 'Mestre da Coroa', icon: '👑', tier: 6 };
  if (r >= 1600) return { name: 'Diamante', icon: '💎', tier: 5 };
  if (r >= 1450) return { name: 'Platina', icon: '⚜️', tier: 4 };
  if (r >= 1300) return { name: 'Ouro', icon: '🏆', tier: 3 };
  if (r >= 1150) return { name: 'Prata', icon: '🛡️', tier: 2 };
  return { name: 'Bronze', icon: '⚔️', tier: 1 };
}

function unlockAchievement(user, achId) {
  if (!user) return false;
  user.achievements = Array.isArray(user.achievements) ? user.achievements : [];
  if (!user.achievements.includes(achId)) {
    user.achievements.push(achId);
    return true;
  }
  return false;
}

let db = { users: [], friendships: [], friendRequests: [], games: [], sessions: [] };
let saveChain = Promise.resolve();
const sessions = new Map(); // tokenHash -> { tokenHash, uid, expiresAt, rememberMe, createdAt }
const socketsByUser = new Map();
const queue = [];
const classicQueue = [];
const tacticalQueue = [];
const rooms = new Map();
const challenges = new Map();
const activeGames = new Map();
const socketRate = new WeakMap();
const loginAttempts = new Map();

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

async function loadDb() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const now = Date.now();
    db = {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      friendships: Array.isArray(parsed.friendships) ? parsed.friendships : [],
      friendRequests: Array.isArray(parsed.friendRequests) ? parsed.friendRequests : [],
      games: Array.isArray(parsed.games) ? parsed.games : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions.filter(s => s && s.expiresAt > now) : []
    };
    sessions.clear();
    for (const s of db.sessions) {
      if (s.tokenHash && s.uid && s.expiresAt > now) {
        sessions.set(s.tokenHash, s);
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Não foi possível ler o banco local:', err);
    await persistDb();
  }
}

function syncSessionsToDb() {
  const now = Date.now();
  for (const [k, s] of sessions) {
    if (!s || s.expiresAt < now) sessions.delete(k);
  }
  db.sessions = [...sessions.values()];
}

function persistDb() {
  syncSessionsToDb();
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

function sanitizePreferences(raw, current = DEFAULT_PREFERENCES) {
  const base = { ...DEFAULT_PREFERENCES, ...(current || {}) };
  if (!raw || typeof raw !== 'object') return base;
  const themes = ['classic', 'slate', 'wood', 'imperial'];
  if (themes.includes(raw.boardTheme)) base.boardTheme = raw.boardTheme;
  const pieceStyles = ['medallion', 'heraldic', 'minimal'];
  if (pieceStyles.includes(raw.pieceStyle)) base.pieceStyle = raw.pieceStyle;
  const doctrines = ['vanguard', 'bastion', 'celerity'];
  if (doctrines.includes(raw.doctrine)) base.doctrine = raw.doctrine;
  for (const key of ['showCoords', 'highlightMoves', 'autoQueueMove', 'confirmResign', 'soundEffects', 'reducedMotion']) {
    if (typeof raw[key] === 'boolean') base[key] = raw[key];
  }
  return base;
}

function isOnline(uid) { return (socketsByUser.get(uid)?.size || 0) > 0; }
function findGameFor(uid) { return [...activeGames.values()].find(g => g.players.includes(uid) && !g.over); }
function userAvailability(uid) {
  if (!isOnline(uid)) return { online: false, inGame: false, status: 'offline', statusLabel: 'Offline' };
  const active = findGameFor(uid);
  if (active) return { online: true, inGame: true, status: 'in_game', statusLabel: 'Em partida' };
  return { online: true, inGame: false, status: 'online', statusLabel: 'Disponível' };
}

function safeUser(user, includeStats = true, includePrivate = false) {
  if (!user) return null;
  const avail = userAvailability(user.id);
  const result = {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    avatar: ALLOWED_AVATARS.includes(user.avatar) ? user.avatar : '♟',
    bio: user.bio || '',
    createdAt: user.createdAt,
    online: avail.online,
    inGame: avail.inGame,
    status: avail.status,
    statusLabel: avail.statusLabel
  };
  if (includeStats) {
    const cpuStats = user.cpuStats || { games: 0, wins: 0, highestDifficultyWon: 0 };
    const cfRating = Number(user.crownfluxRating) || 1200;
    const division = getCrownfluxDivision(cfRating);
    result.stats = {
      games: user.games || 0,
      wins: user.wins || 0,
      losses: user.losses || 0,
      draws: user.draws || 0,
      cpuGames: cpuStats.games || 0,
      cpuWins: cpuStats.wins || 0,
      highestCpuLevel: cpuStats.highestDifficultyWon || 0,
      crownWins: user.crownWins || 0,
      regicideWins: user.regicideWins || 0,
      skillsUsed: user.skillsUsed || 0,
      crownfluxRating: cfRating,
      crownfluxDivision: division.name,
      crownfluxDivisionIcon: division.icon,
      achievements: Array.isArray(user.achievements) ? user.achievements : [],
      classicRatings: { bullet: 1200, blitz: 1200, rapid: 1200, classic: 1200, ...(user.classicRatings || {}) }
    };
  }
  if (includePrivate) {
    result.preferences = sanitizePreferences(user.preferences);
    result.tutorialCompleted = Boolean(user.tutorialCompleted);
    result.tutorialPromptState = user.tutorialPromptState || 'pending';
    result.hasRecoveryKey = Boolean(user.recoveryHash);
    result.blocked = (user.blocked || []).map(bid => {
      const bu = db.users.find(x => x.id === bid);
      return bu ? { id: bu.id, username: bu.username, displayName: bu.displayName || bu.username, avatar: bu.avatar || '♟' } : null;
    }).filter(Boolean);
  }
  return result;
}

function socketsFor(uid) { return [...(socketsByUser.get(uid) || [])]; }
function send(ws, type, payload = {}) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...payload }));
}
function sendUser(uid, type, payload = {}) {
  for (const ws of socketsFor(uid)) send(ws, type, payload);
}
function sendError(ws, message, code = 'REQUEST_FAILED') { send(ws, 'error', { message, code }); }

function notifyPresence(uid) {
  const peers = new Set();
  for (const f of db.friendships) {
    if (f.a === uid) peers.add(f.b);
    if (f.b === uid) peers.add(f.a);
  }
  const avail = userAvailability(uid);
  for (const peer of peers) {
    sendUser(peer, 'presence:update', {
      userId: uid,
      online: avail.online,
      inGame: avail.inGame,
      status: avail.status,
      statusLabel: avail.statusLabel
    });
  }
}

function makePair(a, b) { return [a, b].sort().join(':'); }
function areFriends(a, b) { return db.friendships.some(f => makePair(f.a, f.b) === makePair(a, b)); }
function isBlocked(a, b) {
  return db.users.some(u => u.id === a && (u.blocked || []).includes(b)) ||
         db.users.some(u => u.id === b && (u.blocked || []).includes(a));
}

function friendPayload(uid) {
  const orderRank = { online: 0, in_game: 1, offline: 2 };
  return db.friendships
    .filter(f => f.a === uid || f.b === uid)
    .map(f => safeUser(db.users.find(u => u.id === (f.a === uid ? f.b : f.a))))
    .filter(Boolean)
    .sort((a, b) => (orderRank[a.status] ?? 2) - (orderRank[b.status] ?? 2) || a.username.localeCompare(b.username));
}

function requestsPayload(uid) {
  return db.friendRequests
    .filter(r => r.to === uid)
    .map(r => ({
      id: r.id,
      createdAt: r.createdAt,
      from: safeUser(db.users.find(u => u.id === r.from))
    }))
    .filter(r => r.from);
}

function sentRequestsPayload(uid) {
  return db.friendRequests
    .filter(r => r.from === uid)
    .map(r => ({
      id: r.id,
      createdAt: r.createdAt,
      to: safeUser(db.users.find(u => u.id === r.to))
    }))
    .filter(r => r.to);
}

function userHistoryPayload(uid, limit = 25) {
  return db.games
    .filter(g => Array.isArray(g.players) && g.players.includes(uid))
    .slice(0, limit)
    .map(g => {
      const side = g.players.indexOf(uid);
      const otherId = g.players[1 - side];
      const opponentUser = db.users.find(u => u.id === otherId);
      const opponentName = g.opponentName || opponentUser?.displayName || opponentUser?.username || 'Adversário';
      const opponentUsername = opponentUser?.username || g.opponentUsername || opponentName;
      const result = g.winner === null ? 'Empate' : g.winner === side ? 'Vitória' : 'Derrota';
      return {
        id: g.id,
        mode: g.mode || 'online',
        difficulty: g.difficulty || null,
        opponent: opponentName,
        opponentUsername,
        result,
        reason: g.reason || '',
        duration: g.duration || 0,
        createdAt: g.createdAt,
        scores: Array.isArray(g.scores) ? [g.scores[side] ?? 0, g.scores[1 - side] ?? 0] : [0, 0],
        options: g.options || null
      };
    });
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function extractRequestToken(req) {
  const auth = String(req.headers.authorization || '');
  if (/^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, '').trim();
  }
  const cookies = parseCookies(req);
  return cookies.cf_session || '';
}

function sessionFromToken(rawToken) {
  if (!rawToken) return null;
  const th = hashToken(rawToken);
  const s = sessions.get(th) || sessions.get(rawToken);
  if (!s || s.expiresAt < Date.now()) {
    sessions.delete(th);
    sessions.delete(rawToken);
    return null;
  }
  return s;
}

function sessionUser(req) {
  const token = extractRequestToken(req);
  const s = sessionFromToken(token);
  if (!s) return null;
  return db.users.find(u => u.id === s.uid) || null;
}

function createSession(user, rememberMe = true) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const ttlMs = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const record = {
    tokenHash,
    uid: user.id,
    rememberMe: Boolean(rememberMe),
    createdAt: nowIso(),
    expiresAt: Date.now() + ttlMs
  };
  sessions.set(tokenHash, record);
  return { token, ttlSeconds: Math.floor(ttlMs / 1000) };
}

function makeSessionCookie(token, maxAgeSeconds) {
  const parts = [`cf_session=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (typeof maxAgeSeconds === 'number') parts.push(`Max-Age=${maxAgeSeconds}`);
  return parts.join('; ');
}

function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return { salt, hash, algo: 'scrypt-n16384-r8-p1' };
}

function passwordMatches(password, user) {
  if (!user || !user.passwordSalt || !user.passwordHash) return false;
  const actual = crypto.scryptSync(password, user.passwordSalt, 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(user.passwordHash, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}

function generateRecoveryKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const group = () => Array.from({ length: 4 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  return `CFX-${group()}-${group()}`;
}

function normalizeRecoveryKey(raw) {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
}

function hashRecoveryKey(key, salt = crypto.randomBytes(16).toString('hex')) {
  const normalized = normalizeRecoveryKey(key);
  const hash = crypto.scryptSync(normalized, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return { salt, hash };
}

function recoveryKeyMatches(key, user) {
  if (!user || !user.recoverySalt || !user.recoveryHash) return false;
  const normalized = normalizeRecoveryKey(key);
  const actual = crypto.scryptSync(normalized, user.recoverySalt, 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(user.recoveryHash, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 32_000) throw new Error('Corpo da requisição muito grande.');
  }
  return raw ? JSON.parse(raw) : {};
}

function json(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
}

function checkRateLimit(ip, bucket = 'auth', maxCount = 14) {
  const key = `${bucket}:${ip || 'unknown'}`;
  const attempt = loginAttempts.get(key) || { count: 0, until: 0 };
  if (attempt.until > Date.now() && attempt.count >= maxCount) {
    return false;
  }
  if (attempt.until < Date.now()) {
    attempt.count = 0;
    attempt.until = Date.now() + 10 * 60 * 1000;
  }
  attempt.count++;
  loginAttempts.set(key, attempt);
  return true;
}

function clearRateLimit(ip, bucket = 'auth') {
  loginAttempts.delete(`${bucket}:${ip || 'unknown'}`);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon'
};

function sanitizeMatchOptions(raw = {}) {
  const paceValues = ['standard', 'fast', 'tactical'];
  const orbValues = ['normal', 'abundant', 'none'];
  const timeValues = [0, 180, 300];
  const modeValues = ['realtime', 'tactical_draft', 'classic'];
  const pace = paceValues.includes(raw?.pace) ? raw.pace : 'standard';
  const orbs = orbValues.includes(raw?.orbs) ? raw.orbs : 'normal';
  const timeLimit = timeValues.includes(Number(raw?.timeLimit)) ? Number(raw.timeLimit) : 0;
  const mode = modeValues.includes(raw?.mode) ? raw.mode : 'realtime';
  const controls = {
    bullet1: { category: 'bullet', seconds: 60, increment: 0, label: 'Bullet · 1+0' },
    bullet2: { category: 'bullet', seconds: 120, increment: 1, label: 'Bullet · 2+1' },
    blitz3: { category: 'blitz', seconds: 180, increment: 0, label: 'Blitz · 3+0' },
    blitz5: { category: 'blitz', seconds: 300, increment: 0, label: 'Blitz · 5+0' },
    rapid10: { category: 'rapid', seconds: 600, increment: 0, label: 'Rapid · 10+0' },
    rapid15: { category: 'rapid', seconds: 900, increment: 10, label: 'Rapid · 15+10' },
    classic30: { category: 'classic', seconds: 1800, increment: 0, label: 'Clássico · 30+0' },
    classic60: { category: 'classic', seconds: 3600, increment: 0, label: 'Clássico · 60+0' }
  };
  const timeControl = Object.hasOwn(controls, raw?.timeControl) ? raw.timeControl : 'blitz3';
  return { pace, orbs, timeLimit, mode, timeControl, ...controls[timeControl] };
}

function formatMatchOptionsSummary(opts = {}) {
  const o = sanitizeMatchOptions(opts);
  if (o.mode === 'tactical_draft') return 'Cerco Tático · Draft de Cartas · Turnos';
  if (o.mode === 'classic') return `Xadrez Clássico · ${o.label}`;
  const paceLabel = o.pace === 'fast' ? 'Ritmo Rápido' : o.pace === 'tactical' ? 'Ritmo Tático' : 'Ritmo Padrão';
  const orbsLabel = o.orbs === 'abundant' ? 'Muitos Fragmentos' : o.orbs === 'none' ? 'Sem Fragmentos' : 'Fragmentos Normais';
  const timeLabel = o.timeLimit === 180 ? '3 min' : o.timeLimit === 300 ? '5 min' : 'Sem limite de tempo';
  return `${paceLabel} · ${orbsLabel} · ${timeLabel}`;
}

async function handleApi(req, res, url) {
  const ip = req.socket.remoteAddress || 'unknown';

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, {
      ok: true,
      name: 'Crownflux.io',
      onlinePlayers: [...socketsByUser.values()].reduce((n, s) => n + (s.size ? 1 : 0), 0),
      activeMatches: activeGames.size
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/register') {
    if (!checkRateLimit(ip, 'register', 10)) {
      return json(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
    }
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'Dados inválidos.' }); }
    const username = String(body.username || '').trim();
    const displayName = String(body.displayName || username).trim().slice(0, 24) || username;
    const avatar = ALLOWED_AVATARS.includes(body.avatar) ? body.avatar : '♟';
    const key = normalizeUsername(username);
    const password = String(body.password || '');
    const rememberMe = body.rememberMe !== false;

    if (!/^[a-zA-Z0-9_]{3,18}$/.test(username)) {
      return json(res, 400, { error: 'Use um nome de usuário de 3 a 18 caracteres: letras, números ou _.' });
    }
    if (password.length < 8 || password.length > 100) {
      return json(res, 400, { error: 'A senha precisa ter entre 8 e 100 caracteres.' });
    }
    if (db.users.some(u => normalizeUsername(u.username) === key)) {
      return json(res, 409, { error: 'Esse nome de usuário já está em uso.' });
    }

    const pwd = passwordHash(password);
    const recoveryKey = generateRecoveryKey();
    const rec = hashRecoveryKey(recoveryKey);
    const user = {
      id: id(),
      username,
      displayName,
      avatar,
      bio: '',
      passwordSalt: pwd.salt,
      passwordHash: pwd.hash,
      passwordAlgo: pwd.algo,
      recoverySalt: rec.salt,
      recoveryHash: rec.hash,
      createdAt: nowIso(),
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      cpuStats: { games: 0, wins: 0, highestDifficultyWon: 0 },
      tutorialCompleted: Boolean(body.tutorialCompleted),
      tutorialPromptState: body.tutorialPromptState || 'pending',
      preferences: sanitizePreferences(body.preferences),
      blocked: []
    };
    db.users.push(user);
    const { token, ttlSeconds } = createSession(user, rememberMe);
    await persistDb();
    clearRateLimit(ip, 'register');
    return json(
      res,
      201,
      {
        token,
        recoveryKey,
        user: safeUser(user, true, true),
        friends: [],
        requests: [],
        sentRequests: [],
        games: []
      },
      { 'set-cookie': makeSessionCookie(token, rememberMe ? ttlSeconds : undefined) }
    );
  }

  if (req.method === 'POST' && url.pathname === '/api/login') {
    if (!checkRateLimit(ip, 'login', 12)) {
      return json(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
    }
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'Dados inválidos.' }); }
    const key = normalizeUsername(body.username);
    const user = db.users.find(u => normalizeUsername(u.username) === key);
    if (!user || !passwordMatches(String(body.password || ''), user)) {
      return json(res, 401, { error: 'Usuário ou senha incorretos.' });
    }
    clearRateLimit(ip, 'login');
    const rememberMe = body.rememberMe !== false;
    const { token, ttlSeconds } = createSession(user, rememberMe);
    await persistDb();
    return json(
      res,
      200,
      {
        token,
        user: safeUser(user, true, true),
        friends: friendPayload(user.id),
        requests: requestsPayload(user.id),
        sentRequests: sentRequestsPayload(user.id),
        games: userHistoryPayload(user.id)
      },
      { 'set-cookie': makeSessionCookie(token, rememberMe ? ttlSeconds : undefined) }
    );
  }

  if (req.method === 'GET' && url.pathname === '/api/me') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'Sessão expirada.' });
    return json(res, 200, {
      user: safeUser(user, true, true),
      friends: friendPayload(user.id),
      requests: requestsPayload(user.id),
      sentRequests: sentRequestsPayload(user.id),
      games: userHistoryPayload(user.id)
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const token = extractRequestToken(req);
    if (token) {
      sessions.delete(hashToken(token));
      sessions.delete(token);
      await persistDb();
    }
    return json(res, 200, { ok: true }, { 'set-cookie': makeSessionCookie('', 0) });
  }

  if (req.method === 'POST' && url.pathname === '/api/profile/update') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'Sessão expirada.' });
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'Dados inválidos.' }); }

    if (body.username !== undefined) {
      const nextUsername = String(body.username || '').trim();
      if (!/^[a-zA-Z0-9_]{3,18}$/.test(nextUsername)) {
        return json(res, 400, { error: 'O nome de usuário deve ter de 3 a 18 caracteres (letras, números ou _).' });
      }
      const key = normalizeUsername(nextUsername);
      if (db.users.some(u => u.id !== user.id && normalizeUsername(u.username) === key)) {
        return json(res, 409, { error: 'Esse nome de usuário já está em uso por outro jogador.' });
      }
      user.username = nextUsername;
    }
    if (body.displayName !== undefined) {
      const dn = String(body.displayName || '').trim().slice(0, 24);
      user.displayName = dn || user.username;
    }
    if (body.avatar !== undefined) {
      if (!ALLOWED_AVATARS.includes(body.avatar)) {
        return json(res, 400, { error: 'Avatar selecionado inválido.' });
      }
      user.avatar = body.avatar;
    }
    if (body.bio !== undefined) {
      user.bio = String(body.bio || '').trim().slice(0, 120);
    }

    await persistDb();
    const peers = db.friendships
      .filter(f => f.a === user.id || f.b === user.id)
      .map(f => (f.a === user.id ? f.b : f.a));
    friendChanged(user.id, ...peers);
    return json(res, 200, { ok: true, user: safeUser(user, true, true) });
  }

  if (req.method === 'POST' && url.pathname === '/api/profile/password') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'Sessão expirada.' });
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'Dados inválidos.' }); }
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');
    if (!passwordMatches(currentPassword, user)) {
      return json(res, 401, { error: 'A senha atual está incorreta.' });
    }
    if (newPassword.length < 8 || newPassword.length > 100) {
      return json(res, 400, { error: 'A nova senha precisa ter entre 8 e 100 caracteres.' });
    }
    const pwd = passwordHash(newPassword);
    user.passwordSalt = pwd.salt;
    user.passwordHash = pwd.hash;
    user.passwordAlgo = pwd.algo;

    const currentTokenHash = hashToken(extractRequestToken(req));
    for (const [k, s] of sessions) {
      if (s.uid === user.id && k !== currentTokenHash) sessions.delete(k);
    }
    await persistDb();
    return json(res, 200, { ok: true, message: 'Sua senha foi atualizada com sucesso.' });
  }

  if (req.method === 'POST' && url.pathname === '/api/profile/recovery-key') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'Sessão expirada.' });
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'Dados inválidos.' }); }
    if (!passwordMatches(String(body.currentPassword || ''), user)) {
      return json(res, 401, { error: 'Confirme sua senha atual para gerar um novo código de recuperação.' });
    }
    const recoveryKey = generateRecoveryKey();
    const rec = hashRecoveryKey(recoveryKey);
    user.recoverySalt = rec.salt;
    user.recoveryHash = rec.hash;
    await persistDb();
    return json(res, 200, { ok: true, recoveryKey, user: safeUser(user, true, true) });
  }

  if (req.method === 'POST' && url.pathname === '/api/password/reset') {
    if (!checkRateLimit(ip, 'reset', 8)) {
      return json(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
    }
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'Dados inválidos.' }); }
    const key = normalizeUsername(body.username);
    const recoveryKey = String(body.recoveryKey || '');
    const newPassword = String(body.newPassword || '');
    const user = db.users.find(u => normalizeUsername(u.username) === key);
    if (!user || !recoveryKeyMatches(recoveryKey, user)) {
      return json(res, 401, { error: 'Usuário ou código de recuperação inválido.' });
    }
    if (newPassword.length < 8 || newPassword.length > 100) {
      return json(res, 400, { error: 'A nova senha precisa ter entre 8 e 100 caracteres.' });
    }
    const pwd = passwordHash(newPassword);
    user.passwordSalt = pwd.salt;
    user.passwordHash = pwd.hash;
    user.passwordAlgo = pwd.algo;
    for (const [k, s] of sessions) {
      if (s.uid === user.id) sessions.delete(k);
    }
    await persistDb();
    clearRateLimit(ip, 'reset');
    return json(res, 200, { ok: true, message: 'Senha redefinida com sucesso! Agora você já pode entrar.' });
  }

  if (req.method === 'POST' && url.pathname === '/api/profile/preferences') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'Sessão expirada.' });
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'Dados inválidos.' }); }
    if (body.preferences) {
      user.preferences = sanitizePreferences(body.preferences, user.preferences);
    }
    const validStates = ['pending', 'accepted', 'dismissed', 'later', 'completed'];
    if (validStates.includes(body.tutorialPromptState)) {
      user.tutorialPromptState = body.tutorialPromptState;
    }
    if (typeof body.tutorialCompleted === 'boolean') {
      user.tutorialCompleted = body.tutorialCompleted;
      if (body.tutorialCompleted) user.tutorialPromptState = 'completed';
    }
    await persistDb();
    return json(res, 200, { ok: true, user: safeUser(user, true, true) });
  }

  if (req.method === 'GET' && url.pathname === '/api/tactical/rules') {
    return json(res, 200, {
      cards: Object.values(CARD_CATALOG),
      rules: {
        boardSize: TACTICAL_BOARD,
        targetVp: TACTICAL_CROWN_HOLD_GOAL,
        crownHoldGoal: TACTICAL_CROWN_HOLD_GOAL,
        basePa: TACTICAL_BASE_PA,
        crownPaPenalty: TACTICAL_CROWN_PA_PENALTY,
        turnLimitMs: TACTICAL_TURN_MS,
        draftMs: TACTICAL_DRAFT_MS,
        draftEveryRounds: 3,
        visionRadius: TACTICAL_VISION_RADIUS,
        reconnectMs: TACTICAL_RECONNECT_MS
      }
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/matches/record') {
    const user = sessionUser(req);
    if (!user) return json(res, 401, { error: 'Sessão expirada.' });
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'Dados inválidos.' }); }
    const mode = ['cpu', 'classic_cpu', 'classic_local', 'arena', 'duel', 'tutorial'].includes(body.mode) ? body.mode : 'cpu';
    const difficulty = Number(body.difficulty) || 1;
    const won = body.result === 'win';
    const draw = body.result === 'draw';
    const duration = Math.max(1, Math.min(7200, Math.floor(Number(body.duration) || 0)));
    const myScore = Math.max(0, Math.floor(Number(body.score) || 0));
    const oppScore = Math.max(0, Math.floor(Number(body.opponentScore) || 0));

    user.cpuStats ||= { games: 0, wins: 0, highestDifficultyWon: 0 };
    const totalPlayed = (user.games || 0) + (user.cpuStats.games || 0) + 1;
    if (totalPlayed >= 10) unlockAchievement(user, 'veteran_10');
    if (Number(body.skillsUsed) > 0) {
      user.skillsUsed = (user.skillsUsed || 0) + Number(body.skillsUsed);
      unlockAchievement(user, 'tactician');
    }
    if (won && mode !== 'tutorial') {
      unlockAchievement(user, 'first_blood');
      if (body.winCondition === 'crown') {
        user.crownWins = (user.crownWins || 0) + 1;
        unlockAchievement(user, 'crown_sovereign');
      } else if (body.winCondition === 'regicide') {
        user.regicideWins = (user.regicideWins || 0) + 1;
        unlockAchievement(user, 'regicide');
      }
      if (body.comeback) unlockAchievement(user, 'comeback_king');
    }
    if (mode === 'cpu') {
      user.cpuStats.games = (user.cpuStats.games || 0) + 1;
      if (won) {
        user.cpuStats.wins = (user.cpuStats.wins || 0) + 1;
        if (difficulty > (user.cpuStats.highestDifficultyWon || 0)) {
          user.cpuStats.highestDifficultyWon = difficulty;
        }
        if (difficulty >= 4) unlockAchievement(user, 'cpu_slayer');
        const curRating = Number(user.crownfluxRating) || 1200;
        const botTarget = 1050 + difficulty * 110;
        if (curRating < botTarget + 120) {
          user.crownfluxRating = curRating + Math.max(4, Math.round((difficulty * 4)));
        }
      }
    }
    if (mode === 'tutorial' && won) {
      user.tutorialCompleted = true;
      user.tutorialPromptState = 'completed';
    }

    const diffNames = { 1: 'Iniciante', 2: 'Fácil', 3: 'Normal', 4: 'Difícil', 5: 'Especialista' };
    const opponentName = mode === 'classic_cpu'
      ? `Bot de Xadrez (${diffNames[difficulty] || 'Normal'})`
      : mode === 'classic_local'
        ? 'Xadrez Local'
        : mode === 'cpu'
          ? `CPU (${diffNames[difficulty] || 'Normal'})`
          : mode === 'tutorial'
            ? 'Mentor (Tutorial)'
            : mode === 'duel'
              ? 'Duelo Local'
              : 'Arena 4 Facções';

    db.games.unshift({
      id: id(),
      mode,
      difficulty: mode === 'cpu' ? difficulty : null,
      players: [user.id, `bot:${mode}`],
      opponentName,
      winner: draw ? null : (won ? 0 : 1),
      reason: String(body.reason || '').slice(0, 120),
      duration,
      createdAt: nowIso(),
      scores: [myScore, oppScore]
    });
    db.games = db.games.slice(0, 5000);
    await persistDb();
    return json(res, 200, {
      ok: true,
      user: safeUser(user, true, true),
      games: userHistoryPayload(user.id)
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/ranking') {
    const mode = String(url.searchParams.get('mode') || 'duel');
    const category = ['bullet', 'blitz', 'rapid', 'classic'].includes(url.searchParams.get('category'))
      ? url.searchParams.get('category')
      : 'blitz';

    const tallyModeStats = (uid, modeFilter) => {
      let wins = 0, losses = 0, draws = 0;
      for (const g of db.games) {
        if (!Array.isArray(g.players)) continue;
        const side = g.players.indexOf(uid);
        if (side < 0 || !modeFilter(g)) continue;
        if (g.winner === null) draws++;
        else if (g.winner === side) wins++;
        else losses++;
      }
      const total = wins + losses + draws;
      const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
      return { wins, losses, draws, total, winRate };
    };

    let entries = [];
    if (mode === 'classic') {
      entries = db.users.map(u => {
        const rating = Number(u.classicRatings?.[category]) || 1200;
        const stats = tallyModeStats(u.id, g => g.mode === 'classic');
        return {
          id: u.id,
          username: u.username,
          displayName: u.displayName || u.username,
          avatar: ALLOWED_AVATARS.includes(u.avatar) ? u.avatar : '♟',
          rating,
          wins: stats.wins,
          losses: stats.losses,
          draws: stats.draws,
          games: stats.total,
          winRate: stats.winRate
        };
      }).sort((a, b) => b.rating - a.rating || b.wins - a.wins || a.username.localeCompare(b.username));
    } else if (mode === 'tactical') {
      entries = db.users.map(u => {
        const stats = tallyModeStats(u.id, g => g.mode === 'tactical' || g.mode === 'tactical_cpu');
        const onlineStats = tallyModeStats(u.id, g => g.mode === 'tactical');
        const score = 1000 + onlineStats.wins * 25 - onlineStats.losses * 15 + stats.wins * 8;
        return {
          id: u.id,
          username: u.username,
          displayName: u.displayName || u.username,
          avatar: ALLOWED_AVATARS.includes(u.avatar) ? u.avatar : '♟',
          rating: score,
          wins: stats.wins,
          losses: stats.losses,
          draws: stats.draws,
          games: stats.total,
          winRate: stats.winRate
        };
      }).sort((a, b) => b.wins - a.wins || b.rating - a.rating || a.username.localeCompare(b.username));
    } else {
      entries = db.users.map(u => {
        const rating = Number(u.crownfluxRating) || 1200;
        const div = getCrownfluxDivision(rating);
        const stats = tallyModeStats(u.id, g => g.mode === 'online');
        return {
          id: u.id,
          username: u.username,
          displayName: u.displayName || u.username,
          avatar: ALLOWED_AVATARS.includes(u.avatar) ? u.avatar : '♟',
          rating,
          division: div.name,
          divisionIcon: div.icon,
          wins: stats.wins,
          losses: stats.losses,
          draws: stats.draws,
          games: stats.total,
          winRate: stats.winRate,
          crownWins: u.crownWins || 0,
          regicideWins: u.regicideWins || 0
        };
      }).sort((a, b) => b.rating - a.rating || b.wins - a.wins || a.username.localeCompare(b.username));
    }

    return json(res, 200, {
      mode,
      category: mode === 'classic' ? category : undefined,
      entries: entries.slice(0, 100).map((entry, idx) => ({ rank: idx + 1, ...entry }))
    });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/users/')) {
    const viewer = sessionUser(req);
    const targetKey = normalizeUsername(decodeURIComponent(url.pathname.slice('/api/users/'.length)));
    const target = db.users.find(u => normalizeUsername(u.username) === targetKey || u.id === targetKey);
    if (!target || (viewer && isBlocked(viewer.id, target.id))) {
      return json(res, 404, { error: 'Jogador não encontrado.' });
    }
    return json(res, 200, {
      user: safeUser(target, true, false),
      isFriend: viewer ? areFriends(viewer.id, target.id) : false,
      recentGames: userHistoryPayload(target.id, 10)
    });
  }

  return json(res, 404, { error: 'Endpoint não encontrado.' });
}

function pieceMoves(game, p, attacks = false) {
  const result = [];
  const ok = (x, y) => x >= 0 && y >= 0 && x < BOARD && y < BOARD;
  const add = (x, y) => {
    if (!ok(x, y)) return false;
    const target = game.grid[y][x];
    if (target && target.owner === p.owner && !attacks) return false;
    result.push([x, y]);
    return !target;
  };
  const slide = dirs => {
    for (const [dx, dy] of dirs) {
      let x = p.x + dx, y = p.y + dy;
      while (add(x, y)) { x += dx; y += dy; }
    }
  };
  if (p.type === 'R' || p.type === 'Q') slide(ORTH);
  if (p.type === 'B' || p.type === 'Q') slide(DIAG);
  if (p.type === 'N') for (const [dx, dy] of KNIGHT) add(p.x + dx, p.y + dy);
  if (p.type === 'K') for (const [dx, dy] of [...ORTH, ...DIAG]) add(p.x + dx, p.y + dy);
  if (p.type === 'P') {
    const [fx, fy] = TEAM[p.owner].forward;
    const x = p.x + fx, y = p.y + fy;
    if (!attacks && ok(x, y) && !game.grid[y][x]) result.push([x, y]);
    for (const side of [-1, 1]) {
      const tx = p.x + (fx ? fx : side), ty = p.y + (fy ? fy : side);
      if (!ok(tx, ty)) continue;
      if (attacks) result.push([tx, ty]);
      else {
        const target = game.grid[ty][tx];
        if (target && target.owner !== p.owner) result.push([tx, ty]);
      }
    }
  }
  return result;
}

function addPiece(game, type, owner, x, y) {
  const p = { id: game.nextPieceId++, type, owner, x, y, ready: game.T + 1, cooldown: 1, shield: 0 };
  game.grid[y][x] = p;
  game.pieces.push(p);
  return p;
}

function spawnArmy(game, owner) {
  const { base, forward } = TEAM[owner];
  const [bx, by] = base, [fx, fy] = forward, rx = -fy, ry = fx;
  const cells = LAYOUT.map(([off, type]) => [bx + rx * off, by + ry * off, type]);
  for (let off = -2; off <= 2; off++) cells.push([bx + rx * off + fx, by + ry * off + fy, 'P']);
  if (game.grid[by][bx]) return false;
  for (const [x, y, type] of cells) {
    if (x >= 0 && y >= 0 && x < BOARD && y < BOARD && !game.grid[y][x]) {
      addPiece(game, type, owner, x, y);
    }
  }
  return true;
}

function spawnFood(game) {
  for (let k = 0; k < 50; k++) {
    const x = Math.floor(Math.random() * BOARD), y = Math.floor(Math.random() * BOARD);
    if (game.grid[y][x]) continue;
    const r = Math.random(), type = r < 0.78 ? 'P' : r < 0.88 ? 'N' : r < 0.95 ? 'B' : 'R';
    const p = addPiece(game, type, -1, x, y);
    p.ready = 0;
    return;
  }
}

function spawnOrb(game) {
  if (game.options?.orbs === 'none') return;
  const maxOrbs = game.options?.orbs === 'abundant' ? 8 : 5;
  if (game.orbs.length >= maxOrbs) return;
  for (let k = 0; k < 90; k++) {
    const x = Math.floor(Math.random() * BOARD), y = Math.floor(Math.random() * BOARD);
    if (game.grid[y][x] || game.orbs.some(o => o.x === x && o.y === y)) continue;
    game.orbs.push({ x, y });
    return;
  }
}

function addEvent(game, text) {
  game.events.unshift({ text, at: game.T });
  game.events = game.events.slice(0, 6);
}

function removePiece(game, p) {
  if (game.grid[p.y]?.[p.x] === p) game.grid[p.y][p.x] = null;
  game.pieces = game.pieces.filter(x => x !== p);
}

function levelNeed(team) { return 4 + team.level * 3; }

function spawnGrowth(game, owner) {
  const king = game.pieces.find(p => p.owner === owner && p.type === 'K');
  if (!king) return;
  const types = ['P', 'P', 'N', 'B', 'R', 'N', 'B', 'R', 'Q', 'Q'];
  const type = types[Math.min(game.teams[owner].level - 1, types.length - 1)];
  for (let radius = 1; radius <= 6; radius++) {
    const free = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = king.x + dx, y = king.y + dy;
        if (x >= 0 && y >= 0 && x < BOARD && y < BOARD && !game.grid[y][x]) free.push([x, y]);
      }
    }
    if (free.length) {
      const [x, y] = free[Math.floor(Math.random() * free.length)];
      const p = addPiece(game, type, owner, x, y);
      p.ready = game.T + 0.6;
      addEvent(game, `${TEAM[owner].name} recebeu um reforço: ${type}.`);
      return;
    }
  }
}

function award(game, owner, value) {
  if (owner < 0) return;
  const team = game.teams[owner];
  team.score += value;
  team.xp += value;
  team.energy = Math.min(100, team.energy + value * 9);
  team.captures++;
  while (team.xp >= levelNeed(team)) {
    team.xp -= levelNeed(team);
    team.level++;
    spawnGrowth(game, owner);
  }
}

function collectOrb(game, p) {
  const index = game.orbs.findIndex(o => o.x === p.x && o.y === p.y);
  if (index < 0 || p.owner < 0) return;
  game.orbs.splice(index, 1);
  award(game, p.owner, 3);
  game.teams[p.owner].energy = Math.min(100, game.teams[p.owner].energy + 24);
  addEvent(game, `${TEAM[p.owner].name} coletou um Fragmento Flux.`);
}

function finishGame(game, winner, reason, winCondition = 'regicide') {
  if (game.over) return;
  game.over = true;
  game.winner = winner;
  game.reason = reason;
  game.winCondition = winCondition;
  game.endedAt = Date.now();
  const [a, b] = game.players.map(uid => db.users.find(u => u.id === uid));
  if (a && b) {
    a.games = (a.games || 0) + 1;
    b.games = (b.games || 0) + 1;
    if (winner === 0) { a.wins = (a.wins || 0) + 1; b.losses = (b.losses || 0) + 1; }
    else if (winner === 1) { b.wins = (b.wins || 0) + 1; a.losses = (a.losses || 0) + 1; }
    else { a.draws = (a.draws || 0) + 1; b.draws = (b.draws || 0) + 1; }

    let ratingChanges = [0, 0];
    if (game.mode === 'classic' && game.rated) {
      const category = game.options.category;
      a.classicRatings ||= {};
      b.classicRatings ||= {};
      const ratingA = Number(a.classicRatings[category]) || 1200;
      const ratingB = Number(b.classicRatings[category]) || 1200;
      const expectedA = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
      const scoreA = winner === null ? 0.5 : winner === 0 ? 1 : 0;
      const delta = Math.round(32 * (scoreA - expectedA));
      ratingChanges = [delta, -delta];
      a.classicRatings[category] = ratingA + delta;
      b.classicRatings[category] = ratingB - delta;
    } else if (game.mode !== 'classic') {
      const rA = Number(a.crownfluxRating) || 1200;
      const rB = Number(b.crownfluxRating) || 1200;
      const expA = 1 / (1 + 10 ** ((rB - rA) / 400));
      const sA = winner === null ? 0.5 : winner === 0 ? 1 : 0;
      const delta = Math.round(28 * (sA - expA));
      ratingChanges = [delta, -delta];
      a.crownfluxRating = Math.max(800, rA + delta);
      b.crownfluxRating = Math.max(800, rB - delta);

      const winnerUser = winner === 0 ? a : winner === 1 ? b : null;
      const loserSide = winner === 0 ? 1 : 0;
      if (winnerUser) {
        unlockAchievement(winnerUser, 'first_blood');
        if (winCondition === 'crown') {
          winnerUser.crownWins = (winnerUser.crownWins || 0) + 1;
          unlockAchievement(winnerUser, 'crown_sovereign');
        } else if (winCondition === 'regicide') {
          winnerUser.regicideWins = (winnerUser.regicideWins || 0) + 1;
          unlockAchievement(winnerUser, 'regicide');
        }
        if ((game.teams?.[loserSide]?.maxCrownProgress || 0) >= 50) {
          unlockAchievement(winnerUser, 'comeback_king');
        }
      }
      if ((a.games || 0) + (a.cpuStats?.games || 0) >= 10) unlockAchievement(a, 'veteran_10');
      if ((b.games || 0) + (b.cpuStats?.games || 0) >= 10) unlockAchievement(b, 'veteran_10');
    }

    db.games.unshift({
      id: game.id,
      mode: game.mode === 'classic' ? 'classic' : 'online',
      players: [a.id, b.id],
      winner,
      reason,
      winCondition,
      duration: Math.floor(game.T),
      createdAt: nowIso(),
      scores: game.teams.map(t => t.score),
      options: game.options,
      timeControl: game.mode === 'classic' ? game.options.timeControl : undefined,
      rated: Boolean(game.rated),
      ratingChanges
    });
    game.ratingChanges = ratingChanges;
    db.games = db.games.slice(0, 5000);
    persistDb();
    sendUser(a.id, 'profile:stats', { user: safeUser(a, true, true), games: userHistoryPayload(a.id) });
    sendUser(b.id, 'profile:stats', { user: safeUser(b, true, true), games: userHistoryPayload(b.id) });
  }
  addEvent(game, winner === null ? 'Partida empatada.' : `${TEAM[winner].name} venceu a partida.`);
  for (const uid of game.players) notifyPresence(uid);
}

function serializeGame(game, side) {
  const opponentId = game.players[1 - side];
  const opponent = db.users.find(u => u.id === opponentId);
  return {
    gameId: game.id,
    side,
    opponent: opponent ? safeUser(opponent) : { username: 'Adversário', displayName: 'Adversário', avatar: '♟' },
    T: game.T,
    mode: game.mode,
    phase: game.phase || 'development',
    over: game.over,
    winner: game.winner,
    reason: game.reason || '',
    winCondition: game.winCondition || '',
    options: game.options,
    classic: game.mode === 'classic',
    turn: game.mode === 'classic' ? game.turn : undefined,
    clocks: game.mode === 'classic' ? game.clocks : undefined,
    castle: game.mode === 'classic' ? game.castle : undefined,
    enPassant: game.mode === 'classic' ? game.enPassant : undefined,
    rated: game.mode === 'classic' ? Boolean(game.rated) : true,
    ratingChanges: game.ratingChanges,
    crown: game.crown ? { ...game.crown } : null,
    zones: game.zones ? game.zones.map(z => ({ ...z })) : [],
    decisiveMoment: game.decisiveMoment ? { ...game.decisiveMoment } : null,
    pieces: game.pieces.map(p => ({
      id: p.id, type: p.type, owner: p.owner, x: p.x, y: p.y, ready: p.ready, cd0: p.cooldown, shield: p.shield, chargeUntil: p.chargeUntil || 0
    })),
    orbs: game.orbs.map(o => ({ ...o })),
    teams: game.teams.map(t => ({ ...t })),
    events: game.events.map(e => ({ msg: e.text, t: e.at })),
    lastMove: game.lastMove ? { ...game.lastMove } : null
  };
}

function publishGame(game, type = 'game:state') {
  for (let side = 0; side < 2; side++) {
    sendUser(game.players[side], type, { state: serializeGame(game, side) });
  }
}

function setDecisiveMoment(game, title, subtitle, kind = 'gold') {
  game.decisiveMoment = { id: id(), title, subtitle, kind, at: game.T };
}

function makeGame(room) {
  const opts = sanitizeMatchOptions(room.options);
  const playerUsers = room.players.map(uid => db.users.find(u => u.id === uid));
  const game = {
    id: id(),
    roomId: room.id,
    players: [...room.players],
    options: opts,
    T: 0,
    phase: 'development',
    lastTick: Date.now(),
    lastBroadcast: 0,
    grid: Array.from({ length: BOARD }, () => Array(BOARD).fill(null)),
    pieces: [],
    orbs: [],
    crown: {
      x: 7,
      y: 7,
      state: 'sealed',
      unlockAt: 12,
      holderId: null,
      owner: -1,
      dropCooldownOwner: -1,
      dropCooldownUntil: 0,
      tributeTimer: 10
    },
    zones: STRATEGIC_ZONES.map(z => ({ ...z, owner: -1, contested: false, fortressTimer: 14 })),
    decisiveMoment: {
      id: id(),
      title: 'Fase I · Desenvolvimento',
      subtitle: 'A Coroa Imperial despertará no Trono Central em 12 segundos!',
      kind: 'blue',
      at: 0
    },
    teams: [0, 1].map(tid => {
      const doc = playerUsers[tid]?.preferences?.doctrine || 'vanguard';
      return {
        id: tid,
        doctrine: doc,
        score: 0,
        xp: 0,
        level: 0,
        energy: doc === 'vanguard' ? 28 : doc === 'celerity' ? 8 : 18,
        boostUntil: 0,
        aegisCooldownUntil: 0,
        crownProgress: 0,
        maxCrownProgress: 0,
        captures: 0,
        kings: 0,
        alive: true
      };
    }),
    nextPieceId: 1,
    foodTimer: 0,
    orbTimer: opts.orbs === 'abundant' ? 2.8 : 4.5,
    events: [],
    lastMove: null,
    over: false,
    winner: null,
    disconnects: new Map()
  };
  spawnArmy(game, 0);
  spawnArmy(game, 1);
  for (let tid = 0; tid < 2; tid++) {
    if (game.teams[tid].doctrine === 'bastion') {
      const k = game.pieces.find(p => p.owner === tid && p.type === 'K');
      if (k) k.shield = 1;
    }
  }
  for (let i = 0; i < 16; i++) spawnFood(game);
  addEvent(game, `Duelo iniciado · Disputem o Trono Central e protejam seus Reis!`);
  return game;
}

function makeClassicGame(room) {
  const options = sanitizeMatchOptions(room.options);
  const game = {
    id: id(), roomId: room.id, mode: 'classic', players: [...room.players], options,
    rated: room.kind === 'public', T: 0, lastTick: Date.now(), lastBroadcast: 0,
    grid: Array.from({ length: 8 }, () => Array(8).fill(null)), pieces: [], orbs: [],
    teams: [0, 1].map(id => ({
      id, score: 0, xp: 0, level: 0, energy: 0, boostUntil: 0, captures: 0, kings: 1, alive: true
    })),
    nextPieceId: 1, events: [], lastMove: null, over: false, winner: null,
    turn: 0, clocks: [options.seconds, options.seconds], clockAt: Date.now(),
    castle: [{ king: true, queen: true }, { king: true, queen: true }],
    enPassant: null, halfMoves: 0, repetition: new Map(), disconnects: new Map()
  };
  const backRank = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  for (let x = 0; x < 8; x++) {
    addPiece(game, backRank[x], 1, x, 0);
    addPiece(game, 'P', 1, x, 1);
    addPiece(game, 'P', 0, x, 6);
    addPiece(game, backRank[x], 0, x, 7);
  }
  addEvent(game, `Xadrez Clássico iniciado · ${options.label}.`);
  game.repetition.set(classicPositionKey(game), 1);
  return game;
}

function classicPositionKey(game) {
  const board = game.grid.map(row => row.map(p => p ? `${p.owner}${p.type}` : '--').join('')).join('/');
  return `${board}|${game.turn}|${game.castle.map(c => `${c.king ? 'K' : ''}${c.queen ? 'Q' : ''}`).join('')}|${game.enPassant ? `${game.enPassant.x},${game.enPassant.y}` : '-'}`;
}

function classicAttacked(game, x, y, bySide) {
  for (const p of game.pieces) {
    if (p.owner !== bySide || game.grid[p.y]?.[p.x] !== p) continue;
    const dx = x - p.x, dy = y - p.y, ax = Math.abs(dx), ay = Math.abs(dy);
    if (p.type === 'P' && dy === (bySide === 0 ? -1 : 1) && ax === 1) return true;
    if (p.type === 'N' && ax * ay === 2) return true;
    if (p.type === 'K' && Math.max(ax, ay) === 1) return true;
    const diagonal = ax === ay && ax > 0;
    const straight = (dx === 0) !== (dy === 0);
    if ((p.type === 'B' && diagonal) || (p.type === 'R' && straight) || (p.type === 'Q' && (diagonal || straight))) {
      const sx = Math.sign(dx), sy = Math.sign(dy);
      let cx = p.x + sx, cy = p.y + sy, blocked = false;
      while (cx !== x || cy !== y) {
        if (game.grid[cy][cx]) { blocked = true; break; }
        cx += sx; cy += sy;
      }
      if (!blocked) return true;
    }
  }
  return false;
}

function classicPseudoMoves(game, p) {
  const result = [];
  const add = (x, y) => {
    if (x < 0 || y < 0 || x >= 8 || y >= 8) return;
    if (game.grid[y][x]?.owner === p.owner) return;
    if (game.grid[y][x]?.type !== 'K') result.push([x, y]);
  };
  const slide = dirs => {
    for (const [dx, dy] of dirs) {
      let x = p.x + dx, y = p.y + dy;
      while (x >= 0 && y >= 0 && x < 8 && y < 8) {
        if (game.grid[y][x]?.owner === p.owner) break;
        if (game.grid[y][x]?.type !== 'K') result.push([x, y]);
        if (game.grid[y][x]) break;
        x += dx; y += dy;
      }
    }
  };
  if (p.type === 'P') {
    const dir = p.owner === 0 ? -1 : 1, start = p.owner === 0 ? 6 : 1;
    if (!game.grid[p.y + dir]?.[p.x]) {
      result.push([p.x, p.y + dir]);
      if (p.y === start && !game.grid[p.y + 2 * dir][p.x]) result.push([p.x, p.y + 2 * dir]);
    }
    for (const dx of [-1, 1]) {
      const x = p.x + dx, y = p.y + dir;
      if (x >= 0 && x < 8 && ((game.grid[y][x]?.owner === 1 - p.owner && game.grid[y][x]?.type !== 'K') ||
        (game.enPassant?.x === x && game.enPassant?.y === y))) result.push([x, y]);
    }
  } else if (p.type === 'N') {
    for (const [dx, dy] of KNIGHT) add(p.x + dx, p.y + dy);
  } else if (p.type === 'B') slide(DIAG);
  else if (p.type === 'R') slide(ORTH);
  else if (p.type === 'Q') slide([...ORTH, ...DIAG]);
  else if (p.type === 'K') {
    for (const [dx, dy] of [...ORTH, ...DIAG]) add(p.x + dx, p.y + dy);
    const row = p.owner === 0 ? 7 : 0, rights = game.castle[p.owner];
    if (p.x === 4 && p.y === row && !classicAttacked(game, 4, row, 1 - p.owner)) {
      if (rights.king && !game.grid[row][5] && !game.grid[row][6] &&
        game.grid[row][7]?.type === 'R' && game.grid[row][7]?.owner === p.owner &&
        !classicAttacked(game, 5, row, 1 - p.owner) && !classicAttacked(game, 6, row, 1 - p.owner)) result.push([6, row]);
      if (rights.queen && !game.grid[row][1] && !game.grid[row][2] && !game.grid[row][3] &&
        game.grid[row][0]?.type === 'R' && game.grid[row][0]?.owner === p.owner &&
        !classicAttacked(game, 3, row, 1 - p.owner) && !classicAttacked(game, 2, row, 1 - p.owner)) result.push([2, row]);
    }
  }
  return result;
}

function classicLegalMoves(game, p) {
  return classicPseudoMoves(game, p).filter(([x, y]) => {
    const fromX = p.x, fromY = p.y, target = game.grid[y][x];
    const ep = p.type === 'P' && x !== fromX && !target;
    const epTarget = ep ? game.grid[y + (p.owner === 0 ? 1 : -1)][x] : null;
    game.grid[fromY][fromX] = null;
    if (epTarget) game.grid[epTarget.y][epTarget.x] = null;
    game.grid[y][x] = p;
    p.x = x; p.y = y;
    const king = game.pieces.find(piece => piece.owner === p.owner && piece.type === 'K');
    const safe = king && !classicAttacked(game, king.x, king.y, 1 - p.owner);
    p.x = fromX; p.y = fromY;
    game.grid[fromY][fromX] = p;
    game.grid[y][x] = target;
    if (epTarget) game.grid[epTarget.y][epTarget.x] = epTarget;
    return safe;
  });
}

function classicInsufficientMaterial(game) {
  const material = game.pieces.filter(p => p.type !== 'K');
  if (!material.length) return true;
  if (material.some(p => ['P', 'R', 'Q'].includes(p.type))) return false;
  if (material.length === 1) return true;
  if (material.every(p => p.type === 'B') && new Set(material.map(p => (p.x + p.y) % 2)).size === 1) return true;
  return material.length === 2 && material.every(p => p.type === 'N' && p.owner === material[0].owner);
}

function classicCanMate(game, side) {
  const material = game.pieces.filter(p => p.owner === side && p.type !== 'K');
  if (material.some(p => ['P', 'R', 'Q'].includes(p.type))) return true;
  if (material.some(p => p.type === 'B') && material.some(p => p.type === 'N')) return true;
  if (material.filter(p => p.type === 'B').length >= 2 &&
      new Set(material.filter(p => p.type === 'B').map(p => (p.x + p.y) % 2)).size > 1) return true;
  if (material.filter(p => p.type === 'N').length >= 3) return true;
  return material.length >= 2 && game.pieces.some(p => p.owner !== side && p.type !== 'K');
}

function applyClassicMove(game, p, x, y) {
  const side = game.turn, fromX = p.x, fromY = p.y, target = game.grid[y][x];
  const pawnMove = p.type === 'P';
  const epCapture = p.type === 'P' && x !== fromX && !target;
  const captured = target || (epCapture ? game.grid[y + (side === 0 ? 1 : -1)][x] : null);
  if (captured) removePiece(game, captured);
  game.grid[fromY][fromX] = null;
  p.x = x; p.y = y;
  game.grid[y][x] = p;
  if (p.type === 'K' && Math.abs(x - fromX) === 2) {
    const rookX = x === 6 ? 7 : 0, rook = game.grid[y][rookX];
    game.grid[y][rookX] = null; rook.x = x === 6 ? 5 : 3; game.grid[y][rook.x] = rook;
  }
  if (p.type === 'K') game.castle[side] = { king: false, queen: false };
  if (p.type === 'R' && fromY === (side === 0 ? 7 : 0)) {
    if (fromX === 0) game.castle[side].queen = false;
    if (fromX === 7) game.castle[side].king = false;
  }
  if (captured?.type === 'R' && captured.y === (captured.owner === 0 ? 7 : 0)) {
    if (captured.x === 0) game.castle[captured.owner].queen = false;
    if (captured.x === 7) game.castle[captured.owner].king = false;
  }
  game.enPassant = p.type === 'P' && Math.abs(y - fromY) === 2
    ? { x, y: (fromY + y) / 2 } : null;
  if (p.type === 'P' && (y === 0 || y === 7)) p.type = 'Q';
  game.halfMoves = pawnMove || captured ? 0 : game.halfMoves + 1;
  game.clocks[side] += game.options.increment;
  game.turn = 1 - side;
  game.lastMove = { x0: fromX, y0: fromY, x1: x, y1: y, t: game.T };
  game.clockAt = Date.now();
  addEvent(game, captured ? `${TEAM[side].name} capturou uma peça.` : `${TEAM[side].name} moveu.`);

  const key = classicPositionKey(game);
  game.repetition.set(key, (game.repetition.get(key) || 0) + 1);
  const nextMoves = game.pieces.filter(piece => piece.owner === game.turn)
    .some(piece => classicLegalMoves(game, piece).length > 0);
  const inCheck = classicAttacked(game,
    game.pieces.find(piece => piece.owner === game.turn && piece.type === 'K').x,
    game.pieces.find(piece => piece.owner === game.turn && piece.type === 'K').y, side);
  if (!nextMoves) finishGame(game, inCheck ? side : null, inCheck ? 'Xeque-mate.' : 'Afogamento: empate.');
  else if (classicInsufficientMaterial(game)) finishGame(game, null, 'Material insuficiente: empate.');
  else if (game.halfMoves >= 100) finishGame(game, null, 'Regra dos 50 lances: empate.');
  else if (game.repetition.get(key) >= 3) finishGame(game, null, 'Repetição tripla: empate.');
  publishGame(game, game.over ? 'game:ended' : 'game:state');
}

const TACTICAL_BOARD = 12;
const TACTICAL_BASE_PA = 3;
const TACTICAL_CROWN_PA_PENALTY = 1;
const TACTICAL_TURN_MS = 15_000;
const TACTICAL_DRAFT_MS = 8_000;
const TACTICAL_RECONNECT_MS = 30_000;
const TACTICAL_CROWN_HOLD_GOAL = 3;
const TACTICAL_TARGET_VP = TACTICAL_CROWN_HOLD_GOAL;
const TACTICAL_VISION_RADIUS = 4;
const TACTICAL_AUTO_END_MS = 450;

const CARD_CATALOG = {
  short_teleport: {
    id: 'short_teleport',
    name: 'Teleporte Curto',
    cost: 2,
    targetType: 'cell',
    range: 2,
    desc: 'Pula até 2 casas no grid, ignorando paredes no caminho.'
  },
  flux_siphon: {
    id: 'flux_siphon',
    name: 'Dreno Tático',
    cost: 1,
    targetType: 'none',
    range: 0,
    desc: 'Remove 1 PA do próximo turno do inimigo e recupera o PA gasto. Se ele estiver com a Coroa a até 4 casas, reduz 1 turno de domínio.'
  },
  flux_wall: {
    id: 'flux_wall',
    name: 'Barreira de Fluxo',
    cost: 1,
    targetType: 'cell',
    range: 4,
    durationRounds: 2,
    desc: 'Ergue um bloqueio temporário em uma casa vazia por 2 rodadas.'
  },
  crown_dash: {
    id: 'crown_dash',
    name: 'Impulso Real',
    cost: 3,
    targetType: 'cell',
    range: 3,
    desc: 'Avança até 3 casas em linha reta pelo tabuleiro.'
  },
  kinetic_push: {
    id: 'kinetic_push',
    name: 'Golpe de Cerco',
    cost: 2,
    targetType: 'enemy',
    range: 2,
    desc: 'Atinge o inimigo a até 2 casas, empurrando-o 1 casa para trás e derrubando a Coroa (se não estiver protegida).'
  },
  royal_charge: {
    id: 'royal_charge',
    name: 'Investida Real',
    cost: 2,
    targetType: 'cell',
    range: 2,
    desc: 'Avança até 2 casas em linha reta e empurra um inimigo adjacente em 1 casa, sem roubar a Coroa diretamente.'
  },
  transposition: {
    id: 'transposition',
    name: 'Transposição',
    cost: 2,
    targetType: 'cell',
    range: 5,
    desc: 'Troca sua posição com uma Barreira de Fluxo aliada (bloqueada enquanto a Coroa estiver sob proteção).'
  },
  stamina_overcharge: {
    id: 'stamina_overcharge',
    name: 'Sobrecarga de Estamina',
    cost: 0,
    targetType: 'none',
    range: 0,
    desc: 'Concede +2 PA imediatos neste turno, mas reduz em 1 PA o seu próximo turno.'
  }
};

function createTacticalChallenge() {
  const pool = [
    { id: 'play_3_cards', label: 'Use 3 cartas na partida', goal: 3 },
    { id: 'center_2_turns', label: 'Termine 2 turnos no centro (linhas/colunas 5–8)', goal: 2 },
    { id: 'push_2_times', label: 'Empurre ou drene o adversário 2 vezes', goal: 2 }
  ];
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return { ...pick, progress: 0, completed: false };
}

function randomCardChoices(count = 3) {
  const keys = Object.keys(CARD_CATALOG);
  const pool = [...keys].sort(() => Math.random() - 0.5);
  return pool.slice(0, count).map(k => ({ ...CARD_CATALOG[k], uid: id() }));
}

class TacticalDraftMatch {
  constructor(room) {
    this.id = id();
    this.roomId = room.id;
    this.mode = 'tactical_draft';
    this.players = [...room.players];
    this.options = room.options;
    this.over = false;
    this.winner = null;
    this.reason = '';
    this.endedAt = null;
    this.phase = 'turn';
    this.round = 1;
    this.activeSide = 0;
    this.turnDeadline = Date.now() + TACTICAL_TURN_MS;
    this.draftDeadline = 0;
    this.boardSize = TACTICAL_BOARD;
    this.units = [
      { side: 0, x: 1, y: 1, hp: 3 },
      { side: 1, x: TACTICAL_BOARD - 2, y: TACTICAL_BOARD - 2, hp: 3 }
    ];
    this.crown = {
      x: Math.floor(TACTICAL_BOARD / 2),
      y: Math.floor(TACTICAL_BOARD / 2),
      holder: null,
      protectionTurns: 0,
      recoverCooldown: [0, 0]
    };
    this.walls = [];
    this.fluxZones = [];
    this.teams = [0, 1].map(side => ({
      side,
      vp: 0,
      ap: side === 0 ? TACTICAL_BASE_PA : 0,
      nextTurnDeltaAp: 0,
      hand: [
        { ...CARD_CATALOG.short_teleport, uid: id() },
        { ...CARD_CATALOG.flux_wall, uid: id() }
      ],
      draftOptions: [],
      draftPicked: false,
      challenge: createTacticalChallenge()
    }));
    this.disconnects = new Map();
    this.kind = room.kind || 'private';
    this.createdAt = Date.now();
    this.eventSeq = 0;
    this.leftPlayers = new Set();
    this.resultType = null; // 'vp' | 'resign' | 'abandon' | 'disconnect'
    this.recorded = false;
    this.discarded = false;
    this.autoEnding = false;
    this.autoEndTimer = null;
    // Cronômetro de decisão do turno (pausa durante reconexão / explicações do tutorial)
    this.turnStartedAt = Date.now();
    this.turnPausedMs = 0;
    this.pauseStartedAt = null;
    this.turnTimes = [];
    this.replayLog = [];
    this.logEvent('match_start', null, { boardSize: this.boardSize });
  }

  logEvent(type, side, data = {}) {
    this.eventSeq += 1;
    this.replayLog.push({ seq: this.eventSeq, t: Date.now(), round: this.round, type, side, data });
  }

  isClockPaused() {
    return this.disconnects.size > 0 || Boolean(this.tutorialFrozen);
  }

  syncClockPause(now = Date.now()) {
    const shouldPause = this.isClockPaused() && !this.over;
    if (shouldPause && this.pauseStartedAt === null) this.pauseStartedAt = now;
    else if (!shouldPause && this.pauseStartedAt !== null) {
      this.turnPausedMs += now - this.pauseStartedAt;
      this.pauseStartedAt = null;
    }
  }

  currentTurnElapsed(now = Date.now()) {
    const ref = this.pauseStartedAt ?? now;
    return Math.max(0, ref - this.turnStartedAt - this.turnPausedMs);
  }

  recordTurnTime(side, reason) {
    const ms = this.currentTurnElapsed();
    this.turnTimes.push({ side, round: this.round, ms, reason });
    if (this.turnTimes.length > 40) this.turnTimes.shift();
    return ms;
  }

  isInside(x, y) {
    return x >= 0 && y >= 0 && x < this.boardSize && y < this.boardSize;
  }

  hasWall(x, y) {
    return this.walls.some(w => w.x === x && w.y === y);
  }

  unitAt(x, y) {
    return this.units.find(u => u.x === x && u.y === y) || null;
  }

  manhattan(ax, ay, bx, by) {
    return Math.abs(ax - bx) + Math.abs(ay - by);
  }

  moveUnit(side, toX, toY) {
    if (this.over || this.phase !== 'turn' || this.autoEnding) return { ok: false, error: 'Aguarde a fase de turno.' };
    if (side !== this.activeSide) return { ok: false, error: 'Não é a sua vez.' };
    const team = this.teams[side];
    const unit = this.units[side];
    if (team.ap < 1) return { ok: false, error: 'Pontos de Ação insuficientes.' };
    if (!this.isInside(toX, toY)) return { ok: false, error: 'Casa fora do tabuleiro.' };
    if (this.manhattan(unit.x, unit.y, toX, toY) !== 1) {
      return { ok: false, error: 'Movimento inválido: apenas 1 casa ortogonal por vez.' };
    }
    if (this.hasWall(toX, toY)) return { ok: false, error: 'Casa bloqueada por Barreira de Fluxo.' };
    if (this.unitAt(toX, toY)) return { ok: false, error: 'Casa ocupada por outro jogador.' };
    if (this.crown.holder === null && this.crown.x === toX && this.crown.y === toY && this.crown.recoverCooldown[side] > 0) {
      return { ok: false, error: 'Você acabou de perder a Coroa! Aguarde 1 turno para recuperá-la.' };
    }

    const from = { x: unit.x, y: unit.y };
    unit.x = toX;
    unit.y = toY;
    team.ap -= 1;
    this.logEvent('move', side, { from, to: { x: toX, y: toY }, apLeft: team.ap });
    this.checkCrownCapture(side);
    return { ok: true };
  }

  advanceChallenge(side, triggerId) {
    const ch = this.teams[side]?.challenge;
    if (!ch || ch.completed || ch.id !== triggerId) return;
    ch.progress = Math.min(ch.goal, ch.progress + 1);
    if (ch.progress >= ch.goal) {
      ch.completed = true;
      const bonusCard = randomCardChoices(1)[0];
      this.teams[side].hand.push(bonusCard);
      this.teams[side].ap += 1;
      this.logEvent('challenge_completed', side, { label: ch.label, bonusCard: bonusCard.name });
    }
  }

  pushUnitAway(attackerUnit, targetUnit) {
    const dx = Math.sign(targetUnit.x - attackerUnit.x);
    const dy = Math.sign(targetUnit.y - attackerUnit.y);
    const candidates = dx !== 0 && dy !== 0
      ? [[dx, 0], [0, dy]]
      : [[dx, dy]];
    for (const [cx, cy] of candidates) {
      const nx = targetUnit.x + cx;
      const ny = targetUnit.y + cy;
      if (this.isInside(nx, ny) && !this.hasWall(nx, ny) && !this.unitAt(nx, ny)) {
        targetUnit.x = nx;
        targetUnit.y = ny;
        return { pushed: true, to: { x: nx, y: ny } };
      }
    }
    return { pushed: false };
  }

  attackUnit(side, toX, toY) {
    if (this.over || this.phase !== 'turn' || this.autoEnding) return { ok: false, error: 'Aguarde a fase de turno.' };
    if (side !== this.activeSide) return { ok: false, error: 'Não é a sua vez.' };
    const team = this.teams[side];
    const unit = this.units[side];
    const enemySide = 1 - side;
    const enemyUnit = this.units[enemySide];
    if (team.ap < 1) return { ok: false, error: 'Requer 1 PA para atacar.' };
    if (enemyUnit.x !== toX || enemyUnit.y !== toY) return { ok: false, error: 'Nenhum inimigo nessa casa.' };
    if (this.manhattan(unit.x, unit.y, toX, toY) !== 1) {
      return { ok: false, error: 'Ataque corpo a corpo exige adjacência (1 casa).' };
    }

    team.ap -= 1;
    const oldPos = { x: enemyUnit.x, y: enemyUnit.y };
    const pushRes = this.pushUnitAway(unit, enemyUnit);
    if (pushRes.pushed) this.advanceChallenge(side, 'push_2_times');
    let crownOutcome = null;
    let crownProtectedBlocked = false;

    if (this.crown.holder === enemySide) {
      if (this.crown.protectionTurns > 0) {
        crownProtectedBlocked = true;
        this.logEvent('crown_protected_hit', side, { targetSide: enemySide, protectionTurns: this.crown.protectionTurns });
      } else {
        this.teams[enemySide].vp = 0;
        this.crown.recoverCooldown[enemySide] = 1;
        if (pushRes.pushed) {
          this.crown.holder = null;
          this.crown.x = oldPos.x;
          this.crown.y = oldPos.y;
          crownOutcome = 'dropped';
          this.logEvent('crown_dropped', side, { x: oldPos.x, y: oldPos.y, targetSide: enemySide });
        } else {
          this.crown.holder = side;
          this.crown.protectionTurns = 1;
          this.teams[side].vp = 0;
          if (team.ap === 0) team.ap = 1; // Bônus único de reposicionamento ao roubar
          crownOutcome = 'stolen';
          this.logEvent('crown_stolen', side, { x: unit.x, y: unit.y, targetSide: enemySide });
        }
      }
    }

    this.logEvent('melee_attack', side, {
      targetSide: enemySide,
      pushedTo: pushRes.pushed ? pushRes.to : null,
      crownOutcome,
      crownProtectedBlocked,
      apLeft: team.ap
    });
    return { ok: true, hitEnemy: enemySide, crownOutcome, crownProtectedBlocked };
  }

  checkCrownCapture(side) {
    const unit = this.units[side];
    if (this.crown.holder === null && unit.x === this.crown.x && unit.y === this.crown.y) {
      if (this.crown.recoverCooldown[side] > 0) return false;
      this.crown.holder = side;
      this.crown.protectionTurns = 1;
      this.teams[side].vp = 0;
      if (this.teams[side].ap === 0) this.teams[side].ap = 1; // Bônus único de reposicionamento
      this.logEvent('crown_captured', side, { x: unit.x, y: unit.y });
      return true;
    }
    return false;
  }

  cardHasValidTarget(side, card) {
    const unit = this.units[side];
    const enemyUnit = this.units[1 - side];
    if (card.targetType === 'none') return true;
    if (card.id === 'transposition' && this.crown.holder === side && this.crown.protectionTurns > 0) return false;
    if (card.targetType === 'enemy') {
      return this.manhattan(unit.x, unit.y, enemyUnit.x, enemyUnit.y) <= card.range;
    }
    for (let y = 0; y < this.boardSize; y++) {
      for (let x = 0; x < this.boardSize; x++) {
        const d = this.manhattan(unit.x, unit.y, x, y);
        if (card.id === 'short_teleport') {
          if (d >= 1 && d <= card.range && !this.hasWall(x, y) && !this.unitAt(x, y)) return true;
        } else if (card.id === 'flux_wall') {
          if (d <= card.range && !this.hasWall(x, y) && !this.unitAt(x, y) &&
              !(this.crown.holder === null && this.crown.x === x && this.crown.y === y)) return true;
        } else if (card.id === 'crown_dash' || card.id === 'royal_charge') {
          const dx = Math.abs(x - unit.x), dy = Math.abs(y - unit.y);
          if (((dx === 0 && dy > 0 && dy <= card.range) || (dy === 0 && dx > 0 && dx <= card.range)) &&
              !this.hasWall(x, y) && !this.unitAt(x, y)) return true;
        } else if (card.id === 'transposition') {
          if (d >= 1 && d <= card.range && this.walls.some(w => w.x === x && w.y === y && w.owner === side)) return true;
        }
      }
    }
    return false;
  }

  hasAnyValidAction(side) {
    if (this.over || this.phase !== 'turn' || side !== this.activeSide) return false;
    const team = this.teams[side];
    const unit = this.units[side];
    if (team.ap <= 0) return false;

    // 1. Movimento ortogonal ou ataque adjacente (ambos custam 1 PA)
    if (team.ap >= 1) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = unit.x + dx;
        const ny = unit.y + dy;
        if (!this.isInside(nx, ny) || this.hasWall(nx, ny)) continue;
        return true; // casa livre (mover) ou inimigo adjacente (atacar)
      }
    }

    // 2. Alguma carta pagável com alvo válido
    return team.hand.some(card => team.ap >= card.cost && this.cardHasValidTarget(side, card));
  }

  playCard(side, cardUid, target = {}) {
    if (this.over || this.phase !== 'turn' || this.autoEnding) return { ok: false, error: 'Aguarde a fase de turno.' };
    if (side !== this.activeSide) return { ok: false, error: 'Não é a sua vez.' };
    const team = this.teams[side];
    const cardIdx = team.hand.findIndex(c => c.uid === cardUid);
    if (cardIdx < 0) return { ok: false, error: 'Carta não encontrada na mão.' };
    const card = team.hand[cardIdx];
    if (team.ap < card.cost) return { ok: false, error: `Requer ${card.cost} PA.` };

    const unit = this.units[side];
    const enemySide = 1 - side;
    const enemyUnit = this.units[enemySide];
    const tx = Number(target?.x);
    const ty = Number(target?.y);
    let hitEnemy = null;

    if (card.id === 'short_teleport') {
      if (!this.isInside(tx, ty)) return { ok: false, error: 'Destino fora do mapa.' };
      const dist = this.manhattan(unit.x, unit.y, tx, ty);
      if (dist < 1 || dist > card.range) return { ok: false, error: 'Teleporte limitado a 2 casas.' };
      if (this.hasWall(tx, ty) || this.unitAt(tx, ty)) return { ok: false, error: 'Destino ocupado ou bloqueado.' };
      if (this.crown.holder === null && this.crown.x === tx && this.crown.y === ty && this.crown.recoverCooldown[side] > 0) {
        return { ok: false, error: 'Você acabou de perder a Coroa! Aguarde 1 turno para recuperá-la.' };
      }
      unit.x = tx;
      unit.y = ty;
      this.checkCrownCapture(side);
    } else if (card.id === 'flux_siphon') {
      this.teams[enemySide].nextTurnDeltaAp -= 1;
      team.ap += 1;
      if (this.crown.holder === enemySide && this.manhattan(unit.x, unit.y, enemyUnit.x, enemyUnit.y) <= 4) {
        this.teams[enemySide].vp = Math.max(0, this.teams[enemySide].vp - 1);
      }
      this.advanceChallenge(side, 'push_2_times');
      hitEnemy = enemySide;
    } else if (card.id === 'flux_wall') {
      if (!this.isInside(tx, ty)) return { ok: false, error: 'Posição inválida.' };
      if (this.manhattan(unit.x, unit.y, tx, ty) > card.range) return { ok: false, error: 'Fora do alcance da Barreira de Fluxo.' };
      if (this.hasWall(tx, ty) || this.unitAt(tx, ty) ||
          (this.crown.holder === null && this.crown.x === tx && this.crown.y === ty)) {
        return { ok: false, error: 'Não é possível erguer barreira nessa casa.' };
      }
      this.walls.push({ x: tx, y: ty, expiresAtRound: this.round + card.durationRounds, owner: side });
    } else if (card.id === 'crown_dash') {
      if (!this.isInside(tx, ty)) return { ok: false, error: 'Destino fora do mapa.' };
      const dx = Math.abs(tx - unit.x);
      const dy = Math.abs(ty - unit.y);
      if (!((dx === 0 && dy > 0 && dy <= 3) || (dy === 0 && dx > 0 && dx <= 3))) {
        return { ok: false, error: 'Impulso Real exige linha reta de até 3 casas.' };
      }
      if (this.hasWall(tx, ty) || this.unitAt(tx, ty)) return { ok: false, error: 'Destino bloqueado.' };
      if (this.crown.holder === null && this.crown.x === tx && this.crown.y === ty && this.crown.recoverCooldown[side] > 0) {
        return { ok: false, error: 'Você acabou de perder a Coroa! Aguarde 1 turno para recuperá-la.' };
      }
      unit.x = tx;
      unit.y = ty;
      this.checkCrownCapture(side);
    } else if (card.id === 'kinetic_push') {
      if (this.manhattan(unit.x, unit.y, enemyUnit.x, enemyUnit.y) > card.range) {
        return { ok: false, error: 'Inimigo fora do alcance do Golpe de Cerco (2 casas).' };
      }
      const oldPos = { x: enemyUnit.x, y: enemyUnit.y };
      const pushRes = this.pushUnitAway(unit, enemyUnit);
      if (this.crown.holder === enemySide) {
        if (this.crown.protectionTurns > 0) {
          this.logEvent('crown_protected_hit', side, { targetSide: enemySide, protectionTurns: this.crown.protectionTurns });
        } else {
          this.teams[enemySide].vp = 0;
          this.crown.recoverCooldown[enemySide] = 1;
          this.crown.holder = null;
          this.crown.x = oldPos.x;
          this.crown.y = oldPos.y;
          this.logEvent('crown_dropped', side, { x: oldPos.x, y: oldPos.y, targetSide: enemySide });
        }
      }
      hitEnemy = enemySide;
      if (pushRes.pushed) {
        this.advanceChallenge(side, 'push_2_times');
        this.logEvent('knockback', side, { targetSide: enemySide, to: pushRes.to });
      }
    } else if (card.id === 'royal_charge') {
      if (!this.isInside(tx, ty)) return { ok: false, error: 'Destino fora do mapa.' };
      const dx = Math.abs(tx - unit.x), dy = Math.abs(ty - unit.y);
      if (!((dx === 0 && dy > 0 && dy <= 2) || (dy === 0 && dx > 0 && dx <= 2))) {
        return { ok: false, error: 'Investida Real exige linha reta de até 2 casas.' };
      }
      if (this.hasWall(tx, ty) || this.unitAt(tx, ty)) return { ok: false, error: 'Destino bloqueado.' };
      if (this.crown.holder === null && this.crown.x === tx && this.crown.y === ty && this.crown.recoverCooldown[side] > 0) {
        return { ok: false, error: 'Você acabou de perder a Coroa! Aguarde 1 turno para recuperá-la.' };
      }
      unit.x = tx;
      unit.y = ty;
      this.checkCrownCapture(side);
      if (this.manhattan(unit.x, unit.y, enemyUnit.x, enemyUnit.y) === 1) {
        const pushRes = this.pushUnitAway(unit, enemyUnit);
        if (pushRes.pushed) {
          hitEnemy = enemySide;
          this.advanceChallenge(side, 'push_2_times');
          this.logEvent('knockback', side, { targetSide: enemySide, to: pushRes.to });
        }
      }
    } else if (card.id === 'transposition') {
      if (this.crown.holder === side && this.crown.protectionTurns > 0) {
        return { ok: false, error: 'Transposição bloqueada enquanto a Coroa está sob proteção de captura.' };
      }
      const wallIdx = this.walls.findIndex(w => w.x === tx && w.y === ty && w.owner === side);
      if (wallIdx < 0 || this.manhattan(unit.x, unit.y, tx, ty) > card.range) {
        return { ok: false, error: 'Selecione uma Barreira de Fluxo sua a até 5 casas.' };
      }
      const oldX = unit.x, oldY = unit.y;
      unit.x = tx;
      unit.y = ty;
      this.walls[wallIdx].x = oldX;
      this.walls[wallIdx].y = oldY;
    } else if (card.id === 'stamina_overcharge') {
      team.ap += 2;
      team.nextTurnDeltaAp -= 1;
    }

    team.ap -= card.cost;
    team.hand.splice(cardIdx, 1);
    this.advanceChallenge(side, 'play_3_cards');
    this.logEvent('card_played', side, {
      cardId: card.id,
      cardName: card.name,
      target: card.targetType === 'cell' ? { x: tx, y: ty } : { targetSide: enemySide },
      apLeft: team.ap
    });
    return { ok: true, card, hitEnemy };
  }

  spawnFluxZones() {
    this.fluxZones = [];
    const candidates = [];
    for (let y = 2; y < this.boardSize - 2; y++) {
      for (let x = 2; x < this.boardSize - 2; x++) {
        if (!this.hasWall(x, y) && !this.unitAt(x, y) && !(this.crown.holder === null && this.crown.x === x && this.crown.y === y)) {
          candidates.push({ x, y });
        }
      }
    }
    candidates.sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(2, candidates.length); i++) {
      this.fluxZones.push({ x: candidates[i].x, y: candidates[i].y, expiresAtRound: this.round + 2 });
    }
    if (this.fluxZones.length) this.logEvent('flux_zones', null, { zones: this.fluxZones });
  }

  endTurn(side, reason = 'manual') {
    if (this.over || this.phase !== 'turn' || side !== this.activeSide) return { ok: false };
    if (this.autoEndTimer) {
      clearTimeout(this.autoEndTimer);
      this.autoEndTimer = null;
    }
    this.autoEnding = false;
    const team = this.teams[side];
    const unit = this.units[side];
    const ms = this.recordTurnTime(side, reason);
    this.logEvent('turn_end', side, { ms, reason });
    team.ap = 0;

    // Zona de Fluxo: terminar o turno sobre ela concede +1 PA no próximo turno
    if (this.fluxZones.some(z => z.x === unit.x && z.y === unit.y)) {
      team.nextTurnDeltaAp += 1;
      this.logEvent('flux_zone_bonus', side, { x: unit.x, y: unit.y });
    }

    // Mini-objetivo: terminar turno no centro (linhas/colunas 4..7 em 0-based)
    if (unit.x >= 4 && unit.x <= 7 && unit.y >= 4 && unit.y <= 7) {
      this.advanceChallenge(side, 'center_2_turns');
    }

    // Expira cooldown de recuperação do jogador que acabou de jogar o turno sem poder pegar a Coroa
    if (this.crown.recoverCooldown[side] > 0) {
      this.crown.recoverCooldown[side] = Math.max(0, this.crown.recoverCooldown[side] - 1);
    }
    // Expira proteção da Coroa ao fim do turno do adversário do portador
    if (this.crown.holder !== null && this.crown.holder !== side && this.crown.protectionTurns > 0) {
      this.crown.protectionTurns = Math.max(0, this.crown.protectionTurns - 1);
    }

    if (this.crown.holder === side) {
      team.vp += 1;
      this.logEvent('crown_vp', side, { vp: team.vp, goal: TACTICAL_CROWN_HOLD_GOAL });
      if (team.vp === 2) {
        // Vantagem gradual equilibrada no 2º turno de posse: compra 1 carta bônus
        const draw = randomCardChoices(1)[0];
        team.hand.push(draw);
        this.logEvent('crown_streak_bonus', side, { cardName: draw.name });
      }
      if (team.vp >= TACTICAL_CROWN_HOLD_GOAL) {
        this.finish(side, `Domínio da Coroa concluído (${TACTICAL_CROWN_HOLD_GOAL} turnos)!`);
        return { ok: true, ended: true };
      }
    }

    if (side === 0) {
      this.startTurnFor(1);
      return { ok: true, phase: 'turn' };
    }

    this.walls = this.walls.filter(w => w.expiresAtRound > this.round);
    this.fluxZones = this.fluxZones.filter(z => z.expiresAtRound > this.round);
    if (this.round % 2 === 0 && this.fluxZones.length === 0) {
      this.spawnFluxZones();
    }
    if (this.round % 3 === 0) {
      this.startDraftPhase();
      return { ok: true, phase: 'draft' };
    }

    this.round += 1;
    this.startTurnFor(0);
    return { ok: true, phase: 'turn' };
  }

  startTurnFor(side) {
    this.phase = 'turn';
    this.activeSide = side;
    const team = this.teams[side];
    const crownPenalty = this.crown.holder === side ? TACTICAL_CROWN_PA_PENALTY : 0;
    const base = Math.max(1, TACTICAL_BASE_PA - crownPenalty + team.nextTurnDeltaAp);
    team.nextTurnDeltaAp = 0;
    team.ap = base;
    const now = Date.now();
    this.turnDeadline = now + TACTICAL_TURN_MS;
    this.turnStartedAt = now;
    this.turnPausedMs = 0;
    this.pauseStartedAt = null;
    this.syncClockPause(now);
    this.logEvent('turn_start', side, { ap: team.ap, hasCrown: this.crown.holder === side });
  }

  startDraftPhase() {
    this.phase = 'draft';
    this.draftDeadline = Date.now() + TACTICAL_DRAFT_MS;
    for (const team of this.teams) {
      team.draftOptions = randomCardChoices(3);
      team.draftPicked = false;
    }
    this.logEvent('draft_start', null, { round: this.round });
  }

  pickDraftCard(side, cardUid) {
    if (this.over || this.phase !== 'draft') return { ok: false, error: 'Não estamos na Fase de Draft.' };
    const team = this.teams[side];
    if (team.draftPicked) return { ok: false, error: 'Você já escolheu sua carta.' };
    const chosen = team.draftOptions.find(c => c.uid === cardUid) || team.draftOptions[0];
    if (chosen) {
      team.hand.push({ ...chosen });
      team.draftPicked = true;
      this.logEvent('draft_pick', side, { cardId: chosen.id, cardName: chosen.name });
    }
    if (this.teams.every(t => t.draftPicked)) {
      this.round += 1;
      this.startTurnFor(0);
      return { ok: true, draftCompleted: true };
    }
    return { ok: true, draftCompleted: false };
  }

  onPlayerDisconnect(uid) {
    if (this.over || this.disconnects.has(uid)) return;
    const now = Date.now();
    const frozenRemainingMs = this.phase === 'turn'
      ? Math.max(3000, this.turnDeadline - now)
      : Math.max(2000, this.draftDeadline - now);
    this.disconnects.set(uid, { at: now, frozenRemainingMs });
    this.syncClockPause(now);
  }

  onPlayerReconnect(uid) {
    const info = this.disconnects.get(uid);
    if (!info) return;
    const now = Date.now();
    if (this.phase === 'turn') this.turnDeadline = now + info.frozenRemainingMs;
    else this.draftDeadline = now + info.frozenRemainingMs;
    this.disconnects.delete(uid);
    this.syncClockPause(now);
  }

  tick(now) {
    if (this.over) return null;
    for (const [uid, info] of this.disconnects) {
      if (now - info.at > TACTICAL_RECONNECT_MS) {
        const winner = 1 - this.players.indexOf(uid);
        this.finish(winner, 'Desconexão: um jogador não reconectou em 30s.', 'disconnect');
        return 'ended';
      }
    }
    if (this.disconnects.size > 0) return null;
    if (this.phase === 'draft' && now >= this.draftDeadline) {
      for (const team of this.teams) {
        if (!team.draftPicked && team.draftOptions.length > 0) {
          team.hand.push({ ...team.draftOptions[0] });
          team.draftPicked = true;
        }
      }
      this.round += 1;
      this.startTurnFor(0);
      return 'draft_ended';
    }
    if (this.phase === 'turn' && now >= this.turnDeadline) {
      this.endTurn(this.activeSide, 'timeout');
      if (this.over) return 'ended';
      return 'turn_timeout';
    }
    return null;
  }

  finish(winnerSide, reason, resultType = 'vp') {
    if (this.over) return;
    if (this.autoEndTimer) { clearTimeout(this.autoEndTimer); this.autoEndTimer = null; }
    this.autoEnding = false;
    this.syncClockPause();
    this.over = true;
    this.winner = winnerSide;
    this.reason = reason;
    this.resultType = resultType;
    this.endedAt = Date.now();
    this.logEvent('match_end', winnerSide, { reason, resultType });
    botController.clear(this.id);
    recordTacticalResult(this);
  }

  // Descarta a partida sem registrar resultado (saída de partida contra bot / tutorial)
  discard(reason) {
    if (this.over) return;
    if (this.autoEndTimer) { clearTimeout(this.autoEndTimer); this.autoEndTimer = null; }
    this.autoEnding = false;
    this.over = true;
    this.discarded = true;
    this.winner = null;
    this.reason = reason;
    this.resultType = 'discarded';
    this.endedAt = Date.now();
    botController.clear(this.id);
  }

  playerLabel(side) {
    const uid = this.players[side];
    if (isBotUid(uid)) return this.isTutorial ? 'Mentor Rubi (Tutorial)' : 'CrownBot (CPU)';
    const u = db.users.find(x => x.id === uid);
    return u ? (u.displayName || u.username) : 'Jogador';
  }

  // Remove coordenadas de ações inimigas que a névoa de guerra deveria esconder
  sanitizeEventFor(ev, viewerSide, enemyVisible) {
    const out = { seq: ev.seq, t: ev.t, round: ev.round, type: ev.type, side: ev.side, data: { ...ev.data } };
    if (ev.side !== null && ev.side !== viewerSide && !enemyVisible) {
      if (ev.type === 'move') { delete out.data.from; delete out.data.to; }
      if (ev.type === 'card_played' && (ev.data.cardId === 'short_teleport' || ev.data.cardId === 'crown_dash')) {
        delete out.data.target;
      }
    }
    return out;
  }

  serializeFor(side) {
    const myUnit = this.units[side];
    const enemySide = 1 - side;
    const enemyUnit = this.units[enemySide];
    const enemyHasCrown = this.crown.holder === enemySide;
    const enemyVisible = enemyHasCrown ||
      this.manhattan(myUnit.x, myUnit.y, enemyUnit.x, enemyUnit.y) <= TACTICAL_VISION_RADIUS;
    const opponentId = this.players[enemySide];
    const opponentIsBot = isBotUid(opponentId);
    const opp = opponentIsBot ? null : db.users.find(u => u.id === opponentId);
    const me = db.users.find(u => u.id === this.players[side]);
    const now = Date.now();

    return {
      gameId: this.id,
      mode: this.mode,
      kind: this.isTutorial ? 'tutorial' : this.kind,
      side,
      over: this.over,
      winner: this.winner,
      reason: this.reason,
      resultType: this.resultType,
      phase: this.phase,
      round: this.round,
      activeSide: this.activeSide,
      turnRemainingMs: Math.max(0, this.turnDeadline - now),
      draftRemainingMs: Math.max(0, this.draftDeadline - now),
      boardSize: this.boardSize,
      frozen: this.disconnects.size > 0,
      autoEnding: this.autoEnding,
      opponentIsBot,
      self: me ? { username: me.username, displayName: me.displayName || me.username } : { username: 'voce', displayName: 'Você' },
      opponent: opponentIsBot
        ? { username: this.isTutorial ? 'mentor' : 'crownbot', displayName: this.playerLabel(enemySide), isBot: true }
        : (opp ? { username: opp.username, displayName: opp.displayName || opp.username } : { username: 'oponente', displayName: 'Oponente' }),
      rules: {
        targetVp: TACTICAL_CROWN_HOLD_GOAL,
        crownHoldGoal: TACTICAL_CROWN_HOLD_GOAL,
        basePa: TACTICAL_BASE_PA,
        crownPaPenalty: TACTICAL_CROWN_PA_PENALTY,
        turnLimitMs: TACTICAL_TURN_MS,
        draftMs: TACTICAL_DRAFT_MS,
        draftEveryRounds: 3,
        visionRadius: TACTICAL_VISION_RADIUS,
        reconnectMs: TACTICAL_RECONNECT_MS
      },
      clock: {
        phase: this.phase,
        activeSide: this.activeSide,
        elapsedMs: this.over ? 0 : this.currentTurnElapsed(now),
        paused: this.isClockPaused() || this.over,
        limitMs: TACTICAL_TURN_MS,
        remainingMs: this.isClockPaused()
          ? Math.max(0, TACTICAL_TURN_MS - this.currentTurnElapsed(now))
          : Math.max(0, this.turnDeadline - now)
      },
      turnTimes: this.turnTimes.slice(-12),
      recentEvents: this.replayLog.slice(-14).map(ev => this.sanitizeEventFor(ev, side, enemyVisible || this.over)),
      durationMs: (this.endedAt || now) - this.createdAt,
      myUnit,
      enemyUnit: (enemyVisible || this.over) ? { ...enemyUnit, revealedByCrown: enemyHasCrown } : null,
      crown: { ...this.crown, myRecoverCooldown: this.crown.recoverCooldown[side] || 0 },
      walls: this.walls.map(w => ({ x: w.x, y: w.y, expiresAtRound: w.expiresAtRound, owner: w.owner })),
      fluxZones: this.fluxZones.map(z => ({ x: z.x, y: z.y, expiresAtRound: z.expiresAtRound })),
      myTeam: {
        vp: this.teams[side].vp,
        ap: this.teams[side].ap,
        hand: this.teams[side].hand,
        challenge: this.teams[side].challenge,
        draftOptions: this.phase === 'draft' && !this.teams[side].draftPicked ? this.teams[side].draftOptions : []
      },
      enemyTeam: {
        vp: this.teams[enemySide].vp,
        ap: this.teams[enemySide].ap,
        handCount: this.teams[enemySide].hand.length
      },
      replayLog: this.over ? this.replayLog : undefined
    };
  }
}

function isBotUid(uid) {
  return String(uid || '').startsWith('bot:');
}

class BotController {
  constructor() {
    this.pendingTimers = new Map(); // gameId -> timeoutId
  }

  clear(gameId) {
    const t = this.pendingTimers.get(gameId);
    if (t) {
      clearTimeout(t);
      this.pendingTimers.delete(gameId);
    }
  }

  humanDelay(minMs = 1000, maxMs = 2000) {
    return Math.floor(minMs + Math.random() * (maxMs - minMs));
  }

  // BFS para menor caminho até (targetX, targetY) evitando paredes e unidades
  findNextStep(game, fromX, fromY, targetX, targetY) {
    const queue = [[fromX, fromY, null]];
    const visited = new Set([`${fromX},${fromY}`]);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    while (queue.length > 0) {
      const [cx, cy, firstStep] = queue.shift();
      if (cx === targetX && cy === targetY) return firstStep;

      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        const key = `${nx},${ny}`;
        if (visited.has(key) || !game.isInside(nx, ny) || game.hasWall(nx, ny)) continue;
        const occ = game.unitAt(nx, ny);
        if (occ && !(nx === targetX && ny === targetY)) continue;
        visited.add(key);
        queue.push([nx, ny, firstStep || { x: nx, y: ny }]);
      }
    }
    return null;
  }

  scheduleTurn(game, botSide) {
    if (game.over || game.phase !== 'turn' || game.activeSide !== botSide || game.tutorialFrozen) return;
    this.clear(game.id);
    const step = () => {
      if (game.over || game.phase !== 'turn' || game.activeSide !== botSide || game.tutorialFrozen || game.autoEnding) return;
      const acted = this.executeSingleAction(game, botSide);
      if (acted && !game.over && game.hasAnyValidAction(botSide)) {
        this.pendingTimers.set(game.id, setTimeout(step, this.humanDelay(900, 1500)));
      } else if (!game.over && game.phase === 'turn' && game.activeSide === botSide && !game.autoEnding) {
        if (!game.hasAnyValidAction(botSide)) {
          scheduleAutoEndTurn(game, botSide);
        } else {
          this.pendingTimers.set(game.id, setTimeout(() => {
            if (game.over || game.phase !== 'turn' || game.activeSide !== botSide || game.autoEnding) return;
            const res = game.endTurn(botSide);
            if (res.ended) publishTactical(game, 'game:ended');
            else if (res.phase === 'draft') {
              publishTactical(game, 'tactical:startDraft');
              this.scheduleDraft(game, botSide);
            } else {
              publishTactical(game, 'tactical:state');
              this.maybeAct(game);
            }
          }, this.humanDelay(700, 1200)));
        }
      }
    };
    this.pendingTimers.set(game.id, setTimeout(step, this.humanDelay(800, 1400)));
  }

  executeSingleAction(game, botSide) {
    const team = game.teams[botSide];
    const unit = game.units[botSide];
    const enemySide = 1 - botSide;
    const enemyUnit = game.units[enemySide];
    if (team.ap <= 0) return false;

    // 0. Usa Sobrecarga de Estamina se tiver pouca energia e puder agir
    const overcharge = team.hand.find(c => c.id === 'stamina_overcharge');
    if (overcharge && team.ap <= 1) {
      const res = game.playCard(botSide, overcharge.uid);
      if (res.ok) {
        publishTactical(game, 'tactical:state');
        return true;
      }
    }

    // 1. Se o inimigo tem a Coroa, prioriza combate direto / cartas ofensivas (respeitando proteção)
    if (game.crown.holder === enemySide) {
      if (game.crown.protectionTurns === 0 && game.manhattan(unit.x, unit.y, enemyUnit.x, enemyUnit.y) === 1 && team.ap >= 1) {
        const res = game.attackUnit(botSide, enemyUnit.x, enemyUnit.y);
        if (res.ok) {
          publishTactical(game, 'tactical:cardEffect', { effect: 'melee_attack', hitSide: enemySide, crownOutcome: res.crownOutcome, crownProtectedBlocked: res.crownProtectedBlocked });
          return true;
        }
      }
      const push = team.hand.find(c => c.id === 'kinetic_push' && team.ap >= c.cost);
      if (push && game.crown.protectionTurns === 0 && game.manhattan(unit.x, unit.y, enemyUnit.x, enemyUnit.y) <= push.range) {
        const res = game.playCard(botSide, push.uid);
        if (res.ok) {
          publishTactical(game, 'tactical:cardEffect', { effect: res.card.id, hitSide: enemySide });
          return true;
        }
      }
      const siphon = team.hand.find(c => c.id === 'flux_siphon' && team.ap >= c.cost);
      if (siphon) {
        const res = game.playCard(botSide, siphon.uid);
        if (res.ok) {
          publishTactical(game, 'tactical:cardEffect', { effect: res.card.id, hitSide: enemySide });
          return true;
        }
      }
      const chase = this.findNextStep(game, unit.x, unit.y, enemyUnit.x, enemyUnit.y);
      if (chase && team.ap >= 1) {
        const res = game.moveUnit(botSide, chase.x, chase.y);
        if (res.ok) {
          publishTactical(game, 'tactical:state');
          return true;
        }
      }
    }

    // 2. Se a Coroa está livre, calcula menor caminho e anda até ela (ou usa Teleporte Curto)
    if (game.crown.holder === null) {
      const distToCrown = game.manhattan(unit.x, unit.y, game.crown.x, game.crown.y);
      const tp = team.hand.find(c => c.id === 'short_teleport' && team.ap >= c.cost);
      if (tp && distToCrown === 2 && !game.hasWall(game.crown.x, game.crown.y) && !game.unitAt(game.crown.x, game.crown.y)) {
        const res = game.playCard(botSide, tp.uid, { x: game.crown.x, y: game.crown.y });
        if (res.ok) {
          publishTactical(game, 'tactical:state');
          return true;
        }
      }
      const next = this.findNextStep(game, unit.x, unit.y, game.crown.x, game.crown.y);
      if (next && team.ap >= 1) {
        const res = game.moveUnit(botSide, next.x, next.y);
        if (res.ok) {
          publishTactical(game, 'tactical:state');
          return true;
        }
      }
    }

    // 3. Caso contrário, aproxima-se do oponente ou ergue Parede de Fluxo
    const wallCard = team.hand.find(c => c.id === 'flux_wall' && team.ap >= c.cost);
    if (wallCard && game.manhattan(unit.x, unit.y, enemyUnit.x, enemyUnit.y) <= wallCard.range) {
      const wx = Math.round((unit.x + enemyUnit.x) / 2);
      const wy = Math.round((unit.y + enemyUnit.y) / 2);
      const res = game.playCard(botSide, wallCard.uid, { x: wx, y: wy });
      if (res.ok) {
        publishTactical(game, 'tactical:state');
        return true;
      }
    }

    const stepToEnemy = this.findNextStep(game, unit.x, unit.y, enemyUnit.x, enemyUnit.y);
    if (stepToEnemy && team.ap >= 1) {
      const res = game.moveUnit(botSide, stepToEnemy.x, stepToEnemy.y);
      if (res.ok) {
        publishTactical(game, 'tactical:state');
        return true;
      }
    }
    return false;
  }

  scheduleDraft(game, botSide) {
    if (game.over || game.phase !== 'draft' || game.teams[botSide].draftPicked) return;
    // Delay de 3 a 5 segundos simulando escolha humana no Draft
    setTimeout(() => {
      if (game.over || game.phase !== 'draft' || game.teams[botSide].draftPicked || game.tutorialFrozen) return;
      const opts = game.teams[botSide].draftOptions;
      if (opts.length === 0) return;
      const pick = opts[Math.floor(Math.random() * opts.length)];
      game.pickDraftCard(botSide, pick.uid);
      publishTactical(game, 'tactical:state');
      this.maybeAct(game);
    }, this.humanDelay(3000, 5000));
  }

  maybeAct(game) {
    if (game.over || game.tutorialFrozen) return;
    for (let side = 0; side < 2; side++) {
      if (!isBotUid(game.players[side])) continue;
      if (game.phase === 'turn' && game.activeSide === side) this.scheduleTurn(game, side);
      else if (game.phase === 'draft' && !game.teams[side].draftPicked) this.scheduleDraft(game, side);
    }
  }
}

const botController = new BotController();

class TutorialRoom extends TacticalDraftMatch {
  constructor(playerUid) {
    const botUid = `bot:tutor:${id().slice(0, 6)}`;
    super({
      id: id(),
      kind: 'tutorial',
      players: [playerUid, botUid],
      options: { mode: 'tactical_draft', isTutorial: true }
    });
    this.isTutorial = true;
    this.tutorialStep = 1; // 1: PA & Movimento, 2: Draft, 3: Coroa & Debuff
    this.tutorialFrozen = true;
    this.frozenRemainingMs = TACTICAL_TURN_MS;
    this.syncClockPause();

    // Posições e Coroa fixas para o roteiro do tutorial
    this.units = [
      { side: 0, x: 2, y: 5, hp: 3 },
      { side: 1, x: 9, y: 5, hp: 3 }
    ];
    this.crown = { x: 4, y: 5, holder: null };
    this.teams[0].hand = [
      { ...CARD_CATALOG.short_teleport, uid: id() },
      { ...CARD_CATALOG.flux_wall, uid: id() }
    ];
  }

  freezeForStep(step) {
    this.tutorialStep = step;
    this.tutorialFrozen = true;
    const now = Date.now();
    this.frozenRemainingMs = this.phase === 'draft'
      ? Math.max(4000, this.draftDeadline - now)
      : Math.max(10_000, this.turnDeadline - now);
    this.syncClockPause(now);
  }

  completeTutorialStep(step) {
    if (Number(step) !== this.tutorialStep || !this.tutorialFrozen) return false;
    this.tutorialFrozen = false;
    const now = Date.now();
    if (this.phase === 'draft') this.draftDeadline = now + this.frozenRemainingMs;
    else this.turnDeadline = now + this.frozenRemainingMs;
    this.syncClockPause(now);
    if (!this.hasAnyValidAction(this.activeSide)) scheduleAutoEndTurn(this, this.activeSide);
    botController.maybeAct(this);
    return true;
  }

  checkCrownCapture(side) {
    const captured = super.checkCrownCapture(side);
    if (captured && side === 0 && this.tutorialStep < 3) {
      this.freezeForStep(3);
    }
    return captured;
  }

  startDraftPhase() {
    this.phase = 'draft';
    this.draftDeadline = Date.now() + TACTICAL_DRAFT_MS;
    this.teams[0].draftOptions = [
      { ...CARD_CATALOG.short_teleport, uid: id() },
      { ...CARD_CATALOG.flux_siphon, uid: id() },
      { ...CARD_CATALOG.flux_wall, uid: id() }
    ];
    this.teams[0].draftPicked = false;
    this.teams[1].draftOptions = randomCardChoices(3);
    this.teams[1].draftPicked = false;
    this.logEvent('draft_start', null, { round: this.round, scripted: true });
    if (this.tutorialStep < 2) this.freezeForStep(2);
  }

  tick(now) {
    if (this.tutorialFrozen) return null;
    return super.tick(now);
  }

  serializeFor(side) {
    const base = super.serializeFor(side);
    base.isTutorial = true;
    base.tutorialStep = this.tutorialStep;
    base.tutorialFrozen = this.tutorialFrozen;
    return base;
  }
}

// Registra o resultado de uma partida do Cerco Tático no histórico/estatísticas
function recordTacticalResult(game) {
  if (game.recorded || game.discarded) return;
  game.recorded = true;
  if (game.isTutorial) return; // Tutorial é treino guiado: não entra no histórico
  const humans = game.players.filter(uid => !isBotUid(uid));
  const vsBot = humans.length < 2;
  const reasonLabel = {
    vp: 'Domínio da Coroa',
    resign: 'Desistência',
    abandon: 'Abandono',
    disconnect: 'Desconexão'
  }[game.resultType] || 'Fim de partida';
  const users = game.players.map(uid => isBotUid(uid) ? null : db.users.find(u => u.id === uid));

  if (!vsBot && users[0] && users[1]) {
    const [a, b] = users;
    a.games = (a.games || 0) + 1;
    b.games = (b.games || 0) + 1;
    if (game.winner === 0) { a.wins = (a.wins || 0) + 1; b.losses = (b.losses || 0) + 1; }
    else if (game.winner === 1) { b.wins = (b.wins || 0) + 1; a.losses = (a.losses || 0) + 1; }
    else { a.draws = (a.draws || 0) + 1; b.draws = (b.draws || 0) + 1; }
  }

  db.games.unshift({
    id: game.id,
    mode: vsBot ? 'tactical_cpu' : 'tactical',
    players: [...game.players],
    opponentName: vsBot ? 'CrownBot (CPU)' : undefined,
    winner: game.winner,
    reason: `${reasonLabel}: ${game.reason}`.slice(0, 140),
    duration: Math.max(1, Math.floor(((game.endedAt || Date.now()) - game.createdAt) / 1000)),
    createdAt: nowIso(),
    scores: game.teams.map(t => t.vp),
    options: { mode: 'tactical_draft', rounds: game.round }
  });
  db.games = db.games.slice(0, 5000);
  persistDb();
  for (const u of users) {
    if (u) sendUser(u.id, 'profile:stats', { user: safeUser(u, true, true), games: userHistoryPayload(u.id) });
  }
}

// Saída voluntária (botão "Voltar ao menu"). Regras:
// - Contra bot/tutorial: a partida é descartada (sem registro) e removida da memória.
// - Contra pessoa: conta como Abandono — a vitória vai para quem ficou.
// - Partida já encerrada: apenas libera o jogador; quando todos saem, a partida é removida.
function leaveTacticalMatch(uid) {
  const mine = [...activeGames.values()].filter(g =>
    g.mode === 'tactical_draft' && g.players.includes(uid) && !g.leftPlayers.has(uid));
  const game = mine.find(g => !g.over) || mine.sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0))[0];
  if (!game) return { ok: true, outcome: 'none' };
  const side = game.players.indexOf(uid);
  const humans = game.players.filter(p => !isBotUid(p));
  let outcome = 'left';
  if (!game.over) {
    if (humans.length < 2) {
      game.discard('Partida encerrada pelo jogador.');
      outcome = 'discarded';
    } else {
      game.finish(1 - side, `${game.playerLabel(side)} saiu da partida.`, 'abandon');
      outcome = 'abandon';
      publishTactical(game, 'game:ended');
    }
  }
  game.leftPlayers.add(uid);
  if (humans.every(h => game.leftPlayers.has(h))) activeGames.delete(game.id);
  notifyPresence(uid);
  return { ok: true, outcome };
}

function scheduleAutoEndTurn(game, side) {
  if (game.over || game.phase !== 'turn' || game.activeSide !== side || game.autoEnding || game.tutorialFrozen) return false;
  if (game.hasAnyValidAction(side)) return false;
  game.autoEnding = true;
  game.autoEndTimer = setTimeout(() => {
    game.autoEndTimer = null;
    if (game.over || game.phase !== 'turn' || game.activeSide !== side) return;
    const res = game.endTurn(side, 'auto_no_actions');
    if (!res.ok) return;
    if (res.ended) {
      publishTactical(game, 'game:ended');
    } else if (res.phase === 'draft') {
      publishTactical(game, 'tactical:startDraft', { autoEnded: true });
      botController.maybeAct(game);
    } else {
      publishTactical(game, 'tactical:state', { autoEnded: true });
      botController.maybeAct(game);
    }
  }, TACTICAL_AUTO_END_MS);
  return true;
}

function publishTactical(game, type = 'tactical:state', extra = {}) {
  for (let side = 0; side < 2; side++) {
    sendUser(game.players[side], type, { state: game.serializeFor(side), ...extra });
  }
  if (game.over) {
    for (const uid of game.players) notifyPresence(uid);
  }
}

function beginRoom(room) {
  if (room.players.length !== 2 || room.gameId) return;
  const game = room.options?.mode === 'tactical_draft'
    ? new TacticalDraftMatch(room)
    : room.options?.mode === 'classic'
      ? makeClassicGame(room)
    : makeGame(room);
  room.gameId = game.id;
  activeGames.set(game.id, game);
  for (let side = 0; side < 2; side++) {
    const state = game.mode === 'tactical_draft' ? game.serializeFor(side) : serializeGame(game, side);
    sendUser(room.players[side], 'game:started', {
      state,
      roomCode: room.code || null
    });
    notifyPresence(room.players[side]);
  }
}

function randomRoomCode(len = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < len; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

function createRoom(players, kind = 'private', options = {}) {
  for (const player of players) {
    const queued = queue.indexOf(player);
    if (queued >= 0) queue.splice(queued, 1);
    const classicQueued = classicQueue.findIndex(entry => entry.uid === player);
    if (classicQueued >= 0) classicQueue.splice(classicQueued, 1);
    const tacticalQueued = tacticalQueue.indexOf(player);
    if (tacticalQueued >= 0) tacticalQueue.splice(tacticalQueued, 1);
  }
  const cleanOpts = sanitizeMatchOptions(options);
  const codeLen = cleanOpts.mode === 'tactical_draft' ? 4 : 6;
  const room = {
    id: id(),
    code: kind === 'private' ? randomRoomCode(codeLen) : null,
    kind,
    options: cleanOpts,
    players: [...players],
    createdAt: Date.now(),
    gameId: null
  };
  rooms.set(room.id, room);
  if (players.length === 2) beginRoom(room);
  return room;
}

function gameForSocket(ws) {
  if (!ws.userId) return null;
  return findGameFor(ws.userId);
}

function handleMove(ws, msg) {
  const game = gameForSocket(ws);
  if (!game) return sendError(ws, 'Você não está em uma partida ativa.', 'NO_GAME');
  const side = game.players.indexOf(ws.userId);
  if (game.mode === 'classic') {
    const now = Date.now();
    const elapsed = Math.max(0, (now - game.lastTick) / 1000);
    game.clocks[game.turn] = Math.max(0, game.clocks[game.turn] - elapsed);
    game.T += elapsed;
    game.lastTick = now;
    if (game.clocks[game.turn] <= 0) {
      const winner = classicCanMate(game, 1 - game.turn) ? 1 - game.turn : null;
      finishGame(game, winner, winner === null ? 'Tempo esgotado, mas não há material para dar mate: empate.' : 'Tempo esgotado.');
      publishGame(game, 'game:ended');
      return;
    }
    if (side !== game.turn) return sendError(ws, 'Ainda não é a sua vez.', 'NOT_YOUR_TURN');
    const p = game.pieces.find(piece => piece.id === Number(msg.pieceId));
    if (!p || p.owner !== side) return sendError(ws, 'Você só pode mover suas próprias peças.', 'NOT_YOUR_PIECE');
    const x = Number(msg.x), y = Number(msg.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= 8 || y >= 8 ||
      !classicLegalMoves(game, p).some(([a, b]) => a === x && b === y)) {
      return sendError(ws, 'Movimento ilegal no xadrez clássico.', 'ILLEGAL_MOVE');
    }
    applyClassicMove(game, p, x, y);
    return;
  }
  const p = game.pieces.find(piece => piece.id === Number(msg.pieceId));
  if (!p || p.owner !== side) return sendError(ws, 'Você só pode mover suas próprias peças.', 'NOT_YOUR_PIECE');
  if (p.ready > game.T) return sendError(ws, 'Essa peça ainda está se recuperando.', 'COOLDOWN');
  const x = Number(msg.x), y = Number(msg.y);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= BOARD || y >= BOARD) {
    return sendError(ws, 'Destino inválido.', 'BAD_MOVE');
  }
  if (!pieceMoves(game, p).some(([a, b]) => a === x && b === y)) {
    return sendError(ws, 'Movimento não permitido.', 'ILLEGAL_MOVE');
  }
  const fromX = p.x, fromY = p.y, target = game.grid[y][x];
  const hadCapture = Boolean(target);
  if (target?.shield > 0) {
    target.shield--;
    const bounceCd = Math.max(0.4, PIECE_COOLDOWN[p.type] * 0.7);
    p.cooldown = bounceCd;
    p.ready = game.T + bounceCd;
    addEvent(game, `🛡️ A Égide Real de ${TEAM[target.owner]?.name || 'uma peça'} bloqueou o golpe!`);
    setDecisiveMoment(game, 'Escudo Real Ativado!', 'O ataque foi absorvido pela proteção de Éter.', 'blue');
    publishGame(game);
    return;
  }
  if (target) {
    const owner = target.owner, value = PIECE_VALUE[target.type] || 1;
    const wasCrownHolder = game.crown && game.crown.state === 'held' && game.crown.holderId === target.id;
    award(game, side, value);
    removePiece(game, target);
    if (wasCrownHolder && owner >= 0) {
      game.crown.state = 'free';
      game.crown.holderId = null;
      game.crown.owner = -1;
      game.crown.x = x;
      game.crown.y = y;
      game.crown.dropCooldownOwner = owner;
      game.crown.dropCooldownUntil = game.T + 3.5;
      game.teams[owner].crownProgress = Math.max(0, (game.teams[owner].crownProgress || 0) - 12);
      award(game, side, 4);
      game.teams[side].energy = Math.min(100, game.teams[side].energy + 28);
      addEvent(game, `⚔️ ${TEAM[side].name} derrubou o Portador da Coroa e ganhou bônus de Contra-Ataque!`);
      setDecisiveMoment(game, 'Portador da Coroa Derrubado!', `${TEAM[side].name} executou um contra-ataque real!`, 'red');
    }
    if (target.type === 'K' && owner >= 0) {
      game.teams[side].kings++;
      game.teams[owner].alive = false;
      finishGame(game, side, 'Regicídio: o Rei adversário foi capturado!', 'regicide');
    } else if (owner >= 0) {
      addEvent(game, `${TEAM[side].name} capturou ${target.type} de ${TEAM[owner].name}.`);
      if (target.type === 'Q' || target.type === 'R') {
        setDecisiveMoment(game, 'Peça Nobre Capturada!', `${TEAM[side].name} eliminou ${target.type === 'Q' ? 'a Rainha' : 'uma Torre'} adversária.`, 'gold');
      }
    } else {
      addEvent(game, `${TEAM[side].name} capturou uma guarda neutra.`);
    }
  }
  game.grid[p.y][p.x] = null;
  game.grid[y][x] = p;
  p.x = x;
  p.y = y;
  if (game.crown && game.crown.state === 'held' && game.crown.holderId === p.id) {
    game.crown.x = x;
    game.crown.y = y;
  }

  const distance = Math.max(Math.abs(x - fromX), Math.abs(y - fromY));
  const paceMult = game.options?.pace === 'fast' ? 0.8 : game.options?.pace === 'tactical' ? 1.25 : 1.0;
  const doc = game.teams[side].doctrine || 'vanguard';
  let cooldown = (PIECE_COOLDOWN[p.type] + (p.type === 'N' ? 0.25 : distance * 0.12)) * paceMult;

  if (doc === 'vanguard' && hadCapture && p.type !== 'P' && p.type !== 'K') cooldown *= 0.88;
  if (doc === 'bastion' && !hadCapture && (p.type === 'R' || p.type === 'Q')) cooldown *= 1.1;
  if (doc === 'celerity' && !hadCapture && (p.type === 'P' || p.type === 'N' || p.type === 'K')) cooldown *= 0.88;
  if (game.crown && game.crown.state === 'held' && game.crown.holderId === p.id) {
    cooldown *= (doc === 'celerity' ? 1.1 : 1.22);
  }
  if (p.chargeUntil && p.chargeUntil > game.T) {
    cooldown *= 0.55;
    p.chargeUntil = 0;
  }
  if (game.teams[side].boostUntil > game.T) cooldown *= 0.58;

  p.cooldown = cooldown;
  p.ready = game.T + cooldown;
  game.lastMove = { x0: fromX, y0: fromY, x1: x, y1: y, t: game.T, owner: side };
  if (p.type === 'P') {
    const [fx, fy] = TEAM[side].forward;
    if (x + fx < 0 || y + fy < 0 || x + fx >= BOARD || y + fy >= BOARD) {
      p.type = 'Q';
      addEvent(game, '👑 Promoção Real: um Peão alcançou a linha final e virou Rainha!');
      setDecisiveMoment(game, 'Promoção Real!', `${TEAM[side].name} promoveu um Peão a Rainha!`, 'gold');
    }
  }

  // Check if moved onto the free Crown
  if (game.crown && game.crown.state === 'free' && game.crown.x === x && game.crown.y === y) {
    if (game.crown.dropCooldownOwner === side && game.T < game.crown.dropCooldownUntil) {
      addEvent(game, 'A Coroa ainda está instável para sua facção por alguns instantes.');
    } else {
      game.crown.state = 'held';
      game.crown.holderId = p.id;
      game.crown.owner = side;
      game.crown.tributeTimer = 10;
      p.shield = Math.max(p.shield || 0, 1);
      addEvent(game, `👑 ${TEAM[side].name} reivindicou a Coroa Imperial e recebeu 1 Escudo Real!`);
      setDecisiveMoment(game, 'Coroa Imperial Conquistada!', `${TEAM[side].name} assumiu a Coroa e iniciou o Domínio Imperial!`, 'gold');
    }
  }

  collectOrb(game, p);
  publishGame(game, game.over ? 'game:ended' : 'game:state');
}

function handleSkill(ws, msg = {}) {
  const game = gameForSocket(ws);
  if (!game || game.mode === 'classic' || game.mode === 'tactical_draft') {
    return sendError(ws, 'Você não está em uma partida ativa compatível.', 'NO_GAME');
  }
  const side = game.players.indexOf(ws.userId);
  const team = game.teams[side];
  const skill = ['charge', 'aegis', 'surge'].includes(msg.skill) ? msg.skill : 'surge';
  const userRecord = db.users.find(u => u.id === ws.userId);

  if (skill === 'charge') {
    if (team.energy < 45) return sendError(ws, 'Investida Real requer 45% de Energia de Fluxo.', 'NOT_READY');
    const targetPiece = game.pieces.find(p => p.owner === side && p.id === Number(msg.pieceId)) ||
      game.pieces.filter(p => p.owner === side && p.ready > game.T).sort((a, b) => (PIECE_VALUE[b.type] || 1) - (PIECE_VALUE[a.type] || 1))[0] ||
      game.pieces.find(p => p.owner === side && p.type !== 'K');
    if (!targetPiece) return sendError(ws, 'Nenhuma peça disponível para Investida.', 'NO_TARGET');
    team.energy = Math.max(0, team.energy - 45);
    targetPiece.ready = game.T;
    targetPiece.chargeUntil = game.T + 4.5;
    addEvent(game, `⚔️ ${TEAM[side].name} usou Investida Real em ${targetPiece.type}!`);
  } else if (skill === 'aegis') {
    if (team.energy < 60) return sendError(ws, 'Égide Real requer 60% de Energia de Fluxo.', 'NOT_READY');
    if ((team.aegisCooldownUntil || 0) > game.T) {
      return sendError(ws, 'Égide Real ainda está em recarga.', 'COOLDOWN');
    }
    const targetPiece = game.pieces.find(p => p.owner === side && p.id === Number(msg.pieceId)) ||
      (game.crown?.owner === side ? game.pieces.find(p => p.id === game.crown.holderId) : null) ||
      game.pieces.find(p => p.owner === side && p.type === 'K');
    if (!targetPiece) return sendError(ws, 'Nenhuma peça disponível para Égide Real.', 'NO_TARGET');
    team.energy = Math.max(0, team.energy - 60);
    team.aegisCooldownUntil = game.T + 8;
    targetPiece.shield = 1;
    if (targetPiece.ready > game.T) {
      targetPiece.ready = game.T + (targetPiece.ready - game.T) * 0.5;
    }
    addEvent(game, `🛡️ ${TEAM[side].name} protegeu ${targetPiece.type} com Égide Real!`);
    setDecisiveMoment(game, 'Égide Real Invocada!', `${TEAM[side].name} blindou sua peça contra o próximo ataque.`, 'blue');
  } else {
    if (team.energy < 100) return sendError(ws, 'Surto Imperial requer 100% de Energia de Fluxo.', 'NOT_READY');
    team.energy = 0;
    const duration = team.doctrine === 'celerity' ? 5 : 6;
    team.boostUntil = game.T + duration;
    for (const p of game.pieces) {
      if (p.owner === side && p.ready > game.T) p.ready = game.T + (p.ready - game.T) * 0.48;
    }
    addEvent(game, `⚡ ${TEAM[side].name} ativou Surto Imperial por ${duration} segundos!`);
    setDecisiveMoment(game, 'Surto Imperial Ativado!', `O exército de ${TEAM[side].name} está sobrecarregado!`, 'gold');
  }

  if (userRecord) {
    userRecord.skillsUsed = (userRecord.skillsUsed || 0) + 1;
    unlockAchievement(userRecord, 'tactician');
  }
  publishGame(game);
}

function handleBoost(ws) {
  return handleSkill(ws, { skill: 'surge' });
}

function startRematch(ws) {
  const old = gameForSocket(ws);
  const game = [...activeGames.values()].find(g => g.players.includes(ws.userId) && g.over);
  const target = game || old;
  if (!target) return sendError(ws, 'Não há partida para revanche.', 'NO_GAME');
  const key = target.id;
  target.rematch ||= new Set();
  target.rematch.add(ws.userId);
  const other = target.players.find(u => u !== ws.userId);
  sendUser(other, 'game:rematch-request', { from: safeUser(db.users.find(u => u.id === ws.userId)) });
  send(ws, 'game:rematch-waiting', {});
  if (target.rematch.size === 2) {
    const room = createRoom(target.players, 'rematch', target.options);
    sendUser(target.players[0], 'game:rematch-started', { roomId: room.id });
    sendUser(target.players[1], 'game:rematch-started', { roomId: room.id });
    activeGames.delete(key);
  }
}

function friendChanged(...uids) {
  for (const uid of new Set(uids)) {
    sendUser(uid, 'social:update', {
      friends: friendPayload(uid),
      requests: requestsPayload(uid),
      sentRequests: sentRequestsPayload(uid)
    });
  }
}

async function handleSocketMessage(ws, msg) {
  if (!ws.userId) {
    if (msg.type !== 'auth') return sendError(ws, 'Faça login para conectar.', 'AUTH_REQUIRED');
    const session = sessionFromToken(String(msg.token || ws.cookieToken || ''));
    if (!session) return sendError(ws, 'Sessão inválida. Entre novamente.', 'AUTH_EXPIRED');
    ws.userId = session.uid;
    const wasOnline = isOnline(ws.userId);
    if (!socketsByUser.has(ws.userId)) socketsByUser.set(ws.userId, new Set());
    socketsByUser.get(ws.userId).add(ws);
    const user = db.users.find(u => u.id === ws.userId);
    send(ws, 'auth:ok', {
      user: safeUser(user, true, true),
      friends: friendPayload(ws.userId),
      requests: requestsPayload(ws.userId),
      sentRequests: sentRequestsPayload(ws.userId),
      games: userHistoryPayload(ws.userId)
    });
    if (!wasOnline) notifyPresence(ws.userId);
    const active = findGameFor(ws.userId);
    if (active) {
      const side = active.players.indexOf(ws.userId);
      if (active.mode === 'tactical_draft') {
        active.onPlayerReconnect(ws.userId);
        send(ws, 'game:started', { state: active.serializeFor(side), reconnected: true });
      } else {
        active.disconnects.delete(ws.userId);
        send(ws, 'game:started', { state: serializeGame(active, side), reconnected: true });
      }
      for (const peer of active.players) {
        if (peer !== ws.userId) sendUser(peer, 'game:connection', { userId: ws.userId, connected: true });
      }
    }
    return;
  }

  const now = Date.now(), times = socketRate.get(ws) || [];
  const recent = times.filter(t => now - t < 10_000);
  recent.push(now);
  socketRate.set(ws, recent);
  if (recent.length > 90) return sendError(ws, 'Muitas ações em pouco tempo.', 'RATE_LIMIT');

  switch (msg.type) {
    case 'profile:search': {
      const q = normalizeUsername(msg.query);
      if (q.length < 2) return send(ws, 'profile:results', { users: [] });
      const users = db.users
        .filter(u => u.id !== ws.userId && (normalizeUsername(u.username).includes(q) || normalizeUsername(u.displayName).includes(q)) && !isBlocked(ws.userId, u.id))
        .slice(0, 12)
        .map(u => ({
          ...safeUser(u),
          isFriend: areFriends(ws.userId, u.id),
          requestPending: db.friendRequests.some(r => (r.from === ws.userId && r.to === u.id) || (r.from === u.id && r.to === ws.userId))
        }));
      send(ws, 'profile:results', { users });
      break;
    }
    case 'profile:inspect': {
      const target = db.users.find(u => u.id === String(msg.userId || '') || normalizeUsername(u.username) === normalizeUsername(msg.username));
      if (!target || isBlocked(ws.userId, target.id)) return sendError(ws, 'Perfil não encontrado.');
      send(ws, 'profile:inspected', {
        user: safeUser(target, true, false),
        isFriend: areFriends(ws.userId, target.id),
        recentGames: userHistoryPayload(target.id, 10)
      });
      break;
    }
    case 'friends:refresh':
      send(ws, 'social:update', {
        friends: friendPayload(ws.userId),
        requests: requestsPayload(ws.userId),
        sentRequests: sentRequestsPayload(ws.userId)
      });
      break;
    case 'games:history': {
      send(ws, 'games:history', { games: userHistoryPayload(ws.userId) });
      break;
    }
    case 'friend:request': {
      const target = db.users.find(u =>
        (msg.userId && u.id === String(msg.userId)) ||
        (msg.username && normalizeUsername(u.username) === normalizeUsername(msg.username))
      );
      if (!target) return sendError(ws, 'Jogador não encontrado.', 'USER_NOT_FOUND');
      if (target.id === ws.userId) return sendError(ws, 'Você não pode adicionar a si mesmo.', 'SELF_FRIEND');
      if (isBlocked(ws.userId, target.id)) return sendError(ws, 'Não é possível enviar solicitação para esse jogador.', 'BLOCKED');
      if (areFriends(ws.userId, target.id)) return sendError(ws, 'Vocês já são amigos.', 'ALREADY_FRIENDS');
      if (db.friendRequests.some(r => r.from === ws.userId && r.to === target.id)) {
        return sendError(ws, 'Solicitação já enviada.', 'REQUEST_EXISTS');
      }
      const reverse = db.friendRequests.find(r => r.from === target.id && r.to === ws.userId);
      if (reverse) {
        db.friendRequests = db.friendRequests.filter(r => r.id !== reverse.id);
        db.friendships.push({ a: ws.userId, b: target.id, createdAt: nowIso() });
        await persistDb();
        friendChanged(ws.userId, target.id);
        send(ws, 'notice', { message: 'Solicitação recíproca aceita. Vocês agora são amigos!' });
        sendUser(target.id, 'notice', { message: `Você e @${db.users.find(u => u.id === ws.userId).username} agora são amigos!` });
        return;
      }
      const request = { id: id(), from: ws.userId, to: target.id, createdAt: nowIso() };
      db.friendRequests.push(request);
      await persistDb();
      friendChanged(ws.userId, target.id);
      send(ws, 'notice', { message: `Solicitação enviada para @${target.username}.` });
      sendUser(target.id, 'notice', { message: `@${db.users.find(u => u.id === ws.userId).username} enviou uma solicitação de amizade.` });
      break;
    }
    case 'friend:cancel': {
      const request = db.friendRequests.find(r => r.id === msg.requestId && r.from === ws.userId);
      if (!request) return sendError(ws, 'Solicitação não encontrada.');
      db.friendRequests = db.friendRequests.filter(r => r.id !== request.id);
      await persistDb();
      friendChanged(ws.userId, request.to);
      send(ws, 'notice', { message: 'Solicitação de amizade cancelada.' });
      break;
    }
    case 'friend:respond': {
      const request = db.friendRequests.find(r => r.id === msg.requestId && r.to === ws.userId);
      if (!request) return sendError(ws, 'Essa solicitação não está mais disponível.', 'REQUEST_MISSING');
      db.friendRequests = db.friendRequests.filter(r => r.id !== request.id);
      if (msg.accept === true && !isBlocked(ws.userId, request.from)) {
        db.friendships.push({ a: ws.userId, b: request.from, createdAt: nowIso() });
      }
      await persistDb();
      friendChanged(ws.userId, request.from);
      const meUser = db.users.find(u => u.id === ws.userId);
      send(ws, 'notice', { message: msg.accept === true ? 'Solicitação aceita!' : 'Solicitação recusada.' });
      sendUser(request.from, 'notice', {
        message: msg.accept === true
          ? `@${meUser?.username || 'Jogador'} aceitou sua solicitação de amizade!`
          : 'Sua solicitação de amizade foi recusada.'
      });
      break;
    }
    case 'friend:remove': {
      const target = String(msg.userId || '');
      db.friendships = db.friendships.filter(f => makePair(f.a, f.b) !== makePair(ws.userId, target));
      await persistDb();
      friendChanged(ws.userId, target);
      send(ws, 'notice', { message: 'Amigo removido da sua lista.' });
      break;
    }
    case 'friend:block': {
      const target = String(msg.userId || ''), user = db.users.find(u => u.id === ws.userId);
      if (!db.users.some(u => u.id === target)) return sendError(ws, 'Jogador não encontrado.');
      user.blocked ||= [];
      if (!user.blocked.includes(target)) user.blocked.push(target);
      db.friendships = db.friendships.filter(f => makePair(f.a, f.b) !== makePair(ws.userId, target));
      db.friendRequests = db.friendRequests.filter(r => !((r.from === ws.userId && r.to === target) || (r.from === target && r.to === ws.userId)));
      await persistDb();
      friendChanged(ws.userId, target);
      send(ws, 'profile:stats', { user: safeUser(user, true, true) });
      send(ws, 'notice', { message: 'Jogador bloqueado.' });
      break;
    }
    case 'friend:unblock': {
      const target = String(msg.userId || ''), user = db.users.find(u => u.id === ws.userId);
      if (!user) return;
      user.blocked = (user.blocked || []).filter(idItem => idItem !== target);
      await persistDb();
      send(ws, 'profile:stats', { user: safeUser(user, true, true) });
      send(ws, 'notice', { message: 'Jogador desbloqueado.' });
      break;
    }
    case 'challenge:send': {
      const target = db.users.find(u => u.id === String(msg.userId || ''));
      if (!target) return sendError(ws, 'Jogador não encontrado.');
      if (!areFriends(ws.userId, target.id)) return sendError(ws, 'Adicione esse jogador antes de desafiá-lo.', 'NOT_FRIENDS');
      if (!isOnline(target.id)) return sendError(ws, 'Esse amigo está offline no momento.', 'USER_OFFLINE');
      if (findGameFor(ws.userId) || findGameFor(target.id)) return sendError(ws, 'Um dos jogadores já está em uma partida.', 'IN_GAME');
      if ([...challenges.values()].some(c => c.from === ws.userId && c.to === target.id)) {
        return sendError(ws, 'Você já enviou um desafio para esse amigo.');
      }
      const options = sanitizeMatchOptions(msg.options);
      const challenge = {
        id: id(),
        from: ws.userId,
        to: target.id,
        options,
        summary: formatMatchOptionsSummary(options),
        expiresAt: Date.now() + 60_000
      };
      challenges.set(challenge.id, challenge);
      sendUser(target.id, 'challenge:incoming', {
        id: challenge.id,
        from: safeUser(db.users.find(u => u.id === ws.userId)),
        options: challenge.options,
        summary: challenge.summary,
        expiresAt: challenge.expiresAt
      });
      send(ws, 'challenge:sent', {
        id: challenge.id,
        to: safeUser(target),
        options: challenge.options,
        summary: challenge.summary
      });
      send(ws, 'notice', { message: `Desafio enviado para @${target.username} (${challenge.summary}).` });
      break;
    }
    case 'challenge:respond': {
      const c = challenges.get(String(msg.challengeId || ''));
      if (!c || c.to !== ws.userId || c.expiresAt < Date.now()) {
        challenges.delete(String(msg.challengeId || ''));
        return sendError(ws, 'Esse desafio expirou ou não existe.');
      }
      challenges.delete(c.id);
      if (msg.accept !== true) {
        sendUser(c.from, 'challenge:declined', { by: safeUser(db.users.find(u => u.id === ws.userId)) });
        return send(ws, 'notice', { message: 'Desafio recusado.' });
      }
      if (!isOnline(c.from)) return sendError(ws, 'Quem enviou o desafio se desconectou.');
      if (findGameFor(c.from) || findGameFor(c.to)) return sendError(ws, 'Um dos jogadores já entrou em outra partida.');
      createRoom([c.from, c.to], 'challenge', c.options);
      sendUser(c.from, 'challenge:accepted', { by: safeUser(db.users.find(u => u.id === c.to)) });
      sendUser(c.to, 'notice', { message: 'Desafio aceito. Preparando o duelo!' });
      break;
    }
    case 'match:queue': {
      if (findGameFor(ws.userId)) return sendError(ws, 'Você já está em uma partida.');
      if (msg.options?.mode === 'classic') {
        const options = sanitizeMatchOptions({ ...msg.options, mode: 'classic' });
        const mine = classicQueue.find(entry => entry.uid === ws.userId);
        if (mine) classicQueue.splice(classicQueue.indexOf(mine), 1);
        const opponentIndex = classicQueue.findIndex(entry =>
          entry.uid !== ws.userId &&
          entry.options.timeControl === options.timeControl &&
          isOnline(entry.uid) && !findGameFor(entry.uid)
        );
        if (opponentIndex >= 0) {
          const other = classicQueue.splice(opponentIndex, 1)[0];
          createRoom([other.uid, ws.userId], 'public', options);
        } else {
          classicQueue.push({ uid: ws.userId, options });
          send(ws, 'match:waiting', { position: classicQueue.length, mode: 'classic', timeControl: options.timeControl });
        }
        break;
      }
      if (msg.options?.mode === 'tactical_draft') {
        if (!tacticalQueue.includes(ws.userId)) tacticalQueue.push(ws.userId);
        const idx = tacticalQueue.findIndex(uid => uid !== ws.userId && isOnline(uid) && !findGameFor(uid));
        if (idx >= 0) {
          const other = tacticalQueue.splice(idx, 1)[0];
          tacticalQueue.splice(tacticalQueue.indexOf(ws.userId), 1);
          createRoom([other, ws.userId], 'public', { mode: 'tactical_draft' });
        } else {
          send(ws, 'match:waiting', { position: tacticalQueue.length, mode: 'tactical_draft' });
        }
        break;
      }
      if (msg.options?.doctrine) {
        const u = db.users.find(x => x.id === ws.userId);
        if (u && ['vanguard', 'bastion', 'celerity'].includes(msg.options.doctrine)) {
          u.preferences = sanitizePreferences({ doctrine: msg.options.doctrine }, u.preferences);
        }
      }
      if (!queue.includes(ws.userId)) queue.push(ws.userId);
      const index = queue.findIndex(uid => uid !== ws.userId && isOnline(uid) && !findGameFor(uid));
      if (index >= 0) {
        const other = queue.splice(index, 1)[0];
        queue.splice(queue.indexOf(ws.userId), 1);
        createRoom([other, ws.userId], 'public');
      } else {
        send(ws, 'match:waiting', { position: queue.length, mode: 'realtime' });
      }
      break;
    }
    case 'match:cancel': {
      const i = queue.indexOf(ws.userId);
      if (i >= 0) queue.splice(i, 1);
      const classicIndex = classicQueue.findIndex(entry => entry.uid === ws.userId);
      if (classicIndex >= 0) classicQueue.splice(classicIndex, 1);
      const tacIndex = tacticalQueue.indexOf(ws.userId);
      if (tacIndex >= 0) tacticalQueue.splice(tacIndex, 1);
      send(ws, 'match:cancelled', {});
      break;
    }
    case 'room:create': {
      if (findGameFor(ws.userId)) return sendError(ws, 'Você já está em uma partida.');
      const room = createRoom([ws.userId], 'private', msg.options);
      send(ws, 'room:created', { code: room.code, roomId: room.id, options: room.options, summary: formatMatchOptionsSummary(room.options) });
      break;
    }
    case 'room:join': {
      if (findGameFor(ws.userId)) return sendError(ws, 'Você já está em uma partida.');
      const code = String(msg.code || '').trim().toUpperCase();
      const room = [...rooms.values()].find(r => r.code === code && r.kind === 'private');
      if (!room) return sendError(ws, 'Sala não encontrada. Confira o código.', 'ROOM_NOT_FOUND');
      if (room.players.length >= 2) return sendError(ws, 'Essa sala já está cheia.', 'ROOM_FULL');
      if (!isOnline(room.players[0])) {
        rooms.delete(room.id);
        return sendError(ws, 'O criador da sala está offline. Peça um novo código.', 'ROOM_HOST_OFFLINE');
      }
      if (room.players.includes(ws.userId)) return sendError(ws, 'Você já está nessa sala.');
      room.players.push(ws.userId);
      beginRoom(room);
      break;
    }
    case 'game:move':
      handleMove(ws, msg);
      break;
    case 'game:boost':
      handleBoost(ws);
      break;
    case 'game:skill':
      handleSkill(ws, msg);
      break;
    case 'game:resign': {
      const game = gameForSocket(ws);
      if (!game) return sendError(ws, 'Você não está em uma partida.');
      if (game.mode === 'tactical_draft') {
        const side = game.players.indexOf(ws.userId);
        game.finish(1 - side, `${game.playerLabel(side)} desistiu da partida.`, 'resign');
        publishTactical(game, 'game:ended');
      } else {
        finishGame(game, 1 - game.players.indexOf(ws.userId), 'O jogador abandonou a partida.');
        publishGame(game, 'game:ended');
      }
      break;
    }
    case 'tactical:move': {
      const game = gameForSocket(ws);
      if (!game || game.mode !== 'tactical_draft') return sendError(ws, 'Partida tática não encontrada.');
      const side = game.players.indexOf(ws.userId);
      const res = game.moveUnit(side, Number(msg.x), Number(msg.y));
      if (!res.ok) return sendError(ws, res.error);
      const willAutoEnd = scheduleAutoEndTurn(game, side);
      publishTactical(game, 'tactical:state', { autoEnding: willAutoEnd });
      if (!willAutoEnd) botController.maybeAct(game);
      break;
    }
    case 'tactical:attack': {
      const game = gameForSocket(ws);
      if (!game || game.mode !== 'tactical_draft') return sendError(ws, 'Partida tática não encontrada.');
      const side = game.players.indexOf(ws.userId);
      const res = game.attackUnit(side, Number(msg.x), Number(msg.y));
      if (!res.ok) return sendError(ws, res.error);
      const willAutoEnd = scheduleAutoEndTurn(game, side);
      publishTactical(game, 'tactical:cardEffect', {
        effect: 'melee_attack',
        hitSide: res.hitEnemy,
        crownOutcome: res.crownOutcome,
        crownProtectedBlocked: res.crownProtectedBlocked,
        autoEnding: willAutoEnd
      });
      if (!willAutoEnd) botController.maybeAct(game);
      break;
    }
    case 'tactical:playCard': {
      const game = gameForSocket(ws);
      if (!game || game.mode !== 'tactical_draft') return sendError(ws, 'Partida tática não encontrada.');
      const side = game.players.indexOf(ws.userId);
      const res = game.playCard(side, msg.cardUid, msg.target);
      if (!res.ok) return sendError(ws, res.error);
      const willAutoEnd = scheduleAutoEndTurn(game, side);
      publishTactical(game, res.hitEnemy !== null ? 'tactical:cardEffect' : 'tactical:state', {
        effect: res.card.id,
        hitSide: res.hitEnemy,
        autoEnding: willAutoEnd
      });
      if (!willAutoEnd) botController.maybeAct(game);
      break;
    }
    case 'tactical:endTurn': {
      const game = gameForSocket(ws);
      if (!game || game.mode !== 'tactical_draft') return sendError(ws, 'Partida tática não encontrada.');
      const side = game.players.indexOf(ws.userId);
      const res = game.endTurn(side);
      if (!res.ok) return;
      if (res.ended) publishTactical(game, 'game:ended');
      else if (res.phase === 'draft') {
        publishTactical(game, 'tactical:startDraft');
        botController.maybeAct(game);
      } else {
        publishTactical(game, 'tactical:state');
        botController.maybeAct(game);
      }
      break;
    }
    case 'tactical:pickDraft': {
      const game = gameForSocket(ws);
      if (!game || game.mode !== 'tactical_draft') return sendError(ws, 'Partida tática não encontrada.');
      const side = game.players.indexOf(ws.userId);
      const res = game.pickDraftCard(side, msg.cardUid);
      if (!res.ok) return sendError(ws, res.error);
      publishTactical(game, 'tactical:state');
      botController.maybeAct(game);
      break;
    }
    case 'tactical:leave': {
      const res = leaveTacticalMatch(ws.userId);
      send(ws, 'tactical:left', { outcome: res.outcome });
      break;
    }
    case 'tactical:startCpu': {
      if (findGameFor(ws.userId)) return sendError(ws, 'Você já está em uma partida.');
      const botUid = `bot:cpu:${id().slice(0, 6)}`;
      const room = createRoom([ws.userId, botUid], 'cpu', { mode: 'tactical_draft' });
      const game = activeGames.get(room.gameId);
      if (game) botController.maybeAct(game);
      break;
    }
    case 'tactical:startTutorial': {
      if (findGameFor(ws.userId)) return sendError(ws, 'Você já está em uma partida.');
      const game = new TutorialRoom(ws.userId);
      activeGames.set(game.id, game);
      send(ws, 'game:started', { state: game.serializeFor(0) });
      break;
    }
    case 'tactical:tutorialStepComplete': {
      const game = gameForSocket(ws);
      if (!game || !game.isTutorial) return;
      if (game.completeTutorialStep(msg.step)) {
        publishTactical(game, 'tactical:state');
      }
      break;
    }
    case 'game:rematch':
      startRematch(ws);
      break;
    default:
      sendError(ws, 'Ação desconhecida.', 'UNKNOWN_ACTION');
  }
}

function tickGames() {
  const now = Date.now();
  for (const [gameId, game] of activeGames) {
    if (game.over) {
      if (now - (game.endedAt || now) > 30 * 60 * 1000) activeGames.delete(gameId);
      continue;
    }
    if (game.mode === 'tactical_draft') {
      const evt = game.tick(now);
      if (evt === 'ended') publishTactical(game, 'game:ended');
      else if (evt === 'draft_ended' || evt === 'turn_timeout') {
        publishTactical(game, 'tactical:state');
        botController.maybeAct(game);
      }
      continue;
    }
    const dt = Math.min(0.25, Math.max(0, (now - game.lastTick) / 1000));
    game.lastTick = now;
    game.T += dt;
    if (game.mode === 'classic') {
      game.clocks[game.turn] = Math.max(0, game.clocks[game.turn] - dt);
      if (game.clocks[game.turn] <= 0) {
        const winner = classicCanMate(game, 1 - game.turn) ? 1 - game.turn : null;
        finishGame(game, winner, winner === null ? 'Tempo esgotado, mas não há material para dar mate: empate.' : 'Tempo esgotado.');
        publishGame(game, 'game:ended');
        continue;
      }
      for (const [uid, disconnectedAt] of game.disconnects) {
        if (now - disconnectedAt > RECONNECT_GRACE_MS) {
          finishGame(game, 1 - game.players.indexOf(uid), 'O adversário perdeu a conexão.');
          publishGame(game, 'game:ended');
          break;
        }
      }
      if (now - game.lastBroadcast >= 160) {
        game.lastBroadcast = now;
        publishGame(game);
      }
      continue;
    }
    game.foodTimer -= dt;
    if (game.foodTimer <= 0) {
      game.foodTimer = 1.1;
      if (game.pieces.filter(p => p.owner === -1).length < 30) spawnFood(game);
    }
    if (game.options?.orbs !== 'none') {
      game.orbTimer -= dt;
      if (game.orbTimer <= 0) {
        const baseInterval = game.options?.orbs === 'abundant' ? 4.2 : 7;
        game.orbTimer = baseInterval + Math.random() * 2;
        spawnOrb(game);
      }
    }

    // Match Phase Evolution (Development -> Confrontation -> Ascension)
    if (game.crown) {
      if (game.crown.state === 'sealed' && game.T >= game.crown.unlockAt) {
        game.crown.state = 'free';
        game.phase = 'confrontation';
        addEvent(game, '👑 A Coroa Imperial despertou no Trono Central! Reivindique-a!');
        setDecisiveMoment(game, 'A Coroa Despertou!', 'Conquiste o Trono Central para iniciar o Domínio Imperial.', 'gold');
        const occupant = game.grid[game.crown.y]?.[game.crown.x];
        if (occupant && occupant.owner >= 0) {
          game.crown.state = 'held';
          game.crown.holderId = occupant.id;
          game.crown.owner = occupant.owner;
          occupant.shield = Math.max(occupant.shield || 0, 1);
          addEvent(game, `👑 ${TEAM[occupant.owner].name} já ocupava o Trono e tomou a Coroa!`);
        }
      }

      if (game.phase !== 'ascension' && (game.T >= 150 || game.teams.some(t => (t.crownProgress || 0) >= 70))) {
        game.phase = 'ascension';
        addEvent(game, '🔥 Fase III · Ascensão Imperial! O Domínio da Coroa foi acelerado em +35%!');
        setDecisiveMoment(game, 'Fase III · Ascensão Imperial!', 'A disputa entrou no clímax: Domínio da Coroa acelerado em +35%!', 'red');
      }

      if (game.crown.state === 'held') {
        const holder = game.pieces.find(p => p.id === game.crown.holderId && p.owner === game.crown.owner);
        if (!holder) {
          game.crown.state = 'free';
          game.crown.holderId = null;
          game.crown.owner = -1;
        } else {
          game.crown.x = holder.x;
          game.crown.y = holder.y;
          const owner = holder.owner;
          const team = game.teams[owner];
          const inThrone = holder.x >= 7 && holder.x <= 8 && holder.y >= 7 && holder.y <= 8;
          const inDeepBase = (owner === 0 && holder.y >= 13) || (owner === 1 && holder.y <= 2);
          let rate = inDeepBase ? 0.6 : inThrone ? 3.5 : 2.5;
          if (team.doctrine === 'vanguard') rate *= 0.9;
          if (game.phase === 'ascension') rate *= 1.35;
          team.crownProgress = Math.min(100, (team.crownProgress || 0) + rate * dt);
          team.maxCrownProgress = Math.max(team.maxCrownProgress || 0, team.crownProgress);

          game.crown.tributeTimer = (game.crown.tributeTimer || 10) - dt;
          if (game.crown.tributeTimer <= 0) {
            game.crown.tributeTimer = 10;
            award(game, owner, 2);
            team.energy = Math.min(100, team.energy + 14);
          }

          if (team.crownProgress >= 100) {
            finishGame(game, owner, 'Soberania Imperial: alcançou 100% de Domínio da Coroa!', 'crown');
            publishGame(game, 'game:ended');
            continue;
          }
        }
      }
    }

    // Strategic Zones Evaluation (Sanctuary, Throne, Fortress)
    if (game.zones) {
      for (const z of game.zones) {
        const ownersPresent = new Set();
        for (let zy = z.y0; zy <= z.y1; zy++) {
          for (let zx = z.x0; zx <= z.x1; zx++) {
            const occ = game.grid[zy]?.[zx];
            if (occ && occ.owner >= 0) ownersPresent.add(occ.owner);
          }
        }
        z.contested = ownersPresent.size > 1;
        z.owner = ownersPresent.size === 1 ? [...ownersPresent][0] : -1;
        if (z.owner >= 0) {
          const ctrlTeam = game.teams[z.owner];
          const zoneMult = ctrlTeam?.doctrine === 'bastion' ? 1.25 : 1.0;
          if (z.id === 'sanctuary') {
            ctrlTeam.energy = Math.min(100, ctrlTeam.energy + 3.0 * zoneMult * dt);
          } else if (z.id === 'fortress') {
            z.fortressTimer = (z.fortressTimer ?? 14) - dt * zoneMult;
            if (z.fortressTimer <= 0) {
              z.fortressTimer = 14;
              const king = game.pieces.find(p => p.owner === z.owner && p.type === 'K');
              if (king && !king.shield) {
                king.shield = 1;
                addEvent(game, `🛡️ A Fortaleza Real concedeu 1 Escudo ao Rei de ${TEAM[z.owner].name}!`);
              }
            }
          }
        }
      }
    }

    if (game.options?.timeLimit > 0 && game.T >= game.options.timeLimit) {
      const c0 = game.teams[0].crownProgress || 0;
      const c1 = game.teams[1].crownProgress || 0;
      const s0 = game.teams[0].score + Math.round(c0 * 0.25);
      const s1 = game.teams[1].score + Math.round(c1 * 0.25);
      const winner = s0 > s1 ? 0 : s1 > s0 ? 1 : null;
      finishGame(game, winner, 'Tempo regulamentar encerrado.', 'time');
      publishGame(game, 'game:ended');
      continue;
    }
    for (const [uid, disconnectedAt] of game.disconnects) {
      if (now - disconnectedAt > RECONNECT_GRACE_MS) {
        const winner = 1 - game.players.indexOf(uid);
        finishGame(game, winner, 'O adversário perdeu a conexão.');
        publishGame(game, 'game:ended');
        break;
      }
    }
    if (now - game.lastBroadcast >= 160) {
      game.lastBroadcast = now;
      publishGame(game);
    }
  }
  for (const [cid, c] of challenges) {
    if (c.expiresAt < now) {
      challenges.delete(cid);
      sendUser(c.from, 'challenge:expired', { id: cid });
      sendUser(c.to, 'challenge:expired', { id: cid });
    }
  }
  for (const [tokenHash, s] of sessions) {
    if (s.expiresAt < now) sessions.delete(tokenHash);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/healthz' || url.pathname === '/health') {
    return json(res, 200, { ok: true, name: 'Crownflux.io' });
  }
  if (url.pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, url);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) json(res, 500, { error: 'Erro interno do servidor.' });
    }
    return;
  }
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const ext = path.extname(pathname);
  const allowedExts = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.png', '.webp', '.woff2', '.woff', '.ico']);

  // SPA fallback: browser routes without file extensions (e.g. /modes, /modes/duelo, /ranking, /game/123)
  if (!ext) {
    try {
      const htmlData = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'));
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-cache'
      });
      res.end(htmlData);
      return;
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
  }

  if (!allowedExts.has(ext)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const file = path.resolve(PUBLIC_DIR, '.' + pathname);
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== PUBLIC_DIR) {
    return json(res, 403, { error: 'Acesso negado.' });
  }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ['.html', '.js', '.css'].includes(ext) && !pathname.startsWith('/assets/')
        ? 'no-cache'
        : 'public, max-age=31536000, immutable'
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  const origin = req.headers.origin;
  if (origin) {
    try {
      const originHost = new URL(origin).hostname;
      const reqHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
        .split(',')[0]
        .trim()
        .replace(/:\d+$/, '');
      if (reqHost && originHost !== reqHost && originHost !== 'localhost' && originHost !== '127.0.0.1') {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
    } catch {
      socket.destroy();
      return;
    }
  }
  const cookies = parseCookies(req);
  wss.handleUpgrade(req, socket, head, ws => {
    ws.cookieToken = cookies.cf_session || '';
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('error', err => console.error('WebSocket client error:', err.message));
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return sendError(ws, 'Mensagem inválida.'); }
    if (!msg || typeof msg.type !== 'string') return sendError(ws, 'Formato de mensagem inválido.');
    Promise.resolve(handleSocketMessage(ws, msg)).catch(err => {
      console.error('WebSocket action failed:', err);
      sendError(ws, 'Não foi possível concluir essa ação.');
    });
  });
  ws.on('close', () => {
    const uid = ws.userId;
    if (!uid) return;
    const set = socketsByUser.get(uid);
    if (set) {
      set.delete(ws);
      if (set.size === 0) socketsByUser.delete(uid);
    }
    if (!isOnline(uid)) {
      notifyPresence(uid);
      const i = queue.indexOf(uid);
      if (i >= 0) queue.splice(i, 1);
      const classicIndex = classicQueue.findIndex(entry => entry.uid === uid);
      if (classicIndex >= 0) classicQueue.splice(classicIndex, 1);
      const tacIndex = tacticalQueue.indexOf(uid);
      if (tacIndex >= 0) tacticalQueue.splice(tacIndex, 1);
      const game = findGameFor(uid);
      if (game) {
        if (game.mode === 'tactical_draft') {
          game.onPlayerDisconnect(uid);
          for (const peer of game.players) {
            if (peer !== uid) {
              sendUser(peer, 'game:connection', {
                userId: uid,
                connected: false,
                graceSeconds: Math.floor(TACTICAL_RECONNECT_MS / 1000)
              });
            }
          }
        } else {
          game.disconnects.set(uid, Date.now());
          for (const peer of game.players) {
            if (peer !== uid) {
              sendUser(peer, 'game:connection', {
                userId: uid,
                connected: false,
                graceSeconds: Math.floor(RECONNECT_GRACE_MS / 1000)
              });
            }
          }
        }
      }
      for (const [roomId, room] of rooms) {
        if (room.players.includes(uid) && !room.gameId) rooms.delete(roomId);
      }
    }
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);

setInterval(tickGames, 100);

await loadDb();
server.listen(PORT, HOST, () => console.log(`Crownflux.io disponível em http://localhost:${PORT}`));
process.on('SIGINT', () => { clearInterval(heartbeat); server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { clearInterval(heartbeat); server.close(() => process.exit(0)); });
