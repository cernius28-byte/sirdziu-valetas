'use strict';
/** Kompiuterinių žaidėjų sprendimai: nukėlimas, šaukimas ir ėjimai. */
const { SUITS, JOKER, suitOf, rankOf, buildDeck, ledInfo, legalCards, trickWinner } = require('./game');

/** Kiek dar nematytų aukštesnių tos pačios spalvos kortų gali turėti kiti. */
function unseenHigher(g, seat, card) {
  const r = g.round;
  const s = suitOf(card);
  const rk = rankOf(card);
  const mine = new Set(r.hands[seat]);
  const gone = new Set(r.played);
  let count = 0;
  for (const c of buildDeck(g.n)) {
    if (c === JOKER || suitOf(c) !== s || rankOf(c) <= rk) continue;
    if (mine.has(c) || gone.has(c)) continue;
    if (c === r.trumpCard && !r.trumpFromDealer) continue; // atversta korta nežaidžia
    count++;
  }
  return count;
}

/** Apytikslė tikimybė, kad korta paims. */
function strength(g, seat, card) {
  if (card === JOKER) return 1;
  const higher = Math.min(3, unseenHigher(g, seat, card));
  if (suitOf(card) === g.round.trumpSuit) return [0.95, 0.7, 0.45, 0.25][higher];
  const crowd = Math.max(0.45, 1 - 0.08 * (g.n - 3)); // daugiau žaidėjų – didesnė rizika būti nukirstam
  return [0.78, 0.35, 0.12, 0.05][higher] * crowd;
}

function cutPos(g) {
  const len = g.round.deck.length;
  return Math.round(len * (0.3 + Math.random() * 0.4));
}

function bid(g, seat) {
  const r = g.round;
  const hand = r.hands[seat];
  let est = hand.reduce((sum, c) => sum + strength(g, seat, c), 0);
  const trumps = hand.filter((c) => c !== JOKER && suitOf(c) === r.trumpSuit).length;
  if (trumps >= 3) est += (trumps - 2) * 0.25;
  return Math.max(0, Math.min(r.size, Math.floor(est + 0.35)));
}

function wouldWin(g, seat, card, mode) {
  const r = g.round;
  const entry = card === JOKER ? { seat, card, mode } : { seat, card };
  return trickWinner(r.trick.concat([entry]), r.trumpSuit) === seat;
}

/**
 * Kokia rūšimi paskelbti širdžių valetą.
 * Norint paimti – didžiausias kozeris (jo niekas neperkerta).
 * Norint atiduoti – mažiausia pradėtos rūšies korta, o pradedant – rūšis, kurią kiti greičiausiai turi.
 */
function jackDecl(g, seat, mode) {
  const r = g.round;
  const leading = r.trick.length === 0;
  if (mode === 'high') return leading ? { mode, suit: r.trumpSuit, highest: true } : { mode, suit: r.trumpSuit };
  if (!leading) return { mode, suit: ledInfo(r.trick).suit || SUITS.find((s) => s !== r.trumpSuit) };
  const hand = r.hands[seat].filter((c) => c !== JOKER);
  const gone = new Set(r.played);
  const others = (s) => buildDeck(g.n).filter((c) => c !== JOKER && suitOf(c) === s && !hand.includes(c)
    && !gone.has(c) && !(c === r.trumpCard && !r.trumpFromDealer)).length;
  const suit = SUITS.filter((s) => s !== r.trumpSuit).sort((a, b) => others(b) - others(a))[0];
  return { mode, suit, highest: false };
}

function play(g, seat) {
  const r = g.round;
  const hand = r.hands[seat];
  const legal = legalCards(hand, r.trick, r.trumpSuit);
  const normal = legal.filter((c) => c !== JOKER);
  const hasJack = legal.includes(JOKER);
  const jack = (mode) => ({ card: JOKER, decl: jackDecl(g, seat, mode) });

  const bidValue = r.bids[seat];
  const won = r.won[seat];
  const need = bidValue - won;
  const tricksLeft = r.size - r.trickNo;
  // Jei jau paimta daugiau nei šaukta – kiekvienas paėmimas duoda +1, tad verta imti.
  const wantWin = won !== bidValue;
  const urgent = need > 0 && need >= tricksLeft;
  const leading = r.trick.length === 0;
  const last = r.trick.length === g.n - 1;

  if (!normal.length) return jack(wantWin ? 'high' : 'low');

  const S = (c) => strength(g, seat, c);
  const asc = (a, b) => S(a) - S(b) || rankOf(a) - rankOf(b);
  const sorted = normal.slice().sort(asc);
  const weakest = sorted[0];
  const strongest = sorted[sorted.length - 1];

  if (wantWin) {
    if (leading) {
      if (hasJack && (urgent || S(strongest) < 0.45)) return jack('high');
      return { card: strongest };
    }
    const winners = normal.filter((c) => wouldWin(g, seat, c)).sort(asc);
    if (winners.length) return { card: last ? winners[0] : winners[winners.length - 1] };
    if (hasJack && (urgent || (need > 0 && tricksLeft <= need + 1))) return jack('high');
    return { card: weakest };
  }

  // Nenori imti.
  if (leading) {
    if (hasJack && S(weakest) >= 0.5) return jack('low');
    return { card: weakest };
  }
  const losers = normal.filter((c) => !wouldWin(g, seat, c)).sort(asc);
  if (losers.length) return { card: losers[losers.length - 1] }; // atsikratyti stipriausios nepaimančios
  if (hasJack) return jack('low');
  return { card: last ? strongest : weakest };
}

module.exports = { cutPos, bid, play, strength };
