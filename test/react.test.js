'use strict';
// Reakcijos (veideliai): kiti žaidėjai gauna jas kartu su būsena.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { server, rooms, REACTIONS } = require('../server');

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

test('reakcijos: matomos kitiems, netinkamos atmetamos, per dažnos praleidžiamos', { timeout: 10000 }, async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  try {
    const ana = (await request(port, 'POST', '/api/create', { name: 'Ana' })).body;
    const bob = (await request(port, 'POST', '/api/join', { name: 'Bob', code: ana.code })).body;
    const act = (who, extra) => request(port, 'POST', '/api/action', { code: ana.code, token: who.token, ...extra });
    const poll = async (who) => (await request(port, 'GET', `/api/poll?code=${ana.code}&token=${who.token}&v=-1`)).body.state;

    assert.deepEqual((await poll(bob)).reactions, []);
    assert.equal((await act(ana, { type: 'react', emoji: '😂' })).status, 200);
    const seen = (await poll(bob)).reactions;
    assert.equal(seen.length, 1);
    assert.equal(seen[0].pid, ana.id);
    assert.equal(seen[0].e, '😂');
    assert.ok(seen[0].ago >= 0 && seen[0].ago < 1000);

    // Ne iš sąrašo – atmetama
    assert.equal((await act(bob, { type: 'react', emoji: '<b>x</b>' })).status, 400);
    assert.equal((await act(bob, { type: 'react' })).status, 400);

    // Per dažnai – praleidžiama be klaidos
    assert.equal((await act(ana, { type: 'react', emoji: '👍' })).status, 200);
    assert.equal((await poll(bob)).reactions.length, 1);

    // Kitas žaidėjas gali reaguoti iškart; numeriai didėja
    assert.equal((await act(bob, { type: 'react', emoji: REACTIONS[0] })).status, 200);
    const both = (await poll(ana)).reactions;
    assert.equal(both.length, 2);
    assert.ok(both[1].id > both[0].id);
    assert.equal(both[1].pid, bob.id);

    // Senos reakcijos nebesiunčiamos
    for (const x of rooms.get(ana.code).reactions) x.at -= 10000;
    assert.deepEqual((await poll(bob)).reactions, []);
  } finally {
    for (const room of rooms.values()) {
      if (room.sched) clearTimeout(room.sched.timer);
      for (const pl of room.pollers) clearTimeout(pl.timer);
    }
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
