# 작업 진행 상황 (다음 세션 이어하기용)

## 1차 (2026-11-09) — 완료
테두리 수정, 보관형 부스터, 허들 등급, 기획서(docs/GDD.md), 밸런스 테이블(balance/balance.js), 밸런스 QA·기능 QA 에이전트.

## 2차 (2026-11-09) — 허들을 "재미 요소(기믹)"로 바꾸기
피드백: "그냥 어렵게만 만들면 안 된다. 잠금이 있으면 그림 속 열쇠를 먹어서 여는 식의 재미가 있어야."

- [x] 기믹 4종 설계 · 테이블: balance.js `gimmicks`, `gimmickRules` (🔑 열쇠 음식, 🧊 얼음, ⛓ 잠긴 줄, 🎁 선물)
- [x] 스테이지 생성 buildStage(): 2단계 시뮬로 열쇠/선물 위치를 정하고 항상 풀 수 있게 순서 생성, 잠긴 줄 분배, 얼음 배치(막히면 줄여서 재시도)
- [x] 게임: onCellGone()(얼음 깨기·열쇠·선물), openLock(), 잠긴 줄 tryPick/canPickAny, drawGimmicks(), 잠긴 줄 그리기, 새 기믹 소개 창(drawIntro), 시작 배너에 기믹 요약, 협동 동기화
- [x] 버그 수정: 좁은 길에서 쇠똥구리끼리 서로 기다리다 영원히 멈추는 교착 → 0.8초 넘게 막히면 잠깐 양보 없이 지나감 (updateGame)
- [x] 밸런스 QA 시뮬: 기믹 규칙 + 실제 pathCost로 음식 고르기
- [x] 기능 QA: 기믹 점검, 교착(멈춤) 감지, 52스테이지 실제 엔진 자동 플레이
- [x] 52스테이지 seed 재튜닝 → balance.js stages 반영 (51/52 목표 안, 10번 첫 보스만 살짝 쉬움, 전부 풀 수 있음)
- [x] docs/balance-tables.md 측정 결과·기믹 테이블 설명 갱신, GDD 5.0절
- [x] 화면 확인 (소개 창, 열쇠/얼음/선물 아이콘 크게, 잠긴 줄) · 기능 QA 869/869

## 3차 (2026-11-11) — 장 단위 레벨 디자인 (1장 적용)
피드백: "기믹을 넣으라고 해서 넣고 5스테이지마다 어려움/보스를 넣었을 뿐, 퍼즐을 해결하는 재미가 없다. 새 기믹을 소개하고, 그 기믹을 써야만 풀리는 판으로 자연스럽게 배우게 해야."

- [x] 원인 분석: 생성기가 greedy로 풀리게 순서를 만듦 → 보통 판 실패율 0%. 기믹은 %지점 무작위라 써야만 풀리는 판 없음
- [x] 설계: 장마다 하나 배우기 (GDD 5.A~5.E). 7장 계획
- [x] QA: 솔버(BalanceQA.solve), full 전략(숫자까지 보는 플레이어), 실제 엔진 레슨 검증(FunctionalQA.lessonStat / testLessons, qa.engine)
- [x] 생성기 레슨 손잡이: gen.pull / trap / safeTop / busy / big
- [x] 화면: 💤 막힌 일터 표시, 줄인 칸은 흙 칸, 시작 배너(title/intro), 실패 화면 💡 hint
- [x] 1장(1~6) 판 확정 — 실제 엔진에서 레슨 성립 확인
- [ ] 사람이 직접 1장 플레이해서 체감 확인
- [x] 2장(사슬, 7~12): 엇갈린 사슬(gen.skew), 사슬 소개 창, chain/chainWait/chainFree 전략, 장 시험 보상(6·12), 10번 보스 해제
- [ ] 3장(열쇠, 13~20) 설계·적용. 지금은 임시로 🔑·🧊 첫 등장 15번, 🎁 17번

## 다음 후보
- 사람이 직접 플레이해서 🔑 위치·얼음 양 체감 확인
- 10번 보스 keyAt 더 깊게 할지

## 실행
- 서버: .claude/launch.json "game" (python -m http.server 8765). 스크립트가 캐시되면 fetch(url,{cache:'reload'}) 후 새로고침
- 콘솔: BalanceQA.report(), BalanceQA.tune(i), await FunctionalQA.run({ play: [...Array(BASE_COUNT).keys()] })
