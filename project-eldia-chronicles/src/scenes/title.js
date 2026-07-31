// ============================================================
// title.js — 타이틀 화면 (기획서 §15, §16)
// 새로운 여정 / 이어하기 / 설정 / 기록 + 세이브 슬롯 선택.
// 배경 = 새벽별 요새 원경 (코드 생성 픽셀아트, 로드 시 프리렌더).
// 재건 진행도 반영 배경 변화는 M5에서 확장.
// ============================================================

import { Scene } from './scene.js';
import { RNG } from '../core/rng.js';
import { inRect } from '../core/input.js';
import { PALETTE, prerenderScaled, drawTextOutlined, drawText, drawPanel } from '../core/sprites.js';
import * as save from '../core/save.js';
import { CHAPTER_LABELS, formatPlayTime, formatDateTime } from '../data/strings.js';

// ----- 배경 픽셀아트 (240×135를 4배 확대 → 960×540) -----

function buildBackground() {
  return prerenderScaled(240, 135, 4, (g) => {
    const rng = new RNG('title-bg');
    const HORIZON = 92;

    // 새벽 하늘 그라데이션 밴드 — 공용 팔레트 32색만 사용 (기획서 §16)
    const sky = [
      PALETTE.black, PALETTE.ink, PALETTE.navy1, PALETTE.navy2,
      PALETTE.purpleDark, PALETTE.magenta, PALETTE.orange, PALETTE.peach,
    ];
    const bandH = HORIZON / sky.length;
    for (let i = 0; i < sky.length; i++) {
      g.fillStyle = sky[i];
      g.fillRect(0, Math.floor(i * bandH), 240, Math.ceil(bandH) + 1);
    }
    // 밴드 경계 디더링
    for (let i = 1; i < sky.length; i++) {
      const y = Math.floor(i * bandH);
      g.fillStyle = sky[i - 1];
      for (let x = 0; x < 240; x += 2) {
        if (rng.chance(0.5)) g.fillRect(x + rng.int(0, 1), y, 1, 1);
      }
    }

    // 별 (위쪽일수록 밝게)
    for (let i = 0; i < 48; i++) {
      const x = rng.int(0, 239);
      const y = rng.int(0, 62);
      g.fillStyle = y < 30 ? (rng.chance(0.3) ? PALETTE.white : PALETTE.gray4) : PALETTE.gray2;
      g.fillRect(x, y, 1, 1);
    }

    // 지는 초승달 — arc()는 안티에일리어싱으로 팔레트 밖 혼합색이 생기므로 픽셀 단위로 그린다
    g.fillStyle = PALETTE.gray4;
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        const inMoon = dx * dx + dy * dy <= 36;
        const inCut = (dx - 3) * (dx - 3) + (dy + 2) * (dy + 2) <= 36;
        if (inMoon && !inCut) g.fillRect(36 + dx, 18 + dy, 1, 1);
      }
    }

    // 여명의 빛 (지평선 부근 태양 광륜)
    const glow = [PALETTE.peach, PALETTE.gold];
    for (let i = 0; i < 26; i++) {
      const gx = 150 + rng.int(-26, 26);
      const gy = HORIZON - rng.int(1, 7);
      g.fillStyle = glow[rng.int(0, 1)];
      g.fillRect(gx, gy, rng.int(1, 3), 1);
    }

    // 철새 무리
    g.fillStyle = PALETTE.ink;
    for (const [bx, by] of [[70, 34], [78, 30], [86, 36], [180, 22], [188, 26]]) {
      g.fillRect(bx, by, 2, 1); g.fillRect(bx + 2, by - 1, 1, 1); g.fillRect(bx - 1, by - 1, 1, 1);
    }

    // 원경 산맥 2겹
    drawRidge(g, rng, PALETTE.navy2, 78, 14, 6);
    drawRidge(g, rng, PALETTE.navy1, 88, 12, 5);

    // 요새 언덕
    g.fillStyle = PALETTE.navy1;
    for (let x = 0; x < 240; x++) {
      const d = Math.abs(x - 120);
      const top = d < 45 ? 96 - Math.floor((45 - d) * 0.55) : 96 + Math.floor((d - 45) * 0.12);
      g.fillRect(x, Math.min(top, 110), 1, 135 - top);
    }

    // 새벽별 요새 실루엣
    const F = PALETTE.ink;
    g.fillStyle = F;
    g.fillRect(100, 78, 40, 16);            // 성벽
    g.fillRect(96, 68, 11, 26);             // 좌측 탑
    g.fillRect(133, 68, 11, 26);            // 우측 탑
    g.fillRect(113, 56, 14, 38);            // 중앙 본성
    // 총안(crenellation)
    for (let x = 100; x < 140; x += 4) g.fillRect(x, 76, 2, 2);
    for (const tx of [96, 133]) for (let i = 0; i < 3; i++) g.fillRect(tx + i * 4, 66, 2, 2);
    for (let i = 0; i < 4; i++) g.fillRect(113 + i * 4, 54, 2, 2);
    // 성문
    g.fillStyle = PALETTE.black;
    g.fillRect(117, 86, 6, 8);
    g.fillRect(118, 84, 4, 2);
    // 창문 불빛 — 재건의 등불
    g.fillStyle = PALETTE.gold;
    for (const [wx, wy] of [[118, 62], [122, 68], [99, 74], [138, 72]]) g.fillRect(wx, wy, 2, 2);
    g.fillStyle = PALETTE.amber;
    for (const [wx, wy] of [[102, 80], [135, 82], [120, 74]]) g.fillRect(wx, wy, 1, 2);
    // 본성 깃발
    g.fillStyle = PALETTE.gray2;
    g.fillRect(119, 48, 1, 8);
    g.fillStyle = PALETTE.gold;
    g.fillRect(120, 48, 5, 3);
    g.fillRect(120, 51, 3, 1);

    // 전경 들판
    g.fillStyle = PALETTE.black;
    g.fillRect(0, 118, 240, 17);
    g.fillStyle = PALETTE.ink;
    for (let i = 0; i < 60; i++) g.fillRect(rng.int(0, 239), rng.int(119, 134), 1, 1);
    // 요새로 향하는 길
    g.fillStyle = PALETTE.navy1;
    for (let y = 118; y < 135; y++) {
      const w = 3 + Math.floor((y - 118) * 1.1);
      g.fillRect(120 - Math.floor(w / 2) + Math.floor(Math.sin(y * 0.7) * 2), y, w, 1);
    }
  });
}

