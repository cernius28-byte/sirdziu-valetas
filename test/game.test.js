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

test('valetu pradėtas ėjimas: jo rūšį privaloma dėti, galima reikalauti didžiausių', () => {
  const lead = [{ seat: 0, card: 'H11', mode: 'low', suit: 'C', highest: true }];
  assert.deepEqual(G.legalCards(['C12', 'C14', 'S14'], lead, 'D'), ['C14']);
  const lead2 = [{ seat: 0, card: 'H11', mode: 'high', suit: 'C', highest: false }];
  assert.deepEqual(G.legalCards(['C12', 'C14', 'S14'], lead2, 'D'), ['C12', 'C14']);
  assert.deepEqual(G.legalCards(['S14', 'D10'], lead2, 'D'), ['D10']); // neturi ♣ – kozeris
});

test('kas paima: valetas – pasirinktos rūšies didžiausia arba mažiausia korta', () => {
  const T = 'D';
  const J = (seat, suit, mode) => ({ seat, card: 'H11', suit, mode });
  assert.equal(G.trickWinner([{ seat: 0, card: 'S12' }, { seat: 1, card: 'S14' }, { seat: 2, card: 'C14' }], T), 1);
  assert.equal(G.trickWinner([{ seat: 0, card: 'S12' }, { seat: 1, card: 'S14' }, { seat: 2, card: 'D10' }], T), 2);
  // valetas – didžiausias ♠, bet kozeris ♦ jį nukerta
  assert.equal(G.trickWinner([{ seat: 0, card: 'S12' }, J(1, 'S', 'high'), { seat: 2, card: 'D10' }], T), 2);
  // valetas – didžiausias ♠, kozerių nėra – paima, net prieš tūzą
  assert.equal(G.trickWinner([{ seat: 0, card: 'S14' }, J(1, 'S', 'high'), { seat: 2, card: 'S13' }], T), 1);
  // valetas – didžiausias kozeris ♦: laimi prieš kozerio tūzą
  assert.equal(G.trickWinner([{ seat: 0, card: 'D14' }, J(1, 'D', 'high'), { seat: 2, card: 'D13' }], T), 1);
  // valetas – mažiausias kozeris: nukerta ne kozerius, bet pralaimi kitam kozeriui
  assert.equal(G.trickWinner([{ seat: 0, card: 'S14' }, J(1, 'D', 'low'), { seat: 2, card: 'S13' }], T), 1);
  assert.equal(G.trickWinner([{ seat: 0, card: 'S14' }, J(1, 'D', 'low'), { seat: 2, card: 'D9' }], T), 2);
  // valetas – mažiausias ♠: pralaimi bet kuriam ♠
  assert.equal(G.trickWinner([{ seat: 0, card: 'S12' }, J(1, 'S', 'low'), { seat: 2, card: 'S13' }], T), 2);
  // valetas – kitos (ne pradėtos, ne kozerio) rūšies: nieko nelemia
  assert.equal(G.trickWinner([{ seat: 0, card: 'S12' }, J(1, 'C', 'high'), { seat: 2, card: 'S13' }], T), 2);
  // pradėta valetu „mažiausias ♣“, kiti ♣ neturi ir kozerių nėra – paima valetas
  assert.equal(G.trickWinner([J(0, 'C', 'low'), { seat: 1, card: 'S12' }, { seat: 2, card: 'H13' }], T), 0);
});

/** Kelia ir dalina, kol prasideda šaukimas (atverstas valetas – dalinama iš naujo). */
function dealUntilBidding(g, pos = 5) {
  while (g.phase !== 'bidding') {
    if (g.phase === 'cutting') G.cut(g, g.round.cutter, pos);
    else G.finishDealing(g);
  }
}

/** Sužaidžia raundą botais iki jo pabaigos. */
function playRoundWithBots(g) {
  while (g.phase !== 'roundEnd') {
    const r = g.round;
    if (g.phase === 'cutting') G.cut(g, r.cutter, Bots.cutPos(g));
    else if (g.phase === 'dealing') G.finishDealing(g);
    else if (g.phase === 'bidding') { G.look(g, r.turn); G.bid(g, r.turn, Bots.bid(g, r.turn)); }
    else if (g.phase === 'playing') {
      const m = Bots.play(g, r.turn);
      G.play(g, r.turn, m.card, m.decl);
    } else if (g.phase === 'trickEnd') G.finishTrick(g);
  }
}

test('širdžių valetui visada reikia rūšies ir vertės', () => {
  const g = G.createGame(3, { firstDealer: 0 });
  dealUntilBidding(g);
  for (let s = 1; s <= 3; s++) G.bid(g, s % 3, 0);
  const leader = g.round.turn;
  g.round.hands[leader] = ['H11'];
  assert.throws(() => G.play(g, leader, 'H11', { mode: 'high' }), /rūšies/);
  assert.throws(() => G.play(g, leader, 'H11', { suit: 'S' }), /didžiausia/);
  G.play(g, leader, 'H11', { mode: 'high', suit: 'S', highest: true });
  assert.deepEqual(g.round.trick[0], { seat: leader, card: 'H11', suit: 'S', mode: 'high', highest: true });
  // ne pirmas dedantis reikalauti didžiausių negali
  const next = g.round.turn;
  g.round.hands[next] = ['H11'];
  g.round.trick = [{ seat: leader, card: 'S12' }];
  G.play(g, next, 'H11', { mode: 'low', suit: 'S', highest: true });
  assert.equal(g.round.trick[1].highest, undefined);
});

