// ============================================================
// test_production.mjs — 거점 정산 수치 테스트 (M5-1 커밋 ① 검증)
//   node tools/test_production.mjs
// 계획서에 적은 기대값 그대로 확인한다. 렌더 무관 모듈이라 브라우저가 필요 없다.
// ============================================================

import { BALANCE } from '../src/balance.js';
import * as P from '../src/core/production.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${ok ? '' : `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
};

const MIN = 60000;
const mkState = () => {
  const s = { seed: 'test-seed', field: {} };
  P.ensureBase(s, 0);
  s.resources = { wood: 0, stone: 0, iron: 0, food: 0, mana: 0, awaken: 0, gold: 0 };
  s.base.pop = 0;                      // 기본: 소비 없는 진공 상태에서 생산만 검증
  return s;
};

// ① 벌목 Lv1 + 일꾼 2, 10분 → 6 × 1.5 × 10 = 90목재
{
  const s = mkState();
  s.base.buildings.lumber = { lv: 1, workers: 2 };
  const r = P.settle(s, 10 * MIN);
  eq('벌목 Lv1·일꾼2·10분 = 목재 90', s.resources.wood, 90);
  eq('  정산 분수', r.mins, 10);
}

// ② 9시간 방치 → 480분 상한
{
  const s = mkState();
  s.base.buildings.lumber = { lv: 1, workers: 0 };
  const r = P.settle(s, 9 * 60 * MIN);
  eq('9h 방치 = 480분 상한', r.mins, 480);
  eq('  목재는 창고 상한까지', s.resources.wood, 500);   // 6×480=2880 → 성벽 Lv1 상한 500
  eq('  넘친 목재 기록', r.spilled.wood, 2380);
}

// ③ 식량 0 + 인구 10 → 효율 절반 (벌목 6→3/분) — 2장(식량 경제 가동) 기준
{
  const s = mkState();
  s.progress = 'ch2';
  s.base.pop = 10;
  s.base.buildings.lumber = { lv: 1, workers: 0 };
  const r = P.settle(s, 10 * MIN);
  eq('굶주림: 목재 3×10', s.resources.wood, 30);
  eq('  굶은 분수 10', r.starvedMin, 10);
}

// ④ 농장이 소비를 이기는 경우: 인구 8(소비 4/분) + 농장 Lv1(5/분) → +1/분
{
  const s = mkState();
  s.progress = 'ch2';
  s.base.pop = 8;
  s.base.buildings.farm = { lv: 1, workers: 0 };
  s.resources.food = 100;
  P.settle(s, 10 * MIN);
  eq('식량 수지 +1/분 × 10분', s.resources.food, 110);
}

// ④-2 농장 해금 전(1장) = 왕실 배급 — 소비·굶주림 없음
{
  const s = mkState();
  s.progress = 'ch1a';
  s.base.pop = 10;
  s.base.buildings.lumber = { lv: 1, workers: 0 };
  const r = P.settle(s, 10 * MIN);
  eq('배급 중: 소비 없음 (식량 0 유지)', s.resources.food, 0);
  eq('  굶주림 없음 → 목재 6×10', s.resources.wood, 60);
  eq('  굶은 분수 0', r.starvedMin, 0);
}

// ⑤ 시계 역행 → 지급 0
{
  const s = mkState();
  s.base.buildings.lumber = { lv: 1, workers: 0 };
  s.base.lastTick = 100 * MIN;
  const r = P.settle(s, 50 * MIN);
  eq('시계 역행 = 0분', r.mins, 0);
  eq('  자원 불변', s.resources.wood, 0);
}

// ⑥ 마력샘 결정성 — 같은 시드·같은 시간이면 각성석 결과 동일
{
  const run = () => {
    const s = mkState();
    s.base.buildings.spring = { lv: 3, workers: 0 };
    P.settle(s, 480 * MIN);
    return [s.resources.mana, s.resources.awaken];
  };
  const [a, b] = [run(), run()];
  eq('마력샘 8h 결정성', a, b);
  eq('  마정석 4/h × 8h', a[0], 32);
}

// ⑥-2 분할 정산 = 일괄 정산 (재현성: springTicks 카운터)
{
  const s1 = mkState();
  s1.base.buildings.spring = { lv: 3, workers: 0 };
  P.settle(s1, 240 * MIN); P.settle(s1, 480 * MIN);
  const s2 = mkState();
  s2.base.buildings.spring = { lv: 3, workers: 0 };
  P.settle(s2, 480 * MIN);
  eq('분할 정산 = 일괄 정산 (각성석 포함)', [s1.resources.mana, s1.resources.awaken], [s2.resources.mana, s2.resources.awaken]);
}

// ⑦ 세금 — 인구 8 × 10 = 80골드, 24h 쿨
{
  const s = mkState();
  s.base.pop = 8;
  s.base.taxAt = 0;
  eq('세금 수령 80G', P.collectTax(s, 25 * 3600000), 80);
  eq('  쿨타임 중 재수령 불가', P.collectTax(s, 26 * 3600000), 0);
}

// ⑧ 건설 — 비용 차감·레벨 상승·자원 부족 거부
{
  const s = mkState();
  s.progress = 'ch1a';
  s.resources.wood = 100; s.resources.stone = 50;
  eq('벌목장 건설 → Lv1', P.build(s, 'lumber'), 1);
  eq('  비용 차감 (목 100-20)', s.resources.wood, 80);
  eq('  부족하면 거부', P.build(s, 'lumber'), 0);   // Lv2 비용 목100·금60 — 골드 0이라 거부
  eq('미해금(광산 ch1b) 거부', P.build(s, 'mine'), 0);
}

// ⑧-2 새 게임 시작 물자 — 첫 건물이 바로 지어져야 한다
{
  const s = { seed: 't', field: {} };
  P.ensureBase(s, 0);
  s.progress = 'ch1a';
  eq('시작 물자 (목80·석40·식60·금100)', [s.resources.wood, s.resources.stone, s.resources.food, s.resources.gold], [80, 40, 60, 100]);
  eq('시작 물자로 벌목장 즉시 건설', P.build(s, 'lumber'), 1);
  eq('  이어서 주택도', P.build(s, 'house'), 1);
}

// ⑨ 일꾼 — 슬롯·유휴 한도
{
  const s = mkState();
  s.base.pop = 3;
  s.base.buildings.lumber = { lv: 1, workers: 0 };   // 슬롯 2
  eq('배치 1', P.assignWorker(s, 'lumber', 1), true);
  eq('배치 2', P.assignWorker(s, 'lumber', 1), true);
  eq('슬롯 초과 거부', P.assignWorker(s, 'lumber', 1), false);
  s.base.buildings.mine = { lv: 1, workers: 0 };
  eq('유휴 1명 남음 → 배치', P.assignWorker(s, 'mine', 1), true);
  eq('유휴 0 → 거부', P.assignWorker(s, 'mine', 1), false);
}

console.log(`\n${fail === 0 ? 'OK' : '실패'} — PASS ${pass} / FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