function drawRidge(g, rng, color, baseY, maxH, segW) {
  g.fillStyle = color;
  let x = 0;
  while (x < 240) {
    const w = rng.int(segW, segW * 2);
    const h = rng.int(3, maxH);
    for (let i = 0; i < w && x + i < 240; i++) {
      const t = i / w;
      const y = baseY - Math.floor(h * Math.sin(t * Math.PI));
      g.fillRect(x + i, y, 1, 135 - y);
    }
    x += w;
  }
}

// ----- 타이틀 씬 -----

export class TitleScene extends Scene {
  constructor() {
    super();
    this.bg = null;
    this.t = 0;
    this.mode = 'menu';        // 'menu' | 'slots'
    this.slotsMode = 'new';    // 'new' | 'continue'
    this.menuSel = 0;
    this.slotSel = 0;
    this.slots = [];
    this.confirm = null;       // { lines, onYes, focus }
    this.particles = [];
  }

  enter(game) {
    if (!this.bg) this.bg = buildBackground();
    this.mode = 'menu';
    this.confirm = null;
    this.refreshSlots();
    if (this.particles.length === 0) {
      const rng = new RNG('title-particles');
      for (let i = 0; i < 26; i++) {
        this.particles.push({
          x: rng.next() * 960, y: rng.next() * 540,
          spd: 8 + rng.next() * 14, drift: rng.next() * Math.PI * 2,
        });
      }
    }
  }

