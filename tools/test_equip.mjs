// ============================================================
// test_equip.mjs — 장비 순수 모듈 검증 (M5-4)
// 실행: node tools/test_equip.mjs
// ============================================================

import { BALANCE } from '../src/balance.js';
import * as EQ from '../src/core/equip.js';
import * as GR from '../src/core/growth.js';
import { computeAllyStats, createBattleFromStage } from '../src/battle/logic.js';
import { CHARACTERS } from '../src/data/characters.js';
import { EQUIP_KINDS, GRADES } from '../src/data/equipment.js';

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); }
}
function ok(name, cond) { eq(name, !!cond, true); }

function freshState({ smithLv = 1, seed = 'eq-test' } = {}) {
  return {
    seed, progress: 'ch2', heroClass: 'sword',
    roster: { c01: { lb: 0 }, c02: { lb: 0 }, c11: { lb: 0 } },   // 기사·마법사·전사
    resources: { gold: 100000, iron: 1000, enhStone: 1000, awaken: 0 },
    base: { buildings: { smith: { lv: smithLv }, dojo: { lv: 3 } } },
  };
}

console.log('— 상태 보장');
{
  const st = freshState();
  EQ.ensureEquip(st);
  eq('인벤·시퀀스 생성', [st.inventory.equips.length, st.itemSeq], [0, 1]);
  eq('장착 슬롯 보강', st.roster.c01.equip, { weapon: null, armor: null, acc: null });
  eq('주인공 슬롯 보강', st.heroGrowth.equip, { weapon: null, armor: null, acc: null });
  eq('강화석 재화 생성', st.resources.enhStone, 1000);
}

console.log('— 인스턴스 생성 (부옵 시드 롤)');
{
  const st = freshState();
  const n = EQ.makeItem(st, 'greatsword', 1, 1);
  eq('일반 부옵 0개', n.subs.length, 0);
  const r = EQ.makeItem(st, 'bow', 3, 3);
  eq('희귀 부옵 1개', r.subs.length, 1);
  const e = EQ.makeItem(st, 'ring', 6, 4);
  eq('영웅 부옵 2개(서로 다른 종류)', [e.subs.length, e.subs[0].key !== e.subs[1].key], [2, true]);
  for (const s of [...r.subs, ...e.subs]) {
    const [min, max] = BALANCE.equip.subs[s.key];
    ok(`부옵 범위 ${s.key}=${s.val}`, s.val >= min && s.val <= max);
  }
  // 같은 시드·같은 uid = 같은 부옵 (세이브 재현성)
  const st2 = freshState();
  EQ.makeItem(st2, 'greatsword', 1, 1);
  const r2 = EQ.makeItem(st2, 'bow', 3, 3);
  eq('시드 재현성 (uid 동일 → 부옵 동일)', r2.subs, r.subs);
}

console.log('— 스탯 계산');
{
  const st = freshState();
  const gs = EQ.makeItem(st, 'greatsword', 3, 1);         // T3 일반 대검
  eq('대검 = 공격 12', EQ.itemStats(gs).flat.atk, 12);
  const gs4 = EQ.makeItem(st, 'greatsword', 3, 4);        // 영웅 ×1.5
  eq('영웅 등급 계수 1.5 → 18', EQ.itemStats(gs4).flat.atk, 18);
  const staff = EQ.makeItem(st, 'staff', 2, 1);
  const stf = EQ.itemStats(staff);
  eq('지팡이 = 마력 주스탯', [stf.flat.mag, stf.flat.atk], [9, 0]);
  const rod = EQ.makeItem(st, 'rod', 2, 1);
  const rs = EQ.itemStats(rod);
  eq('성장 = 마력 + HP 시그니처', [rs.flat.mag, rs.flat.hp], [9, 8]);
  const lance = EQ.makeItem(st, 'lance', 5, 1);
  eq('창방패 방어 시그니처 T5=3', EQ.itemStats(lance).flat.def, 3);
  const bow = EQ.makeItem(st, 'bow', 4, 1);
  eq('활 치명 시그니처 T4=3%p', EQ.itemStats(bow).critPct, 3);
  const heavy = EQ.makeItem(st, 'heavy', 2, 1);
  eq('중갑 T2 = HP30·방3', [EQ.itemStats(heavy).flat.hp, EQ.itemStats(heavy).flat.def], [30, 3]);
  const robe = EQ.makeItem(st, 'robe', 2, 1);
  const rb = EQ.itemStats(robe);
  eq('로브 배율(HP75%·방50%) + 마력 시그', [rb.flat.hp, rb.flat.def, rb.flat.mag], [22, 1, 2]);
  const neck = EQ.makeItem(st, 'necklace', 4, 1);
  eq('목걸이 T4 HP35', EQ.itemStats(neck).flat.hp, 35);
  // 강화: 주스탯만 +4%/단계
  gs.enhance = 10;
  eq('대검 +10 = 12×1.4 내림', EQ.itemStats(gs).flat.atk, Math.floor(12 * 1.4));
  rod.enhance = 10;
  const rs10 = EQ.itemStats(rod);
  eq('강화는 시그니처 미적용', [rs10.flat.mag, rs10.flat.hp], [Math.floor(9 * 1.4), 8]);
}

