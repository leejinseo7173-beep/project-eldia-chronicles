// ============================================================
// logic.js — JRPG 사이드뷰 전투 순수 로직 (절대 규칙 4: 로직·렌더 분리)
// M3: 스킬(대상 규격 6종·쿨타임)·상태이상 14종·패시브·승리조건·별점.
// 렌더링 없이 완결된다 — 오토·소탕·자동 시뮬레이터가 같은 계약을 재사용.
// 모든 랜덤은 전투 상태의 시드 RNG로만. 데미지·스탯 최종값은 정수.
// 계산 순서 고정: 계수 → 상성 → (패시브 배율) → 치명 → 방어차감 → 피해감소 → 최소보장 → 정수.
// ============================================================

import { BALANCE } from '../balance.js';
import { RNG } from '../core/rng.js';
import { SKILLS } from '../data/skills.js';
import { STATUSES, BOSS_IMMUNE } from '../data/statuses.js';
import { CHARACTERS, HERO_KITS } from '../data/characters.js';
import { CONSUMABLES } from '../data/items.js';
import { ENEMIES } from '../data/enemies.js';
import { STAGES } from '../data/stages.js';

// ----- 스탯 계산 -----

// equip: core/equip.js equipBonus() 형태 { flat, pct, critPct } (M5-4).
// 적용 순서: (기본+성장) × 등급·한돌·각성 배수 → + 장비 플랫 → × (1+부옵%) → 정수.
// bond: 교감 스탯 보너스 비율 (Lv2 +3% 등 — core/bond.js bondBonus, M5-7)
export function computeAllyStats(def, level, { limitBreak = 0, awaken = 0, equip = null, bond = 0 } = {}) {
  const table = def.isHero ? BALANCE.heroStats[def.heroClass] : BALANCE.classStats[def.classKey];
  const mult = (def.isHero ? 1 : BALANCE.gradeMult[def.grade])
    * (1 + limitBreak * BALANCE.limitBreak.perStep)
    * (1 + awaken * BALANCE.awaken.perStep)
    * (1 + bond);
  const raw = ([base, growth]) => (base + growth * (level - 1)) * mult;
  const flat = equip?.flat ?? {};
  const pct = equip?.pct ?? {};
  const fin = (v, f, p) => Math.round((v + (flat[f] ?? 0)) * (1 + (pct[p] ?? 0) / 100));
  const critBase = (def.isHero
    ? BALANCE.crit.heroBase[def.heroClass]
    : BALANCE.crit.classBase[def.classKey]) + (equip?.critPct ?? 0) / 100;
  return {
    maxHp: fin(raw(table.hp), 'hp', 'hpPct'),
    atk: fin(raw(table.atk), 'atk', 'atkPct'),
    mag: fin(raw(table.mag), 'mag', 'magPct'),
    def: fin(raw(table.def), 'def', 'defPct'),
    spd: Math.round(raw(table.spd) + (flat.spd ?? 0)),
    critBase,
  };
}

export function computeEnemyStats(def, level, difficulty = 'normal', role = 'normal') {
  const table = BALANCE.enemyStats[def.id];
  const hard = difficulty === 'hard' ? BALANCE.difficulty.hardEnemyStatMult : 1;
  const stat = ([base, growth]) => Math.round((base + growth * (level - 1)) * hard);
  // 역할 배수는 HP와 공격력에만 — 방어·속도까지 올리면 공략거리가 아니라 벽이 된다.
  // atk 배수는 mag에도 같이 건다 (주술사형 정예·보스가 물리 배수만 받고 물러지는 걸 막는다).
  const r = BALANCE.enemyRole[role] ?? BALANCE.enemyRole.normal;
  return {
    maxHp: Math.round(stat(table.hp) * r.hp),
    atk: Math.round(stat(table.atk) * r.atk), mag: Math.round(stat(table.mag) * r.atk),
    def: stat(table.def), spd: stat(table.spd),
    critBase: 0, // 적→아군 치명타 없음 (기획서 §6)
  };
}

// ----- 전투 생성 -----

function makeUnit(base) {
  return {
    ...base,
    hp: base.stats.maxHp, alive: true, acted: false,
    cooldowns: {}, statuses: [], shield: 0, miracleUsed: false,
    // 여명 게이지 — 성물 보유자(주인공)만. null = 게이지 없음
    sacredGauge: base.skills?.sacred ? BALANCE.sacred.gaugeStart : null,
  };
}

// 여명 게이지 충전 (성물 필살기 — 수치는 balance.sacred)
function chargeSacred(unit, amount) {
  if (unit?.sacredGauge === null || unit?.sacredGauge === undefined || !unit.alive) return;
  unit.sacredGauge = Math.min(BALANCE.sacred.gaugeMax, unit.sacredGauge + amount);
}

