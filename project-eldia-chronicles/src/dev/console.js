// ============================================================
// console.js — 개발 콘솔 (기획서 §14 — 디버그 치트 내장)
// `(백쿼트) 또는 F1로 토글. M1: 씬 점프·세이브 관리·RNG 검증·FPS.
// 마일스톤마다 해당 기능 도달 명령을 추가한다.
// ============================================================

import { RNG } from '../core/rng.js';
import { inRect } from '../core/input.js';
import { PALETTE, drawText, drawPanel } from '../core/sprites.js';
import * as save from '../core/save.js';
import { CHARACTERS } from '../data/characters.js';
import { STAGES } from '../data/stages.js';
import { simulateMany } from '../battle/simulator.js';

export class DevConsole {
  constructor() {
    this.open = false;
    this.showFps = false;
    this.sel = 0;
  }

  commands(game) {
    return [
      { label: '[씬] 타이틀', run: (g) => g.changeScene('title') },
      { label: '[씬] 설정', run: (g) => g.changeScene('settings', { from: 'title' }) },
      {
        label: '[씬] 거점 자리표시자', run: (g) => {
          if (!g.state) { g.state = save.createNewGameState('debug-seed'); g.currentSlot = null; }
          g.changeScene('placeholder');
        },
      },
      ...Object.values(STAGES).map((stage) => ({
        label: `[전투] ${stage.name}`,
        run: (g) => {
          if (!g.state) { g.state = save.createNewGameState('debug-seed'); g.currentSlot = null; }
          g.changeScene('battle', { stageId: stage.id });
        },
      })),
      {
        label: '[전투] 무작위 파티 4vs5', run: (g) => {
          if (!g.state) { g.state = save.createNewGameState('debug-seed'); g.currentSlot = null; }
          const rng = new RNG(`party-${Date.now()}`);
          const pool = Object.keys(CHARACTERS).filter((id) => id !== 'hero');
          const party = ['hero', ...rng.shuffle(pool).slice(0, 3)];
          g.showToast(`파티: ${party.map((id) => CHARACTERS[id].name).join(', ')}`);
          g.changeScene('battle', { stageId: 'undead_squad', partyIds: party });
        },
      },
      {
        label: '[전투] 하드 난이도 4vs5', run: (g) => {
          if (!g.state) { g.state = save.createNewGameState('debug-seed'); g.currentSlot = null; }
          g.changeScene('battle', { stageId: 'undead_squad', difficulty: 'hard' });
        },
      },
      {
        label: '[시뮬] 전 스테이지 자동 검증 (콘솔 출력)', run: (g) => {
          const report = Object.keys(STAGES).map((id) => simulateMany(id, 50, { seedPrefix: 'dev' }));
          console.table(report);
          const ok = report.every((r) => r.errors === 0 && r.winRate >= 0.5);
          g.showToast(ok ? `시뮬 완료 — 승률 ${report.map((r) => Math.round(r.winRate * 100) + '%').join('/')}` : '시뮬 이상 — 콘솔 확인');
        },
      },
      {
        label: '[세이브] 모든 슬롯 삭제', run: (g) => {
          for (let i = 1; i <= save.SLOT_COUNT; i++) save.deleteSlot(i);
          g.scenes.title.refreshSlots(); // 타이틀 씬 캐시 동기화
          g.showToast('모든 세이브 슬롯을 삭제했습니다.');
        },
      },
      {
        label: '[RNG] 시드 재현 검증', run: (g) => {
          const a = new RNG('m1-verify');
          const b = new RNG('m1-verify');
          let same = true;
          for (let i = 0; i < 1000; i++) if (a.next() !== b.next()) { same = false; break; }
          const c = new RNG('m1-verify-2');
          c.next();
          const st = c.getState();
          const expected = c.next();
          const d = new RNG(0);
          d.setState(st);
          if (d.next() !== expected) same = false;
          g.showToast(same ? 'RNG 재현성 검증 통과' : 'RNG 재현성 검증 실패!');
          console.log('[dev] RNG determinism:', same ? 'PASS' : 'FAIL');
        },
      },
      { label: '[표시] FPS 토글', run: () => { this.showFps = !this.showFps; } },
    ];
  }

  rowRect(i) { return { x: 660, y: 52 + i * 34, w: 288, h: 30 }; }

  // true를 반환하면 입력을 소비한 것 (씬으로 전달 안 함)
  handleKey(code, game) {
    if (code === 'Backquote' || code === 'F1') {
      this.open = !this.open;
      game.audio.playSE(this.open ? 'confirm' : 'cancel');
      return true;
    }
    if (!this.open) return false;

    const cmds = this.commands(game);
    if (code === 'Escape') { this.open = false; game.audio.playSE('cancel'); }
    else if (code === 'ArrowUp') { this.sel = (this.sel + cmds.length - 1) % cmds.length; game.audio.playSE('move'); }
    else if (code === 'ArrowDown') { this.sel = (this.sel + 1) % cmds.length; game.audio.playSE('move'); }
    else if (code === 'Enter' || code === 'Space') this.runCommand(game, this.sel);
    else if (code.startsWith('Digit')) {
      const n = Number(code.slice(5)) - 1;
      if (n >= 0 && n < cmds.length) this.runCommand(game, n);
    }
    return true;
  }

  runCommand(game, i) {
    game.audio.playSE('confirm');
    this.commands(game)[i].run(game);
    this.open = false;
  }

  onMouseMove(x, y, game) {
    this.commands(game).forEach((c, i) => {
      if (inRect(x, y, this.rowRect(i))) this.sel = i;
    });
  }

  onMouseDown(x, y, button, game) {
    if (button !== 0) { this.open = false; return; }
    const cmds = this.commands(game);
    for (let i = 0; i < cmds.length; i++) {
      if (inRect(x, y, this.rowRect(i))) { this.runCommand(game, i); return; }
    }
  }

  render(g, game) {
    if (this.showFps) {
      drawText(g, `FPS ${game.fps.toFixed(0)}`, 8, 20, { size: 13, fill: PALETTE.green });
    }
    if (!this.open) return;

    const cmds = this.commands(game);
    drawPanel(g, 650, 10, 300, 60 + cmds.length * 34, { border: PALETTE.teal });
    drawText(g, '개발 콘솔 (M1)', 800, 36, { size: 15, bold: true, fill: PALETTE.teal, align: 'center' });
    cmds.forEach((c, i) => {
      const r = this.rowRect(i);
      const sel = i === this.sel;
      if (sel) {
        g.fillStyle = 'rgba(63, 191, 176, 0.12)';
        g.fillRect(r.x, r.y, r.w, r.h);
      }
      drawText(g, `${i + 1}. ${c.label}`, r.x + 10, r.y + 21, { size: 13, fill: sel ? PALETTE.cyan : PALETTE.gray3 });
    });
    drawText(g, '숫자키/Enter 실행 · ESC 닫기', 800, 52 + cmds.length * 34 + 4, { size: 11, fill: PALETTE.gray2, align: 'center' });
  }
}