test('atverstas širdžių valetas: dalintojui −10, kaladė permaišoma ir dalinama iš naujo', () => {
  const g = G.createGame(3, { firstDealer: 0 });
  const d = g.round.deck;
  const j = d.indexOf('H11');
  [d[j], d[4]] = [d[4], d[j]]; // nukėlus per 1, ketvirta (kozerio) vieta bus ši korta
  G.cut(g, 1, 1);
  assert.equal(g.round.trumpCard, 'H11');
  G.finishDealing(g);
  assert.equal(g.phase, 'cutting'); // vėl keliama
  assert.equal(g.round.jackRedeals, 1);
  assert.ok(g.round.hands.every((h) => h.length === 0));
  assert.equal(g.round.trumpCard, null);
  playRoundWithBots(g);
  const h = g.history[0];
  const pen = -10 * g.round.jackRedeals;
  assert.deepEqual(h.penalty, [pen, 0, 0]);
  assert.equal(h.pts[0], G.scoreFor(h.bids[0], h.won[0]) + pen);
  assert.equal(g.scores[0], h.pts[0]);
});

test('dalintojo parodytas valetas (visos kortos išdalintos): −10 ir dalinama iš naujo', () => {
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
  G.finishDealing(g);
  assert.equal(g.phase, 'cutting');
  const penalty = [0, 0, 0];
  penalty[r.dealer] = -10;
  assert.deepEqual(G.trumpPenalty(g), penalty);
  playRoundWithBots(g);
  const h = g.history[g.history.length - 1];
  assert.equal(h.pts[r.dealer], G.scoreFor(h.bids[r.dealer], h.won[r.dealer]) - 10 * r.jackRedeals);
});

test('šaukimų suma gali viršyti kortų skaičių, bet vienas šaukia ne daugiau nei turi kortų', () => {
  const g = G.createGame(3, { firstDealer: 0 });
  dealUntilBidding(g);
  assert.throws(() => G.bid(g, 1, 2), /nuo 0 iki 1/);
  G.bid(g, 1, 1);
  G.bid(g, 2, 1);
  G.bid(g, 0, 1);
  assert.equal(g.phase, 'playing');
});

test('paskutiniame raunde taškai trigubinami', () => {
  const g = G.createGame(3, { firstDealer: 0 });
  g.roundIdx = g.sizes.length - 2;
  g.phase = 'roundEnd';
  G.nextRound(g);
  assert.equal(g.round.size, 1);
  assert.equal(G.roundMultiplier(g), 3);
  playRoundWithBots(g);
  const h = g.history[0];
  assert.equal(h.mult, 3);
  h.bids.forEach((b, i) => assert.equal(h.pts[i], (G.scoreFor(b, h.won[i]) + h.penalty[i]) * 3));
  assert.equal(G.roundMultiplier(g, 0), 1);
});

test('šešėlių partija: šaukimas tamsoje – taškai ×2, pažiūrėjus – įprastai', () => {
  const g = G.createGame(3, { firstDealer: 0, mode: 'shadow' });
  assert.equal(g.mode, 'shadow');
  dealUntilBidding(g);
  const r = g.round;
  assert.deepEqual(r.seen, [false, false, false]);
  // be pažiūrėjimo įprastai šaukti negalima
  assert.throws(() => G.bid(g, 1, 1), /Pirma pažiūrėk/);
  G.bid(g, 1, 1, true); // tamsoje
  assert.equal(r.seen[1], true);
  G.look(g, 2);
  assert.throws(() => G.bid(g, 2, 0, true), /jau matei/);
  G.bid(g, 2, 0);
  G.bid(g, 0, 0, true); // tamsoje pass
  assert.deepEqual(r.blind, [true, true, false]);
  playRoundWithBots(g);
  const h = g.history[0];
  assert.deepEqual(h.blind, [true, true, false]);
  h.bids.forEach((b, i) => assert.equal(h.pts[i], G.scoreFor(b, h.won[i]) * (h.blind[i] ? 2 : 1) + h.penalty[i]));
});

test('klasikinėje partijoje šaukti tamsoje negalima', () => {
  const g = G.createGame(3, { firstDealer: 0 });
  assert.equal(g.mode, 'classic');
  dealUntilBidding(g);
  assert.throws(() => G.bid(g, 1, 0, true), /tik šešėlių/);
});

test('šešėlių partija: tamsoje nepaimtas šaukimas – minusai ×2', () => {
  const g = G.createGame(3, { firstDealer: 0, mode: 'shadow' });
  g.round.blind = [true, true, true];
  g.round.bids = [3, 0, 1];
  g.round.won = [1, 0, 0];
  g.phase = 'trickEnd';
  g.round.trickNo = g.round.size - 1;
  G.finishTrick(g);
  const h = g.history[0];
  assert.deepEqual(h.pts.slice(1), [10, -20]);
  assert.equal(h.pts[0], -40 + h.penalty[0]);
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
      const mode = rep % 2 ? 'shadow' : 'classic';
      const g = G.createGame(n, { mode });
      let guard = 0;
      while (g.phase !== 'gameOver') {
        assert.ok(guard++ < 10000);
        const r = g.round;
        if (g.phase === 'cutting') {
          G.cut(g, r.cutter, Bots.cutPos(g));
          for (const h of r.hands) assert.equal(h.length, r.size);
        } else if (g.phase === 'dealing') G.finishDealing(g);
        else if (g.phase === 'bidding') {
          const blind = mode === 'shadow' && Math.random() < 0.3;
          if (!blind) G.look(g, r.turn);
          G.bid(g, r.turn, Bots.bid(g, r.turn), blind);
        } else if (g.phase === 'playing') {
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
