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
import { ENEMIES } from '../data/enemies.js';
import { STAGES } from '../data/stages.js';

// ----- 스탯 계산 -----

export function computeAllyStats(def, level, { limitBreak = 0, awaken = 0 } = {}) {
  const table = def.isHero ? BALANCE.heroStats[def.heroClass] : BALANCE.classStats[def.classKey];
  const mult = (def.isHero ? 1 : BALANCE.gradeMult[def.grade])
    * (1 + limitBreak * BALANCE.limitBreak.perStep)
    * (1 + awaken * BALANCE.awaken.perStep);
  const stat = ([base, growth]) => Math.round((base + growth * (level - 1)) * mult);
  const critBase = def.isHero
    ? BALANCE.crit.heroBase[def.heroClass]
    : BALANCE.crit.classBase[def.classKey];
  return {
    maxHp: stat(table.hp), atk: stat(table.atk), mag: stat(table.mag),
    def: stat(table.def), spd: stat(table.spd), critBase,
  };
}

export function computeEnemyStats(def, level, difficulty = 'normal') {
  const table = BALANCE.enemyStats[def.id];
  const hard = difficulty === 'hard' ? BALANCE.difficulty.hardEnemyStatMult : 1;
  const stat = ([base, growth]) => Math.round((base + growth * (level - 1)) * hard);
  return {
    maxHp: stat(table.hp), atk: stat(table.atk), mag: stat(table.mag),
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
  };
}

