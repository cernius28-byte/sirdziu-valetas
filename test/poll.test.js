'use strict';
// Ilgoji apklausa (naudojama, kai SSE neveikia, pvz. per Cloudflare tunelį).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { server, rooms, BOT_NAMES } = require('../server');

function request(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, path, method, headers: { 'Content-Type': 'application/json' } }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(s || '{}') }));
    });
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

test('apklausa: būsena iškart, paskui laukiama pokyčio', { timeout: 20000 }, async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  try {
    const { code, token } = (await request(port, 'POST', '/api/create', { name: 'Rokas' })).body;
    const q = `code=${code}&token=${token}`;

    const first = await request(port, 'GET', `/api/poll?${q}&v=-1`);
    assert.equal(first.status, 200);
    assert.equal(first.body.state.code, code);
    assert.equal(first.body.state.players[0].online, true);
    const v = first.body.v;

    // Laukianti užklausa grąžinama, kai kas nors pasikeičia
    const waiting = request(port, 'GET', `/api/poll?${q}&v=${v}`);
    await new Promise((r) => setTimeout(r, 150));
    await request(port, 'POST', '/api/action', { code, token, type: 'addBot' });
    const next = await waiting;
    assert.ok(next.body.v > v);
    assert.equal(next.body.state.players.length, 2);

    const bad = await request(port, 'GET', `/api/poll?code=${code}&token=blogas&v=-1`);
    assert.equal(bad.status, 404);

    // Robotų vardai – iš sąrašo, nesikartoja ir parenkami atsitiktinai
    for (let i = 0; i < 6; i++) await request(port, 'POST', '/api/action', { code, token, type: 'addBot' });
    const names = rooms.get(code).players.filter((p) => p.isBot).map((p) => p.name);
    assert.equal(names.length, 7);
    assert.equal(new Set(names).size, 7);
    for (const n of names) assert.ok(BOT_NAMES.includes(n), n);
    const firstNames = new Set();
    for (let i = 0; i < 30; i++) {
      const r = (await request(port, 'POST', '/api/create', { name: 'X' })).body;
      await request(port, 'POST', '/api/action', { code: r.code, token: r.token, type: 'addBot' });
      firstNames.add(rooms.get(r.code).players[1].name);
    }
    assert.ok(firstNames.size > 3, 'pirmas robotas turėtų gauti skirtingus vardus');
  } finally {
    for (const room of rooms.values()) {
      if (room.sched) clearTimeout(room.sched.timer);
      for (const pl of room.pollers) clearTimeout(pl.timer);
    }
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
