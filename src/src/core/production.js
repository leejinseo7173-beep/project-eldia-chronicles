// ============================================================
// production.js — 거점 방치 생산 정산 (기획서 §12, M5-1)
//
// **렌더 무관 순수 모듈** (절대 규칙 4의 정신) — 씬 없이 완결되고,
// 치트의 시간 스킵·검증 테스트(tools/test_production.mjs)가 그대로 재사용한다.
//
// 정산은 1분 틱 루프로 돈다 (최대 480회 — 공짜다).
// 해석적 수식 대신 루프를 쓰는 이유: 식량이 도중에 바닥나면 그 시점부터
// 효율이 반감되는데, 그 경계를 수식으로 풀면 코드가 배로 복잡해진다.
//
// 정수 규칙(절대 규칙 6): 자원은 내부적으로 **8배 스케일 정수**로 누적한다.
//   분당 생산 × (1 + 0.25×일꾼) × 효율(1|0.5) 의 최소 단위가 1/8이기 때문.
//   표시·저장은 내림한 정수만 쓴다.
// 랜덤은 마력샘 각성석뿐 — 시드 RNG(규칙 5), 시행 횟수 카운터로 재현 가능.
// ============================================================

import { BALANCE } from '../balance.js';
import { BUILDINGS, isUnlocked } from '../data/buildings.js';
import { RNG } from './rng.js';

const B = () => BALANCE.base;
export const RES_KEYS = ['wood', 'stone', 'iron', 'food', 'mana', 'awaken', 'gold'];

// ----- 상태 초기화·이관 -----

// state에 거점 상태가 없으면 만든다 (구세이브 로드·새 게임 공통 경로).
// 기존 필드 자원(state.field.resources: herb/wood/stone + field.gold)은 여기로 이관한다.
export function ensureBase(state, now) {
  if (!state.resources) {
    const old = state.field?.resources ?? {};
    const kit = B().startKit ?? {};
    state.resources = {
      wood: (old.wood ?? 0) + (kit.wood ?? 0), stone: (old.stone ?? 0) + (kit.stone ?? 0), iron: 0,
      food: (old.herb ?? 0) + (kit.food ?? 0),  // 약초는 식량 계열로 통합 (기획서 자원 체계)
      mana: 0, awaken: 0,
      gold: (state.field?.gold ?? 0) + (kit.gold ?? 0),
    };
    if (state.field) { delete state.field.resources; delete state.field.gold; }
  }
  if (!state.base) {
    state.base = {
      buildings: {}, pop: B().initPop,
      lastTick: now, taxAt: 0, springTicks: 0,
    };
    for (const [id, def] of Object.entries(BUILDINGS)) {
      state.base.buildings[id] = { lv: def.startLv ?? 0, workers: 0 };
    }
  }
  return state.base;
}

// ----- 조회 -----

export function wallLv(state) {
  return Math.max(1, state.base?.buildings?.wall?.lv ?? 1);
}

export function storageCap(state, res) {
  if (res === 'gold') return Infinity;
  return B().storage[res][wallLv(state) - 1];
}

export function popCap(state) {
  const lv = state.base?.buildings?.house?.lv ?? 0;
  return lv > 0 ? B().housePopCap[lv - 1] : B().housePopCap[0];
}

export function idleWorkers(state) {
  let used = 0;
  for (const b of Object.values(state.base.buildings)) used += b.workers ?? 0;
  return state.base.pop - used;
}

export function workerSlots(id, lv) {
  const s = BUILDINGS[id].slots;
  return s && lv > 0 ? s[lv - 1] : 0;
}

// 시설의 분당 생산 (효율 제외, 8배 스케일 정수) — UI 표시와 정산이 같은 값을 쓴다
function prodPerMinX8(state, id) {
  const b = state.base.buildings[id];
  if (!b || b.lv <= 0) return null;
  const table = B().prod[id];
  if (!table) return null;
  const base = table[b.lv - 1];
  const mult8 = 8 + 2 * (b.workers ?? 0);          // (1 + 0.25w) × 8
  const out = {};
  for (const [res, amt] of Object.entries(base)) out[res] = amt * mult8;
  return out;
}