  refreshSlots() {
    this.slots = save.listSlots();
    if (this.menuSel === 1 && !this.hasAnySave()) this.menuSel = 0;
  }

  hasAnySave() { return this.slots.some((s) => s.exists); }

  menuItems() {
    return [
      { id: 'new', label: '새로운 여정', enabled: true },
      { id: 'continue', label: '이어하기', enabled: this.hasAnySave() },
      { id: 'settings', label: '설정', enabled: true },
      { id: 'records', label: '기록', enabled: true },
    ];
  }

  menuRect(i) { return { x: 480 - 140, y: 316 + i * 47, w: 280, h: 40 }; }
  panelRect() { return { x: 150, y: 60, w: 660, h: 420 }; }
  slotRowRect(i) { return { x: 170, y: 116 + i * 104, w: 620, h: 94 }; }

  slotButtons(i) {
    const info = this.slots[i];
    const row = this.slotRowRect(i);
    const ids = info.exists ? ['export', 'import', 'delete'] : ['import'];
    const labels = { export: '내보내기', import: '가져오기', delete: '삭제' };
    const w = 82, h = 22, gap = 6;
    return ids.map((id, k) => ({
      id, label: labels[id],
      x: row.x + row.w - 14 - (ids.length - k) * (w + gap) + gap,
      y: row.y + row.h - 30, w, h,
    }));
  }

  confirmButtons() {
    return [
      { id: 'yes', label: '예', x: 352, y: 300, w: 100, h: 32 },
      { id: 'no', label: '아니요', x: 508, y: 300, w: 100, h: 32 },
    ];
  }

  // ----- 동작 -----

  openConfirm(lines, onYes) {
    this.confirm = { lines, onYes, focus: 1 }; // 기본 포커스 = 아니요 (실수 방지)
  }

  activateMenu(game) {
    const item = this.menuItems()[this.menuSel];
    if (!item.enabled) {
      game.audio.playSE('error');
      game.showToast('저장된 여정이 없습니다.');
      return;
    }
    switch (item.id) {
      case 'new':
        game.audio.playSE('confirm');
        this.mode = 'slots'; this.slotsMode = 'new'; this.slotSel = 0;
        this.refreshSlots();
        break;
      case 'continue':
        game.audio.playSE('confirm');
        this.mode = 'slots'; this.slotsMode = 'continue';
        this.refreshSlots(); // 외부(개발 콘솔 등) 변경 반영
        this.slotSel = Math.max(0, this.slots.findIndex((s) => s.exists));
        break;
      case 'settings':
        game.audio.playSE('confirm');
        game.changeScene('settings', { from: 'title' });
        break;
      case 'records':
        game.audio.playSE('error');
        game.showToast('도감·업적은 이후 마일스톤(M8)에서 열립니다.');
        break;
    }
  }

  startNewGame(game, slot) {
    const seed = `eldia-${slot}-${Date.now()}`;
    const state = save.createNewGameState(seed);
    save.deleteSlot(slot); // 이전 여정의 자동저장까지 완전히 비운다
    save.saveSlot(slot, state);
    game.state = state;
    game.currentSlot = slot;
    game.audio.playSE('confirm');
    game.changeScene('placeholder');
  }

  continueGame(game, slot) {
    const state = save.loadNewest(slot);
    if (!state) { game.audio.playSE('error'); return; }
    game.state = state;
    game.currentSlot = slot;
    game.audio.playSE('confirm');
    game.changeScene('placeholder');
  }

  chooseSlot(game) {
    const slot = this.slotSel + 1;
    const info = this.slots[this.slotSel];
    if (this.slotsMode === 'new') {
      if (info.exists) {
        game.audio.playSE('move');
        this.openConfirm(
          [`슬롯 ${slot}의 기존 여정을 덮어씁니다.`, '계속할까요?'],
          () => this.startNewGame(game, slot),
        );
      } else {
        this.startNewGame(game, slot);
      }
    } else {
      if (!info.exists) { game.audio.playSE('error'); return; }
      this.continueGame(game, slot);
    }
  }

