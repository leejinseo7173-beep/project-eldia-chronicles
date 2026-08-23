// ============================================================
// test_shop.mjs — 상점 순수 모듈 검증 (M5-5)
// 실행: node tools/test_shop.mjs
// ============================================================

import { BALANCE } from '../src/balance.js';
import * as SH from '../src/core/shop.js';
import * as EQ from '../src/core/equip.js';

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); }
}
function ok(name, cond) { eq(name, !!cond, true); }

function freshState() {
  return {
    seed: 'shop-test', progress: 'ch2', heroClass: 'sword',
    roster: { c01: { lb: 0 }, c05: { lb: 0 }, c11: { lb: 0 } },   // ★3·★2·★1
    resources: { gold: 10000, badge: 100, iron: 100, enhStone: 0, awaken: 0 },
    base: { buildings: { shop: { lv: 1 } } },
  };
}

console.log('— 장비 완제품');
{
  const st = freshState();
  const offers = SH.equipOffers();
  eq('진열 24종 (2티어 × 12계열)', offers.length, 24);
  eq('T1 가격 = 제작 60 × 1.6', SH.equipPrice(1), Math.round(60 * BALANCE.shop.equipPriceMult));
  const g0 = st.resources.gold;
  const r = SH.buyEquip(st, 'greatsword', 2);
  eq('구매 성공 (T2 일반)', [r.ok, r.item.tier, r.item.grade], [true, 2, 1]);
  eq('골드 차감', g0 - st.resources.gold, SH.equipPrice(2));
  eq('인벤 등록', st.inventory.equips.length, 1);
  eq('없는 티어 거부', SH.buyEquip(st, 'greatsword', 3).err, 'offer');
  st.resources.gold = 0;
  eq('골드 부족', SH.buyEquip(st, 'bow', 1).err, 'gold');
}

console.log('— 강화석');
{
  const st = freshState();
  eq('낱개 가격', SH.stonePrice(1), BALANCE.shop.stoneGold);
  eq('묶음 가격', SH.stonePrice(10), BALANCE.shop.stoneBundle.gold);
  const r = SH.buyStone(st, 10);
  eq('묶음 구매', [r.ok, st.resources.enhStone], [true, 10]);
  eq('골드 차감', st.resources.gold, 10000 - BALANCE.shop.stoneBundle.gold);
}

console.log('— 조각 교환 (증표)');
{
  const st = freshState();
  eq('가격 = 등급별 (★3=4·★2=2·★1=1)', [SH.shardPrice('c01'), SH.shardPrice('c05'), SH.shardPrice('c11')], [4, 2, 1]);
  const r = SH.buyShard(st, 'c01');
  eq('구매 성공', [r.ok, st.roster.c01.shards], [true, 1]);
  eq('증표 차감', st.resources.badge, 96);
  eq('주인공 거부', SH.buyShard(st, 'hero').err, 'hero');
  eq('미보유 거부', SH.buyShard(st, 'c02').err, 'not-owned');
  st.roster.c11.lb = 4; st.roster.c11.shards = 1;      // 완돌까지 딱 채워진 상태
  eq('죽은 조각 방지', SH.buyShard(st, 'c11').err, 'full');
  st.resources.badge = 0;
  eq('증표 부족', SH.buyShard(st, 'c05').err, 'badge');
}

console.log('— 판매');
{
  const st = freshState();
  const it = EQ.makeItem(st, 'greatsword', 2, 2);      // T2 고급
  const want = Math.floor(120 * BALANCE.equip.gradeCoef[2] * BALANCE.shop.sellRate);
  eq('판매가 = 제작가 × 등급계수 × 0.35', SH.sellPrice(it), want);
  const g0 = st.resources.gold;
  const r = SH.sellEquip(st, it.uid);
  eq('판매 성공·골드 지급', [r.ok, st.resources.gold - g0], [true, want]);
  eq('인벤에서 제거', st.inventory.equips.length, 0);
  const it2 = EQ.makeItem(st, 'lance', 1, 1);
  EQ.equipItem(st, 'c01', it2.uid);                    // 기사 장착
  eq('장착 중 판매 거부', SH.sellEquip(st, it2.uid).err, 'equipped');
  EQ.unequip(st, 'c01', 'weapon');
  it2.lock = true;
  eq('잠금 판매 거부', SH.sellEquip(st, it2.uid).err, 'locked');
}

console.log('— 경제 정합 (제작 vs 상점 vs 판매)');
{
  ok('상점가 > 제작 골드 (확정 수급 프리미엄)', SH.equipPrice(1) > BALANCE.equip.craft.gold[0]);
  const st = freshState();
  const it = EQ.makeItem(st, 'ring', 1, 1);
  ok('판매가 < 상점가 (되팔이 차익 없음)', SH.sellPrice(it) < SH.equipPrice(1));
  ok('★3 완돌 조각값(20증표) < 천장(30회)', SH.shardPrice('c01') * 5 < BALANCE.gacha.pityAt);
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