// allies/enemies: [{ def, level, slot, name?, boss? }] — def는 resolve된 정의
export function createBattle({ seed, allies, enemies, victory, starTurns, difficulty = 'normal' }) {
  const units = [];
  let nextId = 1;
  for (const a of allies) {
    units.push(makeUnit({
      id: `a${nextId++}`, side: 'ally', slot: a.slot,
      defId: a.def.id, name: a.name ?? a.def.name, spriteCfg: a.def.spriteCfg, assetKey: a.def.assetKey ?? null,
      element: a.def.element, level: a.level, isBoss: false,
      classKey: a.def.isHero ? a.def.heroClass : a.def.classKey,
      skills: a.def.skills, passive: a.def.passive, ai: null,
      stats: computeAllyStats(a.def, a.level, a),
    }));
  }
  for (const e of enemies) {
    units.push(makeUnit({
      id: `e${nextId++}`, side: 'enemy', slot: e.slot,
      defId: e.def.id, name: e.def.name, spriteCfg: e.def.spriteCfg, assetKey: e.def.assetKey ?? null,
      element: e.def.element, level: e.level, isBoss: !!e.boss,
      classKey: null,
      skills: e.def.skills, passive: null, ai: e.def.ai,
      role: e.role ?? (e.boss ? 'boss' : 'normal'),
      stats: computeEnemyStats(e.def, e.level, difficulty, e.role ?? (e.boss ? 'boss' : 'normal')),
    }));
  }
  const state = {
    seed, rng: new RNG(seed),
    units,
    turn: 1, phase: 'player', winner: null,
    focus: null,                       // 연계 협공 추적 { targetId, attackerId }
    victory: victory ?? { type: 'annihilation' },
    starTurns: starTurns ?? 99,
    difficulty,
    allyDeaths: 0,                     // 별점: 아군 전투불능 발생 횟수
    itemUses: 0,                       // 소모품 사용 횟수 (전투당 3회 — balance.battleItems)
    dmgDealt: {},                      // 결과 화면 딜 집계: 유닛 id → 누적 피해 (도트는 시전자 미기록이라 제외)
  };
  // 전투 시작 패시브: 도르간 굳건한 대지 — 시작 보호막
  for (const u of units) {
    if (u.passive === 'c09_p') {
      u.shield = Math.round(u.stats[BALANCE.passives.c09_p.stat ?? 'mag'] * BALANCE.passives.c09_p.startShieldRatio);
      applyStatus(state, u, 'shield');
    }
  }
  return state;
}

// 스테이지 데이터로 전투 조립 — 씬·시뮬레이터·치트 콘솔 공용 진입점
export function createBattleFromStage(stageId, { seed, partyIds, heroClass = 'sword', heroName, difficulty = 'normal', growth } = {}) {
  const stage = STAGES[stageId];
  // growth: { cid: { lv, limitBreak, awaken } } — 실제 플레이는 육성 상태를 넘기고,
  // 시뮬레이터·프리셋은 안 넘겨 기존처럼 스테이지 레벨을 쓴다 (core/growth.js buildGrowthMap)
  const resolveAlly = (characterId, slot) => {
    const c = CHARACTERS[characterId];
    const def = c.isHero ? { ...c, heroClass, ...HERO_KITS[heroClass] } : c;
    const g = growth?.[characterId];
    return {
      def, slot,
      level: g?.lv ?? stage.level,
      limitBreak: g?.limitBreak ?? 0, awaken: g?.awaken ?? 0,
      equip: g?.equip ?? null,       // 장비 합산 보너스 (M5-4)
      bond: g?.bond ?? 0,            // 교감 보너스 (M5-7)
      name: c.isHero ? heroName : undefined,
    };
  };
  // 편성 배열은 빈 슬롯이 null일 수 있다 (state.partyIds가 슬롯 배열 그대로 저장됨)
  // — 슬롯 위치(진형 앵커)는 보존하고 null만 거른다
  const allies = partyIds
    ? partyIds.map((cid, i) => (cid ? resolveAlly(cid, i) : null)).filter(Boolean)
    : stage.allies.map((a) => resolveAlly(a.characterId, a.slot));
  const enemies = stage.enemies.map((e) => ({
    def: ENEMIES[e.enemyId], level: e.level ?? stage.level, slot: e.slot, boss: e.boss,
    role: e.role ?? (e.boss ? 'boss' : 'normal'),
  }));
  return createBattle({
    seed: seed ?? `stage-${stageId}`,
    allies, enemies,
    victory: stage.victory, starTurns: stage.starTurns, difficulty,
  });
}

export function getUnit(state, id) { return state.units.find((u) => u.id === id); }

// ----- 전투 소모품 (기획서 §10, M5-6) -----
// 사용 가능 여부는 씬이 미리 검사(횟수·재고), 여기서는 효과만 계산한다.
// 이벤트는 기존 재생 타입(heal·status·cleanse)을 재사용 — revive만 신규.
export function useBattleItem(state, userId, itemId, targetId) {
  const item = CONSUMABLES[itemId];
  const B = BALANCE.items;
  const T = getUnit(state, targetId);
  const events = [];
  state.itemUses = (state.itemUses ?? 0) + 1;
  if (item.effect === 'heal') {
    const amount = Math.max(1, Math.round(T.stats.maxHp * B.healPct[itemId]));
    T.hp = Math.min(T.stats.maxHp, T.hp + amount);
    events.push({ type: 'heal', caster: userId, target: T.id, amount, hpAfter: T.hp });
  } else if (item.effect === 'revive') {
    T.alive = true;
    T.hp = Math.max(1, Math.round(T.stats.maxHp * B.revivePct));
    T.statuses = [];
    T.shield = 0;
    T.acted = true;                    // 부활한 턴에는 행동 불가 (DECISIONS)
    events.push({ type: 'revive', target: T.id, hpAfter: T.hp });
  } else if (item.effect === 'cleanse') {
    const removed = T.statuses.filter((s) => STATUSES[s.id].kind === 'debuff').map((s) => s.id);
    T.statuses = T.statuses.filter((s) => STATUSES[s.id].kind !== 'debuff');
    events.push({ type: 'cleanse', target: T.id, removed });
  } else if (item.effect === 'buff') {
    const b = B.buff[itemId];
    applyStatus(state, T, item.status, { ratio: b.ratio, turns: b.turns, fromSide: 'ally' });
    events.push({ type: 'status', target: T.id, statusId: item.status, applied: true });
  }
  return events;
}

export function livingUnits(state, side) {
  return state.units.filter((u) => u.side === side && u.alive).sort((a, b) => a.slot - b.slot);
}

export function getSkill(unit, skillId) {
  const s = unit.skills;
  if (s.basic === skillId || s.actives.includes(skillId) || s.sacred === skillId) return SKILLS[skillId];
  return null;
}

