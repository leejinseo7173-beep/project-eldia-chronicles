// ============================================================
// camp.js(씬) — 병영: 교감 (대화·선물·호감도) (기획서 §12, M5-7)
//
// 거점 병영에서 진입. 좌 동료 목록(호감 Lv·단계) → 우 상세:
// 호감 게이지·보너스·대사 박스 + [대화 Z(1일 1회)] [선물 C(1일 1회)].
// 계산은 core/bond.js (규칙 4). 대사는 data/bonds.js — 스토리 작업 때 교체(사용자 지시).
// Lv3 서브퀘·Lv5 비하인드는 후속 마일스톤 — 잠금 표기만.
// 조작: ↑↓ 선택 / Z 대화 / C 선물 / X 나가기 + 마우스 완결 (규칙 8).
// ============================================================

import { Scene } from './scene.js';
import { inRect } from '../core/input.js';
import { PALETTE, drawText, drawTextOutlined, drawPanel, makeUnitSprites, loadAssetSprites, sprScale } from '../core/sprites.js';
import { SPRITE_ASSETS } from '../data/sprite_assets.js';
import { CHARACTERS } from '../data/characters.js';
import { BALANCE } from '../balance.js';
import * as BD from '../core/bond.js';
import * as GR from '../core/growth.js';
import { BOND_LABELS, GIFTS, GIFT_PREF, TALKS, talkTier } from '../data/bonds.js';

const W = 960, H = 540;

const portraitCache = {};
function portraitOf(def) {
  if (def.assetKey && SPRITE_ASSETS[def.assetKey]) {
    const entry = loadAssetSprites(def.assetKey, SPRITE_ASSETS[def.assetKey]);
    if (entry.set) return entry.set.idle.right[0];
  }
  const key = JSON.stringify(def.spriteCfg);
  if (!portraitCache[key]) {
    const resolved = {};
    for (const [k, v] of Object.entries(def.spriteCfg)) resolved[k] = PALETTE[v] ?? v;
    portraitCache[key] = makeUnitSprites(resolved);
  }
  return portraitCache[key].idle.right[0];
}

export class CampScene extends Scene {
  constructor() {
    super();
    this.isGameplay = true;
  }

  enter(game) {
    BD.ensureBond(game.state);
    this.list = GR.ownedIds(game.state).filter((cid) => cid !== 'hero');
    this.sel = 0;
    this.line = null;            // 마지막 대화/선물 반응 대사
    this.giftModal = null;       // { sel }
    this.t = 0;
  }

  update(dt) { this.t += dt; }

  selId() { return this.list[this.sel]; }

  // ----- 행동 -----

  doTalk(game) {
    const cid = this.selId();
    if (!cid) return;
    const r = BD.talk(game.state, cid, Date.now());
    if (r.ok) {
      game.audio.playSE('confirm');
      this.line = TALKS[cid]?.[talkTier(r.lv)] ?? '…';
      if (r.to > r.from) {
        game.audio.playSE('powerup');
        game.showToast(`${CHARACTERS[cid].name} — 호감 ${BOND_LABELS[r.to - 1]} (Lv${r.to})!`);
      } else {
        game.showToast(`호감 +${r.pts}`);
      }
      return;
    }
    game.audio.playSE('error');
    if (r.err === 'cooldown') {
      const h = Math.ceil(r.remainMs / 3600000);
      game.showToast(`오늘은 이미 대화했습니다 (약 ${h}시간 후)`);
    }
  }

  openGift(game) {
    const cid = this.selId();
    if (!cid) return;
    if (!BD.canGift(game.state, cid, Date.now())) {
      game.audio.playSE('error');
      game.showToast('오늘은 이미 선물했습니다');
      return;
    }
    const owned = Object.keys(GIFTS).filter((id) => (game.state.inventory.gifts?.[id] ?? 0) > 0);
    if (!owned.length) {
      game.audio.playSE('error');
      game.showToast('선물이 없습니다 — 상점에서 살 수 있습니다');
      return;
    }
    this.giftModal = { sel: 0, items: owned };
    game.audio.playSE('confirm');
  }