// UI용: 분당 생산 표(소수 1자리) — 마력샘은 시간당이라 그대로 두고 씬에서 표기만 바꾼다
export function prodPerMinView(state, id) {
  const x8 = prodPerMinX8(state, id);
  if (!x8) return null;
  const out = {};
  for (const [res, v] of Object.entries(x8)) out[res] = v / 8;
  return out;
}

// 식량 경제는 **농장 해금(2장)부터** 가동된다.
// 그전엔 세레스의 왕실 비축 배급 — 소비도 굶주림도 없다.
// (기획서: 농장 2장 해금 + 소비 0.5/분/명. 그대로 두면 1장 내내 적자 →
//  상시 -50%로 도시가 못 큰다 — 사용자 확인 2026-08-06. 수치 대신 시작 조건으로 해소)
export function foodEconomyOn(state) {
  return isUnlocked('farm', state.progress);
}

export function foodDeltaPerMin(state) {
  if (!foodEconomyOn(state)) return 0;
  const eat = state.base.pop * B().foodPerPopMin;
  const farm = prodPerMinView(state, 'farm');
  return (farm?.food ?? 0) - eat;
}

// ----- 정산 -----

// now(ms) 기준으로 미정산 분을 지급한다. 반환: { mins, gains, spilled, starvedMin }
export function settle(state, now) {
  ensureBase(state, now);
  const base = state.base;
  const cap = B().offlineCapMin;
  let mins = Math.floor((now - base.lastTick) / 60000);
  if (mins < 0) { base.lastTick = now; mins = 0; }   // 시계 역행 — 지급 0
  if (mins > cap) mins = cap;
  if (mins === 0) return { mins: 0, gains: {}, spilled: {}, starvedMin: 0 };

  // 8배 스케일 누적 버퍼 (자원 저장값은 정수 유지 — 반올림 잔여는 버퍼에 남는다)
  const acc = {};
  for (const k of RES_KEYS) acc[k] = 0;
  let foodX8 = state.resources.food * 8;
  const eatX8 = foodEconomyOn(state) ? Math.round(base.pop * B().foodPerPopMin * 8) : 0;
  let starvedMin = 0;
  const prodIds = Object.keys(B().prod).filter((id) => (base.buildings[id]?.lv ?? 0) > 0);
  const rng = new RNG(`${state.seed}:spring`);
  // 재현성: 이전 정산에서 이미 쓴 시행 횟수만큼 스트림을 감는다
  for (let i = 0; i < base.springTicks; i++) rng.next();

  let springAcc = 0;
  for (let m = 0; m < mins; m++) {
    // ① 식량 소비
    const foodBefore = foodX8;
    foodX8 = Math.max(0, foodX8 - eatX8);
    // ② 효율 — 굶주림은 "먹을 사람이 있는데 못 먹었다"일 때만.
    //   (식량 0이어도 인구 0이면 정상 — 이걸 놓쳐서 진공 테스트가 반토막 났었다)
    const starving = eatX8 > 0 && foodBefore < eatX8;
    if (starving) starvedMin++;
    const effNum = starving ? 1 : 2, effDen = 2;     // ×0.5 또는 ×1 — 분수로 정확히
    // ③ 생산
    for (const id of prodIds) {
      if (id === 'spring') continue;                  // 시간당 — 아래에서
      const x8 = prodPerMinX8(state, id);
      for (const [res, v] of Object.entries(x8)) {
        if (res === 'food') foodX8 += (v * effNum) / effDen;
        else acc[res] += (v * effNum) / effDen;
      }
    }
    // 마력샘 — 60분마다 한 번 (효율 반감은 시간 단위로 적용)
    if ((base.buildings.spring?.lv ?? 0) > 0) {
      springAcc++;
      if (springAcc >= 60) {
        springAcc = 0;
        const lv = base.buildings.spring.lv;
        const x8 = B().prod.spring[lv - 1].mana * 8;
        acc.mana += (x8 * effNum) / effDen;
        base.springTicks++;
        if (rng.chance(B().springAwakenChance[lv - 1])) acc.awaken += 8;
      }
    }
  }

  // ④ 지급 + 창고 상한 (초과분은 버리되 기록 — UI가 "가득!"을 알린다)
  const gains = {}, spilled = {};
  const give = (res, intAmt) => {
    if (intAmt <= 0) return;
    const capV = storageCap(state, res);
    const room = Math.max(0, capV - state.resources[res]);
    const put = Math.min(room, intAmt);
    state.resources[res] += put;
    if (put > 0) gains[res] = (gains[res] ?? 0) + put;
    if (intAmt > put) spilled[res] = (spilled[res] ?? 0) + (intAmt - put);
  };
  for (const k of RES_KEYS) if (k !== 'food') give(k, Math.floor(acc[k] / 8));
  // 식량은 소비까지 반영된 최종값으로 교체 (상한 클램프)
  const foodInt = Math.floor(foodX8 / 8);
  const foodCap = storageCap(state, 'food');
  const before = state.resources.food;
  state.resources.food = Math.min(foodCap, foodInt);
  if (foodInt > foodCap) spilled.food = (spilled.food ?? 0) + (foodInt - foodCap);
  const dFood = state.resources.food - before;
  if (dFood !== 0) gains.food = dFood;

  base.lastTick += mins * 60000;                     // 남은 초는 다음 정산으로 이월
  return { mins, gains, spilled, starvedMin };
}

