// ============================================================
// test_items.mjs — 소모품·전투 아이템 검증 (M5-6)
// 실행: node tools/test_items.mjs
// ============================================================

import { BALANCE } from '../src/balance.js';
import * as L from '../src/battle/logic.js';
import * as SH from '../src/core/shop.js';
import * as EQ from '../src/core/equip.js';
import { CONSUMABLES, describeConsumable } from '../src/data/items.js';

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); }
}
function ok(name, cond) { eq(name, !!cond, true); }

function freshBattle() {
  return L.createBattleFromStage('test_2v2', { seed: 'item-test' });
}
function allyOf(b, i = 0) { return b.units.filter((u) => u.side === 'ally')[i]; }

console.log('— 회복 포션');
{
  const b = freshBattle();
  const a = allyOf(b);
  a.hp = 1;
  const ev = L.useBattleItem(b, a.id, 'potion_s', a.id);
  const want = Math.max(1, Math.round(a.stats.maxHp * BALANCE.items.healPct.potion_s));
  eq('30% 회복', [ev[0].type, ev[0].amount], ['heal', want]);
  eq('사용 횟수 증가', b.itemUses, 1);
  a.hp = a.stats.maxHp - 1;
  L.useBattleItem(b, a.id, 'potion_l', a.id);
  eq('최대 HP 초과 없음', a.hp, a.stats.maxHp);
}

console.log('— 부활의 깃털');
{
  const b = freshBattle();
  const a = allyOf(b, 1);
  a.alive = false; a.hp = 0; a.statuses = [{ id: 'burn', turns: 2 }];
  const ev = L.useBattleItem(b, allyOf(b, 0).id, 'feather', a.id);
  eq('부활 이벤트', ev[0].type, 'revive');
  eq('부활 상태', [a.alive, a.hp, a.acted, a.statuses.length],
    [true, Math.round(a.stats.maxHp * BALANCE.items.revivePct), true, 0]);
}

console.log('— 정화의 물약');
{
  const b = freshBattle();
  const a = allyOf(b);
  a.statuses = [
    { id: 'burn', turns: 2 }, { id: 'atkDown', turns: 2 },   // 디버프
    { id: 'regen', turns: 2 },                               // 버프 — 남아야 한다
  ];
  const ev = L.useBattleItem(b, a.id, 'cleanse', a.id);
  eq('디버프만 제거', ev[0].removed.sort(), ['atkDown', 'burn']);
  eq('버프는 유지', a.statuses.map((s) => s.id), ['regen']);
}

console.log('— 공격·방어 비약');
{
  const b = freshBattle();
  const a = allyOf(b);
  const ev = L.useBattleItem(b, a.id, 'atk_tonic', a.id);
  eq('공격 강화 부여', [ev[0].type, ev[0].statusId], ['status', 'atkUp']);
  const st = a.statuses.find((s) => s.id === 'atkUp');
  eq('비율·턴 수 반영', [st.ratio, st.turns], [BALANCE.items.buff.atk_tonic.ratio, BALANCE.items.buff.atk_tonic.turns]);
  L.useBattleItem(b, a.id, 'def_tonic', a.id);
  ok('철벽 부여', a.statuses.some((s) => s.id === 'ironwall'));
  eq('사용 횟수 누적', b.itemUses, 2);
}

console.log('— 상점 소모품');
{
  const st = {
    seed: 's', progress: 'ch1a', roster: {},
    resources: { gold: 1000 },
    base: { buildings: { shop: { lv: 1 } } },
  };
  const r = SH.buyConsumable(st, 'potion_s');
  eq('구매·스택', [r.ok, st.inventory.consumables.potion_s], [true, 1]);
  SH.buyConsumable(st, 'potion_s');
  eq('스택 증가', st.inventory.consumables.potion_s, 2);
  eq('골드 차감', st.resources.gold, 1000 - BALANCE.items.prices.potion_s * 2);
  st.resources.gold = 0;
  eq('골드 부족', SH.buyConsumable(st, 'feather').err, 'gold');
}

console.log('— 설명 문구 (툴팁 원칙: 수치 포함)');
{
  ok('포션 소 30%', describeConsumable('potion_s').includes('30%'));
  ok('비약 +30%·3턴', describeConsumable('atk_tonic').includes('30%') && describeConsumable('atk_tonic').includes('3턴'));
  ok('부활 50%', describeConsumable('feather').includes('50%'));
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