export function unitSkillIds(unit) {
  const ids = [unit.skills.basic, ...unit.skills.actives];
  if (unit.skills.sacred) ids.push(unit.skills.sacred);
  return ids;
}

// ----- 상태이상 -----

export function getStatus(unit, id) { return unit.statuses.find((s) => s.id === id) ?? null; }
export function isStunned(unit) { return !!getStatus(unit, 'stun'); }
export function isBound(unit) { return !!getStatus(unit, 'bind'); }
export function canAct(unit) { return unit.alive && !isStunned(unit); }

// 틱에서 "지속 감소보다 먼저" 발동하는 상태 — 유예를 주면 1회 더 터진다
const TICK_BEFORE_DECREMENT = ['burn', 'regen'];

// 동명 중첩 불가·재적용 갱신. 보스는 기절·속박·도발 면역. 반환: 적용 여부
//
// fromSide: 이 상태를 건 쪽의 진영. 상대 팀에 건 상태는 **상대가 한 번도 행동하기 전에**
//   피해자 팀 턴 시작 틱에서 1턴이 깎여 나간다(1턴짜리는 아예 효과가 0이 된다).
//   예전에는 기절·속박만 저장 턴수 +1로 보정했는데, 그러면
//     ① 나머지 디버프(공격 약화·둔화·표식·방어 약화)는 그대로 손해를 보고
//     ② 화면의 '남은 턴'이 스펙보다 1 크게 표시된다
//   그래서 저장값을 부풀리지 않고 **첫 감소 1회를 건너뛰는 유예 플래그**로 처리한다.
export function applyStatus(state, unit, id, { power, ratio, turns, fromSide } = {}) {
  if (!unit.alive) return false;
  if (unit.isBoss && BOSS_IMMUNE.includes(id) && id !== 'taunt') return false;
  // 도발은 자기 자신에게 거는 상태 — 보스 면역은 "도발 강제를 무시"(validTargets)로만 처리
  const dur = turns ?? BALANCE.status[id].turns;
  const grace = !!fromSide && fromSide !== unit.side && !TICK_BEFORE_DECREMENT.includes(id);
  const existing = getStatus(unit, id);
  if (existing) {
    // 재적용은 '갱신'이다 — 더 짧은 지속이 덮어써서 남은 턴을 깎으면 안 된다
    existing.turns = Math.max(existing.turns, dur);
    if (grace) existing.grace = true;
    if (power !== undefined) existing.power = power;
    if (ratio !== undefined) existing.ratio = ratio;
  } else {
    unit.statuses.push({ id, turns: dur, power, ratio, grace });
  }
  return true;
}

export function removeStatus(unit, id) {
  const i = unit.statuses.findIndex((s) => s.id === id);
  if (i >= 0) {
    unit.statuses.splice(i, 1);
    if (id === 'shield') unit.shield = 0;
    return true;
  }
  return false;
}

// 정화: 디버프 전부 해제. 해제된 id 목록 반환
export function cleanseDebuffs(unit) {
  const removed = unit.statuses.filter((s) => STATUSES[s.id].kind === 'debuff').map((s) => s.id);
  for (const id of removed) removeStatus(unit, id);
  return removed;
}

// ----- 유효 스탯 (버프·디버프·패시브 반영, 최종 정수) -----

function teamHasPassive(state, side, passiveId) {
  return state.units.some((u) => u.side === side && u.alive && u.passive === passiveId);
}

export function effectiveStat(state, unit, key) {
  let mult = 1;
  const P = BALANCE.passives;
  if (key === 'atk' || key === 'mag') {
    const up = getStatus(unit, 'atkUp');
    if (up) mult += up.ratio ?? BALANCE.status.atkUp.ratio;
    const down = getStatus(unit, 'atkDown');
    if (down) mult += down.ratio ?? BALANCE.status.atkDown.ratio;
    if (key === 'atk' && unit.passive === 'c11_p' && unit.hp <= unit.stats.maxHp * P.c11_p.hpThreshold) mult += P.c11_p.atkBonusLowHp;
    if (teamHasPassive(state, unit.side, 'hero_s_p')) mult += P.hero_s_p.teamAtkMagBonus;
  } else if (key === 'def') {
    const iw = getStatus(unit, 'ironwall');
    if (iw) mult += iw.ratio ?? BALANCE.status.ironwall.ratio;
    const dd = getStatus(unit, 'defDown');
    if (dd) mult += dd.ratio ?? BALANCE.status.defDown.ratio;
  } else if (key === 'spd') {
    const sl = getStatus(unit, 'slow');
    if (sl) mult += sl.ratio ?? BALANCE.status.slow.ratio;
    const hs = getStatus(unit, 'haste');
    if (hs) mult += hs.ratio ?? BALANCE.status.haste.ratio;
    if (unit.passive === 'c06_p' && unit.side === 'ally') {
      // 바람걸음: 전투 시작 후 3턴
      if (state.turn <= P.c06_p.turns) mult += P.c06_p.spdBonus;
    }
  }
  return Math.max(0, Math.round(unit.stats[key] * mult));
}

// ----- 데미지 계산 -----

export function elementMult(atkEl, defEl) {
  const beats = BALANCE.element.beats;
  if (beats[atkEl] === defEl) return BALANCE.element.advantage;
  if (beats[defEl] === atkEl) return BALANCE.element.disadvantage;
  return BALANCE.element.neutral;
}

export function critChance(state, attacker, defender) {
  if (attacker.side === 'enemy' && !BALANCE.crit.enemyCanCrit) return 0;
  const c = attacker.stats.critBase
    + (effectiveStat(state, attacker, 'spd') - effectiveStat(state, defender, 'spd')) * BALANCE.crit.perSpeedDiff;
  return Math.min(BALANCE.crit.max, Math.max(BALANCE.crit.min, c));
}