console.log('— 이름');
{
  const st = freshState();
  const a = EQ.makeItem(st, 'greatsword', 3, 1);
  eq('일반', EQ.displayName(a), '잿불 대검');
  const b = EQ.makeItem(st, 'bow', 4, 3);
  eq('희귀 수식어', EQ.displayName(b), '축복받은 서리시위 활');
  b.enhance = 7;
  eq('강화 표기', EQ.displayName(b), '축복받은 서리시위 활 +7');
  const c = EQ.makeItem(st, 'charm', 6, 5);
  eq('전설 고유명', EQ.displayName(c), '정령왕의 부적');
}

console.log('— 장착 규칙');
{
  const st = freshState();
  const gs = EQ.makeItem(st, 'greatsword', 1, 1);
  const lance = EQ.makeItem(st, 'lance', 1, 1);
  const ring = EQ.makeItem(st, 'ring', 1, 1);
  eq('기사가 대검 거부', EQ.equipItem(st, 'c01', gs.uid).err, 'class');
  eq('기사가 창방패 OK', EQ.equipItem(st, 'c01', lance.uid).ok, true);
  eq('주인공(검사)이 대검 OK', EQ.equipItem(st, 'hero', gs.uid).ok, true);
  eq('장신구는 공용', EQ.equipItem(st, 'c02', ring.uid).ok, true);
  // 다른 착용자에게서 회수
  EQ.equipItem(st, 'c11', gs.uid);      // 전사가 가져감
  eq('이전 착용자 해제', st.heroGrowth.equip.weapon, null);
  eq('새 착용자 장착', st.roster.c11.equip.weapon, gs.uid);
  eq('해제', [EQ.unequip(st, 'c11', 'weapon').ok, st.roster.c11.equip.weapon], [true, null]);
  eq('빈 슬롯 해제 거부', EQ.unequip(st, 'c11', 'weapon').err, 'empty');
}

console.log('— 장비 합산 → 전투 스탯');
{
  const st = freshState();
  const gs = EQ.makeItem(st, 'greatsword', 3, 1);          // 공 +12
  const heavy = EQ.makeItem(st, 'heavy', 2, 1);            // HP+30 방+3
  const charm = EQ.makeItem(st, 'charm', 2, 1);            // 속+3
  EQ.equipItem(st, 'c11', gs.uid);
  EQ.equipItem(st, 'c11', heavy.uid);
  EQ.equipItem(st, 'c11', charm.uid);
  const bonus = EQ.equipBonus(st, 'c11');
  eq('합산 플랫', [bonus.flat.atk, bonus.flat.hp, bonus.flat.def, bonus.flat.spd], [12, 30, 3, 3]);
  const bare = computeAllyStats(CHARACTERS.c11, 10);
  const armed = computeAllyStats(CHARACTERS.c11, 10, { equip: bonus });
  eq('공격 = 맨몸 + 12', armed.atk, bare.atk + 12);
  eq('속도 = 맨몸 + 3', armed.spd, bare.spd + 3);
  // %부옵 적용 순서: (배수 적용 후 + 플랫) × (1+%)
  const pctBonus = { flat: { hp: 0, atk: 10, mag: 0, def: 0, spd: 0 }, pct: { atkPct: 10, magPct: 0, hpPct: 0, defPct: 0 }, critPct: 5 };
  const p = computeAllyStats(CHARACTERS.c11, 10, { equip: pctBonus });
  const rawAtk = (BALANCE.classStats.warrior.atk[0] + BALANCE.classStats.warrior.atk[1] * 9) * BALANCE.gradeMult[1];
  eq('플랫 후 %가 곱해진다', p.atk, Math.round((rawAtk + 10) * 1.1));
  ok('치명 %p 가산', Math.abs(p.critBase - (BALANCE.crit.classBase.warrior + 0.05)) < 1e-9);
  // 무장비 = 기존 동작과 동일 (하위 호환)
  eq('무장비 하위 호환', computeAllyStats(CHARACTERS.c11, 10, {}), bare);
}

