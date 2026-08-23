// ============================================================
// party.js — 캐릭터 편성 화면 (기획서 §16 화면 13종의 "파티 편성")
//
// 스테이지를 고르고 아군 4명을 슬롯 0~3에 배치한 뒤 전투를 시작한다.
// 밸런스 튜닝의 선행 작업 — 이게 없으면 임의 파티로 전투를 검증할 수 없다
// (작업계획.md 2부 §2).
//
// 조작은 마우스 완결 + 키보드 완결 둘 다 (절대 규칙 8).
//   ←→↑↓ 커서 / Tab 명단↔슬롯 / Enter 배치·해제 / Space 전투 시작 / ESC 뒤로
// ============================================================

import { Scene } from './scene.js';
import { inRect } from '../core/input.js';
import { PALETTE, drawText, drawTextOutlined, drawPanel, makeUnitSprites, loadAssetSprites, sprScale } from '../core/sprites.js';
import { SPRITE_ASSETS } from '../data/sprite_assets.js';
import { CHARACTERS, HERO_KITS } from '../data/characters.js';
import { STAGES, TEST_STAGE_ID } from '../data/stages.js';
import { ELEMENT_LABELS } from '../data/strings.js';
import { computeAllyStats } from '../battle/logic.js';
import * as GR from '../core/growth.js';
import * as EQ from '../core/equip.js';
import * as BD from '../core/bond.js';

const PARTY_MAX = 4;
const STAGE_IDS = Object.keys(STAGES);

const CLASS_LABELS = {
  knight: '기사', warrior: '전사', thief: '도적',
  mage: '마법사', cleric: '성직자', archer: '궁수',
};
const VICTORY_LABELS = {
  annihilation: '적 전멸',
  boss: '보스 처치',
  survive: '턴 버티기',
};

// 시뮬·프리셋 폴백 명단 (game.state 없이 열렸을 때) — 실제 플레이는 보유 동료만
const ALL_ROSTER = Object.values(CHARACTERS);

// 초상용 스프라이트 — 손그림이 등록돼 있으면 그것을, 없으면 코드 생성본
const portraitCache = {};
function portraitOf(def, heroClass) {
  const cfg = def.isHero ? HERO_KITS[heroClass].spriteCfg : def.spriteCfg;
  const assetKey = def.isHero ? HERO_KITS[heroClass].assetKey : def.assetKey;
  if (assetKey && SPRITE_ASSETS[assetKey]) {
    const entry = loadAssetSprites(assetKey, SPRITE_ASSETS[assetKey]);
    if (entry.set) return { img: entry.set.idle.right[0], asset: true };
  }
  const key = JSON.stringify(cfg);
  if (!portraitCache[key]) {
    const resolved = {};
    for (const [k, v] of Object.entries(cfg)) resolved[k] = PALETTE[v] ?? v;
    portraitCache[key] = makeUnitSprites(resolved);
  }
  return { img: portraitCache[key].idle.right[0], asset: false };
}

export class PartyScene extends Scene {
  constructor() {
    super();
    this.isGameplay = true;
  }

  enter(game, params = {}) {
    // 출정 모드 (거점 → 필드): 스테이지 선택 없이 편성만 확인하고 필드로 나간다
    this.deploy = !!params.deploy;
    this.stageIdx = Math.max(0, STAGE_IDS.indexOf(params.stageId ?? TEST_STAGE_ID));
    // 로스터 연동 (M5-3): 보유 동료만 편성할 수 있다. 상태가 없으면(개발 진입) 전원
    this.roster = game.state
      ? GR.ownedIds(game.state).map((id) => CHARACTERS[id])
      : ALL_ROSTER;
    const ownedSet = new Set(this.roster.map((d) => d.id));
    // 이전 편성을 이어 쓴다 (전투 → 편성 복귀 시 그대로) — 미보유는 걸러낸다
    const saved = game.state?.partyIds;
    this.slots = Array.from({ length: PARTY_MAX }, (_, i) =>
      (saved?.[i] && ownedSet.has(saved[i])) ? saved[i] : null);
    if (!saved) this.fillFromStage(ownedSet);
    this.focus = 'roster';        // roster | slots
    this.rosterSel = 0;
    this.slotSel = 0;
    this.t = 0;
  }