function lowestHpRatioAlly(state, side) {
  const list = livingUnits(state, side);
  if (!list.length) return null;
  return list.reduce((m, u) => (u.hp / u.stats.maxHp < m.hp / m.stats.maxHp ? u : m));
}

// postDefCoef: 계수를 **방어 차감 뒤에** 곱한다 (연계 협공 전용 — 작업계획.md 2부 §3-3).
//   (공격 × 55%) − 방어  → 저계수라 방어에 다 먹혀 1~2로 죽는다. 레벨이 올라도 개선되지 않는다.
//   (공격 − 방어) × 55%  → 본 공격의 55%가 그대로 보장되고 레벨이 올라도 비율이 유지된다.
export function computeDamage(state, attacker, defender, { coef = 1.0, crit = false, magic = false, element, postDefCoef = false } = {}) {
  const P = BALANCE.passives;
  const atkStat = effectiveStat(state, attacker, magic ? 'mag' : 'atk');
  const defStat = effectiveStat(state, defender, magic ? 'mag' : 'def');
  const atkEl = element ?? attacker.element;

  let value = atkStat * (postDefCoef ? 1 : coef);          // 계수 (협공은 방어 차감 뒤로 미룸)
  value *= elementMult(atkEl, defender.element);           // 상성

  // 가하는 피해 패시브 배율
  let dealt = 1;
  if (attacker.passive === 'c02_p' && magic && defender.statuses.some((s) => STATUSES[s.id].kind === 'debuff')) dealt += P.c02_p.vsDebuffedMagic;
  if (attacker.passive === 'c05_p' && getStatus(defender, 'burn')) dealt += P.c05_p.vsBurning;
  if (attacker.passive === 'c12_p' && getStatus(defender, 'slow')) dealt += P.c12_p.vsSlowed;
  if (attacker.passive === 'c10_p' && defender.element === 'dark') dealt += P.c10_p.vsDark;
  if (attacker.passive === 'c07_p' && effectiveStat(state, attacker, 'spd') > effectiveStat(state, defender, 'spd')) dealt += P.c07_p.vsSlower;
  value *= dealt;

  if (crit) value *= BALANCE.crit.multiplier;              // 치명
  value -= defStat;                                        // 방어 차감
  if (postDefCoef) value *= coef;                          // 협공: 방어를 뺀 뒤에 계수

  // 받는 피해 감소 (방어 차감 후 곱연산)
  let recv = 1;
  if (defender.passive === 'c14_p' && !magic) recv -= P.c14_p.physCut;
  if (defender.passive === 'c15_p') recv -= P.c15_p.dmgCut;
  if (teamHasPassive(state, defender.side, 'c01_p') && lowestHpRatioAlly(state, defender.side) === defender) recv -= P.c01_p.lowestAllyDmgCut;
  value *= recv;

  // 최소 보장도 같은 계수를 따른다 — 그래야 "협공은 본 공격의 N%"라는 약속이 바닥에서도 지켜진다
  const minGuarantee = atkStat * BALANCE.damage.minGuaranteeRatio * (postDefCoef ? coef : 1);
  return Math.max(BALANCE.damage.floor, Math.round(Math.max(value, minGuarantee)));
}

// 피해 적용: 보호막 흡수 → 기적(세라핀) → 사망. 결과 반환
function applyDamage(state, unit, dmg) {
  let remaining = dmg;
  let absorbed = 0;
  if (unit.shield > 0) {
    absorbed = Math.min(unit.shield, remaining);
    unit.shield -= absorbed;
    remaining -= absorbed;
    if (unit.shield === 0) removeStatus(unit, 'shield');
  }
  let miracle = false;
  if (unit.hp - remaining <= 0) {
    const savior = state.units.find((u) => u.side === unit.side && u.alive
      && u.passive === 'c03_p' && !u.miracleUsed && u !== unit);
    if (savior) {
      savior.miracleUsed = true;
      unit.hp = 1;
      miracle = true;
    } else {
      unit.hp = 0;
      unit.alive = false;
      if (unit.side === 'ally') {
        state.allyDeaths++;
        for (const u of state.units) {           // 분노 — 아군이 쓰러지면 여명이 크게 차오른다
          if (u.side === 'ally' && u !== unit) chargeSacred(u, BALANCE.sacred.chargeAllyDown);
        }
      }
    }
  } else {
    unit.hp -= remaining;
  }
  return { absorbed, miracle, died: !unit.alive };
}

// ----- 대상 규칙 (도발·은신 — 기획서 §6) -----

const opposite = (side) => (side === 'ally' ? 'enemy' : 'ally');

export function validTargets(state, caster, skill) {
  const foes = livingUnits(state, opposite(caster.side));
  const friends = livingUnits(state, caster.side);
  switch (skill.target) {
    case 'enemy':
    case 'enemies2': {
      let list = foes.filter((t) => !getStatus(t, 'stealth')); // 은신: 단일 지정 불가
      const taunters = list.filter((t) => getStatus(t, 'taunt'));
      if (taunters.length && !caster.isBoss) list = taunters;  // 도발 강제 (보스는 면역)
      return list.length ? list : foes;                        // 전원 은신 등 극단 상황 방지
    }
    case 'enemiesAll': return foes;                            // 광역은 은신 무시
    case 'ally': return friends;
    case 'alliesAll': return friends;
    case 'self': return [caster];
    default: return [];
  }
}