  doSlotAction(game, action) {
    const slot = this.slotSel + 1;
    const info = this.slots[this.slotSel];
    switch (action) {
      case 'export':
        if (!info.exists) { game.audio.playSE('error'); return; }
        try {
          save.exportSlot(slot);
          game.audio.playSE('save');
          game.showToast(`슬롯 ${slot}을(를) 파일로 내보냈습니다.`);
        } catch (e) {
          game.audio.playSE('error');
          game.showToast(e.message);
        }
        break;
      case 'import': {
        const run = () => save.importSlot(slot)
          .then(() => { this.refreshSlots(); game.audio.playSE('save'); game.showToast(`슬롯 ${slot}에 세이브를 가져왔습니다.`); })
          .catch((e) => { game.audio.playSE('error'); game.showToast(e.message); });
        if (info.exists) {
          this.openConfirm([`슬롯 ${slot}의 기존 여정을 덮어씁니다.`, '파일에서 가져올까요?'], run);
        } else {
          run();
        }
        break;
      }
      case 'delete':
        if (!info.exists) { game.audio.playSE('error'); return; }
        game.audio.playSE('move');
        this.openConfirm(
          [`슬롯 ${slot}의 여정을 삭제합니다.`, '되돌릴 수 없습니다. 계속할까요?'],
          () => {
            save.deleteSlot(slot);
            this.refreshSlots();
            game.audio.playSE('cancel');
            game.showToast(`슬롯 ${slot}을(를) 삭제했습니다.`);
          },
        );
        break;
    }
  }

  // ----- 입력 -----

  onKeyDown(code, game) {
    if (this.confirm) {
      if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'ArrowUp' || code === 'ArrowDown') {
        this.confirm.focus = 1 - this.confirm.focus;
        game.audio.playSE('move');
      } else if (code === 'Enter' || code === 'Space') {
        this.resolveConfirm(game, this.confirm.focus === 0);
      } else if (code === 'Escape') {
        this.resolveConfirm(game, false);
      }
      return;
    }