  // 편성 기록이 없으면 스테이지 프리셋으로 채운다 (보유한 캐릭터만)
  fillFromStage(ownedSet) {
    const st = STAGES[STAGE_IDS[this.stageIdx]];
    this.slots = Array.from({ length: PARTY_MAX }, () => null);
    for (const a of st.allies) {
      if (a.slot >= PARTY_MAX) continue;
      if (ownedSet && !ownedSet.has(a.characterId)) continue;
      this.slots[a.slot] = a.characterId;
    }
  }

  stage() { return STAGES[STAGE_IDS[this.stageIdx]]; }
  chosen() { return this.slots.filter(Boolean); }

  // ----- 배치 -----

  assign(game, charId) {
    if (this.slots.includes(charId)) {   // 이미 있으면 빼기 (토글)
      this.slots[this.slots.indexOf(charId)] = null;
      game.audio.playSE('cancel');
      return;
    }
    const empty = this.slots.indexOf(null);
    if (empty < 0) { game.audio.playSE('error'); game.showToast('자리가 없습니다. 슬롯을 비우세요.'); return; }
    this.slots[empty] = charId;
    game.audio.playSE('confirm');
  }

  clearSlot(game, i) {
    if (!this.slots[i]) { game.audio.playSE('error'); return; }
    this.slots[i] = null;
    game.audio.playSE('cancel');
  }

  cycleStage(game, d) {
    this.stageIdx = (this.stageIdx + d + STAGE_IDS.length) % STAGE_IDS.length;
    game.audio.playSE('move');
  }

  start(game) {
    if (!this.chosen().length) {
      game.audio.playSE('error');
      game.showToast('최소 1명은 편성해야 합니다.');
      return;
    }
    // 편성을 게임 상태에 남겨 전투 후 돌아와도 유지되게
    if (game.state) game.state.partyIds = this.slots.slice();
    game.audio.playSE('confirm');
    if (this.deploy) {
      // 출정: 필드로 (맵을 지정하지 않는다 — 세이브에 남은 좌표에서 재개)
      game.changeScene('field');
      return;
    }
    game.changeScene('battle', {
      stageId: this.stage().id,
      partyIds: this.chosen(),
      from: 'party',
    });
  }

  back(game) {
    game.audio.playSE('cancel');
    game.changeScene(this.deploy ? 'base' : 'placeholder');
  }

  // ----- 레이아웃 -----

  stageRects() {
    return [
      { id: 'stagePrev', x: 24, y: 62, w: 26, h: 26 },
      { id: 'stageNext', x: 300, y: 62, w: 26, h: 26 },
    ];
  }

  slotRect(i) { return { x: 24, y: 126 + i * 74, w: 302, h: 66 }; }

  rosterRect(i) {
    const col = i % 4, row = Math.floor(i / 4);
    return { x: 348 + col * 150, y: 126 + row * 84, w: 142, h: 76 };
  }

  actionRects() {
    return [
      { id: 'start', label: this.deploy ? '출정 [Space]' : '전투 시작 [Space]', x: 620, y: 470, w: 200, h: 40 },
      { id: 'clear', label: '전체 해제', x: 500, y: 470, w: 106, h: 40 },
      { id: 'back', label: '뒤로 [ESC]', x: 380, y: 470, w: 106, h: 40 },
    ];
  }

  // ----- 입력 -----