console.log('— 제작');
{
  const st = freshState({ smithLv: 0 });
  eq('대장간 없음 거부', EQ.craft(st, 'greatsword', 1).err, 'no-smith');
  const st1 = freshState({ smithLv: 1 });
  eq('Lv1 티어 상한 2', EQ.craftTierCap(st1), 2);
  eq('상한 초과 거부', EQ.craft(st1, 'greatsword', 3).err, 'tier');
  const g0 = st1.resources.gold, i0 = st1.resources.iron;
  const r = EQ.craft(st1, 'greatsword', 2);
  eq('제작 성공·티어', [r.ok, r.item.tier, r.item.kind], [true, 2, 'greatsword']);
  eq('비용 차감', [g0 - st1.resources.gold, i0 - st1.resources.iron], [BALANCE.equip.craft.gold[1], BALANCE.equip.craft.iron[1]]);
  ok('등급 1~3', r.item.grade >= 1 && r.item.grade <= 3);
  // 결정성: 같은 시드에서 제작 순서 재현
  const a1 = freshState({ seed: 'det' }), a2 = freshState({ seed: 'det' });
  const seq1 = [EQ.craft(a1, 'bow', 1).item.grade, EQ.craft(a1, 'bow', 1).item.grade, EQ.craft(a1, 'bow', 1).item.grade];
  const seq2 = [EQ.craft(a2, 'bow', 1).item.grade, EQ.craft(a2, 'bow', 1).item.grade, EQ.craft(a2, 'bow', 1).item.grade];
  eq('제작 등급 시드 재현', seq1, seq2);
  const poor = freshState(); poor.resources.gold = 0;
  eq('골드 부족', EQ.craft(poor, 'ring', 1).err, 'gold');
}

console.log('— 강화');
{
  const st = freshState();
  const it = EQ.makeItem(st, 'greatsword', 2, 1);
  const c = EQ.enhanceCost(it);
  eq('+1 비용 = 강화석 2·골드 100', [c.stone, c.gold], [2 * 1 * 1, 50 * 2 * 1 * 1]);
  const r = EQ.enhance(st, it.uid);
  eq('강화 성공', [r.ok, it.enhance], [true, 1]);
  eq('재화 차감', [st.resources.enhStone, st.resources.gold], [1000 - 2, 100000 - 100]);
  it.enhance = BALANCE.enhance.maxLevel;
  eq('+10 상한 거부', EQ.enhance(st, it.uid).err, 'max');
}

console.log('— 심볼전 드랍');
{
  eq('티어 환산 (Lv3→1, Lv15→2, Lv60→6)', [EQ.tierOfStageLevel(3), EQ.tierOfStageLevel(15), EQ.tierOfStageLevel(60)], [1, 2, 6]);
  const st = freshState();
  let items = 0, stones = 0, rangeOk = true;
  for (let i = 0; i < 200; i++) {
    const d = EQ.rollDrop(st, 3);
    if (d.item) items += 1;
    stones += d.stones;
    if (d.stones < 1 || d.stones > 3) rangeOk = false;
  }
  ok('강화석 범위 1~3 (200회)', rangeOk);
  ok(`장비 드랍률 ~12% (200회 중 ${items})`, items > 8 && items < 44);
  eq('강화석 재화 적립', st.resources.enhStone, 1000 + stones);
  // 재현성
  const s1 = freshState({ seed: 'drop-det' }), s2 = freshState({ seed: 'drop-det' });
  const d1 = [EQ.rollDrop(s1, 3), EQ.rollDrop(s1, 3)].map((d) => [d.stones, d.item?.kind ?? null]);
  const d2 = [EQ.rollDrop(s2, 3), EQ.rollDrop(s2, 3)].map((d) => [d.stones, d.item?.kind ?? null]);
  eq('드랍 시드 재현', d1, d2);
}

console.log('— 전투 통합 (장비 낀 유닛 스탯)');
{
  const st = freshState();
  st.roster.c11.lv = 10;
  const gs = EQ.makeItem(st, 'greatsword', 3, 1);
  EQ.equipItem(st, 'c11', gs.uid);
  const growth = GR.buildGrowthMap(st, ['c11']);
  growth.c11.equip = EQ.equipBonus(st, 'c11');
  const b = createBattleFromStage('test_2v2', { seed: 't', partyIds: ['c11'], growth });
  const u = b.units.find((x) => x.defId === 'c11');
  const want = computeAllyStats(CHARACTERS.c11, 10, { equip: EQ.equipBonus(st, 'c11') });
  eq('전투 유닛 공격 = 장비 포함 계산', u.stats.atk, want.atk);
  ok('장비만큼 세졌다', u.stats.atk > computeAllyStats(CHARACTERS.c11, 10).atk);
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
