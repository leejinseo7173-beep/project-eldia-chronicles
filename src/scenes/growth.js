// ============================================================
// growth.js(씬) — 육성 화면 (기획서 §7·§16, M5-3)
//
// 거점의 훈련소·신전에서 진입한다. 왼쪽 보유 명단 → 오른쪽 상세:
// 스탯(다음 레벨 미리보기 — 툴팁 원칙: 일반론이 아니라 실제 수치)과
// [레벨업(골드)] [한계돌파(조각)] [각성(각성석, 신전·3장)] 버튼.
// 장비 3슬롯(M5-4): 슬롯 클릭(1/2/3키) → 교체 모달 — 착용 가능만 나열,
// 장착 중 대비 실수치 증감 표시. 계산은 core/growth.js·core/equip.js (규칙 4).
// 조작: ↑↓ 선택 / Z 레벨업 / C 한돌 / V 각성 / 1·2·3 장비 / X 나가기 + 마우스 완결.
// ============================================================

import { Scene } from './scene.js';
import { inRect } from '../core/input.js';
import { PALETTE, ELEMENT_COLORS, drawText, drawTextOutlined, drawPanel, makeUnitSprites, loadAssetSprites, sprScale } from '../core/sprites.js';
import { SPRITE_ASSETS } from '../data/sprite_assets.js';
import { CHARACTERS, HERO_KITS } from '../data/characters.js';
import { ELEMENT_LABELS } from '../data/strings.js';
import { computeAllyStats } from '../battle/logic.js';
import { BALANCE } from '../balance.js';
import * as GR from '../core/growth.js';
import * as EQ from '../core/equip.js';
import { EQUIP_KINDS, GRADES, SLOT_LABELS, SUB_LABELS } from '../data/equipment.js';
import { equipIcon } from '../core/equip_icons.js';
import * as BD from '../core/bond.js';

const EQUIP_SLOTS = ['weapon', 'armor', 'acc'];

const W = 960, H = 540;
const CLASS_LABELS = {
  knight: '기사', warrior: '전사', thief: '도적',
  mage: '마법사', cleric: '성직자', archer: '궁수',
  sword: '검사', arch: '궁수',
};
const STAT_ROWS = [
  ['maxHp', 'HP'], ['atk', '공격'], ['mag', '마력'], ['def', '방어'], ['spd', '속도'],
];

const portraitCache = {};
function portraitOf(def, heroClass) {
  const cfg = def.isHero ? HERO_KITS[heroClass].spriteCfg : def.spriteCfg;
  const assetKey = def.isHero ? HERO_KITS[heroClass].assetKey : def.assetKey;
  if (assetKey && SPRITE_ASSETS[assetKey]) {
    const entry = loadAssetSprites(assetKey, SPRITE_ASSETS[assetKey]);
    if (entry.set) return entry.set.idle.right[0];
  }
  const key = JSON.stringify(cfg);
  if (!portraitCache[key]) {
    const resolved = {};
    for (const [k, v] of Object.entries(cfg)) resolved[k] = PALETTE[v] ?? v;
    portraitCache[key] = makeUnitSprites(resolved);
  }
  return portraitCache[key].idle.right[0];
}

export class GrowthScene extends Scene {
  constructor() {
    super();
    this.isGameplay = true;
  }

  enter(game) {
    GR.ensureGrowth(game.state);
    EQ.ensureEquip(game.state);
    this.list = GR.ownedIds(game.state);
    this.sel = 0;
    this.t = 0;
    this.flash = null;          // 성장 직후 스탯 강조 { t }
    this.modal = null;          // 장비 교체 모달 { slot, items, sel, scroll }
  }

  update(dt) {
    this.t += dt;
    if (this.flash) {
      this.flash.t += dt;
      if (this.flash.t > 0.6) this.flash = null;
    }
  }

  // ----- 조회 -----

  selId() { return this.list[this.sel]; }

  defOf(game, cid) {
    const c = CHARACTERS[cid];
    if (!c.isHero) return c;
    const heroClass = game.state?.heroClass ?? 'sword';
    return { ...c, heroClass, ...HERO_KITS[heroClass] };
  }

