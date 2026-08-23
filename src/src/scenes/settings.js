// ============================================================
// settings.js — 설정 화면 (기획서 §15)
// M1: 볼륨·화면 배율·텍스트 속도·기본 배속. 난이도 변경·백업 UI는 이후 확장.
// 변경 즉시 적용 + localStorage 저장.
// ============================================================

import { Scene } from './scene.js';
import { inRect } from '../core/input.js';
import { PALETTE, drawText, drawPanel } from '../core/sprites.js';
import { DEFAULT_SETTINGS, saveSettings } from '../core/save.js';

const TEXT_SPEED_OPTIONS = ['slow', 'normal', 'fast'];
const TEXT_SPEED_LABELS = { slow: '느림', normal: '보통', fast: '빠름' };
const BATTLE_SPEED_OPTIONS = [1, 2];
const SCALE_OPTIONS = ['auto', 1, 2, 3];

export class SettingsScene extends Scene {
  constructor() {
    super();
    this.sel = 0;
    this.from = 'title';
  }

  enter(game, params = {}) {
    this.from = params.from || 'title';
    this.sel = 0;
  }

  items(game) {
    const s = game.settings;
    return [
      {
        id: 'bgm', label: 'BGM 볼륨', type: 'range',
        value: () => s.bgmVolume, max: 10,
        adjust: (d) => { s.bgmVolume = Math.max(0, Math.min(10, s.bgmVolume + d)); },
      },
      {
        id: 'se', label: '효과음 볼륨', type: 'range',
        value: () => s.seVolume, max: 10,
        adjust: (d) => { s.seVolume = Math.max(0, Math.min(10, s.seVolume + d)); },
      },
      {
        id: 'textSpeed', label: '텍스트 속도', type: 'option',
        value: () => TEXT_SPEED_LABELS[s.textSpeed],
        adjust: (d) => { s.textSpeed = cycle(TEXT_SPEED_OPTIONS, s.textSpeed, d); },
      },
      {
        id: 'battleSpeed', label: '기본 전투 배속', type: 'option',
        value: () => `${s.battleSpeed}배속`,
        adjust: (d) => { s.battleSpeed = cycle(BATTLE_SPEED_OPTIONS, s.battleSpeed, d); },
      },
      {
        id: 'scale', label: '화면 배율', type: 'option',
        value: () => s.screenScale === 'auto' ? '자동' : `${s.screenScale}배`,
        adjust: (d) => { s.screenScale = cycle(SCALE_OPTIONS, s.screenScale, d); },
      },
      { id: 'reset', label: '설정 초기화', type: 'action' },
      { id: 'back', label: '돌아가기', type: 'action' },
    ];
  }

  rowRect(i) { return { x: 280, y: 138 + i * 46, w: 400, h: 40 }; }
  arrowRects(i) {
    const r = this.rowRect(i);
    return [
      { x: r.x + 196, y: r.y + 6, w: 28, h: 28 },  // ◀
      { x: r.x + r.w - 40, y: r.y + 6, w: 28, h: 28 }, // ▶
    ];
  }

  applyChange(game, item) {
    saveSettings(game.settings);
    if (item.id === 'bgm' || item.id === 'se') {
      game.audio.setVolumes(game.settings.bgmVolume, game.settings.seVolume);
    }
    if (item.id === 'scale') game.applyScale();
  }

  adjust(game, i, d) {
    const item = this.items(game)[i];
    if (!item.adjust) return;
    item.adjust(d);
    this.applyChange(game, item);
    game.audio.playSE('move');
  }

  activate(game, i) {
    const item = this.items(game)[i];
    if (item.id === 'reset') {
      Object.assign(game.settings, DEFAULT_SETTINGS);
      saveSettings(game.settings);
      game.audio.setVolumes(game.settings.bgmVolume, game.settings.seVolume);
      game.applyScale();
      game.audio.playSE('save');
      game.showToast('설정을 기본값으로 되돌렸습니다.');
    } else if (item.id === 'back') {
      this.goBack(game);
    } else {
      this.adjust(game, i, 1);
    }
  }

  goBack(game) {
    game.audio.playSE('cancel');
    game.changeScene(this.from, this.from === 'settings' ? {} : { from: 'settings' });
  }

