// ============================================================
// equip.js — 장비 순수 모듈 (기획서 §10, M5-4)
//
// 인스턴스 생성(부옵 시드 롤)·장착/해제·스탯 합산·제작·강화·드랍을
// 여기서만 계산한다. 렌더 없음 — 씬·전투·테스트가 같은 계약 (규칙 4).
// 수치는 전부 balance.js equip/enhance 섹션 (규칙 2).
//
// 장비 인스턴스 { uid, kind, tier, grade, enhance, subs: [{key, val}], lock }
//   — 부옵이 랜덤이라 스택 불가. 부옵 롤은 `${seed}:equip:${uid}` 스트림이라
//     세이브를 다시 로드해도 같은 장비가 같은 부옵을 가진다 (규칙 5).
// 저장 위치: state.inventory.equips[] / 장착은 성장 엔트리 equip.{weapon,armor,acc}
// 제작·드랍 랜덤은 각각 전용 스트림 + 소비 횟수 되감기 (마력샘·뽑기와 같은 수법).
//   ★한 번 호출당 소비 난수 개수를 고정해 되감기가 어긋나지 않게 한다.
// ============================================================

import { BALANCE } from '../balance.js';
import { RNG } from './rng.js';
import { EQUIP_KINDS, GRADES } from '../data/equipment.js';
import { CHARACTERS } from '../data/characters.js';
import { ensureGrowth, entryOf, ownedIds } from './growth.js';

const E = () => BALANCE.equip;

// ----- 상태 보장 -----

export function ensureEquip(state) {
  ensureGrowth(state);
  if (!state.inventory) state.inventory = { equips: [] };
  if (!state.inventory.equips) state.inventory.equips = [];
  if (!state.inventory.consumables) state.inventory.consumables = {};   // { itemId: count }
  if (state.itemSeq == null) state.itemSeq = 1;
  if (state.craftCount == null) state.craftCount = 0;
  if (state.dropCount == null) state.dropCount = 0;
  if (!state.resources) state.resources = {};   // 거점 방문 전 첫 필드 드랍도 안전하게
  if (state.resources.enhStone == null) state.resources.enhStone = 0;
  const slots = { weapon: null, armor: null, acc: null };
  if (!state.heroGrowth.equip) state.heroGrowth.equip = { ...slots };
  for (const e of Object.values(state.roster)) {
    if (!e.equip) e.equip = { ...slots };
  }
  return state;
}

export function itemOf(state, uid) {
  if (uid == null) return null;
  return state.inventory?.equips.find((it) => it.uid === uid) ?? null;
}

// ----- 착용 가능 판정 -----

// cid의 실효 classKey — 주인공은 heroClass('sword'|'mage'|'archer')
export function canEquip(state, cid, kindId, heroClass) {
  const k = EQUIP_KINDS[kindId];
  if (!k) return false;
  if (cid === 'hero') {
    if (k.hero === null) return true;              // 장신구 공용
    return k.hero.includes(heroClass ?? state.heroClass ?? 'sword');
  }
  if (k.classes === null) return true;
  const def = state.roster[cid] ? kindClassOf(cid) : null;
  return def != null && k.classes.includes(def);
}

function kindClassOf(cid) {
  return CHARACTERS[cid]?.classKey ?? null;
}

// ----- 인스턴스 생성 (부옵 시드 롤) -----

export function makeItem(state, kindId, tier, grade) {
  ensureEquip(state);
  const uid = state.itemSeq++;
  const rng = new RNG(`${state.seed}:equip:${uid}`);
  const n = E().subCount[grade] ?? 0;
  const keys = Object.keys(E().subs);
  const subs = [];
  const pool = keys.slice();
  for (let i = 0; i < n; i++) {
    const key = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
    const [min, max] = E().subs[key];
    subs.push({ key, val: rng.int(min, max) });
  }
  const item = { uid, kind: kindId, tier, grade, enhance: 0, subs, lock: false };
  state.inventory.equips.push(item);
  return item;
}

// ----- 스탯 계산 -----