    if (this.mode === 'menu') {
      const items = this.menuItems();
      if (code === 'ArrowUp') { this.menuSel = (this.menuSel + items.length - 1) % items.length; game.audio.playSE('move'); }
      else if (code === 'ArrowDown') { this.menuSel = (this.menuSel + 1) % items.length; game.audio.playSE('move'); }
      else if (code === 'Enter' || code === 'Space') this.activateMenu(game);
    } else {
      if (code === 'ArrowUp') { this.slotSel = (this.slotSel + save.SLOT_COUNT - 1) % save.SLOT_COUNT; game.audio.playSE('move'); }
      else if (code === 'ArrowDown') { this.slotSel = (this.slotSel + 1) % save.SLOT_COUNT; game.audio.playSE('move'); }
      else if (code === 'Enter' || code === 'Space') this.chooseSlot(game);
      else if (code === 'KeyE') this.doSlotAction(game, 'export');
      else if (code === 'KeyI') this.doSlotAction(game, 'import');
      else if (code === 'Delete') this.doSlotAction(game, 'delete');
      else if (code === 'Escape') { this.mode = 'menu'; game.audio.playSE('cancel'); }
    }
  }

  resolveConfirm(game, yes) {
    const c = this.confirm;
    this.confirm = null;
    if (yes) c.onYes();
    else game.audio.playSE('cancel');
  }

  onMouseMove(x, y, game) {
    let hover = false;
    if (this.confirm) {
      this.confirmButtons().forEach((b, i) => {
        if (inRect(x, y, b)) { hover = true; if (this.confirm.focus !== i) { this.confirm.focus = i; } }
      });
    } else if (this.mode === 'menu') {
      this.menuItems().forEach((item, i) => {
        if (inRect(x, y, this.menuRect(i))) { hover = true; if (this.menuSel !== i) { this.menuSel = i; game.audio.playSE('move'); } }
      });
    } else {
      for (let i = 0; i < save.SLOT_COUNT; i++) {
        if (inRect(x, y, this.slotRowRect(i))) {
          hover = true;
          if (this.slotSel !== i) { this.slotSel = i; game.audio.playSE('move'); }
        }
        for (const b of this.slotButtons(i)) if (inRect(x, y, b)) hover = true;
      }
    }
    game.setCursor(hover ? 'pointer' : 'default');
  }

  onMouseDown(x, y, button, game) {
    if (this.confirm) {
      if (button !== 0) { this.resolveConfirm(game, false); return; }
      this.confirmButtons().forEach((b, i) => {
        if (inRect(x, y, b)) this.resolveConfirm(game, i === 0);
      });
      return;
    }

    if (button === 2) { // 우클릭 = 취소/뒤로
      if (this.mode === 'slots') { this.mode = 'menu'; game.audio.playSE('cancel'); }
      return;
    }
    if (button !== 0) return;

    if (this.mode === 'menu') {
      this.menuItems().forEach((item, i) => {
        if (inRect(x, y, this.menuRect(i))) { this.menuSel = i; this.activateMenu(game); }
      });
    } else {
      for (let i = 0; i < save.SLOT_COUNT; i++) {
        for (const b of this.slotButtons(i)) {
          if (inRect(x, y, b)) { this.slotSel = i; this.doSlotAction(game, b.id); return; }
        }
        if (inRect(x, y, this.slotRowRect(i))) { this.slotSel = i; this.chooseSlot(game); return; }
      }
    }
  }

  // ----- 갱신·렌더 -----

  update(dt, game) {
    this.t += dt;
    for (const p of this.particles) {
      p.y -= p.spd * dt;
      p.x += Math.sin(this.t * 0.8 + p.drift) * 6 * dt;
      if (p.y < -4) { p.y = 544; }
      if (p.x < -4) p.x = 964;
      if (p.x > 964) p.x = -4;
    }
  }

  render(g, game) {
    g.drawImage(this.bg, 0, 0);

    // 여명의 빛 입자
    for (const p of this.particles) {
      const a = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(this.t * 2 + p.drift * 3));
      g.globalAlpha = a;
      g.fillStyle = PALETTE.gold;
      g.fillRect(Math.floor(p.x / 2) * 2, Math.floor(p.y / 2) * 2, 2, 2);
    }
    g.globalAlpha = 1;

    // 타이틀 로고
    drawTextOutlined(g, '엘디아 연대기', 480, 178, { size: 56, bold: true, fill: PALETTE.gold, outline: PALETTE.ink });
    drawTextOutlined(g, '─ 여명의 맹세 ─', 480, 220, { size: 22, fill: PALETTE.white, outline: PALETTE.ink });

    if (this.mode === 'menu') this.renderMenu(g, game);
    else this.renderSlots(g, game);

    if (this.confirm) this.renderConfirm(g);

    drawText(g, game.version, 8, 532, { size: 12, fill: PALETTE.gray2 });
    drawText(g, '`(백쿼트)/F1 개발 콘솔', 952, 532, { size: 12, fill: PALETTE.gray1, align: 'right' });
  }

  renderMenu(g, game) {
    // 배경 실루엣과 겹치는 구간의 가독성용 배킹
    g.fillStyle = 'rgba(13, 11, 20, 0.5)';
    g.fillRect(480 - 170, 306, 340, 200);
    this.menuItems().forEach((item, i) => {
      const r = this.menuRect(i);
      const sel = i === this.menuSel;
      const color = !item.enabled ? PALETTE.gray1 : sel ? PALETTE.gold : PALETTE.gray4;
      if (sel) {
        g.fillStyle = 'rgba(242, 210, 81, 0.08)';
        g.fillRect(r.x, r.y, r.w, r.h);
        drawText(g, '◆', r.x + 28, r.y + 27, { size: 16, fill: PALETTE.gold, align: 'center' });
        drawText(g, '◆', r.x + r.w - 28, r.y + 27, { size: 16, fill: PALETTE.gold, align: 'center' });
      }
      drawText(g, item.label, r.x + r.w / 2, r.y + 28, { size: 22, bold: sel, fill: color, align: 'center' });
    });
  }

  renderSlots(g, game) {
    g.fillStyle = 'rgba(13, 11, 20, 0.72)';
    g.fillRect(0, 0, 960, 540);
    const p = this.panelRect();
    drawPanel(g, p.x, p.y, p.w, p.h);
    drawText(g, this.slotsMode === 'new' ? '새로운 여정 — 슬롯 선택' : '이어하기 — 슬롯 선택',
      480, p.y + 36, { size: 20, bold: true, fill: PALETTE.gold, align: 'center' });

    for (let i = 0; i < save.SLOT_COUNT; i++) {
      const r = this.slotRowRect(i);
      const info = this.slots[i];
      const sel = i === this.slotSel;
      g.fillStyle = sel ? 'rgba(60, 79, 130, 0.35)' : 'rgba(28, 31, 58, 0.6)';
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = sel ? PALETTE.gold : PALETTE.navy3;
      g.lineWidth = 2;
      g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);

      drawText(g, `슬롯 ${i + 1}`, r.x + 16, r.y + 32, { size: 18, bold: true, fill: sel ? PALETTE.gold : PALETTE.gray3 });

      if (info.exists) {
        const chapter = CHAPTER_LABELS[info.chapter] ?? info.chapter;
        drawText(g, `${info.heroName}  ·  ${chapter}`, r.x + 120, r.y + 28, { size: 16, fill: PALETTE.white });
        let meta = `플레이 ${formatPlayTime(info.playTimeSec)}  ·  ${formatDateTime(info.savedAt)}`;
        drawText(g, meta, r.x + 120, r.y + 52, { size: 13, fill: PALETTE.gray3 });
        if (info.hasAuto) drawText(g, '자동저장', r.x + 120, r.y + 74, { size: 12, fill: PALETTE.teal });
      } else {
        drawText(g, '빈 슬롯', r.x + 120, r.y + 40, { size: 16, fill: PALETTE.gray2 });
      }

      for (const b of this.slotButtons(i)) {
        const hover = inRect(game.input.mouse.x, game.input.mouse.y, b);
        g.fillStyle = hover ? PALETTE.navy3 : PALETTE.navy2;
        g.fillRect(b.x, b.y, b.w, b.h);
        drawText(g, b.label, b.x + b.w / 2, b.y + 16, { size: 12, fill: hover ? PALETTE.gold : PALETTE.gray3, align: 'center' });
      }
    }

    drawText(g, '↑↓ 선택 · Enter 결정 · E 내보내기 · I 가져오기 · Del 삭제 · ESC 뒤로',
      480, p.y + p.h - 12, { size: 12, fill: PALETTE.gray3, align: 'center' });
  }

  renderConfirm(g) {
    g.fillStyle = 'rgba(0, 0, 0, 0.55)';
    g.fillRect(0, 0, 960, 540);
    drawPanel(g, 240, 182, 480, 176);
    this.confirm.lines.forEach((line, i) => {
      drawText(g, line, 480, 230 + i * 26, { size: 16, fill: PALETTE.white, align: 'center' });
    });
    this.confirmButtons().forEach((b, i) => {
      const focus = this.confirm.focus === i;
      g.fillStyle = focus ? PALETTE.navy3 : PALETTE.navy2;
      g.fillRect(b.x, b.y, b.w, b.h);
      g.strokeStyle = focus ? PALETTE.gold : PALETTE.navy3;
      g.lineWidth = 2;
      g.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      drawText(g, b.label, b.x + b.w / 2, b.y + 21, { size: 15, bold: focus, fill: focus ? PALETTE.gold : PALETTE.gray3, align: 'center' });
    });
  }
}
