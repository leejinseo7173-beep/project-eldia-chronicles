// ============================================================
// ai.js — 적 AI 5성향 + 아군 오토 전투 (기획서 §6, §8)
// 렌더 무관 — logic.js의 계약만 사용. 시뮬레이터·오토·소탕이 재사용.
// 적 행동 순서: 지원 → 사수 → 교활 → 수호 → 돌격.
// 타겟 점수식: 처치 가능 +100 / 예상 데미지 ×1 / 상성 유리 +15 / HP 비율 낮음 +20.
// 난이도: 이지 = 타겟 랜덤·적 연계 없음 / 하드 = 집중 공격 (+스탯은 logic에서).
// ============================================================

import { BALANCE } from '../balance.js';
import { SKILLS } from '../data/skills.js';
import * as L from './logic.js';

const SQUISHY_CLASSES = ['mage', 'cleric'];

// ----- 타겟 점수식 -----

function scoreTarget(state, attacker, skill, target) {
  const A = BALANCE.ai;
  const w = A.personality[attacker.ai] ?? A.personality.rush;
  const nums = BALANCE.skills[skill.id] ?? {};
  const dmg = skill.dmg
    ? L.computeDamage(state, attacker, target, { coef: nums.coef ?? 1, magic: !!skill.magic }) * (nums.hits ?? 1)
    : 0;
  let score = 0;
  if (dmg >= target.hp + target.shield) score += A.score.kill * (w.kill ?? 1);
  score += dmg * A.score.dmgWeight * (w.dmg ?? 1);
  if (L.elementMult(attacker.element, target.element) > 1) score += A.score.elemAdvantage * (w.elem ?? 1);
  score += (1 - target.hp / target.stats.maxHp) * A.score.lowHpRatio * (w.lowHp ?? 1);
  if (w.squishyBonus && SQUISHY_CLASSES.includes(target.classKey)) score += w.squishyBonus;
  // 하드: 집중 공격 — 연계 대상 우선
  if (state.difficulty === 'hard' && state.focus && state.focus.targetId === target.id) score += A.hardFocusBonus;
  return score;
}

function pickTarget(state, attacker, skill) {
  const targets = L.validTargets(state, attacker, skill);
  if (!targets.length) return null;
  if (state.difficulty === 'easy' && attacker.side === 'enemy') return state.rng.pick(targets); // 이지: 랜덤
  let best = null;
  for (const t of targets) {
    const s = scoreTarget(state, attacker, skill, t);
    if (!best || s > best.s) best = { t, s };
  }
  return best.t;
}

function usable(state, unit, skillId) {
  return skillId && L.canUseSkill(state, unit, skillId);
}

// ----- 적 행동 결정 -----

function enemyAction(state, unit) {
  const allies = L.livingUnits(state, unit.side);       // 적 입장의 아군 = 몬스터들
  const actives = unit.skills.actives.filter((id) => usable(state, unit, id));

  if (unit.ai === 'support') {
    // 치유 최우선 (60% 이하), 다음 버프
    const healId = actives.find((id) => SKILLS[id].heal);
    if (healId) {
      const wounded = allies.filter((u) => u.hp <= u.stats.maxHp * BALANCE.ai.healThreshold)
        .sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp);
      if (wounded.length) return { skillId: healId, targetId: wounded[0].id };
    }
    const buffId = actives.find((id) => SKILLS[id].buffs);
    if (buffId) {
      const candidate = allies.find((u) => u !== unit && !L.getStatus(u, SKILLS[buffId].buffs[0]));
      if (candidate) return { skillId: buffId, targetId: candidate.id };
    }
  }
  if (unit.ai === 'guard') {
    const tauntId = actives.find((id) => (SKILLS[id].selfBuffs ?? []).includes('taunt'));
    if (tauntId && !L.getStatus(unit, 'taunt')) return { skillId: tauntId, targetId: null };
  }
  // 공격 스킬 (사수·교활 포함 공통): 광역은 2체 이상일 때만
  const atkId = actives.find((id) => {
    const s = SKILLS[id];
    if (!s.dmg) return false;
    if (s.target === 'enemiesAll') return L.livingUnits(state, unit.side === 'ally' ? 'enemy' : 'ally').length >= BALANCE.ai.aoeMinTargets;
    return true;
  });
  if (atkId) {
    const skill = SKILLS[atkId];
    const target = ['enemy', 'enemies2'].includes(skill.target) ? pickTarget(state, unit, skill) : null;
    if (target || !['enemy', 'enemies2'].includes(skill.target)) {
      return { skillId: atkId, targetId: target?.id ?? null };
    }
  }
  // 일반공격
  const basic = SKILLS[unit.skills.basic];
  const target = pickTarget(state, unit, basic);
  if (!target) return null;
  return { skillId: unit.skills.basic, targetId: target.id };
}