  onKeyDown(code, game) {
    const n = this.roster.length;
    if (code === 'Escape') { this.back(game); return; }
    if (code === 'Space') { this.start(game); return; }
    if (code === 'Tab') {
      this.focus = this.focus === 'roster' ? 'slots' : 'roster';
      game.audio.playSE('move');
      return;
    }
    if (!this.deploy && code === 'KeyQ') { this.cycleStage(game, -1); return; }
    if (!this.deploy && code === 'KeyE') { this.cycleStage(game, 1); return; }

    if (this.focus === 'roster') {
      if (code === 'ArrowRight') { this.rosterSel = (this.rosterSel + 1) % n; game.audio.playSE('move'); }
      else if (code === 'ArrowLeft') { this.rosterSel = (this.rosterSel + n - 1) % n; game.audio.playSE('move'); }
      else if (code === 'ArrowDown') { this.rosterSel = (this.rosterSel + 4) % n; game.audio.playSE('move'); }
      else if (code === 'ArrowUp') { this.rosterSel = (this.rosterSel + n - 4) % n; game.audio.playSE('move'); }
      else if (code === 'Enter') this.assign(game, this.roster[this.rosterSel].id);
    } else {
      if (code === 'ArrowDown') { this.slotSel = (this.slotSel + 1) % PARTY_MAX; game.audio.playSE('move'); }
      else if (code === 'ArrowUp') { this.slotSel = (this.slotSel + PARTY_MAX - 1) % PARTY_MAX; game.audio.playSE('move'); }
      else if (code === 'Enter') this.clearSlot(game, this.slotSel);
    }
  }

  hitTest(x, y) {
    if (!this.deploy) for (const r of this.stageRects()) if (inRect(x, y, r)) return r;
    for (const r of this.actionRects()) if (inRect(x, y, r)) return r;
    for (let i = 0; i < PARTY_MAX; i++) if (inRect(x, y, this.slotRect(i))) return { id: 'slot', i };
    for (let i = 0; i < this.roster.length; i++) if (inRect(x, y, this.rosterRect(i))) return { id: 'char', i };
    return null;
  }

  onMouseMove(x, y, game) {
    const hit = this.hitTest(x, y);
    game.setCursor(hit ? 'pointer' : 'default');
    if (hit?.id === 'char') { this.focus = 'roster'; this.rosterSel = hit.i; }
    else if (hit?.id === 'slot') { this.focus = 'slots'; this.slotSel = hit.i; }
  }

  onMouseDown(x, y, button, game) {
    if (button === 2) { this.back(game); return; }
    if (button !== 0) return;
    const hit = this.hitTest(x, y);
    if (!hit) return;
    if (hit.id === 'char') this.assign(game, this.roster[hit.i].id);
    else if (hit.id === 'slot') this.clearSlot(game, hit.i);
    else if (hit.id === 'stagePrev') this.cycleStage(game, -1);
    else if (hit.id === 'stageNext') this.cycleStage(game, 1);
    else if (hit.id === 'start') this.start(game);
    else if (hit.id === 'back') this.back(game);
    else if (hit.id === 'clear') { this.slots = Array.from({ length: PARTY_MAX }, () => null); game.audio.playSE('cancel'); }
  }

  update(dt) { this.t += dt; }

  // ----- 렌더 -----

  statsOf(def, game) {
    const d = def.isHero
      ? { ...def, isHero: true, heroClass: game.state?.heroClass ?? 'sword' }
      : def;
    if (!game.state) return computeAllyStats(d, this.stage().level);
    const e = GR.entryOf(game.state, def.id);
    return computeAllyStats(d, e?.lv ?? 1, {
      limitBreak: e?.lb ?? 0, awaken: e?.awaken ?? 0,
      equip: EQ.equipBonus(game.state, def.id),   // 장비 포함 (M5-4)
      bond: BD.bondBonus(game.state, def.id),     // 교감 포함 (M5-7)
    });
  }

  lvOf(def, game) {
    if (!game.state) return this.stage().level;
    return GR.entryOf(game.state, def.id)?.lv ?? 1;
  }