function resolveTargets(state, caster, skill, primary) {
  const foes = livingUnits(state, opposite(caster.side));
  switch (skill.target) {
    case 'enemy': case 'ally': return [primary];
    case 'enemies2': {
      const others = foes.filter((t) => t !== primary);
      if (!others.length) return [primary];
      const second = others.reduce((m, u) => (u.hp < m.hp ? u : m)); // HP 최저 (기획서 §6)
      return [primary, second];
    }
    case 'enemiesAll': return foes;
    case 'alliesAll': return livingUnits(state, caster.side);
    case 'self': return [caster];
    default: return [];
  }
}

// ----- 사용 가능 검사 -----

export function canUseSkill(state, unit, skillId) {
  if (!unit.alive || isStunned(unit) || state.winner) return false;
  const skill = getSkill(unit, skillId);
  if (!skill) return false;
  if (skill.kind !== 'basic' && isBound(unit)) return false;   // 속박: 일반공격만
  if ((unit.cooldowns[skillId] ?? 0) > 0) return false;
  if (skill.kind === 'sacred' && (unit.sacredGauge ?? 0) < BALANCE.sacred.gaugeMax) return false; // 여명 만충 시만
  return validTargets(state, unit, skill).length > 0;
}

// ----- 연계 협공 (기획서 §6) -----

export function assistFor(state, attacker, target) {
  const f = state.focus;
  if (!f || f.targetId !== target.id) return null;
  const helper = getUnit(state, f.attackerId);
  if (!helper || !helper.alive || helper === attacker || helper.side !== attacker.side) return null;
  if (state.difficulty === 'easy' && attacker.side === 'enemy') return null; // 이지: 적 연계 없음
  return helper;
}

function assistCoefOf(state, helper, target) {
  const P = BALANCE.passives;
  let coef = BALANCE.assist.power + effectiveStat(state, helper, 'spd') * BALANCE.assist.speedBonusPerPoint;
  let bonus = 0;
  if (helper.passive === 'hero_a_p') bonus += P.hero_a_p.assistBonus;
  if (helper.passive === 'c13_p') bonus += P.c13_p.assistBonus;
  coef *= 1 + bonus;
  if (getStatus(target, 'mark')) coef *= BALANCE.status.mark.assistMult; // 표식 2배
  return coef;
}

// ----- 스킬 실행 (일반공격 포함 — 단일 관문) -----

function pushDeath(state, events, unit) {
  events.push({ type: 'death', unit: unit.id });
}

function dealHit(state, events, attacker, target, { coef, crit, magic, fx }) {
  const dmg = computeDamage(state, attacker, target, { coef, crit, magic });
  const r = applyDamage(state, target, dmg);
  state.dmgDealt[attacker.id] = (state.dmgDealt[attacker.id] ?? 0) + dmg;
  if (attacker.side !== target.side) chargeSacred(target, BALANCE.sacred.chargeHit);
  events.push({
    type: 'hit', attacker: attacker.id, target: target.id,
    dmg, crit, absorbed: r.absorbed, hpAfter: target.hp, shieldAfter: target.shield, fx,
  });
  if (r.miracle) events.push({ type: 'miracle', unit: target.id });
  if (r.died) pushDeath(state, events, target);
  return r;
}

