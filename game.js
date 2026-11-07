'use strict';
/**
 * Širdžių valetas – žaidimo taisyklės.
 * Čia nėra tinklo ar laikmačių: tik žaidimo būsena ir veiksmai su ja.
 *
 * Korta – eilutė „spalva + vertė“: H14 – širdžių tūzas, S10 – vynų dešimtukas.
 * Spalvos: S ♠ vynai, H ♥ širdys, C ♣ kryžiai, D ♦ būgnai. Vertės 2–14 (14 = tūzas).
 */
const crypto = require('crypto');

const SUITS = ['S', 'H', 'C', 'D'];
const JOKER = 'H11'; // širdžių valetas
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 8;
const CARDS_PER_PLAYER = 6;

const suitOf = (card) => card[0];
const rankOf = (card) => parseInt(card.slice(1), 10);

// Visa kaladė nuo aukščiausių kortų; kiekvienos vertės pirma raudonos, tada juodos.
const DECK_ORDER = [];
for (let rank = 14; rank >= 2; rank--) {
  for (const suit of ['H', 'D', 'C', 'S']) DECK_ORDER.push(suit + rank);
}

/** 3 žaidėjai: A, K, Q, J + 10♥ 10♦ (18 kortų). Kiekvienas papildomas žaidėjas prideda 6 kitas kortas. */
function buildDeck(players) {
  return DECK_ORDER.slice(0, CARDS_PER_PLAYER * players);
}

/** 1, 2, 3, 4, 5, tada 6 tiek kartų, kiek yra žaidėjų, tada 5, 4, 3, 2, 1. */
function roundSizes(players) {
  const sizes = [1, 2, 3, 4, 5];
  for (let i = 0; i < players; i++) sizes.push(CARDS_PER_PLAYER);
  sizes.push(5, 4, 3, 2, 1);
  return sizes;
}

const defaultRand = (k) => crypto.randomInt(k);

