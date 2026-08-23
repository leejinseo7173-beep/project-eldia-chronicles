// ============================================================
// shop.js(씬) — 상점: 장비 완제품·강화석 구매, 조각 교환, 장비 판매 (M5-5)
//
// 거점 상점에서 진입. 탭 3개 [장비 / 조각 교환 / 판매] — Q·E로 전환.
// 계산은 core/shop.js (규칙 4). 소모품은 전투 아이템 청크에서 합류.
// 조작: Q·E 탭 / ↑↓ 선택 / Z 구매·판매 / X 나가기 + 마우스 완결 (규칙 8).
// ============================================================

import { Scene } from './scene.js';
import { inRect } from '../core/input.js';
import { PALETTE, drawText, drawTextOutlined, drawPanel } from '../core/sprites.js';
import { BALANCE } from '../balance.js';
import * as SH from '../core/shop.js';
import * as EQ from '../core/equip.js';
import * as GR from '../core/growth.js';
import { EQUIP_KINDS, GRADES } from '../data/equipment.js';
import { CHARACTERS } from '../data/characters.js';
import { CONSUMABLES, describeConsumable } from '../data/items.js';
import { GIFTS } from '../data/bonds.js';
import { equipIcon } from '../core/equip_icons.js';

const W = 960, H = 540;
const CHAR_GRADE_COLOR = { 1: 'gray3', 2: 'skyBlue', 3: 'gold' };   // 캐릭터 ★등급 색
const TABS = [
  { id: 'buy', label: '장비' },
  { id: 'shard', label: '조각 교환' },
  { id: 'sell', label: '판매' },
];

export class ShopScene extends Scene {
  constructor() {
    super();
    this.isGameplay = true;
  }

  enter(game) {
    EQ.ensureEquip(game.state);
    this.tab = 0;
    this.sel = 0;
    this.t = 0;
  }

  update(dt) { this.t += dt; }

  // ----- 목록 구성 (탭별 행) -----

  rows(game) {
    const st = game.state;
    if (TABS[this.tab].id === 'buy') {
      const out = [];
      for (const cid of Object.keys(CONSUMABLES)) {
        out.push({ type: 'consumable', item: cid, gold: SH.consumablePrice(cid) });
      }
      for (const gid of Object.keys(GIFTS)) {
        out.push({ type: 'gift', item: gid, gold: SH.giftPrice() });
      }
      out.push({ type: 'stone', n: 1, gold: SH.stonePrice(1) });
      out.push({ type: 'stone', n: BALANCE.shop.stoneBundle.count, gold: BALANCE.shop.stoneBundle.gold });
      for (const o of SH.equipOffers()) out.push({ type: 'equip', ...o });
      return out;
    }
    if (TABS[this.tab].id === 'shard') {
      return GR.ownedIds(st).filter((cid) => cid !== 'hero').map((cid) => ({
        type: 'shard', cid, badge: SH.shardPrice(cid), entry: GR.entryOf(st, cid),
      }));
    }
    return st.inventory.equips.map((it) => ({
      type: 'sell', item: it, gold: SH.sellPrice(it), equipped: !!EQ.ownerOf(st, it.uid),
    }));
  }

  // ----- 행동 -----

  act(game) {
    const row = this.rows(game)[this.sel];
    if (!row) { game.audio.playSE('error'); return; }
    const st = game.state;
    let r;
    if (row.type === 'consumable') {
      r = SH.buyConsumable(st, row.item);
      if (r.ok) game.showToast(`${CONSUMABLES[row.item].name} 구매 (보유 ${r.count})`);
    } else if (row.type === 'gift') {
      r = SH.buyGift(st, row.item);
      if (r.ok) game.showToast(`${GIFTS[row.item].name} 구매 (보유 ${r.count})`);
    } else if (row.type === 'stone') {
      r = SH.buyStone(st, row.n);
      if (r.ok) game.showToast(`강화석 +${r.n} (골드 ${r.gold})`);
    } else if (row.type === 'equip') {
      r = SH.buyEquip(st, row.kind, row.tier);
      if (r.ok) game.showToast(`${EQ.displayName(r.item)} 구매 (골드 ${r.gold})`);
    } else if (row.type === 'shard') {
      r = SH.buyShard(st, row.cid);
      if (r.ok) game.showToast(`${CHARACTERS[row.cid].name}의 조각 +1 (증표 ${r.badge})`);
    } else {
      r = SH.sellEquip(st, row.item.uid);
      if (r.ok) {
        game.showToast(`${EQ.displayName(row.item)} 판매 (골드 +${r.gold})`);
        this.sel = Math.max(0, Math.min(this.sel, this.rows(game).length - 1));
      }
    }
    if (r?.ok) { game.audio.playSE('confirm'); return; }
    game.audio.playSE('error');
    if (r?.err === 'gold') game.showToast(`골드가 부족합니다 (필요 ${r.gold})`);
    else if (r?.err === 'badge') game.showToast(`증표가 부족합니다 (필요 ${r.badge})`);
    else if (r?.err === 'full') game.showToast('이미 완돌까지 필요한 조각이 다 있습니다');
    else if (r?.err === 'equipped') game.showToast('장착 중인 장비는 팔 수 없습니다 — 육성에서 해제하세요');
    else if (r?.err === 'locked') game.showToast('잠긴 장비입니다');
  }

