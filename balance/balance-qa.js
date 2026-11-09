// =====================================================================
//  밸런스 QA 시뮬레이터  (에이전트: .claude/agents/balance-qa.md)
//  실제 게임의 스테이지 생성(buildStage)·도달 규칙(reachMap)을 그대로 쓰고,
//  쇠똥구리 이동 애니메이션만 뺀 "논리 시뮬레이션"으로 수백 판을 빠르게 돌린다.
//
//  사용 (브라우저 콘솔 / 자동화 도구):
//    BalanceQA.evaluate(9)                 // 10스테이지 측정
//    BalanceQA.report()                    // 전 스테이지 표 (console.table + 반환)
//    BalanceQA.tune(9, { seeds: 30 })      // 목표 구간에 맞는 seed 찾기
//    BalanceQA.tuneAll()                   // 목표를 벗어난 스테이지 전부 seed 재탐색 → BALANCE.stages 덮어쓰기 제안
//
//  플레이어 모델
//    random : 빈 일터가 생기면 맨 위 쇠똥구리 아무나 누름 (처음 하는 사람)
//    greedy : "지금 먹을 수 있는 색"만 누르고, 없으면 기다림. 다 막히면 아무거나 (보통 사람)
//    smart  : greedy를 무작위 선택으로 여러 번 시도 — 한 번이라도 깨면 '풀 수 있음'
// =====================================================================
(function () {
  'use strict';

  function makeState(idx) {
    const d = buildStage(idx);
    const gid = new Map();
    const queues = d.cols.map(col => col.map(a => {
      let g = -1;
      if (a.group) { if (!gid.has(a.group)) gid.set(a.group, gid.size); g = gid.get(a.group); }
      return { color: a.color, total: a.total, grp: g };
    }));
    let cells = 0;
    d.grid.forEach(r => r.forEach(v => { if (v) cells++; }));
    return { grid: d.grid, queues, slots: STAGES[idx].slots || 5, beetles: queues.reduce((s, q) => s + q.length, 0), chains: gid.size, cells,
      ice: d.ice || [], keys: d.keys || [], gifts: (d.gifts || []).length, locks: d.locks || [],
      geo: geometry(d.grid.length, d.grid[0].length), homes: [0, 1, 2, 3, 4].map(homePos) };
  }

  function reachByColor(grid, frozen) {
    const info = reachMap(grid), C = grid[0].length, by = {};
    for (const [k, cands] of info.acc) {
      if (frozen && frozen.has(k)) continue;   // 🧊 얼음은 못 가져감
      const v = grid[Math.floor(k / C)][k % C];
      (by[v] = by[v] || []).push(k);
    }
    by.__info = info;
    return by;
  }

  // 한 판 시뮬레이션. policy: 'random' | 'greedy'. rng: 0~1 함수
  function simulate(base, policy, rng) {
    const grid = base.grid.map(r => r.slice()), C = grid[0].length;
    const queues = base.queues.map(q => q.map(a => ({ ...a })));
    const slots = [], R = grid.length;
    let left = base.cells, picks = 0, waits = 0, forced = 0, keysEaten = 0;
    // 기믹 상태: 얼음 · 열쇠 · 자물쇠 (실제 게임 규칙과 같음)
    const frozen = new Set(base.ice), keys = new Set(base.keys), locks = base.locks.map(L => ({ ...L, open: false }));
    let open = base.slots - locks.filter(L => L.type === 'slot').length;
    let lockedCol = (locks.find(L => L.type === 'col') || { col: -1 }).col;
    const eat = k => {
      const r = Math.floor(k / C), c = k % C;
      for (const [dr, dc] of D4) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nc >= 0 && nr < R && nc < C) frozen.delete(nr * C + nc); }
      if (keys.has(k)) {
        keys.delete(k); keysEaten++;
        const L = locks.find(l => !l.open);
        if (L) { L.open = true; if (L.type === 'slot') open++; else lockedCol = -1; }
      }
    };
    let by = reachByColor(grid, frozen);
    for (let guard = 0; guard < 20000; guard++) {
      if (left === 0) return { ok: true, picks, waits, forced, keysEaten };
      // ---- 고를 수 있는 쇠똥구리 ----
      const free = open - slots.length;
      const legal = [];
      if (free > 0) {
        const seen = new Set();
        for (let c = 0; c < 3; c++) {
          const a = queues[c][0];
          if (!a || c === lockedCol) continue;
          if (a.grp < 0) { legal.push([c]); continue; }
          if (seen.has(a.grp)) continue;
          seen.add(a.grp);
          const cols = [0, 1, 2].filter(cc => queues[cc][0] && queues[cc][0].grp === a.grp);
          const size = queues.reduce((s, q) => s + q.filter(x => x.grp === a.grp).length, 0);
          if (cols.length === size && free >= size) legal.push(cols);
        }
      }
      const canEat = col => (by[col] || []).length > 0;
      const working = slots.some(s => canEat(s.color));
      let choice = null;
      if (legal.length) {
        if (policy === 'random') choice = legal[Math.floor(rng() * legal.length)];
        else {
          const good = legal.filter(cols => cols.every(c => canEat(queues[c][0].color)));
          if (good.length) choice = good[Math.floor(rng() * good.length)];
          else if (!working) { choice = legal[Math.floor(rng() * legal.length)]; forced++; }
        }
      }
      if (choice) {
        for (const c of choice) { const a = queues[c].shift(); slots.push({ color: a.color, left: a.total, h: [0, 1, 2, 3, 4].find(x => !slots.some(o => o.h === x)) }); }
        picks++;
        continue;
      }
      // ---- 일하기: 일터마다 한 칸씩 ----
      let progress = false;
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i], list = by[s.color];
        if (!list || !list.length) continue;
        // 실제 쇠똥구리처럼 집에서 길을 따라 가장 가까운 음식 (게임·스테이지 생성과 같은 pathCost)
        const info = by.__info, h = base.homes[s.h];
        let bi = 0, bd = 1e9;
        for (let j = 0; j < list.length; j++) for (const cand of info.acc.get(list[j])) {
          const d = pathCost(base.geo, info, h.x, h.y, list[j], cand);
          if (d < bd) { bd = d; bi = j; }
        }
        const k = list.splice(bi, 1)[0];
        grid[Math.floor(k / C)][k % C] = null; left--; s.left--; progress = true;
        eat(k);
        if (s.left <= 0) { slots.splice(i, 1); i--; }
      }
      if (progress) { by = reachByColor(grid, frozen); waits++; continue; }
      if (!legal.length) return { ok: false, picks, waits, forced, left };
      // 일할 게 없는데 고를 수 있으면 (random 정책은 위에서 이미 골랐음)
      choice = legal[Math.floor(rng() * legal.length)];
      for (const c of choice) { const a = queues[c].shift(); slots.push({ color: a.color, left: a.total, h: [0, 1, 2, 3, 4].find(x => !slots.some(o => o.h === x)) }); }
      picks++; forced++;
    }
    return { ok: false, picks, waits, forced, left, guard: true };
  }

  function evaluate(idx, opt = {}) {
    const nRandom = opt.random || 24, nGreedy = opt.greedy || 16, nSmart = opt.smart || 40;
    const base = makeState(idx);
    const rng = mulberry32(12345 + idx);
    let rf = 0, gf = 0, solvable = false;
    for (let i = 0; i < nRandom; i++) if (!simulate(base, 'random', rng).ok) rf++;
    for (let i = 0; i < nGreedy; i++) { const r = simulate(base, 'greedy', rng); if (r.ok) solvable = true; else gf++; }
    for (let i = 0; !solvable && i < nSmart; i++) if (simulate(base, 'greedy', rng).ok) solvable = true;
    const st = STAGES[idx];
    const tier = BALANCE.tiers[st.tier] || {};
    const q = tier.qa || {};
    const res = {
      stage: idx + 1, name: st.name, tier: st.tier, slots: base.slots, seed: st.seed || 0,
      beetles: base.beetles, chains: base.chains, cells: base.cells,
      keys: base.keys.length, ice: base.ice.length, gifts: base.gifts, gimmicks: gimmickSummary(idx).replace(' — 작전을 세워요!', ''),
      link: +st.link.toFixed(2), jitter: +st.jitter.toFixed(2), span: st.jitterSpan,
      randomFail: +(rf / nRandom).toFixed(2), greedyFail: +(gf / nGreedy).toFixed(2), solvable,
    };
    const inR = (v, r) => !r || (v >= r[0] - 1e-9 && v <= r[1] + 1e-9);
    res.pass = res.solvable === true && inR(res.randomFail, q.randomFail) && inR(res.greedyFail, q.greedyFail);
    // 목표 구간 가운데에서 얼마나 먼지 (작을수록 좋음)
    const dist = (v, r) => !r ? 0 : v < r[0] ? r[0] - v : v > r[1] ? v - r[1] : 0;
    res.miss = (solvable ? 0 : 10) + dist(res.randomFail, q.randomFail) + 2 * dist(res.greedyFail, q.greedyFail);
    return res;
  }

  function withStage(idx, patch, fn) {
    const st = STAGES[idx], keep = {};
    for (const k in patch) keep[k] = st[k];
    Object.assign(st, patch);
    try { return fn(); } finally { Object.assign(st, keep); }
  }

  // seed(와 필요하면 slots)를 바꿔 가며 목표 구간에 가장 가까운 설정 찾기
  function tune(idx, opt = {}) {
    const seeds = opt.seeds || 24;
    let best = null;
    for (let s = 0; s < seeds; s++) {
      const r = withStage(idx, { seed: s }, () => evaluate(idx, opt));
      if (!best || r.miss < best.miss) best = r;
      if (r.pass) break;
    }
    return best;
  }

  function report(opt = {}) {
    const rows = [];
    const from = opt.from || 0, to = Math.min(BASE_COUNT, opt.to || BASE_COUNT);
    for (let i = from; i < to; i++) rows.push(evaluate(i, opt));
    if (console.table) console.table(rows);
    return rows;
  }

  // 목표를 벗어난 스테이지를 찾아 seed 재탐색. 결과는 BALANCE.stages 에 넣을 덮어쓰기 표
  function tuneAll(opt = {}) {
    const out = {}, rows = [];
    const from = opt.from || 0, to = Math.min(BASE_COUNT, opt.to || BASE_COUNT);
    for (let i = from; i < to; i++) {
      let r = evaluate(i, opt);
      if (!r.pass) { const t = tune(i, opt); if (t.miss < r.miss) r = t; }
      rows.push(r);
      if (r.seed) out[i + 1] = { seed: r.seed };
    }
    return { overrides: out, rows, failing: rows.filter(r => !r.pass).map(r => r.stage) };
  }

  window.BalanceQA = { evaluate, simulate, makeState, tune, report, tuneAll, withStage };
})();
