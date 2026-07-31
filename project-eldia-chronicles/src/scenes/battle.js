// ============================================================
// battle.js — JRPG 사이드뷰 전투 화면 (M3: 스킬·상태이상·오토·배속·별점)
// 로직은 battle/logic.js, 적 AI·오토는 battle/ai.js가 전담. 여기는 입력·연출·재생만.
// 흐름: 캐릭터 선택 → 공격/스킬/대기 → (스킬 카드) → 대상 선택 → 발동
// ============================================================

import { Scene } from './scene.js';
import { BALANCE } from '../balance.js';
import { inRect } from '../core/input.js';
import { RNG } from '../core/rng.js';
import { PALETTE, ELEMENT_COLORS, drawText, drawTextOutlined, drawPanel, makeUnitSprites, prerenderScaled } from '../core/sprites.js';
import * as L from '../battle/logic.js';
import * as AI from '../battle/ai.js';
import { SKILLS, PASSIVES } from '../data/skills.js';
import { STATUSES } from '../data/statuses.js';
import { STAGES, TEST_STAGE_ID } from '../data/stages.js';
import { ELEMENT_LABELS } from '../data/strings.js';

// 진형 앵커 (발끝 기준). 아군 4 + 적 6 (기획서 §6: 아군 4 vs 적 1~6)
const ALLY_ANCHORS = [
  { x: 340, y: 300 }, { x: 250, y: 348 }, { x: 180, y: 396 }, { x: 120, y: 440 },
];
const ENEMY_ANCHORS = [
  { x: 635, y: 300 }, { x: 725, y: 348 }, { x: 815, y: 396 },
  { x: 700, y: 268 }, { x: 790, y: 316 }, { x: 875, y: 364 },
];

const SPRITE_SCALE = 3;
const LUNGE_STOP = 96;

const spriteCache = {};
function getSprites(cfg) {
  const key = JSON.stringify(cfg);
  if (!spriteCache[key]) {
    const resolved = {};
    for (const [k, v] of Object.entries(cfg)) resolved[k] = PALETTE[v] ?? v;
    spriteCache[key] = makeUnitSprites(resolved);
  }
  return spriteCache[key];
}

// 새벽 평원 사이드뷰 배경 — 공용 팔레트 32색만 사용
let battleBg = null;
function getBattleBg() {
  if (battleBg) return battleBg;
  battleBg = prerenderScaled(240, 112, 4, (g) => {
    const rng = new RNG('battle-bg');
    const HORIZON = 46;
    const sky = [PALETTE.black, PALETTE.ink, PALETTE.navy1, PALETTE.navy2, PALETTE.purpleDark, PALETTE.magenta, PALETTE.orange, PALETTE.peach];
    const bandH = HORIZON / sky.length;
    for (let i = 0; i < sky.length; i++) {
      g.fillStyle = sky[i];
      g.fillRect(0, Math.floor(i * bandH), 240, Math.ceil(bandH) + 1);
    }
    for (let i = 1; i < sky.length; i++) {
      const y = Math.floor(i * bandH);
      g.fillStyle = sky[i - 1];
      for (let x = 0; x < 240; x += 2) if (rng.chance(0.5)) g.fillRect(x + rng.int(0, 1), y, 1, 1);
    }
    for (let i = 0; i < 26; i++) {
      g.fillStyle = rng.chance(0.3) ? PALETTE.white : PALETTE.gray2;
      g.fillRect(rng.int(0, 239), rng.int(0, 20), 1, 1);
    }
    g.fillStyle = PALETTE.gray4;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      if (dx * dx + dy * dy <= 16 && (dx - 2) * (dx - 2) + (dy + 1) * (dy + 1) > 16) g.fillRect(24 + dx, 12 + dy, 1, 1);
    }
    g.fillStyle = PALETTE.navy2;
    let x = 0;
    while (x < 240) {
      const w = rng.int(10, 24), h = rng.int(4, 12);
      for (let i = 0; i < w && x + i < 240; i++) {
        const y = HORIZON - 4 - Math.floor(h * Math.sin((i / w) * Math.PI));
        g.fillRect(x + i, y, 1, HORIZON - y);
      }
      x += w;
    }
    g.fillStyle = PALETTE.navy1;
    g.fillRect(196, HORIZON - 14, 20, 14);
    g.fillRect(202, HORIZON - 20, 8, 20);
    for (let i = 0; i < 5; i++) g.fillRect(196 + i * 4, HORIZON - 16, 2, 2);
    const ground = [PALETTE.navy1, PALETTE.ink, PALETTE.black];
    g.fillStyle = PALETTE.forest;
    g.fillRect(0, HORIZON, 240, 6);
    for (let i = 0; i < ground.length; i++) {
      g.fillStyle = ground[i];
      g.fillRect(0, HORIZON + 6 + i * 20, 240, 20);
    }
    g.fillStyle = PALETTE.black;
    g.fillRect(0, HORIZON + 66, 240, 112 - HORIZON - 66);
    g.fillStyle = PALETTE.greenDark;
    for (let i = 0; i < 46; i++) g.fillRect(rng.int(0, 239), HORIZON + rng.int(1, 5), 1, 1);
    g.fillStyle = PALETTE.gray1;
    for (let i = 0; i < 70; i++) g.fillRect(rng.int(0, 239), rng.int(HORIZON + 8, 111), 1, 1);
  });
  return battleBg;
}

const anchorOf = (u) => (u.side === 'ally' ? ALLY_ANCHORS : ENEMY_ANCHORS)[u.slot];

const VICTORY_LABELS = {
  annihilation: '적 전멸',
  boss: '보스 처치',
  survive: (n) => `${n}턴 버티기`,
};

export class BattleScene extends Scene {
  constructor() {
    super();
    this.isGameplay = true;
  }

  enter(game, params = {}) {
    this.params = params;
    this.stage = STAGES[params.stageId ?? TEST_STAGE_ID];
    this.battle = L.createBattleFromStage(this.stage.id, {
      seed: params.seed ?? `battle-${Date.now()}`,
      partyIds: params.partyIds,
      heroClass: game.state?.heroClass ?? 'sword',
      heroName: game.state?.heroName,
      difficulty: params.difficulty ?? game.state?.difficulty ?? 'normal',
    });

    this.displays = new Map();
    for (const u of this.battle.units) {
      this.displays.set(u.id, {
        hp: u.hp, ox: 0, oy: 0, flash: 0, fade: -1, visible: true,
        knock: { dir: 1, t: 0 },
      });
    }

    this.phase = 'select';   // select | action | skillSelect | target | anim | result
    this.selected = null;
    this.hoverUnit = null;
    this.hoverTarget = null;
    this.pendingSkill = null;
    this.preview = null;
    this.playback = null;
    this.playCtx = { melee: false };
    this.pendingEnemy = undefined;
    this.effects = [];
    this.particles = [];
    this.shake = 0;
    this.banner = { text: '아군 턴 1', t: 1.4 };
    this.statusLine = { turn: 1, side: '아군' };
    this.result = null;
    this.auto = false;
    this.speed = game.settings.battleSpeed ?? 1;
    this.t = 0;
  }