  setTab(game, d) {
    this.tab = (this.tab + d + TABS.length) % TABS.length;
    this.sel = 0;
    game.audio.playSE('move');
  }

  back(game) {
    game.audio.playSE('cancel');
    game.changeScene('base');
  }

  // ----- 입력 -----

  onKeyDown(code, game) {
    const n = this.rows(game).length;
    if (code === 'Escape' || code === 'KeyX') { this.back(game); return; }
    if (code === 'KeyQ') { this.setTab(game, -1); return; }
    if (code === 'KeyE' || code === 'Tab') { this.setTab(game, 1); return; }
    if (!n) return;
    if (code === 'ArrowDown') { this.sel = (this.sel + 1) % n; game.audio.playSE('move'); }
    else if (code === 'ArrowUp') { this.sel = (this.sel + n - 1) % n; game.audio.playSE('move'); }
    else if (code === 'KeyZ' || code === 'Enter') this.act(game);
  }

  tabRect(i) { return { x: 20 + i * 130, y: 62, w: 124, h: 30 }; }
  rowRect(i) { return { x: 20, y: 108 + i * 44, w: 560, h: 42 }; }
  buyBtn() { return { x: 640, y: 452, w: 300, h: 46 }; }
  top(n) { return Math.max(0, Math.min(this.sel - 8, n - 9)); }

  onMouseDown(x, y, button, game) {
    for (let i = 0; i < TABS.length; i++) {
      if (inRect(x, y, this.tabRect(i))) {
        if (this.tab !== i) { this.tab = i; this.sel = 0; game.audio.playSE('move'); }
        return;
      }
    }
    const rows = this.rows(game);
    const top = this.top(rows.length);
    for (let i = top; i < Math.min(rows.length, top + 9); i++) {
      if (inRect(x, y, this.rowRect(i - top))) {
        if (this.sel !== i) { this.sel = i; game.audio.playSE('move'); }
        else this.act(game);
        return;
      }
    }
    if (inRect(x, y, this.buyBtn())) { this.act(game); return; }
  }

  // ----- 그리기 -----

  rowMain(row, game) {
    if (row.type === 'consumable') {
      const c = CONSUMABLES[row.item];
      const have = game.state.inventory.consumables?.[row.item] ?? 0;
      return { icon: null, name: c.name, sub: `${describeConsumable(row.item)} · 보유 ${have}`, price: `골드 ${row.gold}`, color: PALETTE.green };
    }
    if (row.type === 'gift') {
      const have = game.state.inventory.gifts?.[row.item] ?? 0;
      return { icon: null, name: GIFTS[row.item].name, sub: `교감 선물 (병영) · 보유 ${have}`, price: `골드 ${row.gold}`, color: PALETTE.red };
    }
    if (row.type === 'stone') return { icon: null, name: `강화석 ×${row.n}`, sub: '장비 강화 재료', price: `골드 ${row.gold}`, color: PALETTE.skyBlue };
    if (row.type === 'equip') {
      const k = EQUIP_KINDS[row.kind];
      return { icon: row.kind, name: k.tierNames[row.tier - 1], sub: `T${row.tier} 일반 · ${k.name}`, price: `골드 ${row.gold}`, color: PALETTE.gray4 };
    }
    if (row.type === 'shard') {
      const c = CHARACTERS[row.cid];
      const e = row.entry;
      return {
        icon: null, name: `${c.name}의 조각`, color: PALETTE[CHAR_GRADE_COLOR[c.grade]] ?? PALETTE.gray4,
        sub: `★${c.grade} · 한돌 ${e.lb}/${BALANCE.limitBreak.maxSteps} · 보유 조각 ${e.shards}`,
        price: `증표 ${row.badge}`,
      };
    }
    const it = row.item;
    return {
      icon: it.kind, name: EQ.displayName(it), color: PALETTE[GRADES[it.grade].color],
      sub: `T${it.tier}${row.equipped ? ' · 장착 중' : ''}`, price: `골드 +${row.gold}`,
    };
  }

