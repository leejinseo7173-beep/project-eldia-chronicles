// ============================================================
// growth.js — 육성 순수 모듈 (기획서 §7 성장 4축, M5-3)
//
// 레벨(전투 EXP + 훈련소 골드)·한계돌파(캐릭터 조각)·각성(각성석, 신전)을
// 여기서만 계산한다. 렌더 없음 — 씬·전투·테스트가 같은 계약을 쓴다 (규칙 4).
// 수치는 전부 balance.js의 growth 섹션 (규칙 2).
//
// 성장 상태:
//   동료  state.roster[cid] = { lb, lv, xp, awaken, shards }
//   주인공 state.heroGrowth  = { lv, xp }
//     — 주인공은 한돌·각성 없음: 한돌 재료가 "중복 뽑기"인데 주인공은 뽑기에
//       없고, 각성 규칙도 "전 동료 공통"(기획서 §4)이라 동료 전용으로 읽는다.
// 장비(4축의 하나)는 다음 청크(M5-4) — 인벤토리와 함께 붙인다.
// ============================================================

import { BALANCE } from '../balance.js';
import { CHARACTERS } from '../data/characters.js';
import { isUnlocked } from '../data/buildings.js';

const G = () => BALANCE.growth;

// ----- 상태 보장·조회 -----

export function ensureGrowth(state) {
  if (!state.heroGrowth) state.heroGrowth = { lv: 1, xp: 0 };
  if (!state.roster) state.roster = {};
  for (const e of Object.values(state.roster)) {
    if (e.lv == null) e.lv = 1;
    if (e.xp == null) e.xp = 0;
    if (e.lb == null) e.lb = 0;
    if (e.awaken == null) e.awaken = 0;
    if (e.shards == null) e.shards = 0;
  }
  // 결정 재화 잔재 제거 — 조각 방식 개정(2026-08-15) 전 세이브
  if (state.resources && 'crystal' in state.resources) delete state.resources.crystal;
  return state;
}

// 보유 명단 — 주인공 먼저, 이후 동료는 캐릭터 정의 순서(c01~c15)
export function ownedIds(state) {
  ensureGrowth(state);
  const owned = Object.keys(CHARACTERS).filter((id) => state.roster[id]);
  return ['hero', ...owned];
}

// 성장 엔트리 — 주인공/동료 공통 창구
export function entryOf(state, cid) {
  ensureGrowth(state);
  return cid === 'hero' ? state.heroGrowth : state.roster[cid] ?? null;
}

// ----- 레벨 -----

// Lv → Lv+1 필요 EXP = 25 × Lv^1.5 (내림, 기획서 §7)
export function xpNeed(lv) {
  return Math.floor(G().xpCoef * Math.pow(lv, G().xpPow));
}

// 레벨 상한 — 훈련소 단계로 확장. 최대 60
export function levelCap(state) {
  const dojoLv = state.base?.buildings?.dojo?.lv ?? 0;
  return Math.min(G().maxLevel, G().levelCap.base + dojoLv * G().levelCap.perDojoLv);
}

// 쌓인 xp를 레벨로 환전 (상한에서 멈추고 잔여 xp는 보존 — 상한이 오르면 이어진다)
function applyXp(entry, cap) {
  while (entry.lv < cap && entry.xp >= xpNeed(entry.lv)) {
    entry.xp -= xpNeed(entry.lv);
    entry.lv += 1;
  }
}

// 전투 승리 경험치 = Σ(적 레벨) × xpPerEnemyLv
export function battleXpOf(enemyLevels) {
  return enemyLevels.reduce((a, l) => a + l, 0) * G().xpPerEnemyLv;
}

// 참전 전원에게 전액 지급. [{ cid, from, to }] (레벨이 오른 캐릭터만) 반환
export function grantBattleXp(state, cids, xp) {
  ensureGrowth(state);
  const cap = levelCap(state);
  const ups = [];
  for (const cid of cids) {
    const e = entryOf(state, cid);
    if (!e) continue;
    const from = e.lv;
    e.xp += xp;
    applyXp(e, cap);
    if (e.lv > from) ups.push({ cid, from, to: e.lv });
  }
  return ups;
}

// ----- 훈련소: 골드로 한 레벨 -----

export function trainCost(lv) {
  return Math.ceil(xpNeed(lv) * G().trainGoldPerXp);
}

// 잔여 xp만큼 깎아 준다: 비용 = 남은 필요 EXP 기준 (전투로 반쯤 채웠으면 싸진다)
export function trainOnce(state, cid) {
  ensureGrowth(state);
  const e = entryOf(state, cid);
  if (!e) return { err: 'no-char' };
  const cap = levelCap(state);
  if (e.lv >= cap) return { err: 'cap' };
  const remain = Math.max(0, xpNeed(e.lv) - e.xp);
  const cost = Math.max(1, Math.ceil(remain * G().trainGoldPerXp));
  if ((state.resources?.gold ?? 0) < cost) return { err: 'gold', cost };
  state.resources.gold -= cost;
  e.xp += remain;
  applyXp(e, cap);
  return { ok: true, cost, lv: e.lv };
}

// ----- 한계돌파 (그 캐릭터의 조각 — 중복 소환으로 획득) -----

export function lbShardCost() {
  return G().lbShardCost;
}

export function limitBreak(state, cid) {
  ensureGrowth(state);
  if (cid === 'hero') return { err: 'hero' };
  const e = state.roster[cid];
  if (!e) return { err: 'no-char' };
  if (e.lb >= BALANCE.limitBreak.maxSteps) return { err: 'max' };
  const cost = G().lbShardCost;
  if ((e.shards ?? 0) < cost) return { err: 'shard', cost };
  e.shards -= cost;
  e.lb += 1;
  return { ok: true, cost, lb: e.lb };
}

// ----- 각성 (각성석 — 신전 필요, 3장 해금) -----

export function awakenGate(state) {
  if (!isUnlocked('temple', state.progress)) return 'chapter';   // 3장 전
  if ((state.base?.buildings?.temple?.lv ?? 0) <= 0) return 'build';
  return null;
}

export function awakenCost(step) {
  return G().awakenCost[step] ?? null;   // step = 현재 각성 단계 (0→1각성 비용)
}

export function awaken(state, cid) {
  ensureGrowth(state);
  if (cid === 'hero') return { err: 'hero' };
  const e = state.roster[cid];
  if (!e) return { err: 'no-char' };
  const gate = awakenGate(state);
  if (gate) return { err: gate };
  if (e.awaken >= BALANCE.awaken.maxSteps) return { err: 'max' };
  const cost = awakenCost(e.awaken);
  if ((state.resources?.awaken ?? 0) < cost) return { err: 'stone', cost };
  state.resources.awaken -= cost;
  e.awaken += 1;
  return { ok: true, cost, awaken: e.awaken };
}

// ----- 전투 연동 -----

// createBattleFromStage의 growth 파라미터: { cid: { lv, limitBreak, awaken } }
export function buildGrowthMap(state, cids) {
  ensureGrowth(state);
  const map = {};
  for (const cid of cids ?? []) {
    const e = entryOf(state, cid);
    if (!e) continue;
    map[cid] = { lv: e.lv, limitBreak: e.lb ?? 0, awaken: e.awaken ?? 0 };
  }
  return map;
}