  heroClassLabel(game) {
    return { sword: '검사', mage: '마법사', archer: '궁수' }[game.state?.heroClass ?? 'sword'];
  }

  // ----- 행동 -----

  doTrain(game, times = 1) {
    let ups = 0, spent = 0, last = null;
    for (let i = 0; i < times; i++) {
      const r = GR.trainOnce(game.state, this.selId());
      last = r;
      if (!r.ok) break;
      ups += 1;
      spent += r.cost;
    }
    if (ups > 0) {
      game.audio.playSE('powerup');
      this.flash = { t: 0 };
      if (times > 1) game.showToast(`레벨 +${ups} (골드 ${spent})`);
    } else if (last?.err === 'cap') {
      game.audio.playSE('error');
      game.showToast('레벨 상한입니다 — 훈련소를 증축하세요');
    } else if (last?.err === 'gold') {
      game.audio.playSE('error');
      game.showToast(`골드가 부족합니다 (필요 ${last.cost})`);
    }
  }

  doLimitBreak(game) {
    const r = GR.limitBreak(game.state, this.selId());
    if (r.ok) {
      game.audio.playSE('crit');
      this.flash = { t: 0 };
      game.showToast(`한계돌파 ${r.lb}단계! (+${Math.round(BALANCE.limitBreak.perStep * 100)}% 스탯)`);
      return;
    }
    game.audio.playSE('error');
    if (r.err === 'hero') game.showToast('주인공은 한계돌파가 없습니다 (중복 소환 재료)');
    else if (r.err === 'max') game.showToast('이미 완돌입니다');
    else if (r.err === 'shard') game.showToast('조각이 부족합니다 — 같은 동료를 중복 소환하면 얻습니다');
  }

  doAwaken(game) {
    const r = GR.awaken(game.state, this.selId());
    if (r.ok) {
      game.audio.playSE('crit');
      this.flash = { t: 0 };
      game.showToast(`${r.awaken}각성! (+${Math.round(BALANCE.awaken.perStep * 100)}% 스탯)`);
      return;
    }
    game.audio.playSE('error');
    if (r.err === 'hero') game.showToast('주인공은 각성이 없습니다');
    else if (r.err === 'chapter') game.showToast('각성은 3장에서 해금됩니다');
    else if (r.err === 'build') game.showToast('신전을 먼저 건설하세요');
    else if (r.err === 'max') game.showToast('이미 3각성입니다');
    else if (r.err === 'stone') game.showToast(`각성석이 부족합니다 (필요 ${r.cost})`);
  }

  back(game) {
    game.audio.playSE('cancel');
    game.changeScene('base');
  }

  // ----- 입력 -----

  onKeyDown(code, game) {
    if (this.modal) {
      const m = this.modal;
      if (code === 'ArrowDown') { m.sel = Math.min(m.items.length - 1, m.sel + 1); game.audio.playSE('move'); }
      else if (code === 'ArrowUp') { m.sel = Math.max(0, m.sel - 1); game.audio.playSE('move'); }
      else if (code === 'KeyZ' || code === 'Enter') this.modalPick(game);
      else if (code === 'Escape' || code === 'KeyX') { this.modal = null; game.audio.playSE('cancel'); }
      return;
    }
    const n = this.list.length;
    if (code === 'ArrowDown') { this.sel = (this.sel + 1) % n; game.audio.playSE('move'); }
    else if (code === 'ArrowUp') { this.sel = (this.sel + n - 1) % n; game.audio.playSE('move'); }
    else if (code === 'KeyZ' || code === 'Enter') this.doTrain(game, game.input?.keys?.has('ShiftLeft') || game.input?.keys?.has('ShiftRight') ? 5 : 1);
    else if (code === 'KeyC') this.doLimitBreak(game);
    else if (code === 'KeyV') this.doAwaken(game);
    else if (code === 'Digit1') this.openModal(game, 'weapon');
    else if (code === 'Digit2') this.openModal(game, 'armor');
    else if (code === 'Digit3') this.openModal(game, 'acc');
    else if (code === 'Escape' || code === 'KeyX') this.back(game);
  }

