// =====================================================================
//  기능 QA 자동 점검  (에이전트: .claude/agents/functional-qa.md)
//  브라우저 콘솔 / 자동화 도구에서:   await FunctionalQA.run()          // 전체
//                                     await FunctionalQA.run({ play: [0, 4, 9] })  // 실제 엔진 자동 플레이할 스테이지 지정
//  저장된 진행도·부스터는 점검 전에 백업하고 끝나면 되돌린다.
// =====================================================================
(function () {
  'use strict';
  const results = [];
  const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: ok ? '' : String(detail) }); return ok; };

  // ---- 1. 밸런스 표 ----
  function testBalanceTable() {
    check('BALANCE 로드됨', !!window.BALANCE, 'balance/balance.js 를 못 읽음');
    for (let i = 0; i < BASE_COUNT; i++) {
      const st = STAGES[i];
      check(`스테이지 ${i + 1} 등급 존재`, !!BAL.tiers[st.tier], st.tier);
      check(`스테이지 ${i + 1} 일터 칸 1~5`, st.slots >= 1 && st.slots <= 5, st.slots);
      check(`스테이지 ${i + 1} 확률 범위`, st.link >= 0 && st.link <= 1 && st.jitter >= 0 && st.jitter <= 1, `${st.link}/${st.jitter}`);
    }
    for (const k of BAL.boosterOrder) check(`부스터 ${k} 정의`, !!BAL.boosters[k]);
    // 보상: 10스테이지마다 1~3개
    for (let s = 0; s + 10 <= BASE_COUNT; s += 10) {   // 10스테이지가 다 찬 구간만
      let n = 0;
      for (let i = s; i < Math.min(BASE_COUNT, s + 10); i++) { const r = clearReward(i); if (r) n += Object.values(r).reduce((a, b) => a + b, 0); }
      check(`보상 개수 ${s + 1}~${s + 10} 스테이지 (1~3개)`, n >= 1 && n <= 3, n);
    }
  }

  // ---- 2. 스테이지 생성 일관성 ----
  function testGeneration() {
    for (let i = 0; i < BASE_COUNT; i++) {
      const d = buildStage(i);
      const cells = {}, ants = {};
      d.grid.forEach(r => r.forEach(v => { if (v) cells[v] = (cells[v] || 0) + 1; }));
      d.cols.flat().forEach(a => { ants[a.color] = (ants[a.color] || 0) + a.total; });
      const bad = Object.keys({ ...cells, ...ants }).filter(k => cells[k] !== ants[k]);
      check(`스테이지 ${i + 1} 음식 수 = 쇠똥구리 숫자 합`, !bad.length, bad.map(k => `${k}:${cells[k]}≠${ants[k]}`).join(' '));
      const zero = d.cols.flat().filter(a => a.total <= 0).length;
      check(`스테이지 ${i + 1} 0마리 쇠똥구리 없음`, !zero, zero);
      let badLink = 0;
      d.cols.forEach((col, c) => col.forEach((a, r) => {
        if (!a.group) return;
        // 같은 높이 이웃, 또는 레슨용 엇갈린 사슬(gen.skew)이면 이웃 줄의 다른 높이도 허용
        const skew = STAGES[i].gen && STAGES[i].gen.skew;
        const ok = a.group.members.length === 2 && a.group.members.every(m => d.cols.some((cc, ci) => Math.abs(ci - c) <= 1 && (skew ? cc.includes(m) : cc[r] === m)));
        if (!ok) badLink++;
      }));
      check(`스테이지 ${i + 1} 사슬은 이웃 줄끼리`, !badLink, badLink);
      const s = BalanceQA.evaluate(i, { random: 4, greedy: 8, smart: 60 });
      check(`스테이지 ${i + 1} 풀 수 있음 (QA 시뮬)`, s.solvable, JSON.stringify(s));
    }
  }

  // ---- 게임 상태 불변식: 남은 음식 = 대기열 숫자 + 일터 남은 숫자 + 가지러 가는 중 ----
  function countInvariant(g) {
    const q = g.queues.flat().reduce((s, a) => s + a.total, 0);
    const sl = g.slots.reduce((s, a) => s + (a ? a.total - a.dispatched : 0), 0);
    const go = g.carriers.filter(c => c.state === 'go').length;
    return { ok: q + sl + go === g.remaining, q, sl, go, remaining: g.remaining };
  }

  // 실제 엔진을 화면 없이 빠르게 돌리는 자동 플레이 (greedy)
  function botPick() {
    const g = game;
    if (g.state !== 'play' || !freeSlots().length) return;
    const working = g.slots.some(a => a && hasTarget(a.color));
    const free = freeSlots().length;
    const legal = [];
    for (let c = 0; c < 3; c++) {   // 실제로 고를 수 있는 것만 (사슬은 둘 다 맨 위 + 빈 칸 충분)
      const a = g.queues[c][0];
      if (!a || c === g.lockedCol) continue;   // ⛓ 잠긴 줄은 못 고름
      const ms = a.group ? a.group.members : [a];
      if (ms.every(m => g.queues[m.col][0] === m) && free >= ms.length) legal.push({ c, ms });
    }
    const good = legal.find(o => o.ms.every(m => hasTarget(m.color)));
    if (good) { tryPick(good.c, 0); return; }
    if (!working && !g.carriers.length && legal.length) tryPick(legal[0].c, 0);
  }
  // rescue: 실패하면 부스터(열쇠 → 돌려보내기)로 이어하기, 최대 rescue 번
  function runEngine(maxSteps = 8000, rescue = 0) {
    let border = 0, inv = 0, used = 0, stall = 0, lastSig = '', same = 0;
    for (let k = 0; k < maxSteps; k++) {
      if (game.state === 'fail' && used < rescue) {
        inventory.undo = 9; inventory.key = 9;
        if (useBooster(game.locks.some(L => !L.open) ? 'key' : 'undo')) used++;   // 실패 화면에서 플레이어가 고를 만한 순서
      }
      if (game.state !== 'play') break;
      botPick();
      update(0.05);
      if (k % 10 === 0) { border += borderHits(); if (!countInvariant(game).ok) inv++; }
      // 교착 감지: 쇠똥구리가 있는데 위치가 하나도 안 바뀐 채 200단계(약 90초 게임 시간)
      const sig = game.carriers.map(c => (c.x | 0) + ',' + (c.y | 0)).join(';');
      if (game.carriers.length && sig === lastSig) { if (++same === 200) stall++; } else same = 0;
      lastSig = sig;
    }
    return { state: game.state, remaining: game.remaining, border, inv, rescued: used, stall };
  }

  // ---- 3. 테두리 침범: 바깥 네모 길 위 쇠똥구리가 그림판 테두리(액자 선)를 밟지 않는지 ----
  // drawPlay 와 같은 차선 규칙으로 그려질 위치를 계산해서 액자 안쪽 경계와 비교
  function borderHits() {
    const g = game, BP = beetlePx(), T = g.T, inner = FRAME_IN;
    let hits = 0;
    for (const cr of g.carriers) {
      if (cr.state !== 'go') continue;
      const ux = Math.cos(cr.ang), uy = Math.sin(cr.ang), vertical = Math.abs(uy) > Math.abs(ux);
      const onTop = Math.abs(cr.y - T.y0) < 1, onL = Math.abs(cr.x - T.x0) < 1, onR = Math.abs(cr.x - T.x1) < 1;
      if (!(onTop || onL || onR)) continue;
      const [lx, ly] = laneOffset(cr, BP);   // 게임 그리기와 같은 함수
      const sp = vertical ? getSprite('beetle0', cr.color, 0, BP) : getSprite('beetleWalk0', cr.color, 0, BP);
      const x = cr.x + lx, y = cr.y + ly;
      if (x - sp.lw / 2 < inner.x0 - 0.5 || x + sp.lw / 2 > inner.x1 + 0.5 || y - sp.lh / 2 < inner.y0 - 0.5) hits++;
    }
    return hits;
  }

  function testEngine(play) {
    const keepSpeed = speed, keepMode = mode, keepInv = { ...inventory };
    mode = 'solo'; speed = 9;
    for (const i of play) {
      startStage(i); overlay = null;
      const exp = (5 - (STAGES[i].slots || 5)) + game.locks.filter(L => L.type === 'slot').length;
      check(`스테이지 ${i + 1} 잠긴 일터 ${exp}칸`, game.locked.filter(Boolean).length === exp, game.locked);
      check(`스테이지 ${i + 1} 자물쇠 수 = 그림 속 열쇠 수`, game.locks.length === game.keys.size, `${game.locks.length}/${game.keys.size}`);
      const iceN = Math.round(((STAGES[i].gimmicks || {}).ice || 0) * game.total);
      check(`스테이지 ${i + 1} 얼음 배치`, !iceN || game.ice.size > 0, `${game.ice.size}/${iceN}`);
      const hurdle = STAGES[i].tier === 'hard' || STAGES[i].tier === 'boss';
      const r = runEngine(8000, hurdle ? 6 : 0);   // 허들은 막히면 부스터로 이어하기 (실제 플레이어처럼)
      check(`스테이지 ${i + 1} 실제 엔진 자동 플레이 클리어${hurdle ? ' (부스터 이어하기 허용)' : ''}`, r.state === 'clear', JSON.stringify(r));
      check(`스테이지 ${i + 1} 테두리 밟음 0회`, r.border === 0, r.border);
      check(`스테이지 ${i + 1} 숫자 불변식 유지`, r.inv === 0, r.inv);
      check(`스테이지 ${i + 1} 쇠똥구리 교통 체증 멈춤 없음`, r.stall === 0, r.stall);
      if (r.state === 'clear') {
        check(`스테이지 ${i + 1} 끝나면 얼음·열쇠·선물 0`, !game.ice.size && !game.keys.size && !game.gifts.size, `${game.ice.size}/${game.keys.size}/${game.gifts.size}`);
        check(`스테이지 ${i + 1} 끝나면 자물쇠 모두 열림`, game.locks.every(L => L.open));
      }
    }
    speed = keepSpeed; mode = keepMode; inventory = keepInv;
  }

  // ---- 4. 부스터 ----
  function testBoosters() {
    const keepMode = mode; mode = 'solo';
    const hard = STAGES.findIndex(s => (s.gimmicks || {}).lockSlots);
    startStage(hard); overlay = null;
    inventory = { undo: 2, key: 1, unchain: 1, bomb: 1 };
    // 일터 채우기
    for (let k = 0; k < 5; k++) for (let c = 0; c < 3; c++) if (game.queues[c][0] && !game.queues[c][0].group && freeSlots().length) tryPick(c, 0);
    check('잠긴 칸에는 쇠똥구리가 안 들어감', game.slots.every((a, k) => !(a && game.locked[k])));
    const nQ = game.queues.flat().length;
    check('돌려보내기 사용 가능', useBooster('undo'));
    check('돌려보내기: 대기열 +1', game.queues.flat().length === nQ + 1);
    check('돌려보내기 후 숫자 불변식', countInvariant(game).ok, JSON.stringify(countInvariant(game)));
    check('돌려보내기 개수 감소', inventory.undo === 1);
    const lockedBefore = game.locks.filter(L => !L.open).length;
    check('열쇠 사용', useBooster('key'));
    check('열쇠: 자물쇠 -1', game.locks.filter(L => !L.open).length === lockedBefore - 1);
    check('자물쇠 없으면 열쇠 못 씀', lockedBefore > 1 || boosterBlock('key') !== null);
    game.queues[0][0] && game.queues[1][0] && (() => { const grp = { members: [game.queues[0][0], game.queues[1][0]] }; grp.members.forEach(m => m.group = grp); })();
    check('사슬 끊기 사용', useBooster('unchain'));
    check('사슬 끊기: 사슬 0개', !game.queues.flat().some(a => a.group));
    const rem = game.remaining;
    check('폭탄 조준 시작', useBooster('bomb') && game.aim === 'bomb');
    const k0 = [...game.reach.acc.keys()][0], r0 = Math.floor(k0 / game.C), c0 = k0 % game.C;
    placeBomb(game.gx + (c0 + 0.5) * game.cs, game.gy + (r0 + 0.5) * game.cs);
    check('폭탄: 음식 감소', game.remaining < rem, `${rem}→${game.remaining}`);
    check('폭탄: 개수 감소', inventory.bomb === 0);
    check('폭탄 후 숫자 불변식', countInvariant(game).ok, JSON.stringify(countInvariant(game)));
    check('없는 부스터는 못 씀', !useBooster('bomb'));
    // 실패 → 부스터로 이어하기
    game.state = 'fail'; overlay = 'fail';
    check('실패 화면에서 돌려보내기로 이어하기', useBooster('undo') && game.state === 'play' && overlay === null);
    // 경쟁 모드에서는 못 씀
    mode = 'versus';
    check('경쟁 모드에서는 부스터 못 씀', boosterBlock('undo') !== null);
    mode = keepMode;
  }

  // ---- 4-1. 기믹 규칙 ----
  function testGimmicks() {
    const keepMode = mode; mode = 'solo';
    const iceSt = STAGES.findIndex(s => (s.gimmicks || {}).ice);
    startStage(iceSt); overlay = null;
    const g = game;
    // 얼음 칸은 목표가 안 됨
    const k = [...g.ice].find(k => g.reach.acc.has(k));
    if (k != null) {
      const r = Math.floor(k / g.C), c = k % g.C, col = g.grid[r][c];
      const others = [...g.reach.acc.keys()].filter(x => x !== k && g.grid[Math.floor(x / g.C)][x % g.C] === col && !g.ice.has(x));
      others.forEach(x => g.reserved[Math.floor(x / g.C)][x % g.C] = true);
      check('얼음 칸은 가져갈 대상이 아님', !findTarget(col, 200, 520), col);
      others.forEach(x => g.reserved[Math.floor(x / g.C)][x % g.C] = false);
    }
    // 옆 음식이 없어지면 얼음이 깨짐
    const ik = [...g.ice][0], ir = Math.floor(ik / g.C), ic = ik % g.C;
    const nb = D4.map(([dr, dc]) => [ir + dr, ic + dc]).find(([r, c]) => r >= 0 && c >= 0 && r < g.R && c < g.C && g.grid[r][c] && !g.ice.has(r * g.C + c));
    if (nb) { g.grid[nb[0]][nb[1]] = null; onCellGone(nb[0], nb[1]); check('옆 음식이 없어지면 얼음 깨짐', !g.ice.has(ik)); }
    // 열쇠를 먹으면 자물쇠가 열림 + 잠긴 줄
    const colSt = STAGES.findIndex(s => (s.gimmicks || {}).lockCols);
    startStage(colSt); overlay = null;
    check('잠긴 줄 존재', game.lockedCol >= 0, game.lockedCol);
    const lc = game.lockedCol;
    if (game.queues[lc][0]) { const n = freeSlots().length; tryPick(lc, 0); check('잠긴 줄은 고를 수 없음', freeSlots().length === n); }
    let guard = 0;
    while (game.keys.size && guard++ < 5) { const kk = [...game.keys][0]; onCellGone(Math.floor(kk / game.C), kk % game.C); }
    check('열쇠를 다 먹으면 자물쇠 모두 열림', game.locks.every(L => L.open) && game.lockedCol === -1 && !game.locked.some(Boolean));
    // 선물
    const giftSt = STAGES.findIndex(s => ((s.gimmicks || {}).giftAt || []).length);
    startStage(giftSt); overlay = null;
    const before = boosterTotal(), gk = [...game.gifts][0];
    onCellGone(Math.floor(gk / game.C), gk % game.C);
    check('선물 음식을 먹으면 부스터 +1', boosterTotal() === Math.min(before + 1, before + 1), `${before}→${boosterTotal()}`);
    mode = keepMode;
  }

  // ---- 5. 보상 / 진행도 ----
  function testRewards() {
    inventory = {}; for (const k of BAL.boosterOrder) inventory[k] = 0;
    const boss = STAGES.findIndex(s => s.tier === 'boss');
    cleared = boss - 1;
    firstClear(boss - 1);
    check('보스 직전 스테이지 클리어 선물', !!lastGift && boosterTotal() >= 1, JSON.stringify(lastGift));
    const before = boosterTotal();
    firstClear(boss - 1);   // 이미 깬 스테이지 다시 깸
    check('이미 깬 스테이지는 선물 없음', boosterTotal() === before);
    firstClear(boss);
    check('보스 클리어 선물', boosterTotal() > before);
    inventory.undo = 99; saveInventory(); loadInventory();
    check('부스터 최대 개수 제한', inventory.undo <= (BAL.maxPerBooster || 9), inventory.undo);
  }

  // ---- 4-2. 레슨 검증 (실제 엔진): "함정 전략은 막히고, 레슨대로 하면 풀린다" ----
  //  stages[n].qa.engine = { randomFail, greedyFail, fullFail } 구간을 실제 엔진 자동 플레이로 확인
  //  정책  random: 빈 칸이 생기면 곧 아무거나 / greedy: 닿는 색이면 바로 / full: 숫자까지 보고, 모자라면 기다림 (1장 전부)
  //        chain: full + 사슬을 위해 칸 2개 비워 두기 + 사슬 짝을 가린 줄 먼저 꺼내기 (2장 전부)
  function lessonRun(i, policy, seed) {
    const rng = mulberry32(seed), keep = { speed, mode };
    mode = 'solo'; speed = 9;
    startStage(i); overlay = null;
    const g = game;
    const reachN = color => {
      let n = 0;
      for (const k of g.reach.acc.keys()) { const r = Math.floor(k / g.C), c = k % g.C; if (g.grid[r][c] === color && !g.reserved[r][c] && !g.ice.has(k)) n++; }
      return n;
    };
    const pick = () => {
      if (g.state !== 'play' || !freeSlots().length) return;
      const free = freeSlots().length, legal = [];
      for (let c = 0; c < 3; c++) {
        const a = g.queues[c][0];
        if (!a || c === g.lockedCol) continue;
        const ms = a.group ? a.group.members : [a];
        if (ms.every(m => g.queues[m.col][0] === m) && free >= ms.length) legal.push({ c, ms });
      }
      if (!legal.length) return;
      const any = arr => arr[Math.floor(rng() * arr.length)];
      const working = g.slots.some(a => a && hasTarget(a.color)) || g.carriers.length > 0;
      if (policy === 'random') { if (rng() < 0.3) tryPick(any(legal).c, 0); return; }
      if (policy === 'greedy') {
        const good = legal.filter(o => o.ms.every(m => hasTarget(m.color)));
        if (good.length) tryPick(any(good).c, 0); else if (!working) tryPick(any(legal).c, 0);
        return;
      }
      const fill = a => { const busy = g.slots.filter(s => s && s.color === a.color).reduce((t, s) => t + s.total - s.dispatched, 0); return (reachN(a.color) - busy) / a.total; };
      const sc = o => Math.min(...o.ms.map(fill));
      if (policy.startsWith('chain')) {   // chainWait = ①만, chainFree = ②만 (어느 요령이 결정적인지 재 보는 용도)
        const doWait = policy !== 'chainFree', doFree = policy !== 'chainWait';
        // 2장: 사슬을 아는 플레이어
        //  ① 쓸 만한 사슬이 둘 다 맨 위면: 빈 칸 2개가 될 때까지 다른 쇠똥구리를 넣지 않고 기다렸다가 사슬을 넣음
        //  ② 사슬 한쪽만 맨 위면: 짝을 가리고 있는 줄의 맨 위를 먼저 꺼냄
        const tops = [0, 1, 2].map(c => c === g.lockedCol ? null : g.queues[c][0]);
        const ready = [], blockers = new Set();
        for (const a of tops) {
          if (!a || !a.group) continue;
          const ms = a.group.members;
          if (ms.every(m => g.queues[m.col][0] === m)) { if (!ready.some(r => r.group === a.group)) ready.push(a); }
          else if (doFree) for (const m of ms) if (g.queues[m.col][0] !== m && g.queues[m.col][0]) blockers.add(m.col);
        }
        const useful = ready.filter(a => a.group.members.some(m => fill(m) > 0));
        if (doWait && useful.length) {
          const best = useful.sort((p, q) => Math.min(...q.group.members.map(fill)) - Math.min(...p.group.members.map(fill)))[0];
          if (free >= 2) { tryPick(best.col, 0); return; }
          if (working) return;   // 칸 2개를 비워 두려고 기다림
        }
        const singles = legal.filter(o => o.ms.length === 1);
        const full = singles.filter(o => sc(o) >= 1);
        const unblock = full.filter(o => blockers.has(o.c));
        if (unblock.length) { tryPick(any(unblock).c, 0); return; }
        if (full.length) { tryPick(any(full).c, 0); return; }
        if (!working) {
          const ub = legal.filter(o => blockers.has(o.c));
          const pool = ub.length ? ub : legal;
          tryPick(pool.sort((a, b) => sc(b) - sc(a))[0].c, 0);
        }
        return;
      }
      const full = legal.filter(o => sc(o) >= 1);
      if (full.length) { tryPick(any(full).c, 0); return; }
      if (!working) tryPick(legal.sort((a, b) => sc(b) - sc(a))[0].c, 0);
    };
    for (let k = 0; k < 12000 && g.state === 'play'; k++) { pick(); update(0.05); }
    const st = g.state;
    speed = keep.speed; mode = keep.mode;
    return st;
  }
  function lessonStat(i, n = 8, policies = ['random', 'greedy', 'full']) {
    const out = {};
    for (const p of policies) { let f = 0; for (let s = 0; s < n; s++) if (lessonRun(i, p, s * 31 + 7) !== 'clear') f++; out[p + 'Fail'] = +(f / n).toFixed(2); }
    return out;
  }
  function testLessons(n) {
    for (let i = 0; i < BASE_COUNT; i++) {
      const q = STAGES[i].qa && STAGES[i].qa.engine;
      if (!q) continue;
      const keys = Object.keys(q).filter(k => k.endsWith('Fail'));
      const r = lessonStat(i, n, keys.map(k => k.slice(0, -4)));
      const inR = (v, a) => !a || (v >= a[0] - 1e-9 && v <= a[1] + 1e-9);
      for (const k of keys)
        check(`스테이지 ${i + 1} 레슨(엔진) ${k} ${JSON.stringify(q[k] || '-')}`, inR(r[k], q[k]), JSON.stringify(r));
    }
  }

  async function run(opt = {}) {
    results.length = 0;
    const backup = {};
    for (const k of ['antPuzzleCleared', 'antPuzzleLast', 'antPuzzleSpeed', 'antPuzzleMode', 'antPuzzleBoosters']) backup[k] = store.get(k);
    const keep = { cleared, lastStage, speed, mode, inv: { ...inventory } };
    const errors = [];
    const step = async (name, fn) => { try { fn(); } catch (e) { errors.push(name + ': ' + (e && e.stack || e)); check(`${name} 예외 없음`, false, e && e.message); } await new Promise(r => setTimeout(r, 0)); };
    await step('밸런스 표', testBalanceTable);
    if (opt.generation !== false) await step('스테이지 생성', testGeneration);
    const play = opt.play || STAGES.map((s, i) => i).filter(i => i < BASE_COUNT && (i < 3 || STAGES[i].tier === 'hard' || STAGES[i].tier === 'boss'));
    for (const i of play) await step(`엔진 ${i + 1}`, () => testEngine([i]));
    await step('부스터', testBoosters);
    await step('기믹', testGimmicks);
    await step('보상', testRewards);
    if (opt.lessons !== false) await step('레슨', () => testLessons(opt.lessonRuns || 8));
    // 복구
    for (const k in backup) if (backup[k] != null) store.set(k, backup[k]);
    cleared = keep.cleared; lastStage = keep.lastStage; speed = keep.speed; mode = keep.mode; inventory = keep.inv; saveInventory(); saveProgress();
    goMenu();
    const failed = results.filter(r => !r.ok);
    return { total: results.length, passed: results.length - failed.length, failed, errors };
  }

  window.FunctionalQA = { run, countInvariant, borderHits, runEngine, lessonRun, lessonStat, testLessons, results };
})();