  // 전투력 — 편성 비교용 단일 지표. 밸런스 수치가 아니라 표시용이라 여기서 계산한다.
  powerOf(st) {
    return Math.round(st.maxHp * 0.5 + st.atk * 2 + st.mag * 2 + st.def * 1.5 + st.spd);
  }

  drawPortrait(g, def, game, cx, cy, scale) {
    const { img } = portraitOf(def, game.state?.heroClass ?? 'sword');
    if (!img) return;
    const k = sprScale(img, scale);
    const w = img.width * k, h = img.height * k;
    g.imageSmoothingEnabled = false;
    g.drawImage(img, Math.round(cx - w / 2), Math.round(cy - h), w, h);
  }

  render(g, game) {
    g.fillStyle = PALETTE.ink;
    g.fillRect(0, 0, 960, 540);
    g.fillStyle = PALETTE.navy1;
    g.fillRect(0, 0, 960, 44);

    drawTextOutlined(g, this.deploy ? '출정 준비' : '파티 편성', 24, 32, { size: 22, bold: true, fill: PALETTE.gold, outline: PALETTE.black, align: 'left' });
    drawText(g, this.deploy
      ? 'Tab 명단↔슬롯 · Enter 배치/해제 · Space 출정 · ESC 거점으로'
      : 'Tab 명단↔슬롯 · Enter 배치/해제 · Q/E 스테이지 · Space 시작 · ESC 뒤로',
      950, 30, { size: 12, fill: PALETTE.gray2, align: 'right' });

    if (this.deploy) this.renderDeployInfo(g);
    else this.renderStage(g);
    this.renderSlots(g, game);
    this.renderRoster(g, game);
    this.renderActions(g, game);
  }

  // 출정 모드 상단 — 스테이지 선택 대신 행선지 안내
  renderDeployInfo(g) {
    drawPanel(g, 24, 54, 302, 62);
    drawText(g, '새벽 평원으로 출정', 175, 78, { size: 14, bold: true, fill: PALETTE.white, align: 'center' });
    drawText(g, '필드의 적과 이 편성으로 싸웁니다', 175, 100, { size: 12, fill: PALETTE.gray3, align: 'center' });
  }

  renderStage(g) {
    const st = this.stage();
    drawPanel(g, 24, 54, 302, 62);
    const v = st.victory;
    const vLabel = v.type === 'survive' ? `${v.turns}턴 버티기` : VICTORY_LABELS[v.type];
    drawText(g, st.name, 175, 78, { size: 14, bold: true, fill: PALETTE.white, align: 'center' });
    drawText(g, `Lv.${st.level} · ${vLabel} · 적 ${st.enemies.length}기 · ★${st.starTurns}턴`,
      175, 100, { size: 12, fill: PALETTE.gray3, align: 'center' });
    for (const r of this.stageRects()) {
      g.fillStyle = PALETTE.navy2;
      g.fillRect(r.x, r.y, r.w, r.h);
      drawText(g, r.id === 'stagePrev' ? '◀' : '▶', r.x + r.w / 2, r.y + 19, { size: 13, fill: PALETTE.gold, align: 'center' });
    }
  }

