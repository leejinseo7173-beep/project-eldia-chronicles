// ============================================================
// base.js — 거점: 새벽별 요새 (기획서 §12, M5-1 커밋 ②③)
//
// 전경 한 화면(960×540, 카메라 없음)에 시설 13종을 배치하고,
// 클릭/키보드로 골라 증축·일꾼 배치를 한다. 방치 생산은 production.js(순수 모듈)가
// 정산하고, 이 씬은 결과만 보여 준다 (렌더·로직 분리 — 규칙 4).
//
// 시설 그림은 코드 생성 임시(절대 규칙 1의 대체 경로) — 지붕색 블록 + 이름표.
// 원화·외부 에셋이 오면 drawBuilding()의 블록 부분만 이미지로 갈아끼운다.
// ============================================================

import { Scene } from './scene.js';
import { inRect } from '../core/input.js';
import { RNG } from '../core/rng.js';
import { PALETTE, prerender, drawText, drawTextOutlined, drawPanel } from '../core/sprites.js';
import { BUILDINGS, UNLOCK_ORDER, isUnlocked } from '../data/buildings.js';
import * as P from '../core/production.js';
import * as save from '../core/save.js';
import { makeFieldSprites } from '../core/field_sprites.js';

const W = 960, H = 540;
const BAR_H = 48;                 // 하단 자원 바
const UNLOCK_LABELS = { prologue: '프롤로그', ch1a: '1장 전반', ch1b: '1장 후반', ch2: '2장', ch3: '3장' };
const RES_LABELS = { wood: '목재', stone: '석재', iron: '철', food: '식량', mana: '마정석', awaken: '각성석', gold: '골드' };
const RES_COLORS = {
  wood: PALETTE.brown, stone: PALETTE.gray3, iron: PALETTE.gray4,
  food: PALETTE.green, mana: PALETTE.cyan, awaken: PALETTE.purple, gold: PALETTE.gold,
};
// 시설 지붕색 — 전경에서 서로 구분되는 임시 정체성
const ROOF = {
  wall: PALETTE.gray2, altar: PALETTE.gold, tavern: PALETTE.orange, house: PALETTE.tan,
  shop: PALETTE.green, smith: PALETTE.redDark, camp: PALETTE.red, dojo: PALETTE.blue,
  temple: PALETTE.white, lumber: PALETTE.brownDark, mine: PALETTE.gray1,
  farm: PALETTE.greenDark, spring: PALETTE.skyBlue,
};

export class BaseScene extends Scene {
  constructor() {
    super();
    this.isGameplay = true;
  }

  enter(game, params = {}) {
    this.t = 0;
    this.focus = null;            // 선택된 시설 id (패널 열림)
    this.hover = null;
    this.report = null;           // 부재 정산 패널 { mins, gains, spilled }
    this.toastMsg = null;

    const now = Date.now();
    P.ensureBase(game.state, now);
    const r = P.settle(game.state, now);
    if (r.mins >= 1 && Object.keys(r.gains).length) this.report = r;

    // 거점 귀환 시 자동저장 (기획서 §세이브)
    if (game.currentSlot != null) save.saveSlot(game.currentSlot, game.state, { auto: true });

    // 주민 배회 (연출 전용 — 저장 안 함). 인구에 비례해 몇 명만.
    const n = Math.min(6, 2 + Math.floor(game.state.base.pop / 10));
    const cfgs = [
      { skin: 'peach', hair: 'brownDark', armor: 'tan', armorDark: 'brown', cloth: 'forest' },
      { skin: 'peach', hair: 'gray2', armor: 'blue', armorDark: 'navy2', cloth: 'navy1' },
      { skin: 'peach', hair: 'redDark', armor: 'green', armorDark: 'greenDark', cloth: 'brown' },
    ];
    this.villagers = [];
    for (let i = 0; i < n; i++) {
      const rng = new RNG(`base-villager-${i}`);
      this.villagers.push({
        rng, x: 330 + rng.next() * 300, y: 300 + rng.next() * 120,
        tx: 0, ty: 0, wait: rng.next() * 2, dir: 'down', dist: 0,
        sprites: makeFieldSprites(cfgs[i % cfgs.length]),
      });
    }
  }

