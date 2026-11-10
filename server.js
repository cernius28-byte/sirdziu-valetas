'use strict';
/**
 * Širdžių valetas – serveris be jokių priklausomybių.
 * Paleidimas: node server.js   (prievadas – PORT, numatytai 3000)
 *
 * Naršyklė gauna būseną per Server-Sent Events (/api/stream),
 * o veiksmus siunčia POST užklausomis (/api/action).
 * Kiekvienas žaidėjas mato tik savo kortas.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const G = require('./game');
const Bots = require('./bots');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const SPEED = Number(process.env.SV_SPEED) || 1; // >1 pagreitina laikmačius (testams)

const TRICK_PAUSE = 1700; // kiek laiko matosi pilnas ėjimas
const ROUND_PAUSE = 15000; // raundo rezultatų langas (jei ne visi paspaudžia „Toliau“)
const CUT_TIMEOUT = 25000; // jei žmogus nenukelia – nukeliama automatiškai
const IDLE_ROOM_MS = 3 * 60 * 60 * 1000;
const POLL_HOLD = 25000; // kiek laiko laikoma apklausos užklausa, jei niekas nesikeičia
const POLL_LEASE = 40000; // apklausiantis žaidėjas laikomas prisijungusiu tiek laiko po paskutinės užklausos

// Kompiuterinių žaidėjų vardai – kiekvieną kartą parenkamas atsitiktinis, dar neužimtas
const BOT_NAMES = [
  'Dravenė', 'Eisra', 'Gaudrė', 'Ilma', 'Milvydė', 'Radvilė', 'Snaigė', 'Uolė', 'Vakarė', 'Žemyna',
  'Alnis', 'Haroldas', 'Dargvydas', 'Galius', 'Jotvingis', 'Kintas', 'Milgedas', 'Rimutis', 'Tauras', 'Vykintas',
];

const rooms = new Map();

// ---------- Kambariai ----------

function newCode() {
  const A = 'ABCDEFGHJKLMNPRSTUVZ';
  let code;
  do code = Array.from({ length: 4 }, () => A[crypto.randomInt(A.length)]).join('');
  while (rooms.has(code));
  return code;
}

const newToken = () => crypto.randomBytes(16).toString('hex');
const newId = () => crypto.randomBytes(5).toString('hex');

function cleanName(s) {
  const name = String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return name || 'Žaidėjas';
}

function createRoom() {
  const room = {
    code: newCode(),
    players: [],
    hostId: null,
    game: null,
    clients: new Set(), // SSE ryšiai
    pollers: new Set(), // laukiančios apklausos užklausos (kai SSE neveikia, pvz. per tunelį)
    version: 0,
    presence: '',
    sched: null,
    phaseEndsAt: 0,
    ready: new Set(),
    mode: 'classic', // classic – klasikinė, shadow – šešėlių partija
    lastActive: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

function addHuman(room, name) {
  const p = { id: newId(), token: newToken(), name: cleanName(name), isBot: false, auto: false, left: false, conns: 0, pollUntil: 0 };
  room.players.push(p);
  if (!room.hostId) room.hostId = p.id;
  return p;
}

function addBot(room) {
  const used = new Set(room.players.map((p) => p.name));
  const free = BOT_NAMES.filter((n) => !used.has(n));
  const name = free.length ? free[crypto.randomInt(free.length)] : `Botas ${room.players.length + 1}`;
  room.players.push({ id: newId(), token: null, name, isBot: true, auto: false, left: false, conns: 0 });
}

function removePlayer(room, id) {
  const i = room.players.findIndex((p) => p.id === id);
  if (i < 0) return;
  room.players.splice(i, 1);
  if (room.hostId === id) {
    const next = room.players.find((p) => !p.isBot);
    room.hostId = next ? next.id : null;
  }
}

function isOnline(p) {
  return p.isBot || p.conns > 0 || Date.now() < (p.pollUntil || 0);
}

function humansOnline(room) {
  return room.players.some((p) => !p.isBot && isOnline(p));
}

function destroyRoom(room) {
  if (room.sched) clearTimeout(room.sched.timer);
  for (const c of room.clients) {
    try { c.res.end(); } catch { /* jau uždaryta */ }
  }
  for (const pl of room.pollers) {
    clearTimeout(pl.timer);
    if (!pl.res.headersSent) sendJSON(pl.res, 404, { error: 'Kambarys nerastas' });
  }
  room.pollers.clear();
  rooms.delete(room.code);
}

