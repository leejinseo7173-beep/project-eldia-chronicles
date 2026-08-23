// ============================================================
// gacha.js — 소환(뽑기) 로직 (기획서 §9, M5-2)
//
// **렌더 무관 순수 모듈** — 연출 씬(scenes/gacha.js)과 테스트가 같은 코드를 쓴다.
// 랜덤은 전부 시드 RNG(규칙 5): `${seed}:gacha` 스트림을 누적 시행 횟수만큼 감아
// 분할 뽑기 = 일괄 뽑기가 보장된다 (마력샘과 같은 수법).
//
// 천장(기획서): 30회 내 ★3 확정 — ★3이 나오면 카운터 리셋.
// 중복: 그 캐릭터의 조각(한계돌파 재료). 조각이 찼으면 골드 변환 — dupeReward.
// ============================================================

import { BALANCE } from '../balance.js';
import { CHARACTERS } from '../data/characters.js';
import { RNG } from './rng.js';

const G = () => BALANCE.gacha;

// 등급별 소환 풀 — hero 제외 동료 15명
export function pools() {
  const out = { 1: [], 2: [], 3: [] };
  for (const c of Object.values(CHARACTERS)) {
    if (c.isHero) continue;
    out[c.grade].push(c.id);
  }
  return out;
}

export function ensureGacha(state) {
  if (state.resources && state.resources.badge == null) state.resources.badge = 0;
  if (!state.gacha) state.gacha = { pity: 0, draws: 0 };
  if (!state.roster) state.roster = {};   // { c01: { lb, lv, xp, awaken, shards } }
  return state.gacha;
}

// 중복 보상 — 조각이 남은 돌파 횟수(완돌까지)를 다 채웠으면 골드로 변환.
// 순수 규칙이라 분리: draw()와 테스트가 같은 계약을 쓴다.
export function dupeReward(state, id, grade) {
  const e = state.roster[id];
  const useful = BALANCE.limitBreak.maxSteps - (e.lb ?? 0) - (e.shards ?? 0);
  if (useful > 0) {
    e.shards = (e.shards ?? 0) + G().dupeShard;
    return { shard: G().dupeShard, gold: 0 };
  }
  const gold = G().dupeGoldByGrade[grade];
  state.resources.gold = (state.resources.gold ?? 0) + gold;
  return { shard: 0, gold };
}

export function altarLv(state) {
  return state.base?.buildings?.altar?.lv ?? 0;
}

export function canTenPull(state) {
  return altarLv(state) >= G().tenPullAltarLv;
}

export function ratesOf(state) {
  return altarLv(state) >= 3 ? G().ratesAltarLv3 : G().rates;
}

// 천장까지 남은 횟수 (표시는 제단 Lv2부터 — 기획서 단계 효과)
export function pityLeft(state) {
  return Math.max(0, G().pityAt - (state.gacha?.pity ?? 0));
}

// n회 뽑기. 증표가 모자라면 null.
// 반환: [{ id, grade, isNew, shard, gold, pity }] — pity는 이 뽑기가 천장 확정이었는지
export function draw(state, n) {
  ensureGacha(state);
  const cost = G().costBadge * n;
  if ((state.resources.badge ?? 0) < cost) return null;
  state.resources.badge -= cost;

  const pool = pools();
  const rates = ratesOf(state);
  const rng = new RNG(`${state.seed}:gacha`);
  // 재현성: 이미 소비한 난수만큼 감는다 (뽑기 1회 = 등급 1 + 인물 1 = 2개)
  for (let i = 0; i < state.gacha.draws * 2; i++) rng.next();

  const results = [];
  for (let i = 0; i < n; i++) {
    state.gacha.draws += 1;
    state.gacha.pity += 1;
    const roll = rng.next();
    let grade;
    let byPity = false;
    if (state.gacha.pity >= G().pityAt) {
      grade = 3;                       // 천장 — 30회째는 ★3 확정
      byPity = true;
    } else if (roll < rates[3]) grade = 3;
    else if (roll < rates[3] + rates[2]) grade = 2;
    else grade = 1;

    const list = pool[grade];
    const id = list[Math.floor(rng.next() * list.length)];
    if (grade === 3) state.gacha.pity = 0;   // ★3 획득 시 리셋 (기획서)

    const owned = !!state.roster[id];
    let reward = { shard: 0, gold: 0 };
    if (owned) reward = dupeReward(state, id, grade);
    else state.roster[id] = { lb: 0 };
    results.push({ id, grade, isNew: !owned, shard: reward.shard, gold: reward.gold, pity: byPity });
  }
  return results;
}