  onKeyDown(code, game) {
    const items = this.items(game);
    if (code === 'ArrowUp') { this.sel = (this.sel + items.length - 1) % items.length; game.audio.playSE('move'); }
    else if (code === 'ArrowDown') { this.sel = (this.sel + 1) % items.length; game.audio.playSE('move'); }
    else if (code === 'ArrowLeft') this.adjust(game, this.sel, -1);
    else if (code === 'ArrowRight') this.adjust(game, this.sel, 1);
    else if (code === 'Enter' || code === 'Space') this.activate(game, this.sel);
    else if (code === 'Escape') this.goBack(game);
  }

  onMouseMove(x, y, game) {
    let hover = false;
    this.items(game).forEach((item, i) => {
      if (inRect(x, y, this.rowRect(i))) {
        hover = true;
        if (this.sel !== i) { this.sel = i; game.audio.playSE('move'); }
      }
    });
    game.setCursor(hover ? 'pointer' : 'default');
  }

  onMouseDown(x, y, button, game) {
    if (button === 2) { this.goBack(game); return; }
    if (button !== 0) return;
    const items = this.items(game);
    for (let i = 0; i < items.length; i++) {
      const [left, right] = this.arrowRects(i);
      if (items[i].adjust && inRect(x, y, left)) { this.sel = i; this.adjust(game, i, -1); return; }
      if (items[i].adjust && inRect(x, y, right)) { this.sel = i; this.adjust(game, i, 1); return; }
      if (inRect(x, y, this.rowRect(i))) { this.sel = i; this.activate(game, i); return; }
    }
  }

  render(g, game) {
    g.fillStyle = PALETTE.black;
    g.fillRect(0, 0, 960, 540);
    // 배경 장식: 은은한 남색 사선
    g.fillStyle = 'rgba(40, 50, 87, 0.25)';
    for (let i = 0; i < 12; i++) g.fillRect(i * 90 - 40, 0, 24, 540);

    drawPanel(g, 250, 70, 460, 420);
    drawText(g, '설정', 480, 110, { size: 24, bold: true, fill: PALETTE.gold, align: 'center' });

    const items = this.items(game);
    items.forEach((item, i) => {
      const r = this.rowRect(i);
      const sel = i === this.sel;
      if (sel) {
        g.fillStyle = 'rgba(242, 210, 81, 0.08)';
        g.fillRect(r.x, r.y, r.w, r.h);
      }
      const labelColor = sel ? PALETTE.gold : PALETTE.gray4;
      drawText(g, item.label, r.x + 16, r.y + 27, { size: 16, bold: sel, fill: labelColor });

      if (item.type === 'range') {
        const [la, ra] = this.arrowRects(i);
        drawText(g, '◀', la.x + 14, la.y + 21, { size: 14, fill: sel ? PALETTE.gold : PALETTE.gray2, align: 'center' });
        drawText(g, '▶', ra.x + 14, ra.y + 21, { size: 14, fill: sel ? PALETTE.gold : PALETTE.gray2, align: 'center' });
        // 게이지 바
        const bx = r.x + 232, bw = 100, bh = 10, by = r.y + 15;
        g.fillStyle = PALETTE.navy1;
        g.fillRect(bx, by, bw, bh);
        g.fillStyle = sel ? PALETTE.gold : PALETTE.blue;
        g.fillRect(bx, by, Math.round(bw * item.value() / item.max), bh);
        drawText(g, String(item.value()), r.x + 352, r.y + 25, { size: 14, fill: labelColor, align: 'center' });
      } else if (item.type === 'option') {
        const [la, ra] = this.arrowRects(i);
        drawText(g, '◀', la.x + 14, la.y + 21, { size: 14, fill: sel ? PALETTE.gold : PALETTE.gray2, align: 'center' });
        drawText(g, '▶', ra.x + 14, ra.y + 21, { size: 14, fill: sel ? PALETTE.gold : PALETTE.gray2, align: 'center' });
        drawText(g, String(item.value()), r.x + 282, r.y + 26, { size: 15, fill: labelColor, align: 'center' });
      } else {
        drawText(g, '─', r.x + 282, r.y + 26, { size: 14, fill: PALETTE.gray1, align: 'center' });
      }
    });

    drawText(g, '↑↓ 선택 · ◀▶ 변경 · Enter 결정 · ESC 돌아가기',
      480, 476, { size: 12, fill: PALETTE.gray3, align: 'center' });
  }
}

function cycle(options, current, d) {
  const idx = options.indexOf(current);
  return options[(Math.max(0, idx) + d + options.length) % options.length];
}
