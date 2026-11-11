// =====================================================================
//  데굴데굴 쇠똥구리 — 밸런스 테이블  (기획서: docs/GDD.md, 테이블 설명: docs/balance-tables.md)
//  index.html 이 이 파일을 먼저 읽어서 스테이지 난이도 · 부스터 · 보상을 정한다.
//  값을 바꾼 뒤에는 밸런스 QA(.claude/agents/balance-qa.md)로 검증한다.
// =====================================================================
window.BALANCE = {
  version: 2,

  // ---- 1. 기본 난이도 곡선 (스테이지 번호 i = 0부터) --------------------------
  //  값 = min(max, base + perStage * i)
  curve: {
    noLinkUntil: 3,                                   // 1~3 스테이지는 사슬 없음 (튜토리얼)
    link:   { base: 0.18, perStage: 0.008, max: 0.50 }, // 대기열 한 줄에 사슬이 생길 확률
    jitter: { base: 0.05, perStage: 0.008, max: 0.35 }, // 쇠똥구리 순서를 뒤섞는 확률 (높을수록 "지금 못 먹는 색"이 위로 옴)
    ants:   { base: 14,   perStage: 0.35,  max: 30   }, // 목표 쇠똥구리 수 (많을수록 한 마리 숫자가 작고 선택이 잦음)
  },

  // ---- 2. 난이도 등급 (허들) ------------------------------------------------
  //  slots      : 쓸 수 있는 일터 칸 수 (5칸 중 나머지는 잠김 → 🔓 열쇠 부스터로 열 수 있음)
  //  linkAdd    : 사슬 확률 가산
  //  jitterAdd  : 순서 뒤섞기 확률 가산
  //  jitterSpan : 뒤섞을 때 최대 몇 칸까지 멀리 바꾸는지 (1 = 이웃끼리만)
  //  antMul     : 목표 쇠똥구리 수 배율
  //  qa         : QA 목표 구간 (BalanceQA 시뮬레이터 기준)
  //     randomFail : 아무거나 누르는 플레이어의 실패율 [최소, 최대]
  //     greedyFail : "지금 먹을 수 있는 색"만 고르는 플레이어의 실패율 [최소, 최대]
  //     solvable   : 잘 생각하면 반드시 깰 수 있어야 함
  tiers: {
    easy:   { label: '쉬움',        color: '#9fe08a', slots: 5, linkAdd: -0.10, jitterAdd: -0.05, jitterSpan: 1, antMul: 0.9,
              qa: { randomFail: [0, 0.15], greedyFail: [0, 0.02], solvable: true } },
    normal: { label: '보통',        color: '#f3e3c3', slots: 5, linkAdd: 0,     jitterAdd: 0,     jitterSpan: 1, antMul: 1.0,
              qa: { randomFail: [0, 0.35], greedyFail: [0, 0.08], solvable: true } },
    hard:   { label: '어려움',      color: '#ff9a6a', slots: 5, linkAdd: 0.05,  jitterAdd: 0.06,  jitterSpan: 2, antMul: 1.1,
              qa: { randomFail: [0.35, 0.85], greedyFail: [0.05, 0.40], solvable: true } },
    boss:   { label: '매우 어려움', color: '#d36bff', slots: 5, linkAdd: 0.10,  jitterAdd: 0.12,  jitterSpan: 2, antMul: 1.2,
              qa: { randomFail: [0.6, 1.0], greedyFail: [0.25, 0.75], solvable: true } },
  },

  // ---- 3. 허들 배치 규칙 (스테이지 번호 n = 1부터) ------------------------------
  //  위에서부터 처음 맞는 규칙의 등급을 씀. stages 표에 tier 를 적으면 그게 우선.
  pattern: [
    { when: 'n <= 3',       tier: 'easy'   },   // 튜토리얼
    { when: 'n % 10 === 0', tier: 'boss'   },   // 10, 20, 30, 40, 50 : 보스 허들
    { when: 'n % 10 === 5', tier: 'hard'   },   // 5, 15, 25, 35, 45 : 중간 허들
    { when: 'n % 10 === 1', tier: 'easy'   },   // 보스 다음은 숨 돌리기
    { when: 'true',         tier: 'normal' },
  ],

  // ---- 3-1. 기믹 (허들의 "재미 요소") -----------------------------------------
  //  숫자만 올리는 대신, 플레이어가 "어디부터 먹을지" 작전을 세우게 만드는 장치들.
  //  처음 나오는 스테이지에서 소개 창이 뜬다 (스테이지 번호는 gimmickRules 에서 자동 계산).
  gimmicks: {
    key:     { icon: '🔑', name: '열쇠 음식', color: '#ffd84a',
               desc: ['그림 속 🔑 음식을 쇠똥구리가 가져오면', '자물쇠가 하나 열려요 (잠긴 일터 → 잠긴 줄 순서).'],
               tip: '열쇠 쪽으로 길을 내는 색부터 골라 보세요!' },
    ice:     { icon: '🧊', name: '얼음 음식', color: '#bfe6ff',
               desc: ['얼어 있는 음식은 가져갈 수 없고 길도 막아요.', '바로 옆 음식을 먹으면 얼음이 깨져요.'],
               tip: '얼음 옆 음식을 먼저 먹어서 녹여요!' },
    colLock: { icon: '⛓', name: '잠긴 줄', color: '#c8c8d8',
               desc: ['자물쇠가 걸린 대기열 줄은 고를 수 없어요.', '그림 속 🔑 음식을 먹으면 풀려요.'],
               tip: '열린 두 줄로 열쇠까지 길을 내요!' },
    chain:   { icon: '🔗', name: '사슬', color: '#d8dde6',
               desc: ['사슬로 묶인 두 쇠똥구리는 함께 일터로 가요.', '둘 다 맨 위에 있고 빈 칸이 2개 있어야 해요.'],
               tip: '짝을 꺼내고, 칸 2개를 비워 두세요!' },
    gift:    { icon: '🎁', name: '선물 음식', color: '#ff8fbf',
               desc: ['🎁 음식을 가져오면 부스터를 하나 받아요!', '(혼자 하기에서만)'],
               tip: '선물은 아껴 뒀다가 보스에서 써요!', rewards: ['undo', 'bomb', 'unchain', 'key'] },
  },
  //  스테이지별 기믹 양. 맞는 규칙을 위에서부터 모두 합침 (아래 규칙이 같은 키를 덮어씀)
  //   lockSlots : 잠긴 일터 칸 수 (🔑 하나에 한 칸씩 열림)
  //   lockCols  : 1이면 오른쪽 대기열 줄이 잠김 (일터 다음 순서로 🔑이 엶)
  //   keyAt     : 🔑을 숨길 위치 = 음식이 먹히는 순서의 몇 % 지점인지 (자물쇠마다)
  //   ice       : 얼음 음식 비율 (전체 음식 대비)
  //   giftAt    : 🎁을 숨길 위치 (먹히는 순서의 % 지점), 개수만큼
  gimmickRules: [
    { when: 'n > 12 && n % 3 === 0 && n % 10 !== 1', set: { ice: 0.04 } },           // 이후 보통에도 가끔
    { when: 'n === 15', set: { lockSlots: 1, ice: 0.08, keyAt: [0.3] } },            // ⚠ 얼음 + 열쇠
    { when: 'n === 17', set: { giftAt: [0.5] } },
    { when: 'n === 20', set: { lockSlots: 2, ice: 0.08, keyAt: [0.3, 0.55], giftAt: [0.5] } },           // 🔥
    { when: 'n === 22', set: { lockCols: 1, keyAt: [0.2] } },                        // ⛓ 첫 등장
    { when: 'n > 22 && n % 4 === 2', set: { lockCols: 1 } },
    { when: 'n === 25', set: { lockSlots: 1, lockCols: 1, keyAt: [0.2, 0.4] } },     // ⚠ 자물쇠 2개
    { when: 'n === 28', set: { giftAt: [0.5] } },
    { when: 'n === 30', set: { lockSlots: 1, lockCols: 1, ice: 0.06, keyAt: [0.2, 0.45], giftAt: [0.6] } },  // 🔥
    { when: 'n === 35', set: { lockCols: 1, ice: 0.1, keyAt: [0.3] } },              // ⚠
    { when: 'n === 38', set: { giftAt: [0.5] } },
    { when: 'n === 40', set: { lockSlots: 2, ice: 0.08, keyAt: [0.2, 0.4], giftAt: [0.5] } },              // 🔥
    { when: 'n === 45', set: { lockSlots: 1, lockCols: 1, ice: 0.08, keyAt: [0.25, 0.45] } },             // ⚠
    { when: 'n === 48', set: { giftAt: [0.5] } },
    { when: 'n === 50', set: { lockSlots: 2, lockCols: 1, ice: 0.1, keyAt: [0.15, 0.35, 0.5], giftAt: [0.3, 0.7] } },  // 🔥 전부
  ],

  // ---- 4. 스테이지별 덮어쓰기 표 (키 = 스테이지 번호, 1부터) -------------------
  //  tier / slots / link / jitter / jitterSpan / ants / seed / reward / gimmicks 를 직접 지정할 수 있음.
  //  seed: 쇠똥구리 순서를 만드는 난수 번호. QA가 목표 구간에 맞는 번호를 찾아 적는다.
  //  reward: 처음 클리어했을 때 받는 부스터 { 부스터키: 개수 }
  //  (balance-qa 2차 튜닝 2026-11-09, 기믹 반영 — 측정값은 docs/balance-tables.md "QA 측정 결과")
  stages: {
    // ===== 1장: 기본 (기믹 없음) — 이 게임의 핵심 결정 "누구를 언제 일터에 넣을까"를 배움 =====
    //  흐름: 1 조작 → 2 못 먹는 색은 두기(칸 4) → 3 같은 걸 칸 3으로 강화 → 4 숫자 보기(새 개념) → 5 숫자 보기 변주 → 6 시험
    //  qa.engine: 실제 엔진 자동 플레이 실패율 목표 (qa/functional-qa.js testLessons)
    //    random = 빈 칸이 생기면 아무거나 / greedy = 닿는 색이면 바로 / full = 숫자까지 보고 모자라면 기다림 (1장에서 배우는 것 전부)
    //    → "이 판에서 배울 것을 모르면 막히고(앞 전략), 알면 풀린다(뒤 전략)"를 확인. 시험(6)도 배운 것만으로 풀려야 함
    //  gen: 레슨용 생성 손잡이 — pull: 못 먹는 색을 앞으로 / trap: 숫자가 닿는 음식보다 큰 쇠똥구리를 앞으로 / safeTop: 시작 맨 위 3마리는 그대로
    1:  { seed: 0, link: 0,
          lesson: '조작 익히기: 맨 위 쇠똥구리를 누르면 일터로 가서 같은 색 음식을 가져와요',
          qa: { engine: { randomFail: [0, 0.15], greedyFail: [0, 0], fullFail: [0, 0] } } },
    2:  { seed: 1, tier: 'easy', slots: 4, link: 0, jitter: 0, jitterSpan: 1, gen: { pull: 0.7, pullSpan: 6, safeTop: true },
          lesson: '지금 못 먹는 색은 넣지 않기 (칸만 차지함)',
          title: '💡 칸이 4개!', intro: '그림 바깥에서 닿는 색인지 보고 골라요',
          hint: '바깥과 이어진 음식만 먹을 수 있어요. 못 먹는 쇠똥구리는 대기열에 두고 기다려요.',
          qa: { engine: { randomFail: [0.3, 0.8], greedyFail: [0, 0], fullFail: [0, 0] } } },
    3:  { seed: 1, tier: 'normal', slots: 3, link: 0, jitter: 0, jitterSpan: 1, gen: { pull: 0.8, pullSpan: 7, safeTop: true },
          lesson: '칸이 적을수록 실수 한 번이 치명적 — 2번 레슨 강화',
          title: '💡 칸이 3개!', intro: '칸이 적어요. 바로 일할 쇠똥구리만 넣어요',
          hint: '💤 쇠똥구리가 칸을 막으면 금방 꽉 차요. 서두르지 말고 길이 열릴 때까지 기다려도 돼요.',
          qa: { engine: { randomFail: [0.6, 1], greedyFail: [0, 0.1], fullFail: [0, 0] } } },
    4:  { seed: 7, tier: 'normal', slots: 3, link: 0, jitter: 0.1, jitterSpan: 1, ants: 16, gen: { busy: 3, big: 3, trap: 0.8, trapSpan: 2 },
          lesson: '숫자를 보기: 닿는 음식보다 숫자가 크면 일을 못 끝내고 칸을 막음 → 길을 여는 쇠똥구리 먼저',
          title: '💡 숫자를 봐요', intro: '쇠똥구리 숫자와 지금 먹을 수 있는 음식 수를 비교해요',
          hint: '숫자가 큰 쇠똥구리는 바깥 음식만으론 모자라서 💤 칸을 막아요. 길을 열어 줄 쇠똥구리를 먼저!',
          qa: { engine: { randomFail: [0.6, 1], greedyFail: [0.6, 1], fullFail: [0, 0.1] } } },
    5:  { seed: 11, tier: 'normal', slots: 4, link: 0, jitter: 0.1, jitterSpan: 1, ants: 20, gen: { busy: 4, big: 3, trap: 1, trapSpan: 3 },
          lesson: '4번 변주: 칸은 4개지만 숫자 함정이 여러 개 (스스로 적용 — 시작 안내 없음)',
          hint: '함정이 여러 개! 숫자가 큰 쇠똥구리는 길이 열린 뒤에 넣어요.',
          qa: { engine: { randomFail: [0.5, 1], greedyFail: [0.25, 0.8], fullFail: [0, 0.1] } } },
    6:  { seed: 4, tier: 'hard', slots: 3, link: 0, jitter: 0.15, jitterSpan: 1, ants: 18, gen: { busy: 3, big: 4, trap: 0.8, trapSpan: 3 },
          lesson: '1장 시험: 못 먹는 색은 두기 + 숫자 보기 + 기다리기를 한 판에',
          title: '⚠ 1장 시험', intro: '지금까지 배운 걸 모두 써요!', reward: { undo: 1 },
          hint: '누가 길을 열어 주는지 먼저 찾고, 숫자가 큰 쇠똥구리는 길이 열린 뒤에 넣어요.',
          qa: { engine: { randomFail: [0.8, 1], greedyFail: [0.5, 1], fullFail: [0, 0.15] } } },
    // ===== 2장: 사슬 (7~12) — "지금 참아야 다음에 넣을 수 있다" =====
    //  흐름: 7 사슬 소개 → 8 짝을 가린 줄 먼저 꺼내기 → 9 빈 칸 2개 비워 두기 → 10 사슬 + 숫자 함정 → 11 8번 변주(칸 4) → 12 시험
    //  qa.engine 전략: chain = 2장 전부 (full + ①칸 2개 비워 두기 + ②짝을 가린 줄 먼저)
    //                  chainWait = ①만, chainFree = ②만 → 8번은 ②가, 9번은 ①이 꼭 필요함을 확인
    //  gen.skew: 엇갈린 사슬(이웃 줄의 다른 높이 두 마리) 개수, skewMax: 최대 높이 차
    7:  { seed: 1, tier: 'normal', slots: 5, link: 0.5, jitter: 0.05, jitterSpan: 1,
          lesson: '사슬 소개: 묶인 둘은 함께, 빈 칸 2개 필요 (막히지 않는 판)',
          hint: '사슬로 묶인 둘은 함께 일터로 가요. 둘 다 맨 위에 있고 빈 칸이 2개 있어야 해요.',
          qa: { engine: { randomFail: [0, 0.2], greedyFail: [0, 0], fullFail: [0, 0], chainFail: [0, 0] } } },
    8:  { seed: 5, tier: 'normal', slots: 3, link: 0, jitter: 0.05, jitterSpan: 1, gen: { skew: 3, skewMax: 2 },
          lesson: '엇갈린 사슬: 한쪽만 맨 위면 그 줄이 막힘 → 짝을 가린 줄을 먼저 꺼내기',
          title: '💡 엇갈린 사슬', intro: '사슬 짝이 서로 다른 높이에 있어요',
          hint: '사슬 한쪽만 맨 위면 그 줄은 막혀요. 짝을 가린 쪽 줄을 먼저 꺼내요.',
          qa: { engine: { fullFail: [0.6, 1], chainWaitFail: [0.6, 1], chainFreeFail: [0, 0.1], chainFail: [0, 0.1] } } },
    9:  { seed: 5, tier: 'normal', slots: 3, link: 0, jitter: 0.05, jitterSpan: 1, gen: { skew: 3, skewMax: 2 },
          lesson: '빈 칸 2개 비워 두기: 칸을 하나씩 다 채우면 사슬이 영영 못 들어감',
          title: '💡 빈 칸 2개', intro: '사슬은 빈 칸이 2개 있어야 들어가요',
          hint: '칸을 하나씩 다 채우면 사슬이 못 들어가요. 사슬이 맨 위에 오면 칸 2개가 빌 때까지 기다려요.',
          qa: { engine: { fullFail: [0.6, 1], chainFreeFail: [0.6, 1], chainWaitFail: [0, 0.1], chainFail: [0, 0.1] } } },
    10: { seed: 4, tier: 'normal', slots: 3, link: 0, jitter: 0.05, jitterSpan: 1, ants: 18,
          gen: { skew: 3, skewMax: 2, busy: 3, big: 3, trap: 0.6, trapSpan: 2 },
          lesson: '조합: 1장 숫자 함정 + 엇갈린 사슬 (안내 없이 스스로)',
          hint: '숫자가 큰 쇠똥구리는 길이 열린 뒤에! 사슬 짝을 가린 줄도 먼저 꺼내요.',
          qa: { engine: { fullFail: [0.6, 1], chainWaitFail: [0.6, 1], chainFail: [0, 0.1] } } },
    11: { seed: 6, tier: 'normal', slots: 4, link: 0.2, jitter: 0.05, jitterSpan: 1, gen: { skew: 5, skewMax: 3 },
          lesson: '8번 변주: 칸이 4개로 여유 있어도, 사슬이 여러 개면 짝을 먼저 꺼내야 함 (안내 없이)',
          hint: '여유가 있어 보여도 사슬 한쪽만 올라오면 줄이 막혀요. 짝을 가린 줄을 먼저 꺼내요.',
          qa: { engine: { randomFail: [0.5, 1], fullFail: [0.6, 1], chainWaitFail: [0.6, 1], chainFreeFail: [0, 0.1], chainFail: [0, 0.1] } } },
    12: { seed: 4, tier: 'hard', slots: 3, link: 0, jitter: 0.05, jitterSpan: 1, ants: 18,
          gen: { skew: 4, skewMax: 2, busy: 3, big: 3, trap: 0.8, trapSpan: 2 },
          lesson: '2장 시험: 숫자 보기 + 짝 꺼내기 + 칸 2개 비우기 — 하나라도 빠지면 막힘',
          title: '⚠ 2장 시험', intro: '1장과 2장에서 배운 걸 모두 써요!', reward: { unchain: 1 },
          hint: '숫자 확인 → 사슬 짝 꺼내기 → 칸 2개 비우기. 하나라도 빠지면 막혀요.',
          qa: { engine: { fullFail: [0.6, 1], chainWaitFail: [0.6, 1], chainFreeFail: [0.6, 1], chainFail: [0, 0.1] } } },
    14: { seed: 5 },  15: { seed: 27 },                 // ⚠ 🔑 🧊
    18: { seed: 2 },
    20: { seed: 12 },                                   // 🔥 🔑×2 🧊 🎁
    21: { seed: 1 },
    22: { seed: 12, jitter: 0.12, link: 0.25 },         // ⛓ 첫 등장: 순서 뒤섞기·사슬 완화
    23: { seed: 8 },  24: { seed: 1 },
    25: { seed: 6 },                                    // ⚠ 🔑×2 ⛓
    27: { seed: 1 },  28: { seed: 14 }, 29: { seed: 1 },
    30: { seed: 2 },                                    // 🔥 🔑×2 ⛓ 🧊 🎁
    31: { seed: 3 },  33: { seed: 1 },
    35: { seed: 12 },                                   // ⚠ ⛓ 🧊
    36: { seed: 34 }, 38: { seed: 1 },  39: { seed: 1 },
    40: { seed: 1 },                                    // 🔥 🔑×2 🧊 🎁
    41: { seed: 4 },  42: { seed: 13 }, 43: { seed: 1 }, 44: { seed: 1 },
    45: { seed: 4 },                                    // ⚠ 🔑×2 ⛓ 🧊
    46: { seed: 1 },
    50: { seed: 22 },                                   // 🔥 전부
    51: { seed: 2 },  52: { seed: 2 },
  },


  // ---- 5. 부스터 (보관형 아이템: 모아 뒀다가 막힐 때 꺼내 씀) --------------------
  boosters: {
    undo:    { icon: '↩', name: '돌려보내기', color: '#9fe08a', rescue: true,
               desc: ['일터의 쇠똥구리 하나를 대기열 맨 아래로 돌려보내요.', '못 움직이는 쇠똥구리부터 골라요.'] },
    key:     { icon: '🔓', name: '일터 열쇠', color: '#ffd84a', rescue: true,
               desc: ['잠긴 일터 칸을 이번 판 동안 열어 줘요.', '(어려운 스테이지에서만 쓸 수 있어요)'] },
    unchain: { icon: '✂', name: '사슬 끊기', color: '#bfe6ff', rescue: false,
               desc: ['대기열의 사슬이 전부 풀려요.', '묶여 있던 쇠똥구리도 하나씩 고를 수 있어요.'] },
    bomb:    { icon: '💣', name: '폭탄',     color: '#ffb070', rescue: false,
               desc: ['그림을 눌러 그 자리 주변 3×3 음식을 펑!', '막힌 길을 뚫을 때 좋아요.'] },
  },
  boosterOrder: ['undo', 'key', 'unchain', 'bomb'],
  startInventory: { undo: 1 },   // 처음 시작할 때 주는 부스터
  maxPerBooster: 9,

  // ---- 6. 클리어 보상 규칙 -----------------------------------------------------
  //  "보스 바로 앞 스테이지"를 처음 깨면 1개, 10스테이지마다(보스 클리어) 1개.  → 10스테이지에 약 2개
  rewards: {
    beforeBoss: { undo: 1 },                               // 보스 직전 스테이지 클리어 선물
    bossCycle: [{ key: 1 }, { bomb: 1 }, { unchain: 1 }],   // 보스를 깰 때마다 차례대로
  },

  // ---- 7. 숨은 아이템 (음식 속에 숨어 즉시 발동) — 경쟁 모드 전용 재미 요소 --------
  hiddenItems: {
    solo:   { count: 0 },
    coop:   { count: 0 },
    versus: { count: 4, perStage: 1 / 10, max: 8, types: ['speed', 'unchain', 'bomb', 'slow', 'slow'] },
  },
};