  exit(game) {
    // 나갈 때도 정산 기준을 남긴다 (필드에서 오래 놀다 와도 이어지도록)
    if (game.state) P.settle(game.state, Date.now());
  }

  // ----- 진행 -----

  update(dt, game) {
    this.t += dt;
    P.settle(game.state, Date.now());          // 분이 넘어가면 실시간 반영 (0분이면 무비용)
    for (const v of this.villagers) this.updateVillager(v, dt);
  }

  updateVillager(v, dt) {
    if (v.wait > 0) { v.wait -= dt; return; }
    if (!v.tx) {
      v.tx = 320 + v.rng.next() * 320; v.ty = 290 + v.rng.next() * 140;
    }
    const dx = v.tx - v.x, dy = v.ty - v.y;
    const d = Math.hypot(dx, dy);
    if (d < 4) { v.tx = 0; v.wait = 1 + v.rng.next() * 3; return; }
    const sp = 34 * dt;
    v.x += (dx / d) * sp; v.y += (dy / d) * sp;
    v.dist += sp;
    v.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }

  // ----- 입력 -----

  ids() { return Object.keys(BUILDINGS); }

  onKeyDown(code, game) {
    if (this.report) {
      if (['KeyZ', 'Enter', 'Space', 'Escape', 'KeyX'].includes(code)) { this.report = null; game.audio.playSE('confirm'); }
      return;
    }
    if (code === 'Escape' || code === 'KeyX') {
      if (this.focus) { this.focus = null; game.audio.playSE('cancel'); return; }
      game.audio.playSE('cancel');
      game.changeScene('title');
      return;
    }
    if (code === 'KeyF') { game.audio.playSE('confirm'); game.changeScene('party', { deploy: true }); return; }
    if (code === 'KeyS') { this.manualSave(game); return; }
    if (code === 'KeyT') { this.tryTax(game); return; }
    if (code === 'Tab') {
      const list = this.ids();
      const i = list.indexOf(this.focus);
      this.focus = list[(i + 1) % list.length];
      game.audio.playSE('cursor');
      return;
    }
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (dirs[code]) { this.moveFocus(dirs[code], game); return; }
    if (code === 'KeyZ' || code === 'Enter') {
      if (!this.focus) return;
      const def = BUILDINGS[this.focus];
      const lv = game.state.base.buildings[this.focus]?.lv ?? 0;
      // 내용물이 있는 시설(소환 제단 등)은 Z = 입장, 증축은 B
      if (def.scene && lv > 0) { game.audio.playSE('confirm'); game.changeScene(def.scene); return; }
      this.tryBuild(game, this.focus);
      return;
    }
    if (code === 'KeyB') {
      if (this.focus) this.tryBuild(game, this.focus);
      return;
    }
    if (this.focus && (code === 'KeyA' || code === 'KeyD')) {
      const ok = P.assignWorker(game.state, this.focus, code === 'KeyD' ? 1 : -1);
      game.audio.playSE(ok ? 'cursor' : 'cancel');
    }
  }

  // 방향키: 현재 포커스에서 그 방향으로 가장 가까운 시설로
  moveFocus([dx, dy], game) {
    const list = this.ids();
    if (!this.focus) { this.focus = list[0]; game.audio.playSE('cursor'); return; }
    const cur = BUILDINGS[this.focus].pos;
    const cx = cur.x + cur.w / 2, cy = cur.y + cur.h / 2;
    let best = null;
    for (const id of list) {
      if (id === this.focus) continue;
      const p = BUILDINGS[id].pos;
      const ox = p.x + p.w / 2 - cx, oy = p.y + p.h / 2 - cy;
      const along = ox * dx + oy * dy;              // 그 방향 성분
      if (along <= 8) continue;                     // 뒤쪽·수직은 제외
      const cross = Math.abs(ox * dy) + Math.abs(oy * dx);
      const score = along + cross * 2.2;            // 옆으로 벗어난 만큼 벌점
      if (!best || score < best.score) best = { id, score };
    }
    if (best) { this.focus = best.id; game.audio.playSE('cursor'); }
  }