  // ----- 헬퍼 -----

  aliveAllies() { return L.livingUnits(this.battle, 'ally'); }
  readyAllies() { return this.aliveAllies().filter((u) => !u.acted && L.canAct(u)); }

  unitRect(u) {
    const a = anchorOf(u);
    return { x: a.x - 44, y: a.y - 90, w: 88, h: 96 };
  }

  unitAtPoint(x, y) {
    for (const u of this.battle.units) {
      if (u.alive && inRect(x, y, this.unitRect(u))) return u;
    }
    return null;
  }

  actionRects() {
    return [
      { id: 'attack', label: '공격 [A]', x: 250, y: 466, w: 130, h: 44 },
      { id: 'skill', label: '스킬 [S]', x: 395, y: 466, w: 130, h: 44 },
      { id: 'wait', label: '대기 [Space]', x: 540, y: 466, w: 130, h: 44 },
    ];
  }

  skillCardRects() {
    const u = this.selected;
    const ids = [...u.skills.actives];
    if (u.skills.sacred) ids.push(u.skills.sacred);
    const w = 200, gap = 14;
    const total = ids.length * w + (ids.length - 1) * gap;
    const x0 = 480 - total / 2;
    return ids.map((id, i) => ({ id, x: x0 + i * (w + gap), y: 452, w, h: 78 }));
  }

  toggleRects() {
    return [
      { id: 'auto', label: this.auto ? '오토 ON [Q]' : '오토 [Q]', x: 690, y: 466, w: 120, h: 44 },
      { id: 'speed', label: `배속 ×${this.speed} [D]`, x: 822, y: 466, w: 120, h: 44 },
    ];
  }
  endTurnRect() { return { x: 822, y: 418, w: 120, h: 36 }; }
  resultRects() {
    return [
      { id: 'retry', label: '다시 도전 [R]', x: 320, y: 356, w: 150, h: 42 },
      { id: 'base', label: '거점으로', x: 490, y: 356, w: 150, h: 42 },
    ];
  }

  needPrimary(skill) { return ['enemy', 'enemies2', 'ally'].includes(skill.target); }

  // ----- 흐름 -----

  selectUnit(game, unit) {
    if (!unit || unit.side !== 'ally' || unit.acted || !unit.alive) { game.audio.playSE('error'); return; }
    if (!L.canAct(unit)) { game.audio.playSE('error'); game.showToast(`${unit.name}은(는) 기절 상태입니다.`); return; }
    this.selected = unit;
    this.phase = 'action';
    game.audio.playSE('confirm');
  }

  enterTargeting(game, skillId) {
    const skill = L.getSkill(this.selected, skillId);
    if (!L.canUseSkill(this.battle, this.selected, skillId)) {
      game.audio.playSE('error');
      if (L.isBound(this.selected) && skill.kind !== 'basic') game.showToast('속박 상태 — 일반공격만 가능합니다.');
      return;
    }
    this.pendingSkill = skillId;
    if (this.needPrimary(skill)) {
      this.hoverTarget = L.validTargets(this.battle, this.selected, skill)[0] ?? null;
    } else {
      this.hoverTarget = null;
    }
    this.phase = 'target';
    game.audio.playSE('confirm');
  }

  executePending(game) {
    const skill = SKILLS[this.pendingSkill];
    const primaryId = this.needPrimary(skill) ? this.hoverTarget?.id : null;
    if (this.needPrimary(skill) && !primaryId) { game.audio.playSE('error'); return; }
    let events;
    try {
      events = L.executeSkill(this.battle, this.selected.id, this.pendingSkill, primaryId);
    } catch {
      game.audio.playSE('error');
      return;
    }
    this.hoverTarget = null;
    this.pendingSkill = null;
    this.play(events, () => this.finishUnit(game));
  }

  finishUnit(game) {
    if (this.selected && this.selected.alive) this.selected.acted = true;
    this.selected = null;
    this.pendingSkill = null;
    if (this.battle.winner) { this.finish(game); return; }
    if (this.readyAllies().length === 0) this.startEnemyPhase(game);
    else this.phase = 'select';
  }

  cancelStep(game) {
    if (this.phase === 'target') {
      game.audio.playSE('cancel');
      const wasBasic = SKILLS[this.pendingSkill]?.kind === 'basic';
      this.hoverTarget = null;
      this.pendingSkill = null;
      this.phase = wasBasic ? 'action' : 'skillSelect';
    } else if (this.phase === 'skillSelect') {
      game.audio.playSE('cancel');
      this.phase = 'action';
    } else if (this.phase === 'action') {
      game.audio.playSE('cancel');
      this.selected = null;
      this.phase = 'select';
    }
  }

  startEnemyPhase(game) {
    const tickEvents = L.endPlayerPhase(this.battle);
    this.banner = { text: '적 턴', t: 1.1 };
    this.statusLine = { turn: this.battle.turn, side: '적' };
    if (tickEvents.length) {
      this.play(tickEvents, () => {
        if (this.battle.winner) { this.finish(game); return; }
        this.phase = 'anim';
        this.pendingEnemy = 0.6;
      });
    } else {
      this.phase = 'anim';
      this.pendingEnemy = 0.9;
    }
  }

  runEnemyPhase(game) {
    const events = AI.enemyPhase(this.battle);
    this.play(events, () => {
      if (this.battle.winner) { this.finish(game); return; }
      this.banner = { text: `아군 턴 ${this.battle.turn}`, t: 1.2 };
      this.statusLine = { turn: this.battle.turn, side: '아군' };
      this.phase = 'select';
    });
  }

  endPlayerTurnEarly(game) {
    for (const u of this.aliveAllies()) u.acted = true;
    this.selected = null;
    this.pendingSkill = null;
    game.audio.playSE('move');
    this.startEnemyPhase(game);
  }