// allies/enemies: [{ def, level, slot, name?, boss? }] — def는 resolve된 정의
export function createBattle({ seed, allies, enemies, victory, starTurns, difficulty = 'normal' }) {
  const units = [];
  let nextId = 1;
  for (const a of allies) {
    units.push(makeUnit({
      id: `a${nextId++}`, side: 'ally', slot: a.slot,
      defId: a.def.id, name: a.name ?? a.def.name, spriteCfg: a.def.spriteCfg,
      element: a.def.element, level: a.level, isBoss: false,
      classKey: a.def.isHero ? a.def.heroClass : a.def.classKey,
      skills: a.def.skills, passive: a.def.passive, ai: null,
      stats: computeAllyStats(a.def, a.level, a),
    }));
  }
  for (const e of enemies) {
    units.push(makeUnit({
      id: `e${nextId++}`, side: 'enemy', slot: e.slot,
      defId: e.def.id, name: e.def.name, spriteCfg: e.def.spriteCfg,
      element: e.def.element, level: e.level, isBoss: !!e.boss,
      classKey: null,
      skills: e.def.skills, passive: null, ai: e.def.ai,
      stats: computeEnemyStats(e.def, e.level, difficulty),
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
  };
  // 전투 시작 패시브: 도르간 굳건한 대지 — 시작 보호막
  for (const u of units) {
    if (u.passive === 'c09_p') {
      u.shield = Math.round(u.stats.mag * BALANCE.passives.c09_p.startShieldRatio);
      applyStatus(state, u, 'shield');
    }
  }
  return state;
}

// 스테이지 데이터로 전투 조립 — 씬·시뮬레이터·치트 콘솔 공용 진입점
export function createBattleFromStage(stageId, { seed, partyIds, heroClass = 'sword', heroName, difficulty = 'normal' } = {}) {
  const stage = STAGES[stageId];
  const resolveAlly = (characterId, slot) => {
    const c = CHARACTERS[characterId];
    const def = c.isHero ? { ...c, heroClass, ...HERO_KITS[heroClass] } : c;
    return { def, level: stage.level, slot, name: c.isHero ? heroName : undefined };
  };
  const allies = partyIds
    ? partyIds.map((cid, i) => resolveAlly(cid, i))
    : stage.allies.map((a) => resolveAlly(a.characterId, a.slot));
  const enemies = stage.enemies.map((e) => ({
    def: ENEMIES[e.enemyId], level: e.level ?? stage.level, slot: e.slot, boss: e.boss,
  }));
  return createBattle({
    seed: seed ?? `stage-${stageId}`,
    allies, enemies,
    victory: stage.victory, starTurns: stage.starTurns, difficulty,
  });
}

export function getUnit(state, id) { return state.units.find((u) => u.id === id); }

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

// 동명 중첩 불가·재적용 갱신. 보스는 기절·속박·도발 면역. 반환: 적용 여부
export function applyStatus(state, unit, id, { power, ratio, turns } = {}) {
  if (!unit.alive) return false;
  if (unit.isBoss && BOSS_IMMUNE.includes(id) && id !== 'taunt') return false;
  // 기절·속박은 피해자 팀 턴 시작 틱에서 1 감소하므로, 온전한 1턴을 봉쇄하려면 +1 (DECISIONS.md)
  const control = id === 'stun' || id === 'bind';
  const dur = (turns ?? BALANCE.status[id].turns) + (control ? 1 : 0);
  // 도발은 자기 자신에게 거는 상태 — 보스 면역은 "도발 강제를 무시"(validTargets)로만 처리
  const existing = getStatus(unit, id);
  if (existing) {
    existing.turns = dur;
    if (power !== undefined) existing.power = power;
    if (ratio !== undefined) existing.ratio = ratio;
  } else {
    unit.statuses.push({ id, turns: dur, power, ratio });
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

export function computeDamage(state, attacker, defender, { coef = 1.0, crit = false, magic = false, element } = {}) {
  const P = BALANCE.passives;
  const atkStat = effectiveStat(state, attacker, magic ? 'mag' : 'atk');
  const defStat = effectiveStat(state, defender, magic ? 'mag' : 'def');
  const atkEl = element ?? attacker.element;

  let value = atkStat * coef;                              // 계수
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

  // 받는 피해 감소 (방어 차감 후 곱연산)
  let recv = 1;
  if (defender.passive === 'c14_p' && !magic) recv -= P.c14_p.physCut;
  if (defender.passive === 'c15_p') recv -= P.c15_p.dmgCut;
  if (teamHasPassive(state, defender.side, 'c01_p') && lowestHpRatioAlly(state, defender.side) === defender) recv -= P.c01_p.lowestAllyDmgCut;
  value *= recv;

  const minGuarantee = atkStat * BALANCE.damage.minGuaranteeRatio; // 최소 보장
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
      if (unit.side === 'ally') state.allyDeaths++;
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
  let killedAny = false;

  for (const T of targets) {
    if (skill.dmg && T.alive) {
      const hits = nums.hits ?? 1;
      for (let h = 0; h < hits && T.alive; h++) {
        // 조건 치명 확정(급소 찌르기) → 아니면 시드 판정 (다단히트는 히트별 판정)
        const forced = skill.condCrit && nums.condCritHpPct !== undefined && T.hp <= T.stats.maxHp * nums.condCritHpPct;
        const crit = forced || state.rng.chance(critChance(state, caster, T));
        const r = dealHit(state, events, caster, T, { coef: nums.coef ?? 1, crit, magic: !!skill.magic, fx: skill.fx });
        if (r.died) killedAny = true;
      }
    }
    if (skill.heal && T.alive) {
      let base = effectiveStat(state, caster, 'mag') * (nums.coef ?? 1);
      if (caster.passive === 'c08_p' && T.hp <= T.stats.maxHp * BALANCE.passives.c08_p.hpThreshold) base *= 1 + BALANCE.passives.c08_p.healBonusLowHp;
      const amount = Math.round(base);
      T.hp = Math.min(T.stats.maxHp, T.hp + amount);
      events.push({ type: 'heal', caster: caster.id, target: T.id, amount, hpAfter: T.hp });
    }
    if (skill.cleanse && T.alive) {
      const removed = cleanseDebuffs(T);
      if (removed.length) events.push({ type: 'cleanse', target: T.id, removed });
    }
    if (skill.shield && T.alive) {
      const amount = Math.round(effectiveStat(state, caster, 'mag') * (nums.shieldRatio ?? BALANCE.status.shield.ratio));
      T.shield = amount;
      applyStatus(state, T, 'shield');
      events.push({ type: 'shieldGain', target: T.id, amount });
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
        const ok = applyStatus(state, T, id, { power, turns: nums.debuffTurns });
        events.push({ type: 'status', target: T.id, statusId: id, applied: ok });
      }
    }
    if (skill.buffs && T.alive) {
      for (const id of skill.buffs) {
        const power = id === 'regen'
          ? Math.round(effectiveStat(state, caster, 'mag') * BALANCE.status.regen.ratio)
          : undefined;
        applyStatus(state, T, id, { power });
        events.push({ type: 'status', target: T.id, statusId: id, applied: true });
      }
    }
  }

  if (skill.selfBuffs) {
    for (const id of skill.selfBuffs) {
      applyStatus(state, caster, id);
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
        const dmg = computeDamage(state, helper, primary, { coef, magic: !!basicSkill.magic });
        const r = applyDamage(state, primary, dmg);
        events.push({ type: 'assist', attacker: helper.id, target: primary.id, dmg, hpAfter: primary.hp, shieldAfter: primary.shield });
        if (r.miracle) events.push({ type: 'miracle', unit: primary.id });
        if (r.died) { pushDeath(state, events, primary); killedAny = true; }
      }
    }
    state.focus = primary.alive ? { targetId: primary.id, attackerId: caster.id } : null;

    // 반격: 일반공격 피격 후 생존 시 (스킬·협공 피격은 반격 불가. 기절 중엔 반격 불가)
    if (skill.kind === 'basic' && primary.alive && !isStunned(primary)) {
      const counterBasic = SKILLS[primary.skills.basic];
      const cCrit = state.rng.chance(critChance(state, primary, caster));
      const cdm = computeDamage(state, primary, caster, { coef: BALANCE.counter.power, crit: cCrit, magic: !!counterBasic.magic });
      const r = applyDamage(state, caster, cdm);
      events.push({ type: 'counter', attacker: primary.id, target: caster.id, dmg: cdm, crit: cCrit, hpAfter: caster.hp, shieldAfter: caster.shield });
      if (r.miracle) events.push({ type: 'miracle', unit: caster.id });
      if (r.died) pushDeath(state, events, caster);
    }
  }

  // 쿨타임 등록
  if (skill.kind !== 'basic' && nums.cool) caster.cooldowns[skillId] = nums.cool;

  // 처치 트리거 패시브
  if (killedAny && caster.alive) {
    if (caster.passive === 'c04_p') {
      applyStatus(state, caster, 'stealth');
      events.push({ type: 'status', target: caster.id, statusId: 'stealth', applied: true });
    }
    if (caster.passive === 'hero_m_p') {
      for (const id of Object.keys(caster.cooldowns)) {
        caster.cooldowns[id] = Math.max(0, caster.cooldowns[id] - BALANCE.passives.hero_m_p.onKillCdr);
      }
      events.push({ type: 'cdr', target: caster.id, amount: BALANCE.passives.hero_m_p.onKillCdr });
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
      perTarget.push({ unit: T, shieldGain: Math.round(effectiveStat(state, caster, 'mag') * (nums.shieldRatio ?? BALANCE.status.shield.ratio)) });
    } else {
      perTarget.push({ unit: T });
    }
  }
  // 협공·반격 예상 (적 단일 데미지 공격만)
  let assist = null;
  let counter = null;
  if (skill.dmg && skill.target === 'enemy' && primary) {
    const helper = assistFor(state, caster, primary);
    if (helper) {
      const basicSkill = SKILLS[helper.skills.basic];
      assist = { unit: helper, dmg: computeDamage(state, helper, primary, { coef: assistCoefOf(state, helper, primary), magic: !!basicSkill.magic }) };
    }
    const total = (perTarget[0]?.dmg ?? 0) + (assist?.dmg ?? 0);
    if (skill.kind === 'basic' && total < primary.hp + primary.shield && !isStunned(primary)) {
      const counterBasic = SKILLS[primary.skills.basic];
      counter = { dmg: computeDamage(state, primary, caster, { coef: BALANCE.counter.power, magic: !!counterBasic.magic }) };
    }
  }
  const selfCost = skill.selfHpCost && nums.selfHpCostPct ? Math.round(caster.stats.maxHp * nums.selfHpCostPct) : 0;
  return {
    skill, perTarget, assist, counter, selfCost,
    critChance: skill.dmg && primary
      ? (perTarget[0]?.forcedCrit ? 1 : critChance(state, caster, primary))
      : 0,
    elemMult: skill.dmg && primary ? elementMult(caster.element, primary.element) : 1,
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
  const effectiveTurn = state.victory.type === 'survive' ? state.turn - 1 : state.turn;
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
      events.push({ type: 'dot', unit: u.id, statusId: 'burn', dmg: burn.power, hpAfter: u.hp });
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
    return [];
  }
  return tickTeam(state, 'ally');
}