// ----- 세금 -----

export function taxAmount(state) {
  return state.base.pop * B().taxPerPop;
}

export function taxReady(state, now) {
  return now - (state.base.taxAt ?? 0) >= B().taxCooldownH * 3600000;
}

export function collectTax(state, now) {
  if (!taxReady(state, now)) return 0;
  const amt = taxAmount(state);
  state.resources.gold += amt;                        // 골드는 상한 없음
  state.base.taxAt = now;
  return amt;
}

// ----- 건설·증축 -----

export function nextCost(state, id) {
  const b = state.base.buildings[id];
  const def = BUILDINGS[id];
  if (!b || b.lv >= def.maxLv) return null;
  return B().cost[id][b.lv];                          // lv0→[0], lv1→[1] …
}

export function canAfford(state, cost) {
  if (!cost) return false;
  return Object.entries(cost).every(([res, amt]) => (state.resources[res] ?? 0) >= amt);
}

// 성공 시 새 레벨, 실패(자원 부족·최대) 시 0
export function build(state, id) {
  const cost = nextCost(state, id);
  if (!cost || !canAfford(state, cost)) return 0;
  if (!isUnlocked(id, state.progress)) return 0;
  for (const [res, amt] of Object.entries(cost)) state.resources[res] -= amt;
  const b = state.base.buildings[id];
  b.lv += 1;
  // 증축으로 슬롯이 줄어드는 일은 없지만, 방어적으로 일꾼을 슬롯에 맞춘다
  b.workers = Math.min(b.workers ?? 0, workerSlots(id, b.lv));
  return b.lv;
}

// 일꾼 배치 (+1/−1). 성공 시 true
export function assignWorker(state, id, delta) {
  const b = state.base.buildings[id];
  if (!b || b.lv <= 0) return false;
  const slots = workerSlots(id, b.lv);
  const next = (b.workers ?? 0) + delta;
  if (next < 0 || next > slots) return false;
  if (delta > 0 && idleWorkers(state) <= 0) return false;
  b.workers = next;
  return true;
}