// ---------- Laikmačiai ir botai ----------

function dealTiming(count) {
  const interval = Math.max(55, Math.min(150, Math.round(2600 / count)));
  const t = { cut: 1400, interval, flight: 380, flip: 1100 };
  t.total = t.cut + (count - 1) * interval + t.flight + t.flip + 300;
  return t;
}

const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/** Ką reikia padaryti savaime ir po kiek laiko. Raktas leidžia nekeisti jau suplanuoto veiksmo. */
function planFor(room) {
  const g = room.game;
  if (!g || !humansOnline(room)) return null;
  const r = g.round;
  const base = `${g.phase}|${g.roundIdx}|${r.trickNo}|${r.trick.length}`;
  switch (g.phase) {
    case 'dealing':
      return { key: base, ms: dealTiming(r.dealtCount).total, fn: () => G.finishDealing(g) };
    case 'trickEnd':
      return { key: base, ms: TRICK_PAUSE, fn: () => G.finishTrick(g) };
    case 'roundEnd':
      return { key: base, ms: ROUND_PAUSE, fn: () => G.nextRound(g) };
    default:
      break;
  }
  const seat = G.actorSeat(g);
  if (seat === null || seat === undefined) return null;
  const p = room.players[seat];
  const auto = p.isBot || p.auto;
  const key = `${base}|${seat}|${auto ? 'bot' : 'human'}|${r.bids.join(',')}`;
  if (!auto) {
    if (g.phase === 'cutting') return { key, ms: CUT_TIMEOUT, fn: () => G.cut(g, seat, null) };
    return null;
  }
  if (g.phase === 'cutting') return { key, ms: rand(900, 1400), fn: () => G.cut(g, seat, Bots.cutPos(g)) };
  if (g.phase === 'bidding') return { key, ms: rand(900, 1600), fn: () => { G.look(g, seat); G.bid(g, seat, Bots.bid(g, seat)); } };
  if (g.phase === 'playing') {
    return {
      key,
      ms: rand(700, 1250),
      fn: () => {
        let move;
        try {
          move = Bots.play(g, seat);
          G.play(g, seat, move.card, move.decl);
        } catch (e) {
          console.error('Boto klaida, dedama pirma leistina korta:', e.message);
          const legal = G.legalCards(r.hands[seat], r.trick, r.trumpSuit);
          G.play(g, seat, legal[0], { mode: 'high', suit: r.trumpSuit });
        }
      },
    };
  }
  return null;
}

function schedule(room) {
  const plan = planFor(room);
  const key = plan ? plan.key : null;
  if (room.sched && room.sched.key === key) return;
  if (room.sched) clearTimeout(room.sched.timer);
  room.sched = null;
  room.phaseEndsAt = 0;
  if (!plan) return;
  const ms = plan.ms / SPEED;
  room.phaseEndsAt = Date.now() + ms;
  const timer = setTimeout(() => {
    if (!room.sched || room.sched.key !== key) return;
    room.sched = null;
    try {
      plan.fn();
    } catch (e) {
      console.error('Automatinio veiksmo klaida:', e);
    }
    if (room.game && room.game.phase === 'roundEnd') room.ready.clear();
    changed(room);
  }, ms);
  room.sched = { key, timer };
}

function changed(room) {
  room.version++;
  room.lastActive = Date.now();
  room.presence = room.players.map(isOnline).join();
  schedule(room);
  broadcast(room);
}

// ---------- Būsenos siuntimas ----------

