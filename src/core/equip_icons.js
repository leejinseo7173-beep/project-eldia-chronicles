// ============================================================
// equip_icons.js — 장비 아이콘 로더 (자체 작화 64×64, M5-4)
// 육성·대장간 씬 공용. 로드 전에는 null — 그리는 쪽이 폴백(빈 칸)을 처리한다.
// ============================================================

import { EQUIP_ICONS } from '../data/equip_icon_assets.js';

const cache = new Map();

export function equipIcon(kind) {
  if (!cache.has(kind)) {
    const img = new Image();
    const entry = { img, ready: false };
    img.onload = () => { entry.ready = true; };
    img.onerror = () => {};
    img.src = EQUIP_ICONS[kind];
    cache.set(kind, entry);
  }
  const e = cache.get(kind);
  return e.ready ? e.img : null;
}