  doGift(game, giftId) {
    const cid = this.selId();
    const r = BD.giveGift(game.state, cid, giftId, Date.now());
    this.giftModal = null;
    if (!r.ok) { game.audio.playSE('error'); return; }
    game.audio.playSE(r.match ? 'crit' : 'confirm');
    this.line = r.match ? `${GIFTS[giftId].name}…! 이걸 어떻게 알고. 정말 고마워.` : `${GIFTS[giftId].name}? 고마워, 잘 쓸게.`;
    if (r.to > r.from) {
      game.audio.playSE('powerup');
      game.showToast(`${CHARACTERS[cid].name} — 호감 ${BOND_LABELS[r.to - 1]} (Lv${r.to})!`);
    } else {
      game.showToast(r.match ? `취향 저격! 호감 +${r.pts}` : `호감 +${r.pts}`);
    }
  }

  back(game) {
    game.audio.playSE('cancel');
    game.changeScene('base');
  }

  // ----- 입력 -----

  onKeyDown(code, game) {
    if (this.giftModal) {
      const m = this.giftModal;
      if (code === 'ArrowDown') { m.sel = (m.sel + 1) % m.items.length; game.audio.playSE('move'); }
      else if (code === 'ArrowUp') { m.sel = (m.sel + m.items.length - 1) % m.items.length; game.audio.playSE('move'); }
      else if (code === 'KeyZ' || code === 'Enter') this.doGift(game, m.items[m.sel]);
      else if (code === 'Escape' || code === 'KeyX') { this.giftModal = null; game.audio.playSE('cancel'); }
      return;
    }
    const n = this.list.length;
    if (code === 'Escape' || code === 'KeyX') { this.back(game); return; }
    if (!n) return;
    if (code === 'ArrowDown') { this.sel = (this.sel + 1) % n; this.line = null; game.audio.playSE('move'); }
    else if (code === 'ArrowUp') { this.sel = (this.sel + n - 1) % n; this.line = null; game.audio.playSE('move'); }
    else if (code === 'KeyZ' || code === 'Enter') this.doTalk(game);
    else if (code === 'KeyC') this.openGift(game);
  }

  rowRect(i) { return { x: 20, y: 96 + i * 30, w: 292, h: 29 }; }
  talkBtn() { return { x: 356, y: 470, w: 270, h: 46 }; }
  giftBtn() { return { x: 646, y: 470, w: 270, h: 46 }; }
  giftRects() {
    return (this.giftModal?.items ?? []).map((id, i) => ({ id, x: 330, y: 150 + i * 48, w: 300, h: 44 }));
  }

  onMouseDown(x, y, button, game) {
    if (this.giftModal) {
      const rects = this.giftRects();
      for (let i = 0; i < rects.length; i++) {
        if (inRect(x, y, rects[i])) { this.doGift(game, rects[i].id); return; }
      }
      this.giftModal = null;
      game.audio.playSE('cancel');
      return;
    }
    for (let i = 0; i < this.list.length; i++) {
      if (inRect(x, y, this.rowRect(i))) {
        if (this.sel !== i) { this.sel = i; this.line = null; game.audio.playSE('move'); }
        return;
      }
    }
    if (inRect(x, y, this.talkBtn())) { this.doTalk(game); return; }
    if (inRect(x, y, this.giftBtn())) { this.openGift(game); return; }
  }

  // ----- 그리기 -----