  onMouseMove(x, y) {
    this.hover = null;
    for (const id of this.ids()) {
      if (inRect(x, y, BUILDINGS[id].pos)) { this.hover = id; return; }
    }
  }

  onMouseDown(x, y, button, game) {
    if (this.report) { this.report = null; game.audio.playSE('confirm'); return; }
    // 패널 안 버튼
    if (this.focus) {
      const b = this.panelButtons(game);
      for (const btn of b) {
        if (inRect(x, y, btn)) { btn.run(); return; }
      }
    }
    // 상단 우측 미니 버튼
    for (const btn of this.topButtons(game)) {
      if (inRect(x, y, btn)) { btn.run(); return; }
    }
    // 시설 선택
    for (const id of this.ids()) {
      if (inRect(x, y, BUILDINGS[id].pos)) {
        this.focus = (this.focus === id) ? null : id;
        game.audio.playSE('cursor');
        return;
      }
    }
    if (this.focus) { this.focus = null; game.audio.playSE('cancel'); }
  }

  topButtons(game) {
    return [
      // 출정은 편성창을 경유한다 — 필드 인카운터가 이 편성으로 싸운다 (2026-08-24)
      { x: 700, y: 8, w: 78, h: 24, label: '출정 [F]', run: () => { game.audio.playSE('confirm'); game.changeScene('party', { deploy: true }); } },
      { x: 784, y: 8, w: 78, h: 24, label: '저장 [S]', run: () => this.manualSave(game) },
      { x: 868, y: 8, w: 84, h: 24, label: '타이틀 [X]', run: () => game.changeScene('title') },
    ];
  }

  manualSave(game) {
    if (game.currentSlot == null) { this.toast(game, '슬롯이 없습니다 — 타이틀에서 새 여정으로 시작하세요'); return; }
    save.saveSlot(game.currentSlot, game.state);
    game.audio.playSE('confirm');
    this.toast(game, '저장했습니다.');
  }

  tryTax(game) {
    const now = Date.now();
    if (!P.taxReady(game.state, now)) {
      const left = Math.ceil((game.state.base.taxAt + 24 * 3600000 - now) / 3600000);
      this.toast(game, `세금은 하루 한 번 — 약 ${left}시간 뒤`);
      game.audio.playSE('cancel');
      return;
    }
    const amt = P.collectTax(game.state, now);
    game.audio.playSE('confirm');
    this.toast(game, `세레스: 오늘 몫의 세금이에요. +${amt}골드`);
  }

  tryBuild(game, id) {
    const st = game.state;
    if (!isUnlocked(id, st.progress)) { game.audio.playSE('cancel'); return; }
    const before = st.base.buildings[id].lv;
    const lv = P.build(st, id);
    if (lv > 0) {
      game.audio.playSE('crit');
      this.toast(game, `${BUILDINGS[id].name} ${before === 0 ? '건설' : '증축'} 완료 — Lv${lv}`);
    } else {
      game.audio.playSE('cancel');
      const cost = P.nextCost(st, id);
      this.toast(game, cost ? '자원이 부족합니다' : '이미 최대 단계입니다');
    }
  }

  toast(game, text) { game.showToast(text); }

  // ----- 그리기 -----