  onMouseDown(x, y, button, game) {
    if (this.modal) {
      const rects = this.modalRects();
      for (let i = 0; i < rects.length; i++) {
        if (inRect(x, y, rects[i])) { this.modal.sel = i; this.modalPick(game); return; }
      }
      this.modal = null;                 // 바깥 클릭 = 닫기
      game.audio.playSE('cancel');
      return;
    }
    for (let i = 0; i < EQUIP_SLOTS.length; i++) {
      if (inRect(x, y, this.equipSlotRect(i))) { this.openModal(game, EQUIP_SLOTS[i]); return; }
    }
    for (let i = 0; i < this.list.length; i++) {
      if (inRect(x, y, this.rowRect(i))) {
        if (this.sel !== i) { this.sel = i; game.audio.playSE('move'); }
        return;
      }
    }
    for (const b of this.buttons(game)) {
      if (inRect(x, y, b)) { b.run(); return; }
    }
  }

  // ----- 장비 모달 -----

  equipSlotRect(i) { return { x: 676, y: 304 + i * 50, w: 256, h: 46 }; }

  openModal(game, slot) {
    const st = game.state;
    const cid = this.selId();
    const items = st.inventory.equips
      .filter((it) => EQUIP_KINDS[it.kind].slot === slot && EQ.canEquip(st, cid, it.kind))
      .sort((a, b) => (b.tier - a.tier) || (b.grade - a.grade) || (b.enhance - a.enhance));
    const rows = [];
    const cur = GR.entryOf(st, cid).equip?.[slot] ?? null;
    if (cur != null) rows.push({ type: 'unequip' });
    for (const it of items) rows.push({ type: 'item', item: it });
    if (!rows.length) {
      game.audio.playSE('error');
      game.showToast(`착용할 수 있는 ${SLOT_LABELS[slot]}가 없습니다 — 대장간에서 제작하세요`);
      return;
    }
    this.modal = { slot, items: rows, sel: 0, cur };
    game.audio.playSE('confirm');
  }

  modalPick(game) {
    const m = this.modal;
    const row = m.items[m.sel];
    const cid = this.selId();
    if (row.type === 'unequip') {
      EQ.unequip(game.state, cid, m.slot);
      game.audio.playSE('cancel');
      game.showToast('해제했습니다');
    } else {
      const r = EQ.equipItem(game.state, cid, row.item.uid);
      if (r.ok) {
        game.audio.playSE('powerup');
        this.flash = { t: 0 };
        game.showToast(`${EQ.displayName(row.item)} 장착`);
      }
    }
    this.modal = null;
  }

  modalRects() {
    const m = this.modal;
    const top = Math.max(0, Math.min(m.sel - 5, m.items.length - 6));
    m.top = top;
    const out = [];
    for (let i = top; i < Math.min(m.items.length, top + 6); i++) {
      out[i] = { x: 250, y: 148 + (i - top) * 52, w: 460, h: 48 };
    }
    return out;
  }

  // ----- 레이아웃 -----

  rowRect(i) { return { x: 24, y: 96 + i * 27, w: 292, h: 26 }; }

  buttons(game) {
    const cid = this.selId();
    const st = game.state;
    const e = GR.entryOf(st, cid);
    const cap = GR.levelCap(st);
    const isHero = cid === 'hero';
    const remain = Math.max(0, GR.xpNeed(e.lv) - e.xp);
    const trainGold = Math.max(1, Math.ceil(remain * BALANCE.growth.trainGoldPerXp));
    const gate = GR.awakenGate(st);
    const bx = 360, by = 468, bw = 188, gap = 200;
    return [
      {
        x: bx, y: by, w: bw, h: 46, id: 'train', key: '[Z]',
        label: '레벨업', dim: e.lv >= cap,
        sub: e.lv >= cap ? '상한 도달' : `골드 ${trainGold}`,
        run: () => this.doTrain(game, 1),
      },
      {
        x: bx + gap, y: by, w: bw, h: 46, id: 'lb', key: '[C]',
        label: '한계돌파', dim: isHero || (e.lb ?? 0) >= BALANCE.limitBreak.maxSteps,
        sub: isHero ? '주인공 제외' : (e.lb >= BALANCE.limitBreak.maxSteps ? '완돌' : `조각 ${GR.lbShardCost()} · 보유 ${e.shards ?? 0}`),
        run: () => this.doLimitBreak(game),
      },
      {
        x: bx + gap * 2, y: by, w: bw, h: 46, id: 'awaken', key: '[V]',
        label: '각성', dim: isHero || !!gate || (e.awaken ?? 0) >= BALANCE.awaken.maxSteps,
        sub: isHero ? '주인공 제외'
          : gate === 'chapter' ? '3장 해금'
          : gate === 'build' ? '신전 필요'
          : (e.awaken >= BALANCE.awaken.maxSteps ? '완료' : `각성석 ${GR.awakenCost(e.awaken)}`),
        run: () => this.doAwaken(game),
      },
    ];
  }