  render(g, game) {
    const st = game.state;
    g.fillStyle = '#12101a';
    g.fillRect(0, 0, W, H);
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(44, 58, 30, 0.35)');
    grad.addColorStop(1, 'rgba(13, 11, 20, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    drawTextOutlined(g, '상 점', 52, 44, { size: 22, bold: true, fill: PALETTE.gold, outline: PALETTE.black });
    drawText(g, '필요한 건 다 있소', 116, 44, { size: 10, fill: PALETTE.gray3 });
    drawPanel(g, 430, 16, 420, 34, { border: PALETTE.goldDark });
    drawText(g, `골드 ${st.resources.gold ?? 0}`, 448, 38, { size: 11, bold: true, fill: PALETTE.gold });
    drawText(g, `증표 ${st.resources.badge ?? 0}`, 580, 38, { size: 11, bold: true, fill: PALETTE.gold });
    drawText(g, `강화석 ${st.resources.enhStone ?? 0}`, 690, 38, { size: 11, bold: true, fill: PALETTE.skyBlue });
    drawPanel(g, 862, 16, 84, 26, { border: PALETTE.goldDark });
    drawText(g, '나가기 [X]', 904, 34, { size: 10, align: 'center', fill: PALETTE.gray4 });

    // 탭
    for (let i = 0; i < TABS.length; i++) {
      const r = this.tabRect(i);
      const on = i === this.tab;
      drawPanel(g, r.x, r.y, r.w, r.h, { border: on ? PALETTE.gold : PALETTE.navy3 });
      drawText(g, TABS[i].label, r.x + r.w / 2, r.y + 20, { size: 12, bold: on, align: 'center', fill: on ? PALETTE.gold : PALETTE.gray3 });
    }
    drawText(g, '[Q·E] 탭 전환', 580, 82, { size: 9, align: 'right', fill: PALETTE.gray2 });

    // 목록
    drawPanel(g, 12, 98, 576, 426, { border: PALETTE.goldDark });
    const rows = this.rows(game);
    if (!rows.length) {
      drawText(g, this.tab === 2 ? '팔 장비가 없습니다' : '살 수 있는 것이 없습니다', 300, 300, { size: 12, align: 'center', fill: PALETTE.gray2 });
    }
    const top = this.top(rows.length);
    for (let i = top; i < Math.min(rows.length, top + 9); i++) {
      const row = rows[i];
      const r = this.rowRect(i - top);
      const on = i === this.sel;
      const m = this.rowMain(row, game);
      if (on) {
        g.fillStyle = PALETTE.navy2;
        g.fillRect(r.x + 4, r.y, r.w - 8, r.h);
        g.strokeStyle = PALETTE.gold;
        g.lineWidth = 1;
        g.strokeRect(r.x + 4.5, r.y + 0.5, r.w - 9, r.h - 1);
      }
      if (m.icon) {
        const icon = equipIcon(m.icon);
        if (icon) {
          g.imageSmoothingEnabled = true;
          g.drawImage(icon, r.x + 10, r.y + 5, 32, 32);
          g.imageSmoothingEnabled = false;
        }
      } else if (row.type === 'stone') {
        g.fillStyle = PALETTE.skyBlue;
        g.fillRect(r.x + 18, r.y + 12, 16, 16);
        g.fillStyle = PALETTE.white;
        g.fillRect(r.x + 21, r.y + 15, 4, 4);
      } else if (row.type === 'consumable') {
        // 물약 실루엣 — 간단 코드 생성 (아이콘 발주 전 임시)
        g.fillStyle = PALETTE.green;
        g.fillRect(r.x + 20, r.y + 16, 12, 14);
        g.fillStyle = PALETTE.gray4;
        g.fillRect(r.x + 23, r.y + 10, 6, 6);
      } else if (row.type === 'gift') {
        g.fillStyle = PALETTE.red;
        g.fillRect(r.x + 18, r.y + 16, 16, 12);
        g.fillStyle = PALETTE.gold;
        g.fillRect(r.x + 24, r.y + 12, 4, 16);
      } else if (row.type === 'shard') {
        g.fillStyle = PALETTE.purple;
        g.beginPath();
        g.moveTo(r.x + 26, r.y + 9);
        g.lineTo(r.x + 34, r.y + 21);
        g.lineTo(r.x + 26, r.y + 33);
        g.lineTo(r.x + 18, r.y + 21);
        g.closePath();
        g.fill();
      }
      drawText(g, m.name, r.x + 52, r.y + 18, { size: 12, bold: on, fill: m.color });
      drawText(g, m.sub, r.x + 52, r.y + 34, { size: 9, fill: PALETTE.gray3 });
      drawText(g, m.price, r.x + r.w - 14, r.y + 26, { size: 11, bold: true, align: 'right', fill: PALETTE.gold });
    }
    if (rows.length > 9) drawText(g, `${this.sel + 1} / ${rows.length}`, 300, 516, { size: 9, align: 'center', fill: PALETTE.gray2 });

    // 우측 상세
    drawPanel(g, 600, 98, 348, 340, { border: PALETTE.goldDark });
    const row = rows[this.sel];
    if (row) {
      const m = this.rowMain(row, game);
      if (m.icon) {
        const icon = equipIcon(m.icon);
        if (icon) {
          g.imageSmoothingEnabled = true;
          g.drawImage(icon, 742, 118, 64, 64);
          g.imageSmoothingEnabled = false;
        }
      }
      drawTextOutlined(g, m.name, 774, 208, { size: 14, bold: true, align: 'center', fill: m.color, outline: PALETTE.black });
      drawText(g, m.sub, 774, 228, { size: 10, align: 'center', fill: PALETTE.gray3 });
      if (row.type === 'consumable') {
        drawText(g, describeConsumable(row.item), 774, 254, { size: 10, align: 'center', fill: PALETTE.gray4 });
      } else if (row.type === 'gift') {
        drawText(g, '병영에서 동료에게 선물 — 취향이 맞으면 대폭', 774, 254, { size: 10, align: 'center', fill: PALETTE.gray4 });
      } else if (row.type === 'equip' || row.type === 'sell') {
        const it = row.type === 'sell' ? row.item : { kind: row.kind, tier: row.tier, grade: 1, enhance: 0, subs: [] };
        const s = EQ.itemStats(it);
        const L = { atk: '공격', mag: '마력', hp: 'HP', def: '방어', spd: '속도' };
        const parts = [];
        for (const [key, v] of Object.entries(s.flat)) if (v) parts.push(`${L[key]} +${v}`);
        if (s.critPct) parts.push(`치명 +${s.critPct}%`);
        drawText(g, parts.join('  '), 774, 254, { size: 10, align: 'center', fill: PALETTE.gray4 });
      } else if (row.type === 'shard') {
        drawText(g, '한계돌파 재료 — 1개 = 한돌 1회', 774, 254, { size: 10, align: 'center', fill: PALETTE.gray4 });
      } else {
        drawText(g, '대장간 강화에 사용', 774, 254, { size: 10, align: 'center', fill: PALETTE.gray4 });
      }
      drawTextOutlined(g, m.price, 774, 300, { size: 14, bold: true, align: 'center', fill: PALETTE.gold, outline: PALETTE.black });
    }
    const b = this.buyBtn();
    const hov = inRect(game.input.mouse.x, game.input.mouse.y, b);
    drawPanel(g, b.x, b.y, b.w, b.h, { border: hov ? PALETTE.gold : PALETTE.goldDark });
    drawText(g, `${this.tab === 2 ? '판매' : '구매'}  [Z]`, b.x + b.w / 2, b.y + 28, { size: 14, bold: true, align: 'center', fill: PALETTE.white });

    drawText(g, 'Q·E 탭 · ↑↓ 선택 · Z 구매/판매 · X 나가기', W / 2, H - 6, { size: 10, align: 'center', fill: PALETTE.gray2 });
  }
}