  finish(game) {
    this.result = this.battle.winner;
    this.stars = L.computeStars(this.battle);
    this.phase = 'result';
    game.audio.playSE(this.result === 'ally' ? 'victory' : 'defeat');
  }

  resultAction(game, id) {
    game.audio.playSE('confirm');
    if (id === 'retry') game.changeScene('battle', { ...this.params, seed: undefined });
    else game.changeScene('placeholder');
  }

  // ----- 오토 -----

  // 오토 ON 시 진행 중이던 수동 선택을 정리해 select에서 즉시 구동되게 한다
  toggleAuto(game) {
    this.auto = !this.auto;
    if (this.auto && ['action', 'skillSelect', 'target'].includes(this.phase)) {
      this.hoverTarget = null;
      this.pendingSkill = null;
      this.selected = null;
      this.phase = 'select';
    }
    game.audio.playSE(this.auto ? 'confirm' : 'cancel');
  }

  stepAuto(game) {
    const next = this.readyAllies()[0];
    if (!next) {
      // 남은 아군이 전부 기절이면 자동 턴 종료
      if (this.aliveAllies().some((u) => !u.acted)) this.endPlayerTurnEarly(game);
      return;
    }
    const action = AI.autoAction(this.battle, next);
    if (action.type !== 'skill') { next.acted = true; return; }
    this.selected = next;
    let events;
    try {
      events = L.executeSkill(this.battle, next.id, action.skillId, action.targetId);
    } catch {
      next.acted = true;
      this.selected = null;
      return;
    }
    this.play(events, () => this.finishUnit(game));
  }

  // ----- 이벤트 재생 -----

  play(events, after) {
    this.playback = { events, idx: 0, timer: 0, applied: false, after };
    this.playCtx = { melee: false, casterId: null };
    this.phase = 'anim';
  }

  eventDuration(ev) {
    switch (ev.type) {
      case 'skill': return 0.4;
      case 'hit': return this.playCtx.melee ? 0.52 : 0.4;
      case 'assist': return 0.46;
      case 'counter': return 0.5;
      case 'heal': case 'shieldGain': case 'regen': return 0.42;
      case 'status': return ev.applied === false ? 0.35 : 0.3;
      case 'hpCost': case 'cdr': case 'cleanse': case 'dot': return 0.32;
      case 'miracle': return 0.55;
      case 'stunned': return 0.4;
      case 'death': return 0.4;
      case 'statusExpire': return 0.02;
      default: return 0.1;
    }
  }

  applyImpact(game, ev) {
    const unitId = ev.target ?? ev.unit ?? ev.caster;
    const U = unitId ? L.getUnit(this.battle, unitId) : null;
    const d = U ? this.displays.get(U.id) : null;
    const a = U ? anchorOf(U) : { x: 480, y: 300 };
    switch (ev.type) {
      case 'skill': {
        const caster = L.getUnit(this.battle, ev.caster);
        this.playCtx = { melee: !!ev.melee, casterId: ev.caster };
        const ca = anchorOf(caster);
        this.pushLabel(ev.caster, ev.name, ev.kind === 'sacred' ? PALETTE.gold : PALETTE.white);
        if (ev.kind !== 'basic') this.spawnFx('ring', ev.fx?.color ?? 'gold', ca.x, ca.y - 44);
        game.audio.playSE(ev.kind === 'basic' ? 'move' : 'confirm');
        break;
      }
      case 'hit': case 'assist': case 'counter': {
        d.hp = ev.hpAfter;
        d.flash = 0.18;
        const attacker = L.getUnit(this.battle, ev.attacker);
        d.knock = { dir: Math.sign(a.x - anchorOf(attacker).x) || 1, t: 0.18 };
        this.effects.push({
          kind: 'popup', x: a.x, y: a.y - 100, t: 0,
          text: String(ev.dmg), crit: !!ev.crit,
          color: ev.crit ? PALETTE.gold : PALETTE.white,
        });
        if (ev.absorbed) this.effects.push({ kind: 'popup', x: a.x, y: a.y - 122, t: 0, text: `막음 ${ev.absorbed}`, color: PALETTE.teal });
        if (ev.type === 'assist') this.pushLabel(ev.attacker, '협공!', PALETTE.cyan);
        if (ev.type === 'counter') this.pushLabel(ev.attacker, '반격!', PALETTE.orange);
        if (ev.crit) {
          this.shake = 0.28;
          this.effects.push({ kind: 'popup', x: a.x, y: a.y - 144, t: 0, text: '치명타!', crit: true, color: PALETTE.gold });
        }
        if (ev.fx) this.spawnFx(ev.fx.kind, ev.fx.color, a.x, a.y - 48);
        game.audio.playSE(ev.type === 'assist' ? 'assist' : ev.crit ? 'crit' : 'hit');
        break;
      }
      case 'heal': case 'regen':
        d.hp = ev.hpAfter;
        this.effects.push({ kind: 'popup', x: a.x, y: a.y - 100, t: 0, text: `+${ev.amount}`, color: PALETTE.green });
        this.spawnFx('sparkle', 'green', a.x, a.y - 48);
        game.audio.playSE('heal');
        break;
      case 'shieldGain':
        this.effects.push({ kind: 'popup', x: a.x, y: a.y - 100, t: 0, text: `보호막 ${ev.amount}`, color: PALETTE.teal });
        this.spawnFx('shieldFx', 'teal', a.x, a.y - 48);
        game.audio.playSE('buff');
        break;
      case 'status': {
        const meta = STATUSES[ev.statusId];
        if (ev.applied === false) {
          this.pushLabel(unitId, '면역!', PALETTE.gray3);
        } else {
          this.pushLabel(unitId, meta.name, PALETTE[meta.color] ?? PALETTE.white);
          game.audio.playSE(meta.kind === 'buff' ? 'buff' : 'debuff');
        }
        break;
      }
      case 'hpCost':
        d.hp = ev.hpAfter;
        this.effects.push({ kind: 'popup', x: a.x, y: a.y - 100, t: 0, text: `-${ev.amount}`, color: PALETTE.magenta });
        break;
      case 'cleanse':
        this.pushLabel(unitId, '정화', PALETTE.cyan);
        this.spawnFx('sparkle', 'cyan', a.x, a.y - 48);
        game.audio.playSE('heal');
        break;
      case 'cdr':
        this.pushLabel(unitId, '쿨타임 감소', PALETTE.cyan);
        break;
      case 'dot':
        d.hp = ev.hpAfter;
        d.flash = 0.12;
        this.effects.push({ kind: 'popup', x: a.x, y: a.y - 100, t: 0, text: String(ev.dmg), color: PALETTE.orange });
        break;
      case 'miracle':
        this.pushLabel(unitId, '기적!', PALETTE.gold);
        this.spawnFx('sparkle', 'gold', a.x, a.y - 60);
        this.shake = 0.2;
        game.audio.playSE('victory');
        break;
      case 'stunned':
        this.pushLabel(unitId, '기절…', PALETTE.yellow);
        break;
      case 'death':
        d.fade = 0.4;
        game.audio.playSE('death');
        break;
      default: break;
    }
  }