  // ----- 그리기 -----

  itemSummary(item) {
    const s = EQ.itemStats(item);
    const parts = [];
    const L = { atk: '공', mag: '마', hp: 'HP', def: '방', spd: '속' };
    for (const [k, v] of Object.entries(s.flat)) if (v) parts.push(`${L[k]}+${v}`);
    for (const [k, v] of Object.entries(s.pct)) if (v) parts.push(SUB_LABELS[k].replace('{v}', v));
    if (s.critPct) parts.push(`치명+${s.critPct}%`);
    return parts.join(' ');
  }

  drawModal(g, game) {
    const st = game.state;
    const m = this.modal;
    g.fillStyle = 'rgba(8, 6, 20, 0.72)';
    g.fillRect(0, 0, W, H);
    drawPanel(g, 240, 96, 480, 400, { border: PALETTE.gold });
    drawText(g, `${SLOT_LABELS[m.slot]} 교체 — 보유 ${m.items.filter((r) => r.type === 'item').length}개`,
      480, 122, { size: 13, bold: true, align: 'center', fill: PALETTE.gold });
    const cur = EQ.itemOf(st, m.cur);
    const curStats = cur ? EQ.itemStats(cur).flat : null;
    const rects = this.modalRects();
    for (let i = m.top; i < Math.min(m.items.length, m.top + 6); i++) {
      const row = m.items[i];
      const r = rects[i];
      const on = i === m.sel;
      drawPanel(g, r.x, r.y, r.w, r.h, { border: on ? PALETTE.gold : PALETTE.navy3 });
      if (row.type === 'unequip') {
        drawText(g, '장비 해제', r.x + 16, r.y + 30, { size: 12, bold: true, fill: PALETTE.gray4 });
        continue;
      }
      const item = row.item;
      const gcol = PALETTE[GRADES[item.grade].color];
      g.strokeStyle = gcol;
      g.lineWidth = 2;
      g.strokeRect(r.x + 7.5, r.y + 7.5, 33, 33);
      const icon = equipIcon(item.kind);
      if (icon) {
        g.imageSmoothingEnabled = true;
        g.drawImage(icon, r.x + 9, r.y + 9, 30, 30);
        g.imageSmoothingEnabled = false;
      }
      const equippedMark = item.uid === m.cur ? ' (장착 중)' : '';
      drawText(g, `T${item.tier} ${EQ.displayName(item)}${equippedMark}`, r.x + 50, r.y + 20, { size: 11, bold: true, fill: gcol });
      drawText(g, this.itemSummary(item), r.x + 50, r.y + 36, { size: 9, fill: PALETTE.gray3 });
      // 장착 중 대비 증감 (주스탯 합 비교 — 실수치 원칙)
      if (curStats && item.uid !== m.cur) {
        const f = EQ.itemStats(item).flat;
        const keys = ['atk', 'mag', 'hp', 'def', 'spd'];
        const diffs = [];
        const L = { atk: '공', mag: '마', hp: 'HP', def: '방', spd: '속' };
        for (const k of keys) {
          const d = (f[k] ?? 0) - (curStats[k] ?? 0);
          if (d) diffs.push(`${L[k]}${d > 0 ? '+' : ''}${d}`);
        }
        if (diffs.length) {
          const up = diffs[0].includes('+');
          drawText(g, diffs.slice(0, 3).join(' '), r.x + r.w - 12, r.y + 28,
            { size: 10, align: 'right', fill: up ? PALETTE.green : PALETTE.red });
        }
      }
    }
    if (m.items.length > 6) {
      drawText(g, `${m.sel + 1} / ${m.items.length}`, 480, 470, { size: 10, align: 'center', fill: PALETTE.gray2 });
    }
    drawText(g, '↑↓ 선택 · Z 장착 · X 닫기', 480, 488, { size: 10, align: 'center', fill: PALETTE.gray3 });
  }