  renderSlots(g, game) {
    drawText(g, `편성 ${this.chosen().length} / ${PARTY_MAX}`, 24, 138, { size: 13, fill: PALETTE.gold });
    let total = 0;
    for (let i = 0; i < PARTY_MAX; i++) {
      const r = this.slotRect(i);
      const active = this.focus === 'slots' && this.slotSel === i;
      const id = this.slots[i];
      g.fillStyle = PALETTE.navy1;
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = active ? PALETTE.gold : PALETTE.navy3;
      g.lineWidth = 2;
      g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      drawText(g, `${i + 1}`, r.x + 12, r.y + 40, { size: 16, bold: true, fill: PALETTE.gray2 });

      if (!id) {
        drawText(g, '— 비어 있음 —', r.x + r.w / 2, r.y + 38, { size: 13, fill: PALETTE.gray1, align: 'center' });
        continue;
      }
      const def = CHARACTERS[id];
      const stt = this.statsOf(def, game);
      total += this.powerOf(stt);
      this.drawPortrait(g, def, game, r.x + 52, r.y + r.h - 6, 0.85);
      const name = def.isHero ? (game.state?.heroName ?? def.name) : def.name;
      drawText(g, `${name}  Lv${this.lvOf(def, game)}`, r.x + 84, r.y + 26, { size: 14, bold: true, fill: PALETTE.white });
      drawText(g, `${'★'.repeat(def.grade || 0)}${def.isHero ? '주인공' : ''}`, r.x + 84, r.y + 44, { size: 11, fill: PALETTE.gold });
      drawText(g, `HP ${stt.maxHp} · 공 ${stt.atk} · 마 ${stt.mag}`, r.x + r.w - 10, r.y + 26, { size: 11, fill: PALETTE.gray3, align: 'right' });
      drawText(g, `방 ${stt.def} · 속 ${stt.spd}`, r.x + r.w - 10, r.y + 44, { size: 11, fill: PALETTE.gray3, align: 'right' });
    }
    drawText(g, `합계 전투력 ${total}`, 175, 434, { size: 14, bold: true, fill: total ? PALETTE.gold : PALETTE.gray1, align: 'center' });
  }

  renderRoster(g, game) {
    drawText(g, game.state ? `보유 동료 ${this.roster.length}명` : '명단(개발)', 348, 118, { size: 13, fill: PALETTE.gold });
    for (let i = 0; i < this.roster.length; i++) {
      const def = this.roster[i];
      const r = this.rosterRect(i);
      const placed = this.slots.includes(def.id);
      const active = this.focus === 'roster' && this.rosterSel === i;
      g.fillStyle = placed ? PALETTE.navy2 : PALETTE.navy1;
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = active ? PALETTE.gold : (placed ? PALETTE.blue : PALETTE.navy3);
      g.lineWidth = 2;
      g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);

      this.drawPortrait(g, def, game, r.x + 32, r.y + r.h - 6, 0.72);
      const name = def.isHero ? (game.state?.heroName ?? def.name) : def.name;
      drawText(g, name, r.x + 58, r.y + 24, { size: 13, bold: true, fill: PALETTE.white });
      const cls = def.isHero ? '주인공' : CLASS_LABELS[def.classKey];
      drawText(g, `${cls} · ${ELEMENT_LABELS[def.element] ?? def.element}`, r.x + 58, r.y + 42, { size: 11, fill: PALETTE.gray3 });
      drawText(g, '★'.repeat(def.grade || 0), r.x + 58, r.y + 60, { size: 11, fill: PALETTE.gold });
      drawText(g, `Lv${this.lvOf(def, game)}`, r.x + r.w - 12, r.y + 60, { size: 11, fill: PALETTE.skyBlue, align: 'right' });
      if (placed) {
        drawText(g, `${this.slots.indexOf(def.id) + 1}`, r.x + r.w - 14, r.y + 22, { size: 14, bold: true, fill: PALETTE.gold, align: 'right' });
      }
    }
  }

  renderActions(g, game) {
    const can = this.chosen().length > 0;
    for (const b of this.actionRects()) {
      const hover = inRect(game.input.mouse.x, game.input.mouse.y, b);
      const on = b.id !== 'start' || can;
      g.fillStyle = !on ? PALETTE.gray1 : hover ? PALETTE.navy3 : PALETTE.navy2;
      g.fillRect(b.x, b.y, b.w, b.h);
      g.strokeStyle = !on ? PALETTE.gray2 : hover ? PALETTE.gold : PALETTE.navy3;
      g.lineWidth = 2;
      g.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      drawText(g, b.label, b.x + b.w / 2, b.y + 26,
        { size: 14, bold: b.id === 'start', fill: !on ? PALETTE.gray2 : hover ? PALETTE.gold : PALETTE.gray4, align: 'center' });
    }
  }
}