  render(g, game) {
    const st = game.state;
    g.fillStyle = '#131018';
    g.fillRect(0, 0, W, H);
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(66, 44, 30, 0.35)');   // 모닥불 온기
    grad.addColorStop(1, 'rgba(13, 11, 20, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    drawTextOutlined(g, '병 영', 52, 44, { size: 22, bold: true, fill: PALETTE.gold, outline: PALETTE.black });
    drawText(g, '전우와 마음을 나누는 곳', 116, 44, { size: 10, fill: PALETTE.gray3 });
    drawPanel(g, 862, 16, 84, 26, { border: PALETTE.goldDark });
    drawText(g, '나가기 [X]', 904, 34, { size: 10, align: 'center', fill: PALETTE.gray4 });

    // 좌: 동료 목록
    drawPanel(g, 12, 66, 308, 458, { border: PALETTE.goldDark });
    drawText(g, `동료 ${this.list.length}명`, 28, 86, { size: 11, bold: true, fill: PALETTE.gray4 });
    if (!this.list.length) {
      drawText(g, '아직 동료가 없습니다', 166, 280, { size: 12, align: 'center', fill: PALETTE.gray2 });
    }
    for (let i = 0; i < this.list.length; i++) {
      const cid = this.list[i];
      const b = BD.bondOf(st, cid);
      const r = this.rowRect(i);
      const on = i === this.sel;
      if (on) {
        g.fillStyle = PALETTE.navy2;
        g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = PALETTE.gold;
        g.lineWidth = 1;
        g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      }
      drawText(g, CHARACTERS[cid].name, r.x + 10, r.y + 19, { size: 12, bold: on, fill: on ? PALETTE.white : PALETTE.gray4 });
      // 호감 하트 (채움 = Lv)
      for (let h = 0; h < BALANCE.bond.maxLevel; h++) {
        g.fillStyle = h < b.lv ? PALETTE.red : PALETTE.navy3;
        const hx = r.x + 118 + h * 14;
        g.fillRect(hx, r.y + 10, 5, 5);
        g.fillRect(hx + 5, r.y + 10, 5, 5);
        g.fillRect(hx + 1, r.y + 14, 8, 4);
        g.fillRect(hx + 3, r.y + 18, 4, 2);
      }
      drawText(g, BOND_LABELS[b.lv - 1], r.x + r.w - 10, r.y + 19, { size: 10, align: 'right', fill: b.lv >= 4 ? PALETTE.gold : PALETTE.gray3 });
    }

    // 우: 상세
    const cid = this.selId();
    drawPanel(g, 340, 66, 604, 390, { border: PALETTE.goldDark });
    if (cid) {
      const c = CHARACTERS[cid];
      const b = BD.bondOf(st, cid);
      const spr = portraitOf(c);
      g.imageSmoothingEnabled = false;
      drawPanel(g, 360, 86, 110, 110, { border: PALETTE.navy3 });
      const sc = sprScale(spr, 2), dw = spr.width * sc, dh = spr.height * sc;
      g.drawImage(spr, Math.round(415 - dw / 2), 192 - dh, dw, dh);
      drawTextOutlined(g, c.name, 490, 112, { size: 20, bold: true, fill: PALETTE.white, outline: PALETTE.black });
      if (c.title) drawText(g, c.title, 492, 132, { size: 10, fill: PALETTE.gold });
      drawText(g, `선물 취향: ${GIFTS[GIFT_PREF[cid]].name}`, 492, 152, { size: 10, fill: PALETTE.gray3 });

      // 호감도 게이지
      drawText(g, `호감 Lv${b.lv}`, 700, 112, { size: 15, bold: true, fill: b.lv >= 4 ? PALETTE.gold : PALETTE.white });
      drawText(g, BOND_LABELS[b.lv - 1], 776, 112, { size: 11, fill: PALETTE.red });
      const needPts = BD.need(b.lv);
      g.fillStyle = PALETTE.navy1;
      g.fillRect(700, 122, 220, 8);
      if (needPts) {
        g.fillStyle = PALETTE.red;
        g.fillRect(700, 122, Math.round(220 * Math.min(1, b.pts / needPts)), 8);
        drawText(g, `${b.pts} / ${needPts}`, 700, 144, { size: 9, fill: PALETTE.gray2 });
      } else {
        g.fillStyle = PALETTE.gold;
        g.fillRect(700, 122, 220, 8);
        drawText(g, 'MAX — 맹세를 나눈 사이', 700, 144, { size: 9, fill: PALETTE.gold });
      }
      // 보상 안내 (실수치 원칙)
      const bonus = BD.bondBonus(st, cid);
      drawText(g, `현재 보너스: 전 스탯 +${Math.round(bonus * 100)}%`, 700, 168, { size: 10, fill: bonus > 0 ? PALETTE.green : PALETTE.gray2 });
      const rows = [
        [2, `전 스탯 +${Math.round(BALANCE.bond.statBonus[2] * 100)}%`],
        [3, '전용 의뢰 해금 (준비 중)'],
        [4, `전 스탯 +${Math.round(BALANCE.bond.statBonus[4] * 100)}%`],
        [5, '비하인드 스토리 (준비 중)'],
      ];
      for (let i = 0; i < rows.length; i++) {
        const [lv, label] = rows[i];
        const got = b.lv >= lv;
        drawText(g, `Lv${lv} ${label}`, 700, 192 + i * 18, { size: 9, fill: got ? PALETTE.gray4 : PALETTE.gray1 });
      }

      // 대사 박스
      drawPanel(g, 360, 288, 564, 120, { border: PALETTE.navy3 });
      drawText(g, c.name, 378, 312, { size: 11, bold: true, fill: PALETTE.gold });
      const line = this.line ?? TALKS[cid]?.[talkTier(b.lv)] ?? '…';
      const brk = line.length > 40 ? ((line.lastIndexOf(' ', 40) + 1) || 40) : line.length;
      drawText(g, line.slice(0, brk), 378, 340, { size: 12, fill: PALETTE.white });
      if (line.length > brk) drawText(g, line.slice(brk), 378, 360, { size: 12, fill: PALETTE.white });
      drawText(g, '(대사는 임시 초안 — 스토리 작업 때 교체)', 906, 398, { size: 8, align: 'right', fill: PALETTE.gray1 });

      // 버튼
      const now = Date.now();
      const canT = BD.canTalk(st, cid, now);
      const canG = BD.canGift(st, cid, now);
      const tb = this.talkBtn();
      const hovT = inRect(game.input.mouse.x, game.input.mouse.y, tb);
      drawPanel(g, tb.x, tb.y, tb.w, tb.h, { border: !canT ? PALETTE.gray1 : hovT ? PALETTE.gold : PALETTE.goldDark });
      drawText(g, '대화  [Z]', tb.x + tb.w / 2, tb.y + 20, { size: 13, bold: true, align: 'center', fill: canT ? PALETTE.white : PALETTE.gray2 });
      drawText(g, canT ? `호감 +${BALANCE.bond.talkPts} (1일 1회)` : '오늘은 끝 — 내일 다시', tb.x + tb.w / 2, tb.y + 36, { size: 9, align: 'center', fill: PALETTE.gray3 });
      const gb = this.giftBtn();
      const hovG = inRect(game.input.mouse.x, game.input.mouse.y, gb);
      drawPanel(g, gb.x, gb.y, gb.w, gb.h, { border: !canG ? PALETTE.gray1 : hovG ? PALETTE.gold : PALETTE.goldDark });
      drawText(g, '선물  [C]', gb.x + gb.w / 2, gb.y + 20, { size: 13, bold: true, align: 'center', fill: canG ? PALETTE.white : PALETTE.gray2 });
      drawText(g, canG ? `취향 적중 +${BALANCE.bond.giftPts.match} / 그 외 +${BALANCE.bond.giftPts.normal}` : '오늘은 끝 — 내일 다시', gb.x + gb.w / 2, gb.y + 36, { size: 9, align: 'center', fill: PALETTE.gray3 });
    }

    drawText(g, '↑↓ 선택 · Z 대화 · C 선물 · X 나가기', W / 2, H - 6, { size: 10, align: 'center', fill: PALETTE.gray2 });

    // 선물 모달
    if (this.giftModal) {
      g.fillStyle = 'rgba(8, 6, 20, 0.72)';
      g.fillRect(0, 0, W, H);
      const items = this.giftModal.items;
      drawPanel(g, 310, 100, 340, 60 + items.length * 48, { border: PALETTE.gold });
      drawText(g, '무엇을 선물할까?', 480, 128, { size: 13, bold: true, align: 'center', fill: PALETTE.gold });
      const rects = this.giftRects();
      for (let i = 0; i < items.length; i++) {
        const id = items[i];
        const r = rects[i];
        const on = i === this.giftModal.sel || inRect(game.input.mouse.x, game.input.mouse.y, r);
        drawPanel(g, r.x, r.y, r.w, r.h, { border: on ? PALETTE.gold : PALETTE.navy3 });
        const match = GIFT_PREF[this.selId()] === id;
        drawText(g, GIFTS[id].name + (match ? '  ♥' : ''), r.x + 16, r.y + 20, { size: 12, bold: true, fill: match ? PALETTE.red : PALETTE.white });
        drawText(g, `보유 ${game.state.inventory.gifts[id] ?? 0}`, r.x + r.w - 14, r.y + 20, { size: 10, align: 'right', fill: PALETTE.gray3 });
        drawText(g, match ? '취향 저격일 것 같다' : '무난한 선물', r.x + 16, r.y + 36, { size: 9, fill: PALETTE.gray3 });
      }
    }
  }
}
