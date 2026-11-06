'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../game');
const Bots = require('../bots');

test('kaladė: 3 žaidėjams A–J ir raudoni dešimtukai, kiekvienas papildomas +6', () => {
  const d3 = G.buildDeck(3);
  assert.equal(d3.length, 18);
  for (const r of [14, 13, 12, 11]) for (const s of 'SHCD') assert.ok(d3.includes(s + r));
  assert.ok(d3.includes('H10') && d3.includes('D10'));
  assert.ok(!d3.includes('S10') && !d3.includes('C10'));
  const d4 = G.buildDeck(4);
  assert.equal(d4.length, 24);
  for (const s of 'SHCD') assert.ok(d4.includes(s + 10) && d4.includes(s + 9));
  assert.equal(G.buildDeck(8).length, 48);
  for (let n = 3; n <= 8; n++) assert.equal(new Set(G.buildDeck(n)).size, 6 * n);
});

test('raundai: 1–5, po 6 tiek kartų kiek žaidėjų, 5–1', () => {
  assert.deepEqual(G.roundSizes(3), [1, 2, 3, 4, 5, 6, 6, 6, 5, 4, 3, 2, 1]);
  assert.equal(G.roundSizes(5).length, 15);
});

test('dalinimas: dalintojas gauna paskutinis, kozeris – kita korta arba dalintojo paskutinė', () => {
  const g = G.createGame(3, { firstDealer: 0 });
  assert.equal(g.phase, 'cutting');
  assert.equal(g.round.cutter, 1);
  const before = g.round.deck.slice();
  G.cut(g, 1, 5);
  const deck = before.slice(5).concat(before.slice(0, 5));
  assert.deepEqual(g.round.hands[1], [deck[0]]);
  assert.deepEqual(g.round.hands[2], [deck[1]]);
  assert.deepEqual(g.round.hands[0], [deck[2]]);
  assert.equal(g.round.trumpCard, deck[3]);
  assert.equal(g.round.trumpFromDealer, false);

  // pilnas raundas
  const h = G.createGame(3, { firstDealer: 0 });
  h.roundIdx = 4; // kitas bus 6 kortų raundas
  h.phase = 'roundEnd';
  G.nextRound(h);
  assert.equal(h.round.size, 6);
  G.cut(h, h.round.cutter, 3);
  assert.equal(h.round.trumpFromDealer, true);
  const dealerHand = h.round.hands[h.round.dealer];
  assert.equal(dealerHand[dealerHand.length - 1], h.round.trumpCard);
});

test('spalvos taisyklė: privaloma spalva, neturint – kozeris, neturint – bet kas; valetas visada', () => {
  const trick = [{ seat: 0, card: 'S14' }];
  assert.deepEqual(G.legalCards(['S12', 'D14', 'H13'], trick, 'D'), ['S12']);
  assert.deepEqual(G.legalCards(['C12', 'D14', 'D13'], trick, 'D'), ['D14', 'D13']);
  assert.deepEqual(G.legalCards(['C12', 'H14'], trick, 'D'), ['C12', 'H14']);
  assert.deepEqual(G.legalCards(['S12', 'H11'], trick, 'D'), ['S12', 'H11']);
  // valetas nesiskaito širdimi
  assert.deepEqual(G.legalCards(['H11', 'C12'], [{ seat: 0, card: 'H14' }], 'D'), ['C12', 'H11']);
});

test('valetu pradėtas ėjimas: reikalaujama spalva ir didžiausia korta', () => {
  const lead = [{ seat: 0, card: 'H11', mode: 'low', suit: 'C', highest: true }];
  assert.deepEqual(G.legalCards(['C12', 'C14', 'S14'], lead, 'D'), ['C14']);
  const lead2 = [{ seat: 0, card: 'H11', mode: 'high' }];
  assert.deepEqual(G.legalCards(['C12', 'S14'], lead2, 'D'), ['C12', 'S14']);
  // antra korta nustato spalvą
  const t = lead2.concat([{ seat: 1, card: 'S12' }]);
  assert.deepEqual(G.legalCards(['C12', 'S14'], t, 'D'), ['S14']);
});

test('kas paima', () => {
  const T = 'D';
  assert.equal(G.trickWinner([{ seat: 0, card: 'S12' }, { seat: 1, card: 'S14' }, { seat: 2, card: 'C14' }], T), 1);
  assert.equal(G.trickWinner([{ seat: 0, card: 'S12' }, { seat: 1, card: 'S14' }, { seat: 2, card: 'D10' }], T), 2);
  assert.equal(G.trickWinner([{ seat: 0, card: 'D14' }, { seat: 1, card: 'H11', mode: 'high' }, { seat: 2, card: 'D13' }], T), 1);
  assert.equal(G.trickWinner([{ seat: 0, card: 'S12' }, { seat: 1, card: 'H11', mode: 'low' }, { seat: 2, card: 'S13' }], T), 2);
  assert.equal(G.trickWinner([{ seat: 0, card: 'H11', mode: 'low' }, { seat: 1, card: 'C12' }, { seat: 2, card: 'C13' }], T), 2);
  assert.equal(G.trickWinner([{ seat: 0, card: 'H11', mode: 'low', suit: 'S' }, { seat: 1, card: 'C12' }, { seat: 2, card: 'H13' }], T), 0);
});

