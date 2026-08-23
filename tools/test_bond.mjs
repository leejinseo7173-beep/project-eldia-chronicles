// ============================================================
// test_bond.mjs — 교감(호감도) 검증 (M5-7)
// 실행: node tools/test_bond.mjs
// ============================================================

import { BALANCE } from '../src/balance.js';
import * as BD from '../src/core/bond.js';
import * as SH from '../src/core/shop.js';
import { computeAllyStats } from '../src/battle/logic.js';
import { CHARACTERS } from '../src/data/characters.js';
import { GIFT_PREF, TALKS, talkTier } from '../src/data/bonds.js';

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); }
}
function ok(name, cond) { eq(name, !!cond, true); }

const DAY = 24 * 3600000;
function freshState() {
  return {
    seed: 'bond-test', progress: 'ch2', roster: { c01: { lb: 0 }, c05: { lb: 0 } },
    resources: { gold: 10000 },
    base: { buildings: { camp: { lv: 1 } } },
  };
}

console.log('— 상태 보장');
{
  const st = freshState();
  BD.ensureBond(st);
  eq('bond 엔트리 생성', st.roster.c01.bond, { lv: 1, pts: 0, talkedAt: 0, giftAt: 0 });
  ok('선물 인벤 생성', typeof st.inventory.gifts === 'object');
}

console.log('— 대화 (1일 1회)');
{
  const st = freshState();
  const t0 = 1000 * DAY;
  const r = BD.talk(st, 'c01', t0);
  eq('대화 성공 +6', [r.ok, r.pts], [true, BALANCE.bond.talkPts]);
  eq('쿨타임 거부', BD.talk(st, 'c01', t0 + DAY - 1).err, 'cooldown');
  eq('하루 뒤 가능', BD.talk(st, 'c01', t0 + DAY).ok, true);
}

console.log('— 선물 (취향 적중 대폭)');
{
  const st = freshState();
  BD.ensureBond(st);
  st.inventory.gifts = { liquor: 2, flower: 1 };
  const t0 = 1000 * DAY;
  eq('브란 취향 = 술 (기획서 표)', GIFT_PREF.c01, 'liquor');
  const r = BD.giveGift(st, 'c01', 'liquor', t0);
  eq('적중 +20', [r.ok, r.match, r.pts], [true, true, BALANCE.bond.giftPts.match]);
  eq('재고 차감', st.inventory.gifts.liquor, 1);
  eq('하루 1회 거부', BD.giveGift(st, 'c01', 'flower', t0 + 1).err, 'cooldown');
  const r2 = BD.giveGift(st, 'c05', 'flower', t0);
  eq('미적중 +8 (에라 취향은 보석)', [r2.match, r2.pts], [false, BALANCE.bond.giftPts.normal]);
  st.inventory.gifts = {};
  eq('재고 없음', BD.giveGift(st, 'c01', 'gem', t0 + DAY).err, 'stock');
}

console.log('— 레벨업·전투 승리');
{
  const st = freshState();
  BD.ensureBond(st);
  const b = st.roster.c01.bond;
  // Lv1→2 필요 20: 대화 6×4 = 24 → Lv2 (잔여 4)
  let t = 1000 * DAY;
  for (let i = 0; i < 4; i++) { BD.talk(st, 'c01', t); t += DAY; }
  eq('대화 4회로 Lv2 (24pts)', [b.lv, b.pts], [2, 24 - BALANCE.bond.need[0]]);
  const ups = BD.battleBond(st, ['hero', 'c01', 'c05']);
  eq('전투 승리 +2 (주인공 제외)', [st.roster.c01.bond.pts, st.roster.c05.bond.pts], [6, 2]);
  eq('레벨업 없으면 보고 없음', ups.length, 0);
  // 만렙 정지
  b.lv = 5; b.pts = 0;
  BD.talk(st, 'c01', t);
  eq('만렙에서 포인트 무시', [b.lv, b.pts], [5, 0]);
}

console.log('— 스탯 보너스 (Lv2 +3% / Lv4 +7%)');
{
  const st = freshState();
  BD.ensureBond(st);
  eq('Lv1 보너스 0', BD.bondBonus(st, 'c01'), 0);
  st.roster.c01.bond.lv = 2;
  eq('Lv2 +3%', BD.bondBonus(st, 'c01'), 0.03);
  st.roster.c01.bond.lv = 3;
  eq('Lv3 유지 +3%', BD.bondBonus(st, 'c01'), 0.03);
  st.roster.c01.bond.lv = 4;
  eq('Lv4 +7%', BD.bondBonus(st, 'c01'), 0.07);
  const bare = computeAllyStats(CHARACTERS.c01, 10);
  const bonded = computeAllyStats(CHARACTERS.c01, 10, { bond: 0.07 });
  ok('스탯에 실반영', bonded.atk > bare.atk && bonded.maxHp > bare.maxHp);
  eq('bond 0 = 기존 동일 (하위 호환)', computeAllyStats(CHARACTERS.c01, 10, {}), bare);
}

console.log('— 상점 선물');
{
  const st = freshState();
  const r = SH.buyGift(st, 'flower');
  eq('구매·스택', [r.ok, st.inventory.gifts.flower], [true, 1]);
  eq('골드 차감', st.resources.gold, 10000 - BALANCE.bond.giftGold);
  st.resources.gold = 0;
  eq('골드 부족', SH.buyGift(st, 'gem').err, 'gold');
}

console.log('— 대사 틀 (15명 × 3구간)');
{
  const ids = Object.keys(CHARACTERS).filter((id) => id !== 'hero');
  ok('전 동료 대사 존재', ids.every((id) => Array.isArray(TALKS[id]) && TALKS[id].length === 3));
  eq('구간 매핑 (Lv1·3·5)', [talkTier(1), talkTier(3), talkTier(5)], [0, 1, 2]);
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