function viewFor(room, pid) {
  const seat = room.players.findIndex((p) => p.id === pid);
  const v = {
    code: room.code,
    you: pid,
    seat,
    hostId: room.hostId,
    mode: room.mode,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      bot: p.isBot,
      auto: p.auto,
      left: p.left,
      online: isOnline(p),
    })),
    game: null,
  };
  const g = room.game;
  if (g) {
    const r = g.round;
    const dealt = g.phase !== 'cutting';
    v.game = {
      phase: g.phase,
      mode: g.mode,
      seen: seat >= 0 ? r.seen[seat] : false,
      n: g.n,
      sizes: g.sizes,
      roundIdx: g.roundIdx,
      scores: g.scores,
      history: g.history,
      endsIn: room.phaseEndsAt ? Math.max(0, room.phaseEndsAt - Date.now()) : 0,
      ready: [...room.ready],
      round: {
        idx: r.idx,
        size: r.size,
        dealer: r.dealer,
        cutter: r.cutter,
        cutPos: r.cutPos,
        deckSize: r.deck.length,
        dealtCount: r.dealtCount,
        timing: dealt ? dealTiming(r.dealtCount) : null,
        trumpCard: dealt ? r.trumpCard : null,
        trumpSuit: dealt ? r.trumpSuit : null,
        trumpFromDealer: r.trumpFromDealer,
        trumpPlayed: r.played.includes(r.trumpCard),
        bids: r.bids,
        blind: r.blind,
        won: r.won,
        turn: G.actorSeat(g),
        leader: r.leader,
        trick: r.trick,
        trickNo: r.trickNo,
        trickWinner: r.trickWinner,
        handCounts: r.hands.map((h) => h.length),
      },
      hand: seat >= 0 && r.seen[seat] ? r.hands[seat] : [], // šešėlių partijoje – tik pažiūrėjus
      legal: g.phase === 'playing' && r.turn === seat && seat >= 0 ? G.legalCards(r.hands[seat], r.trick, r.trumpSuit) : [],
    };
  }
  return v;
}

function broadcast(room) {
  for (const c of room.clients) {
    try {
      c.res.write(`data: ${JSON.stringify(viewFor(room, c.pid))}\n\n`);
    } catch { /* klientas atsijungė */ }
  }
  for (const pl of room.pollers) {
    clearTimeout(pl.timer);
    if (!pl.res.headersSent) sendJSON(pl.res, 200, { v: room.version, state: viewFor(room, pl.pid) });
  }
  room.pollers.clear();
}

// ---------- Veiksmai ----------

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const deny = (msg, status = 400) => { throw new ApiError(status, msg); };