  backdrop() {
    if (this._bg) return this._bg;
    this._bg = prerender(W, H, (g) => {
      const rng = new RNG('base-backdrop');
      // 마당 — 풀색 바탕에 얼룩
      g.fillStyle = '#3d5a3a';
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = rng.chance(0.5) ? '#446344' : '#35513a';
        g.fillRect(Math.floor(rng.next() * W / 4) * 4, Math.floor(rng.next() * H / 4) * 4, 4, 4);
      }
      // 돌길 — 성문에서 아래로, 중앙 광장 가로지르기
      g.fillStyle = '#6a6a5d';
      g.fillRect(450, 108, 60, 432);
      g.fillRect(120, 300, 720, 44);
      g.fillStyle = '#7d7d6e';
      for (let i = 0; i < 260; i++) {
        const onV = rng.chance(0.5);
        const x = onV ? 450 + rng.next() * 56 : 120 + rng.next() * 716;
        const y = onV ? 108 + rng.next() * 428 : 300 + rng.next() * 40;
        g.fillRect(Math.floor(x / 4) * 4, Math.floor(y / 4) * 4, 4, 4);
      }
      // 성벽 — 상단 전폭 + 총안
      g.fillStyle = PALETTE.gray1;
      g.fillRect(0, 30, W, 74);
      g.fillStyle = PALETTE.gray2;
      g.fillRect(0, 30, W, 10);
      for (let x = 0; x < W; x += 40) g.fillRect(x, 18, 22, 14);
      // 성문
      g.fillStyle = PALETTE.brownDark;
      g.fillRect(444, 52, 72, 52);
      g.fillStyle = PALETTE.ink;
      g.fillRect(452, 60, 56, 44);
      // 광장 우물
      g.fillStyle = PALETTE.gray2; g.beginPath(); g.ellipse(480, 322, 22, 12, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = PALETTE.navy2; g.beginPath(); g.ellipse(480, 322, 14, 7, 0, 0, Math.PI * 2); g.fill();
    });
    return this._bg;
  }

  render(g, game) {
    const st = game.state;
    g.drawImage(this.backdrop(), 0, 0);

    // 주민 (건물보다 먼저 — 건물 뒤로 지나가게)
    for (const v of this.villagers) {
      const set = v.sprites;
      const list = set[v.dir];
      const f = Math.floor(v.dist / 16) % list.length;
      const spr = list[f];
      const footY = set.meta?.footY ?? spr.height;
      g.drawImage(spr, Math.round(v.x - spr.width / 2), Math.round(v.y - footY));
    }

    // 시설
    for (const id of this.ids()) this.drawBuilding(g, game, id);

    // 세레스 — 성문 앞, 세금 창구
    this.drawSeres(g, st);

    // 상단 제목 + 미니 버튼
    drawTextOutlined(g, '새벽별 요새', 18, 24, { size: 18, bold: true, fill: PALETTE.gold, outline: PALETTE.black });
    for (const b of this.topButtons(game)) {
      drawPanel(g, b.x, b.y, b.w, b.h, { border: PALETTE.goldDark });
      drawText(g, b.label, b.x + b.w / 2, b.y + 16, { size: 11, align: 'center', fill: PALETTE.gray4 });
    }

    this.renderBar(g, game);
    if (this.focus) this.renderPanel(g, game);
    if (this.report) this.renderReport(g);
  }

