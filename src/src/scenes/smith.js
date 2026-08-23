// ============================================================
// smith.js(씬) — 대장간: 제작 + 강화 (기획서 §10·§12, M5-4)
//
// 거점 대장간에서 진입. 왼쪽 계열 12종 → 가운데 제작(티어·비용·간단 연출)
// → 오른쪽 보유 장비 목록 + 강화. 계산은 core/equip.js (규칙 4).
// 제작 연출은 사용자 확정(2026-08-16): 망치질 + 등급색 섬광 1회 — 반복 제작에
// 안 거슬리게 짧게. 조작: ↑↓ 계열 / Q·E 티어 / Z 제작 / Tab 목록 / C 강화 / X 나가기.
// ============================================================

import { Scene } from './scene.js';
import { inRect } from '../core/input.js';
import { PALETTE, drawText, drawTextOutlined, drawPanel } from '../core/sprites.js';
import { BALANCE } from '../balance.js';
import * as EQ from '../core/equip.js';
import { EQUIP_KINDS, GRADES, SLOT_LABELS, SUB_LABELS } from '../data/equipment.js';
import { equipIcon } from '../core/equip_icons.js';

const W = 960, H = 540;
const KIND_IDS = Object.keys(EQUIP_KINDS);

export class SmithScene extends Scene {
  constructor() {
    super();
    this.isGameplay = true;
  }

  enter(game) {
    EQ.ensureEquip(game.state);
    this.kindSel = 0;
    this.tier = 1;
    this.focus = 'craft';        // craft | inv
    this.invSel = 0;
    this.made = null;            // 방금 제작한 장비
    this.fx = null;              // 제작 연출 { t, grade }
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
    if (this.fx) {
      this.fx.t += dt;
      if (this.fx.t > 0.55) this.fx = null;
    }
  }

  kind() { return EQUIP_KINDS[KIND_IDS[this.kindSel]]; }
  inv(game) { return game.state.inventory.equips; }

  // ----- 행동 -----

  doCraft(game) {
    const cap = EQ.craftTierCap(game.state);
    const r = EQ.craft(game.state, KIND_IDS[this.kindSel], this.tier);
    if (r.ok) {
      this.made = r.item;
      this.fx = { t: 0, grade: r.item.grade };
      game.audio.playSE('hit');
      if (r.item.grade >= 3) game.audio.playSE('crit');
      return;
    }
    game.audio.playSE('error');
    if (r.err === 'no-smith') game.showToast('대장간이 없습니다');
    else if (r.err === 'tier') game.showToast(`대장간 Lv로는 T${cap}까지 제작 가능합니다`);
    else if (r.err === 'gold') game.showToast(`골드가 부족합니다 (필요 ${r.cost.gold})`);
    else if (r.err === 'iron') game.showToast(`철광석이 부족합니다 (필요 ${r.cost.iron})`);
  }

  doEnhance(game) {
    const item = this.inv(game)[this.invSel];
    if (!item) { game.audio.playSE('error'); return; }
    const r = EQ.enhance(game.state, item.uid);
    if (r.ok) {
      game.audio.playSE('powerup');
      game.showToast(`${EQ.displayName(item)} — 강화 성공!`);
      return;
    }
    game.audio.playSE('error');
    if (r.err === 'max') game.showToast('이미 +10입니다');
    else if (r.err === 'stone') game.showToast(`강화석이 부족합니다 (필요 ${r.cost.stone})`);
    else if (r.err === 'gold') game.showToast(`골드가 부족합니다 (필요 ${r.cost.gold})`);
  }

  back(game) {
    game.audio.playSE('cancel');
    game.changeScene('base');
  }

  // ----- 입력 -----

