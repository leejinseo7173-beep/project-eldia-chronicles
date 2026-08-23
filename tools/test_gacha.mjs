// ============================================================
// test_gacha.mjs — 뽑기 로직 수치 테스트 (M5-2)
//   node tools/test_gacha.mjs
// ============================================================

import { BALANCE } from '../src/balance.js';
import * as G from '../src/core/gacha.js';

let pass = 0, fail = 0;
const ok = (name, cond, note = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${cond ? '' : note}`);
  cond ? pass++ : fail++;
};

const mk = (seed = 'gacha-test') => {
  const s = { seed, resources: { badge: 0, crystal: 0 }, base: { buildings: { altar: { lv: 1 } } } };
  G.ensureGacha(s);
  return s;
};

// ① 풀 구성 — ★3 4명 / ★2 6명 / ★1 5명 (characters.js 등급 그대로)
{
  const p = G.pools();
  ok('풀: ★3 4명 · ★2 6명 · ★1 5명', p[3].length === 4 && p[2].length === 6 && p[1].length === 5,
    `got ${p[3].length}/${p[2].length}/${p[1].length}`);
}

// ② 증표 부족 → null, 차감 없음
{
  const s = mk();
  s.resources.badge = 5;
  ok('증표 5로 10연 거부', G.draw(s, 10) === null && s.resources.badge === 5);
  ok('  단챠는 가능', G.draw(s, 1) !== null && s.resources.badge === 4);
}

// ③ 결정성 — 같은 시드 = 같은 결과, 분할 = 일괄
{
  const run = (splits) => {
    const s = mk('det');
    s.resources.badge = 30;
    const out = [];
    for (const n of splits) out.push(...G.draw(s, n).map((r) => r.id + r.grade));
    return out.join(',');
  };
  ok('10연 = 1×10 분할', run([10]) === run([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]));
  ok('재실행 동일', run([10]) === run([10]));
}

// ④ 천장 — ★3 없이 30회째는 확정, 획득 시 리셋
{
  // ★3이 안 나오는 시드를 찾을 필요 없이: pity를 29로 세팅하고 1회 뽑기
  const s = mk('pity');
  s.resources.badge = 100;
  s.gacha.pity = 29;
  const [r] = G.draw(s, 1);
  ok('천장 30회째 ★3 확정', r.grade === 3);
  ok('  획득 후 카운터 리셋', s.gacha.pity === 0);
  // 어떤 시드로 100회를 돌려도 pity가 30을 넘는 순간이 없어야 한다
  const s2 = mk('pity-sweep');
  s2.resources.badge = 200;
  let over = false;
  for (let i = 0; i < 100; i++) { G.draw(s2, 1); if (s2.gacha.pity >= BALANCE.gacha.pityAt) over = true; }
  ok('100회 중 천장 초과 없음', !over);
}

// ⑤ 확률 통계 — 20000회에서 ★3 = 8% ± 1%p (천장 보정 포함이라 약간 높게 나온다)
{
  const s = mk('stat');
  s.resources.badge = 20000;
  let g3 = 0, g2 = 0;
  for (let i = 0; i < 2000; i++) {
    for (const r of G.draw(s, 10)) {
      if (r.grade === 3) g3++;
      else if (r.grade === 2) g2++;
    }
  }
  const p3 = g3 / 20000, p2 = g2 / 20000;
  ok(`★3 비율 ${(p3 * 100).toFixed(2)}% (8~10% 기대)`, p3 > 0.075 && p3 < 0.105);
  ok(`★2 비율 ${(p2 * 100).toFixed(2)}% (29~31% 기대)`, p2 > 0.28 && p2 < 0.32);
}

// ⑥ 중복 → 그 캐릭터의 조각 +1, 신규는 로스터 등록 (기획서 §9 개정 2026-08-15)
{
  const s = mk('dupe');
  s.resources.badge = 100;
  let shards = 0, news = 0;
  for (let i = 0; i < 50; i++) {
    for (const r of G.draw(s, 1)) {
      if (r.isNew) news++;
      shards += r.shard ?? 0;
    }
  }
  ok('신규 등록 수 = 로스터 크기', Object.keys(s.roster).length === news);
  const total = Object.values(s.roster).reduce((a, e) => a + (e.shards ?? 0), 0);
  ok('조각 합계 = 로스터 조각 합', total === shards && shards > 0);
}

// ⑥b 중복 보상 규칙 — 조각이 남은 돌파 횟수를 채웠으면 골드 변환
{
  const s = mk('ovf');
  s.roster.c01 = { lb: 5, shards: 0 };
  const r1 = G.dupeReward(s, 'c01', 3);
  ok('완돌 중복 → ★3 골드 1000', r1.gold === BALANCE.gacha.dupeGoldByGrade[3] && (s.resources.gold ?? 0) === r1.gold);
  s.roster.c05 = { lb: 3, shards: 2 };
  const r2 = G.dupeReward(s, 'c05', 2);
  ok('조각이 남은 횟수만큼 있으면 골드', r2.gold === BALANCE.gacha.dupeGoldByGrade[2] && s.roster.c05.shards === 2);
  s.roster.c11 = { lb: 4, shards: 0 };
  const r3 = G.dupeReward(s, 'c11', 1);
  ok('남은 돌파 있으면 조각 +1', r3.shard === 1 && s.roster.c11.shards === 1);
}

// ⑦ 제단 Lv3 확률 상향 반영
{
  const s = mk('lv3');
  s.base.buildings.altar.lv = 3;
  ok('Lv3 확률표 적용', G.ratesOf(s)[3] === BALANCE.gacha.ratesAltarLv3[3]);
  const s1 = mk('lv1');
  ok('Lv1 기본 확률표', G.ratesOf(s1)[3] === BALANCE.gacha.rates[3]);
  ok('10연은 Lv2부터', !G.canTenPull(s1) && G.canTenPull(s));
}

console.log(`\n${fail === 0 ? 'OK' : '실패'} — PASS ${pass} / FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