function handleAction(room, p, a) {
  const g = room.game;
  const seat = room.players.indexOf(p);
  const isHost = room.hostId === p.id;
  switch (a.type) {
    case 'addBot':
      if (g) deny('Žaidimas jau vyksta');
      if (!isHost) deny('Tai gali tik kambario šeimininkas');
      if (room.players.length >= G.MAX_PLAYERS) deny(`Daugiausia ${G.MAX_PLAYERS} žaidėjai`);
      addBot(room);
      break;
    case 'kick': {
      if (g) deny('Žaidimas jau vyksta');
      if (!isHost) deny('Tai gali tik kambario šeimininkas');
      const target = room.players.find((x) => x.id === a.id);
      if (!target || target.id === p.id) deny('Tokio žaidėjo nėra');
      for (const c of room.clients) if (c.pid === target.id) c.res.end();
      removePlayer(room, target.id);
      break;
    }
    case 'shuffleSeats':
      if (g) deny('Žaidimas jau vyksta');
      if (!isHost) deny('Tai gali tik kambario šeimininkas');
      room.players = G.shuffle(room.players);
      break;
    case 'setMode':
      if (g) deny('Žaidimas jau vyksta');
      if (!isHost) deny('Žaidimo variantą renkasi kambario šeimininkas');
      if (!G.MODES.includes(a.mode)) deny('Nežinomas žaidimo variantas');
      room.mode = a.mode;
      break;
    case 'start':
      if (g) deny('Žaidimas jau vyksta');
      if (!isHost) deny('Pradėti gali tik kambario šeimininkas');
      if (room.players.length < G.MIN_PLAYERS) deny(`Reikia bent ${G.MIN_PLAYERS} žaidėjų – pridėk kompiuterį`);
      room.game = G.createGame(room.players.length, { mode: room.mode });
      room.ready.clear();
      break;
    case 'leave':
      if (!g) {
        for (const c of room.clients) if (c.pid === p.id) c.res.end();
        removePlayer(room, p.id);
        if (!room.players.some((x) => !x.isBot)) {
          destroyRoom(room);
          return;
        }
      } else {
        p.left = true;
        p.auto = true;
      }
      break;
    case 'cut':
      if (!g) deny('Žaidimas nevyksta');
      G.cut(g, seat, a.pos);
      break;
    case 'look':
      if (!g) deny('Žaidimas nevyksta');
      G.look(g, seat);
      break;
    case 'bid':
      if (!g) deny('Žaidimas nevyksta');
      G.bid(g, seat, a.value, !!a.blind);
      break;
    case 'play':
      if (!g) deny('Žaidimas nevyksta');
      G.play(g, seat, String(a.card || ''), a.decl);
      break;
    case 'ready': {
      if (!g || g.phase !== 'roundEnd') return;
      room.ready.add(p.id);
      const waiting = room.players.filter((x) => !x.isBot && !x.auto && isOnline(x) && !room.ready.has(x.id));
      if (!waiting.length) {
        room.ready.clear();
        G.nextRound(g);
      }
      break;
    }
    case 'auto': {
      if (!g) deny('Žaidimas nevyksta');
      const target = room.players[Number(a.seat)];
      if (!target || target.isBot) deny('Tokio žaidėjo nėra');
      if (target !== p && isOnline(target)) deny('Žaidėjas prisijungęs – už jį žaisti negalima');
      target.auto = !!a.on;
      break;
    }
    case 'newGame':
      if (!g || g.phase !== 'gameOver') return;
      room.game = G.createGame(room.players.length, { mode: room.mode });
      room.ready.clear();
      break;
    case 'toLobby':
      if (!g || g.phase !== 'gameOver') return;
      room.game = null;
      for (const x of room.players.filter((q) => q.left)) removePlayer(room, x.id);
      for (const x of room.players) x.auto = false;
      if (!room.players.some((x) => !x.isBot)) {
        destroyRoom(room);
        return;
      }
      break;
    default:
      deny('Nežinomas veiksmas');
  }
  changed(room);
}

// ---------- HTTP ----------

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 10000) {
        reject(new ApiError(413, 'Per didelė užklausa'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new ApiError(400, 'Netinkama užklausa'));
      }
    });
    req.on('error', reject);
  });
}

function findPlayer(code, token) {
  const room = rooms.get(String(code || '').toUpperCase());
  if (!room) return {};
  const p = room.players.find((x) => x.token && x.token === token);
  return { room, p };
}

function openStream(req, res, room, p) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');
  const client = { res, pid: p.id };
  room.clients.add(client);
  p.conns++;
  if (p.auto && !p.left) p.auto = false; // grįžo – vėl žaidžia pats
  changed(room);
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { /* ignoruoti */ }
  }, 20000);
  res.on('close', () => {
    clearInterval(ping);
    room.clients.delete(client);
    p.conns = Math.max(0, p.conns - 1);
    if (rooms.has(room.code)) changed(room);
  });
}

