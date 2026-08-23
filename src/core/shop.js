// ============================================================
// shop.js — 상점 순수 모듈 (기획서 §10·§12, M5-5)
//
// 장비 완제품 구매·강화석 구매·조각 교환·장비 판매를 여기서만 계산한다.
// 렌더 없음 — 씬·테스트가 같은 계약 (규칙 4). 수치는 balance.js shop 섹션 (규칙 2).
//
// 소모품(포션 등)은 "전투 중 아이템 사용" 청크와 함께 들어온다 (작업계획 참조) —
// 사용처 없는 상품을 먼저 팔면 죽은 기능이 된다.
// ============================================================

import { BALANCE } from '../balance.js';
import { EQUIP_KINDS, GRADES } from '../data/equipment.js';
import { CONSUMABLES } from '../data/items.js';
import { GIFTS } from '../data/bonds.js';
import { ensureBond } from './bond.js';
import { CHARACTERS } from '../data/characters.js';
import * as EQ from './equip.js';
import { ensureGrowth } from './growth.js';

const S = () => BALANCE.shop;

// ----- 장비 완제품 -----

export function equipPrice(tier) {
  return Math.round(BALANCE.equip.craft.gold[tier - 1] * S().equipPriceMult);
}

// 진열 목록: 티어 × 12계열 (일반 등급 고정)
export function equipOffers() {
  const out = [];
  for (const tier of S().equipTiers) {
    for (const kind of Object.keys(EQUIP_KINDS)) {
      out.push({ kind, tier, gold: equipPrice(tier) });
    }
  }
  return out;
}

export function buyEquip(state, kind, tier) {
  EQ.ensureEquip(state);
  if (!EQUIP_KINDS[kind] || !S().equipTiers.includes(tier)) return { err: 'offer' };
  const gold = equipPrice(tier);
  if ((state.resources.gold ?? 0) < gold) return { err: 'gold', gold };
  state.resources.gold -= gold;
  const item = EQ.makeItem(state, kind, tier, 1);   // 일반 등급 — 상위 등급은 제작·드랍 몫
  return { ok: true, item, gold };
}

// ----- 소모품 -----

export function consumablePrice(id) {
  return BALANCE.items.prices[id];
}

export function buyConsumable(state, id) {
  EQ.ensureEquip(state);
  if (!CONSUMABLES[id]) return { err: 'offer' };
  const gold = consumablePrice(id);
  if ((state.resources.gold ?? 0) < gold) return { err: 'gold', gold };
  state.resources.gold -= gold;
  const c = state.inventory.consumables;
  c[id] = (c[id] ?? 0) + 1;
  return { ok: true, gold, count: c[id] };
}

// ----- 선물 (교감, M5-7) -----

export function giftPrice() {
  return BALANCE.bond.giftGold;
}

export function buyGift(state, id) {
  ensureBond(state);
  if (!GIFTS[id]) return { err: 'offer' };
  const gold = giftPrice();
  if ((state.resources.gold ?? 0) < gold) return { err: 'gold', gold };
  state.resources.gold -= gold;
  const inv = state.inventory.gifts;
  inv[id] = (inv[id] ?? 0) + 1;
  return { ok: true, gold, count: inv[id] };
}

// ----- 강화석 -----

export function stonePrice(n) {
  return n >= S().stoneBundle.count ? S().stoneBundle.gold : S().stoneGold * n;
}

export function buyStone(state, n) {
  EQ.ensureEquip(state);
  const gold = stonePrice(n);
  if ((state.resources.gold ?? 0) < gold) return { err: 'gold', gold };
  state.resources.gold -= gold;
  state.resources.enhStone = (state.resources.enhStone ?? 0) + n;
  return { ok: true, n, gold };
}

// ----- 조각 교환 (증표 → 보유 동료 조각) -----

export function shardPrice(cid) {
  const grade = CHARACTERS[cid]?.grade;
  return S().shardBadge[grade] ?? null;
}

export function buyShard(state, cid) {
  ensureGrowth(state);
  if (cid === 'hero') return { err: 'hero' };
  const e = state.roster[cid];
  if (!e) return { err: 'not-owned' };
  // 죽은 조각 방지 — 완돌까지 필요한 만큼만 (뽑기 중복 골드 변환 규칙과 일관)
  if ((e.lb ?? 0) + (e.shards ?? 0) >= BALANCE.limitBreak.maxSteps) return { err: 'full' };
  const badge = shardPrice(cid);
  if ((state.resources.badge ?? 0) < badge) return { err: 'badge', badge };
  state.resources.badge -= badge;
  e.shards = (e.shards ?? 0) + 1;
  return { ok: true, badge, shards: e.shards };
}

// ----- 장비 판매 -----

export function sellPrice(item) {
  return Math.floor(BALANCE.equip.craft.gold[item.tier - 1] * BALANCE.equip.gradeCoef[item.grade] * S().sellRate);
}

export function sellEquip(state, uid) {
  EQ.ensureEquip(state);
  const item = EQ.itemOf(state, uid);
  if (!item) return { err: 'no-item' };
  if (item.lock) return { err: 'locked' };
  if (EQ.ownerOf(state, uid)) return { err: 'equipped' };
  const gold = sellPrice(item);
  state.inventory.equips = state.inventory.equips.filter((it) => it.uid !== uid);
  state.resources.gold = (state.resources.gold ?? 0) + gold;
  return { ok: true, gold };
}