// 주스탯(강화 적용) + 시그니처 + 부옵 → 합산 보너스 형태
// { flat: {hp,atk,mag,def,spd}, pct: {atkPct,magPct,hpPct,defPct}, critPct }
export function itemStats(item) {
  const k = EQUIP_KINDS[item.kind];
  const t = item.tier - 1;
  const coef = E().gradeCoef[item.grade];
  const enh = 1 + BALANCE.enhance.mainStatPerLevel * (item.enhance ?? 0);
  const flat = { hp: 0, atk: 0, mag: 0, def: 0, spd: 0 };
  const pct = { atkPct: 0, magPct: 0, hpPct: 0, defPct: 0 };
  let critPct = 0;
  const main = (v) => Math.floor(v * coef * enh);   // 주스탯만 등급·강화 적용 (정수)

  if (k.slot === 'weapon') {
    const v = main(E().weaponMain[t]);
    if (item.kind === 'staff' || item.kind === 'rod') flat.mag += v;
    else flat.atk += v;
  } else if (k.slot === 'armor') {
    const m = E().armorKindMult[item.kind];
    flat.hp += main(E().armorHp[t] * m.hp);
    flat.def += main(E().armorDef[t] * m.def);
  } else {
    const a = E().acc[item.kind];
    for (const [key, arr] of Object.entries(a)) flat[key] += main(arr[t]);
  }
  // 시그니처 — 등급·강화 미적용 (계열 정체성 고정값)
  const sig = E().sig[item.kind];
  if (sig) {
    for (const [key, arr] of Object.entries(sig)) {
      if (key === 'critPct') critPct += arr[t];
      else flat[key] += arr[t];
    }
  }
  // 부옵
  for (const s of item.subs ?? []) {
    if (s.key === 'spd') flat.spd += s.val;
    else if (s.key === 'critPct') critPct += s.val;
    else pct[s.key] += s.val;
  }
  return { flat, pct, critPct };
}

// cid가 장착 중인 장비 전체 합산 — computeAllyStats의 equip 파라미터 형태
export function equipBonus(state, cid) {
  ensureEquip(state);
  const entry = entryOf(state, cid);
  const total = { flat: { hp: 0, atk: 0, mag: 0, def: 0, spd: 0 }, pct: { atkPct: 0, magPct: 0, hpPct: 0, defPct: 0 }, critPct: 0 };
  if (!entry?.equip) return total;
  for (const uid of Object.values(entry.equip)) {
    const item = itemOf(state, uid);
    if (!item) continue;
    const s = itemStats(item);
    for (const k of Object.keys(total.flat)) total.flat[k] += s.flat[k];
    for (const k of Object.keys(total.pct)) total.pct[k] += s.pct[k];
    total.critPct += s.critPct;
  }
  return total;
}

// ----- 이름 -----

export function displayName(item, { enhance = true } = {}) {
  const k = EQUIP_KINDS[item.kind];
  const g = GRADES[item.grade];
  const base = g.prefix === null ? k.legend.name : g.prefix + k.tierNames[item.tier - 1];
  return enhance && item.enhance > 0 ? `${base} +${item.enhance}` : base;
}

// ----- 장착 / 해제 -----

export function ownerOf(state, uid) {
  for (const cid of ownedIds(state)) {
    const e = entryOf(state, cid);
    if (!e?.equip) continue;
    for (const [slot, id] of Object.entries(e.equip)) {
      if (id === uid) return { cid, slot };
    }
  }
  return null;
}

export function equipItem(state, cid, uid) {
  ensureEquip(state);
  const item = itemOf(state, uid);
  if (!item) return { err: 'no-item' };
  const entry = entryOf(state, cid);
  if (!entry) return { err: 'no-char' };
  if (!canEquip(state, cid, item.kind)) return { err: 'class' };
  const slot = EQUIP_KINDS[item.kind].slot;
  const prev = ownerOf(state, uid);
  if (prev) entryOf(state, prev.cid).equip[prev.slot] = null;   // 다른 착용자에게서 회수
  entry.equip[slot] = uid;
  return { ok: true, slot };
}

export function unequip(state, cid, slot) {
  ensureEquip(state);
  const entry = entryOf(state, cid);
  if (!entry?.equip?.[slot]) return { err: 'empty' };
  entry.equip[slot] = null;
  return { ok: true };
}