/** Ilgoji apklausa: atsakoma iškart, jei būsena pasikeitė, kitaip laukiama pokyčio. */
function openPoll(req, res, room, p, since) {
  const wasOnline = isOnline(p);
  p.pollUntil = Date.now() + POLL_LEASE;
  if (!wasOnline) {
    if (p.auto && !p.left) p.auto = false; // grįžo – vėl žaidžia pats
    changed(room);
  }
  if (since !== room.version) return sendJSON(res, 200, { v: room.version, state: viewFor(room, p.id) });
  const pl = { res, pid: p.id, timer: null };
  pl.timer = setTimeout(() => {
    room.pollers.delete(pl);
    if (!res.headersSent) sendJSON(res, 200, { v: room.version, state: null });
  }, POLL_HOLD);
  room.pollers.add(pl);
  res.on('close', () => {
    clearTimeout(pl.timer);
    room.pollers.delete(pl);
  });
  return undefined;
}

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  switch (route) {
    case 'GET /api/health':
      return sendJSON(res, 200, { ok: true, rooms: rooms.size });
    case 'POST /api/create': {
      const body = await readJSON(req);
      const room = createRoom();
      const p = addHuman(room, body.name);
      return sendJSON(res, 200, { code: room.code, token: p.token, id: p.id });
    }
    case 'POST /api/join': {
      const body = await readJSON(req);
      const room = rooms.get(String(body.code || '').trim().toUpperCase());
      if (!room) deny('Tokio kambario nėra – patikrink kodą', 404);
      if (room.game) deny('Šiame kambaryje žaidimas jau prasidėjo', 409);
      if (room.players.length >= G.MAX_PLAYERS) deny('Kambarys pilnas', 409);
      const p = addHuman(room, body.name);
      changed(room);
      return sendJSON(res, 200, { code: room.code, token: p.token, id: p.id });
    }
    case 'GET /api/check': {
      const { p } = findPlayer(url.searchParams.get('code'), url.searchParams.get('token'));
      return sendJSON(res, p ? 200 : 404, { ok: !!p });
    }
    case 'GET /api/stream': {
      const { room, p } = findPlayer(url.searchParams.get('code'), url.searchParams.get('token'));
      if (!p) return sendJSON(res, 404, { error: 'Kambarys nerastas' });
      return openStream(req, res, room, p);
    }
    case 'GET /api/poll': {
      const { room, p } = findPlayer(url.searchParams.get('code'), url.searchParams.get('token'));
      if (!p) return sendJSON(res, 404, { error: 'Kambarys nerastas' });
      return openPoll(req, res, room, p, Number(url.searchParams.get('v')));
    }
    case 'POST /api/action': {
      const body = await readJSON(req);
      const { room, p } = findPlayer(body.code, body.token);
      if (!p) deny('Kambarys nerastas', 404);
      try {
        handleAction(room, p, body);
      } catch (e) {
        if (e instanceof G.RuleError) deny(e.message, 409);
        throw e;
      }
      return sendJSON(res, 200, { ok: true });
    }
    default:
      return sendJSON(res, 404, { error: 'Nerasta' });
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    rel = '/';
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return sendJSON(res, 403, { error: 'Draudžiama' });
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Nerasta');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJSON(res, 405, { error: 'Netinkamas metodas' });
    return serveStatic(req, res, url.pathname);
  } catch (e) {
    if (e instanceof ApiError) return sendJSON(res, e.status, { error: e.message });
    console.error(e);
    if (!res.headersSent) sendJSON(res, 500, { error: 'Serverio klaida' });
  }
});

// Apklausiantys žaidėjai „atsijungia“, kai ilgai nesikreipia – pranešame kitiems
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.players.map(isOnline).join() !== room.presence) changed(room);
  }
}, 5000).unref();

// Senų kambarių valymas
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const idle = room.clients.size === 0 && room.pollers.size === 0 && !humansOnline(room);
    if (idle && now - room.lastActive > (room.game ? IDLE_ROOM_MS : 30 * 60 * 1000)) destroyRoom(room);
  }
}, 5 * 60 * 1000).unref();

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`\n  ♥ Širdžių valetas veikia!\n`);
    console.log(`  Šiame kompiuteryje:   http://localhost:${PORT}`);
    for (const list of Object.values(os.networkInterfaces())) {
      for (const a of list || []) {
        if (a.family === 'IPv4' && !a.internal) console.log(`  Tame pačiame Wi-Fi:   http://${a.address}:${PORT}`);
      }
    }
    console.log('');
  });
}

module.exports = { server, rooms, BOT_NAMES };