export function executeSkill(state, casterId, skillId, primaryId = null) {
  const caster = getUnit(state, casterId);
  const skill = caster ? getSkill(caster, skillId) : null;
  if (!caster || !skill || !canUseSkill(state, caster, skillId)) {
    throw new RangeError('유효하지 않은 스킬 사용입니다.');
  }
  const nums = BALANCE.skills[skillId] ?? {};
  const needPrimary = ['enemy', 'enemies2', 'ally'].includes(skill.target);
  let primary = needPrimary ? getUnit(state, primaryId) : null;
  if (needPrimary && (!primary || !validTargets(state, caster, skill).includes(primary))) {
    throw new RangeError('유효하지 않은 대상입니다.');
  }

  const events = [];
  events.push({ type: 'skill', caster: caster.id, skillId, name: skill.name, kind: skill.kind, melee: !!skill.melee, primary: primary?.id ?? null, fx: skill.fx });

  // HP 소모 시전 (세라핀 — 전투불능 불가, 최소 1)
  if (skill.selfHpCost && nums.selfHpCostPct) {
    const cost = Math.round(caster.stats.maxHp * nums.selfHpCostPct);
    const actual = Math.min(cost, caster.hp - BALANCE.passives.c03_special.minHpFromCost);
    if (actual > 0) {
      caster.hp -= actual;
      events.push({ type: 'hpCost', unit: caster.id, amount: actual, hpAfter: caster.hp });
    }
  }

  const targets = resolveTargets(state, caster, skill, primary);
  // 처치 트리거 패시브는 **실제로 막타를 넣은 유닛**에게 귀속한다.
  // 협공·반격이 마무리한 경우 시전자가 아니라 그 협공자·반격자가 받아야 한다.
  const killers = [];

  for (const T of targets) {
    if (skill.dmg && T.alive) {
      const hits = nums.hits ?? 1;
      for (let h = 0; h < hits && T.alive; h++) {
        // 조건 치명 확정(급소 찌르기) → 아니면 시드 판정 (다단히트는 히트별 판정)
        const forced = skill.condCrit && nums.condCritHpPct !== undefined && T.hp <= T.stats.maxHp * nums.condCritHpPct;
        const crit = forced || state.rng.chance(critChance(state, caster, T));
        const r = dealHit(state, events, caster, T, { coef: nums.coef ?? 1, crit, magic: !!skill.magic, fx: skill.fx });
        if (r.died) killers.push(caster);
      }
    }
    if (skill.heal && T.alive) {
      let base = effectiveStat(state, caster, 'mag') * (nums.coef ?? 1);
      if (caster.passive === 'c08_p' && T.hp <= T.stats.maxHp * BALANCE.passives.c08_p.hpThreshold) base *= 1 + BALANCE.passives.c08_p.healBonusLowHp;
      const amount = Math.round(base);
      T.hp = Math.min(T.stats.maxHp, T.hp + amount);
      events.push({ type: 'heal', caster: caster.id, target: T.id, amount, hpAfter: T.hp, fx: skill.fx });
    }
    if (skill.cleanse && T.alive) {
      const removed = cleanseDebuffs(T);
      if (removed.length) events.push({ type: 'cleanse', target: T.id, removed });
    }
    if (skill.shield && T.alive) {
      const amount = Math.round(effectiveStat(state, caster, nums.shieldStat ?? 'mag') * (nums.shieldRatio ?? BALANCE.status.shield.ratio));
      // 재부여는 **더 큰 쪽으로**. 대입하면 남아 있던 더 큰 보호막이 증발한다
      // (도르간 패시브 120% 위에 본인 A1 100%를 쓰면 방어 스킬이 방어력을 깎았다)
      T.shield = Math.max(T.shield, amount);
      applyStatus(state, T, 'shield', { fromSide: caster.side });
      events.push({ type: 'shieldGain', target: T.id, amount, total: T.shield });
    }
    if (skill.cdr && T.alive && nums.cdr) {
      for (const id of Object.keys(T.cooldowns)) T.cooldowns[id] = Math.max(0, T.cooldowns[id] - nums.cdr);
      events.push({ type: 'cdr', target: T.id, amount: nums.cdr });
    }
    if (skill.debuffs && T.alive) {
      for (const id of skill.debuffs) {
        const power = id === 'burn'
          ? Math.round(Math.max(effectiveStat(state, caster, 'atk'), effectiveStat(state, caster, 'mag')) * BALANCE.status.burn.dotRatio)
          : undefined;
        const ok = applyStatus(state, T, id, { power, turns: nums.debuffTurns, fromSide: caster.side });
        events.push({ type: 'status', target: T.id, statusId: id, applied: ok });
      }
    }
    if (skill.buffs && T.alive) {
      for (const id of skill.buffs) {
        const power = id === 'regen'
          ? Math.round(effectiveStat(state, caster, 'mag') * BALANCE.status.regen.ratio)
          : undefined;
        applyStatus(state, T, id, { power, fromSide: caster.side });
        events.push({ type: 'status', target: T.id, statusId: id, applied: true });
      }
    }
  }

  if (skill.selfBuffs) {
    for (const id of skill.selfBuffs) {
      // selfBuffTurns: 스킬별 지속 오버라이드 (debuffTurns와 대칭 — 브란 방벽 2턴 등)
      applyStatus(state, caster, id, { turns: nums.selfBuffTurns, fromSide: caster.side });
      events.push({ type: 'status', target: caster.id, statusId: id, applied: true });
    }
  }
  if (skill.selfDefDown && nums.selfDefDownRatio) {
    applyStatus(state, caster, 'defDown', { ratio: -nums.selfDefDownRatio, turns: nums.selfDefDownTurns });
    events.push({ type: 'status', target: caster.id, statusId: 'defDown', applied: true });
  }

  // 연계 협공: 적 단일 데미지 공격만 트리거·갱신 (DECISIONS.md)
  if (skill.dmg && skill.target === 'enemy' && primary) {
    if (primary.alive) {
      const helper = assistFor(state, caster, primary);
      if (helper) {
        const basicSkill = SKILLS[helper.skills.basic];
        const coef = assistCoefOf(state, helper, primary);
        const dmg = computeDamage(state, helper, primary, { coef, magic: !!basicSkill.magic, postDefCoef: true });
        const r = applyDamage(state, primary, dmg);
        state.dmgDealt[helper.id] = (state.dmgDealt[helper.id] ?? 0) + dmg;
        chargeSacred(helper, BALANCE.sacred.chargeAssist);
        if (helper.side !== primary.side) chargeSacred(primary, BALANCE.sacred.chargeHit);
        events.push({ type: 'assist', attacker: helper.id, target: primary.id, dmg, absorbed: r.absorbed, hpAfter: primary.hp, shieldAfter: primary.shield });
        if (r.miracle) events.push({ type: 'miracle', unit: primary.id });
        if (r.died) { pushDeath(state, events, primary); killers.push(helper); }
      }
    }
    state.focus = primary.alive ? { targetId: primary.id, attackerId: caster.id } : null;

    // 반격: 일반공격 피격 후 생존 시 (스킬·협공 피격은 반격 불가. 기절 중엔 반격 불가)
    if (skill.kind === 'basic' && primary.alive && !isStunned(primary)) {
      const counterBasic = SKILLS[primary.skills.basic];
      // 반격에는 치명이 없다 — 아군만 치명이 터지면 "가만히 있어도 적이 녹는" 비대칭이 된다
      // (작업계획.md 2부 §3-2 A안: 위력 하향 + 좌우 대칭)
      const cCrit = BALANCE.counter.canCrit && state.rng.chance(critChance(state, primary, caster));
      const cdm = computeDamage(state, primary, caster, { coef: BALANCE.counter.power, crit: cCrit, magic: !!counterBasic.magic });
      const r = applyDamage(state, caster, cdm);
      state.dmgDealt[primary.id] = (state.dmgDealt[primary.id] ?? 0) + cdm;
      if (primary.side !== caster.side) chargeSacred(caster, BALANCE.sacred.chargeHit);
      events.push({ type: 'counter', attacker: primary.id, target: caster.id, dmg: cdm, crit: cCrit, absorbed: r.absorbed, hpAfter: caster.hp, shieldAfter: caster.shield });
      if (r.miracle) events.push({ type: 'miracle', unit: caster.id });
      if (r.died) { pushDeath(state, events, caster); killers.push(primary); }
    }
  }

  // 쿨타임 등록
  if (skill.kind !== 'basic' && nums.cool) caster.cooldowns[skillId] = nums.cool;

  // 여명 게이지: 성물 사용은 게이지 소모, 그 외 행동은 충전
  if (skill.kind === 'sacred') caster.sacredGauge = 0;
  else chargeSacred(caster, BALANCE.sacred.chargeAct);

  // 처치 트리거 패시브 — 막타를 넣은 유닛에게. 한 번에 여러 명을 죽여도 유닛당 1회.
  const credited = new Set();
  for (const killer of killers) {
    if (!killer.alive || credited.has(killer.id)) continue;
    credited.add(killer.id);
    if (killer.passive === 'c04_p') {
      applyStatus(state, killer, 'stealth', { fromSide: killer.side });
      events.push({ type: 'status', target: killer.id, statusId: 'stealth', applied: true });
    }
    if (killer.passive === 'hero_m_p') {
      for (const id of Object.keys(killer.cooldowns)) {
        killer.cooldowns[id] = Math.max(0, killer.cooldowns[id] - BALANCE.passives.hero_m_p.onKillCdr);
      }
      events.push({ type: 'cdr', target: killer.id, amount: BALANCE.passives.hero_m_p.onKillCdr });
    }
  }

  state.winner = checkWinner(state);
  return events;
}

