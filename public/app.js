/* Širdžių valetas – naršyklės dalis */
(() => {
  'use strict';

  // ================= Pagalbinės =================
  const SUIT_SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const SUIT_GEN = { S: 'vynų', H: 'širdžių', D: 'būgnų', C: 'kryžių' };
  const SUIT_NOM = { S: 'Vynai', H: 'Širdys', D: 'Būgnai', C: 'Kryžiai' };
  const JOKER = 'H11';
  const suitOf = (c) => c[0];
  const rankOf = (c) => parseInt(c.slice(1), 10);
  const rankLabel = (r) => ({ 14: 'A', 13: 'K', 12: 'Q', 11: 'J' })[r] || String(r);
  const isRedSuit = (s) => s === 'H' || s === 'D';
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function plural(n, one, few, many) {
    const a = Math.abs(n) % 10;
    const b = Math.abs(n) % 100;
    if (a === 1 && b !== 11) return one;
    if (a >= 2 && a <= 9 && (b < 12 || b > 19)) return few;
    return many;
  }
  function hue(s) {
    let h = 7;
    for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) % 360;
    return h;
  }
  const initial = (name) => esc((Array.from(String(name).trim())[0] || '?').toUpperCase());
  const suitSpan = (s) => `<span class="${isRedSuit(s) ? 'red' : ''}">${SUIT_SYM[s]}</span>`;

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privatus režimas */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* privatus režimas */ } },
  };

  const ICON = {
    list: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/></svg>',
    dots: '<svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  };

  // ================= Būsena =================
  const app = $('#app');
  const fx = $('#fx');
  let session = store.get('sv_session');
  let st = null; // paskutinė parodyta serverio būsena
  let es = null;
  let screen = '';
  let pending = 0;
  let queue = Promise.resolve();
  let busy = false;
  const ui = {
    dealing: null, // { counts:[], trumpShown } – kol rodomas dalinimas
    hideTrick: null,
    pileHidden: false,
    selected: null,
    modal: null,
    jh: null,
    dismissed: null,
    endsAt: 0,
  };
  const sz = { hand: 70, trick: 60, mini: 18, top: 30 };

  function computeSizes() {
    const w = innerWidth;
    const h = innerHeight;
    sz.hand = Math.round(Math.max(54, Math.min(96, Math.min(w * 0.15, h * 0.12))));
    sz.trick = Math.round(Math.max(46, Math.min(84, Math.min(w * 0.135, h * 0.092))));
    sz.mini = Math.round(Math.max(14, Math.min(20, w * 0.04)));
    sz.top = Math.round(Math.max(24, Math.min(32, h * 0.04)));
    const tm = Math.round(Math.max(56, Math.min(100, Math.min(w * 0.16, h * 0.12))));
    const s = document.documentElement.style;
    s.setProperty('--tm', `${tm}px`);
    s.setProperty('--cwh', `${sz.hand}px`);
    s.setProperty('--cwt', `${sz.trick}px`);
    s.setProperty('--cwm', `${sz.mini}px`);
    s.setProperty('--cwtop', `${sz.top}px`);
  }

  // ================= Kortos =================
  function cardHTML(c, cls = '') {
    if (!c) return `<div class="card back ${cls}"></div>`;
    const s = suitOf(c);
    const r = rankOf(c);
    const lab = rankLabel(r);
    const sym = SUIT_SYM[s];
    const tiny = cls.includes('tiny');
    let mid;
    if (c === JOKER && !tiny) mid = '<div class="m"><span class="crown">♛</span><span class="L">J</span><span class="sm">♥</span></div>';
    else if ((r >= 11 && r <= 13) || tiny) mid = `<div class="m"><span class="L">${lab}</span><span class="sm">${sym}</span></div>`;
    else mid = `<div class="m">${sym}</div>`;
    return `<div class="card ${isRedSuit(s) ? 'red' : ''} ${c === JOKER ? 'joker' : ''} ${cls}"><div class="c"><b>${lab}</b><i>${sym}</i></div>${mid}<div class="c r"><b>${lab}</b><i>${sym}</i></div></div>`;
  }
  const flipHTML = (c) => `<div class="flipper"><div class="ff">${cardHTML(c)}</div><div class="fb">${cardHTML(null)}</div></div>`;

  function pileHTML(count) {
    const layers = Math.max(1, Math.min(8, Math.round(count / 5)));
    const sh = [];
    for (let i = 1; i <= layers; i++) sh.push(`${i}px ${i}px 0 ${i % 2 ? '#d8cfbd' : '#b3a891'}`);
    sh.push(`${layers + 2}px ${layers + 5}px 12px rgba(0,0,0,.4)`);
    return `<div class="card back" style="box-shadow:${sh.join(',')}"></div>`;
  }

  function sortHand(hand, trump) {
    let order = ['S', 'H', 'C', 'D'];
    if (trump) {
      const rest = order.filter((s) => s !== trump);
      const reds = rest.filter(isRedSuit);
      const blacks = rest.filter((s) => !isRedSuit(s));
      order = reds.length === 2 ? [reds[0], blacks[0], reds[1]] : [blacks[0], reds[0], blacks[1]];
      order.push(trump);
    }
    const idx = (c) => (c === JOKER ? -1 : order.indexOf(suitOf(c)));
    return hand.slice().sort((a, b) => idx(a) - idx(b) || rankOf(b) - rankOf(a));
  }

  const rot = (card) => {
    let h = 0;
    for (const ch of card) h = (h * 17 + ch.charCodeAt(0)) % 23;
    return h - 11;
  };

  function ledInfo(trick) {
    if (!trick.length) return { suit: null, highest: false };
    const first = trick[0];
    if (first.card === JOKER) {
      if (first.suit) return { suit: first.suit, highest: !!first.highest };
      const other = trick.find((t) => t.card !== JOKER);
      return { suit: other ? suitOf(other.card) : null, highest: false };
    }
    return { suit: suitOf(first.card), highest: false };
  }

  function illegalReason() {
    const g = st.game;
    const r = g.round;
    const led = ledInfo(r.trick);
    const hand = g.hand.filter((c) => c !== JOKER);
    if (led.suit && hand.some((c) => suitOf(c) === led.suit)) {
      return led.highest ? `Privalai dėti didžiausią ${SUIT_GEN[led.suit]} kortą` : `Privalai dėti ${SUIT_GEN[led.suit]} kortą ${suitSpan(led.suit)}`;
    }
    if (hand.some((c) => suitOf(c) === r.trumpSuit)) return `Neturi ${led.suit ? SUIT_GEN[led.suit] : 'reikiamos spalvos'}, todėl privalai dėti kozerį ${suitSpan(r.trumpSuit)}`;
    return 'Šios kortos dėti negalima';
  }

  // ================= Ryšys =================
  async function api(path, body) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let data = {};
    try { data = await res.json(); } catch { /* tuščias atsakymas */ }
    if (!res.ok) {
      const e = new Error(data.error || 'Nepavyko susisiekti su serveriu');
      e.status = res.status;
      throw e;
    }
    return data;
  }

  async function act(type, extra = {}) {
    if (!session) return false;
    try {
      await api('/api/action', { code: session.code, token: session.token, type, ...extra });
      return true;
    } catch (e) {
      if (e.status === 404) dropSession('Kambarys nebeegzistuoja');
      else toast(esc(e.message), 'err');
      return false;
    }
  }

  // Ryšys: pirmiausia bandomas SSE; jei per kelias sekundes nieko negaunama
  // (pvz. per tunelį, kuris SSE nepalaiko), pereinama prie ilgosios apklausos.
  let transport = 'sse';
  let sseWorked = false;
  let connGen = 0;
  const sessionQuery = () => `code=${encodeURIComponent(session.code)}&token=${encodeURIComponent(session.token)}`;

  function connect() {
    const gen = ++connGen;
    if (es) es.close();
    es = null;
    if (transport === 'poll') {
      pollLoop(gen);
      return;
    }
    const src = new EventSource(`/api/stream?${sessionQuery()}`);
    es = src;
    setTimeout(() => {
      if (gen === connGen && !sseWorked) usePolling();
    }, 5000);
    src.onmessage = (e) => {
      sseWorked = true;
      setConn(true);
      let data;
      try { data = JSON.parse(e.data); } catch { return; }
      onState(data);
    };
    src.onerror = () => {
      if (es !== src) return;
      if (src.readyState === EventSource.CLOSED) verifySession();
      else setConn(false);
    };
  }

  function usePolling() {
    console.info('SSE neveikia – naudojama ilgoji apklausa');
    transport = 'poll';
    connect();
  }

  async function pollLoop(gen) {
    let v = -1;
    while (session && gen === connGen) {
      try {
        const r = await fetch(`/api/poll?${sessionQuery()}&v=${v}`, { cache: 'no-store' });
        if (gen !== connGen) return;
        if (r.status === 404) {
          dropSession('Kambarys nebeegzistuoja arba tave pašalino');
          return;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        setConn(true);
        if (data.state) {
          v = data.v;
          onState(data.state);
        }
      } catch {
        if (gen !== connGen) return;
        setConn(false);
        await sleep(2000);
      }
    }
  }

  async function verifySession() {
    if (!session) return;
    try {
      const r = await fetch(`/api/check?${sessionQuery()}`);
      if (r.status === 404) {
        dropSession('Kambarys nebeegzistuoja arba tave pašalino');
        return;
      }
      if (r.ok && !sseWorked) {
        usePolling(); // kambarys yra, bet SSE ryšys neužsimezga
        return;
      }
    } catch { /* tinklas dar neveikia */ }
    setConn(false);
    setTimeout(() => { if (session) connect(); }, 2500);
  }

  function setConn(ok) {
    const el = $('#conn');
    if (el) el.hidden = ok;
  }

  function startSession(r) {
    session = { code: r.code, token: r.token };
    store.set('sv_session', session);
    history.replaceState(null, '', `${location.pathname}?kambarys=${r.code}`);
    st = null;
    render();
    connect();
  }

  function dropSession(msg) {
    connGen++; // sustabdo apklausą
    if (es) es.close();
    es = null;
    session = null;
    store.del('sv_session');
    st = null;
    ui.modal = null;
    ui.dealing = null;
    ui.hideTrick = null;
    fx.innerHTML = '';
    history.replaceState(null, '', location.pathname);
    render();
    if (msg) toast(esc(msg), 'err');
  }

  // ================= Būsenų eilė ir animacijos =================
  function onState(ns) {
    pending++;
    queue = queue
      .then(() => apply(ns))
      .catch((e) => {
        console.error(e);
        fx.innerHTML = '';
        plainApply(ns);
      })
      .finally(() => { pending--; });
  }

  function setState(ns) {
    const wasMyTurn = isMyTurn(st);
    st = ns;
    if (ns.game) ui.endsAt = Date.now() + (ns.game.endsIn || 0);
    if (!wasMyTurn && isMyTurn(ns) && navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) {
      try { navigator.vibrate(35); } catch { /* nepalaikoma */ }
    }
    document.title = isMyTurn(ns) && document.hidden ? '● Tavo eilė – Širdžių valetas' : 'Širdžių valetas';
  }

  function isMyTurn(s) {
    const g = s && s.game;
    if (!g) return false;
    return ['cutting', 'bidding', 'playing'].includes(g.phase) && g.round.turn === s.seat;
  }

  function plainApply(ns) {
    setState(ns);
    ui.dealing = null;
    ui.hideTrick = null;
    ui.pileHidden = false;
    render();
  }

  function newJack(os, ns) {
    const a = os && os.game ? os.game.round.trick : [];
    const b = ns.game ? ns.game.round.trick : [];
    const was = a.some((t) => t.card === JOKER);
    const now = b.find((t) => t.card === JOKER);
    return !was && now ? now : null;
  }

  async function apply(ns) {
    const os = st;
    const jack = os && os.game && ns.game && os.game.roundIdx === ns.game.roundIdx ? newJack(os, ns) : null;
    const nr = ns.game && ns.game.round;
    const jackTrump = os && os.game && nr && nr.trumpCard === JOKER
      && (os.game.roundIdx !== ns.game.roundIdx || os.game.round.trumpCard !== JOKER);
    await applyInner(os, ns);
    if (jack) announceJack(jack);
    if (jackTrump) {
      const who = nr.dealer === ns.seat ? 'Tu (dalintojas) gauni' : `${esc(ns.players[nr.dealer].name)} (dalintojas) gauna`;
      const how = nr.trumpFromDealer ? 'Dalintojo parodyta korta – širdžių valetas!' : 'Kozeriu atverstas širdžių valetas!';
      toast(`${how} ${who} <b>−10</b> tšk.`, 'jack');
    }
  }

  async function applyInner(os, ns) {
    const og = os && os.game;
    const ng = ns.game;
    const canAnim = !reduceMotion && !document.hidden && pending <= 2 && os && ng;
    if (!canAnim) return plainApply(ns);
    const sameRound = og && og.roundIdx === ng.roundIdx;
    const or = og && og.round;
    const nr = ng.round;

    // Surenkamas baigtas ėjimas
    if (og && og.phase === 'trickEnd' && or.trick.length && !(sameRound && ng.phase === 'trickEnd')) {
      await animCollect(or.trickWinner);
    }
    // Naujas raundas: kaladė keliauja kelti
    if (ng.phase === 'cutting' && !(sameRound && og.phase === 'cutting')) {
      setState(ns);
      ui.dealing = null;
      ui.pileHidden = true;
      render();
      await animPileToCutter();
      return;
    }
    // Nukelta – dalinama
    if (sameRound && ng.phase === 'dealing' && og.phase === 'cutting') {
      setState(ns);
      await animCutAndDeal();
      return;
    }
    // Padėtos kortos
    if (sameRound && og.phase === 'playing' && (ng.phase === 'playing' || ng.phase === 'trickEnd')
      && nr.trickNo === or.trickNo && nr.trick.length > or.trick.length) {
      await animTrickAdd(os, ns);
      return;
    }
    plainApply(ns);
  }

  function center(el) {
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }
  function seatAngle(s) {
    const n = st.game.n;
    const rel = (s - st.seat + n) % n;
    return Math.PI / 2 + (rel * 2 * Math.PI) / n;
  }
  function pct(s, f) {
    const a = seatAngle(s);
    return { x: 50 + f * 42 * Math.cos(a), y: 50 + f * 40 * Math.sin(a) };
  }
  const trickF = () => (st.game.n >= 6 ? 0.52 : 0.46);
  const PILE_F = 0.56;
  function tablePt(s, f) {
    const t = $('#table').getBoundingClientRect();
    const p = pct(s, f);
    return { x: t.left + (t.width * p.x) / 100, y: t.top + (t.height * p.y) / 100 };
  }
  function avatarPt(s) {
    const el = $(`.seat[data-seat="${s}"] .avatar`);
    return el ? center(el) : tablePt(s, 1);
  }
  function handPt() {
    const b = $('#hand').getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height * 0.6 };
  }
  const targetPt = (s) => (s === st.seat ? handPt() : avatarPt(s));

  /** Laikinas skraidantis elementas. */
  function sprite(html, pt, o = {}) {
    const w = o.w || sz.trick;
    const h = w * 1.4;
    const el = document.createElement('div');
    el.className = 'fly';
    el.style.cssText = `width:${w}px;height:${h}px;--cw:${w}px;z-index:${o.z || 1}`;
    el.innerHTML = html;
    fx.appendChild(el);
    let cur = { p: pt, r: o.r || 0, s: o.s ?? 1, o: o.o ?? 1 };
    const frame = (c) => ({ transform: `translate(${c.p.x - w / 2}px, ${c.p.y - h / 2}px) rotate(${c.r}deg) scale(${c.s})`, opacity: c.o });
    Object.assign(el.style, frame(cur));
    return {
      el,
      to(keys, opts = {}) {
        const frames = [frame(cur)];
        for (const k of keys) {
          cur = { ...cur, ...k };
          frames.push(frame(cur));
        }
        const dur = opts.dur || 380;
        const delay = opts.delay || 0;
        const a = el.animate(frames, { duration: dur, delay, easing: opts.ease || 'cubic-bezier(.25,.75,.3,1)', fill: 'both' });
        // Jei naršyklė nepiešia (paslėptas langas), animacija gali „užstrigti“ – užbaigiame ją patys.
        const guard = sleep(dur + delay + 300).then(() => { try { a.finish(); } catch { /* jau baigta */ } });
        return Promise.race([a.finished.catch(() => {}), guard]);
      },
      flip(dur) {
        const f = el.querySelector('.flipper');
        if (f) f.animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }], { duration: dur, easing: 'ease-in-out', fill: 'both' });
      },
      remove() { el.remove(); },
    };
  }

  async function fly(html, from, to, o = {}) {
    const s = sprite(html, from, { w: o.w, z: o.z, r: o.r0 || 0, s: o.s0 ?? 1, o: o.o0 ?? 1 });
    if (o.flip) s.flip(o.dur || 380);
    await s.to([{ p: to, r: o.r1 || 0, s: o.s1 ?? 1, o: o.o1 ?? 1 }], { dur: o.dur, delay: o.delay });
    s.remove();
  }

  async function animPileToCutter() {
    const r = st.game.round;
    await fly(pileHTML(r.deckSize), tablePt(r.dealer, PILE_F), tablePt(r.cutter, PILE_F), { dur: 650, r0: -8, z: 3 });
    ui.pileHidden = false;
    if (screen === 'game') {
      renderCenter();
      renderPanel();
    }
  }

  async function animCutAndDeal() {
    const g = st.game;
    const r = g.round;
    const n = g.n;
    const t = r.timing;
    const t0 = performance.now();
    ui.dealing = { counts: Array(n).fill(0), trumpShown: false };
    ui.pileHidden = true;
    render();
    const W = sz.trick;
    const cutAt = tablePt(r.cutter, PILE_F);
    const dealAt = tablePt(r.dealer, PILE_F);
    const dir = cutAt.x > innerWidth / 2 ? -1 : 1;
    const side = { x: cutAt.x + dir * W * 1.25, y: cutAt.y };
    const lift = { x: (cutAt.x + side.x) / 2, y: cutAt.y - W * 0.75 };
    const topN = r.cutPos || Math.floor(r.deckSize / 2);

    // 1. Nukeliama viršutinė dalis, apatinė padedama ant jos
    const bottom = sprite(pileHTML(r.deckSize - topN), cutAt, { z: 2 });
    const top = sprite(pileHTML(topN), cutAt, { z: 3 });
    await top.to([{ p: lift, r: 10 }, { p: side, r: 0 }], { dur: 430 });
    bottom.el.style.zIndex = 4;
    await bottom.to([{ p: lift, r: -8 }, { p: side, r: 0 }], { dur: 430 });
    top.remove();
    bottom.remove();
    // 2. Kaladė grįžta dalintojui
    const pile = sprite(pileHTML(r.deckSize), side, { z: 3 });
    await pile.to([{ p: dealAt }], { dur: 420 });
    const spent = performance.now() - t0;
    if (spent < t.cut) await sleep(t.cut - spent);

    // 3. Dalinama po vieną, dalintojas gauna paskutinis
    const order = [];
    for (let k = 0; k < r.size; k++) for (let j = 1; j <= n; j++) order.push((r.dealer + j) % n);
    pile.el.innerHTML = pileHTML(r.deckSize - r.dealtCount);
    if (r.deckSize === r.dealtCount) pile.el.style.opacity = '0';
    await Promise.all(order.map((s, i) => fly(cardHTML(null), dealAt, targetPt(s), {
      dur: t.flight,
      delay: i * t.interval,
      s1: s === st.seat ? sz.hand / W : 0.45,
      r1: s === st.seat ? 0 : (i % 2 ? 14 : -14),
      z: 5,
    }).then(() => {
      if (!ui.dealing) return;
      ui.dealing.counts[s]++;
      if (s === st.seat) renderHand();
      else renderSeats();
    })));

    // 4. Kozeris: korta atverčiama ir nuskrenda į stalo vidurį, kur lieka kozerio ženklas
    const mark = $('#trumpmark');
    const midPt = mark ? center(mark) : tablePt(r.dealer, 0);
    let trump;
    if (!r.trumpFromDealer) {
      const beside = { x: dealAt.x + dir * W * 0.95, y: dealAt.y };
      trump = sprite(flipHTML(r.trumpCard), dealAt, { z: 6 });
      trump.flip(520);
      await trump.to([{ p: beside, s: 1.15 }], { dur: 520 });
    } else {
      pile.remove();
      const from = r.dealer === st.seat ? handPt() : avatarPt(r.dealer);
      trump = sprite(flipHTML(r.trumpCard), from, { z: 6, s: 0.5 });
      trump.flip(520);
      await trump.to([{ p: dealAt, s: 1.15 }], { dur: 520 });
    }
    toast(`Kozeris – <b>${SUIT_NOM[r.trumpSuit]}</b> ${suitSpan(r.trumpSuit)}${r.trumpFromDealer ? ' (dalintojo korta)' : ''}`);
    await sleep(380);
    ui.dealing.trumpShown = true;
    renderTop();
    renderTrumpMark();
    await trump.to([{ p: midPt, s: 0.75, o: 0 }], { dur: 450 });
    trump.remove();
    pile.remove();
    ui.dealing = null;
    ui.pileHidden = false;
    render();
  }

  async function animTrickAdd(os, ns) {
    const added = ns.game.round.trick.slice(os.game.round.trick.length);
    const fromHand = {};
    for (const t of added) {
      if (t.seat !== ns.seat) continue;
      const el = $(`#hand .hc[data-card="${t.card}"]`);
      if (el) fromHand[t.card] = center(el);
    }
    ui.hideTrick = new Set(added.map((t) => t.card));
    setState(ns);
    render();
    for (const t of added) {
      const target = $(`#center .tcard[data-tc="${t.card}"]`);
      const to = target ? center(target) : tablePt(t.seat, trickF());
      const mine = t.seat === st.seat;
      const from = fromHand[t.card] || (mine ? handPt() : avatarPt(t.seat));
      await fly(mine ? cardHTML(t.card) : flipHTML(t.card), from, to, {
        dur: 340,
        flip: !mine,
        s0: mine ? sz.hand / sz.trick : 0.45,
        r1: rot(t.card),
        z: 5,
      });
      if (ui.hideTrick) ui.hideTrick.delete(t.card);
      if (target) target.classList.remove('hid');
    }
    ui.hideTrick = null;
  }

  async function animCollect(winner) {
    const els = $$('#center .tcard');
    if (!els.length || winner === null || winner === undefined) return;
    const to = avatarPt(winner);
    const items = els.map((el) => ({ p: center(el), c: el.dataset.tc }));
    els.forEach((el) => { el.style.visibility = 'hidden'; });
    await Promise.all(items.map((it, i) => fly(cardHTML(it.c), it.p, to, {
      dur: 430, delay: i * 35, r0: rot(it.c), s1: 0.3, o1: 0.1, z: 4,
    })));
  }

  function announceJack(t) {
    const who = t.seat === st.seat ? 'Tu' : esc(st.players[t.seat].name);
    let msg = `<b>${who}</b>: širdžių valetas – ${t.mode === 'high' ? 'aukščiausia' : 'žemiausia'} korta`;
    if (t.suit) msg += `. Visi deda ${SUIT_GEN[t.suit]} ${suitSpan(t.suit)}${t.highest ? ' – didžiausias!' : ''}`;
    toast(msg, 'jack');
  }

  // ================= Ekranai =================
  function render() {
    let want = 'home';
    if (session) want = !st ? 'loading' : st.game ? 'game' : 'lobby';
    if (want !== screen) {
      screen = want;
      BUILD[want]();
    }
    if (screen === 'lobby') renderLobby();
    else if (screen === 'game') renderGame();
    renderModal();
  }

  const BUILD = {
    loading() {
      app.innerHTML = '<div class="home"><div class="hero"><h1>Širdžių valetas</h1><p class="sub">Jungiamasi…</p></div></div>';
    },
    home() {
      const code = (new URLSearchParams(location.search).get('kambarys') || '').toUpperCase().slice(0, 4);
      const name = store.get('sv_name') || '';
      app.innerHTML = `
        <div class="home">
          <div class="hero">
            <div class="hero-cards">${cardHTML('S14', 'h1')}${cardHTML(JOKER, 'h2')}${cardHTML('D13', 'h3')}</div>
            <h1>Širdžių valetas</h1>
            <p class="sub">Kortų žaidimas 3–8 žaidėjams</p>
          </div>
          <form class="box" id="home-form" onsubmit="return false">
            <label class="fld"><span>Tavo vardas</span><input id="in-name" maxlength="16" autocomplete="nickname" placeholder="Įrašyk vardą" value="${esc(name)}"></label>
            ${code ? `
              <button class="btn primary big" type="button" data-act="join">Prisijungti prie kambario ${esc(code)}</button>
              <div class="or"><span>arba</span></div>
              <div class="join"><input id="in-code" maxlength="4" placeholder="KODAS" value="${esc(code)}" autocapitalize="characters" autocomplete="off"><button class="btn" type="button" data-act="join">Prisijungti</button></div>
              <button class="btn" type="button" data-act="create">Sukurti naują kambarį</button>`
            : `
              <button class="btn primary big" type="button" data-act="create">Sukurti naują kambarį</button>
              <div class="or"><span>arba prisijunk prie draugų</span></div>
              <div class="join"><input id="in-code" maxlength="4" placeholder="KODAS" autocapitalize="characters" autocomplete="off"><button class="btn" type="button" data-act="join">Prisijungti</button></div>`}
          </form>
          <button class="link" data-open="rules">Žaidimo taisyklės</button>
        </div>`;
      $('#in-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') onAct($('#in-code').value.trim() ? 'join' : 'create');
      });
      $('#in-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') onAct('join'); });
      $('#in-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });
      if (!name) setTimeout(() => $('#in-name') && $('#in-name').focus(), 50);
    },
    lobby() {
      app.innerHTML = `
        <div class="lobby">
          <div class="hero"><h1>Širdžių valetas</h1></div>
          <div class="box wide">
            <div class="room-head">
              <div><div class="lbl">Kambario kodas</div><div class="code" id="l-code"></div></div>
              <button class="btn" data-act="invite">Pakviesti draugus</button>
            </div>
            <p class="hint">Draugai gali atsidaryti tą patį adresą ir įvesti kodą arba tiesiog paspausti tavo nuorodą. Trūkstamus žaidėjus gali pakeisti kompiuteris.</p>
            <ol class="plist" id="l-players"></ol>
            <div class="l-info" id="l-info"></div>
            <div class="l-actions" id="l-actions"></div>
          </div>
          <div class="l-foot"><button class="link" data-open="rules">Taisyklės</button><button class="link" data-act="leaveLobby">Išeiti iš kambario</button></div>
        </div>`;
    },
    game() {
      app.innerHTML = `
        <div class="game">
          <header class="top" id="top"></header>
          <main class="table-wrap">
            <div class="table" id="table"><div class="felt"></div><div class="trumpmark" id="trumpmark"></div><div id="center"></div><div id="seats"></div></div>
            <div id="panel"></div>
          </main>
          <footer class="mybar"><div class="status" id="status"></div><div class="hand" id="hand"></div></footer>
          <div class="conn" id="conn" hidden>Ryšys nutrūko – jungiamasi iš naujo…</div>
        </div>`;
      $('#hand').addEventListener('click', onHandClick);
    },
  };

  // ----- Kambarys -----
  function renderLobby() {
    const isHost = st.hostId === st.you;
    const n = st.players.length;
    $('#l-code').textContent = st.code;
    let html = st.players.map((p, i) => `
      <li class="${p.id === st.you ? 'me' : ''}">
        <span class="num">${i + 1}.</span>
        <span class="av" style="--h:${hue(p.name)}">${p.bot ? '🤖' : initial(p.name)}</span>
        <span class="pn">${esc(p.name)}${p.id === st.you ? ' (tu)' : ''}</span>
        ${p.id === st.hostId ? '<span class="tag host">šeimininkas</span>' : ''}
        ${p.bot ? '<span class="tag">kompiuteris</span>' : ''}
        ${!p.online ? '<span class="tag off">atsijungęs</span>' : ''}
        ${isHost && p.id !== st.you ? `<button class="x" data-kick="${p.id}" title="Pašalinti" aria-label="Pašalinti">×</button>` : ''}
      </li>`).join('');
    for (let i = n; i < 3; i++) html += '<li class="empty-seat">Laukiama žaidėjo…</li>';
    $('#l-players').innerHTML = html;
    const cards = 6 * n;
    const rounds = n + 10;
    $('#l-info').innerHTML = n >= 3
      ? `<b>${n}</b> ${plural(n, 'žaidėjas', 'žaidėjai', 'žaidėjų')} · kaladėje <b>${cards}</b> ${plural(cards, 'korta', 'kortos', 'kortų')} · <b>${rounds}</b> ${plural(rounds, 'raundas', 'raundai', 'raundų')}`
      : `Reikia dar <b>${3 - n}</b> ${plural(3 - n, 'žaidėjo', 'žaidėjų', 'žaidėjų')}`;
    const host = st.players.find((p) => p.id === st.hostId);
    $('#l-actions').innerHTML = isHost
      ? `<button class="btn" data-act="addBot" ${n >= 8 ? 'disabled' : ''}>+ Pridėti kompiuterį</button>
         <button class="btn" data-act="shuffleSeats" ${n < 2 ? 'disabled' : ''}>Sumaišyti vietas</button>
         <button class="btn primary big" data-act="start" ${n < 3 ? 'disabled' : ''}>Pradėti žaidimą</button>`
      : `<p class="hint">Laukiama, kol ${esc(host ? host.name : 'šeimininkas')} pradės žaidimą…</p>`;
  }

  // ----- Žaidimas -----
  function renderGame() {
    if (!$('#table')) return;
    renderTop();
    renderTrumpMark();
    renderSeats();
    renderCenter();
    renderPanel();
    renderStatus();
    renderHand();
  }

  function renderTop() {
    const g = st.game;
    const r = g.round;
    const showTrump = r.trumpCard && !(ui.dealing && !ui.dealing.trumpShown);
    const bidsIn = r.bids.filter((b) => b !== null);
    const sum = bidsIn.reduce((a, b) => a + b, 0);
    const cls = bidsIn.length === g.n ? (sum > r.size ? 'over' : sum < r.size ? 'under' : '') : '';
    $('#top').innerHTML = `
      <div class="t-round" title="Raundas ${g.roundIdx + 1} iš ${g.sizes.length}, po ${r.size} ${plural(r.size, 'kortą', 'kortas', 'kortų')}"><b><span class="rl">Raundas </span>${g.roundIdx + 1}/${g.sizes.length}</b><span>po ${r.size} ${plural(r.size, 'kortą', 'kortas', 'kortų')}</span></div>
      <div class="t-trump ${r.trumpPlayed ? 'used' : ''}" id="trump-slot" title="Kozeris">
        <span class="lbl">Kozeris</span>
        ${showTrump ? `${cardHTML(r.trumpCard, 'tiny')}<span class="sym ${isRedSuit(r.trumpSuit) ? 'red' : ''}">${SUIT_SYM[r.trumpSuit]}</span>` : '<span class="ph">?</span>'}
      </div>
      ${bidsIn.length && !ui.dealing ? `<div class="t-bids ${cls}" title="Šaukimų suma / kortų skaičius"><span class="lbl">Šaukta</span><b>${sum}/${r.size}</b></div>` : ''}
      <div class="t-btns">
        <button class="ib" data-open="scores" title="Taškų lentelė" aria-label="Taškų lentelė">${ICON.list}</button>
        <button class="ib" data-open="rules" title="Taisyklės" aria-label="Taisyklės">?</button>
        <button class="ib" data-open="menu" title="Meniu" aria-label="Meniu">${ICON.dots}</button>
      </div>`;
  }

  /** Didelis kozerio ženklas stalo viduryje (po ėjimo kortomis). */
  function renderTrumpMark() {
    const el = $('#trumpmark');
    if (!el) return;
    const g = st.game;
    const r = g.round;
    const show = !!r.trumpSuit && g.phase !== 'cutting' && !(ui.dealing && !ui.dealing.trumpShown);
    if (show && el.dataset.s !== r.trumpSuit) {
      el.dataset.s = r.trumpSuit;
      el.innerHTML = `<span class="ts ${isRedSuit(r.trumpSuit) ? 'red' : ''}">${SUIT_SYM[r.trumpSuit]}</span><span class="tl">Kozeris</span>`;
      el.title = `Kozeris – ${SUIT_NOM[r.trumpSuit]}`;
    }
    el.classList.toggle('on', show);
    $('#table').classList.toggle('has-trump', show);
  }

  function renderSeats() {
    const g = st.game;
    const r = g.round;
    const n = g.n;
    const showBids = !ui.dealing && ['bidding', 'playing', 'trickEnd', 'roundEnd', 'gameOver'].includes(g.phase);
    $('#seats').innerHTML = st.players.map((p, s) => {
      const rel = (s - st.seat + n) % n;
      const pos = pct(s, 1);
      const cnt = ui.dealing ? ui.dealing.counts[s] : r.handCounts[s];
      const b = r.bids[s];
      const w = r.won[s];
      const cls = ['seat'];
      if (rel === 0) cls.push('self');
      if (!ui.dealing && r.turn === s) cls.push('turn');
      if (g.phase === 'trickEnd' && r.trickWinner === s) cls.push('win');
      if (!p.online) cls.push('off');
      let tag = '';
      let dots = '';
      if (showBids) {
        if (b === null) {
          if (g.phase === 'bidding') tag = '<span class="bidtag wait">…</span>';
        } else {
          const state = w > b ? 'over' : b > 0 && w === b ? 'done' : '';
          tag = `<span class="bidtag ${state}" title="Šaukė">${b === 0 ? 'Pass' : b}</span>`;
          for (let i = 0; i < Math.max(b, w); i++) dots += `<i class="${i < w ? (i < b ? 'f' : 'x') : ''}"></i>`;
        }
      }
      const side = Math.cos(seatAngle(s)) > 0.3 ? 'l' : 'r';
      const mini = rel !== 0 && cnt > 0 ? `<div class="mini ${side}">${'<i></i>'.repeat(Math.min(cnt, 6))}</div>` : '';
      let autoBtn = '';
      if (!p.bot && rel !== 0) {
        if (p.left) autoBtn = '<span class="autob on">išėjo · žaidžia kompiuteris</span>';
        else if (!p.online) autoBtn = `<button class="autob ${p.auto ? 'on' : ''}" data-auto="${s}" data-on="${p.auto ? 0 : 1}">${p.auto ? '🤖 žaidžia kompiuteris' : 'Atsijungė · žaisti už jį'}</button>`;
      }
      return `<div class="${cls.join(' ')}" data-seat="${s}" style="left:${pos.x}%;top:${pos.y}%">
          ${mini}
          <div class="avatar" style="--h:${hue(p.name)}">${p.bot ? '🤖' : initial(p.name)}${s === r.dealer ? '<span class="chip-d" title="Dalintojas">D</span>' : ''}${tag}</div>
          <div class="nm">${rel === 0 ? 'Tu' : esc(p.name)}</div>
          <div class="meta"><span class="sc">${g.scores[s]}</span><span class="dots" title="Paimta">${dots}</span></div>
          ${autoBtn}
        </div>`;
    }).join('');
  }

  function renderCenter() {
    const g = st.game;
    const r = g.round;
    let html = '';
    if (g.phase === 'cutting') {
      const p = pct(r.cutter, PILE_F);
      const hidden = ui.pileHidden || r.cutter === st.seat; // kelėjas mato kaladę skydelyje
      html += `<div class="pile ${hidden ? 'hid' : ''}" style="left:${p.x}%;top:${p.y}%">${pileHTML(r.deckSize)}</div>`;
    }
    const tf = trickF();
    r.trick.forEach((t, i) => {
      const p = pct(t.seat, tf);
      const cls = ['tcard'];
      if (ui.hideTrick && ui.hideTrick.has(t.card)) cls.push('hid');
      if (g.phase === 'trickEnd' && t.seat === r.trickWinner) cls.push('win');
      let badge = '';
      if (t.card === JOKER) {
        badge = `<span class="jb ${t.mode}">${t.mode === 'high' ? '▲ aukščiausia' : '▼ žemiausia'}</span>`;
        if (t.suit) badge += `<span class="jd" title="Visi privalo dėti šią spalvą">Visi: <b>${suitSpan(t.suit)}</b>${t.highest ? ' didž.' : ''}</span>`;
      }
      html += `<div class="${cls.join(' ')}" data-tc="${t.card}" style="left:${p.x}%;top:${p.y}%;--rot:${rot(t.card)}deg;z-index:${i + 1}">${cardHTML(t.card)}${badge}</div>`;
    });
    $('#center').innerHTML = html;
  }

  function renderPanel() {
    const g = st.game;
    const r = g.round;
    const el = $('#panel');
    let html = '';
    if (!ui.dealing && g.phase === 'bidding' && r.turn === st.seat) {
      const sum = r.bids.reduce((a, b) => a + (b || 0), 0);
      let btns = '<button class="pass" data-bid="0">Pass</button>';
      for (let i = 1; i <= r.size; i++) btns += `<button data-bid="${i}">${i}</button>`;
      const ts = r.trumpSuit;
      html = `<div class="pbox"><div class="ttl">Kiek kartų paimsi?</div>
        <div class="ptrump">Kozeris: <span class="ptrump-s ${isRedSuit(ts) ? 'red' : ''}">${SUIT_SYM[ts]}</span> ${SUIT_NOM[ts].toLowerCase()}</div>
        <div class="bids">${btns}</div>
        <div class="sub2">Kitų šaukta: <b>${sum}</b> iš ${r.size}. Pass ir nieko nepaėmus – 5 tšk., pavykęs šaukimas – 10 tšk. už kiekvieną.</div></div>`;
    } else if (g.phase === 'cutting' && r.cutter === st.seat && !ui.pileHidden) {
      html = `<div class="pbox"><div class="ttl">Nukelk kaladę</div><div class="cutstrip" id="cutstrip"></div>
        <div class="sub2">Spustelk kaladėje vietą, kur nori nukelti</div>
        <button class="btn" data-act="cutMid" style="margin-top:8px">Nukelti per vidurį</button></div>`;
    }
    if (el.dataset.html !== html) {
      el.innerHTML = html;
      el.dataset.html = html;
      if ($('#cutstrip')) buildCutStrip();
    }
  }

  function buildCutStrip() {
    const strip = $('#cutstrip');
    const len = st.game.round.deckSize;
    const cw = sz.trick;
    const w = Math.max(cw * 3, Math.min(strip.parentElement.clientWidth - 30, 460));
    strip.style.width = `${w}px`;
    const step = (w - cw) / (len - 1);
    strip.innerHTML = Array.from({ length: len }, (_, i) => `<div class="card back" style="left:${i * step}px"></div>`).join('') + '<div class="cutline" hidden></div>';
    const cards = $$('.card', strip);
    const line = $('.cutline', strip);
    const posFromX = (x) => {
      const rect = strip.getBoundingClientRect();
      return Math.max(1, Math.min(len - 1, Math.round((x - rect.left - cw / 2) / step + 0.5)));
    };
    const show = (p) => {
      cards.forEach((c, i) => c.classList.toggle('up', i < p));
      line.hidden = false;
      line.style.left = `${p * step - 1}px`;
    };
    strip.addEventListener('pointermove', (e) => show(posFromX(e.clientX)));
    strip.addEventListener('pointerleave', () => {
      cards.forEach((c) => c.classList.remove('up'));
      line.hidden = true;
    });
    strip.addEventListener('click', (e) => {
      const p = posFromX(e.clientX);
      show(p);
      doCut(p);
    });
  }

  function renderStatus() {
    const g = st.game;
    const r = g.round;
    const me = st.seat;
    const nm = (s) => esc((st.players[s] || {}).name || '');
    let text = '';
    let mine = false;
    if (ui.dealing) {
      text = r.dealer === me ? 'Tu dalini kortas…' : `${nm(r.dealer)} dalina kortas…`;
    } else {
      switch (g.phase) {
        case 'cutting':
          mine = r.cutter === me;
          text = mine ? 'Tavo eilė nukelti kaladę' : `${nm(r.cutter)} kelia kaladę…`;
          break;
        case 'dealing':
          text = r.dealer === me ? 'Tu dalini kortas…' : `${nm(r.dealer)} dalina kortas…`;
          break;
        case 'bidding':
          mine = r.turn === me;
          text = mine ? 'Tavo eilė šaukti' : `${nm(r.turn)} šaukia…`;
          break;
        case 'playing':
          mine = r.turn === me;
          if (mine) {
            if (!canHover && ui.selected) text = 'Spausk tą pačią kortą dar kartą, kad padėtum';
            else if (r.trick.length && r.trick[0].card === JOKER && r.trick[0].suit) {
              const lead = r.trick[0];
              text = `Tavo ėjimas – visi deda ${suitSpan(lead.suit)}${lead.highest ? ' (didžiausią)' : ''}`;
            } else text = r.trick.length ? 'Tavo ėjimas – dėk kortą' : 'Tu pradedi – dėk bet kurią kortą';
          } else text = `${nm(r.turn)} galvoja…`;
          break;
        case 'trickEnd':
          text = r.trickWinner === me ? 'Tu paimi!' : `${nm(r.trickWinner)} paima`;
          mine = r.trickWinner === me;
          break;
        case 'roundEnd':
          text = 'Raundas baigtas';
          break;
        case 'gameOver':
          text = 'Žaidimas baigtas';
          break;
        default:
          break;
      }
    }
    const el = $('#status');
    el.innerHTML = text;
    el.classList.toggle('mine', mine);
  }

  function renderHand() {
    const g = st.game;
    const r = g.round;
    const hand = $('#hand');
    if (!hand) return;
    const myTurn = !ui.dealing && g.phase === 'playing' && r.turn === st.seat;
    const legal = new Set(g.legal);
    const cards = ui.dealing ? Array(ui.dealing.counts[st.seat] || 0).fill(null) : sortHand(g.hand, r.trumpSuit);
    if (ui.selected && (!myTurn || !cards.includes(ui.selected))) ui.selected = null;
    hand.innerHTML = cards.map((c) => {
      const cls = ['hc'];
      if (c && myTurn) cls.push(legal.has(c) ? 'ok' : 'no');
      if (c && c === ui.selected) cls.push('sel');
      if (c && r.trumpFromDealer && r.dealer === st.seat && c === r.trumpCard && !ui.dealing) cls.push('shown');
      return `<div class="${cls.join(' ')}" data-card="${c || ''}" ${c === r.trumpCard && r.trumpFromDealer ? 'title="Parodyta kaip kozeris"' : ''}>${cardHTML(c)}</div>`;
    }).join('');
    layoutHand();
  }

  function layoutHand() {
    const hand = $('#hand');
    if (!hand) return;
    const count = hand.children.length;
    if (!count) return;
    const avail = hand.clientWidth - 12;
    const w = sz.hand;
    let gap = 6;
    if (count > 1 && count * w + (count - 1) * gap > avail) gap = Math.max(18 - w, (avail - w) / (count - 1) - w);
    hand.style.setProperty('--step', `${gap}px`);
  }

  // ================= Langai =================
  function currentModal() {
    if (ui.modal) return ui.modal;
    const g = st && st.game;
    if (!g) return null;
    if (g.phase === 'gameOver') return 'gameOver';
    if (g.phase === 'roundEnd' && ui.dismissed !== g.roundIdx) return 'roundEnd';
    return null;
  }

  let modalHTML = '';
  function renderModal() {
    const root = $('#modal-root');
    let kind = currentModal();
    if (kind && kind !== 'rules' && !(st && session)) kind = null;
    if (kind === 'joker' && !(st.game && st.game.phase === 'playing' && st.game.round.turn === st.seat)) {
      ui.modal = null;
      ui.jh = null;
      kind = currentModal();
    }
    if (!kind) {
      root.innerHTML = '';
      root.dataset.kind = '';
      modalHTML = '';
      return;
    }
    const html = MODALS[kind]();
    if (html === modalHTML && root.dataset.kind === kind) return;
    const same = root.dataset.kind === kind;
    const old = $('.modal', root);
    const scroll = old ? old.scrollTop : 0;
    const wide = kind === 'scores' || kind === 'rules';
    root.innerHTML = `<div class="mback"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
    root.dataset.kind = kind;
    modalHTML = html;
    if (same) {
      $('.mback', root).style.animation = 'none';
      $('.modal', root).style.animation = 'none';
      $('.modal', root).scrollTop = scroll;
    }
    tick();
  }

  function closeModal() {
    const kind = currentModal();
    if (kind === 'gameOver' && !ui.modal) return;
    if (kind === 'roundEnd' && !ui.modal) ui.dismissed = st.game.roundIdx;
    ui.modal = null;
    ui.jh = null;
    renderModal();
  }

  const CLOSE_X = '<button class="ib mclose" data-close aria-label="Uždaryti">✕</button>';

  const MODALS = {
    rules: () => `${CLOSE_X}
      <h2>Žaidimo taisyklės</h2>
      <p>Žaidžia nuo 3 iki 8 žaidėjų. Tikslas – kuo tiksliau atspėti, kiek kartų paimsi, ir surinkti daugiausia taškų.</p>
      <h3>Kaladė</h3>
      <p>3 žaidėjams – tūzai, karaliai, damos, valetai ir du raudoni dešimtukai (18 kortų). Kiekvienas papildomas žaidėjas prideda dar 6 kortas iš eilės žemyn. Tūzas – aukščiausia korta.</p>
      <h3>Raundai</h3>
      <p>Pirmame raunde dalinama po 1 kortą, antrame – po 2 ir t. t. iki 6. Raundas, kai išdalinamos visos kortos (po 6), kartojamas tiek kartų, kiek yra žaidėjų. Po to dalinama po 5, 4, 3, 2 ir 1 kortą.</p>
      <h3>Dalinimas ir kozeris</h3>
      <p>Dalintojas keičiasi pagal laikrodžio rodyklę. Kairėje nuo jo sėdintis žaidėjas nukelia kaladę, o dalintojas savo kortas gauna paskutinis. Po dalinimo atverčiama kita kaladės korta – jos spalva tampa kozeriu (kozeris nugali visas kitos spalvos kortas). Jei išdalinamos visos kortos, dalintojas parodo savo paskutinę kortą – ji ir nustato kozerį.</p>
      <p>Jei kozeriu tampa širdžių valetas (atverstas iš kaladės arba dalintojo parodyta paskutinė korta), kozeris – širdys, o dalintojas gauna <b>−10</b> taškų.</p>
      <h3>Šaukimas</h3>
      <p>Pradedant žaidėju po dalintojo, kiekvienas pasako, kiek kartų paims šiame raunde. Vienas žaidėjas gali šaukti nuo 0 iki tiek, kiek kortų turi rankoje raundo pradžioje. 0 – tai „pass“. Visų žaidėjų šaukimų suma neribojama – ji gali būti ir didesnė už kortų skaičių.</p>
      <h3>Ėjimai</h3>
      <ul>
        <li>Pirmas eina žaidėjas po dalintojo, toliau – tas, kuris paėmė.</li>
        <li>Privaloma dėti tos pačios spalvos kortą. Jei jos neturi – privalai dėti kozerį, o jei ir kozerio neturi – bet kokią kortą.</li>
        <li>Paima aukščiausias kozeris, o jei kozerių nėra – aukščiausia pradėtos spalvos korta.</li>
      </ul>
      <h3>Širdžių valetas</h3>
      <ul>
        <li>Jį galima dėti bet kada, net turint reikiamos spalvos kortų.</li>
        <li>Dedant reikia pasakyti: <b>aukščiausia</b> (laimi prieš viską, net kozerius) arba <b>žemiausia</b> (pralaimi prieš bet kurią kortą).</li>
        <li>Jei valetas dedamas pirmas, privaloma nurodyti spalvą, kurios kortas visi turi dėti. Galima pareikalauti ir didžiausių tos spalvos kortų.</li>
      </ul>
      <h3>Taškai</h3>
      <ul>
        <li>Pasavai ir nieko nepaėmei – <b>+5</b>.</li>
        <li>Paėmei tiek, kiek šaukei – <b>+10</b> už kiekvieną šaukimą.</li>
        <li>Paėmei mažiau – <b>−10</b> už kiekvieną trūkstamą.</li>
        <li>Paėmei daugiau (arba pasavai, bet paėmei) – <b>+1</b> už kiekvieną paimtą kartą.</li>
        <li>Dalintojas, kai kozeriu tampa širdžių valetas – papildomai <b>−10</b>.</li>
      </ul>`,

    menu: () => `${CLOSE_X}
      <h2>Meniu</h2>
      <div class="menu-list">
        <button class="btn" data-open="scores">Taškų lentelė</button>
        <button class="btn" data-open="rules">Taisyklės</button>
        <button class="btn" data-act="invite">Kopijuoti kambario nuorodą</button>
        <button class="btn danger" data-act="leaveGame">Išeiti iš žaidimo</button>
      </div>
      <p class="hint" style="margin-top:12px">Kambario kodas: <b>${esc(st.code)}</b>. Jei uždarysi naršyklę, galėsi grįžti tuo pačiu įrenginiu.</p>`,

    scores: () => {
      const g = st.game;
      if (!g) return `${CLOSE_X}<h2>Taškų lentelė</h2><p>Žaidimas dar neprasidėjo.</p>`;
      const head = st.players.map((p, s) => `<th class="${s === st.seat ? 'me' : ''}">${esc(p.name)}</th>`).join('');
      let body = '';
      g.sizes.forEach((size, i) => {
        const h = g.history[i];
        const cur = i === g.roundIdx && !h;
        let cells;
        if (h) {
          cells = st.players.map((_, s) => `<td><span class="bw">${h.bids[s] === 0 ? 'pass' : h.bids[s]} / ${h.won[s]}</span><span class="${h.pts[s] >= 0 ? 'pos' : 'neg'}">${h.pts[s] > 0 ? '+' : ''}${h.pts[s]}</span> · <span class="tot">${h.totals[s]}</span></td>`).join('');
        } else if (cur) {
          cells = st.players.map((_, s) => {
            const b = g.round.bids[s];
            return `<td><span class="bw">${b === null ? '–' : b === 0 ? 'pass' : b} / ${g.round.won[s]}</span>…</td>`;
          }).join('');
        } else {
          cells = st.players.map(() => '<td></td>').join('');
        }
        const ts = h ? suitOf(h.trumpCard) : cur ? g.round.trumpSuit : null;
        const jackMark = h && h.penalty && h.penalty.some((x) => x < 0)
          ? ' <span class="neg" title="Kozeris buvo širdžių valetas – dalintojui −10">J♥</span>' : '';
        body += `<tr class="${cur ? 'cur' : !h ? 'future' : ''}"><td class="rd">${i + 1}. po ${size} ${ts ? suitSpan(ts) : ''}${jackMark}</td>${cells}</tr>`;
      });
      const foot = `<tr><td class="rd">Iš viso</td>${g.scores.map((sc) => `<td>${sc}</td>`).join('')}</tr>`;
      return `${CLOSE_X}<h2>Taškų lentelė</h2>
        <div class="sheet-wrap"><table class="sheet"><thead><tr><th>Raundas</th>${head}</tr></thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table></div>
        <p class="hint" style="margin-top:10px">Langelyje: šaukė / paėmė, gauti taškai · bendra suma.</p>`;
    },

    joker: () => {
      const j = ui.jh;
      const leading = st.game.round.trick.length === 0;
      const suitBtns = ['S', 'H', 'D', 'C'].map((s) => `<button data-jsuit="${s}" class="${j.suit === s ? 'on' : ''}" aria-label="${SUIT_NOM[s]}">${suitSpan(s)}</button>`).join('');
      return `<h2>Širdžių valetas</h2>
        <p>Pasakyk, kokia bus šios kortos galia:</p>
        <div class="seg">
          <button data-jmode="high" class="${j.mode === 'high' ? 'on' : ''}">▲ Aukščiausia<small>laimi prieš viską, net kozerius</small></button>
          <button data-jmode="low" class="${j.mode === 'low' ? 'on' : ''}">▼ Žemiausia<small>pralaimi prieš bet kurią kortą</small></button>
        </div>
        ${leading ? `
          <h3>Kokios spalvos kortas visi turi dėti?</h3>
          <div class="seg suits">${suitBtns}</div>
          <label class="chk ${j.suit ? '' : 'dis'}"><input type="checkbox" data-jhigh ${j.highest ? 'checked' : ''} ${j.suit ? '' : 'disabled'}> Visi privalo dėti didžiausią tos spalvos kortą</label>
          <p class="hint" style="margin-top:8px">${j.suit ? `Visi privalės dėti ${SUIT_GEN[j.suit]} kortas (jų neturint – kozerį).` : 'Pradedant valetu spalvą nurodyti privaloma.'}</p>` : ''}
        <div class="actions"><button class="btn" data-close>Atšaukti</button><button class="btn primary" data-act="playJack" ${leading && !j.suit ? 'disabled' : ''}>Dėti valetą</button></div>`;
    },

    roundEnd: () => {
      const g = st.game;
      const h = g.history[g.history.length - 1];
      if (!h) return '';
      const last = g.roundIdx + 1 >= g.sizes.length;
      const pen = (h.penalty || []).findIndex((x) => x < 0);
      const rows = st.players.map((p, s) => `
        <tr class="${s === st.seat ? 'me' : ''}">
          <td>${esc(p.name)}${s === h.dealer ? '<span class="dmark" title="Dalintojas">D</span>' : ''}</td>
          <td>${h.bids[s] === 0 ? 'Pass' : h.bids[s]}</td>
          <td>${h.won[s]}</td>
          <td class="${h.pts[s] >= 0 ? 'pos' : 'neg'}">${h.pts[s] > 0 ? '+' : ''}${h.pts[s]}</td>
          <td><b>${h.totals[s]}</b></td>
        </tr>`).join('');
      const ready = g.ready.includes(st.you);
      return `<h2>${last ? 'Paskutinis raundas baigtas' : `Raundas ${h.idx + 1} baigtas`}</h2>
        <table class="res"><thead><tr><th>Žaidėjas</th><th>Šaukė</th><th>Paėmė</th><th>Taškai</th><th>Iš viso</th></tr></thead><tbody>${rows}</tbody></table>
        ${pen >= 0 ? `<p class="hint" style="margin-top:10px">Kozeris buvo širdžių valetas – dalintojui ${esc(st.players[pen].name)} įskaičiuota −10.</p>` : ''}
        <div class="actions"><span class="grow" id="cd"></span><button class="btn primary" data-act="ready" ${ready ? 'disabled' : ''}>${ready ? 'Laukiama kitų…' : last ? 'Rezultatai' : 'Toliau'}</button></div>`;
    },

    gameOver: () => {
      const g = st.game;
      const order = st.players.map((p, s) => ({ p, s, sc: g.scores[s] })).sort((a, b) => b.sc - a.sc);
      let place = 0;
      let prev = null;
      const items = order.map((o, i) => {
        if (o.sc !== prev) {
          place = i + 1;
          prev = o.sc;
        }
        const medal = ['🥇', '🥈', '🥉'][place - 1] || `${place}.`;
        return `<li class="${place === 1 ? 'first' : ''}"><span class="medal">${medal}</span><span class="rn">${esc(o.p.name)}${o.s === st.seat ? ' (tu)' : ''}</span><span class="rs">${o.sc}</span></li>`;
      }).join('');
      const winners = order.filter((o) => o.sc === order[0].sc);
      const title = winners.some((o) => o.s === st.seat) ? 'Tu laimėjai! 🎉' : `Laimėjo ${winners.map((o) => esc(o.p.name)).join(' ir ')}`;
      return `<h2>${title}</h2><ol class="rank">${items}</ol>
        <div class="actions"><button class="btn" data-open="scores">Taškų lentelė</button><button class="btn" data-act="toLobby">Į kambarį</button><button class="btn primary" data-act="newGame">Žaisti dar kartą</button></div>`;
    },
  };

  function tick() {
    const cd = $('#cd');
    if (!cd || !st || !st.game) return;
    const s = Math.max(0, Math.ceil((ui.endsAt - Date.now()) / 1000));
    const last = st.game.roundIdx + 1 >= st.game.sizes.length;
    cd.textContent = s > 0 ? `${last ? 'Rezultatai' : 'Kitas raundas'} po ${s} s` : '';
  }
  setInterval(tick, 300);

  // ================= Pranešimai =================
  function toast(msg, kind = '') {
    const root = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = msg;
    root.appendChild(el);
    while (root.children.length > 3) root.firstChild.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 350);
    }, kind === 'jack' ? 4200 : 2800);
  }

  // ================= Veiksmai =================
  async function createRoom() {
    const name = $('#in-name').value.trim();
    if (!name) {
      toast('Įrašyk savo vardą', 'err');
      $('#in-name').focus();
      return;
    }
    store.set('sv_name', name);
    try {
      startSession(await api('/api/create', { name }));
    } catch (e) {
      toast(esc(e.message), 'err');
    }
  }

  async function joinRoom() {
    const name = $('#in-name').value.trim();
    const code = $('#in-code').value.trim().toUpperCase();
    if (!name) {
      toast('Įrašyk savo vardą', 'err');
      $('#in-name').focus();
      return;
    }
    if (code.length !== 4) {
      toast('Įrašyk 4 raidžių kambario kodą', 'err');
      $('#in-code').focus();
      return;
    }
    store.set('sv_name', name);
    try {
      startSession(await api('/api/join', { name, code }));
    } catch (e) {
      toast(esc(e.message), 'err');
    }
  }

  async function invite() {
    const url = `${location.origin}${location.pathname}?kambarys=${st.code}`;
    if (navigator.share && !canHover) {
      try {
        await navigator.share({ title: 'Širdžių valetas', text: `Prisijunk prie mano kambario ${st.code}`, url });
        return;
      } catch { /* atšaukta */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Nuoroda nukopijuota – nusiųsk ją draugams');
    } catch {
      prompt('Nukopijuok šią nuorodą:', url);
    }
  }

  async function guarded(fn) {
    if (busy) return;
    busy = true;
    try { await fn(); } finally { busy = false; }
  }
  const doBid = (v) => guarded(() => act('bid', { value: v }));
  const doCut = (p) => guarded(() => act('cut', { pos: p }));
  const sendPlay = (card, decl) => guarded(() => act('play', { card, decl }));

  async function onAct(a) {
    switch (a) {
      case 'create': return createRoom();
      case 'join': return joinRoom();
      case 'invite': return invite();
      case 'addBot':
      case 'shuffleSeats':
      case 'start':
      case 'ready':
        return act(a);
      case 'newGame':
      case 'toLobby':
        ui.modal = null;
        return act(a);
      case 'leaveLobby':
        await act('leave');
        return dropSession();
      case 'leaveGame':
        if (!confirm('Išeiti iš žaidimo? Už tave toliau žais kompiuteris.')) return undefined;
        await act('leave');
        return dropSession();
      case 'cutMid':
        return doCut(Math.round(st.game.round.deckSize / 2));
      case 'playJack': {
        const j = ui.jh;
        if (!j) return undefined;
        if (st.game.round.trick.length === 0 && !j.suit) {
          toast('Pradėdamas valetu privalai nurodyti spalvą', 'err');
          return undefined;
        }
        ui.modal = null;
        ui.jh = null;
        renderModal();
        return sendPlay(JOKER, { mode: j.mode, suit: j.suit || undefined, highest: !!(j.suit && j.highest) });
      }
      default:
        return undefined;
    }
  }

  function onHandClick(e) {
    const el = e.target.closest('.hc');
    if (!el || !st || !st.game) return;
    const c = el.dataset.card;
    if (!c) return;
    const g = st.game;
    if (ui.dealing || g.phase !== 'playing' || g.round.turn !== st.seat) return;
    if (!g.legal.includes(c)) {
      toast(illegalReason(), 'err');
      return;
    }
    if (!canHover && ui.selected !== c) {
      ui.selected = c;
      renderHand();
      renderStatus();
      return;
    }
    ui.selected = null;
    if (c === JOKER) {
      ui.jh = { mode: 'high', suit: '', highest: false };
      ui.modal = 'joker';
      renderModal();
      return;
    }
    sendPlay(c);
  }

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.classList && t.classList.contains('mback')) {
      closeModal();
      return;
    }
    if (ui.selected && t.isConnected && !t.closest('#hand')) {
      ui.selected = null;
      if (screen === 'game') {
        renderHand();
        renderStatus();
      }
    }
    const el = t.closest('[data-open],[data-close],[data-act],[data-bid],[data-kick],[data-auto],[data-jmode],[data-jsuit]');
    if (!el) return;
    const d = el.dataset;
    if (d.open !== undefined) {
      ui.modal = d.open;
      renderModal();
    } else if (el.hasAttribute('data-close')) {
      closeModal();
    } else if (d.bid !== undefined) {
      doBid(Number(d.bid));
    } else if (d.kick) {
      act('kick', { id: d.kick });
    } else if (d.auto !== undefined) {
      act('auto', { seat: Number(d.auto), on: d.on === '1' });
    } else if (d.jmode) {
      ui.jh.mode = d.jmode;
      renderModal();
    } else if (d.jsuit !== undefined) {
      ui.jh.suit = d.jsuit;
      if (!ui.jh.suit) ui.jh.highest = false;
      renderModal();
    } else if (d.act) {
      onAct(d.act);
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.matches('[data-jhigh]') && ui.jh) ui.jh.highest = e.target.checked;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      return;
    }
    if (screen !== 'game' || !st || !st.game || e.target.matches('input')) return;
    const g = st.game;
    if (/^[0-6]$/.test(e.key) && g.phase === 'bidding' && g.round.turn === st.seat && Number(e.key) <= g.round.size && !ui.dealing) {
      doBid(Number(e.key));
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) document.title = 'Širdžių valetas';
  });

  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      computeSizes();
      if (screen === 'game' && st && st.game) renderGame();
    }, 120);
  });

  // ================= Pradžia =================
  computeSizes();
  if (new URLSearchParams(location.search).get('rysys') === 'apklausa') transport = 'poll';
  const urlCode = (new URLSearchParams(location.search).get('kambarys') || '').toUpperCase();
  if (session && urlCode && session.code !== urlCode) {
    session = null;
    store.del('sv_session');
  }
  render();
  if (session) connect();
})();