/** Sužaidžia raundą botais iki jo pabaigos. */
function playRoundWithBots(g) {
  while (g.phase !== 'roundEnd') {
    const r = g.round;
    if (g.phase === 'dealing') G.finishDealing(g);
    else if (g.phase === 'bidding') G.bid(g, r.turn, Bots.bid(g, r.turn));
    else if (g.phase === 'playing') {
      const m = Bots.play(g, r.turn);
      G.play(g, r.turn, m.card, m.decl);
    } else if (g.phase === 'trickEnd') G.finishTrick(g);
  }
}

test('pradedant širdžių valetu spalva privaloma', () => {
  const g = G.createGame(3, { firstDealer: 0 });
  G.cut(g, 1, 5);
  G.finishDealing(g);
  for (let s = 1; s <= 3; s++) G.bid(g, s % 3, 0);
  const leader = g.round.turn;
  g.round.hands[leader] = ['H11'];
  assert.throws(() => G.play(g, leader, 'H11', { mode: 'high' }), /nurodyti spalvą/);
  G.play(g, leader, 'H11', { mode: 'high', suit: 'S', highest: true });
  assert.deepEqual(g.round.trick[0], { seat: leader, card: 'H11', mode: 'high', suit: 'S', highest: true });
});

test('atverstas širdžių valetas: kozeris širdys, dalintojui −10', () => {
  const g = G.createGame(3, { firstDealer: 0 });
  const d = g.round.deck;
  const j = d.indexOf('H11');
  [d[j], d[4]] = [d[4], d[j]]; // nukėlus per 1, ketvirta (kozerio) vieta bus ši korta
  G.cut(g, 1, 1);
  assert.equal(g.round.trumpCard, 'H11');
  assert.equal(g.round.trumpSuit, 'H');
  playRoundWithBots(g);
  const h = g.history[0];
  assert.deepEqual(h.penalty, [-10, 0, 0]);
  assert.equal(h.pts[0], G.scoreFor(h.bids[0], h.won[0]) - 10);
  assert.equal(g.scores[0], h.pts[0]);
});

test('dalintojo parodytas valetas (visos kortos išdalintos) irgi duoda −10', () => {
  const g = G.createGame(3, { firstDealer: 0 });
  g.roundIdx = 4;
  g.phase = 'roundEnd';
  G.nextRound(g);
  const r = g.round;
  // dalintojo paskutinė korta yra paskutinė kaladėje; nukėlus per 1 – tai buvusi pirmoji
  const j = r.deck.indexOf('H11');
  [r.deck[j], r.deck[0]] = [r.deck[0], r.deck[j]];
  G.cut(g, r.cutter, 1);
  assert.equal(r.trumpCard, 'H11');
  assert.equal(r.trumpFromDealer, true);
  assert.equal(r.trumpSuit, 'H');
  const penalty = [0, 0, 0];
  penalty[r.dealer] = -10;
  assert.deepEqual(G.trumpPenalty(g), penalty);
  playRoundWithBots(g);
  const h = g.history[g.history.length - 1];
  assert.equal(h.pts[r.dealer], G.scoreFor(h.bids[r.dealer], h.won[r.dealer]) - 10);
});

test('šaukimų suma gali viršyti kortų skaičių, bet vienas šaukia ne daugiau nei turi kortų', () => {
  const g = G.createGame(3, { firstDealer: 0 });
  G.cut(g, 1, 5);
  G.finishDealing(g);
  assert.throws(() => G.bid(g, 1, 2), /nuo 0 iki 1/);
  G.bid(g, 1, 1);
  G.bid(g, 2, 1);
  G.bid(g, 0, 1);
  assert.equal(g.phase, 'playing');
});

test('taškai', () => {
  assert.equal(G.scoreFor(0, 0), 5);
  assert.equal(G.scoreFor(0, 2), 2);
  assert.equal(G.scoreFor(2, 2), 20);
  assert.equal(G.scoreFor(3, 1), -20);
  assert.equal(G.scoreFor(1, 3), 3);
});

test('botai sužaidžia visas partijas su 3–8 žaidėjais be klaidų', () => {
  for (let n = 3; n <= 8; n++) {
    for (let rep = 0; rep < 15; rep++) {
      const g = G.createGame(n);
      let guard = 0;
      while (g.phase !== 'gameOver') {
        assert.ok(guard++ < 10000);
        const r = g.round;
        if (g.phase === 'cutting') {
          G.cut(g, r.cutter, Bots.cutPos(g));
          for (const h of r.hands) assert.equal(h.length, r.size);
        } else if (g.phase === 'dealing') G.finishDealing(g);
        else if (g.phase === 'bidding') G.bid(g, r.turn, Bots.bid(g, r.turn));
        else if (g.phase === 'playing') {
          const m = Bots.play(g, r.turn);
          G.play(g, r.turn, m.card, m.decl);
        } else if (g.phase === 'trickEnd') G.finishTrick(g);
        else if (g.phase === 'roundEnd') {
          assert.equal(r.won.reduce((a, b) => a + b, 0), r.size);
          for (const h of r.hands) assert.equal(h.length, 0);
          G.nextRound(g);
        }
      }
      assert.equal(g.history.length, n + 10);
      const sum = g.history.reduce((acc, h) => acc.map((v, i) => v + h.pts[i]), Array(n).fill(0));
      assert.deepEqual(sum, g.scores);
    }
  }
});