// ----- 대장간 제작 -----

export function craftTierCap(state) {
  const lv = state.base?.buildings?.smith?.lv ?? 0;
  return lv > 0 ? E().craft.tierBySmithLv[lv - 1] : 0;
}

export function craftCost(tier) {
  return { gold: E().craft.gold[tier - 1], iron: E().craft.iron[tier - 1] };
}

// 등급 확률 — 대장간 Lv당 일반→희귀 이동
function craftWeights(state) {
  const lv = state.base?.buildings?.smith?.lv ?? 1;
  const [n, f, r] = E().craft.gradeWeights;
  const shift = E().craft.smithLvRareShift * (lv - 1);
  return [Math.max(0, n - shift), f, r + shift];
}

function rollWeighted(roll, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = roll * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x < 0) return i + 1;    // 등급 1~
  }
  return weights.length;
}

export function craft(state, kindId, tier) {
  ensureEquip(state);
  const cap = craftTierCap(state);
  if (cap <= 0) return { err: 'no-smith' };
  if (!EQUIP_KINDS[kindId]) return { err: 'kind' };
  if (tier < 1 || tier > cap) return { err: 'tier', cap };
  const cost = craftCost(tier);
  if ((state.resources.gold ?? 0) < cost.gold) return { err: 'gold', cost };
  if ((state.resources.iron ?? 0) < cost.iron) return { err: 'iron', cost };
  // 결정성: 제작 1회 = 난수 1개 고정 소비
  const rng = new RNG(`${state.seed}:craft`);
  for (let i = 0; i < state.craftCount; i++) rng.next();
  state.craftCount += 1;
  const grade = rollWeighted(rng.next(), craftWeights(state));
  state.resources.gold -= cost.gold;
  state.resources.iron -= cost.iron;
  const item = makeItem(state, kindId, tier, grade);
  return { ok: true, item, cost };
}

// ----- 강화 (+0~+10, 실패 없음 — 기획서) -----

export function enhanceCost(item) {
  const next = (item.enhance ?? 0) + 1;
  return {
    stone: BALANCE.enhance.stoneCost(next),
    gold: BALANCE.enhance.goldCost(item.tier, next),
    next,
  };
}

export function enhance(state, uid) {
  ensureEquip(state);
  const item = itemOf(state, uid);
  if (!item) return { err: 'no-item' };
  if ((item.enhance ?? 0) >= BALANCE.enhance.maxLevel) return { err: 'max' };
  const cost = enhanceCost(item);
  if ((state.resources.enhStone ?? 0) < cost.stone) return { err: 'stone', cost };
  if ((state.resources.gold ?? 0) < cost.gold) return { err: 'gold', cost };
  state.resources.enhStone -= cost.stone;
  state.resources.gold -= cost.gold;
  item.enhance = cost.next;
  return { ok: true, enhance: item.enhance, cost };
}

// ----- 심볼전 승리 드랍 -----

// 스테이지 레벨 → 장비 티어 (10레벨당 1티어, 1~6)
export function tierOfStageLevel(level) {
  return Math.max(1, Math.min(6, Math.ceil(level / 10)));
}

// 결정성: 드랍 1회 = 난수 4개 고정 소비 (장비 여부·계열·등급·강화석 수)
export function rollDrop(state, stageLevel) {
  ensureEquip(state);
  const rng = new RNG(`${state.seed}:drop`);
  for (let i = 0; i < state.dropCount * 4; i++) rng.next();
  state.dropCount += 1;
  const r = [rng.next(), rng.next(), rng.next(), rng.next()];
  const d = E().drop;
  const stones = d.stoneMin + Math.floor(r[3] * (d.stoneMax - d.stoneMin + 1));
  state.resources.enhStone = (state.resources.enhStone ?? 0) + stones;
  let item = null;
  if (r[0] < d.equipChance) {
    const kinds = Object.keys(EQUIP_KINDS);
    const kind = kinds[Math.floor(r[1] * kinds.length)];
    const grade = rollWeighted(r[2], d.gradeWeights);
    item = makeItem(state, kind, tierOfStageLevel(stageLevel), grade);
  }
  return { item, stones };
}