  pushLabel(unitId, text, color) {
    const u = L.getUnit(this.battle, unitId);
    const a = anchorOf(u);
    this.effects.push({ kind: 'label', x: a.x, y: a.y - 112, t: 0, text, color });
  }

  updatePlayback(dt, game) {
    const pb = this.playback;
    if (!pb) return;
    const ev = pb.events[pb.idx];
    if (!ev) { this.endPlayback(game); return; }
    const dur = this.eventDuration(ev);
    pb.timer += dt;
    const p = Math.min(1, pb.timer / dur);

    const lunges = (ev.type === 'hit' && this.playCtx.melee)
      || ((ev.type === 'assist' || ev.type === 'counter') && SKILLS[L.getUnit(this.battle, ev.attacker).skills.basic].melee);
    if (lunges) {
      const A = L.getUnit(this.battle, ev.attacker);
      const T = L.getUnit(this.battle, ev.target);
      const aD = this.displays.get(ev.attacker);
      const from = anchorOf(A);
      const to = anchorOf(T);
      const dir = Math.sign(to.x - from.x) || 1;
      const dx = (to.x - dir * LUNGE_STOP) - from.x;
      const dy = to.y - from.y;
      let f;
      if (p < 0.35) f = p / 0.35;
      else if (p < 0.7) f = 1;
      else f = (1 - p) / 0.3;
      aD.ox = dx * f;
      aD.oy = dy * f;
      if (p >= 1) { aD.ox = 0; aD.oy = 0; }
    }
    const impactAt = lunges ? 0.42 : 0.3;
    if (!pb.applied && p >= impactAt) { pb.applied = true; this.applyImpact(game, ev); }

    if (p >= 1) {
      if (!pb.applied) this.applyImpact(game, ev);
      pb.idx++;
      pb.timer = 0;
      pb.applied = false;
    }
  }

  endPlayback(game) {
    const after = this.playback.after;
    this.playback = null;
    for (const u of this.battle.units) {
      const d = this.displays.get(u.id);
      d.hp = u.hp;
      d.ox = 0; d.oy = 0;
      if (!u.alive && d.fade < 0) d.visible = false;
    }
    after();
  }

  // ----- 파티클 (스킬 코드 이펙트 — 기획서 §16) -----

