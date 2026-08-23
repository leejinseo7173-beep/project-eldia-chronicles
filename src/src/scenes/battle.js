// ============================================================
// battle.js — JRPG 사이드뷰 전투 화면 (M3: 스킬·상태이상·오토·배속·별점)
// 로직은 battle/logic.js, 적 AI·오토는 battle/ai.js가 전담. 여기는 입력·연출·재생만.
// 흐름: 캐릭터 선택 → 공격/스킬/대기 → (스킬 카드) → 대상 선택 → 발동
// ============================================================

import { Scene } from './scene.js';
import { BALANCE } from '../balance.js';
import { inRect } from '../core/input.js';
import { RNG } from '../core/rng.js';
import { PALETTE, ELEMENT_COLORS, drawText, drawTextOutlined, drawPanel, makeUnitSprites, prerenderScaled, loadAssetSprites, sprScale } from '../core/sprites.js';
import { SPRITE_ASSETS } from '../data/sprite_assets.js';
import {
  PROJECTILES, SHOT_DRAW, SHOT_RECOVER, SHOT_MIN_FLIGHT, SHOT_MAX_FLIGHT,
  MUZZLE_UP, MUZZLE_FWD, TARGET_UP, SLASH, SACRED, HITSTOP, LUNGE, MAGIC,
  PROJ_ART, TWINKLE, CAST_AURA, ARCHER_FX, SQUASH,
} from '../core/fx.js';
import { flameFrames, energyArrowFrames } from '../core/proj_sprites.js';
import * as L from '../battle/logic.js';
import * as AI from '../battle/ai.js';
import { SKILLS, PASSIVES } from '../data/skills.js';
import { STATUSES } from '../data/statuses.js';
import { STAGES, TEST_STAGE_ID } from '../data/stages.js';
import { saveSettings } from '../core/save.js';
import { ELEMENT_LABELS } from '../data/strings.js';
import { CHARACTERS } from '../data/characters.js';
import { CONSUMABLES, describeConsumable } from '../data/items.js';
import * as GR from '../core/growth.js';
import * as EQ from '../core/equip.js';
import * as BD from '../core/bond.js';
import { GRADES } from '../data/equipment.js';

// 진형 앵커 (발끝 기준). 아군 4 + 적 6 (기획서 §6: 아군 4 vs 적 1~6)
//
// ★세로 위치는 미관이 아니라 **가림 제약**이 정한다.
//   유닛 정보(보호막·HP바·상태칩)는 발끝 기준 py+10 ~ py+34에 그려지고,
//   UI 패널은 유닛보다 **나중에** 그려져 무조건 위를 덮는다. 가림판은 넷이다:
//     하단 패널 y446 / 오토·배속·턴종료 y418(x566~942) / 턴 배너 y190~250 / 예상 결과 패널 y40~252
//   게다가 화면 흔들림은 유닛에만 걸리고 UI에는 안 걸려(render의 translate가 restore 앞)
//   최대 ±5.5px(SACRED.shake 0.55 × 10)의 여유를 더 빼야 한다.
//   → 아군 최하단 ≤ 406, 토글 x대역에 걸치는 적 ≤ 378.
//
//   예전 배치(아군 마지막 y440)는 4번째 아군의 HP바가 하단 패널에 100% 묻혔다.
//   아군은 대각선 기울기를 그대로 둔 채 **통째로 48px 올렸고**(순수 평행이동),
//   적은 올릴 수 없어서(위에 배너·예상 패널이 붙어 있다) 세로 간격을 48→36으로 조였다.
const ALLY_ANCHORS = [
  { x: 340, y: 252 }, { x: 250, y: 300 }, { x: 180, y: 348 }, { x: 120, y: 396 },
];
const ENEMY_ANCHORS = [
  { x: 635, y: 300 }, { x: 725, y: 336 }, { x: 815, y: 372 },
  // 적5의 x는 875 → 862. 손그림 에셋(192폭)이 들어오면 875+96=971로 화면 밖이었다.
  { x: 700, y: 268 }, { x: 790, y: 304 }, { x: 862, y: 340 },
];

const SPRITE_BASE = 64;   // 스프라이트 원본 해상도 (core/sprites.js SPRITE_SIZE와 일치)
const SPRITE_SCALE = 2;   // 정수배 확대 → 화면 96px (절대 규칙 7)
const LUNGE_STOP = 96;

// 연출 수치는 전부 core/fx.js에 (작업계획.md 1부 §7 기술 메모)