  drawBuilding(g, game, id) {
    const def = BUILDINGS[id];
    const { x, y, w, h } = def.pos;
    const b = game.state.base.buildings[id];
    const unlocked = isUnlocked(id, game.state.progress);
    const focused = this.focus === id || this.hover === id;

    if (!unlocked) {
      // 폐허 더미
      g.fillStyle = PALETTE.gray1;
      g.beginPath(); g.ellipse(x + w / 2, y + h - 8, w * 0.4, 10, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = PALETTE.gray2;
      g.fillRect(x + w / 2 - 14, y + h - 26, 12, 18);
      g.fillRect(x + w / 2 + 4, y + h - 20, 8, 12);
      drawText(g, `${def.name} — ${UNLOCK_LABELS[def.unlock]}`, x + w / 2, y + h + 12, { size: 9, align: 'center', fill: PALETTE.gray2 });
    } else if (b.lv <= 0) {
      // 공터 + 팻말
      g.strokeStyle = PALETTE.gray2;
      g.setLineDash([4, 4]);
      g.strokeRect(x + 2, y + 6, w - 4, h - 12);
      g.setLineDash([]);
      g.fillStyle = PALETTE.brownDark; g.fillRect(x + w / 2 - 2, y + h - 24, 4, 16);
      g.fillStyle = PALETTE.tan; g.fillRect(x + w / 2 - 12, y + h - 32, 24, 12);
      drawText(g, def.name, x + w / 2, y + h + 12, { size: 10, align: 'center', fill: PALETTE.gray3 });
    } else {
      // 본체 — 벽 + 지붕색 밴드 + 문 (임시 코드 생성)
      if (id !== 'wall') {
        g.fillStyle = PALETTE.gray1; g.fillRect(x, y + 14, w, h - 14);
        g.fillStyle = PALETTE.tan; g.fillRect(x + 2, y + 16, w - 4, h - 22);
        g.fillStyle = ROOF[id] ?? PALETTE.gray3;
        g.beginPath();
        g.moveTo(x - 4, y + 16); g.lineTo(x + w / 2, y); g.lineTo(x + w + 4, y + 16);
        g.closePath(); g.fill();
        g.fillStyle = PALETTE.brownDark;
        g.fillRect(x + w / 2 - 6, y + h - 20, 12, 14);
      }
      drawTextOutlined(g, `${def.name} Lv${b.lv}`, x + w / 2, y + h + 12,
        { size: 10, align: 'center', fill: PALETTE.white, outline: PALETTE.black });
      // 생산 시설: 일꾼 뱃지
      if (def.slots) {
        drawText(g, `일꾼 ${b.workers}/${P.workerSlots(id, b.lv)}`, x + w / 2, y + h + 24,
          { size: 9, align: 'center', fill: PALETTE.cyan });
      }
    }

    if (focused) {
      g.strokeStyle = PALETTE.gold;
      g.lineWidth = 2;
      g.strokeRect(x - 3, y - 3, w + 6, h + 6);
      g.lineWidth = 1;
    }
  }

  drawSeres(g, st) {
    const x = 560, y = 122;   // 성문 옆 지면 — 성벽(y104) 아래에 서야 떠 보이지 않는다
    g.fillStyle = PALETTE.white; g.fillRect(x - 6, y - 26, 12, 20);          // 드레스
    g.fillStyle = PALETTE.gold; g.fillRect(x - 4, y - 34, 8, 8);             // 머리
    g.fillStyle = PALETTE.goldDark; g.fillRect(x - 5, y - 36, 10, 3);        // 관
    const ready = P.taxReady(st, Date.now());
    if (ready) {
      const bob = Math.sin(this.t * 3) * 2;
      drawTextOutlined(g, '세금 [T]', x, y - 44 + bob, { size: 10, align: 'center', fill: PALETTE.gold, outline: PALETTE.black });
    }
  }

  renderBar(g, game) {
    const st = game.state;
    drawPanel(g, 0, H - BAR_H, W, BAR_H, { border: PALETTE.goldDark });
    let x = 14;
    for (const res of P.RES_KEYS) {
      const v = st.resources[res];
      const cap = P.storageCap(st, res);
      const full = Number.isFinite(cap) && v >= cap;
      g.fillStyle = RES_COLORS[res];
      g.fillRect(x, H - BAR_H + 14, 10, 10);
      drawText(g, RES_LABELS[res], x + 14, H - BAR_H + 23, { size: 10, fill: PALETTE.gray3 });
      drawText(g, String(v), x + 14, H - BAR_H + 38, { size: 11, fill: full ? PALETTE.gold : PALETTE.white });
      x += res === 'gold' ? 80 : (res === 'awaken' || res === 'mana') ? 72 : 66;
    }
    // 인구·유휴·식량 수지
    const pop = st.base.pop, cap = P.popCap(st), idle = P.idleWorkers(st);
    drawText(g, `인구 ${pop}/${cap} (유휴 ${idle})`, 600, H - BAR_H + 23, { size: 11, fill: PALETTE.gray4 });
    if (P.foodEconomyOn(st)) {
      const delta = P.foodDeltaPerMin(st);
      const dTxt = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}/분`;
      drawText(g, `식량 수지 ${dTxt}`, 600, H - BAR_H + 38, { size: 11, fill: delta < 0 ? PALETTE.red : PALETTE.green });
    } else {
      drawText(g, '왕실 배급 중 (2장부터 자급)', 600, H - BAR_H + 38, { size: 11, fill: PALETTE.gray3 });
    }
    // 세금 상태
    const ready = P.taxReady(st, Date.now());
    drawText(g, ready ? '● 세금 수령 가능 [T]' : '세금 수령 완료', 790, H - BAR_H + 30,
      { size: 11, fill: ready ? PALETTE.gold : PALETTE.gray2 });
  }

  panelButtons(game) {
    const id = this.focus;
    const def = BUILDINGS[id];
    const px = W - 300, py = 60;
    const btns = [];
    const b = game.state.base.buildings[id];
    const hasScene = def.scene && b.lv > 0;
    if (hasScene) {
      btns.push({
        x: px + 16, y: py + 194, w: 254, h: 30,
        label: '입장 [Z]',
        run: () => { game.audio.playSE('confirm'); game.changeScene(def.scene); },
      });
    }
    if (isUnlocked(id, game.state.progress) && b.lv < def.maxLv) {
      btns.push({
        x: px + 16, y: py + 232, w: 180, h: 30,
        label: (b.lv === 0 ? '건설' : '증축') + (hasScene ? ' [B]' : ' [Z]'),
        run: () => this.tryBuild(game, id),
      });
    }
    if (def.slots && b.lv > 0) {
      btns.push({ x: px + 206, y: py + 232, w: 30, h: 30, label: '−', run: () => P.assignWorker(game.state, id, -1) });
      btns.push({ x: px + 240, y: py + 232, w: 30, h: 30, label: '+', run: () => P.assignWorker(game.state, id, 1) });
    }
    return btns;
  }

  renderPanel(g, game) {
    const id = this.focus;
    const def = BUILDINGS[id];
    const st = game.state;
    const b = st.base.buildings[id];
    const unlocked = isUnlocked(id, st.progress);
    const px = W - 300, py = 60, pw = 286, ph = 286;
    drawPanel(g, px, py, pw, ph);
    drawText(g, `${def.name}  ${b.lv > 0 ? `Lv${b.lv}` : unlocked ? '(미건설)' : '(잠김)'}`,
      px + 16, py + 28, { size: 14, bold: true, fill: PALETTE.gold });
    drawText(g, def.desc, px + 16, py + 50, { size: 10, fill: PALETTE.gray4 });

    let y = py + 78;
    if (!unlocked) {
      drawText(g, `${UNLOCK_LABELS[def.unlock]}에 해금됩니다`, px + 16, y, { size: 11, fill: PALETTE.gray3 });
    } else {
      // 생산 시설: 현재 생산·일꾼
      if (def.slots && b.lv > 0) {
        const prod = P.prodPerMinView(st, id);
        const unit = id === 'spring' ? '/시간' : '/분';
        for (const [res, v] of Object.entries(prod)) {
          drawText(g, `${RES_LABELS[res]} ${v.toFixed(1)}${unit}`, px + 16, y, { size: 11, fill: RES_COLORS[res] });
          y += 18;
        }
        drawText(g, `일꾼 ${b.workers} / ${P.workerSlots(id, b.lv)}  (+25%/명)  [A/D]`, px + 16, y, { size: 11, fill: PALETTE.cyan });
        y += 22;
      }
      if (id === 'house' && b.lv > 0) {
        drawText(g, `인구 상한 ${P.popCap(st)}`, px + 16, y, { size: 11, fill: PALETTE.gray4 });
        y += 22;
      }
      if (id === 'wall') {
        drawText(g, `창고 상한 ${P.storageCap(st, 'wood')} (목·석·식)`, px + 16, y, { size: 11, fill: PALETTE.gray4 });
        y += 22;
      }
      // 다음 단계 비용
      const cost = P.nextCost(st, id);
      if (cost) {
        drawText(g, b.lv === 0 ? '건설 비용' : `Lv${b.lv + 1} 증축 비용`, px + 16, y + 4, { size: 11, bold: true, fill: PALETTE.white });
        y += 24;
        for (const [res, amt] of Object.entries(cost)) {
          const have = st.resources[res] ?? 0;
          const ok = have >= amt;
          g.fillStyle = RES_COLORS[res];
          g.fillRect(px + 18, y - 9, 9, 9);
          drawText(g, `${RES_LABELS[res]} ${amt}`, px + 32, y, { size: 11, fill: ok ? PALETTE.gray4 : PALETTE.red });
          drawText(g, `(보유 ${have})`, px + 130, y, { size: 10, fill: ok ? PALETTE.gray2 : PALETTE.red });
          y += 17;
        }
      } else if (b.lv >= def.maxLv) {
        drawText(g, '최대 단계입니다', px + 16, y + 4, { size: 11, fill: PALETTE.gray3 });
      }
      // 내용물 미구현 시설 안내 (뽑기는 M5-2에서 개통)
      if (def.kind === 'func' && b.lv > 0 && id !== 'wall' && !def.scene) {
        drawText(g, '내부 기능은 공사 중입니다', px + 16, py + ph - 60, { size: 10, fill: PALETTE.gray2 });
      }
    }

    for (const btn of this.panelButtons(game)) {
      drawPanel(g, btn.x, btn.y, btn.w, btn.h, { border: PALETTE.gold });
      drawText(g, btn.label, btn.x + btn.w / 2, btn.y + 20, { size: 12, align: 'center', fill: PALETTE.white });
    }
    drawText(g, '[X] 닫기', px + pw - 16, py + ph - 12, { size: 10, align: 'right', fill: PALETTE.gray2 });
  }

  renderReport(g) {
    const r = this.report;
    const pw = 340, ph = 90 + Object.keys(r.gains).length * 20 + (Object.keys(r.spilled).length ? 20 : 0);
    const px = (W - pw) / 2, py = (H - ph) / 2;
    drawPanel(g, px, py, pw, ph);
    const hrs = Math.floor(r.mins / 60), min = r.mins % 60;
    drawText(g, '부재 중 생산', px + pw / 2, py + 26, { size: 14, bold: true, align: 'center', fill: PALETTE.gold });
    drawText(g, `${hrs ? `${hrs}시간 ` : ''}${min}분 동안`, px + pw / 2, py + 46, { size: 10, align: 'center', fill: PALETTE.gray3 });
    let y = py + 70;
    for (const [res, v] of Object.entries(r.gains)) {
      drawText(g, `${RES_LABELS[res]}  +${v}`, px + pw / 2, y, { size: 12, align: 'center', fill: RES_COLORS[res] });
      y += 20;
    }
    if (Object.keys(r.spilled).length) {
      drawText(g, '일부는 창고가 가득 차 잃었습니다', px + pw / 2, y, { size: 10, align: 'center', fill: PALETTE.red });
      y += 20;
    }
    drawText(g, '[Z] 확인', px + pw / 2, py + ph - 14, { size: 11, align: 'center', fill: PALETTE.gray4 });
  }
}