  render(g, game) {
    const st = game.state;
    g.fillStyle = PALETTE.navy0 ?? '#0d0b14';
    g.fillRect(0, 0, W, H);
    // 은은한 세로 그라데이션 배경
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(37, 29, 78, 0.55)');
    grad.addColorStop(1, 'rgba(13, 11, 20, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    drawTextOutlined(g, '육  성', 60, 44, { size: 22, bold: true, fill: PALETTE.gold, outline: PALETTE.black });
    drawText(g, '훈련과 맹세로 동료를 강하게', 130, 44, { size: 10, fill: PALETTE.gray3 });

    // 보유 재화
    drawPanel(g, 550, 16, 300, 34, { border: PALETTE.goldDark });
    drawText(g, `골드 ${st.resources.gold ?? 0}`, 570, 38, { size: 11, bold: true, fill: PALETTE.gold });
    drawText(g, `각성석 ${st.resources.awaken ?? 0}`, 720, 38, { size: 11, bold: true, fill: PALETTE.skyBlue });
    // 나가기
    drawPanel(g, 862, 16, 84, 26, { border: PALETTE.goldDark });
    drawText(g, '나가기 [X]', 904, 34, { size: 10, align: 'center', fill: PALETTE.gray4 });

    // ----- 왼쪽: 보유 명단 -----
    drawPanel(g, 16, 66, 308, 458, { border: PALETTE.goldDark });
    drawText(g, `보유 동료  ${this.list.length}명`, 32, 86, { size: 11, bold: true, fill: PALETTE.gray4 });
    const cap = GR.levelCap(st);
    for (let i = 0; i < this.list.length; i++) {
      const cid = this.list[i];
      const c = CHARACTERS[cid];
      const e = GR.entryOf(st, cid);
      const r = this.rowRect(i);
      const on = i === this.sel;
      if (on) {
        g.fillStyle = PALETTE.navy2;
        g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = PALETTE.gold;
        g.lineWidth = 1;
        g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      }
      const name = c.isHero ? (st.heroName ?? '아렌') : c.name;
      drawText(g, name, r.x + 10, r.y + 18, { size: 12, bold: on, fill: on ? PALETTE.white : PALETTE.gray4 });
      drawText(g, `Lv${e.lv}`, r.x + 108, r.y + 18, { size: 11, fill: e.lv >= cap ? PALETTE.gold : PALETTE.gray3 });
      const stars = c.isHero ? '주인공' : '★'.repeat(c.grade);
      drawText(g, stars, r.x + 156, r.y + 18, { size: 10, fill: c.isHero ? PALETTE.skyBlue : PALETTE.gold });
      const cls = c.isHero ? this.heroClassLabel(game) : CLASS_LABELS[c.classKey];
      drawText(g, cls, r.x + 232, r.y + 18, { size: 10, fill: PALETTE.gray2 });
    }

    // ----- 오른쪽: 상세 -----
    const cid = this.selId();
    const c = CHARACTERS[cid];
    const def = this.defOf(game, cid);
    const e = GR.entryOf(st, cid);
    drawPanel(g, 340, 66, 604, 390, { border: PALETTE.goldDark });

    // 초상 + 이름 줄
    const spr = portraitOf(c, game.state?.heroClass ?? 'sword');
    g.imageSmoothingEnabled = false;
    const pk = sprScale(spr, 2);
    const pw = spr.width * pk, ph = spr.height * pk;
    drawPanel(g, 360, 86, 96, 96, { border: PALETTE.navy3 });
    g.drawImage(spr, Math.round(408 - pw / 2), Math.round(178 - ph), pw, ph);
    const name = c.isHero ? (st.heroName ?? '아렌') : c.name;
    drawTextOutlined(g, name, 476, 112, { size: 20, bold: true, fill: PALETTE.white, outline: PALETTE.black });
    if (c.title) drawText(g, c.title, 478, 132, { size: 10, fill: PALETTE.gold });
    const cls = c.isHero ? this.heroClassLabel(game) : CLASS_LABELS[c.classKey];
    const elem = ELEMENT_LABELS[def.element] ?? def.element;
    drawText(g, `${cls} · `, 478, 152, { size: 11, fill: PALETTE.gray3 });
    drawText(g, elem, 478 + (cls.length + 2) * 11, 152, { size: 11, fill: ELEMENT_COLORS[def.element] ?? PALETTE.gray3 });
    if (!c.isHero) drawText(g, '★'.repeat(c.grade), 478, 172, { size: 12, fill: PALETTE.gold });

    // 한돌·각성 표기 (동료만)
    if (!c.isHero) {
      const lbMax = BALANCE.limitBreak.maxSteps;
      let marks = '';
      for (let i = 0; i < lbMax; i++) marks += i < (e.lb ?? 0) ? '◆' : '◇';
      drawText(g, `한계돌파 ${marks}`, 680, 112, { size: 11, fill: PALETTE.purple });
      drawText(g, `조각 ${e.shards ?? 0}`, 830, 112, { size: 10, fill: PALETTE.gray3 });
      const awMax = BALANCE.awaken.maxSteps;
      let aw = '';
      for (let i = 0; i < awMax; i++) aw += i < (e.awaken ?? 0) ? '●' : '○';
      drawText(g, `각성     ${aw}`, 680, 132, { size: 11, fill: PALETTE.skyBlue });
    }

    // 레벨 + 경험치 바
    drawText(g, `Lv ${e.lv}`, 680, 162, { size: 15, bold: true, fill: e.lv >= cap ? PALETTE.gold : PALETTE.white });
    drawText(g, `/ 상한 ${cap}`, 738, 162, { size: 11, fill: PALETTE.gray3 });
    const need = GR.xpNeed(e.lv);
    g.fillStyle = PALETTE.navy1;
    g.fillRect(680, 170, 240, 8);
    g.fillStyle = PALETTE.skyBlue;
    g.fillRect(680, 170, Math.round(240 * Math.min(1, e.lv >= cap ? 1 : e.xp / need)), 8);
    drawText(g, e.lv >= cap ? 'MAX' : `EXP ${e.xp} / ${need}`, 680, 192, { size: 9, fill: PALETTE.gray2 });

    // 스탯 표 — 지금 vs 다음 레벨 (실제 수치 원칙, 장비 포함)
    const opts = { limitBreak: e.lb ?? 0, awaken: e.awaken ?? 0, equip: EQ.equipBonus(st, cid), bond: BD.bondBonus(st, cid) };
    const now = computeAllyStats(def, e.lv, opts);
    const next = e.lv < cap ? computeAllyStats(def, e.lv + 1, opts) : null;
    drawText(g, '능력치', 372, 216, { size: 11, bold: true, fill: PALETTE.gray4 });
    drawText(g, next ? '다음 레벨' : '', 560, 216, { size: 10, fill: PALETTE.green });
    for (let i = 0; i < STAT_ROWS.length; i++) {
      const [k, label] = STAT_ROWS[i];
      const y = 244 + i * 30;
      const hl = this.flash && this.flash.t < 0.6;
      drawText(g, label, 372, y, { size: 12, fill: PALETTE.gray3 });
      drawTextOutlined(g, `${now[k]}`, 470, y, { size: 14, bold: true, fill: hl ? PALETTE.gold : PALETTE.white, outline: PALETTE.black });
      if (next && next[k] > now[k]) {
        drawText(g, `→ ${next[k]}`, 540, y, { size: 12, fill: PALETTE.green });
        drawText(g, `(+${next[k] - now[k]})`, 610, y, { size: 10, fill: PALETTE.green });
      }
    }
    drawText(g, `치명타 ${Math.round(now.critBase * 100)}%`, 372, 244 + STAT_ROWS.length * 30, { size: 11, fill: PALETTE.gray3 });

    // 보정 요약 — 등급·한돌·각성이 곱으로 얼마나 붙는지 그대로 보여준다
    if (!c.isHero) {
      const parts = [`★${c.grade} +${Math.round((BALANCE.gradeMult[c.grade] - 1) * 100)}%`];
      if (e.lb > 0) parts.push(`한돌 +${Math.round(e.lb * BALANCE.limitBreak.perStep * 100)}%`);
      if (e.awaken > 0) parts.push(`각성 +${Math.round(e.awaken * BALANCE.awaken.perStep * 100)}%`);
      const bondPct = BD.bondBonus(st, cid);
      if (bondPct > 0) parts.push(`호감 +${Math.round(bondPct * 100)}%`);
      drawText(g, `보정: ${parts.join(' · ')}`, 680, 244, { size: 10, fill: PALETTE.gray2 });
    }

    // 훈련소 안내
    const dojoLv = st.base?.buildings?.dojo?.lv ?? 0;
    drawText(g, `훈련소 Lv${dojoLv} — 증축하면 상한 +${BALANCE.growth.levelCap.perDojoLv}`, 680, 268, { size: 10, fill: PALETTE.gray2 });

    // ----- 장비 3슬롯 (M5-4) -----
    drawText(g, '장비', 676, 296, { size: 11, bold: true, fill: PALETTE.gray4 });
    drawText(g, '[1·2·3 / 클릭] 교체', 932, 296, { size: 9, align: 'right', fill: PALETTE.gray2 });
    const entry = e;
    for (let i = 0; i < EQUIP_SLOTS.length; i++) {
      const slot = EQUIP_SLOTS[i];
      const r = this.equipSlotRect(i);
      const uid = entry.equip?.[slot] ?? null;
      const item = EQ.itemOf(st, uid);
      const hov = inRect(game.input.mouse.x, game.input.mouse.y, r);
      drawPanel(g, r.x, r.y, r.w, r.h, { border: hov ? PALETTE.gold : PALETTE.navy3 });
      // 아이콘 칸 (등급색 테두리)
      const gcol = item ? PALETTE[GRADES[item.grade].color] : PALETTE.navy3;
      g.strokeStyle = gcol;
      g.lineWidth = 2;
      g.strokeRect(r.x + 6.5, r.y + 6.5, 33, 33);
      const icon = item ? equipIcon(item.kind) : null;
      if (icon) {
        g.imageSmoothingEnabled = true;
        g.drawImage(icon, r.x + 8, r.y + 8, 30, 30);
        g.imageSmoothingEnabled = false;
      }
      drawText(g, SLOT_LABELS[slot], r.x + 48, r.y + 16, { size: 9, fill: PALETTE.gray2 });
      if (item) {
        drawText(g, EQ.displayName(item), r.x + 48, r.y + 32, { size: 11, bold: true, fill: gcol });
        drawText(g, this.itemSummary(item), r.x + 48, r.y + 43, { size: 9, fill: PALETTE.gray3 });
      } else {
        drawText(g, '— 비어 있음 —', r.x + 48, r.y + 34, { size: 11, fill: PALETTE.gray1 });
      }
    }

    // ----- 버튼 -----
    for (const b of this.buttons(game)) {
      const hover = !b.dim && inRect(game.input.mouse.x, game.input.mouse.y, b);
      if (hover) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.15;
        g.fillStyle = PALETTE.gold;
        g.fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
      }
      drawPanel(g, b.x, b.y, b.w, b.h, { border: b.dim ? PALETTE.gray1 : hover ? PALETTE.gold : PALETTE.goldDark });
      const fg = b.dim ? PALETTE.gray2 : PALETTE.white;
      drawText(g, `${b.label}  ${b.key}`, b.x + b.w / 2, b.y + 20, { size: 13, bold: true, align: 'center', fill: fg });
      drawText(g, b.sub, b.x + b.w / 2, b.y + 37, { size: 10, align: 'center', fill: b.dim ? PALETTE.gray2 : PALETTE.gray3 });
    }

    drawText(g, '↑↓ 선택 · Z 레벨업 (Shift+Z ×5) · C 한돌 · V 각성 · 1·2·3 장비 · X 나가기',
      W / 2, H - 8, { size: 10, align: 'center', fill: PALETTE.gray2 });

    if (this.modal) this.drawModal(g, game);   // 모달은 항상 최상단
  }
}