  onKeyDown(code, game) {
    const cap = Math.max(1, EQ.craftTierCap(game.state));
    if (code === 'Escape' || code === 'KeyX') { this.back(game); return; }
    if (code === 'Tab') {
      this.focus = this.focus === 'craft' ? 'inv' : 'craft';
      game.audio.playSE('move');
      return;
    }
    if (this.focus === 'craft') {
      const n = KIND_IDS.length;
      if (code === 'ArrowDown') { this.kindSel = (this.kindSel + 1) % n; game.audio.playSE('move'); }
      else if (code === 'ArrowUp') { this.kindSel = (this.kindSel + n - 1) % n; game.audio.playSE('move'); }
      else if (code === 'KeyQ') { this.tier = Math.max(1, this.tier - 1); game.audio.playSE('move'); }
      else if (code === 'KeyE') { this.tier = Math.min(cap, this.tier + 1); game.audio.playSE('move'); }
      else if (code === 'KeyZ' || code === 'Enter') this.doCraft(game);
    } else {
      const n = this.inv(game).length;
      if (!n) { this.focus = 'craft'; return; }
      if (code === 'ArrowDown') { this.invSel = (this.invSel + 1) % n; game.audio.playSE('move'); }
      else if (code === 'ArrowUp') { this.invSel = (this.invSel + n - 1) % n; game.audio.playSE('move'); }
      else if (code === 'KeyC' || code === 'KeyZ' || code === 'Enter') this.doEnhance(game);
    }
  }

  kindRect(i) { return { x: 20, y: 92 + i * 34, w: 268, h: 32 }; }
  invRect(i) { return { x: 652, y: 112 + i * 40, w: 292, h: 38 }; }
  craftBtn() { return { x: 356, y: 424, w: 240, h: 44 }; }
  enhanceBtn() { return { x: 652, y: 474, w: 292, h: 40 }; }

  onMouseDown(x, y, button, game) {
    for (let i = 0; i < KIND_IDS.length; i++) {
      if (inRect(x, y, this.kindRect(i))) {
        this.kindSel = i; this.focus = 'craft'; game.audio.playSE('move');
        return;
      }
    }
    if (inRect(x, y, { x: 380, y: 214, w: 26, h: 26 })) { this.tier = Math.max(1, this.tier - 1); game.audio.playSE('move'); return; }
    if (inRect(x, y, { x: 546, y: 214, w: 26, h: 26 })) { this.tier = Math.min(Math.max(1, EQ.craftTierCap(game.state)), this.tier + 1); game.audio.playSE('move'); return; }
    if (inRect(x, y, this.craftBtn())) { this.doCraft(game); return; }
    const inv = this.inv(game);
    const top = this.invTop(inv.length);
    for (let i = top; i < Math.min(inv.length, top + 8); i++) {
      if (inRect(x, y, this.invRect(i - top))) {
        this.invSel = i; this.focus = 'inv'; game.audio.playSE('move');
        return;
      }
    }
    if (inRect(x, y, this.enhanceBtn())) { this.focus = 'inv'; this.doEnhance(game); return; }
  }

  invTop(n) { return Math.max(0, Math.min(this.invSel - 7, n - 8)); }

  // ----- 그리기 -----