function shuffle(cards, rand = defaultRand) {
  const a = cards.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class RuleError extends Error {}
function fail(message) {
  throw new RuleError(message);
}

function createGame(players, opts = {}) {
  if (!Number.isInteger(players) || players < MIN_PLAYERS || players > MAX_PLAYERS) {
    fail(`Žaisti galima nuo ${MIN_PLAYERS} iki ${MAX_PLAYERS} žaidėjų`);
  }
  const rand = opts.rand || defaultRand;
  const g = {
    n: players,
    sizes: roundSizes(players),
    firstDealer: opts.firstDealer ?? rand(players),
    roundIdx: -1,
    scores: Array(players).fill(0),
    history: [],
    phase: null,
    round: null,
    rand,
  };
  startRound(g);
  return g;
}

function startRound(g) {
  g.roundIdx++;
  const n = g.n;
  const dealer = (g.firstDealer + g.roundIdx) % n;
  g.round = {
    idx: g.roundIdx,
    size: g.sizes[g.roundIdx],
    dealer,
    cutter: (dealer + 1) % n, // kairėje nuo dalintojo sėdintis žaidėjas
    deck: shuffle(buildDeck(n), g.rand),
    cutPos: null,
    dealtCount: 0,
    hands: Array.from({ length: n }, () => []),
    trumpCard: null,
    trumpSuit: null,
    trumpFromDealer: false,
    bids: Array(n).fill(null),
    won: Array(n).fill(0),
    turn: null,
    leader: null,
    trick: [],
    trickNo: 0,
    trickWinner: null,
    lastTrick: null,
    played: [],
    jackRedeals: 0, // kiek kartų koziriu buvo atverstas širdžių valetas (kiekvienas – dalintojui −10)
  };
  g.phase = 'cutting';
}

/** Atverstas širdžių valetas: kaladė permaišoma, vėl nukeliama ir dalinama iš naujo. */
function redeal(g) {
  const r = g.round;
  r.jackRedeals++;
  r.deck = shuffle(buildDeck(g.n), g.rand);
  r.cutPos = null;
  r.dealtCount = 0;
  r.hands = Array.from({ length: g.n }, () => []);
  r.trumpCard = null;
  r.trumpSuit = null;
  r.trumpFromDealer = false;
  r.turn = null;
  g.phase = 'cutting';
}

/** Kaladės nukėlimas: viršutinės `pos` kortos padedamos po apačia. */
function cut(g, seat, pos) {
  const r = g.round;
  if (g.phase !== 'cutting') fail('Dabar kaladės kelti negalima');
  if (seat !== r.cutter) fail('Kaladę kelia kitas žaidėjas');
  const len = r.deck.length;
  let p = Number(pos);
  if (pos === null || pos === undefined || !Number.isFinite(p)) {
    const lo = Math.max(1, Math.floor(len * 0.25));
    const hi = Math.min(len - 1, Math.ceil(len * 0.75));
    p = lo + g.rand(hi - lo + 1);
  }
  p = Math.min(len - 1, Math.max(1, Math.round(p)));
  r.cutPos = p;
  r.deck = r.deck.slice(p).concat(r.deck.slice(0, p));
  deal(g);
}

/** Dalinama po vieną, pradedant žaidėju po dalintojo; dalintojas gauna paskutinis. */
function deal(g) {
  const r = g.round;
  const n = g.n;
  let i = 0;
  for (let k = 0; k < r.size; k++) {
    for (let j = 1; j <= n; j++) r.hands[(r.dealer + j) % n].push(r.deck[i++]);
  }
  r.dealtCount = i;
  if (i < r.deck.length) {
    r.trumpCard = r.deck[i]; // atverčiama kita kaladės korta
    r.trumpFromDealer = false;
  } else {
    r.trumpCard = r.deck[i - 1]; // visos išdalintos – dalintojas parodo savo paskutinę kortą
    r.trumpFromDealer = true;
  }
  r.trumpSuit = suitOf(r.trumpCard);
  r.turn = null;
  g.phase = 'dealing';
}

function finishDealing(g) {
  if (g.phase !== 'dealing') return;
  if (g.round.trumpCard === JOKER) {
    redeal(g); // dalintojui −10, kaladė permaišoma
    return;
  }
  g.phase = 'bidding';
  g.round.turn = (g.round.dealer + 1) % g.n;
}

function bid(g, seat, value) {
  const r = g.round;
  if (g.phase !== 'bidding') fail('Dabar šaukti negalima');
  if (seat !== r.turn) fail('Dabar ne tavo eilė šaukti');
  const v = Number(value);
  if (!Number.isInteger(v) || v < 0 || v > r.size) fail(`Šaukti galima nuo 0 iki ${r.size}`);
  r.bids[seat] = v;
  if (r.bids.every((b) => b !== null)) {
    g.phase = 'playing';
    r.leader = (r.dealer + 1) % g.n;
    r.turn = r.leader;
  } else {
    r.turn = (seat + 1) % g.n;
  }
}

/**
 * Kokią spalvą privaloma dėti šiame ėjime.
 * Jei pradėta širdžių valetu – jam pasirinkta rūšis (ir galbūt reikalavimas dėti didžiausias).
 */
function ledInfo(trick) {
  if (!trick.length) return { suit: null, highest: false };
  const first = trick[0];
  if (first.card === JOKER) return { suit: first.suit || null, highest: !!first.highest };
  return { suit: suitOf(first.card), highest: false };
}

/** Kortos rūšis ir vertė ėjime: valetas tampa pasirinktos rūšies korta – aukštesne už tūzą arba žemesne už visas. */
function effective(t) {
  if (t.card === JOKER) return { suit: t.suit, rank: t.mode === 'high' ? 15 : 1 };
  return { suit: suitOf(t.card), rank: rankOf(t.card) };
}

/**
 * Kurias kortas galima dėti.
 * Privaloma dėti pradėtą spalvą; neturint – kozerį; neturint ir kozerio – bet kokią.
 * Širdžių valetą galima dėti visada.
 */
function legalCards(hand, trick, trumpSuit) {
  if (!trick.length) return hand.slice();
  const led = ledInfo(trick);
  const normal = hand.filter((c) => c !== JOKER);
  let allowed = normal;
  if (led.suit) {
    const follow = normal.filter((c) => suitOf(c) === led.suit);
    if (follow.length) {
      if (led.highest) {
        const top = Math.max(...follow.map(rankOf));
        allowed = follow.filter((c) => rankOf(c) === top);
      } else {
        allowed = follow;
      }
    } else {
      const trumps = normal.filter((c) => suitOf(c) === trumpSuit);
      allowed = trumps.length ? trumps : normal;
    }
  }
  allowed = allowed.slice();
  if (hand.includes(JOKER)) allowed.push(JOKER);
  return allowed;
}

/**
 * Kas paima: aukščiausias kozeris, o jei kozerių nėra – aukščiausia pradėtos rūšies korta.
 * Širdžių valetas skaičiuojamas kaip jam pasirinktos rūšies korta (15 – virš tūzo, 1 – žemiausia).
 */
function trickWinner(trick, trumpSuit) {
  const led = ledInfo(trick);
  let best = null;
  for (const t of trick) {
    const { suit, rank } = effective(t);
    let score;
    if (suit === trumpSuit) score = 200 + rank;
    else if (suit === led.suit) score = 100 + rank;
    else continue;
    if (!best || score > best.score) best = { seat: t.seat, score };
  }
  return best ? best.seat : trick[0].seat;
}

function play(g, seat, card, decl) {
  const r = g.round;
  if (g.phase !== 'playing') fail('Dabar kortų dėti negalima');
  if (seat !== r.turn) fail('Dabar ne tavo ėjimas');
  const hand = r.hands[seat];
  const idx = hand.indexOf(card);
  if (idx < 0) fail('Tokios kortos neturi');
  if (!legalCards(hand, r.trick, r.trumpSuit).includes(card)) {
    const led = ledInfo(r.trick);
    fail(led.highest ? 'Privalai dėti didžiausią reikalaujamos spalvos kortą' : 'Privalai dėti tos pačios spalvos kortą, o jos neturint – kozerį');
  }
  const entry = { seat, card };
  if (card === JOKER) {
    const d = decl || {};
    if (!SUITS.includes(d.suit)) fail('Pasakyk, kokios rūšies korta bus širdžių valetas');
    if (d.mode !== 'high' && d.mode !== 'low') fail('Pasakyk, ar širdžių valetas bus didžiausia, ar mažiausia tos rūšies korta');
    entry.suit = d.suit;
    entry.mode = d.mode;
    if (r.trick.length === 0) entry.highest = !!d.highest;
  }
  hand.splice(idx, 1);
  r.trick.push(entry);
  r.played.push(card);
  if (r.trick.length === g.n) {
    const w = trickWinner(r.trick, r.trumpSuit);
    r.trickWinner = w;
    r.won[w]++;
    r.turn = null;
    g.phase = 'trickEnd';
  } else {
    r.turn = (seat + 1) % g.n;
  }
}

function finishTrick(g) {
  if (g.phase !== 'trickEnd') return;
  const r = g.round;
  const winner = r.trickWinner;
  r.lastTrick = { cards: r.trick, winner };
  r.trick = [];
  r.trickNo++;
  r.trickWinner = null;
  if (r.trickNo >= r.size) {
    endRound(g);
  } else {
    g.phase = 'playing';
    r.leader = winner;
    r.turn = winner;
  }
}

/**
 * Taškai:
 *  pasavo (0) ir nieko nepaėmė → +5
 *  paėmė tiek, kiek šaukė → +10 už kiekvieną šaukimą
 *  paėmė mažiau → −10 už kiekvieną trūkstamą
 *  paėmė daugiau (arba pasavo, bet paėmė) → +1 už kiekvieną paimtą
 */
function scoreFor(bidValue, won) {
  if (bidValue === 0) return won === 0 ? 5 : won;
  if (won === bidValue) return 10 * bidValue;
  if (won < bidValue) return -10 * (bidValue - won);
  return won;
}

/**
 * Jei kozeriu atverčiamas širdžių valetas (iš kaladės arba dalintojo paskutinė korta),
 * dalintojas gauna −10, o kaladė permaišoma ir dalinama iš naujo. Bauda – už kiekvieną kartą.
 */
const JACK_TRUMP_PENALTY = -10;

function trumpPenalty(g) {
  const r = g.round;
  const penalty = Array(g.n).fill(0);
  penalty[r.dealer] = JACK_TRUMP_PENALTY * r.jackRedeals;
  return penalty;
}

function endRound(g) {
  const r = g.round;
  const penalty = trumpPenalty(g);
  const pts = r.bids.map((b, i) => scoreFor(b, r.won[i]) + penalty[i]);
  pts.forEach((p, i) => { g.scores[i] += p; });
  g.history.push({
    idx: r.idx,
    size: r.size,
    dealer: r.dealer,
    trumpCard: r.trumpCard,
    bids: r.bids.slice(),
    won: r.won.slice(),
    penalty,
    pts,
    totals: g.scores.slice(),
  });
  r.turn = null;
  g.phase = 'roundEnd';
}

function nextRound(g) {
  if (g.phase !== 'roundEnd') return;
  if (g.roundIdx + 1 >= g.sizes.length) g.phase = 'gameOver';
  else startRound(g);
}

/** Kieno veiksmo laukiama. */
function actorSeat(g) {
  if (!g) return null;
  if (g.phase === 'cutting') return g.round.cutter;
  if (g.phase === 'bidding' || g.phase === 'playing') return g.round.turn;
  return null;
}

module.exports = {
  SUITS,
  JOKER,
  MIN_PLAYERS,
  MAX_PLAYERS,
  RuleError,
  suitOf,
  rankOf,
  buildDeck,
  roundSizes,
  shuffle,
  createGame,
  cut,
  finishDealing,
  bid,
  ledInfo,
  legalCards,
  trickWinner,
  play,
  finishTrick,
  scoreFor,
  JACK_TRUMP_PENALTY,
  trumpPenalty,
  nextRound,
  actorSeat,
};