// M2 호환: 일반공격 = 기본 스킬 실행
export function executeAttack(state, attackerId, targetId) {
  const attacker = getUnit(state, attackerId);
  return executeSkill(state, attackerId, attacker.skills.basic, targetId);
}

export function attackTargets(state, attacker) {
  return validTargets(state, attacker, SKILLS[attacker.skills.basic]);
}

// ----- 예상 결과 (UI용 — 실제 계산과 동일 함수) -----

export function previewSkill(state, caster, skillId, primaryId = null) {
  const skill = getSkill(caster, skillId);
  const nums = BALANCE.skills[skillId] ?? {};
  const primary = primaryId ? getUnit(state, primaryId) : null;
  // 단일 대상 스킬인데 대상이 아직 없으면 빈 미리보기 (UI 방어)
  if (['enemy', 'enemies2', 'ally'].includes(skill.target) && (!primary || !primary.alive)) {
    return { skill, perTarget: [], assist: null, counter: null, selfCost: 0, critChance: 0, elemMult: 1 };
  }
  const targets = resolveTargets(state, caster, skill, primary);
  const perTarget = [];
  for (const T of targets) {
    if (skill.dmg) {
      const hits = nums.hits ?? 1;
      // 조건 치명 확정(급소 찌르기)은 결정론적 — 예상치도 확정 치명으로 계산 (저RNG 원칙)
      const forced = skill.condCrit && nums.condCritHpPct !== undefined && T.hp <= T.stats.maxHp * nums.condCritHpPct;
      const dmg = computeDamage(state, caster, T, { coef: nums.coef ?? 1, crit: forced, magic: !!skill.magic }) * hits;
      const critDmg = computeDamage(state, caster, T, { coef: nums.coef ?? 1, crit: true, magic: !!skill.magic }) * hits;
      perTarget.push({ unit: T, dmg, critDmg, kill: dmg >= T.hp + T.shield, forcedCrit: forced });
    } else if (skill.heal) {
      let base = effectiveStat(state, caster, 'mag') * (nums.coef ?? 1);
      if (caster.passive === 'c08_p' && T.hp <= T.stats.maxHp * BALANCE.passives.c08_p.hpThreshold) base *= 1 + BALANCE.passives.c08_p.healBonusLowHp;
      perTarget.push({ unit: T, heal: Math.round(base) });
    } else if (skill.shield) {
      // 실제 적용과 같은 규칙(더 큰 쪽) — 남은 보호막이 더 크면 그대로 유지된다
      const raw = Math.round(effectiveStat(state, caster, 'mag') * (nums.shieldRatio ?? BALANCE.status.shield.ratio));
      perTarget.push({ unit: T, shieldGain: Math.max(T.shield, raw) });
    } else {
      perTarget.push({ unit: T });
    }
  }
  // 협공·반격 예상 (적 단일 데미지 공격만)
  let assist = null;
  let counter = null;
  if (skill.dmg && skill.target === 'enemy' && primary) {
    // ★이번 스킬이 부여할 디버프를 **가적용**하고 계산한다 (2026-08-05 감사).
    //   실행 순서가 본타 → 디버프 → 협공·반격이라, 실제 협공은 표식(×2)·방어 약화가
    //   붙은 대상을 때리고 실제 반격은 공격 약화가 붙은 채로 나온다. 가적용 없이
    //   현재 상태로 계산하면 협공은 최대 2배 과소, 반격은 과대 표시된다.
    //   디버프는 확률 없이 확정 적용이므로 예상에 넣어도 거짓말이 아니다.
    //   statuses 배열만 복제해 바꿨다가 원본 참조로 되돌린다 (applyStatus는
    //   디버프에 대해 statuses 외의 필드를 건드리지 않는다).
    const savedStatuses = primary.statuses;
    if (skill.debuffs?.length) {
      primary.statuses = savedStatuses.map((s) => ({ ...s }));
      for (const id of skill.debuffs) {
        applyStatus(state, primary, id, { turns: nums.debuffTurns, fromSide: caster.side });
      }
    }
    const helper = assistFor(state, caster, primary);
    if (helper) {
      const basicSkill = SKILLS[helper.skills.basic];
      assist = { unit: helper, dmg: computeDamage(state, helper, primary, { coef: assistCoefOf(state, helper, primary), magic: !!basicSkill.magic, postDefCoef: true }) };
    }
    const total = (perTarget[0]?.dmg ?? 0) + (assist?.dmg ?? 0);
    // 협공은 치명·RNG가 없는 결정론적 피해다 — 처치(☠) 판정에 반드시 포함한다.
    // (같은 함수의 반격 예상은 이미 합계를 쓰고 있었다)
    if (assist && perTarget[0]) {
      const soloKill = perTarget[0].kill;
      perTarget[0].kill = total >= primary.hp + primary.shield;
      perTarget[0].killByAssist = perTarget[0].kill && !soloKill;
    }
    // 가적용 덕에 기절을 먹이는 스킬은 반격 예상도 자연히 사라진다 (실행과 동일)
    if (skill.kind === 'basic' && total < primary.hp + primary.shield && !isStunned(primary)) {
      const counterBasic = SKILLS[primary.skills.basic];
      counter = { dmg: computeDamage(state, primary, caster, { coef: BALANCE.counter.power, magic: !!counterBasic.magic }) };
    }
    primary.statuses = savedStatuses;   // 원복 — 예상은 상태를 남기지 않는다
  }
  // 실제 실행과 같은 클램프 (세라핀 특칙: 이 소모로는 전투불능이 되지 않는다)
  const rawCost = skill.selfHpCost && nums.selfHpCostPct ? Math.round(caster.stats.maxHp * nums.selfHpCostPct) : 0;
  const selfCost = rawCost
    ? Math.max(0, Math.min(rawCost, caster.hp - BALANCE.passives.c03_special.minHpFromCost))
    : 0;
  // 광역기는 primary가 없다 — 첫 대상을 기준으로 삼아야 치명 확률·상성이 표시된다
  const ref = primary ?? perTarget[0]?.unit ?? null;
  return {
    skill, perTarget, assist, counter, selfCost,
    forcedCrit: !!perTarget[0]?.forcedCrit,   // 확정 치명은 확률이 아니라 '확정'으로 표시 (기획서 §6)
    critChance: skill.dmg && ref ? critChance(state, caster, ref) : 0,
    elemMult: skill.dmg && ref ? elementMult(caster.element, ref.element) : 1,
  };
}

