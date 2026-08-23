// ============================================================
// bond.js — 교감(호감도) 순수 모듈 (기획서 §12, M5-7)
//
// 상승: 병영 대화(1일 1회) / 선물(1일 1회, 취향 적중 대폭) / 파티 전투 승리.
// 보상: Lv2 스탯+3% → Lv4 스탯+7% (Lv3 서브퀘·Lv5 비하인드는 후속 마일스톤 — 틀만).
// 수치는 balance.js bond 섹션 (규칙 2). 대사·취향은 data/bonds.js.
// 저장: roster[cid].bond = { lv, pts, talkedAt, giftAt } — 주인공은 교감 없음.
// ============================================================

import { BALANCE } from '../balance.js';
import { GIFTS, GIFT_PREF } from '../data/bonds.js';
import { ensureEquip } from './equip.js';   // 인벤토리 생성 책임 포함 (규칙: 보장 함수는 체인)

const B = () => BALANCE.bond;

export function ensureBond(state) {
  ensureEquip(state);
  if (!state.inventory.gifts) state.inventory.gifts = {};   // { giftId: count }
  for (const e of Object.values(state.roster)) {
    if (!e.bond) e.bond = { lv: 1, pts: 0, talkedAt: 0, giftAt: 0 };
  }
  return state;
}

export function bondOf(state, cid) {
  ensureBond(state);
  return state.roster[cid]?.bond ?? null;
}

// 다음 레벨까지 필요 포인트 (Lv5는 만렙)
export function need(lv) {
  return B().need[lv - 1] ?? null;
}

// 포인트 적립 + 레벨업 처리. { from, to } 반환
function addPts(bond, pts) {
  const from = bond.lv;
  bond.pts += pts;
  while (bond.lv < B().maxLevel && bond.pts >= need(bond.lv)) {
    bond.pts -= need(bond.lv);
    bond.lv += 1;
  }
  if (bond.lv >= B().maxLevel) bond.pts = 0;   // 만렙 — 잔여 포인트 의미 없음
  return { from, to: bond.lv };
}

// ----- 대화 (1일 1회) -----

export function canTalk(state, cid, now) {
  const b = bondOf(state, cid);
  if (!b) return false;
  return now - (b.talkedAt ?? 0) >= B().talkCooldownH * 3600000;
}

export function talk(state, cid, now) {
  const b = bondOf(state, cid);
  if (!b) return { err: 'no-char' };
  if (!canTalk(state, cid, now)) return { err: 'cooldown', remainMs: B().talkCooldownH * 3600000 - (now - b.talkedAt) };
  b.talkedAt = now;
  const up = addPts(b, B().talkPts);
  return { ok: true, pts: B().talkPts, ...up, lv: b.lv };
}

// ----- 선물 (1일 1회, 취향 적중 대폭) -----

export function canGift(state, cid, now) {
  const b = bondOf(state, cid);
  if (!b) return false;
  return now - (b.giftAt ?? 0) >= B().giftCooldownH * 3600000;
}

export function giveGift(state, cid, giftId, now) {
  const b = bondOf(state, cid);
  if (!b) return { err: 'no-char' };
  if (!GIFTS[giftId]) return { err: 'gift' };
  if (!canGift(state, cid, now)) return { err: 'cooldown' };
  const inv = state.inventory.gifts;
  if ((inv[giftId] ?? 0) <= 0) return { err: 'stock' };
  inv[giftId] -= 1;
  if (inv[giftId] <= 0) delete inv[giftId];
  b.giftAt = now;
  const match = GIFT_PREF[cid] === giftId;
  const pts = match ? B().giftPts.match : B().giftPts.normal;
  const up = addPts(b, pts);
  return { ok: true, pts, match, ...up, lv: b.lv };
}

// ----- 전투 승리 (참전 동료 전원, 주인공 제외) -----

export function battleBond(state, cids) {
  ensureBond(state);
  const ups = [];
  for (const cid of cids ?? []) {
    const b = state.roster[cid]?.bond;
    if (!b) continue;
    const up = addPts(b, B().battleWinPts);
    if (up.to > up.from) ups.push({ cid, ...up });
  }
  return ups;
}

// ----- 스탯 보너스 (Lv2 +3% → Lv4 +7%, 계단식) -----

export function bondBonus(state, cid) {
  const b = state.roster?.[cid]?.bond;
  if (!b) return 0;
  const table = B().statBonus;
  let bonus = 0;
  for (const [lv, v] of Object.entries(table)) {
    if (b.lv >= Number(lv)) bonus = Math.max(bonus, v);
  }
  return bonus;
}