const spriteCache = {};
// 유닛 스프라이트: 등록된 손그림 에셋이 있으면 그것을, 없으면 코드 생성본을 쓴다.
// 에셋은 비동기 로드라 완료 전에는 코드 생성본이 보인다 (게임 정지 없음).
function getSprites(cfg, assetKey) {
  if (assetKey && SPRITE_ASSETS[assetKey]) {
    const entry = loadAssetSprites(assetKey, SPRITE_ASSETS[assetKey]);
    if (entry.set) return entry.set;
  }
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
      // 육성 반영 (M5-3): 파티 지정 + 게임 상태가 있을 때만 — 프리셋·시뮬은 스테이지 레벨
      growth: this.buildGrowth(game, params.partyIds),
    });

    this.displays = new Map();
    for (const u of this.battle.units) {
      this.displays.set(u.id, {
        hp: u.hp, ox: 0, oy: 0, flash: 0, fade: -1, visible: true, squash: 0,
        knock: { dir: 1, t: 0 },
      });
    }

    this.phase = 'select';   // select | action | skillSelect | target | anim | result
    this.selected = null;
    this.hoverUnit = null;
    this.hoverTarget = null;
    this.pendingSkill = null;
    this.pendingItem = null;       // 소모품 대상 선택 중 (M5-6)
    this.preview = null;
    this.playback = null;
    this.playCtx = { melee: false, casterId: null, shot: null, sacred: false };
    this.pendingEnemy = undefined;
    this.cine = null;       // 성물 연출 상태
    this.freeze = 0;        // 히트스톱 (초)
    this.menu = null;       // ESC 일시정지 메뉴 { page: 'main' | 'settings', sel }
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

  // 육성 맵 + 장비 합산 보너스 (M5-4) — 시뮬·프리셋(partyIds 없음)은 그대로 미적용
  buildGrowth(game, partyIds) {
    if (!partyIds || !game.state) return undefined;
    const growth = GR.buildGrowthMap(game.state, partyIds);
    for (const cid of partyIds) {
      if (!growth[cid]) continue;
      growth[cid].equip = EQ.equipBonus(game.state, cid);
      growth[cid].bond = BD.bondBonus(game.state, cid);   // 교감 보너스 (M5-7)
    }
    return growth;
  }

  aliveAllies() { return L.livingUnits(this.battle, 'ally'); }
  readyAllies() { return this.aliveAllies().filter((u) => !u.acted && L.canAct(u)); }

  unitRect(u) {
    const a = anchorOf(u);
    return { x: a.x - 44, y: a.y - 90, w: 88, h: 96 };
  }

  // 클릭 판정 상자(88×96)는 진형 간격보다 커서 이웃끼리 겹친다.
  // 겹친 자리에서는 **화면상 앞에 있는(발끝 y가 큰) 유닛**을 집는다 —
  // 그리기 순서가 발끝 y 오름차순이라 그게 플레이어 눈에 보이는 유닛이다.
  // 배열 순서대로 첫 번째를 돌려주면 뒤에 가려진 유닛이 잡혀 오조준이 난다.
  unitAtPoint(x, y) {
    let best = null;
    for (const u of this.battle.units) {
      if (!u.alive || !inRect(x, y, this.unitRect(u))) continue;
      if (!best || anchorOf(u).y > anchorOf(best).y) best = u;
    }
    return best;
  }

  // 행동 버튼 4개. 좌측 유닛 정보가 x197까지 차지하므로 206에서 시작한다.
  // 오토·배속 토글은 윗줄(y418)로 올려서 이 줄을 통째로 쓴다 — 같은 줄에 두면 겹친다.
  actionRects() {
    const y = 466, w = 116, gap = 12, x0 = 206;
    const at = (i) => x0 + i * (w + gap);
    return [
      { id: 'attack', label: '공격 [A]', x: at(0), y, w, h: 44 },
      { id: 'skill', label: '스킬 [S]', x: at(1), y, w, h: 44 },
      { id: 'item', label: '아이템 [F]', x: at(2), y, w, h: 44 },
      { id: 'wait', label: '대기 [Space]', x: at(3), y, w, h: 44 },
      // 캐릭터를 잘못 골랐을 때 되돌릴 자리 — 없으면 그 턴을 통째로 날려야 한다
      { id: 'cancel', label: '뒤로 [ESC]', x: at(4), y, w, h: 44 },
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

  // 아랫줄(y466)은 행동 버튼 4개가 다 쓰므로 토글은 턴 종료와 같은 윗줄에 둔다
  toggleRects() {
    return [
      { id: 'auto', label: this.auto ? '오토 ON [Q]' : '오토 [Q]', x: 566, y: 418, w: 120, h: 36 },
      { id: 'speed', label: `배속 ×${this.speed} [D]`, x: 698, y: 418, w: 120, h: 36 },
    ];
  }
  endTurnRect() { return { x: 822, y: 418, w: 120, h: 36 }; }
  resultRects() {
    return [
      { id: 'retry', label: '다시 도전 [R]', x: 320, y: 408, w: 150, h: 42 },
      { id: 'base', label: '거점으로', x: 490, y: 408, w: 150, h: 42 },
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

  // ----- 전투 소모품 (기획서 §10, M5-6) -----

  consumableEntries(game) {
    const inv = game.state?.inventory?.consumables ?? {};
    return Object.keys(CONSUMABLES).filter((id) => (inv[id] ?? 0) > 0);
  }

  enterItemSelect(game) {
    const max = BALANCE.battleItems.maxUsesPerBattle;
    if (this.battle.itemUses >= max) {
      game.audio.playSE('error');
      game.showToast(`아이템은 전투당 ${max}회까지입니다`);
      return;
    }
    if (!this.consumableEntries(game).length) {
      game.audio.playSE('error');
      game.showToast('소모품이 없습니다 — 상점에서 살 수 있습니다');
      return;
    }
    this.phase = 'itemSelect';
    game.audio.playSE('confirm');
  }

  itemCardRects(game) {
    const ids = this.consumableEntries(game);
    const w = 170, gap = 10;
    const total = ids.length * w + (ids.length - 1) * gap;
    const x0 = 480 - total / 2;
    return ids.map((id, i) => ({ id, x: x0 + i * (w + gap), y: 452, w, h: 78 }));
  }

  pickItem(game, itemId) {
    const item = CONSUMABLES[itemId];
    if (item.effect === 'revive') {
      // 부활은 첫 사망 아군 자동 대상 — 시체 타겟팅 UI 회피 (작업계획 결정)
      const dead = this.battle.units.find((u) => u.side === 'ally' && !u.alive);
      if (!dead) {
        game.audio.playSE('error');
        game.showToast('쓰러진 아군이 없습니다');
        return;
      }
      this.useItemOn(game, itemId, dead.id);
      return;
    }
    this.pendingItem = itemId;
    this.hoverTarget = this.aliveAllies()[0] ?? null;
    this.phase = 'itemTarget';
    game.audio.playSE('confirm');
  }

  useItemOn(game, itemId, targetId) {
    const inv = game.state.inventory.consumables;
    inv[itemId] -= 1;
    if (inv[itemId] <= 0) delete inv[itemId];
    const events = L.useBattleItem(this.battle, this.selected.id, itemId, targetId);
    this.pendingItem = null;
    this.hoverTarget = null;
    this.pushLabel(this.selected.id, CONSUMABLES[itemId].name, PALETTE.green);
    this.play(events, () => this.finishUnit(game));
  }

  // 되돌릴 단계가 남아 있는가 (ESC·우클릭이 일시정지로 새지 않게 하는 기준)
  canCancelStep() {
    return this.phase === 'target' || this.phase === 'skillSelect' || this.phase === 'action'
      || this.phase === 'itemSelect' || this.phase === 'itemTarget';
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
    } else if (this.phase === 'itemTarget') {
      game.audio.playSE('cancel');
      this.pendingItem = null;
      this.hoverTarget = null;
      this.phase = 'itemSelect';
    } else if (this.phase === 'itemSelect') {
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
    // 전투 경험치 (M5-3): 승리 + 실제 플레이일 때만. Σ(적 레벨) × 계수, 참전 전원 전액
    this.xpReport = null;
    this.dropReport = null;
    if (this.result === 'ally' && game.state && this.params?.partyIds) {
      const xp = GR.battleXpOf(this.battle.units.filter((u) => u.side === 'enemy').map((u) => u.level));
      const ups = GR.grantBattleXp(game.state, this.params.partyIds, xp);
      this.xpReport = { xp, ups };
      BD.battleBond(game.state, this.params.partyIds);   // 참전 동료 호감 상승 (조용히)
      // 심볼전(필드) 승리 드랍 — 장비 확률 + 강화석 상시 (M5-4, 시드 스트림)
      if (this.params?.from === 'field') {
        this.dropReport = EQ.rollDrop(game.state, this.stage.level);
      }
    }
    // 파티 전투 기록 — 딜 집계(logic dmgDealt) + 레벨 변동. 패배 시에도 보여준다 (배울 거리)
    const upOf = (cid) => this.xpReport?.ups.find((u) => u.cid === cid) ?? null;
    this.statsReport = this.battle.units
      .filter((u) => u.side === 'ally')
      .sort((a, b) => a.slot - b.slot)
      .map((u) => ({
        unit: u,
        name: u.name,
        dmg: this.battle.dmgDealt?.[u.id] ?? 0,
        lv: game.state ? (GR.entryOf(game.state, u.defId)?.lv ?? u.level) : u.level,
        up: upOf(u.defId),
      }));
    game.audio.playSE(this.result === 'ally' ? 'victory' : 'defeat');
  }

  resultAction(game, id) {
    game.audio.playSE('confirm');
    if (id === 'retry') game.changeScene('battle', { ...this.params, seed: undefined });
    else if (this.params?.from === 'party') game.changeScene('party', { stageId: this.stage.id });
    else if (this.params?.from === 'field' && this.result === 'ally') {
      // 필드 복귀는 **맵을 지정하지 않는다** — 지정하면 field.enter가 스폰 지점으로 되돌려
      // 전투 직전 서 있던 자리를 잃는다. 세이브에 남은 좌표를 그대로 쓰게 둔다.
      game.changeScene('field', { defeatedSymbol: this.params.fieldReturn?.symbolKey });
    } else game.changeScene('placeholder');   // 패배는 거점으로 (심볼은 그 자리에 남는다)
  }

  // ----- ESC 일시정지 메뉴 -----
  // 전투 상태를 유지해야 하므로 씬을 바꾸지 않고 오버레이로 띄운다.
  // 설정은 SettingsScene의 항목 정의를 그대로 빌려 쓴다 (중복 정의 금지).

  openMenu(game) {
    this.menu = { page: 'main', sel: 0 };
    game.audio.playSE('confirm');
  }

  closeMenu(game) {
    this.menu = null;
    game.audio.playSE('cancel');
  }

  menuItems(game) {
    if (this.menu?.page === 'settings') {
      // '설정 초기화'·'돌아가기'는 빼고 조절 항목만
      const rows = game.scenes.settings.items(game).filter((it) => it.type !== 'action');
      return [...rows, { id: 'menuBack', label: '뒤로', type: 'action' }];
    }
    return [
      { id: 'resume', label: '계속하기', type: 'action' },
      { id: 'settings', label: '설정', type: 'action' },
      { id: 'retreat', label: '편성으로 돌아가기', type: 'action' },
      { id: 'title', label: '타이틀로', type: 'action' },
    ];
  }

  menuRowRect(i) { return { x: 320, y: 176 + i * 46, w: 320, h: 40 }; }
  menuArrowRects(i) {
    const r = this.menuRowRect(i);
    return [
      { x: r.x + 168, y: r.y + 6, w: 26, h: 28, d: -1 },
      { x: r.x + r.w - 36, y: r.y + 6, w: 26, h: 28, d: 1 },
    ];
  }

  menuAdjust(game, i, d) {
    const it = this.menuItems(game)[i];
    if (!it?.adjust) return;
    it.adjust(d);
    saveSettings(game.settings);
    if (it.id === 'bgm' || it.id === 'se') game.audio.setVolumes(game.settings.bgmVolume, game.settings.seVolume);
    if (it.id === 'scale') game.applyScale();
    if (it.id === 'battleSpeed') this.speed = game.settings.battleSpeed;   // 전투 중이므로 즉시 반영
    game.audio.playSE('move');
  }

  menuActivate(game, i) {
    const it = this.menuItems(game)[i];
    if (!it) return;
    if (it.type !== 'action') { this.menuAdjust(game, i, 1); return; }
    switch (it.id) {
      case 'resume': this.closeMenu(game); break;
      case 'settings': this.menu = { page: 'settings', sel: 0 }; game.audio.playSE('confirm'); break;
      case 'menuBack': this.menu = { page: 'main', sel: 1 }; game.audio.playSE('cancel'); break;
      case 'retreat':
        game.audio.playSE('confirm');
        this.menu = null;
        game.changeScene('party', { stageId: this.stage.id });
        break;
      case 'title':
        game.audio.playSE('cancel');
        this.menu = null;
        game.changeScene('title');
        break;
      default: break;
    }
  }

  menuKey(code, game) {
    const items = this.menuItems(game);
    const m = this.menu;
    if (code === 'Escape') {
      if (m.page === 'settings') { this.menu = { page: 'main', sel: 1 }; game.audio.playSE('cancel'); }
      else this.closeMenu(game);
    } else if (code === 'ArrowUp') { m.sel = (m.sel + items.length - 1) % items.length; game.audio.playSE('move'); }
    else if (code === 'ArrowDown') { m.sel = (m.sel + 1) % items.length; game.audio.playSE('move'); }
    else if (code === 'ArrowLeft') this.menuAdjust(game, m.sel, -1);
    else if (code === 'ArrowRight') this.menuAdjust(game, m.sel, 1);
    else if (code === 'Enter' || code === 'Space') this.menuActivate(game, m.sel);
  }

  menuMouse(x, y, button, game) {
    if (button === 2) { this.menuKey('Escape', game); return; }
    if (button !== 0) return;
    const items = this.menuItems(game);
    for (let i = 0; i < items.length; i++) {
      if (items[i].adjust) {
        for (const a of this.menuArrowRects(i)) {
          if (inRect(x, y, a)) { this.menu.sel = i; this.menuAdjust(game, i, a.d); return; }
        }
      }
      if (inRect(x, y, this.menuRowRect(i))) { this.menu.sel = i; this.menuActivate(game, i); return; }
    }
  }

  renderMenu(g, game) {
    const items = this.menuItems(game);
    const settings = this.menu.page === 'settings';
    g.fillStyle = 'rgba(6, 5, 12, 0.78)';
    g.fillRect(0, 0, 960, 540);
    const h = 116 + items.length * 46;
    drawPanel(g, 300, 104, 360, h);
    drawText(g, settings ? '설정' : '일시정지', 480, 146, { size: 20, bold: true, fill: PALETTE.gold, align: 'center' });

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const r = this.menuRowRect(i);
      const sel = this.menu.sel === i;
      g.fillStyle = sel ? PALETTE.navy3 : PALETTE.navy1;
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = sel ? PALETTE.gold : PALETTE.navy2;
      g.lineWidth = 2;
      g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      drawText(g, it.label, r.x + 16, r.y + 26, { size: 14, fill: sel ? PALETTE.gold : PALETTE.gray4 });

      if (!it.adjust) continue;
      for (const a of this.menuArrowRects(i)) {
        drawText(g, a.d < 0 ? '◀' : '▶', a.x + a.w / 2, a.y + 20,
          { size: 12, fill: sel ? PALETTE.gold : PALETTE.gray2, align: 'center' });
      }
      const val = it.value();
      if (it.type === 'range') {
        const bx = r.x + 200, by = r.y + 16;
        for (let k = 0; k < it.max; k++) {
          g.fillStyle = k < val ? (sel ? PALETTE.gold : PALETTE.blue) : PALETTE.navy2;
          g.fillRect(bx + k * 9, by, 6, 10);
        }
      } else {
        drawText(g, String(val), r.x + r.w - 44, r.y + 26, { size: 13, fill: PALETTE.white, align: 'right' });
      }
    }
    drawText(g, 'ESC 닫기 · ↑↓ 이동 · ←→ 조절 · Enter 선택',
      480, 104 + h + 22, { size: 12, fill: PALETTE.gray2, align: 'center' });
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
    this.playback = {
      steps: this.buildSteps(events), idx: 0, timer: 0,
      applied: new Set(), fired: new Set(), timings: new Map(),
      stopped: false, stopVal: 0, sched: null, after,
    };
    this.playCtx = { melee: false, casterId: null, shot: null, sacred: false };
    this.phase = 'anim';
  }

  // 재생 단위 묶기.
  // 광역 스킬은 대상마다 이벤트가 따로 나오는데, 하나씩 순서대로 재생하면
  // 성역(아군 4인 치유) 한 방이 4초를 넘긴다. 같은 시전자의 광역 파동은
  // 한 묶음으로 **동시에** 재생하고, 대상별로 아주 짧은 시차만 준다.
  //
  // 단, 근접 광역은 묶지 않는다 — 한 몸이 세 방향으로 동시에 돌진할 수는 없다.
  // 대상이 하나뿐인 묶음도 쪼갠다 — 단일 대상 연출은 기존 감각 그대로 둔다.
  buildSteps(events) {
    const FOLLOW = new Set(['status', 'miracle', 'death', 'cleanse']);
    const srcOf = (e) => e.attacker ?? e.caster ?? null;
    const steps = [];
    let melee = false;
    let i = 0;
    while (i < events.length) {
      const ev = events[i];
      if (ev.type === 'skill') melee = !!ev.melee;
      const groupable = (e) => (e.type === 'heal' || (e.type === 'hit' && !melee)) && srcOf(e);
      if (!groupable(ev)) { steps.push([ev]); i++; continue; }

      const src = srcOf(ev);
      const group = [];
      const targets = new Set();
      while (i < events.length) {
        const e = events[i];
        if (groupable(e) && srcOf(e) === src) { group.push(e); targets.add(e.target); i++; continue; }
        // 묶인 대상에 딸린 부수 이벤트(상태·기적·전투불능)는 같은 묶음에 넣는다
        if (group.length && FOLLOW.has(e.type) && targets.has(e.target ?? e.unit)) { group.push(e); i++; continue; }
        break;
      }
      if (targets.size < 2) for (const e of group) steps.push([e]);   // 단일 대상 = 기존대로
      else steps.push(group);
    }
    return steps;
  }

  // 묶음 안에서 대상마다 주는 시차 — 한꺼번에 터지면 밋밋해서 파도처럼 훑고 지나가게
  memberDelay(k) { return k * 0.06; }

  // ----- 원거리 투사체 -----

  // 이 이벤트가 투사체를 날리는가. 날린다면 skills.js의 shot 규격을 돌려준다.
  // hit/heal은 재생 중인 스킬의 shot을 쓰되 **시전자가 일치할 때만** 인정한다.
  // (턴 종료 도트·재생 이벤트에 직전 스킬의 투사체가 새어 나오는 것을 막는다.)
  // 협공·반격은 시전 스킬이 따로 없으므로 그 유닛의 일반공격 규격을 따른다.
  shotOf(ev) {
    if (ev.type === 'hit' || ev.type === 'heal') {
      const src = ev.attacker ?? ev.caster;
      return (src && src === this.playCtx.casterId) ? (this.playCtx.shot ?? null) : null;
    }
    if (ev.type === 'assist' || ev.type === 'counter') {
      const atk = L.getUnit(this.battle, ev.attacker);
      return SKILLS[atk?.skills.basic]?.shot ?? null;
    }
    return null;
  }

  // 총구 → 착탄점. 앵커는 발끝이므로 손·가슴 높이로 올린다.
  shotPath(ev) {
    const A = L.getUnit(this.battle, ev.attacker ?? ev.caster);
    const T = L.getUnit(this.battle, ev.target);
    if (!A || !T) return null;
    const a = anchorOf(A);
    const t = anchorOf(T);
    const dir = Math.sign(t.x - a.x) || 1;
    return { x0: a.x + dir * MUZZLE_FWD, y0: a.y - MUZZLE_UP, x1: t.x, y1: t.y - TARGET_UP };
  }

  // 투사체가 있는 이벤트의 타이밍 일체.
  // **도착 = 피해**를 보장해야 하므로 재생 길이 자체를 비행 시간에서 역산한다.
  // 그래서 뒷열의 먼 적을 쏘면 연출이 실제로 조금 더 길다.
  shotTiming(ev) {
    const shot = this.shotOf(ev);
    const spec = shot && PROJECTILES[shot.kind];
    if (!spec) return null;
    const path = this.shotPath(ev);
    if (!path) return null;
    const dist = Math.hypot(path.x1 - path.x0, path.y1 - path.y0);
    const flight = Math.max(SHOT_MIN_FLIGHT, Math.min(SHOT_MAX_FLIGHT, dist / spec.speed));
    const draw = spec.draw ?? SHOT_DRAW;   // 활은 당기는 게 보여야 해서 더 길다
    const dur = draw + flight + SHOT_RECOVER;
    return {
      shot, spec, path, flight, dur,
      releaseAt: draw / dur,
      impactAt: (draw + flight) / dur,
    };
  }

  // 재생 중인 이벤트는 결과를 캐시한다 — 길이·발사·착탄이 같은 수치를 쓰도록 보장.
  // 묶음 재생이라 이벤트 객체를 키로 캐시한다.
  timingFor(ev) {
    const pb = this.playback;
    if (!pb) return this.shotTiming(ev);
    if (!pb.timings.has(ev)) pb.timings.set(ev, this.shotTiming(ev));
    return pb.timings.get(ev);
  }

  eventDuration(ev) {
    const st = this.timingFor(ev);
    if (st) return st.dur;
    switch (ev.type) {
      case 'skill': return ev.kind === 'sacred' ? SACRED.castDur : 0.4;
      case 'hit': return this.playCtx.melee ? 0.52 : 0.4;
      case 'assist': return 0.46;
      case 'counter': return 0.5;
      case 'heal': case 'shieldGain': case 'regen': return 0.42;
      case 'revive': return 0.55;
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
        this.playCtx = {
          melee: !!ev.melee, casterId: ev.caster,
          shot: SKILLS[ev.skillId]?.shot ?? null,
          kind: ev.kind, sacred: ev.kind === 'sacred',
        };
        const ca = anchorOf(caster);
        this.pushLabel(ev.caster, ev.name, ev.kind === 'sacred' ? PALETTE.gold : PALETTE.white);
        if (ev.kind !== 'basic') this.spawnFx('ring', ev.fx?.color ?? 'gold', ca.x, ca.y - 44);
        game.audio.playSE(ev.kind === 'basic' ? 'move' : 'confirm');
        break;
      }
      case 'hit': case 'assist': case 'counter': {
        d.hp = ev.hpAfter;
        d.flash = 0.18;
        d.squash = SQUASH.dur;   // 찌그러짐 — 작업계획 1부 7번의 마지막 조각
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
        // 투사체가 꽂히는 순간의 불꽃 — 화살처럼 fx가 얌전한 스킬도 착탄이 보이게
        const st = this.timingFor(ev);
        if (st) this.spawnFx('impact', st.shot.color, a.x, a.y - TARGET_UP);
        // 참격은 공격자 → 대상 방향으로 벤다
        const slashDir = Math.sign(a.x - anchorOf(attacker).x) || 1;
        if (ev.fx) this.spawnFx(ev.fx.kind, ev.fx.color, a.x, a.y - 48, { dir: slashDir });
        game.audio.playSE(ev.type === 'assist' ? 'assist' : ev.crit ? 'crit' : 'hit');
        break;
      }
      case 'heal': case 'regen':
        d.hp = ev.hpAfter;
        this.effects.push({ kind: 'popup', x: a.x, y: a.y - 100, t: 0, text: `+${ev.amount}`, color: PALETTE.green });
        // 스킬 치유는 발밑 마법진(blessing), 지속 회복 틱은 매 턴 터지므로 작은 반짝임으로.
        if (ev.fx) this.spawnFx(ev.fx.kind, ev.fx.color, a.x, a.y);
        else this.spawnFx('sparkle', 'green', a.x, a.y - 48);
        game.audio.playSE('heal');
        break;
      case 'shieldGain':
        // 남은 보호막이 더 크면 유지되므로, 부여량이 아니라 **결과 총량**을 보여준다
        this.effects.push({ kind: 'popup', x: a.x, y: a.y - 100, t: 0, text: `보호막 ${ev.total ?? ev.amount}`, color: PALETTE.teal });
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
        if (ev.absorbed) this.effects.push({ kind: 'popup', x: a.x, y: a.y - 122, t: 0, text: `막음 ${ev.absorbed}`, color: PALETTE.teal });
        break;
      case 'miracle':
        this.pushLabel(unitId, '기적!', PALETTE.gold);
        this.spawnFx('sparkle', 'gold', a.x, a.y - 60);
        this.shake = 0.2;
        game.audio.playSE('victory');
        break;
      case 'revive':
        d.hp = ev.hpAfter;
        d.fade = -1;
        d.visible = true;
        this.effects.push({ kind: 'popup', x: a.x, y: a.y - 110, t: 0, text: '부활!', color: PALETTE.gold });
        this.spawnFx('blessing', 'gold', a.x, a.y);
        game.audio.playSE('heal');
        break;
      case 'stunned':
        this.pushLabel(unitId, '기절…', PALETTE.yellow);
        break;
      case 'death':
        d.fade = 0.4;
        // 히트스톱은 재생 스케줄이 건다 (stepSchedule의 stopIdx) — 여기서 걸면
        // 아직 날아가는 중인 투사체까지 얼어붙는다.
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

  // 이 타격이 화면을 몇 초 멎게 하는가 (작업계획.md 1부 §5)
  hitStopFor(ev) {
    if (ev.crit) return HITSTOP.crit;
    // 협공·반격은 시전 스킬이 없으므로 일반공격 취급
    if (ev.type === 'assist' || ev.type === 'counter') return HITSTOP.basic;
    const k = this.playCtx.kind;
    if (k === 'sacred') return HITSTOP.sacred;
    if (k === 'active') return HITSTOP.active;
    return HITSTOP.basic;
  }

  // 돌진 곡선 — 예비(뒤로) → 급가속 → 정지 → 감속 복귀.
  // 등속 왕복은 미끄러지듯 보인다. 때리기 직전에 몸을 빼야 힘이 실린다.
  lungeCurve(p) {
    if (p < LUNGE.windupTo) return -LUNGE.windupBack * (p / LUNGE.windupTo);
    if (p < LUNGE.strikeTo) {
      const k = (p - LUNGE.windupTo) / (LUNGE.strikeTo - LUNGE.windupTo);
      return -LUNGE.windupBack + (1 + LUNGE.windupBack) * k * k;   // 급가속
    }
    if (p < LUNGE.holdTo) return 1;
    const k = (p - LUNGE.holdTo) / (1 - LUNGE.holdTo);
    return (1 - k) * (1 - k);                                      // 감속 복귀
  }

  // 이 이벤트가 대상에게 가로로 돌진하는가 (근접 공격만)
  lungesOn(ev) {
    if (this.timingFor(ev)) return false;   // 쏘는 것과 붙는 것은 배타
    if (ev.type === 'hit') return this.playCtx.melee;
    if (ev.type === 'assist' || ev.type === 'counter') {
      return !!SKILLS[L.getUnit(this.battle, ev.attacker)?.skills.basic]?.melee;
    }
    return false;
  }

  // 묶음 구성원이 언제 터질지 미리 짠다.
  //
  // ★인과 순서가 핵심: 전투불능(0.4초 × 0.3 = 0.12초)은 검기 명중(0.75초 × 0.6 ≈ 0.45초)보다
  //   훨씬 짧아서, 각자 자기 타이밍대로 두면 **적이 먼저 죽고 나서 데미지가 들어간다.**
  //   그래서 발동 시각을 이벤트 순서대로 단조 증가하게 강제한다.
  //   (logic.js가 hit → miracle → death 순으로 내보내므로 그 순서가 곧 인과다)
  stepSchedule(pb, step) {
    if (pb.sched) return pb.sched;
    const sched = [];
    let prev = 0;
    for (let k = 0; k < step.length; k++) {
      const ev = step[k];
      const st = this.timingFor(ev);
      const dur = this.eventDuration(ev);
      const delay = step.length > 1 ? this.memberDelay(k) : 0;
      const impactAt = st ? st.impactAt : (this.lungesOn(ev) ? LUNGE.strikeTo : 0.3);
      const at = Math.max(prev, delay + impactAt * dur);   // 앞 이벤트보다 먼저 터질 수 없다
      prev = at;
      sched.push({ ev, st, dur, impactAt, at, start: at - impactAt * dur });
    }

    // ★히트스톱은 묶음의 **마지막** 타격에서만 건다.
    //   첫 타격에서 걸면 아직 날아가는 중인 나머지 투사체가 공중에 멎어
    //   렉이 걸린 것처럼 보이고 타이밍이 어긋난다.
    //   등급은 묶음 안에서 가장 긴 것을 쓴다 (처치 > 치명 > 성물 > 액티브 > 일반).
    let stopIdx = -1, stopSec = 0;
    for (let k = 0; k < sched.length; k++) {
      const ev = sched[k].ev;
      let sec = 0;
      if (ev.type === 'death') sec = HITSTOP.kill;
      else if (ev.type === 'hit' || ev.type === 'assist' || ev.type === 'counter') sec = this.hitStopFor(ev);
      if (sec > 0) { stopIdx = k; stopSec = Math.max(stopSec, sec); }
    }
    pb.stopIdx = stopIdx;
    pb.stopSec = stopSec;
    pb.sched = sched;
    return sched;
  }

  updatePlayback(dt, game) {
    const pb = this.playback;
    if (!pb) return;
    const step = pb.steps[pb.idx];
    if (!step) { this.endPlayback(game); return; }
    pb.timer += dt;

    const sched = this.stepSchedule(pb, step);
    let stepEnd = 0;
    for (let k = 0; k < step.length; k++) {
      const ev = step[k];
      // 성물은 시전 이벤트가 시작되는 순간 연출을 켠다 (피해 적용 시점보다 앞)
      if (ev.type === 'skill' && ev.kind === 'sacred' && !pb.fired.has(ev)) {
        pb.fired.add(ev);
        this.startSacred(game, ev);
      }
      const { st, dur, impactAt, start } = sched[k];
      stepEnd = Math.max(stepEnd, start + dur);
      const p = Math.max(0, Math.min(1, (pb.timer - start) / dur));
      if (pb.timer < start) continue;

      if (this.lungesOn(ev)) {
        const A = L.getUnit(this.battle, ev.attacker);
        const T = L.getUnit(this.battle, ev.target);
        const aD = this.displays.get(ev.attacker);
        const from = anchorOf(A);
        const to = anchorOf(T);
        const dir = Math.sign(to.x - from.x) || 1;
        const dx = (to.x - dir * LUNGE_STOP) - from.x;
        const dy = to.y - from.y;
        const f = this.lungeCurve(p);
        aD.ox = dx * f;
        // 세로는 예비 동작(f<0)을 빼고 적용한다. 그대로 곱하면 **위쪽 대상을 칠 때
        // 시전자가 순간적으로 아래로 내려앉아** 자기 HP바가 하단 패널에 물린다
        // (최하단 아군 → 최상단 적: py 396 → 411, 상태칩 바닥 445 = 패널까지 1px).
        // 가로 빼기(손맛)는 그대로 두고, 세로만 [자기 y, 대상 y] 안에 가둔다.
        aD.oy = dy * Math.max(0, f);
        if (p >= 1) { aD.ox = 0; aD.oy = 0; }
      }
      // ★당기는 몸짓 (사용자 확인 2026-08-06: "시위 당기는 모션이 스킵되는 것 같다").
      //   원거리 예비 동안 몸이 표적 반대쪽으로 3px까지 **스멀스멀 밀리다가**,
      //   발사 순간 앞으로 탁 풀린다. 프레임 2장 사이의 "당기는 과정"을 몸짓이 메운다.
      if (st && ev.type === 'hit') {
        const A2 = L.getUnit(this.battle, ev.attacker);
        const T2 = L.getUnit(this.battle, ev.target);
        const aD2 = this.displays.get(ev.attacker);
        if (A2 && T2 && aD2) {
          const dir2 = Math.sign(anchorOf(T2).x - anchorOf(A2).x) || 1;
          if (p < st.releaseAt) {
            aD2.ox = -dir2 * 3 * Math.pow(p / st.releaseAt, 1.6);   // 뒤로 힘 모으기
          } else {
            const rel = (p - st.releaseAt) / (1 - st.releaseAt);
            aD2.ox = dir2 * Math.max(0, 2 * (1 - rel * 6));         // 발사 반동 — 짧게 앞으로
          }
          if (p >= 1) aD2.ox = 0;
        }
      }
      // 시전 오라 — 시위를 당기고 마력을 모으는 동안 시전자 몸 주변에 감긴다.
      // 스프라이트 투사체 스킬만 (치유의 blessing과 짝을 이루는 공격 쪽 연출)
      if (st && st.spec.sprite && !(pb.charged ??= new Set()).has(ev) && p >= 0) {
        pb.charged.add(ev);
        const caster = L.getUnit(this.battle, ev.attacker ?? ev.caster);
        if (caster) this.spawnCastAura(st.shot.color, anchorOf(caster));
      }
      // 발사 — 비행 시간이 곧 착탄까지 남은 시간이라 정확히 한 번만 쏜다
      if (st && !pb.fired.has(ev) && p >= st.releaseAt) {
        pb.fired.add(ev);
        // 비행 시간은 규격값이 아니라 **이 프레임에서 착탄 시점까지 실제로 남은 시간**을 쓴다.
        // 발사·착탄 판정이 각각 프레임 경계로 밀리기 때문에, 규격값을 그대로 쓰면
        // 짧은 사격에서 투사체가 대상에 닿기 전에 피해가 들어간다(최대 20px 오차).
        this.spawnProjectile(st, game, Math.max(0.02, (st.impactAt - p) * dur));
      }

      if (!pb.applied.has(ev) && p >= impactAt) {
        pb.applied.add(ev);
        this.applyImpact(game, ev);
        // 히트스톱은 묶음의 마지막 타격에서만 (날아가는 중인 투사체를 얼리지 않도록)
        if (k === pb.stopIdx) this.freeze = Math.max(this.freeze, pb.stopSec);
      }
    }

    if (pb.timer >= stepEnd) {
      for (const ev of step) if (!pb.applied.has(ev)) { pb.applied.add(ev); this.applyImpact(game, ev); }
      pb.idx++;
      pb.timer = 0;
      pb.stopped = false;
      pb.stopVal = 0;
      pb.sched = null;
    }
  }

  // ----- 성물 연출 -----
  // 배경을 죽이고 시전자만 남긴 뒤, 사방에서 빛을 그러모아 한 번에 터뜨린다.
  startSacred(game, ev) {
    const caster = L.getUnit(this.battle, ev.caster);
    if (!caster) return;
    const a = anchorOf(caster);
    const color = PALETTE[ev.fx?.color ?? 'gold'] ?? PALETTE.gold;
    this.cine = { t: 0, dur: SACRED.castDur, casterId: ev.caster, color, released: false, flash: 0, name: ev.name };
    // 시전자에게 빨려드는 빛.
    // 거리·시차를 흩어야 한다 — 같은 반지름에서 동시에 출발하면 정적인 고리로 보인다.
    const release = SACRED.castDur * SACRED.releaseAt;
    for (let i = 0; i < SACRED.chargeCount; i++) {
      const ang = (i * 2.39996) % (Math.PI * 2);          // 황금각 — 고르게 흩어진다
      const d = SACRED.chargeR * (0.55 + ((i * 37) % 100) / 100 * 0.75);
      const delay = ((i * 61) % 100) / 100 * release * 0.5;
      const dur = release - delay;
      if (dur <= 0.05) continue;
      this.particles.push({
        shape: 'converge', life: -delay, dur,
        color: i % 3 === 0 ? PALETTE.white : color, size: i % 3 ? 3 : 5,
        x: a.x + Math.cos(ang) * d, y: a.y - 54 + Math.sin(ang) * d * 0.7,
        x0: a.x + Math.cos(ang) * d, y0: a.y - 54 + Math.sin(ang) * d * 0.7,
        x1: a.x, y1: a.y - 54,
      });
    }
    game.audio.playSE('confirm');
  }

  // 모은 빛이 터지는 순간
  releaseSacred(game) {
    const c = this.cine;
    const caster = L.getUnit(this.battle, c.casterId);
    const a = caster ? anchorOf(caster) : { x: 480, y: 300 };
    c.released = true;
    c.flash = SACRED.flashDur;
    this.shake = SACRED.shake;
    this.freeze = SACRED.freeze;
    this.particles.push({ shape: 'ring', life: 0, dur: 0.45, color: c.color, x: a.x, y: a.y - 54, r0: 6, r1: 260 });
    this.particles.push({ shape: 'ring', life: 0, dur: 0.34, color: PALETTE.white, x: a.x, y: a.y - 54, r0: 2, r1: 170 });
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * Math.PI * 2;
      this.particles.push({
        shape: 'rect', life: 0, dur: 0.4 + (i % 3) * 0.06, size: i % 2 ? 4 : 6,
        color: i % 3 === 0 ? PALETTE.white : c.color,
        x: a.x, y: a.y - 54, vx: Math.cos(ang) * 280, vy: Math.sin(ang) * 220,
      });
    }
    game.audio.playSE('crit');
  }

  // 투사체 스폰. 위치를 속도가 아니라 경로 보간으로 움직여 도착 시각을 정확히 맞춘다.
  // 시전 오라 — 발밑 마법진 + 몸으로 빨려드는 빛 + 떠오르는 빛줄기 + 작은 파동.
  // a = 시전자 발끝 앵커. 수치는 fx.js CAST_AURA.
  spawnCastAura(colorKey, a) {
    const C = CAST_AURA;
    const color = PALETTE[colorKey] ?? PALETTE.white;
    const bodyY = a.y - 44;
    this.particles.push({ shape: 'glyph', life: 0, dur: C.glyphDur, color, x: a.x, y: a.y, r0: 12, r1: C.glyphR });
    this.particles.push({ shape: 'ring', life: 0, dur: 0.3, color, x: a.x, y: bodyY, r0: 5, r1: C.ringR, thick: 3 });
    for (let i = 0; i < C.converge; i++) {
      const ang = (i / C.converge) * Math.PI * 2 + 0.4;
      const d = C.convergeR * (0.8 + (i % 3) * 0.15);
      const sx = a.x + Math.cos(ang) * d, sy = bodyY + Math.sin(ang) * d * 0.7;
      this.particles.push({
        shape: 'converge', life: -i * 0.018, dur: C.convergeDur,
        color: i % 3 === 0 ? PALETTE.white : color, size: i % 3 ? 3 : 4,
        x: sx, y: sy, x0: sx, y0: sy, x1: a.x, y1: bodyY,
      });
    }
    for (let i = 0; i < C.wisps; i++) {
      this.particles.push({
        shape: 'shard', life: -i * 0.03, dur: 0.42,
        color: i % 2 ? color : PALETTE.white, size: i % 2 ? 3 : 4,
        x: a.x - 16 + i * 8, y: bodyY + 18 - (i % 3) * 8,
        vx: (i % 2 ? 12 : -12), vy: -85 - (i % 3) * 22,
      });
    }
  }

  spawnProjectile(st, game, flight) {
    const { spec, path, shot } = st;
    const color = PALETTE[shot.color] ?? PALETTE.white;
    const core = PALETTE[spec.core] ?? PALETTE.white;
    const n = spec.count ?? 1;
    // 성물은 같은 종류라도 눈에 띄게 커야 등급이 읽힌다
    const boost = this.playCtx.sacred ? SACRED.projScale : 1;
    const cres = spec.crescent
      ? { ...spec.crescent, r: spec.crescent.r * boost, thick: spec.crescent.thick * boost }
      : null;
    for (let i = 0; i < n; i++) {
      // 연사(volley)는 세로로 벌려 쏘고, i=0 한 발이 정확히 피해 시점에 꽂힌다.
      // 나머지는 조금씩 먼저 도착해 "드르륵" 박히는 잔상을 만든다.
      const off = n > 1 ? (i - (n - 1) / 2) * spec.spread : 0;
      // sky(화살비): 시전자 손이 아니라 **대상 머리 위**에서 떨어진다.
      // 벌림(off)도 세로가 아니라 가로로 — 낙하 지점이 옆으로 퍼져야 비다.
      const sky = spec.sky ?? null;
      const sx0 = sky ? path.x1 + off : path.x0;
      const sy0 = sky ? path.y1 - sky.height - (i % 2) * 24 : path.y0 - off * 0.5;
      const sx1 = sky ? path.x1 + off : path.x1;
      const sy1 = sky ? path.y1 : path.y1 + off * 0.35;
      this.particles.push({
        shape: 'proj', life: 0,
        dur: Math.max(0.06, flight - i * (spec.stagger ?? 0)),
        color, core, len: spec.len * boost, thick: spec.thick * boost,
        crescent: cres,
        // 스프라이트 투사체 (proj_sprites.js) — 성물은 아트 픽셀을 한 단계 더 키운다
        sprite: spec.sprite ?? null, colorKey: shot.color,
        px: this.playCtx.sacred ? PROJ_ART.sacredPx : PROJ_ART.basePx,
        embers: spec.embers ?? null, trail: 0,
        arc: sky ? 0 : spec.arc - Math.abs(off) * 0.4,
        x: sx0, y: sy0,
        x0: sx0, y0: sy0,
        x1: sx1, y1: sy1,
      });
    }
    // 총구 섬광 — 손끝에서 무언가가 "발사됐다"는 인과를 만든다.
    // sky는 손에서 나가지 않으므로 대신 하늘에 예광이 스친다.
    if (spec.sprite) {
      const fx = spec.sky ? path.x1 : path.x0;
      const fy = spec.sky ? path.y1 - spec.sky.height : path.y0;
      this.particles.push({ shape: 'flash', life: 0, x: fx, y: fy, r1: 15, dur: 0.18, color });
    }
    // ★라이저 — 하늘 사격은 시전자 손에서 화살 한 발이 **하늘로 솟은 뒤** 비가 온다.
    //   광역이라 같은 스텝에 여러 발이 발사되므로, 스텝당 한 발만 올린다.
    if (spec.sky && this.playback && this.playback.riserAt !== this.playback.idx) {
      this.playback.riserAt = this.playback.idx;
      const R = ARCHER_FX.riser;
      this.particles.push({
        shape: 'proj', sprite: 'energyArrowUp', life: 0, dur: R.dur,
        color, core, colorKey: shot.color, px: this.playCtx.sacred ? PROJ_ART.sacredPx : PROJ_ART.basePx,
        arc: 0, embers: null,
        x: path.x0, y: path.y0,
        x0: path.x0, y0: path.y0, x1: path.x0 + 6, y1: path.y0 - R.height,
      });
    }
    game.audio.playSE('shot');
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

  spawnFx(kind, colorKey, x, y, opts = {}) {
    const color = PALETTE[colorKey] ?? PALETTE.white;
    const add = (p) => this.particles.push({ life: 0, ...p });
    const dir = opts.dir ?? 1;          // 칼이 지나간 방향 (+1 = 오른쪽으로 벰)
    switch (kind) {
      case 'slash': {
        // 칼이 지나간 자리의 초승달. 호의 중심을 벤 방향 **반대쪽**에 두면
        // 볼록한 면이 진행 방향을 향해, 실제로 그쪽으로 휘두른 것처럼 보인다.
        const S = SLASH;
        add({
          shape: 'arc', dir, color, dur: S.dur,
          cx: x - dir * S.r * 0.9, cy: y,
          r: S.r, spread: S.spread, thick: S.thick, flat: S.flat,
          sweep: S.sweep, grow: S.grow, steps: S.steps,
        });
        // 베인 자리에서 튀는 불티
        for (let i = 0; i < S.sparks; i++) {
          const ang = -S.spread + (i / (S.sparks - 1)) * S.spread * 2;
          const sp = 130 + (i % 3) * 60;
          add({
            shape: 'rect', size: i % 3 ? 3 : 4, dur: 0.26 + (i % 3) * 0.05,
            color: i % 2 ? PALETTE.white : color,
            x: x - dir * S.r * 0.9 + dir * Math.cos(ang) * S.r,
            y: y + Math.sin(ang) * S.r * S.flat,
            vx: dir * Math.cos(ang) * sp * 0.5, vy: Math.sin(ang) * sp,
          });
        }
        break;
      }
      case 'burst': {
        // 마법탄 폭발 — 참격과 같은 3겹 발광 언어.
        // 중심 섬광이 하얗게 타오르고, 빛 조각이 꼬리를 끌며 튀고, 충격파 링이 퍼진다.
        const B = MAGIC.burst;
        add({ shape: 'flash', x, y, r1: B.flashR, dur: B.dur, color });
        add({ shape: 'ring', x, y, r0: 4, r1: B.ringR, dur: B.ringDur, color, thick: 4 });
        for (let i = 0; i < B.shards; i++) {
          // 균등 배치 + 약간의 결정적 흐트러짐 — 완전 등간격이면 기계적으로 보인다
          const ang = (i / B.shards) * Math.PI * 2 + (i % 3) * 0.19;
          const sp = B.shardSpeed * (0.75 + (i % 4) * 0.11);
          add({
            shape: 'shard', x, y, dur: B.dur - (i % 3) * 0.05, color,
            vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.86,   // 사이드뷰라 세로만 살짝 눌러
            size: i % 3 ? 3 : 4,
          });
        }
        break;
      }
      case 'ring': {
        // 광역 파동 — 후광·몸통·흰 심 3겹 링 + 링 위에서 떠오르는 빛알
        const R = MAGIC.ring;
        add({ shape: 'ring', x, y, r0: R.r0, r1: R.r1, dur: R.dur, color, thick: R.thick });
        for (let i = 0; i < R.sparks; i++) {
          const ang = (i / R.sparks) * Math.PI * 2;
          add({
            shape: 'shard', dur: R.dur, color: i % 3 === 0 ? PALETTE.white : color,
            x: x + Math.cos(ang) * R.r1 * 0.5, y: y + Math.sin(ang) * R.r1 * 0.3,
            vx: Math.cos(ang) * 30, vy: -46 - (i % 3) * 14, size: i % 3 ? 3 : 4,
          });
        }
        break;
      }
      case 'rain': {
        // 낙하 계열 — 발광 줄기가 시간차로 꽂히고, 닿는 자리마다 착지 섬광이 터진다.
        // 이전 버전은 단색 사각형이 허공에서 사라져 "떨어졌다"는 인과가 없었다.
        const RN = MAGIC.rain;
        for (let i = 0; i < RN.drops; i++) {
          // 가운데부터 바깥으로 번갈아 — 왼쪽부터 차례로 오면 커튼처럼 보인다
          const k = (i % 2 ? 1 : -1) * Math.ceil(i / 2);
          const dx = (k / (RN.drops - 1)) * RN.spreadX * 2 * 0.5;
          const landY = y + (i % 3) * 7 - 7;
          const fall = RN.fallH / RN.speed;
          const delay = i * RN.stagger;
          add({
            shape: 'drop', x: x + dx, y: landY - RN.fallH, life: -delay, dur: fall,
            vy: RN.speed, color, w: RN.w, h: RN.h,
          });
          add({
            shape: 'flash', x: x + dx, y: landY, life: -(delay + fall),
            r1: RN.splashR, dur: 0.2, color,
          });
        }
        break;
      }
      case 'pierce': {
        // 정밀 사격·매의 표식 — 관통 섬광 + 대상에 남는 **과녁 문양**.
        // 표식(협공 2배)이 "찍혔다"는 것을 문양이 잠깐 남아서 알려 준다.
        const P2 = ARCHER_FX.pierce;
        add({ shape: 'flash', x, y, r1: P2.flashR, aspect: P2.flashAspect, dur: 0.22, color });
        add({ shape: 'ring', x, y, r0: P2.reticleR * 1.3, r1: P2.reticleR, dur: P2.reticleDur, color, thick: 3 });
        add({ shape: 'ring', x, y, r0: 4, r1: P2.reticleR * 0.45, dur: 0.3, color: PALETTE.white, thick: 2 });
        for (let i = 0; i < P2.ticks; i++) {
          const ang = (i / P2.ticks) * Math.PI * 2;
          add({
            shape: 'rect', size: 4, dur: P2.reticleDur, color: i % 2 ? color : PALETTE.white,
            x: x + Math.cos(ang) * P2.reticleR, y: y + Math.sin(ang) * P2.reticleR, vx: 0, vy: 0,
          });
        }
        for (let i = 0; i < 3; i++) {   // 관통해 빠져나가는 불티 — 벤 방향으로
          add({ shape: 'shard', x, y: y - 4 + i * 4, dur: 0.26, color, size: 3, vx: dir * (150 + i * 40), vy: (i - 1) * 30 });
        }
        break;
      }
      case 'holyburst': {
        // 성궁 해방 착탄 — 폭발 + 자리에서 솟는 금빛 빛기둥 (신성한 심판)
        this.spawnFx('burst', colorKey, x, y, opts);
        const HL = ARCHER_FX.holy;
        add({ shape: 'beam', x, y: y + 12, h: HL.beamH, w: HL.beamW, dur: HL.beamDur, vy: -30, color, core: PALETTE.white });
        for (let i = 0; i < 3; i++) {
          add({
            shape: 'twinkle', size: 7, dur: 0.4, life: -i * 0.07,
            color: i % 2 ? PALETTE.white : color,
            x: x - 14 + i * 14, y: y - 10 - (i % 2) * 14,
          });
        }
        break;
      }
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
      case 'blessing': {
        // 성스러운 가호 — 대상 **발밑**에 마법진이 퍼지고 그 안에서 빛기둥이 솟는다.
        // (치유는 무언가를 던져 맞히는 게 아니라 대상 위에 내려앉는 것)
        add({ shape: 'glyph', x, y, r0: 16, r1: 70, dur: 1.1, color });
        for (let i = 0; i < 14; i++) {
          const off = -58 + i * 8.9;
          const bright = i % 3 === 0;
          add({
            shape: 'beam', x: x + off, y: y - 2, vx: 0, vy: -120 - (i % 4) * 40, dur: 0.9 + (i % 3) * 0.1,
            color: bright ? PALETTE.white : color, core: bright ? null : PALETTE.white,
            h: 30 + (i % 5) * 13, w: bright ? 5 : 3,
          });
        }
        // 중앙에서 곧게 솟는 굵은 빛 — 가호가 내려앉는 축
        add({ shape: 'beam', x, y: y - 2, vx: 0, vy: -90, dur: 1.0, color, core: PALETTE.white, h: 78, w: 9 });
        for (let i = 0; i < 10; i++) {   // 흩어져 떠오르는 빛알
          add({ shape: 'rect', x: x - 45 + i * 10, y: y - 8, vx: (i % 2 ? 16 : -16), vy: -55 - i * 6, dur: 0.85, color, size: i % 3 ? 3 : 4 });
        }
        break;
      }
      case 'impact':   // 투사체 착탄 — 짧고 날카롭게 튀는 불꽃
        for (let i = 0; i < 7; i++) {
          const ang = -Math.PI / 2 + (i - 3) * 0.42;
          add({ shape: 'rect', x, y, vx: Math.cos(ang) * 110, vy: Math.sin(ang) * 110, dur: 0.24, color, size: 4 });
        }
        add({ shape: 'ring', x, y, r0: 2, r1: 24, dur: 0.2, color });
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
    if (this.menu) { this.menuKey(code, game); return; }
    if (this.phase === 'result') {
      if (code === 'KeyR') this.resultAction(game, 'retry');
      else if (code === 'Enter' || code === 'Space') this.resultAction(game, 'base');
      return;
    }
    // ESC는 **한 단계 뒤로**가 우선. 뒤로 갈 곳이 없을 때만 일시정지 메뉴를 연다.
    //   대상 선택 → 스킬 선택 → 행동 선택 → 캐릭터 선택(해제) → [일시정지]
    // 잘못 고른 캐릭터를 되돌릴 방법이 없으면 그 턴을 통째로 날려야 한다.
    if (code === 'Escape') {
      if (this.canCancelStep()) this.cancelStep(game);
      else this.openMenu(game);
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
        else if (code === 'KeyF') this.enterItemSelect(game);
        else if (code === 'Space') { game.audio.playSE('move'); this.finishUnit(game); }
        break;   // ESC는 위에서 단계 뒤로가기로 처리
      case 'skillSelect': {
        const cards = this.skillCardRects();
        const n = code.startsWith('Digit') ? Number(code.slice(5)) - 1 : -1;
        if (n >= 0 && n < cards.length) this.enterTargeting(game, cards[n].id);
        break;
      }
      case 'itemSelect': {
        const cards = this.itemCardRects(game);
        const n = code.startsWith('Digit') ? Number(code.slice(5)) - 1 : -1;
        if (n >= 0 && n < cards.length) this.pickItem(game, cards[n].id);
        break;
      }
      case 'itemTarget': {
        const targets = this.aliveAllies();
        if (prev || next) {
          this.hoverTarget = this.cycle(targets, this.hoverTarget, next ? 1 : -1);
          game.audio.playSE('move');
        }
        if (code === 'Enter' || code === 'KeyA') {
          if (this.hoverTarget) this.useItemOn(game, this.pendingItem, this.hoverTarget.id);
        }
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
        break;
      }
      default: break;
    }
  }

  onMouseMove(x, y, game) {
    if (this.menu) {
      const items = this.menuItems(game);
      let over = false;
      for (let i = 0; i < items.length; i++) {
        if (inRect(x, y, this.menuRowRect(i))) { this.menu.sel = i; over = true; }
        if (items[i].adjust) for (const a of this.menuArrowRects(i)) if (inRect(x, y, a)) over = true;
      }
      game.setCursor(over ? 'pointer' : 'default');
      return;
    }
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
    if (this.phase !== 'anim' && this.phase !== 'result' && this.phase !== 'skillSelect' && this.phase !== 'itemSelect') {
      for (const r of this.toggleRects()) if (inRect(x, y, r)) hover = true;
    }
    game.setCursor(hover ? 'pointer' : 'default');
  }

  onMouseDown(x, y, button, game) {
    if (this.menu) { this.menuMouse(x, y, button, game); return; }
    if (this.phase === 'result') {
      if (button !== 0) return;
      for (const r of this.resultRects()) if (inRect(x, y, r)) this.resultAction(game, r.id);
      return;
    }
    // 토글 히트 테스트는 토글이 그려지는 단계에서만 (skillSelect의 투명 히트박스 방지)
    if (button === 0 && this.phase !== 'anim' && this.phase !== 'skillSelect' && this.phase !== 'itemSelect') {
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
            else if (r.id === 'item') this.enterItemSelect(game);
            else if (r.id === 'cancel') this.cancelStep(game);
            else { game.audio.playSE('move'); this.finishUnit(game); }
          }
        }
        break;
      case 'skillSelect':
        for (const r of this.skillCardRects()) if (inRect(x, y, r)) this.enterTargeting(game, r.id);
        break;
      case 'itemSelect':
        for (const r of this.itemCardRects(game)) if (inRect(x, y, r)) this.pickItem(game, r.id);
        break;
      case 'itemTarget': {
        const u = this.unitAtPoint(x, y);
        if (u && u.side === 'ally' && u.alive) {
          this.hoverTarget = u;
          this.useItemOn(game, this.pendingItem, u.id);
        }
        break;
      }
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
    if (this.menu) return;         // 일시정지 — 전투 시계 전체를 멈춘다
    const bdt = dt * this.speed;   // 2배속 (기획서 §6)
    this.t += bdt;
    if (this.banner.t > 0) this.banner.t -= bdt;
    if (this.shake > 0) this.shake -= bdt;

    if (this.pendingEnemy !== undefined) {
      this.pendingEnemy -= bdt;
      if (this.pendingEnemy <= 0) { this.pendingEnemy = undefined; this.runEnemyPhase(game); }
    }

    // 성물 연출 시계 — 히트스톱과 무관하게 흐른다 (섬광·암전은 멎으면 안 된다)
    if (this.cine) {
      this.cine.t += bdt;
      if (!this.cine.released && this.cine.t >= this.cine.dur * SACRED.releaseAt) this.releaseSacred(game);
      if (this.cine.flash > 0) this.cine.flash -= bdt;
      if (this.cine.t >= this.cine.dur) this.cine = null;
    }

    // 히트스톱 — 이벤트 시계와 파티클만 멎는다.
    // 2배속에서도 그대로 절반이 되면 손맛이 죽으므로 배속 영향을 60%만 받게 한다 (계획서 1부 §5)
    if (this.freeze > 0) {
      this.freeze = Math.max(0, this.freeze - dt * (1 + (this.speed - 1) * HITSTOP.speedFactor));
    } else {
      this.updatePlayback(bdt, game);
    }

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
      if (d.squash > 0) d.squash -= bdt;
      if (d.knock.t > 0) d.knock.t -= bdt;
      if (d.fade > 0) { d.fade -= bdt; if (d.fade <= 0) { d.fade = -1; d.visible = false; } }
    }
    for (const e of this.effects) e.t += bdt;
    this.effects = this.effects.filter((e) => e.t < (e.kind === 'popup' ? 0.9 : 0.7));
    const spawnEmbers = [];   // 순회 중 push하면 안 되므로 모았다가 뒤에 넣는다
    for (const p of this.particles) {
      if (this.freeze > 0) break;     // 히트스톱: 파티클도 멎는다
      p.life += bdt;
      if (p.life < 0) continue;   // 아직 시작 전(시간차 연출) — 움직이면 안 된다
      if (p.shape === 'converge') {
        // 가속하며 시전자에게 빨려든다
        const q = Math.max(0, Math.min(1, p.life / p.dur));
        const e = q * q;
        p.x = p.x0 + (p.x1 - p.x0) * e;
        p.y = p.y0 + (p.y1 - p.y0) * e;
      } else if (p.shape === 'proj') {
        // 투사체는 속도가 아니라 **경로 보간**으로 움직인다.
        // 등속으로 밀면 착탄이 피해 시점과 어긋나므로 위치를 진행률에서 직접 구한다.
        const q = Math.min(1, p.life / p.dur);
        const ox = p.x, oy = p.y;
        p.x = p.x0 + (p.x1 - p.x0) * q;
        p.y = p.y0 + (p.y1 - p.y0) * q + p.arc * 4 * q * (1 - q);
        // 불티 — 지나온 거리를 재서 일정 간격마다 뒤에 흘린다 (fx.js PROJ_ART).
        // 간격·속도가 전부 같으면 점선으로 보인다 — 개수 기반 해시로 결정적 지터를 준다
        // (연출 전용이라 시드 RNG까지는 안 쓰되, Math.random도 안 쓴다: 재현이 흔들리지 않게).
        if (p.embers) {
          p.trail = (p.trail ?? 0) + Math.hypot(p.x - ox, p.y - oy);
          while (p.trail >= p.embers.every) {
            p.trail -= p.embers.every;
            const n = (p.embN = (p.embN ?? 0) + 1);
            const j1 = ((n * 73) % 17) / 17 - 0.5;    // -0.5~0.5 결정적 흐트러짐
            const j2 = ((n * 131) % 19) / 19 - 0.5;
            spawnEmbers.push({
              shape: 'shard', life: 0, dur: p.embers.dur * (0.7 + ((n * 37) % 11) / 11 * 0.6),
              color: p.color, size: p.embers.size + (n % 2),
              x: p.x, y: p.y + j2 * 12,
              vx: (p.x0 < p.x1 ? -1 : 1) * (18 + j1 * 46), vy: PROJ_ART.emberDriftY + j1 * 30,
              grav: PROJ_ART.emberGravity,
            });
            // 반짝이 — 불티 몇 개마다 십자 별빛이 궤적 주변에서 터진다
            if (n % TWINKLE.everyN === 0) {
              spawnEmbers.push({
                shape: 'twinkle', life: 0, dur: TWINKLE.dur,
                color: n % 4 === 0 ? p.color : PALETTE.white,
                size: TWINKLE.size * (0.7 + ((n * 53) % 13) / 13 * 0.6),
                x: p.x + j1 * TWINKLE.jitter * 2, y: p.y + j2 * TWINKLE.jitter * 2,
              });
            }
          }
        }
      } else {
        if (p.grav) p.vy = (p.vy ?? 0) + p.grav * bdt;   // 불티: 떠올랐다가 떨어진다
        p.x += (p.vx ?? 0) * bdt;
        p.y += (p.vy ?? 0) * bdt;
      }
    }
    this.particles.push(...spawnEmbers);
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

    // 바닥 마법진은 유닛보다 **먼저** 그린다 — 캐릭터가 원 안에 서 있는 것처럼 보이게.
    // 나중에 그리면 링이 정강이를 가로질러 공중에 뜬 것처럼 보인다.
    for (const p of this.particles) if (p.shape === 'glyph') this.renderGlyph(g, p);

    const order = [...this.battle.units].sort((a, b) => anchorOf(a).y - anchorOf(b).y);
    for (const u of order) this.renderUnit(g, u, game);

    // 성물 — 배경을 덮어 죽이고 시전자만 다시 그려 스포트라이트를 만든다
    if (this.cine) {
      const c = this.cine;
      const ct = Math.min(1, c.t / c.dur);
      const dim = ct < SACRED.dimIn ? ct / SACRED.dimIn : Math.max(0, 1 - (ct - SACRED.dimIn) / (1 - SACRED.dimIn));
      g.fillStyle = `rgba(6, 5, 12, ${(dim * SACRED.dimTo).toFixed(3)})`;
      g.fillRect(-20, -20, 1000, 580);
      const caster = L.getUnit(this.battle, c.casterId);
      if (caster) {
        const a = anchorOf(caster);
        g.globalAlpha = dim * 0.5;                       // 발밑 후광
        g.fillStyle = c.color;
        g.beginPath(); g.ellipse(a.x, a.y, 62, 20, 0, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
        this.renderUnit(g, caster, game);
        // 터지기 직전으로 갈수록 몸이 타오른다 (모은 빛이 새어 나오는 느낌)
        const heat = c.released ? 0 : Math.min(1, ct / SACRED.releaseAt);
        if (heat > 0) {
          const prevOp = g.globalCompositeOperation;
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = heat * heat * 0.55;
          g.fillStyle = c.color;
          g.beginPath(); g.ellipse(a.x, a.y - 52, 26 + heat * 16, 40 + heat * 20, 0, 0, Math.PI * 2); g.fill();
          g.globalCompositeOperation = prevOp;
          g.globalAlpha = 1;
        }

        // 해방 컷인 (기획 docs/성물_필살기_기획.md §3) — 차지 구간에만:
        // 확대 스프라이트가 잔광을 끌며 미끄러져 들어오고, 스킬명이 임팩트 스케일로 박힌다
        if (!c.released) {
          const q = Math.min(1, ct / SACRED.releaseAt);
          const ease = 1 - Math.pow(1 - Math.min(1, q * 2.4), 3);
          const spr = this.spriteFor(caster);
          const sc = sprScale(spr, 3);
          const w = spr.width * sc, h = spr.height * sc;
          const cx = 210 + ease * 280;
          const cy = 96;
          const fade = Math.min(1, q * 3.5);
          g.imageSmoothingEnabled = false;
          const prevOp2 = g.globalCompositeOperation;
          g.globalCompositeOperation = 'lighter';
          for (let i = 1; i <= 3; i++) {
            g.globalAlpha = fade * 0.11 * (4 - i);
            g.drawImage(spr, Math.round(cx - w / 2 - i * 30 * (1 - ease + 0.25)), cy, w, h);
          }
          g.globalCompositeOperation = prevOp2;
          g.globalAlpha = fade;
          g.drawImage(spr, Math.round(cx - w / 2), cy, w, h);
          g.globalAlpha = 1;
          if (q > 0.30 && c.name) {
            const nq = Math.min(1, (q - 0.30) / 0.28);
            const pop = 1 - Math.pow(1 - nq, 3);
            const size = Math.round(58 - pop * 22);          // 크게 나타나 박히는 임팩트
            g.globalAlpha = nq;
            drawTextOutlined(g, `— ${c.name} —`, 480, 330, { size, bold: true, align: 'center', fill: PALETTE.gold, outline: PALETTE.black });
            g.globalAlpha = 1;
          }
        }
      }
    }

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
        // 충격파 링 — 참격과 같은 [후광 → 몸통 → 흰 심] 3겹 발광.
        // 성물 해방·방패·착탄 등 shape:'ring'을 쓰는 모든 곳이 같이 좋아진다.
        if (p.life < 0) continue;
        const t2 = p.life / p.dur;
        const r = Math.max(1, p.r0 + (p.r1 - p.r0) * (1 - (1 - t2) * (1 - t2)));   // 감속하며 퍼짐
        const body = p.thick ?? 3;
        const prevOp = g.globalCompositeOperation;
        g.globalCompositeOperation = 'lighter';
        const stroke = (w, alpha, style) => {
          g.globalAlpha = q * alpha;
          g.strokeStyle = style;
          g.lineWidth = Math.max(1, w);
          g.beginPath();
          g.arc(p.x, p.y, r, 0, Math.PI * 2);
          g.stroke();
        };
        stroke(body * 2.0, 0.20, p.color);          // 후광
        stroke(body, 0.50, p.color);                // 몸통
        stroke(Math.min(2, body), 0.85, PALETTE.white); // 흰 심
        g.globalCompositeOperation = prevOp;
      } else if (p.shape === 'flash') {
        // 폭발 중심 섬광 — 급히 퍼지고 (1-t)²로 꺼진다. 겹칠수록 하얗게 탄다.
        if (p.life < 0) continue;
        const t2 = p.life / p.dur;
        const a = (1 - t2) * (1 - t2);
        const r = Math.max(1, p.r1 * (1 - (1 - t2) * (1 - t2) * (1 - t2)));  // 강한 감속 팽창
        const prevOp = g.globalCompositeOperation;
        g.globalCompositeOperation = 'lighter';
        const asp = p.aspect ?? 0.9;   // 1=원, 작을수록 가로로 길쭉 (관통 섬광)
        const disc = (mul, alpha, style) => {
          g.globalAlpha = a * alpha;
          g.fillStyle = style;
          g.beginPath();
          g.ellipse(p.x, p.y, r * mul, r * mul * asp, 0, 0, Math.PI * 2);
          g.fill();
        };
        disc(1.55, 0.18, p.color);                  // 번지는 후광
        disc(1.00, 0.45, p.color);                  // 몸통
        disc(0.45, 0.9, PALETTE.white);             // 흰 심
        g.globalCompositeOperation = prevOp;
      } else if (p.shape === 'shard') {
        // 튀는 빛 조각 — 진행 반대쪽으로 꼬리 3블록 (converge와 같은 문법, 방향만 반대)
        if (p.life < 0) continue;
        const sp = Math.hypot(p.vx ?? 0, p.vy ?? 0) || 1;
        const tx = -(p.vx ?? 0) / sp, ty = -(p.vy ?? 0) / sp;
        const prevOp = g.globalCompositeOperation;
        g.globalCompositeOperation = 'lighter';
        for (let k = 2; k >= 0; k--) {
          g.globalAlpha = q * (k === 0 ? 0.95 : 0.5 - k * 0.15);
          g.fillStyle = k === 0 ? PALETTE.white : p.color;
          const sz = Math.max(1, Math.round(p.size * (1 - k * 0.2)));
          g.fillRect(Math.round(p.x + tx * k * 5 - sz / 2), Math.round(p.y + ty * k * 5 - sz / 2), sz, sz);
        }
        g.globalCompositeOperation = prevOp;
      } else if (p.shape === 'twinkle') {
        // 십자 별빛 — sin 곡선으로 커졌다 작아진다. 겹치는 중심이 하얗게 탄다.
        if (p.life < 0) continue;
        const t2 = p.life / p.dur;
        const arm = Math.max(1, Math.round(p.size * Math.sin(Math.PI * t2)));
        const prevOp = g.globalCompositeOperation;
        g.globalCompositeOperation = 'lighter';
        const px2 = Math.round(p.x), py2 = Math.round(p.y);
        g.globalAlpha = 0.7;
        g.fillStyle = p.color;
        g.fillRect(px2 - arm, py2 - 1, arm * 2 + 1, 2);   // 가로 팔
        g.fillRect(px2 - 1, py2 - arm, 2, arm * 2 + 1);   // 세로 팔
        g.globalAlpha = 0.95;
        g.fillStyle = PALETTE.white;
        g.fillRect(px2 - 1, py2 - 1, 3, 3);               // 흰 심
        g.globalCompositeOperation = prevOp;
      } else if (p.shape === 'drop') {
        // 낙하 줄기 — 발광하는 세로 획. 아래끝(머리)이 희게 타고 위로 색 꼬리가 남는다.
        if (p.life < 0) continue;
        const prevOp = g.globalCompositeOperation;
        g.globalCompositeOperation = 'lighter';
        const x0 = Math.round(p.x - p.w / 2), y1 = Math.round(p.y);
        g.globalAlpha = q * 0.25;
        g.fillStyle = p.color;
        g.fillRect(x0 - 1, y1 - p.h, p.w + 2, p.h);       // 후광
        g.globalAlpha = q * 0.7;
        g.fillRect(x0, y1 - p.h, p.w, p.h);               // 몸통
        g.globalAlpha = q * 0.95;
        g.fillStyle = PALETTE.white;
        g.fillRect(x0, y1 - 5, p.w, 5);                   // 흰 머리
        g.globalCompositeOperation = prevOp;
      } else if (p.shape === 'converge') {
        // 빨려드는 빛 — 가까울수록 밝고, 중심 반대쪽으로 짧은 꼬리를 끈다
        if (p.life < 0) continue;
        const q2 = Math.max(0, Math.min(1, p.life / p.dur));
        const prevOp = g.globalCompositeOperation;
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = p.color;
        let tx = p.x0 - p.x, ty = p.y0 - p.y;
        const tm = Math.hypot(tx, ty) || 1;
        tx /= tm; ty /= tm;
        for (let k = 2; k >= 0; k--) {
          g.globalAlpha = (0.3 + q2 * 0.7) * (1 - k * 0.3);
          const sz = Math.max(2, Math.round(p.size * (0.6 + q2 * 0.7) * (1 - k * 0.25)));
          g.fillRect(Math.round(p.x + tx * k * 5 - sz / 2), Math.round(p.y + ty * k * 5 - sz / 2), sz, sz);
        }
        g.globalCompositeOperation = prevOp;
      } else if (p.shape === 'proj') {
        this.renderProjectile(g, p);
      } else if (p.shape === 'arc') {
        this.renderSlash(g, p);
      } else if (p.shape === 'glyph') {
        // 유닛보다 먼저 그리는 패스에서 이미 처리했다
      } else if (p.shape === 'beam') {
        // 솟아오르는 빛기둥 — 위로 갈수록 짧아지며 사라진다.
        // 굵은 기둥은 가운데에 흰 심을 넣어 발광하는 것처럼 보이게.
        const t = p.life / p.dur;
        const a = Math.max(0, (1 - t * t) * (t < 0.1 ? t / 0.1 : 1));
        const h = Math.max(1, Math.round(p.h * (1 - t * 0.45)));
        const x0 = Math.round(p.x - p.w / 2), y0 = Math.round(p.y - h);
        g.globalAlpha = a * 0.45;
        g.fillStyle = p.color;
        g.fillRect(x0 - 1, y0, p.w + 2, h);           // 번지는 후광
        g.globalAlpha = a;
        g.fillRect(x0, y0, p.w, h);
        if (p.core && p.w >= 3) {
          g.fillStyle = p.core;
          g.fillRect(x0 + ((p.w - 1) >> 1), y0, 1, h);  // 흰 심
        }
      }
    }
    g.globalAlpha = 1;

    for (const e of this.effects) this.renderEffect(g, e);

    // 터지는 순간의 화면 섬광 — 파티클 위에 얹는다
    if (this.cine && this.cine.flash > 0) {
      g.globalAlpha = (this.cine.flash / SACRED.flashDur) * SACRED.flashPeak;
      g.fillStyle = PALETTE.white;
      g.fillRect(-20, -20, 1000, 580);
      g.globalAlpha = 1;
    }
    g.restore();

    this.renderTopBar(g);
    this.renderBottomBar(g, game);
    if (this.phase === 'target' && this.preview) this.renderPreview(g);
    if (this.banner.t > 0 && !this.cine) this.renderBanner(g);   // 성물 컷인 중엔 배너 양보
    if (this.phase === 'result') this.renderResult(g, game);
    if (this.menu) this.renderMenu(g, game);
  }

  // 참격 궤적 — 칼이 지나간 초승달.
  // 후광 → 몸통 → 흰 심 세 겹을 **합성 모드 'lighter'** 로 겹쳐 그린다.
  // 겹칠수록 밝아지므로 가운데가 저절로 하얗게 타오르고 가장자리로 색이 번진다.
  // (회전 없이 픽셀 블록만 늘어놓아 픽셀아트를 유지 — 절대 규칙 7)
  // 초승달 발광 — 참격 궤적과 날아가는 검기가 공유한다.
  // base = 볼록한 면이 향하는 각도(라디안). drawn = 0~1, 호를 어디까지 그렸는지.
  arcGlow(g, { cx, cy, r, base, spread, thick, flat = 1, steps = 30, color, fade, drawn = 1 }) {
    if (fade <= 0) return;
    const last = Math.max(1, Math.round(steps * drawn));
    const prev = g.globalCompositeOperation;
    g.globalCompositeOperation = 'lighter';
    // [후광(넓고 옅게), 몸통, 흰 심(좁고 밝게)] 순서로 세 번 훑는다.
    // 겹칠수록 밝아지므로 가운데가 저절로 하얗게 타오르고 가장자리로 색이 번진다.
    const layers = [
      { mul: 1.75, alpha: 0.20, style: color },
      { mul: 1.00, alpha: 0.42, style: color },
      { mul: 0.40, alpha: 0.85, style: PALETTE.white },
    ];
    for (const L2 of layers) {
      g.fillStyle = L2.style;
      g.globalAlpha = fade * L2.alpha;
      for (let i = 0; i <= last; i++) {
        const s = i / steps;
        const taper = Math.pow(Math.sin(Math.PI * s), 0.65);       // 양끝이 뾰족한 초승달
        if (taper <= 0.03) continue;
        const ang = base + (-spread + s * spread * 2);
        const w = Math.max(1, Math.round(thick * taper * L2.mul));
        const px = Math.round(cx + Math.cos(ang) * r);
        const py = Math.round(cy + Math.sin(ang) * r * flat);
        g.fillRect(px - (w >> 1), py - (w >> 1), w, w);
      }
    }
    g.globalCompositeOperation = prev;
    g.globalAlpha = 1;
  }

  renderSlash(g, p) {
    const t = p.life / p.dur;
    this.arcGlow(g, {
      cx: p.cx, cy: p.cy,
      r: p.r * (1 + (p.grow - 1) * t),                              // 사라지며 퍼진다
      base: p.dir > 0 ? 0 : Math.PI,                                // 벤 방향으로 볼록
      spread: p.spread, thick: p.thick, flat: p.flat, steps: p.steps,
      color: p.color,
      fade: t < p.sweep ? 1 : 1 - (t - p.sweep) / (1 - p.sweep),
      drawn: Math.min(1, t / p.sweep),                              // 베어 나가는 진행
    });
  }

  // 바닥 마법진 — 발밑에 깔리므로 원근에 맞춰 세로로 눌린 타원으로 그린다.
  // 바깥 굵은 링 + 안쪽 가는 링 2개 + 천천히 도는 룬 눈금 12개.
  renderGlyph(g, p) {
    const t = p.life / p.dur;
    const r = p.r0 + (p.r1 - p.r0) * Math.min(1, t * 2.4);   // 빠르게 퍼졌다가
    const ry = r * 0.34;                                      // 바닥에 누운 비율
    const a = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;    // 켜졌다 서서히 꺼짐
    if (a <= 0) return;
    const ring = (rad, w, alpha, style) => {
      g.globalAlpha = Math.max(0, alpha);
      g.strokeStyle = style;
      g.lineWidth = w;
      g.beginPath(); g.ellipse(p.x, p.y, Math.max(1, rad), Math.max(1, rad * 0.34), 0, 0, Math.PI * 2); g.stroke();
    };
    // 바닥에 번지는 빛무리
    g.globalAlpha = a * 0.16;
    g.fillStyle = p.color;
    g.beginPath(); g.ellipse(p.x, p.y, r * 1.05, ry * 1.05, 0, 0, Math.PI * 2); g.fill();
    // 바깥 링 — 넓은 후광 + 굵은 몸통 + 흰 심 (발광하는 것처럼)
    ring(r, 9, a * 0.22, p.color);
    ring(r, 5, a, p.color);
    ring(r, 1, a * 0.9, PALETTE.white);
    // 안쪽 링 2개
    ring(r * 0.72, 3, a * 0.75, p.color);
    ring(r * 0.44, 2, a * 0.6, p.color);
    // 룬 눈금 — 천천히 도는 12개
    g.globalAlpha = a;
    g.fillStyle = PALETTE.white;
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2 + t * 1.5;
      g.fillRect(Math.round(p.x + Math.cos(ang) * r * 0.87) - 2, Math.round(p.y + Math.sin(ang) * ry * 0.87) - 1, 4, 3);
    }
    g.globalAlpha = 1;
  }

  // 투사체 그리기 — 진행 방향으로 픽셀 블록을 늘어놓아 몸통과 꼬리를 만든다.
  // 캔버스 회전(rotate)으로 그리면 안티에일리어싱이 생겨 픽셀아트와 어긋난다 (절대 규칙 7).
  renderProjectile(g, p) {
    const at = (s) => ({
      x: p.x0 + (p.x1 - p.x0) * s,
      y: p.y0 + (p.y1 - p.y0) * s + p.arc * 4 * s * (1 - s),
    });
    // 포물선이라 진행 방향은 경로의 접선 — 앞뒤 두 점으로 수치 미분한다
    const q = Math.min(1, p.life / p.dur);
    const a = at(Math.max(0, q - 0.02));
    const b = at(Math.min(1, q + 0.02));
    let dx = b.x - a.x, dy = b.y - a.y;
    const m = Math.hypot(dx, dy) || 1;
    dx /= m; dy /= m;

    // 검기는 블록 꼬리가 아니라 날아가는 초승달로 그린다 (참격 궤적과 같은 발광)
    if (p.crescent) {
      const C = p.crescent;
      const rr = C.r * (1 + ((C.grow ?? 1) - 1) * q);
      const base = Math.atan2(dy, dx);                       // 진행 방향으로 볼록
      this.arcGlow(g, {
        cx: p.x - dx * rr * 0.9, cy: p.y - dy * rr * 0.9,
        r: rr, base, spread: C.spread, thick: C.thick, flat: C.flat ?? 1,
        color: p.color, fade: 1,
      });
      return;
    }

    // ★프리렌더 스프라이트 투사체 (proj_sprites.js — 2026-08-05 고퀄화).
    //   오른쪽을 보게 구워져 있으므로 왼쪽으로 날면 좌우 반전만 한다 (회전 금지).
    //   밑에 'lighter' 발광 타원을 깔아 어두운 배경에서 빛나는 것처럼 보이게 한다.
    if (p.sprite) {
      const art = p.sprite === 'flame' ? flameFrames(p.colorKey, p.px)
        : p.sprite === 'energyArrowDown' ? energyArrowFrames(p.colorKey, p.px, 'down')
        : p.sprite === 'energyArrowUp' ? energyArrowFrames(p.colorKey, p.px, 'up')
        : energyArrowFrames(p.colorKey, p.px);
      const spr = art.frames[Math.floor(p.life * PROJ_ART.fps) % art.frames.length];
      if (p.sprite === 'energyArrowUp') {
        // 하늘로 솟는 발사 화살 (화살비 라이저) — 촉이 위, 머리가 p 위치
        g.globalAlpha = Math.min(1, (1 - p.life / p.dur) * 1.6);   // 끝에서 흐려지며 사라짐
        g.drawImage(spr, Math.round(p.x - art.w / 2), Math.round(p.y));
        g.globalAlpha = 1;
        return;
      }
      // 세로 화살은 반전이 없다 — 촉이 아래(진행 방향)를 향하게 구워져 있다
      if (p.sprite === 'energyArrowDown') {
        const prevOp2 = g.globalCompositeOperation;
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = PROJ_ART.glowAlpha;
        g.fillStyle = p.color;
        g.beginPath();
        g.ellipse(p.x, p.y, art.w * PROJ_ART.glowScale, art.w * PROJ_ART.glowScale * 1.6, 0, 0, Math.PI * 2);
        g.fill();
        g.globalCompositeOperation = prevOp2;
        g.globalAlpha = 1;
        g.drawImage(spr, Math.round(p.x - art.w / 2), Math.round(p.y - art.h * 0.8));
        return;
      }
      const flip = dx < 0;
      const prevOp = g.globalCompositeOperation;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = PROJ_ART.glowAlpha;
      g.fillStyle = p.color;
      g.beginPath();
      g.ellipse(p.x, p.y, art.h * PROJ_ART.glowScale * 1.6, art.h * PROJ_ART.glowScale, 0, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = prevOp;
      g.globalAlpha = 1;
      // 스프라이트의 머리(왼쪽에서 80% 지점)가 투사체 위치에 오게 놓는다 —
      // 경로 좌표는 "맞는 지점"이므로 머리가 거기 있어야 착탄이 맞아 보인다.
      const headAt = art.w * 0.8;
      const top = Math.round(p.y - art.h / 2);
      if (flip) {
        g.save();
        g.translate(Math.round(p.x), top);
        g.scale(-1, 1);
        g.drawImage(spr, -headAt, 0);    // 반전 좌표계에서 머리(x=headAt)가 원점에 온다
        g.restore();
      } else {
        g.drawImage(spr, Math.round(p.x - headAt), top);
      }
      return;
    }

    const steps = Math.max(2, Math.round(p.len / 4));
    for (let i = steps - 1; i >= 0; i--) {   // 뒤(꼬리)부터 그려 촉이 위로 오게
      const k = i / steps;
      g.globalAlpha = 1 - k * 0.8;
      g.fillStyle = i === 0 ? p.core : p.color;
      const s = Math.max(2, Math.round(p.thick * (1 - k * 0.55)));
      g.fillRect(Math.round(p.x - dx * i * 4 - s / 2), Math.round(p.y - dy * i * 4 - s / 2), s, s);
    }
    g.globalAlpha = 1;
  }

  // 달리기 프레임 (에셋에 walk가 있으면 그것을, 없으면 대기 프레임 교대)
  walkFrame(set, dir) {
    const w = set.walk?.[dir];
    if (w && w.length) return w[Math.floor(this.t * 9) % w.length];
    const idle = set.idle[dir];
    return idle[Math.floor(this.t * 10) % idle.length];
  }

  spriteFor(u) {
    const set = getSprites(u.spriteCfg, u.assetKey);
    const dir = u.side === 'ally' ? 'right' : 'left';
    const pb = this.playback;
    if (pb) {
      // 묶음 재생이므로 이 유닛이 관여하는 이벤트를 묶음 안에서 찾는다
      const step = pb.steps[pb.idx] ?? [];
      const find = (fn) => step.find(fn) ?? null;
      const atkEv = find((e) => (e.type === 'hit' || e.type === 'assist' || e.type === 'counter') && e.attacker === u.id);
      // 치유는 시전자가 시전 자세를 유지한다
      const isCastEv = !!find((e) => (e.type === 'skill' || e.type === 'heal') && e.caster === u.id);
      const hurtEv = find((e) => (e.type === 'hit' || e.type === 'assist' || e.type === 'counter' || e.type === 'dot') && e.target === u.id);
      const isAttackEv = !!atkEv;
      if (isAttackEv) {
        const p = pb.timer / this.eventDuration(atkEv);
        const ev = atkEv;
        const frames = set.attackFrames[dir];
        const at = (i) => frames[Math.min(i, frames.length - 1)];
        const st = this.timingFor(ev);
        if (st) {
          // ★하늘 사격(화살비·성궁): 시전자가 **상향 풀 드로우**(cast=attack_up)로
          //   하늘을 향해 쏜다 — 화살이 위에서 떨어지는 인과의 발사 쪽 반쪽.
          //   (원화가 없는 캐릭터는 cast가 attack0 대체라 저절로 무난하게 돌아간다)
          if (st.spec.sky) {
            if (p < st.impactAt) return set.cast[dir];
            return at(3);
          }
          // 원거리: 장전 → 풀 드로우 → 발사 순간 릴리즈 자세(비행 중 유지) → 착탄 후 잔심.
          // 화살이 그려진 프레임(풀 드로우)은 발사 **전**에만, 릴리즈(빈 시위)는 발사 **후**에만 —
          // 투사체와 손의 화살이 동시에 존재하면 모순이다 (궁수 패스에서 확정).
          // 돌진이 없으므로 복귀 달리기 프레임도 없다.
          if (p < st.releaseAt * 0.55) return at(0);
          if (p < st.releaseAt) return at(1);
          if (p < st.impactAt) return at(2);
          return at(3);
        }
        // 근접: 예비 → 스윙 → 임팩트 → 잔심 4프레임 스윙
        if (p < 0.2) return at(0);
        if (p < 0.42) return at(1);
        if (p < 0.62) return at(2);
        if (p < 0.78) return at(3);
        return this.walkFrame(set, dir);                      // 복귀 중 달리기
      }
      if (isCastEv) return set.cast[dir];
      if (hurtEv && pb.applied.has(hurtEv)) return set.hurt[dir];   // 맞은 직후 피격 자세
      // 이동 중(돌진)인 유닛도 달리기 프레임
      const d = this.displays.get(u.id);
      if (d && (Math.abs(d.ox) > 2 || Math.abs(d.oy) > 2)) return this.walkFrame(set, dir);
    }
    const phase = u.slot * 0.45 + (u.side === 'enemy' ? 0.9 : 0);
    const idle = set.idle[dir];
    return idle[Math.floor(this.t * 1.6 + phase) % idle.length];
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
    const usingAsset = !!getSprites(u.spriteCfg, u.assetKey).fromAsset;
    const size = SPRITE_BASE * SPRITE_SCALE;                 // 코드 생성본(정사각)
    g.globalAlpha = alpha;
    g.imageSmoothingEnabled = false;

    g.fillStyle = 'rgba(13, 11, 20, 0.55)';
    g.beginPath();
    g.ellipse(px, py, d.fade > 0 ? 26 : 34, 9, 0, 0, Math.PI * 2);
    g.fill();

    if (d.fade > 0) {
      // 전투불능: 쓰러진 전용 스프라이트 + 살짝 가라앉으며 페이드
      const q = 1 - d.fade / 0.4;
      const dir = u.side === 'ally' ? 'right' : 'left';
      const ds = getSprites(u.spriteCfg, u.assetKey).down[dir];
      // 에셋은 이미지 실제 크기 (창 등 긴 무기는 캔버스가 96보다 넓다) — 고해상도는 sprScale로 상쇄
      const fw = usingAsset ? ds.width * sprScale(ds, SPRITE_SCALE) : size;
      const fh = usingAsset ? ds.height * sprScale(ds, SPRITE_SCALE) : size;
      g.drawImage(ds, px - fw / 2, py - fh + 8 + q * 4, fw, fh);
      g.globalAlpha = 1;
      return;
    }

    const spr = this.spriteFor(u);
    const drawW = usingAsset ? spr.width * sprScale(spr, SPRITE_SCALE) : size;
    const drawH = usingAsset ? spr.height * sprScale(spr, SPRITE_SCALE) : size;
    // 찌그러짐 — 맞는 순간 발끝을 고정한 채 세로로 눌리고 가로로 퍼진다.
    // 정수배 원칙(규칙 7)의 유일한 예외: 0.14초의 과도 연출 (계획서 1부 7번).
    let dw = drawW, dh = drawH;
    if (d.squash > 0) {
      const q = d.squash / SQUASH.dur;
      dw = drawW * (1 + SQUASH.x * q);
      dh = drawH * (1 - SQUASH.y * q);
    }
    g.drawImage(spr, px - dw / 2, py - dh + 8, dw, dh);

    if (d.flash > 0) {
      g.globalAlpha = alpha * (d.flash / 0.18) * 0.8;
      g.globalCompositeOperation = 'lighter';
      g.drawImage(spr, px - dw / 2, py - dh + 8, dw, dh);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = alpha;
    }

    // 속성 점 + 보스 왕관
    g.fillStyle = ELEMENT_COLORS[u.element];
    g.fillRect(px + size / 2 - 16, py - size + 4, 8, 8);
    if (u.isBoss) drawTextOutlined(g, '★', px, py - size + 2, { size: 14, fill: PALETTE.gold, outline: PALETTE.black });

    // 여명 게이지 (성물 보유자) — HP바 위 금색 스트립. 만충 시 맥동
    if (u.sacredGauge !== null && u.sacredGauge !== undefined) {
      const gr = Math.min(1, u.sacredGauge / BALANCE.sacred.gaugeMax);
      g.fillStyle = PALETTE.black;
      g.fillRect(px - 30, py + 7, 60, 4);
      g.fillStyle = PALETTE.goldDark;
      g.fillRect(px - 29, py + 8, Math.round(58 * gr), 2);
      if (gr >= 1) {
        g.globalAlpha = alpha * (0.55 + 0.45 * Math.sin(this.t * 7));
        g.fillStyle = PALETTE.gold;
        g.fillRect(px - 29, py + 8, 58, 2);
        g.globalAlpha = alpha;
      }
    }

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
    // 턴·페이즈는 여기 왼쪽에. 예전엔 (940,440)이라 턴 종료 버튼 위에 겹쳐 찍혔다.
    const mine = this.statusLine.side === '아군';
    drawTextOutlined(g, `${this.statusLine.turn}턴 · ${this.statusLine.side} 페이즈`,
      16, 24, { size: 13, bold: true, align: 'left',
        fill: mine ? PALETTE.skyBlue : PALETTE.red, outline: PALETTE.black });
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
        const disabled = (skill && L.isBound(this.selected))
          || (r.id === 'item' && (this.battle.itemUses >= BALANCE.battleItems.maxUsesPerBattle
            || !this.consumableEntries(game).length));
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
        if (skill.kind === 'sacred') {
          const gg = Math.round((this.selected?.sacredGauge ?? 0) / BALANCE.sacred.gaugeMax * 100);
          drawText(g, gg >= 100 ? '여명 만충 — 해방 가능!' : `여명 ${gg}%`, r.x + 12, r.y + 64,
            { size: 10, fill: gg >= 100 ? PALETTE.gold : PALETTE.gray2 });
        } else {
          drawText(g, cd > 0 ? `쿨 ${cd}` : `쿨타임 ${nums.cool ?? 0}`, r.x + 12, r.y + 64, { size: 10, fill: cd > 0 ? PALETTE.red : PALETTE.gray2 });
        }
      });
    } else if (this.phase === 'itemSelect') {
      this.itemCardRects(game).forEach((r, i) => {
        const c = CONSUMABLES[r.id];
        const count = game.state.inventory.consumables[r.id] ?? 0;
        const on = inRect(game.input.mouse.x, game.input.mouse.y, r);
        g.fillStyle = on ? PALETTE.navy3 : 'rgba(28, 31, 58, 0.96)';
        g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = on ? PALETTE.gold : PALETTE.goldDark;
        g.lineWidth = 2;
        g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        drawText(g, `${i + 1}. ${c.name}`, r.x + 10, r.y + 22, { size: 12, bold: true, fill: PALETTE.white });
        drawText(g, describeConsumable(r.id), r.x + 10, r.y + 44, { size: 9, fill: PALETTE.gray3 });
        drawText(g, `보유 ${count}`, r.x + 10, r.y + 64, { size: 10, fill: PALETTE.green });
      });
      drawText(g, `이번 전투 사용 ${this.battle.itemUses}/${BALANCE.battleItems.maxUsesPerBattle} · 숫자키/클릭 선택 · ESC 뒤로`,
        480, 444, { size: 10, fill: PALETTE.gray3, align: 'center' });
    } else if (this.phase === 'itemTarget') {
      drawText(g, `${CONSUMABLES[this.pendingItem].name} — 대상 아군 선택 (←→ 전환 · Enter 사용 · ESC 취소)`,
        480, 500, { size: 13, fill: PALETTE.gray3, align: 'center' });
      if (this.hoverTarget) {
        const ta = anchorOf(this.hoverTarget);
        g.fillStyle = PALETTE.green;
        g.beginPath();
        g.moveTo(ta.x, ta.y - 104);
        g.lineTo(ta.x - 8, ta.y - 118);
        g.lineTo(ta.x + 8, ta.y - 118);
        g.closePath();
        g.fill();
      }
    } else if (this.phase === 'target') {
      const skill = SKILLS[this.pendingSkill];
      const msg = this.needPrimary(skill)
        ? '대상 선택 (←→ 전환 · Enter 발동 · ESC 취소)'
        : '클릭 또는 Enter로 발동 · ESC 취소';
      drawText(g, `${skill.name} — ${msg}`, 480, 500, { size: 13, fill: PALETTE.gray3, align: 'center' });
    } else if (this.phase === 'select') {
      drawText(g, '아군 선택 · [T]턴 종료 · [Q]오토 · [D]배속', 480, 520, { size: 11, fill: PALETTE.gray2, align: 'center' });
    }

    if (this.phase !== 'anim' && this.phase !== 'result' && this.phase !== 'skillSelect' && this.phase !== 'itemSelect') {
      for (const r of this.toggleRects()) {
        const active = (r.id === 'auto' && this.auto) || (r.id === 'speed' && this.speed === 2);
        const on = inRect(game.input.mouse.x, game.input.mouse.y, r);
        g.fillStyle = active ? PALETTE.navy3 : on ? PALETTE.navy3 : PALETTE.navy2;
        g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = active ? PALETTE.gold : on ? PALETTE.gold : PALETTE.navy3;
        g.lineWidth = 2;
        g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        drawText(g, r.label, r.x + r.w / 2, r.y + 24, { size: 12, fill: active || on ? PALETTE.gold : PALETTE.gray4, align: 'center' });
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
    // 턴·페이즈 표시는 상단 바로 옮겼다 (여기 두면 턴 종료 버튼과 겹친다)
  }

  renderPreview(g) {
    const pv = this.preview;
    const rows = [];
    for (const t of pv.perTarget.slice(0, 6)) {
      // ☠에 (협)을 붙여 "협공까지 합쳐야 죽는다"를 구분해 보여준다
      if (t.dmg !== undefined) rows.push([t.unit.name, `${t.dmg}${t.kill ? (t.killByAssist ? ' ☠(협)' : ' ☠') : ''}`]);
      else if (t.heal !== undefined) rows.push([t.unit.name, `+${t.heal}`]);
      else if (t.shieldGain !== undefined) rows.push([t.unit.name, `막 ${t.shieldGain}`]);
      else rows.push([t.unit.name, '—']);
    }
    // 확정 치명은 확률로 쓰지 않는다 (기획서 §6: "치명 100%"가 아니라 확정 표기)
    if (pv.forcedCrit) rows.push(['치명 확정', `${pv.perTarget[0]?.critDmg ?? ''}`]);
    else if (pv.critChance > 0) rows.push([`치명 ${Math.round(pv.critChance * 100)}%`, `${pv.perTarget[0]?.critDmg ?? ''}`]);
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
    drawPanel(g, 240, 84, 480, 378);
    const win = this.result === 'ally';
    drawTextOutlined(g, win ? '승리!' : '패배...', 480, 128, {
      size: 34, bold: true, fill: win ? PALETTE.gold : PALETTE.purple, outline: PALETTE.black,
    });
    if (win) {
      const stars = '★'.repeat(this.stars) + '☆'.repeat(3 - this.stars);
      drawTextOutlined(g, stars, 480, 164, { size: 26, fill: PALETTE.gold, outline: PALETTE.black });
      const conds = [
        '클리어',
        this.battle.allyDeaths === 0 ? '전투불능 없음' : `전투불능 ${this.battle.allyDeaths}회`,
        `${this.battle.starTurns}턴 이내`,
      ];
      drawText(g, `${conds.join(' · ')}  ·  ${this.battle.turn}턴 소요`, 480, 186, { size: 11, fill: PALETTE.gray3, align: 'center' });
    } else {
      drawText(g, `패배해도 잃는 것은 없습니다. 다시!  ·  ${this.battle.turn}턴 소요`, 480, 168, { size: 12, fill: PALETTE.gray3, align: 'center' });
    }

    // ----- 보상 (승리 + 실제 플레이만) -----
    let y = win ? 206 : 186;
    if (this.xpReport) {
      const rewards = [`경험치 +${this.xpReport.xp}`];
      if (this.dropReport?.stones) rewards.push(`강화석 +${this.dropReport.stones}`);
      drawText(g, '보상', 480, y, { size: 11, bold: true, fill: PALETTE.goldDark, align: 'center' });
      drawText(g, rewards.join('   '), 480, y + 18, { size: 12, fill: PALETTE.skyBlue, align: 'center' });
      y += 34;
      if (this.dropReport?.item) {
        const it = this.dropReport.item;
        drawTextOutlined(g, `획득!  ${EQ.displayName(it)}`, 480, y, {
          size: 12, fill: PALETTE[GRADES[it.grade].color] ?? PALETTE.white, outline: PALETTE.black, align: 'center',
        });
        y += 18;
      }
    }

    // ----- 파티 전투 기록: 초상 · 이름 · 레벨(업 강조) · 딜 바 -----
    const rows = this.statsReport ?? [];
    if (rows.length) {
      g.strokeStyle = PALETTE.navy3;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(262, y + 4); g.lineTo(698, y + 4); g.stroke();
      const maxDmg = Math.max(1, ...rows.map((r) => r.dmg));
      let ry = y + 14;
      const rowH = Math.min(34, Math.floor((396 - ry) / rows.length));   // 버튼(408) 위에서 안전
      for (const row of rows) {
        const u = row.unit;
        // 초상: 스프라이트 중앙부 세로 크롭 (에셋 폭이 제각각이라 상자에 맞춰 자른다)
        const spr = getSprites(u.spriteCfg, u.assetKey).idle.right[0];
        const srcW = Math.min(spr.width, spr.height * 0.75);
        g.imageSmoothingEnabled = false;
        const ph = rowH - 6;
        g.drawImage(spr, (spr.width - srcW) / 2, 0, srcW, spr.height, 262, ry + 2, Math.round(srcW / spr.height * ph), ph);
        if (!u.alive) {   // 전투불능은 흐리게 + 표시
          g.fillStyle = 'rgba(13, 11, 20, 0.55)';
          g.fillRect(262, ry + 2, Math.round(srcW / spr.height * ph), ph);
        }
        drawText(g, row.name, 296, ry + rowH / 2 + 4, { size: 12, bold: true, fill: u.alive ? PALETTE.white : PALETTE.gray2 });
        // 레벨 — 오른 캐릭터는 금색 화살표로 강조
        if (row.up) {
          drawTextOutlined(g, `Lv${row.up.from}→${row.up.to} ▲`, 402, ry + rowH / 2 + 4, { size: 11, bold: true, fill: PALETTE.gold, outline: PALETTE.black, align: 'left' });
        } else {
          drawText(g, `Lv${row.lv}`, 402, ry + rowH / 2 + 4, { size: 11, fill: PALETTE.gray3 });
        }
        // 딜 바 (최고 딜 기준 비율)
        const barX = 470, barW = 168, barH = 10;
        const by = ry + rowH / 2 - barH / 2 + 1;
        g.fillStyle = PALETTE.navy1;
        g.fillRect(barX, by, barW, barH);
        const w = Math.round(barW * (row.dmg / maxDmg));
        if (w > 0) {
          g.fillStyle = row.dmg === maxDmg ? PALETTE.gold : PALETTE.blue;
          g.fillRect(barX, by, w, barH);
        }
        g.strokeStyle = PALETTE.navy3;
        g.strokeRect(barX + 0.5, by + 0.5, barW - 1, barH - 1);
        drawText(g, String(row.dmg), 698, ry + rowH / 2 + 4, { size: 12, bold: true, fill: row.dmg === maxDmg ? PALETTE.gold : PALETTE.gray4, align: 'right' });
        ry += rowH;
      }
      drawText(g, '가한 피해', 470, y, { size: 9, fill: PALETTE.gray2 });
    }

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