// ----- 승패·별점 -----

export function checkWinner(state) {
  const allyAlive = state.units.some((u) => u.side === 'ally' && u.alive);
  if (!allyAlive) return 'enemy';
  const v = state.victory;
  if (v.type === 'boss') {
    const bosses = state.units.filter((u) => u.side === 'enemy' && u.isBoss);
    if (bosses.length && bosses.every((b) => !b.alive)) return 'ally';
  }
  const enemyAlive = state.units.some((u) => u.side === 'enemy' && u.alive);
  if (!enemyAlive) return 'ally';
  return null;
}

// 별점: ★클리어 / ★아군 전투불능 없음 / ★N턴 이내 (기획서 §6)
export function computeStars(state) {
  if (state.winner !== 'ally') return 0;
  let stars = 1;
  if (state.allyDeaths === 0) stars++;
  // 버티기 승리는 startPlayerPhase의 turn++ **직후에** 판정되므로 턴이 1 크게 잡혀 있다.
  // 단, 버티기 스테이지라도 **적을 전멸시켜** 이기면 보정 없이 실제 턴을 쓴다 —
  // victory.type으로 가르면 전멸 승리가 1턴 할인을 받는 오프바이원이 된다 (2026-08-05 감사).
  const effectiveTurn = state.wonBySurvive ? state.turn - 1 : state.turn;
  if (effectiveTurn <= state.starTurns) stars++;
  return stars;
}

// ----- 팀 턴 진행 (틱: 도트·재생 발동 → 지속 감소 → 쿨 감소) -----

function tickTeam(state, side) {
  const events = [];
  for (const u of livingUnits(state, side)) {
    const burn = getStatus(u, 'burn');
    if (burn && burn.power) {
      const r = applyDamage(state, u, burn.power);
      events.push({ type: 'dot', unit: u.id, statusId: 'burn', dmg: burn.power, absorbed: r.absorbed, hpAfter: u.hp, shieldAfter: u.shield });
      if (r.miracle) events.push({ type: 'miracle', unit: u.id });
      if (r.died) { pushDeath(state, events, u); continue; }
    }
    const regen = getStatus(u, 'regen');
    if (regen && regen.power && u.alive) {
      u.hp = Math.min(u.stats.maxHp, u.hp + regen.power);
      events.push({ type: 'regen', unit: u.id, amount: regen.power, hpAfter: u.hp });
    }
    // 지속 1 감소·만료
    for (const s of [...u.statuses]) {
      // 상대가 건 상태의 **첫 감소는 건너뛴다** — 이 틱은 피해자가 아직 행동하기 전이다
      if (s.grace) { s.grace = false; continue; }
      s.turns--;
      if (s.turns <= 0) {
        removeStatus(u, s.id);
        events.push({ type: 'statusExpire', unit: u.id, statusId: s.id });
      }
    }
    // 쿨타임 1 감소 (팀 턴 시작마다)
    for (const id of Object.keys(u.cooldowns)) u.cooldowns[id] = Math.max(0, u.cooldowns[id] - 1);
  }
  state.winner = state.winner ?? checkWinner(state);
  return events;
}

export function endPlayerPhase(state) {
  state.phase = 'enemy';
  state.focus = null;                  // 연계는 팀 턴 안에서만
  for (const u of state.units) if (u.side === 'enemy') u.acted = false;
  return tickTeam(state, 'enemy');
}

export function startPlayerPhase(state) {
  state.phase = 'player';
  state.turn++;
  state.focus = null;
  for (const u of state.units) if (u.side === 'ally') u.acted = false;
  // N턴 버티기: N턴을 마치고 살아 있으면 승리
  if (!state.winner && state.victory.type === 'survive' && state.turn > state.victory.turns) {
    state.winner = 'ally';
    state.wonBySurvive = true;   // 별점 턴 보정용 — 전멸 승리와 구분 (computeStars)
    return [];
  }
  return tickTeam(state, 'ally');
}
