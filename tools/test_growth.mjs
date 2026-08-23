// ============================================================
// test_growth.mjs — 육성 순수 모듈 검증 (M5-3)
// 실행: node tools/test_growth.mjs
// 브라우저 없이 core/growth.js + battle/logic.js 스탯 연동을 검사한다.
// ============================================================

import { BALANCE } from '../src/balance.js';
import * as GR from '../src/core/growth.js';
import { computeAllyStats, createBattleFromStage } from '../src/battle/logic.js';
import { CHARACTERS } from '../src/data/characters.js';

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); }
}
function ok(name, cond) { eq(name, !!cond, true); }

function freshState({ dojoLv = 0, templeLv = 0, progress = 'ch1a' } = {}) {
  return {
    progress,
    roster: { c01: { lb: 0 }, c11: { lb: 0 } },
    resources: { gold: 100000, crystal: 100, awaken: 100 },
    base: { buildings: { dojo: { lv: dojoLv }, temple: { lv: templeLv } } },
  };
}

console.log('— 필요 EXP 공식 (25 × Lv^1.5 내림)');
eq('xpNeed(1)', GR.xpNeed(1), 25);
eq('xpNeed(2)', GR.xpNeed(2), Math.floor(25 * Math.pow(2, 1.5)));
eq('xpNeed(10)', GR.xpNeed(10), Math.floor(25 * Math.pow(10, 1.5)));

console.log('— 상태 보장·마이그레이션');
{
  const st = freshState();
  GR.ensureGrowth(st);
  eq('구세이브 로스터 엔트리 보강', st.roster.c01, { lb: 0, lv: 1, xp: 0, awaken: 0, shards: 0 });
  eq('결정 재화 잔재 제거', 'crystal' in st.resources, false);
  eq('주인공 성장 생성', st.heroGrowth, { lv: 1, xp: 0 });
  eq('보유 명단 = 주인공 + 보유 2명', GR.ownedIds(st), ['hero', 'c01', 'c11']);
}

console.log('— 레벨 상한 (훈련소 15/30/45/60)');
{
  eq('미건설 15', GR.levelCap(freshState()), 15);
  eq('훈련소 Lv2 → 45', GR.levelCap(freshState({ dojoLv: 2 })), 45);
  eq('훈련소 Lv3 → 60 (최대)', GR.levelCap(freshState({ dojoLv: 3 })), 60);
}

console.log('— 전투 경험치');
{
  const st = freshState();
  const xp = GR.battleXpOf([3, 3, 4]);
  eq('Σ적레벨×계수', xp, 10 * BALANCE.growth.xpPerEnemyLv);
  const ups = GR.grantBattleXp(st, ['hero', 'c01'], 100);
  eq('레벨업 보고 (Lv1→2, 25+70=95≤100)', ups, [
    { cid: 'hero', from: 1, to: 3 }, { cid: 'c01', from: 1, to: 3 },
  ]);
  eq('잔여 xp 보존', st.roster.c01.xp, 100 - 25 - GR.xpNeed(2));
}
{
  const st = freshState();       // 상한 15
  GR.grantBattleXp(st, ['c01'], 10000000);
  eq('상한에서 멈춤', st.roster.c01.lv, 15);
  ok('잔여 xp가 남는다', st.roster.c01.xp > 0);
  st.base.buildings.dojo.lv = 1; // 상한 30으로 확장
  GR.grantBattleXp(st, ['c01'], 0);
  ok('상한 확장 후 잔여 xp로 이어서 오른다', st.roster.c01.lv > 15);
}

console.log('— 훈련소 골드 레벨업');
{
  const st = freshState();
  const r = GR.trainOnce(st, 'c01');
  eq('첫 레벨업 비용 = ceil(25×0.4)', r, { ok: true, cost: Math.ceil(25 * BALANCE.growth.trainGoldPerXp), lv: 2 });
  eq('골드 차감', st.resources.gold, 100000 - r.cost);
  st.roster.c01.xp = GR.xpNeed(2) - 5;   // 전투로 거의 다 채움
  const r2 = GR.trainOnce(st, 'c01');
  eq('남은 EXP 기준 할인', r2.cost, Math.max(1, Math.ceil(5 * BALANCE.growth.trainGoldPerXp)));
  st.roster.c01.lv = 15; st.roster.c01.xp = 0;
  eq('상한에서 거부', GR.trainOnce(st, 'c01').err, 'cap');
  const st2 = freshState(); st2.resources.gold = 0;
  eq('골드 부족', GR.trainOnce(st2, 'c01').err, 'gold');
}

console.log('— 한계돌파 (그 캐릭터의 조각)');
{
  const st = freshState();
  GR.ensureGrowth(st);
  st.roster.c01.shards = 2;
  const r = GR.limitBreak(st, 'c01');
  eq('돌파 성공 (조각 1 소비)', r, { ok: true, cost: 1, lb: 1 });
  eq('조각 차감', st.roster.c01.shards, 1);
  st.roster.c01.shards = 0;
  eq('조각 부족', GR.limitBreak(st, 'c01').err, 'shard');
  st.roster.c01.lb = BALANCE.limitBreak.maxSteps;
  st.roster.c01.shards = 9;
  eq('완돌이면 조각 있어도 거부', GR.limitBreak(st, 'c01').err, 'max');
  eq('주인공 거부', GR.limitBreak(st, 'hero').err, 'hero');
}

console.log('— 각성 (신전·3장 게이트)');
{
  const st = freshState({ progress: 'ch1a' });
  eq('3장 전 거부', GR.awaken(st, 'c01').err, 'chapter');
  const st2 = freshState({ progress: 'ch3', templeLv: 0 });
  eq('신전 미건설 거부', GR.awaken(st2, 'c01').err, 'build');
  const st3 = freshState({ progress: 'ch3', templeLv: 1 });
  const r = GR.awaken(st3, 'c01');
  eq('1각성 비용', r, { ok: true, cost: BALANCE.growth.awakenCost[0], awaken: 1 });
  st3.roster.c01.awaken = BALANCE.awaken.maxSteps;
  eq('3각성 후 거부', GR.awaken(st3, 'c01').err, 'max');
}

console.log('— 전투 연동 (growth 맵 → 스탯)');
{
  const st = freshState({ dojoLv: 3 });
  st.roster.c01.lv = 20; st.roster.c01.lb = 5;
  const map = GR.buildGrowthMap(st, ['hero', 'c01']);
  eq('growth 맵', map, { hero: { lv: 1, limitBreak: 0, awaken: 0 }, c01: { lv: 20, limitBreak: 5, awaken: 0 } });
  const b = createBattleFromStage('test_2v2', { seed: 't', partyIds: ['hero', 'c01'], growth: map });
  const bran = b.units.find((u) => u.defId === 'c01');
  eq('아군 레벨 반영', bran.level, 20);
  const want = computeAllyStats(CHARACTERS.c01, 20, { limitBreak: 5, awaken: 0 });
  eq('한돌 보정 스탯 일치', bran.stats.maxHp, want.maxHp);
  const noLb = computeAllyStats(CHARACTERS.c01, 20);
  ok('완돌이 실제로 더 세다', want.maxHp > noLb.maxHp);
  const b2 = createBattleFromStage('test_2v2', { seed: 't', partyIds: ['hero', 'c01'] });
  const stage = b2.units.find((u) => u.defId === 'c01');
  ok('growth 없으면 스테이지 레벨 (시뮬 재현성)', stage.level !== 20);
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
