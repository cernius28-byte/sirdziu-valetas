'use strict';
// Visa partija per serverio API: žmogus (žaidžiamas automatiškai) + 2 kompiuteriai.
process.env.SV_SPEED = '200';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { server, rooms } = require('../server');

function post(port, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ port, path, method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(s || '{}') }));
    });
    req.on('error', reject);
    req.end(data);
  });
}

test('serveris: sukurti kambarį, pridėti botus ir sužaisti visą partiją', { timeout: 60000 }, async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  try {
    const created = await post(port, '/api/create', { name: 'Testas' });
    assert.equal(created.status, 200);
    const { code, token } = created.body;

    const bad = await post(port, '/api/join', { code: 'ZZZZ', name: 'X' });
    assert.equal(bad.status, 404);

    const states = [];
    let lastPhase = null;
    let sawHandForOthers = false;
    const done = new Promise((resolve, reject) => {
      http.get({ port, path: `/api/stream?code=${code}&token=${token}` }, (res) => {
        assert.equal(res.statusCode, 200);
        let buf = '';
        res.on('data', (chunk) => {
          buf += chunk;
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const line = block.split('\n').find((l) => l.startsWith('data: '));
            if (!line) continue;
            const s = JSON.parse(line.slice(6));
            states.push(s);
            if (s.game) {
              lastPhase = s.game.phase;
              if (s.game.hands) sawHandForOthers = true;
              if (s.game.phase === 'gameOver') {
                res.destroy();
                resolve(s);
              }
            }
          }
        });
        res.on('error', reject);
      }).on('error', reject);
    });

    const act = (type, extra = {}) => post(port, '/api/action', { code, token, type, ...extra });
    assert.equal((await act('start')).status, 400); // per mažai žaidėjų
    assert.equal((await act('addBot')).status, 200);
    assert.equal((await act('addBot')).status, 200);
    assert.equal((await act('start')).status, 200);
    assert.equal((await act('auto', { seat: 0, on: true })).status, 200);

    const final = await done;
    assert.equal(lastPhase, 'gameOver');
    assert.equal(final.game.history.length, 13);
    assert.ok(!sawHandForOthers, 'kitų kortos neturi būti siunčiamos');
    for (const s of states) {
      if (!s.game) continue;
      assert.ok(Array.isArray(s.game.hand));
      if (s.game.phase === 'cutting') assert.equal(s.game.round.trumpCard, null);
    }
    const join = await post(port, '/api/join', { code, name: 'Vėluojantis' });
    assert.equal(join.status, 409);
  } finally {
    for (const room of rooms.values()) if (room.sched) clearTimeout(room.sched.timer);
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
