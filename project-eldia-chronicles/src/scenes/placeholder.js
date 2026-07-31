// ============================================================
// placeholder.js — 거점 자리표시자 씬 (M1 임시)
// "타이틀 → 게임 씬 전환·저장 동작" 검증용. M2에서 전투 프로토타입,
// M5에서 실제 거점 화면이 이 자리를 대체한다.
// 플레이 시간이 여기서 누적되어 세이브 왕복 검증에 쓰인다.
// ============================================================

import { Scene } from './scene.js';
import { inRect } from '../core/input.js';
import { PALETTE, drawText, drawTextOutlined, drawPanel } from '../core/sprites.js';
import * as save from '../core/save.js';
import { CHAPTER_LABELS, DIFFICULTY_LABELS, formatPlayTime } from '../data/strings.js';

export class PlaceholderScene extends Scene {
  constructor() {
    super();
    this.t = 0;
    this.isGameplay = true;
  }

  enter(game) {
    this.t = 0;
  }

  buttons() {
    return [
      { id: 'battle', label: '전투 테스트 [B]', x: 250, y: 430, w: 140, h: 36 },
      { id: 'save', label: '저장하기 [S]', x: 410, y: 430, w: 140, h: 36 },
      { id: 'title', label: '타이틀로 [ESC]', x: 570, y: 430, w: 140, h: 36 },
    ];
  }

  goBattle(game) {
    game.audio.playSE('confirm');
    game.changeScene('battle');
  }

  doSave(game) {
    if (!game.currentSlot) {
      game.audio.playSE('error');
      game.showToast('디버그 상태 — 저장 슬롯이 없습니다.');
      return;
    }
    save.saveSlot(game.currentSlot, game.state);
    game.audio.playSE('save');
    game.showToast(`슬롯 ${game.currentSlot}에 저장했습니다.`);
  }

  goTitle(game) {
    // 거점 이탈 = 자동저장 시점 (기획서 §15)
    if (game.currentSlot) {
      save.saveSlot(game.currentSlot, game.state, { auto: true });
    }
    game.audio.playSE('cancel');
    game.changeScene('title');
  }

  onKeyDown(code, game) {
    if (code === 'KeyS') this.doSave(game);
    else if (code === 'KeyB') this.goBattle(game);
    else if (code === 'Escape') this.goTitle(game);
  }

  onMouseMove(x, y, game) {
    game.setCursor(this.buttons().some((b) => inRect(x, y, b)) ? 'pointer' : 'default');
  }

  onMouseDown(x, y, button, game) {
    if (button === 2) { this.goTitle(game); return; }
    if (button !== 0) return;
    for (const b of this.buttons()) {
      if (inRect(x, y, b)) {
        if (b.id === 'save') this.doSave(game);
        else if (b.id === 'battle') this.goBattle(game);
        else this.goTitle(game);
      }
    }
  }

  update(dt, game) {
    this.t += dt;
  }

  render(g, game) {
    // 배경: 밤의 요새 내부 분위기 (단순 배드)
    g.fillStyle = PALETTE.ink;
    g.fillRect(0, 0, 960, 540);
    g.fillStyle = PALETTE.navy1;
    g.fillRect(0, 380, 960, 160);
    // 모닥불 불씨 느낌의 점멸 픽셀
    const flicker = 0.5 + 0.5 * Math.sin(this.t * 5);
    g.globalAlpha = 0.35 + 0.25 * flicker;
    g.fillStyle = PALETTE.amber;
    g.fillRect(120, 356, 8, 8);
    g.fillRect(132, 348, 6, 6);
    g.fillStyle = PALETTE.gold;
    g.fillRect(126, 340, 4, 4);
    g.globalAlpha = 1;

    drawTextOutlined(g, '새벽별 요새', 480, 90, { size: 34, bold: true, fill: PALETTE.gold, outline: PALETTE.black });
    drawText(g, '(거점 — 건설 예정지)', 480, 118, { size: 15, fill: PALETTE.gray3, align: 'center' });

    const s = game.state;
    drawPanel(g, 280, 150, 400, 240);
    drawText(g, '현재 여정', 480, 182, { size: 17, bold: true, fill: PALETTE.gold, align: 'center' });
    const rows = s ? [
      ['이름', s.heroName],
      ['진행', CHAPTER_LABELS[s.chapter] ?? s.chapter],
      ['난이도', DIFFICULTY_LABELS[s.difficulty] ?? s.difficulty],
      ['플레이 시간', formatPlayTime(s.playTimeSec)],
      ['슬롯', game.currentSlot ? `슬롯 ${game.currentSlot}` : '없음 (디버그)'],
    ] : [['상태', '없음']];
    rows.forEach(([k, v], i) => {
      const y = 214 + i * 30;
      drawText(g, k, 310, y, { size: 14, fill: PALETTE.gray3 });
      drawText(g, String(v), 650, y, { size: 14, fill: PALETTE.white, align: 'right' });
    });

    for (const b of this.buttons()) {
      const hover = inRect(game.input.mouse.x, game.input.mouse.y, b);
      g.fillStyle = hover ? PALETTE.navy3 : PALETTE.navy2;
      g.fillRect(b.x, b.y, b.w, b.h);
      g.strokeStyle = hover ? PALETTE.gold : PALETTE.navy3;
      g.lineWidth = 2;
      g.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      drawText(g, b.label, b.x + b.w / 2, b.y + 24, { size: 14, fill: hover ? PALETTE.gold : PALETTE.gray4, align: 'center' });
    }

    drawText(g, 'M2 전투 프로토타입 — [전투 테스트]로 2vs2 전투를 확인하세요.',
      480, 508, { size: 13, fill: PALETTE.gray2, align: 'center' });
  }
}