  spawnFx(kind, colorKey, x, y) {
    const color = PALETTE[colorKey] ?? PALETTE.white;
    const add = (p) => this.particles.push({ life: 0, ...p });
    switch (kind) {
      case 'slash':
        for (let i = 0; i < 3; i++) {
          add({ shape: 'line', x: x - 20 + i * 8, y: y - 24 + i * 10, vx: 150, vy: 90, dur: 0.22, color, len: 26 });
        }
        break;
      case 'burst':
        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2;
          add({ shape: 'rect', x, y, vx: Math.cos(ang) * 130, vy: Math.sin(ang) * 130, dur: 0.35, color, size: 5 });
        }
        break;
      case 'ring':
        add({ shape: 'ring', x, y, r0: 8, r1: 52, dur: 0.35, color });
        break;
      case 'rain':
        for (let i = 0; i < 8; i++) {
          add({ shape: 'rect', x: x - 36 + i * 10, y: y - 90 - (i % 3) * 16, vx: 0, vy: 340, dur: 0.35, color, size: 4 });
        }
        break;
      case 'sparkle':
        for (let i = 0; i < 8; i++) {
          add({ shape: 'rect', x: x - 24 + (i % 4) * 16, y: y + 10 - Math.floor(i / 4) * 22, vx: 0, vy: -55, dur: 0.5, color, size: 4 });
        }
        break;
      case 'shieldFx':
        add({ shape: 'ring', x, y, r0: 40, r1: 22, dur: 0.4, color });
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2;
          add({ shape: 'rect', x: x + Math.cos(ang) * 30, y: y + Math.sin(ang) * 30, vx: 0, vy: 0, dur: 0.4, color, size: 5 });
        }
        break;
      case 'smoke':
        for (let i = 0; i < 6; i++) {
          add({ shape: 'rect', x: x - 20 + i * 8, y: y + 8, vx: (i % 2 ? 20 : -20), vy: -45, dur: 0.5, color, size: 7 });
        }
        break;
      default: break;
    }
  }

  // ----- 입력 -----

  cycle(list, current, dir) {
    if (!list.length) return null;
    const i = list.indexOf(current);
    if (i < 0) return list[0];
    return list[(i + dir + list.length) % list.length];
  }

  onKeyDown(code, game) {
    if (this.phase === 'result') {
      if (code === 'KeyR') this.resultAction(game, 'retry');
      else if (code === 'Enter' || code === 'Space') this.resultAction(game, 'base');
      return;
    }
    // 오토·배속은 어느 단계에서든 토글 가능
    if (code === 'KeyQ') { this.toggleAuto(game); return; }
    if (code === 'KeyD') { this.speed = this.speed === 1 ? 2 : 1; game.audio.playSE('move'); return; }
    if (this.phase === 'anim') return;

    const prev = code === 'ArrowLeft' || code === 'ArrowUp';
    const next = code === 'ArrowRight' || code === 'ArrowDown';

    switch (this.phase) {
      case 'select': {
        const ready = this.readyAllies();
        if (prev || next) {
          this.hoverUnit = this.cycle(ready, this.hoverUnit, next ? 1 : -1);
          game.audio.playSE('move');
        } else if (code === 'Enter' || code === 'Space') {
          const valid = this.hoverUnit && this.hoverUnit.side === 'ally'
            && this.hoverUnit.alive && !this.hoverUnit.acted && L.canAct(this.hoverUnit);
          this.selectUnit(game, valid ? this.hoverUnit : ready[0]);
        } else if (code === 'KeyT') {
          this.endPlayerTurnEarly(game);
        }
        break;
      }
      case 'action':
        if (code === 'KeyA') this.enterTargeting(game, this.selected.skills.basic);
        else if (code === 'KeyS') { this.phase = 'skillSelect'; game.audio.playSE('confirm'); }
        else if (code === 'Space') { game.audio.playSE('move'); this.finishUnit(game); }
        else if (code === 'Escape') this.cancelStep(game);
        break;
      case 'skillSelect': {
        const cards = this.skillCardRects();
        const n = code.startsWith('Digit') ? Number(code.slice(5)) - 1 : -1;
        if (n >= 0 && n < cards.length) this.enterTargeting(game, cards[n].id);
        else if (code === 'Escape') this.cancelStep(game);
        break;
      }
      case 'target': {
        const skill = SKILLS[this.pendingSkill];
        if (this.needPrimary(skill)) {
          const targets = L.validTargets(this.battle, this.selected, skill);
          if (prev || next) {
            this.hoverTarget = this.cycle(targets, this.hoverTarget, next ? 1 : -1);
            game.audio.playSE('move');
          } else if (code === 'Tab') {
            this.hoverTarget = this.cycle(targets, this.hoverTarget, 1);
          }
        }
        if (code === 'Enter' || code === 'KeyA') this.executePending(game);
        else if (code === 'Escape') this.cancelStep(game);
        break;
      }
      default: break;
    }
  }

  onMouseMove(x, y, game) {
    let hover = false;
    const u = this.unitAtPoint(x, y);
    if (u) this.hoverUnit = u;
    if (this.phase === 'select') {
      if (u && u.side === 'ally' && !u.acted && L.canAct(u)) hover = true;
      if (inRect(x, y, this.endTurnRect())) hover = true;
    } else if (this.phase === 'action') {
      for (const r of this.actionRects()) if (inRect(x, y, r)) hover = true;
    } else if (this.phase === 'skillSelect') {
      for (const r of this.skillCardRects()) if (inRect(x, y, r)) hover = true;
    } else if (this.phase === 'target') {
      const skill = SKILLS[this.pendingSkill];
      if (this.needPrimary(skill) && u && L.validTargets(this.battle, this.selected, skill).includes(u)) {
        this.hoverTarget = u;
        hover = true;
      }
    } else if (this.phase === 'result') {
      for (const r of this.resultRects()) if (inRect(x, y, r)) hover = true;
    }
    if (this.phase !== 'anim' && this.phase !== 'result' && this.phase !== 'skillSelect') {
      for (const r of this.toggleRects()) if (inRect(x, y, r)) hover = true;
    }
    game.setCursor(hover ? 'pointer' : 'default');
  }

  onMouseDown(x, y, button, game) {
    if (this.phase === 'result') {
      if (button !== 0) return;
      for (const r of this.resultRects()) if (inRect(x, y, r)) this.resultAction(game, r.id);
      return;
    }
    // 토글 히트 테스트는 토글이 그려지는 단계에서만 (skillSelect의 투명 히트박스 방지)
    if (button === 0 && this.phase !== 'anim' && this.phase !== 'skillSelect') {
      for (const r of this.toggleRects()) {
        if (inRect(x, y, r)) {
          if (r.id === 'auto') this.toggleAuto(game);
          else { this.speed = this.speed === 1 ? 2 : 1; game.audio.playSE('move'); }
          return;
        }
      }
    }
    if (this.phase === 'anim') return;
    if (button === 2) { this.cancelStep(game); return; }
    if (button !== 0) return;

    switch (this.phase) {
      case 'select': {
        if (inRect(x, y, this.endTurnRect())) { this.endPlayerTurnEarly(game); return; }
        const u = this.unitAtPoint(x, y);
        if (u && u.side === 'ally') this.selectUnit(game, u);
        break;
      }
      case 'action':
        for (const r of this.actionRects()) {
          if (inRect(x, y, r)) {
            if (r.id === 'attack') this.enterTargeting(game, this.selected.skills.basic);
            else if (r.id === 'skill') { this.phase = 'skillSelect'; game.audio.playSE('confirm'); }
            else { game.audio.playSE('move'); this.finishUnit(game); }
          }
        }
        break;
      case 'skillSelect':
        for (const r of this.skillCardRects()) if (inRect(x, y, r)) this.enterTargeting(game, r.id);
        break;
      case 'target': {
        const skill = SKILLS[this.pendingSkill];
        if (this.needPrimary(skill)) {
          const u = this.unitAtPoint(x, y);
          if (u && L.validTargets(this.battle, this.selected, skill).includes(u)) {
            this.hoverTarget = u;
            this.executePending(game);
          }
        } else {
          this.executePending(game); // 전체·자신 대상: 아무 곳 클릭 = 발동
        }
        break;
      }
      default: break;
    }
  }

  // ----- 갱신 -----

  update(dt, game) {
    const bdt = dt * this.speed;   // 2배속 (기획서 §6)
    this.t += bdt;
    if (this.banner.t > 0) this.banner.t -= bdt;
    if (this.shake > 0) this.shake -= bdt;

    if (this.pendingEnemy !== undefined) {
      this.pendingEnemy -= bdt;
      if (this.pendingEnemy <= 0) { this.pendingEnemy = undefined; this.runEnemyPhase(game); }
    }

    this.updatePlayback(bdt, game);

    // 오토: 아군 턴에서 자동 진행
    if (this.auto && this.phase === 'select' && !this.playback && !this.battle.winner) {
      this.stepAuto(game);
    }
    // 남은 아군이 전부 기절이면 수동에서도 자동으로 턴 종료 (소프트락 방지)
    if (!this.auto && this.phase === 'select' && !this.playback && !this.battle.winner
      && this.readyAllies().length === 0 && this.aliveAllies().some((u) => !u.acted)) {
      this.endPlayerTurnEarly(game);
    }

    for (const [, d] of this.displays) {
      if (d.flash > 0) d.flash -= bdt;
      if (d.knock.t > 0) d.knock.t -= bdt;
      if (d.fade > 0) { d.fade -= bdt; if (d.fade <= 0) { d.fade = -1; d.visible = false; } }
    }
    for (const e of this.effects) e.t += bdt;
    this.effects = this.effects.filter((e) => e.t < (e.kind === 'popup' ? 0.9 : 0.7));
    for (const p of this.particles) {
      p.life += bdt;
      p.x += (p.vx ?? 0) * bdt;
      p.y += (p.vy ?? 0) * bdt;
    }
    this.particles = this.particles.filter((p) => p.life < p.dur);

    this.preview = (this.phase === 'target' && this.selected && this.pendingSkill)
      ? L.previewSkill(this.battle, this.selected, this.pendingSkill,
        this.needPrimary(SKILLS[this.pendingSkill]) ? this.hoverTarget?.id : null)
      : null;
  }

  // ----- 렌더 -----

  render(g, game) {
    g.save();
    if (this.shake > 0) {
      g.translate(Math.sin(this.t * 90) * this.shake * 14, Math.cos(this.t * 77) * this.shake * 10);
    }

    g.fillStyle = PALETTE.black;
    g.fillRect(-20, -20, 1000, 580);
    g.drawImage(getBattleBg(), 0, 0);

    // 대상 하이라이트 (전체 대상 스킬)
    if (this.phase === 'target' && this.pendingSkill) {
      const skill = SKILLS[this.pendingSkill];
      if (!this.needPrimary(skill)) {
        const targets = skill.target === 'self' ? [this.selected]
          : skill.target === 'alliesAll' ? this.aliveAllies()
            : L.livingUnits(this.battle, 'enemy');
        for (const t of targets) {
          const a = anchorOf(t);
          g.strokeStyle = skill.dmg ? PALETTE.red : PALETTE.gold;
          g.lineWidth = 2;
          g.strokeRect(a.x - 40, a.y - 92, 80, 100);
        }
      }
    }

    const order = [...this.battle.units].sort((a, b) => anchorOf(a).y - anchorOf(b).y);
    for (const u of order) this.renderUnit(g, u, game);

    // 파티클
    for (const p of this.particles) {
      const q = 1 - p.life / p.dur;
      g.globalAlpha = q;
      g.fillStyle = p.color;
      if (p.shape === 'rect') {
        g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else if (p.shape === 'line') {
        g.fillRect(p.x, p.y, p.len * (1 - q) + 6, 3);
      } else if (p.shape === 'ring') {
        const r = p.r0 + (p.r1 - p.r0) * (p.life / p.dur);
        g.strokeStyle = p.color;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(p.x, p.y, Math.max(1, r), 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.globalAlpha = 1;

    for (const e of this.effects) this.renderEffect(g, e);
    g.restore();

    this.renderTopBar(g);
    this.renderBottomBar(g, game);
    if (this.phase === 'target' && this.preview) this.renderPreview(g);
    if (this.banner.t > 0) this.renderBanner(g);
    if (this.phase === 'result') this.renderResult(g, game);
  }

  spriteFor(u) {
    const set = getSprites(u.spriteCfg);
    const dir = u.side === 'ally' ? 'right' : 'left';
    const pb = this.playback;
    if (pb) {
      const ev = pb.events[pb.idx];
      const isAttackEv = ev && (ev.type === 'hit' || ev.type === 'assist' || ev.type === 'counter') && ev.attacker === u.id;
      const isCastEv = ev && ev.type === 'skill' && ev.caster === u.id;
      if (isAttackEv) {
        const p = pb.timer / this.eventDuration(ev);
        if (p >= 0.35 && p < 0.7) return set.attack[dir];
        return set.idle[dir][Math.floor(this.t * 10) % 2];
      }
      if (isCastEv) return set.attack[dir];
    }
    const phase = u.slot * 0.45 + (u.side === 'enemy' ? 0.9 : 0);
    return set.idle[dir][Math.floor(this.t * 1.6 + phase) % 2];
  }

  renderUnit(g, u, game) {
    const d = this.displays.get(u.id);
    if (!d.visible) return;
    const a = anchorOf(u);
    let px = a.x + d.ox;
    const py = a.y + d.oy;
    if (d.knock.t > 0) px += d.knock.dir * (d.knock.t / 0.18) * 12;
    const alpha = d.fade > 0 ? d.fade / 0.4
      : getStatusAlpha(u, this.phase, d);
    const size = 32 * SPRITE_SCALE;
    g.globalAlpha = alpha;
    g.imageSmoothingEnabled = false;

    g.fillStyle = 'rgba(13, 11, 20, 0.55)';
    g.beginPath();
    g.ellipse(px, py, d.fade > 0 ? 26 : 34, 9, 0, 0, Math.PI * 2);
    g.fill();

    if (d.fade > 0) {
      const q = 1 - d.fade / 0.4;
      const fall = (u.side === 'ally' ? -1 : 1) * q * 1.4;
      g.save();
      g.translate(px, py);
      g.rotate(fall);
      g.drawImage(getSprites(u.spriteCfg).idle[u.side === 'ally' ? 'right' : 'left'][0], -size / 2, -size + 8, size, size);
      g.restore();
      g.globalAlpha = 1;
      return;
    }

    const spr = this.spriteFor(u);
    g.drawImage(spr, px - size / 2, py - size + 8, size, size);

    if (d.flash > 0) {
      g.globalAlpha = alpha * (d.flash / 0.18) * 0.8;
      g.globalCompositeOperation = 'lighter';
      g.drawImage(spr, px - size / 2, py - size + 8, size, size);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = alpha;
    }

    // 속성 점 + 보스 왕관
    g.fillStyle = ELEMENT_COLORS[u.element];
    g.fillRect(px + size / 2 - 16, py - size + 4, 8, 8);
    if (u.isBoss) drawTextOutlined(g, '★', px, py - size + 2, { size: 14, fill: PALETTE.gold, outline: PALETTE.black });

    // HP 바 + 보호막 바
    const ratio = d.hp / u.stats.maxHp;
    g.fillStyle = PALETTE.black;
    g.fillRect(px - 30, py + 12, 60, 7);
    g.fillStyle = ratio > 0.5 ? PALETTE.green : ratio > 0.25 ? PALETTE.amber : PALETTE.red;
    g.fillRect(px - 29, py + 13, Math.round(58 * ratio), 5);
    if (u.shield > 0) {
      g.fillStyle = PALETTE.teal;
      g.fillRect(px - 29, py + 10, Math.min(58, Math.round(58 * u.shield / u.stats.maxHp)), 2);
    }

    // 상태 아이콘 칩: 아이콘 글자 + 남은 턴 (기획서 §6 '아이콘+남은 턴 표시')
    const shown = u.statuses.slice(0, 4);
    shown.forEach((s, i) => {
      const meta = STATUSES[s.id];
      const ix = px - 32 + i * 22;
      g.fillStyle = PALETTE.black;
      g.fillRect(ix, py + 21, 21, 13);
      drawText(g, meta.icon, ix + 6, py + 32, { size: 9, fill: PALETTE[meta.color] ?? PALETTE.white, align: 'center' });
      drawText(g, String(s.turns), ix + 16, py + 32, { size: 9, fill: PALETTE.gray4, align: 'center' });
    });

    // 선택·대상 마커
    const isSel = this.selected === u;
    const isTarget = this.phase === 'target' && this.hoverTarget === u;
    const isHoverReady = this.phase === 'select' && this.hoverUnit === u && u.side === 'ally' && !u.acted && L.canAct(u);
    if (isSel || isTarget || isHoverReady) {
      const bob = Math.sin(this.t * 6) * 4;
      const color = isTarget ? PALETTE.red : PALETTE.gold;
      const ty = py - size - 8 + bob;
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(px, ty + 12);
      g.lineTo(px - 9, ty);
      g.lineTo(px + 9, ty);
      g.closePath();
      g.fill();
    }
    if (this.battle.focus && this.battle.focus.targetId === u.id && this.phase !== 'anim') {
      drawTextOutlined(g, '연계', px, py - size - 12, { size: 12, bold: true, fill: PALETTE.cyan, outline: PALETTE.black });
    }
    g.globalAlpha = 1;
  }

  renderEffect(g, e) {
    if (e.kind === 'popup') {
      const p = e.t / 0.9;
      g.globalAlpha = 1 - Math.max(0, p - 0.6) / 0.4;
      drawTextOutlined(g, e.text, e.x, e.y - p * 36, {
        size: e.crit ? 24 : 18, bold: e.crit, fill: e.color, outline: PALETTE.black,
      });
      g.globalAlpha = 1;
    } else if (e.kind === 'label') {
      const p = e.t / 0.7;
      g.globalAlpha = 1 - Math.max(0, p - 0.5) / 0.5;
      drawTextOutlined(g, e.text, e.x, e.y - p * 14, { size: 15, bold: true, fill: e.color, outline: PALETTE.black });
      g.globalAlpha = 1;
    }
  }

  renderTopBar(g) {
    const v = this.battle.victory;
    const label = v.type === 'survive' ? VICTORY_LABELS.survive(v.turns) : VICTORY_LABELS[v.type];
    const progress = v.type === 'survive' ? ` (${Math.min(this.battle.turn, v.turns)}/${v.turns})` : '';
    drawTextOutlined(g, `${this.stage.name} — 승리: ${label}${progress} · ★3: ${this.battle.starTurns}턴 이내`,
      480, 24, { size: 12, fill: PALETTE.gray4, outline: PALETTE.black });
  }

  renderBottomBar(g, game) {
    drawPanel(g, 8, 446, 944, 86);

    const info = this.selected ?? this.hoverUnit;
    if (info && info.alive && this.phase !== 'skillSelect') {
      const d = this.displays.get(info.id);
      drawText(g, info.name, 26, 474, { size: 16, bold: true, fill: info.side === 'ally' ? PALETTE.skyBlue : PALETTE.red });
      drawText(g, `Lv${info.level} ${ELEMENT_LABELS[info.element]}`, 26, 498, { size: 12, fill: ELEMENT_COLORS[info.element] });
      const shieldTxt = info.shield > 0 ? ` 막${info.shield}` : '';
      drawText(g, `HP ${Math.round(d.hp)}/${info.stats.maxHp}${shieldTxt}`, 26, 520, { size: 12, fill: PALETTE.gray4 });
      if (info.passive && PASSIVES[info.passive]) {
        drawText(g, `[${PASSIVES[info.passive].name}]`, 130, 498, { size: 11, fill: PALETTE.gray3 });
      }
    }

    if (this.phase === 'action') {
      for (const r of this.actionRects()) {
        const skill = r.id === 'skill';
        const disabled = skill && L.isBound(this.selected);
        const on = !disabled && inRect(game.input.mouse.x, game.input.mouse.y, r);
        g.fillStyle = on ? PALETTE.navy3 : PALETTE.navy2;
        g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = on ? PALETTE.gold : PALETTE.goldDark;
        g.lineWidth = 2;
        g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        drawText(g, r.label, r.x + r.w / 2, r.y + 28, { size: 14, fill: disabled ? PALETTE.gray1 : on ? PALETTE.gold : PALETTE.gray4, align: 'center' });
      }
    } else if (this.phase === 'skillSelect') {
      this.skillCardRects().forEach((r, i) => {
        const skill = SKILLS[r.id];
        const nums = BALANCE.skills[r.id] ?? {};
        const cd = this.selected.cooldowns[r.id] ?? 0;
        const usable = L.canUseSkill(this.battle, this.selected, r.id);
        const on = usable && inRect(game.input.mouse.x, game.input.mouse.y, r);
        g.fillStyle = on ? PALETTE.navy3 : 'rgba(28, 31, 58, 0.96)';
        g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = !usable ? PALETTE.gray1 : skill.kind === 'sacred' ? PALETTE.gold : on ? PALETTE.gold : PALETTE.goldDark;
        g.lineWidth = 2;
        g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        const nameColor = !usable ? PALETTE.gray2 : skill.kind === 'sacred' ? PALETTE.gold : PALETTE.white;
        drawText(g, `${i + 1}. ${skill.name}`, r.x + 12, r.y + 24, { size: 13, bold: true, fill: nameColor });
        const descBits = [];
        if (skill.dmg) descBits.push(`${Math.round((nums.coef ?? 1) * 100)}%${nums.hits ? `×${nums.hits}` : ''}`);
        if (skill.heal) descBits.push(`치유 ${Math.round((nums.coef ?? 1) * 100)}%`);
        if (skill.shield) descBits.push('보호막');
        if (skill.cleanse) descBits.push('정화');
        if (skill.cdr) descBits.push('쿨 감소');
        descBits.push(targetLabel(skill.target));
        drawText(g, descBits.join(' · '), r.x + 12, r.y + 44, { size: 10, fill: PALETTE.gray3 });
        drawText(g, cd > 0 ? `쿨 ${cd}` : `쿨타임 ${nums.cool ?? 0}`, r.x + 12, r.y + 64, { size: 10, fill: cd > 0 ? PALETTE.red : PALETTE.gray2 });
      });
    } else if (this.phase === 'target') {
      const skill = SKILLS[this.pendingSkill];
      const msg = this.needPrimary(skill)
        ? '대상 선택 (←→ 전환 · Enter 발동 · ESC 취소)'
        : '클릭 또는 Enter로 발동 · ESC 취소';
      drawText(g, `${skill.name} — ${msg}`, 480, 500, { size: 13, fill: PALETTE.gray3, align: 'center' });
    } else if (this.phase === 'select') {
      drawText(g, '아군 선택 · [T]턴 종료 · [Q]오토 · [D]배속', 480, 520, { size: 11, fill: PALETTE.gray2, align: 'center' });
    }

    if (this.phase !== 'anim' && this.phase !== 'result' && this.phase !== 'skillSelect') {
      for (const r of this.toggleRects()) {
        const active = (r.id === 'auto' && this.auto) || (r.id === 'speed' && this.speed === 2);
        const on = inRect(game.input.mouse.x, game.input.mouse.y, r);
        g.fillStyle = active ? PALETTE.navy3 : on ? PALETTE.navy3 : PALETTE.navy2;
        g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = active ? PALETTE.gold : on ? PALETTE.gold : PALETTE.navy3;
        g.lineWidth = 2;
        g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        drawText(g, r.label, r.x + r.w / 2, r.y + 28, { size: 12, fill: active || on ? PALETTE.gold : PALETTE.gray4, align: 'center' });
      }
    }
    if (this.phase === 'select') {
      const r = this.endTurnRect();
      const on = inRect(game.input.mouse.x, game.input.mouse.y, r);
      g.fillStyle = on ? PALETTE.navy3 : PALETTE.navy2;
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = on ? PALETTE.gold : PALETTE.navy3;
      g.lineWidth = 2;
      g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      drawText(g, '턴 종료 [T]', r.x + r.w / 2, r.y + 24, { size: 12, fill: on ? PALETTE.gold : PALETTE.gray4, align: 'center' });
    }
    drawText(g, `${this.statusLine.turn}턴 · ${this.statusLine.side} 페이즈`, 940, 440, { size: 12, fill: PALETTE.gray2, align: 'right' });
  }

  renderPreview(g) {
    const pv = this.preview;
    const rows = [];
    for (const t of pv.perTarget.slice(0, 6)) {
      if (t.dmg !== undefined) rows.push([t.unit.name, `${t.dmg}${t.kill ? ' ☠' : ''}`]);
      else if (t.heal !== undefined) rows.push([t.unit.name, `+${t.heal}`]);
      else if (t.shieldGain !== undefined) rows.push([t.unit.name, `막 ${t.shieldGain}`]);
      else rows.push([t.unit.name, '—']);
    }
    if (pv.critChance > 0) rows.push([`치명 ${Math.round(pv.critChance * 100)}%`, `${pv.perTarget[0]?.critDmg ?? ''}`]);
    if (pv.assist) rows.push([`협공 ${pv.assist.unit.name}`, `+${pv.assist.dmg}`]);
    if (pv.counter) rows.push(['반격 주의', `-${pv.counter.dmg}`]);
    if (pv.selfCost) rows.push(['자신 HP 소모', `-${pv.selfCost}`]);
    const elemMark = pv.elemMult > 1 ? ' ▲유리' : pv.elemMult < 1 ? ' ▼불리' : '';
    const h = 58 + rows.length * 22;
    drawPanel(g, 712, 40, 232, h);
    drawText(g, `예상 결과${elemMark}`, 828, 66, { size: 13, bold: true, fill: PALETTE.gold, align: 'center' });
    rows.forEach(([k, v], i) => {
      const warn = k === '반격 주의' || k === '자신 HP 소모';
      drawText(g, k, 724, 88 + i * 22, { size: 11, fill: warn ? PALETTE.orange : PALETTE.gray4 });
      drawText(g, String(v), 932, 88 + i * 22, { size: 11, fill: PALETTE.white, align: 'right' });
    });
  }

  renderBanner(g) {
    const a = Math.min(1, this.banner.t / 0.3);
    g.globalAlpha = a;
    g.fillStyle = 'rgba(13, 11, 20, 0.75)';
    g.fillRect(0, 190, 960, 60);
    drawTextOutlined(g, this.banner.text, 480, 230, { size: 26, bold: true, fill: PALETTE.gold, outline: PALETTE.black });
    g.globalAlpha = 1;
  }

  renderResult(g, game) {
    g.fillStyle = 'rgba(13, 11, 20, 0.7)';
    g.fillRect(0, 0, 960, 540);
    drawPanel(g, 280, 160, 400, 260);
    const win = this.result === 'ally';
    drawTextOutlined(g, win ? '승리!' : '패배...', 480, 226, {
      size: 34, bold: true, fill: win ? PALETTE.gold : PALETTE.purple, outline: PALETTE.black,
    });
    if (win) {
      const stars = '★'.repeat(this.stars) + '☆'.repeat(3 - this.stars);
      drawTextOutlined(g, stars, 480, 270, { size: 30, fill: PALETTE.gold, outline: PALETTE.black });
      const conds = [
        '클리어',
        this.battle.allyDeaths === 0 ? '전투불능 없음' : `전투불능 ${this.battle.allyDeaths}회`,
        `${this.battle.starTurns}턴 이내`,
      ];
      drawText(g, conds.join(' · '), 480, 300, { size: 11, fill: PALETTE.gray3, align: 'center' });
    } else {
      drawText(g, '패배해도 잃는 것은 없습니다. 다시!', 480, 280, { size: 13, fill: PALETTE.gray3, align: 'center' });
    }
    drawText(g, `${this.battle.turn}턴 소요`, 480, 330, { size: 12, fill: PALETTE.gray3, align: 'center' });
    for (const r of this.resultRects()) {
      const on = inRect(game.input.mouse.x, game.input.mouse.y, r);
      g.fillStyle = on ? PALETTE.navy3 : PALETTE.navy2;
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = on ? PALETTE.gold : PALETTE.navy3;
      g.lineWidth = 2;
      g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      drawText(g, r.label, r.x + r.w / 2, r.y + 27, { size: 14, fill: on ? PALETTE.gold : PALETTE.gray4, align: 'center' });
    }
  }
}

function getStatusAlpha(u, phase, d) {
  if (u.side === 'ally' && u.acted && phase !== 'anim') return 0.55;
  return 1;
}

function targetLabel(target) {
  return {
    enemy: '적 단일', enemies2: '적 2체', enemiesAll: '적 전체',
    ally: '아군 단일', alliesAll: '아군 전체', self: '자신',
  }[target] ?? target;
}