  render(g, game) {
    const st = game.state;
    g.fillStyle = '#141019';
    g.fillRect(0, 0, W, H);
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(80, 44, 28, 0.35)');     // 화덕 온기
    grad.addColorStop(1, 'rgba(13, 11, 20, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    drawTextOutlined(g, '대 장 간', 60, 44, { size: 22, bold: true, fill: PALETTE.gold, outline: PALETTE.black });
    drawText(g, '두드릴수록 강해진다', 148, 44, { size: 10, fill: PALETTE.gray3 });
    drawPanel(g, 470, 16, 380, 34, { border: PALETTE.goldDark });
    drawText(g, `골드 ${st.resources.gold ?? 0}`, 488, 38, { size: 11, bold: true, fill: PALETTE.gold });
    drawText(g, `철광석 ${st.resources.iron ?? 0}`, 610, 38, { size: 11, bold: true, fill: PALETTE.gray4 });
    drawText(g, `강화석 ${st.resources.enhStone ?? 0}`, 730, 38, { size: 11, bold: true, fill: PALETTE.skyBlue });
    drawPanel(g, 862, 16, 84, 26, { border: PALETTE.goldDark });
    drawText(g, '나가기 [X]', 904, 34, { size: 10, align: 'center', fill: PALETTE.gray4 });

    // ----- 왼쪽: 계열 12종 -----
    drawPanel(g, 12, 62, 284, 462, { border: PALETTE.goldDark });
    drawText(g, '제작 계열', 28, 84, { size: 11, bold: true, fill: PALETTE.gray4 });
    for (let i = 0; i < KIND_IDS.length; i++) {
      const k = EQUIP_KINDS[KIND_IDS[i]];
      const r = this.kindRect(i);
      const on = i === this.kindSel;
      if (on) {
        g.fillStyle = PALETTE.navy2;
        g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = this.focus === 'craft' ? PALETTE.gold : PALETTE.navy3;
        g.lineWidth = 1;
        g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      }
      const icon = equipIcon(k.id);
      if (icon) {
        g.imageSmoothingEnabled = true;
        g.drawImage(icon, r.x + 4, r.y + 4, 24, 24);
        g.imageSmoothingEnabled = false;
      }
      drawText(g, k.name, r.x + 36, r.y + 21, { size: 12, bold: on, fill: on ? PALETTE.white : PALETTE.gray4 });
      drawText(g, SLOT_LABELS[k.slot], r.x + r.w - 10, r.y + 21, { size: 9, align: 'right', fill: PALETTE.gray2 });
    }

    // ----- 가운데: 제작 -----
    const cap = EQ.craftTierCap(st);
    drawPanel(g, 308, 62, 328, 462, { border: PALETTE.goldDark });
    const k = this.kind();
    const big = equipIcon(k.id);
    // 제작 연출 — 등급색 섬광 링 + 망치 흔들림
    if (this.fx) {
      const q = this.fx.t / 0.55;
      const col = PALETTE[GRADES[this.fx.grade].color];
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = (1 - q) * 0.8;
      g.strokeStyle = col;
      g.lineWidth = 4;
      g.beginPath();
      g.arc(472, 152, 20 + q * 70, 0, Math.PI * 2);
      g.stroke();
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }
    const shake = this.fx && this.fx.t < 0.15 ? Math.round(Math.sin(this.fx.t * 90) * 3) : 0;
    if (big) {
      g.imageSmoothingEnabled = true;
      g.drawImage(big, 440 + shake, 120, 64, 64);
      g.imageSmoothingEnabled = false;
    }
    drawTextOutlined(g, k.name, 472, 96, { size: 15, bold: true, align: 'center', fill: PALETTE.white, outline: PALETTE.black });
    // 티어 선택
    drawText(g, '◀', 393, 233, { size: 13, align: 'center', fill: PALETTE.gold });
    drawText(g, '▶', 559, 233, { size: 13, align: 'center', fill: PALETTE.gold });
    drawTextOutlined(g, `T${this.tier}  ${k.tierNames[this.tier - 1]}`, 472, 233, { size: 13, bold: true, align: 'center', fill: PALETTE.gray4, outline: PALETTE.black });
    drawText(g, `대장간 Lv${st.base?.buildings?.smith?.lv ?? 0} — T${cap}까지 제작 가능 [Q·E]`, 472, 254, { size: 9, align: 'center', fill: PALETTE.gray2 });
    // 비용·확률
    const cost = EQ.craftCost(this.tier);
    drawText(g, `비용  골드 ${cost.gold} · 철광석 ${cost.iron}`, 472, 282, { size: 11, align: 'center', fill: PALETTE.gray4 });
    drawText(g, '등급  일반 · 정련된 · 축복받은 중 하나', 472, 300, { size: 9, align: 'center', fill: PALETTE.gray2 });

    // 방금 제작한 결과
    if (this.made) {
      const it = this.made;
      const gcol = PALETTE[GRADES[it.grade].color];
      drawPanel(g, 330, 318, 284, 92, { border: gcol });
      drawText(g, `${GRADES[it.grade].label}!`, 348, 340, { size: 10, bold: true, fill: gcol });
      drawTextOutlined(g, EQ.displayName(it), 472, 356, { size: 12, bold: true, align: 'center', fill: gcol, outline: PALETTE.black });
      const s = EQ.itemStats(it);
      const L = { atk: '공격', mag: '마력', hp: 'HP', def: '방어', spd: '속도' };
      const parts = [];
      for (const [key, v] of Object.entries(s.flat)) if (v) parts.push(`${L[key]} +${v}`);
      if (s.critPct) parts.push(`치명 +${s.critPct}%`);
      drawText(g, parts.join('  '), 472, 376, { size: 10, align: 'center', fill: PALETTE.gray4 });
      const subs = (it.subs ?? []).map((x) => SUB_LABELS[x.key].replace('{v}', x.val)).join('  ');
      if (subs) drawText(g, `부옵 ${subs}`, 472, 394, { size: 10, align: 'center', fill: PALETTE.skyBlue });
    }

    const cb = this.craftBtn();
    const hov = inRect(game.input.mouse.x, game.input.mouse.y, cb);
    drawPanel(g, cb.x, cb.y, cb.w, cb.h, { border: hov ? PALETTE.gold : PALETTE.goldDark });
    drawText(g, '제작  [Z]', cb.x + cb.w / 2, cb.y + 27, { size: 14, bold: true, align: 'center', fill: PALETTE.white });

    // ----- 오른쪽: 보유 장비 + 강화 -----
    drawPanel(g, 640, 62, 316, 462, { border: PALETTE.goldDark });
    const inv = this.inv(game);
    drawText(g, `보유 장비 ${inv.length}개`, 656, 84, { size: 11, bold: true, fill: PALETTE.gray4 });
    drawText(g, '[Tab] 목록', 940, 84, { size: 9, align: 'right', fill: PALETTE.gray2 });
    const top = this.invTop(inv.length);
    for (let i = top; i < Math.min(inv.length, top + 8); i++) {
      const it = inv[i];
      const r = this.invRect(i - top);
      const on = this.focus === 'inv' && i === this.invSel;
      const gcol = PALETTE[GRADES[it.grade].color];
      if (on) {
        g.fillStyle = PALETTE.navy2;
        g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = PALETTE.gold;
        g.lineWidth = 1;
        g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      }
      const icon = equipIcon(it.kind);
      if (icon) {
        g.imageSmoothingEnabled = true;
        g.drawImage(icon, r.x + 4, r.y + 5, 28, 28);
        g.imageSmoothingEnabled = false;
      }
      const owner = EQ.ownerOf(game.state, it.uid);
      drawText(g, `T${it.tier} ${EQ.displayName(it)}`, r.x + 40, r.y + 17, { size: 10, bold: on, fill: gcol });
      drawText(g, owner ? '장착 중' : '보관', r.x + r.w - 8, r.y + 17, { size: 8, align: 'right', fill: owner ? PALETTE.green : PALETTE.gray2 });
      const s = EQ.itemStats(it);
      const L = { atk: '공', mag: '마', hp: 'HP', def: '방', spd: '속' };
      const parts = [];
      for (const [key, v] of Object.entries(s.flat)) if (v) parts.push(`${L[key]}+${v}`);
      drawText(g, parts.slice(0, 4).join(' '), r.x + 40, r.y + 32, { size: 9, fill: PALETTE.gray3 });
    }
    if (inv.length > 8) drawText(g, `${this.invSel + 1} / ${inv.length}`, 798, 442, { size: 9, align: 'center', fill: PALETTE.gray2 });

    // 강화 버튼 — 선택 장비 기준 실수치
    const sel = inv[this.invSel];
    const eb = this.enhanceBtn();
    const ehov = inRect(game.input.mouse.x, game.input.mouse.y, eb);
    const maxed = sel && (sel.enhance ?? 0) >= BALANCE.enhance.maxLevel;
    drawPanel(g, eb.x, eb.y, eb.w, eb.h, { border: !sel || maxed ? PALETTE.gray1 : ehov ? PALETTE.gold : PALETTE.goldDark });
    if (sel && !maxed) {
      const c = EQ.enhanceCost(sel);
      drawText(g, `강화 +${sel.enhance} → +${c.next}  [C]`, eb.x + eb.w / 2, eb.y + 17, { size: 11, bold: true, align: 'center', fill: PALETTE.white });
      drawText(g, `강화석 ${c.stone} · 골드 ${c.gold}`, eb.x + eb.w / 2, eb.y + 32, { size: 9, align: 'center', fill: PALETTE.gray3 });
    } else {
      drawText(g, sel ? '강화 완료 (+10)' : '장비 없음', eb.x + eb.w / 2, eb.y + 24, { size: 11, align: 'center', fill: PALETTE.gray2 });
    }

    drawText(g, '↑↓ 선택 · Q·E 티어 · Z 제작 · Tab 목록 · C 강화 · X 나가기',
      W / 2, H - 6, { size: 10, align: 'center', fill: PALETTE.gray2 });
  }
}
