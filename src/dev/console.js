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
import * as EQ from '../core/equip.js';
import { EQUIP_KINDS } from '../data/equipment.js';
import { STAGES } from '../data/stages.js';
import { MAPS, validateMaps } from '../data/maps.js';
import { simulateMany } from '../battle/simulator.js';

export class DevConsole {
  constructor() {
    this.open = false;
    this.showFps = false;
    this.sel = 0;
    this.scroll = 0;   // 목록이 길어져 스크롤이 필요해졌다
  }

  commands(game) {
    return [
      { label: '[씬] 타이틀', run: (g) => g.changeScene('title') },
      { label: '[씬] 설정', run: (g) => g.changeScene('settings', { from: 'title' }) },
      {
        label: '[씬] 거점 (새벽별 요새)', run: (g) => {
          if (!g.state) { g.state = save.createNewGameState('debug-seed'); g.currentSlot = null; }
          g.changeScene('base');
        },
      },
      {
        label: '[거점] 자원 +1000 전부', run: (g) => {
          if (!g.state?.resources) { g.showToast('거점에 먼저 들어가세요'); return; }
          for (const k of Object.keys(g.state.resources)) g.state.resources[k] += 1000;
          g.showToast('전 자원 +1000');
        },
      },
      {
        label: '[거점] 시간 +1시간 (방치 정산)', run: (g) => {
          if (!g.state?.base) { g.showToast('거점에 먼저 들어가세요'); return; }
          g.state.base.lastTick -= 3600000;
          g.state.base.taxAt -= 3600000;
          g.showToast('1시간이 지났습니다 — 거점 화면이 정산합니다');
        },
      },
      {
        label: '[거점] 시간 +24시간', run: (g) => {
          if (!g.state?.base) { g.showToast('거점에 먼저 들어가세요'); return; }
          g.state.base.lastTick -= 24 * 3600000;
          g.state.base.taxAt -= 24 * 3600000;
          g.showToast('하루가 지났습니다 (정산 상한 8시간)');
        },
      },
      {
        label: '[뽑기] 맹세의 증표 +30', run: (g) => {
          if (!g.state?.resources) { g.showToast('거점에 먼저 들어가세요'); return; }
          g.state.resources.badge = (g.state.resources.badge ?? 0) + 30;
          g.showToast(`증표 ${g.state.resources.badge}개`);
        },
      },
      {
        label: '[육성] 동료 전원 획득', run: (g) => {
          if (!g.state) { g.showToast('게임을 먼저 시작하세요'); return; }
          if (!g.state.roster) g.state.roster = {};
          let added = 0;
          for (const id of Object.keys(CHARACTERS)) {
            if (id === 'hero' || g.state.roster[id]) continue;
            g.state.roster[id] = { lb: 0 };
            added += 1;
          }
          g.showToast(`동료 ${added}명 합류 — 육성·편성 화면에서 확인`);
        },
      },
      {
        label: '[육성] 전 동료 조각 +3 · 각성석 +20', run: (g) => {
          if (!g.state?.roster || !Object.keys(g.state.roster).length) { g.showToast('보유 동료가 없습니다'); return; }
          for (const e of Object.values(g.state.roster)) e.shards = (e.shards ?? 0) + 3;
          g.state.resources.awaken = (g.state.resources.awaken ?? 0) + 20;
          g.showToast('전 동료 조각 +3 · 각성석 +20');
        },
      },
      {
        label: '[교감] 쿨 초기화 + 선물 각 2개', run: (g) => {
          if (!g.state?.roster || !Object.keys(g.state.roster).length) { g.showToast('보유 동료가 없습니다'); return; }
          for (const e of Object.values(g.state.roster)) {
            if (e.bond) { e.bond.talkedAt = 0; e.bond.giftAt = 0; }
          }
          if (!g.state.inventory) g.state.inventory = { equips: [], consumables: {}, gifts: {} };
          if (!g.state.inventory.gifts) g.state.inventory.gifts = {};
          for (const id of ['flower', 'liquor', 'book', 'antique', 'gem', 'food']) {
            g.state.inventory.gifts[id] = (g.state.inventory.gifts[id] ?? 0) + 2;
          }
          g.showToast('대화·선물 쿨 초기화 · 선물 6종 각 +2');
        },
      },
      {
        label: '[아이템] 소모품 각 3개', run: (g) => {
          if (!g.state?.resources) { g.showToast('거점에 먼저 들어가세요'); return; }
          EQ.ensureEquip(g.state);
          const c = g.state.inventory.consumables;
          for (const id of ['potion_s', 'potion_m', 'potion_l', 'feather', 'cleanse', 'atk_tonic', 'def_tonic']) {
            c[id] = (c[id] ?? 0) + 3;
          }
          g.showToast('소모품 7종 각 +3');
        },
      },
      {
        label: '[장비] 무작위 장비 5개 + 강화석 100', run: (g) => {
          if (!g.state?.resources) { g.showToast('거점에 먼저 들어가세요'); return; }
          EQ.ensureEquip(g.state);
          const kinds = Object.keys(EQUIP_KINDS);
          for (let i = 0; i < 5; i++) {
            const seq = g.state.itemSeq;
            EQ.makeItem(g.state, kinds[(seq * 7 + i * 5) % kinds.length], 1 + (seq % 2), 1 + (seq % 3));
          }
          g.state.resources.enhStone = (g.state.resources.enhStone ?? 0) + 100;
          g.showToast(`장비 5개 획득 (보유 ${g.state.inventory.equips.length}) · 강화석 +100`);
        },
      },
      {
        label: '[거점] 인구 +5', run: (g) => {
          if (!g.state?.base) { g.showToast('거점에 먼저 들어가세요'); return; }
          g.state.base.pop += 5;
          g.showToast(`인구 ${g.state.base.pop}명`);
        },
      },
      {
        label: `[거점] 진행 단계 올리기 (지금: ${game.state?.progress ?? 'ch1a'})`, run: (g) => {
          if (!g.state) { g.state = save.createNewGameState('debug-seed'); g.currentSlot = null; }
          const order = ['prologue', 'ch1a', 'ch1b', 'ch2', 'ch3'];
          const cur = order.indexOf(g.state.progress ?? 'ch1a');
          g.state.progress = order[Math.min(order.length - 1, cur + 1)];
          g.showToast(`진행: ${g.state.progress} — 시설 해금이 늘었습니다`);
        },
      },
      {
        label: '[씬] 파티 편성', run: (g) => {
          if (!g.state) { g.state = save.createNewGameState('debug-seed'); g.currentSlot = null; }
          g.changeScene('party');
        },
      },
      ...Object.keys(MAPS).map((id) => ({
        label: `[필드] ${MAPS[id].name}`,
        run: (g) => {
          if (!g.state) { g.state = save.createNewGameState('debug-seed'); g.currentSlot = null; }
          g.changeScene('field', { mapId: id, spawn: MAPS[id].spawn });
        },
      })),
      {
        // 새 게임 직업 선택 UI는 M6 — 그때까지는 이 치트가 유일한 전환 수단이다.
        // 다음에 진입하는 전투·필드부터 적용된다 (이미 떠 있는 전투는 그대로).
        label: `[주인공] 직업 전환 (지금: ${game.state?.heroClass ?? 'sword'})`, run: (g) => {
          if (!g.state) { g.state = save.createNewGameState('debug-seed'); g.currentSlot = null; }
          const order = ['sword', 'mage', 'archer'];
          const cur = g.state.heroClass ?? 'sword';
          g.state.heroClass = order[(order.indexOf(cur) + 1) % order.length];
          const name = { sword: '검사', mage: '마법사', archer: '궁수' }[g.state.heroClass];
          g.showToast(`주인공 직업: ${name} — 다음 전투/필드부터 적용`);
        },
      },
      {
        label: '[필드] 진행 초기화 (상자·채집·숨김길)', run: (g) => {
          if (g.state?.field) {
            g.state.field.chests = {}; g.state.field.gather = {};
            g.state.field.symbols = {}; g.state.field.hidden = {};
          }
          g.showToast('필드 진행 상태를 초기화했습니다.');
        },
      },
      {
        label: '[필드] 맵 데이터 검사', run: (g) => {
          const problems = validateMaps();
          console.table(problems.length ? problems : ['문제 없음']);
          g.showToast(problems.length ? `맵 데이터 문제 ${problems.length}건 — 콘솔 확인` : '맵 데이터 이상 없음');
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

  // ----- 목록 스크롤 -----
  // 마일스톤마다 명령이 늘어 21개가 되자 패널이 화면(540) 밖으로 나갔다.
  // 창 크기를 고정하고 그 안에서 굴린다.
  static ROW_H = 34;
  static TOP = 52;          // 첫 줄 y
  static VISIBLE = 12;      // 한 번에 보이는 줄 수 (52 + 12*34 + 여백 = 화면 안)

  visibleCount(cmds) { return Math.min(DevConsole.VISIBLE, cmds.length); }

  // 화면에 보이는 i번째 줄의 사각형 (i는 **보이는 순서**, 목록 인덱스가 아니다)
  rowRect(i) { return { x: 660, y: DevConsole.TOP + i * DevConsole.ROW_H, w: 288, h: 30 }; }

  // 선택 항목이 창 밖으로 나가지 않게 스크롤을 맞춘다
  clampScroll(cmds) {
    const vis = this.visibleCount(cmds);
    const max = Math.max(0, cmds.length - vis);
    if (this.sel < this.scroll) this.scroll = this.sel;
    if (this.sel >= this.scroll + vis) this.scroll = this.sel - vis + 1;
    this.scroll = Math.max(0, Math.min(max, this.scroll));
  }

  // 마우스 좌표 → 목록 인덱스 (없으면 -1)
  indexAt(x, y, cmds) {
    const vis = this.visibleCount(cmds);
    for (let v = 0; v < vis; v++) {
      if (inRect(x, y, this.rowRect(v))) {
        const i = this.scroll + v;
        return i < cmds.length ? i : -1;
      }
    }
    return -1;
  }

  // true를 반환하면 입력을 소비한 것 (씬으로 전달 안 함)
  handleKey(code, game) {
    if (code === 'Backquote' || code === 'F1') {
      this.open = !this.open;
      game.audio.playSE(this.open ? 'confirm' : 'cancel');
      return true;
    }
    if (!this.open) return false;

    const cmds = this.commands(game);
    const vis = this.visibleCount(cmds);
    if (code === 'Escape') { this.open = false; game.audio.playSE('cancel'); }
    else if (code === 'ArrowUp') { this.sel = (this.sel + cmds.length - 1) % cmds.length; game.audio.playSE('move'); }
    else if (code === 'ArrowDown') { this.sel = (this.sel + 1) % cmds.length; game.audio.playSE('move'); }
    else if (code === 'PageUp' || code === 'Home') { this.sel = code === 'Home' ? 0 : Math.max(0, this.sel - vis); game.audio.playSE('move'); }
    else if (code === 'PageDown' || code === 'End') { this.sel = code === 'End' ? cmds.length - 1 : Math.min(cmds.length - 1, this.sel + vis); game.audio.playSE('move'); }
    else if (code === 'Enter' || code === 'Space') this.runCommand(game, this.sel);
    else if (code.startsWith('Digit')) {
      // 숫자키는 **화면에 보이는 줄** 기준. 스크롤한 뒤에도 눈에 보이는 번호와 일치해야 한다.
      const n = Number(code.slice(5)) - 1;
      const i = this.scroll + n;
      if (n >= 0 && n < vis && i < cmds.length) this.runCommand(game, i);
    }
    this.clampScroll(cmds);
    return true;
  }

  runCommand(game, i) {
    game.audio.playSE('confirm');
    this.commands(game)[i].run(game);
    this.open = false;
  }

  onMouseMove(x, y, game) {
    const cmds = this.commands(game);
    const i = this.indexAt(x, y, cmds);
    if (i >= 0) this.sel = i;
  }

  onMouseDown(x, y, button, game) {
    if (button !== 0) { this.open = false; return; }
    const cmds = this.commands(game);
    const i = this.indexAt(x, y, cmds);
    if (i >= 0) this.runCommand(game, i);
  }

  // 휠 스크롤 — 커서가 패널 위에 있을 때만 먹는다
  onWheel(x, y, dy, game) {
    if (!this.open) return false;
    const cmds = this.commands(game);
    const vis = this.visibleCount(cmds);
    const panel = { x: 650, y: 10, w: 300, h: 60 + vis * DevConsole.ROW_H };
    if (!inRect(x, y, panel)) return false;
    const max = Math.max(0, cmds.length - vis);
    this.scroll = Math.max(0, Math.min(max, this.scroll + (dy > 0 ? 1 : -1)));
    return true;
  }

  render(g, game) {
    if (this.showFps) {
      drawText(g, `FPS ${game.fps.toFixed(0)}`, 8, 20, { size: 13, fill: PALETTE.green });
    }
    if (!this.open) return;

    const cmds = this.commands(game);
    const vis = this.visibleCount(cmds);
    this.clampScroll(cmds);
    const panelH = 60 + vis * DevConsole.ROW_H;
    drawPanel(g, 650, 10, 300, panelH, { border: PALETTE.teal });
    const more = cmds.length > vis;
    drawText(g, more ? `개발 콘솔  ${this.sel + 1}/${cmds.length}` : '개발 콘솔',
      800, 36, { size: 15, bold: true, fill: PALETTE.teal, align: 'center' });

    for (let v = 0; v < vis; v++) {
      const i = this.scroll + v;
      if (i >= cmds.length) break;
      const r = this.rowRect(v);
      const sel = i === this.sel;
      if (sel) {
        g.fillStyle = 'rgba(63, 191, 176, 0.12)';
        g.fillRect(r.x, r.y, r.w, r.h);
      }
      // 번호는 **보이는 줄** 기준 (숫자키와 일치시킨다)
      drawText(g, `${v + 1}. ${cmds[i].label}`, r.x + 10, r.y + 21,
        { size: 13, fill: sel ? PALETTE.cyan : PALETTE.gray3 });
    }

    // 스크롤 막대 — 위아래로 더 있다는 걸 보여준다
    if (more) {
      const trackX = 944, trackY = DevConsole.TOP, trackH = vis * DevConsole.ROW_H - 4;
      g.fillStyle = 'rgba(63, 191, 176, 0.18)';
      g.fillRect(trackX, trackY, 3, trackH);
      const thumbH = Math.max(18, Math.round(trackH * vis / cmds.length));
      const maxScroll = Math.max(1, cmds.length - vis);
      const thumbY = trackY + Math.round((trackH - thumbH) * (this.scroll / maxScroll));
      g.fillStyle = PALETTE.teal;
      g.fillRect(trackX, thumbY, 3, thumbH);
      if (this.scroll > 0) drawText(g, '▲', 800, DevConsole.TOP - 4, { size: 10, fill: PALETTE.teal, align: 'center' });
      if (this.scroll < maxScroll) drawText(g, '▼', 800, DevConsole.TOP + trackH + 12, { size: 10, fill: PALETTE.teal, align: 'center' });
    }

    drawText(g, more ? '↑↓·휠 스크롤 · 숫자키/Enter 실행 · ESC 닫기' : '숫자키/Enter 실행 · ESC 닫기',
      800, 10 + panelH - 12, { size: 11, fill: PALETTE.gray2, align: 'center' });
  }
}