// 적 팀 턴 전체 해결 → 이벤트 목록 (아군 턴 틱 이벤트 포함)
export function enemyPhase(state) {
  const events = [];
  const order = BALANCE.ai.actOrder;
  const enemies = L.livingUnits(state, 'enemy')
    .sort((a, b) => order.indexOf(a.ai) - order.indexOf(b.ai) || a.slot - b.slot);
  for (const e of enemies) {
    if (state.winner) break;
    if (!e.alive) continue;
    if (L.isStunned(e)) { events.push({ type: 'stunned', unit: e.id }); e.acted = true; continue; }
    const action = enemyAction(state, e);
    if (action) events.push(...L.executeSkill(state, e.id, action.skillId, action.targetId));
    e.acted = true;
  }
  if (!state.winner) events.push(...L.startPlayerPhase(state));
  return events;
}

// ----- 아군 오토 (기획서 §6 — 쿨 되면 최적 대상, 힐은 60% 이하, 세라핀 특칙) -----

export function autoAction(state, unit) {
  if (!L.canAct(unit)) return { type: 'skip' };
  const friends = L.livingUnits(state, unit.side);
  const foes = L.livingUnits(state, 'enemy');
  const seraphinGuard = unit.passive === 'c03_p'
    && unit.hp <= unit.stats.maxHp * BALANCE.passives.c03_special.autoSkipCostHpPct;
  const actives = unit.skills.actives.filter((id) => {
    if (!usable(state, unit, id)) return false;
    if (seraphinGuard && SKILLS[id].selfHpCost) return false; // 세라핀: HP 30% 이하면 소모 스킬 금지
    return true;
  });

  // 1. 치유·정화 (아군 60% 이하)
  const wounded = friends.filter((u) => u.hp <= u.stats.maxHp * BALANCE.auto.healThreshold)
    .sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp);
  const healId = actives.find((id) => SKILLS[id].heal && !SKILLS[id].dmg);
  if (healId && wounded.length) {
    const t = SKILLS[healId].target === 'alliesAll' ? unit : wounded[0];
    return { type: 'skill', skillId: healId, targetId: SKILLS[healId].target === 'ally' ? wounded[0].id : t.id };
  }
  // 2. 보호막·버프·자기 강화 (쿨 되면 사용 — 오토는 약간 비효율이 정상)
  const supportId = actives.find((id) => {
    const s = SKILLS[id];
    return !s.dmg && !s.heal && (s.shield || s.buffs || s.selfBuffs || s.debuffs || s.cdr);
  });
  if (supportId) {
    const s = SKILLS[supportId];
    let targetId = null;
    if (s.target === 'ally') targetId = (wounded[0] ?? friends.find((u) => u !== unit) ?? unit).id;
    if (s.target === 'enemy' || s.target === 'enemies2') targetId = pickTarget(state, unit, s)?.id ?? null;
    return { type: 'skill', skillId: supportId, targetId };
  }
  // 3. 공격 스킬 (광역은 적 2체 이상)
  const atkId = actives.find((id) => {
    const s = SKILLS[id];
    if (!s.dmg) return false;
    if (s.target === 'enemiesAll') return foes.length >= BALANCE.ai.aoeMinTargets;
    return true;
  });
  const sacredId = unit.skills.sacred && usable(state, unit, unit.skills.sacred)
    && foes.length >= BALANCE.ai.aoeMinTargets ? unit.skills.sacred : null;
  const useId = sacredId ?? atkId;
  if (useId) {
    const s = SKILLS[useId];
    const target = ['enemy', 'enemies2'].includes(s.target) ? pickAutoTarget(state, unit, s) : null;
    return { type: 'skill', skillId: useId, targetId: target?.id ?? null };
  }
  // 4. 일반공격 (연계 대상 우선)
  const basic = SKILLS[unit.skills.basic];
  const target = pickAutoTarget(state, unit, basic);
  if (!target) return { type: 'skip' };
  return { type: 'skill', skillId: unit.skills.basic, targetId: target.id };
}

// 오토 타겟: 처치 가능 > 연계(집중) > 점수식
function pickAutoTarget(state, unit, skill) {
  const targets = L.validTargets(state, unit, skill);
  if (!targets.length) return null;
  const nums = BALANCE.skills[skill.id] ?? {};
  const killable = targets.find((t) => {
    if (!skill.dmg) return false;
    const forced = skill.condCrit && nums.condCritHpPct !== undefined && t.hp <= t.stats.maxHp * nums.condCritHpPct;
    return L.computeDamage(state, unit, t, { coef: nums.coef ?? 1, crit: forced, magic: !!skill.magic }) * (nums.hits ?? 1) >= t.hp + t.shield;
  });
  if (killable) return killable;
  if (state.focus) {
    const focusTarget = targets.find((t) => t.id === state.focus.targetId);
    if (focusTarget) return focusTarget;
  }
  let best = null;
  for (const t of targets) {
    const s = scoreTarget(state, unit, skill, t);
    if (!best || s > best.s) best = { t, s };
  }
  return best.t;
}
