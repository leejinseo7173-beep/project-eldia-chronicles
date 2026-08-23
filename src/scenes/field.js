// ============================================================
// field.js — 필드 탐험 씬 (기획서 §13, M4)
//
// 탑다운 자유 이동. 요소: 채집(시간 리젠) / 상자(1회성) / 심볼 인카운터(회피 가능) /
// 숨김길 / NPC / 정령 제단 / 맵 출구.
//
// 조작 (절대 규칙 8 — 마우스만으로도, 키보드만으로도 전부 된다):
//   키보드: WASD·방향키 이동 / E·Space 상호작용 / Tab 가까운 목표로 시선 / ESC 메뉴
//   마우스: 좌클릭 유지 = 커서 쪽으로 이동 / 상호작용 대상 클릭 = 상호작용 / 우클릭 = 취소
//
// 진행 상태(연 상자·채집 쿨·발견한 숨김길)는 game.state.field에 남아 세이브를 탄다.
// 시간 기준은 실시간이 아니라 **누적 플레이 시간**이다 — 저장하고 껐다 켜도 일관된다.
// ============================================================

import { Scene } from './scene.js';
import { PALETTE, drawText, drawTextOutlined, drawPanel } from '../core/sprites.js';
import { makeFieldSprites } from '../core/field_sprites.js';
import { mapCanvas, waterTiles, waterFrames, hiddenOpenTile, isSolid, tileAt, objectArt, WATER_FRAME_SEC } from '../core/tiles.js';
import { MAPS, MAP_W, MAP_H, TILE, validateMaps } from '../data/maps.js';
import { STAGES } from '../data/stages.js';
import { ENEMIES } from '../data/enemies.js';
import { CHARACTERS, HERO_KITS } from '../data/characters.js';
import { BALANCE } from '../balance.js';
import { RNG } from '../core/rng.js';
import { inRect } from '../core/input.js';

const VIEW_W = 960, VIEW_H = 540;
const MAP_PX_W = MAP_W * TILE, MAP_PX_H = MAP_H * TILE;

// 플레이어 충돌 상자 — 발치만 본다. 머리까지 막으면 나무 사이를 못 지나 답답하다.
const FOOT_W = 16, FOOT_H = 12;

const DIR_VEC = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

// 걷기 프레임 = 나아간 거리 / (한 사이클 거리 ÷ 프레임 수).
// 시간 기준으로 넘기면 이동 속도와 발 딛는 리듬이 어긋나 미끄러져 보인다.
// 프레임 수가 몇 장이든 한 사이클에 나아가는 거리는 같으므로,
// 원화를 4장에서 16장으로 늘려도 보폭이 그대로 유지된다.
function walkFrame(dist, n) {
  if (n <= 1) return 0;
  const per = BALANCE.field.strideCyclePx / n;
  return Math.floor(dist / per) % n;
}

export class FieldScene extends Scene {
  constructor() {
    super();
    this.isGameplay = true;
  }

  // ----- 진입 -----

  enter(game, params = {}) {
    // 맵 데이터는 손으로 쓴 문자 격자다. 어긋난 채로 들어가면 원인 모를 버그가 되므로
    // 진입 시 한 번 검사하고, 문제가 있으면 개발 중에 바로 보이게 토스트로 알린다.
    const problems = validateMaps();
    if (problems.length) {
      console.error('[field] 맵 데이터 문제:', problems);
      game.showToast(`맵 데이터 오류 ${problems.length}건 — 콘솔 확인`);
    }

    if (!game.state) game.state = { playTimeSec: 0 };
    this.prog = ensureFieldState(game.state);

    const mapId = params.mapId ?? this.prog.map ?? 'dawn_plain';
    this.map = MAPS[mapId];
    this.prog.map = mapId;

    const spawn = params.spawn
      ?? (params.mapId ? this.map.spawn : { x: this.prog.x, y: this.prog.y });
    this.player = {
      x: spawn.x * TILE + TILE / 2,
      y: spawn.y * TILE + TILE / 2,
      dir: 'down', walkT: 0, walkDist: 0, moving: false,
    };

    this.bg = mapCanvas(this.map);
    this.water = waterTiles(this.map);
    this.cam = { x: 0, y: 0 };
    this.clampCamera();

    this.t = 0;
    this.dialog = null;      // { name, lines, idx }
    this.menu = null;        // ESC 일시정지
    this.toastT = 0;
    this.prompt = null;      // 상호작용 후보
    this.moveTarget = null;  // 마우스로 향하는 지점
    this.pendingBattle = null;

    this.heroSprites = makeFieldSprites(heroCfg(game), `hero_${game.state?.heroClass ?? CHARACTERS.hero?.heroClass ?? 'sword'}`);
    this.buildRuntime(game);

    // 전투에서 돌아온 경우 — 이긴 심볼을 없애고, 잠깐 아무도 안 쫓게 한다
    this.grace = 0;
    if (params.defeatedSymbol) {
      this.markSymbolDefeated(game, params.defeatedSymbol);
      this.grace = BALANCE.field.symbol.graceSec;
    }

    game.input.clearHeld();  // 전투에서 누르던 키가 넘어와 혼자 걷는 걸 막는다
  }

  exit(game) {
    this.saveProgress(game);
  }

  // 맵의 오브젝트를 런타임 상태로 펼친다 (심볼은 움직이므로 좌표를 따로 갖는다)
  buildRuntime(game) {
    const now = game.state.playTimeSec ?? 0;
    const F = BALANCE.field;
    this.objects = [];
    for (const o of this.map.objects) {
      const key = `${this.map.id}:${o.x},${o.y}`;
      const base = {
        def: o, type: o.type, key,
        x: o.x * TILE + TILE / 2,
        y: o.y * TILE + TILE / 2,
      };
      if (o.type === 'symbol') {
        const killedAt = this.prog.symbols[key];
        if (killedAt !== undefined && now - killedAt < F.symbolRegenSec) continue;  // 아직 리젠 전
        const stage = STAGES[o.stageId];
        const leadId = stage?.enemies?.[0]?.enemyId;
        const def = ENEMIES[leadId];
        this.objects.push({
          ...base,
          zone: (this.map.dangerZones ?? []).find((z) =>
            o.x >= z.x && o.x < z.x + z.w && o.y >= z.y && o.y < z.y + z.h) ?? null,
          home: { x: base.x, y: base.y },
          state: 'patrol', chaseT: 0,
          dir: 'down', walkT: 0, walkDist: 0,
          vx: 0, vy: 0,
          rng: new RNG(`sym-${key}`),
          nextTurn: 0,
          sprites: def ? makeFieldSprites(def.spriteCfg, leadId) : this.heroSprites,
          name: def?.name ?? '적',
        });
        continue;
      }
      if (o.type === 'chest' && this.prog.chests[o.id]) continue;               // 이미 연 상자
      if (o.type === 'gather') {
        const at = this.prog.gather[key];
        base.depleted = at !== undefined && now - at < F.gatherRegenSec;
      }
      if (o.hidden && !this.isHiddenFound(o)) {
        // 숨김길을 아직 못 찾았으면 그 너머 물건도 안 보인다
        base.concealed = true;
      }
      this.objects.push(base);
    }
  }

  isHiddenFound(o) {
    const list = this.prog.hidden[this.map.id] ?? [];
    return list.length > 0;   // 이 맵의 숨김길을 하나라도 찾았으면 공개 (맵당 1개 설계)
  }

  // ----- 세이브 -----

  saveProgress(game) {
    if (!this.prog) return;
    this.prog.map = this.map.id;
    this.prog.x = Math.round((this.player.x - TILE / 2) / TILE);
    this.prog.y = Math.round((this.player.y - TILE / 2) / TILE);
  }

  // ----- 갱신 -----

  update(dt, game) {
    this.t += dt;
    if (this.toastT > 0) this.toastT -= dt;
    if (this.menu || this.dialog) return;    // 대화·메뉴 중에는 세계가 멈춘다

    this.updatePlayer(dt, game);
    this.updateSymbols(dt, game);
    this.clampCamera();
    this.prompt = this.findInteractable();
  }

  updatePlayer(dt, game) {
    const F = BALANCE.field;
    const inp = game.input;
    let dx = 0, dy = 0;
    if (inp.down('KeyA', 'ArrowLeft')) dx -= 1;
    if (inp.down('KeyD', 'ArrowRight')) dx += 1;
    if (inp.down('KeyW', 'ArrowUp')) dy -= 1;
    if (inp.down('KeyS', 'ArrowDown')) dy += 1;

    // 마우스 유지 = 커서 쪽으로. 키 입력이 있으면 키가 이긴다 (동시 입력 시 혼란 방지)
    if (!dx && !dy && inp.mouseHeld) {
      const tx = inp.mouse.x + this.cam.x, ty = inp.mouse.y + this.cam.y;
      const ax = tx - this.player.x, ay = ty - this.player.y;
      if (Math.hypot(ax, ay) > 6) { dx = ax; dy = ay; }
    }

    const len = Math.hypot(dx, dy);
    this.player.moving = len > 0;
    if (!len) { this.player.walkT = 0; return; }   // 멈추면 중립 자세로
    dx /= len; dy /= len;                                   // 대각선도 같은 속도

    // 바라보는 방향 — 더 크게 움직인 축을 따른다
    this.player.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    this.player.walkT += dt;

    const step = F.moveSpeed * dt;
    // 축을 따로 밀어야 벽에 비스듬히 부딪혔을 때 미끄러진다
    const px0 = this.player.x, py0 = this.player.y;
    this.moveAxis(dx * step, 0);
    this.moveAxis(0, dy * step);
    // ★걷기 프레임은 **실제로 나아간 거리**로 넘긴다.
    //   벽에 막혀 안 움직이면 발도 안 움직인다 (제자리 걸음이 안 생긴다).
    this.player.walkDist += Math.hypot(this.player.x - px0, this.player.y - py0);
    this.checkHiddenStep(game);
    this.checkExit(game);
  }

  moveAxis(dx, dy) {
    const nx = this.player.x + dx, ny = this.player.y + dy;
    if (!this.blocked(nx, ny)) { this.player.x = nx; this.player.y = ny; return; }
    // 막혔으면 벽에 딱 붙을 때까지만 (모서리에 걸려 멈추는 느낌 방지)
    const steps = 4;
    for (let i = steps - 1; i > 0; i--) {
      const tx = this.player.x + dx * (i / steps), ty = this.player.y + dy * (i / steps);
      if (!this.blocked(tx, ty)) { this.player.x = tx; this.player.y = ty; return; }
    }
  }

  blocked(cx, cy) {
    const half = FOOT_W / 2;
    const top = cy + TILE / 2 - FOOT_H, bot = cy + TILE / 2 - 1;
    for (const [px, py] of [[cx - half, top], [cx + half - 1, top], [cx - half, bot], [cx + half - 1, bot]]) {
      if (isSolid(this.map, Math.floor(px / TILE), Math.floor(py / TILE))) return true;
    }
    return false;
  }

  // 숨김길을 밟았는가 — 밟는 순간 드러나고 기록된다
  checkHiddenStep(game) {
    const tx = Math.floor(this.player.x / TILE);
    const ty = Math.floor((this.player.y + TILE / 2 - 6) / TILE);
    const t = tileAt(this.map, tx, ty);
    if (!t?.disguise) return;
    const list = this.prog.hidden[this.map.id] ?? (this.prog.hidden[this.map.id] = []);
    const key = `${tx},${ty}`;
    if (list.includes(key)) return;
    list.push(key);
    this.revealT = BALANCE.field.hiddenRevealSec;
    this.toast(game, '숨겨진 길을 발견했다!', 'gold');
    game.audio.playSE('victory');
    this.buildRuntime(game);   // 숨겨져 있던 상자가 보이게
  }

  checkExit(game) {
    const tx = Math.floor(this.player.x / TILE);
    const ty = Math.floor((this.player.y + TILE / 2 - 6) / TILE);
    for (const o of this.objects) {
      if (o.type !== 'exit') continue;
      if (o.def.x !== tx || o.def.y !== ty) continue;
      this.useExit(game, o.def);
      return;
    }
  }

  useExit(game, def) {
    this.saveProgress(game);
    game.audio.playSE('confirm');
    if (def.to === 'base') { game.changeScene('base'); return; }
    game.changeScene('field', { mapId: def.to, spawn: def.spawn ?? MAPS[def.to].spawn });
  }

  // ----- 심볼 인카운터 -----
  // 보이는 적이 다가온다. 플레이어(140)보다 느려서(110) 달리면 뿌리칠 수 있다 —
  // 그래야 "회피 가능"(기획서 §13)이 성립한다.
  updateSymbols(dt, game) {
    const S = BALANCE.field.symbol;
    if (this.grace > 0) this.grace -= dt;
    for (const s of this.objects) {
      if (s.type !== 'symbol') continue;
      const dx = this.player.x - s.x, dy = this.player.y - s.y;
      const dist = Math.hypot(dx, dy);

      // 유예 중에는 접촉해도 전투가 안 걸린다 — 복귀 지점에 심볼이 붙어 있어도
      // 빠져나갈 시간을 준다 (사용자 피드백: 조금 움직이면 전투가 연달아 터짐)
      if (this.grace <= 0 && dist <= S.touchRange
          && this.zoneAt(this.player.x, this.player.y) === s.zone) {
        this.startEncounter(game, s); return;
      }

      if (s.state === 'chase') s.chaseT += dt;

      // ★구간 밖으로는 절대 안 쫓아 나온다. 이게 "안전한 길"을 보장하는 규칙이다.
      const playerInZone = this.zoneAt(this.player.x, this.player.y) === s.zone;

      if (s.state === 'patrol' && this.grace <= 0 && playerInZone && this.spots(s, dx, dy, dist)) {
        s.state = 'chase'; s.chaseT = 0;
        game.audio.playSE('debuff');          // 들켰다는 소리 — 화면을 안 보고 있어도 안다
      } else if (s.state === 'chase' && (!playerInZone || dist > S.loseRange || s.chaseT > S.chaseMaxSec)) {
        s.state = 'return';
      } else if (s.state === 'return' && Math.hypot(s.home.x - s.x, s.home.y - s.y) < 8) {
        s.state = 'patrol';
      }

      let vx = 0, vy = 0, speed = S.patrolSpeed;
      if (s.state === 'chase') {
        speed = S.chaseSpeed;
        vx = dx / (dist || 1); vy = dy / (dist || 1);
      } else if (s.state === 'return') {
        const hx = s.home.x - s.x, hy = s.home.y - s.y;
        const hd = Math.hypot(hx, hy) || 1;
        vx = hx / hd; vy = hy / hd;
      } else {
        // 배회: 일정 시간마다 방향을 새로 뽑고, 집에서 너무 멀어지면 되돌아본다
        s.nextTurn -= dt;
        if (s.nextTurn <= 0) {
          s.nextTurn = 1.2 + s.rng.int(0, 12) / 10;
          const away = Math.hypot(s.x - s.home.x, s.y - s.home.y);
          if (away > S.patrolRadius) {
            const hx = s.home.x - s.x, hy = s.home.y - s.y, hd = Math.hypot(hx, hy) || 1;
            s.vx = hx / hd; s.vy = hy / hd;
          } else {
            const a = s.rng.int(0, 7) * (Math.PI / 4);
            s.vx = Math.cos(a); s.vy = Math.sin(a);
          }
        }
        vx = s.vx; vy = s.vy;
      }

      if (vx || vy) {
        s.dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up');
        s.walkT += dt;
        const ox = s.x, oy = s.y;
        this.moveSymbol(s, vx * speed * dt, vy * speed * dt);
        s.walkDist = (s.walkDist ?? 0) + Math.hypot(s.x - ox, s.y - oy);
      }
    }
  }

  // 이 픽셀 좌표가 속한 위험 구간 (없으면 null = 안전)
  zoneAt(px, py) {
    const tx = Math.floor(px / TILE), ty = Math.floor((py + TILE / 2 - 6) / TILE);
    for (const z of this.map.dangerZones ?? []) {
      if (tx >= z.x && tx < z.x + z.w && ty >= z.y && ty < z.y + z.h) return z;
    }
    return null;
  }

  // 심볼을 자기 구간 안에 가둔다 — 밖으로 흘러나오면 안전한 길이 안전하지 않게 된다
  clampToZone(s, x, y) {
    const z = s.zone;
    if (!z) return { x, y };
    const minX = z.x * TILE + TILE / 2, maxX = (z.x + z.w - 1) * TILE + TILE / 2;
    const minY = z.y * TILE + TILE / 2, maxY = (z.y + z.h - 1) * TILE + TILE / 2;
    return { x: Math.max(minX, Math.min(maxX, x)), y: Math.max(minY, Math.min(maxY, y)) };
  }

  // 심볼이 플레이어를 봤는가.
  // 사방 반경으로 잡으면 등 뒤에서 다가가도 걸려서 "보고 피한다"가 성립하지 않는다.
  // 정면 시야각 안이거나, 각도와 무관하게 바로 옆(nearRange)일 때만 들킨다.
  spots(s, dx, dy, dist) {
    const S = BALANCE.field.symbol;
    if (dist <= S.nearRange) return true;
    if (dist > S.sightRange) return false;
    const [fx, fy] = DIR_VEC[s.dir];
    const dot = (dx * fx + dy * fy) / (dist || 1);
    return dot >= Math.cos((S.sightAngle / 2) * Math.PI / 180);
  }

  moveSymbol(s, dx, dy) {
    const solid = (cx, cy) => {
      const half = FOOT_W / 2;
      const top = cy + TILE / 2 - FOOT_H, bot = cy + TILE / 2 - 1;
      return [[cx - half, top], [cx + half - 1, top], [cx - half, bot], [cx + half - 1, bot]]
        .some(([px, py]) => isSolid(this.map, Math.floor(px / TILE), Math.floor(py / TILE)));
    };
    const nx = this.clampToZone(s, s.x + dx, s.y);
    if (nx.x !== s.x && !solid(nx.x, s.y)) s.x = nx.x; else s.vx = -s.vx;
    const ny = this.clampToZone(s, s.x, s.y + dy);
    if (ny.y !== s.y && !solid(s.x, ny.y)) s.y = ny.y; else s.vy = -s.vy;
  }

  startEncounter(game, s) {
    // 기습(뒤에서 닿으면 선공/피습)은 전투 로직이 '적 페이즈로 시작'을 지원해야 성립한다.
    // M4 범위 밖이라 판정만 남겨 두지 않고 아예 넣지 않았다 — 읽는 곳 없는 파라미터는
    // 나중에 "이미 되는 줄" 착각하게 만든다. (DECISIONS.md 2026-08-03)
    this.saveProgress(game);
    game.audio.playSE('error');
    game.changeScene('battle', {
      stageId: s.def.stageId,
      partyIds: game.state?.partyIds,
      from: 'field',
      fieldReturn: { symbolKey: s.key },
    });
  }

  markSymbolDefeated(game, key) {
    this.prog.symbols[key] = game.state.playTimeSec ?? 0;
    this.buildRuntime(game);
  }

  // ----- 상호작용 -----

  findInteractable() {
    const R = BALANCE.field.interactRange;
    let best = null, bestD = Infinity;
    for (const o of this.objects) {
      if (o.type === 'symbol' || o.type === 'exit' || o.concealed) continue;
      if (o.type === 'gather' && o.depleted) continue;
      const d = Math.hypot(o.x - this.player.x, o.y - this.player.y);
      if (d < R && d < bestD) { best = o; bestD = d; }
    }
    return best;
  }

  interact(game, o) {
    if (!o) return;
    const now = game.state.playTimeSec ?? 0;
    const rng = new RNG(`fx-${o.key}-${Math.floor(now)}`);
    const F = BALANCE.field;
    if (o.type === 'gather') {
      const n = rng.int(F.gatherYield.min, F.gatherYield.max);
      this.prog.resources[o.def.item] = (this.prog.resources[o.def.item] ?? 0) + n;
      this.prog.gather[o.key] = now;
      o.depleted = true;
      game.audio.playSE('confirm');
      this.toast(game, `${o.def.name} ×${n}`, 'green');
    } else if (o.type === 'chest') {
      const gold = rng.int(F.chestGold.min, F.chestGold.max);
      this.prog.gold += gold;
      this.prog.chests[o.def.id] = true;
      this.objects = this.objects.filter((x) => x !== o);
      game.audio.playSE('victory');
      this.toast(game, `상자를 열었다 — 골드 ${gold}`, 'gold');
    } else if (o.type === 'npc' || o.type === 'altar') {
      this.dialog = { name: o.def.name, lines: o.def.lines, idx: 0 };
      game.audio.playSE('confirm');
    }
  }

  toast(game, text, color = 'white') {
    this.toastMsg = { text, color: PALETTE[color] ?? PALETTE.white };
    this.toastT = 2.2;
  }

  // ----- 카메라 -----

  clampCamera() {
    const cx = this.player.x - VIEW_W / 2;
    const cy = this.player.y - VIEW_H / 2;
    this.cam.x = Math.round(Math.max(0, Math.min(MAP_PX_W - VIEW_W, cx)));
    this.cam.y = Math.round(Math.max(0, Math.min(MAP_PX_H - VIEW_H, cy)));
  }

  // ----- 입력 -----

  onKeyDown(code, game) {
    if (this.menu) { this.menuKey(code, game); return; }
    if (this.dialog) {
      if (code === 'Enter' || code === 'Space' || code === 'KeyE' || code === 'Escape') this.advanceDialog(game);
      return;
    }
    if (code === 'Escape') { this.openMenu(game); return; }
    if (code === 'KeyE' || code === 'Space' || code === 'Enter') { this.interact(game, this.prompt); return; }
  }

  onMouseDown(x, y, button, game) {
    if (this.menu) { this.menuMouse(x, y, button, game); return; }
    if (this.dialog) { this.advanceDialog(game); return; }
    if (button === 2) { this.openMenu(game); return; }
    if (button !== 0) return;
    // 상호작용 대상을 직접 클릭했고 사정거리 안이면 상호작용
    const wx = x + this.cam.x, wy = y + this.cam.y;
    for (const o of this.objects) {
      if (o.type === 'symbol' || o.type === 'exit' || o.concealed) continue;
      if (o.type === 'gather' && o.depleted) continue;
      if (Math.abs(o.x - wx) > TILE / 2 || Math.abs(o.y - wy) > TILE / 2) continue;
      if (Math.hypot(o.x - this.player.x, o.y - this.player.y) < BALANCE.field.interactRange) {
        this.interact(game, o);
        return;
      }
    }
  }

  advanceDialog(game) {
    this.dialog.idx++;
    if (this.dialog.idx >= this.dialog.lines.length) this.dialog = null;
    else game.audio.playSE('move');
  }

  // ----- ESC 일시정지 메뉴 -----
  // 전투와 같은 구조: 씬을 바꾸지 않고 오버레이로 띄우고 update를 멈춘다.
  // 설정 항목은 SettingsScene의 정의를 그대로 빌려 쓴다 (두 군데 정의하면 반드시 어긋난다).

  openMenu(game) { this.menu = { page: 'main', sel: 0 }; game.audio.playSE('confirm'); game.input.clearHeld(); }

  menuItems(game) {
    if (this.menu.page === 'settings') return game.scenes.settings.items(game);
    return [
      { label: '계속하기', run: () => { this.menu = null; } },
      { label: '설정', run: () => { this.menu = { page: 'settings', sel: 0 }; } },
      { label: '거점으로 돌아가기', run: (g) => { this.saveProgress(g); g.changeScene('base'); } },
      { label: '타이틀로', run: (g) => { this.saveProgress(g); g.changeScene('title'); } },
    ];
  }

  menuRowRect(i) { return { x: 320, y: 168 + i * 46, w: 320, h: 38 }; }

  menuKey(code, game) {
    const items = this.menuItems(game);
    if (code === 'Escape') {
      if (this.menu.page === 'settings') this.menu = { page: 'main', sel: 1 };
      else this.menu = null;
      game.audio.playSE('cancel');
      return;
    }
    if (code === 'ArrowUp') { this.menu.sel = (this.menu.sel - 1 + items.length) % items.length; game.audio.playSE('move'); }
    else if (code === 'ArrowDown') { this.menu.sel = (this.menu.sel + 1) % items.length; game.audio.playSE('move'); }
    else if (code === 'Enter' || code === 'Space') {
      const it = items[this.menu.sel];
      if (it.run) { game.audio.playSE('confirm'); it.run(game); }
      else if (it.next) { game.audio.playSE('move'); it.next(game); }
    } else if (code === 'ArrowLeft' && items[this.menu.sel].prev) { game.audio.playSE('move'); items[this.menu.sel].prev(game); }
    else if (code === 'ArrowRight' && items[this.menu.sel].next) { game.audio.playSE('move'); items[this.menu.sel].next(game); }
  }

  menuMouse(x, y, button, game) {
    if (button === 2) { this.menuKey('Escape', game); return; }
    const items = this.menuItems(game);
    for (let i = 0; i < items.length; i++) {
      if (!inRect(x, y, this.menuRowRect(i))) continue;
      this.menu.sel = i;
      const it = items[i];
      if (it.run) { game.audio.playSE('confirm'); it.run(game); }
      else if (it.next) { game.audio.playSE('move'); it.next(game); }
      return;
    }
  }

  // ----- 렌더 -----

  render(g, game) {
    const cx = this.cam.x, cy = this.cam.y;
    g.imageSmoothingEnabled = false;
    // 맵은 통짜 프리렌더에서 카메라 사각형만 잘라 온다 (drawImage 1회)
    g.drawImage(this.bg, cx, cy, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);

    // 물결 — 굽지 않고 매 프레임 덧그린다 (보이는 것만, 많아야 40장)
    const wf = waterFrames()[Math.floor(this.t / WATER_FRAME_SEC) % waterFrames().length];
    for (const [tx, ty] of this.water) {
      const sx = tx * TILE - cx, sy = ty * TILE - cy;
      if (sx < -TILE || sx > VIEW_W || sy < -TILE || sy > VIEW_H) continue;
      g.drawImage(wf, sx, sy);
    }
    // ★위험 구간 — 어디가 위험한지 **보여야** 피할 수 있다.
    //   옅은 어둠 + 점선 테두리. 지형을 가리지 않을 만큼만 깔고 경계를 또렷하게 한다.
    for (const z of this.map.dangerZones ?? []) {
      const zx = z.x * TILE - cx, zy = z.y * TILE - cy;
      const zw = z.w * TILE, zh = z.h * TILE;
      if (zx > VIEW_W || zy > VIEW_H || zx + zw < 0 || zy + zh < 0) continue;
      g.fillStyle = 'rgba(74, 46, 107, 0.26)';       // purpleDark 계열 — 마왕군 색
      g.fillRect(zx, zy, zw, zh);
      g.fillStyle = PALETTE.purple;
      const dash = 8;
      for (let x = 0; x < zw; x += dash * 2) {
        g.fillRect(zx + x, zy, Math.min(dash, zw - x), 2);
        g.fillRect(zx + x, zy + zh - 2, Math.min(dash, zw - x), 2);
      }
      for (let y = 0; y < zh; y += dash * 2) {
        g.fillRect(zx, zy + y, 2, Math.min(dash, zh - y));
        g.fillRect(zx + zw - 2, zy + y, 2, Math.min(dash, zh - y));
      }
    }

    // 드러난 숨김길
    const found = this.prog.hidden[this.map.id] ?? [];
    for (const k of found) {
      const [hx, hy] = k.split(',').map(Number);
      g.drawImage(hiddenOpenTile(), hx * TILE - cx, hy * TILE - cy);
    }

    // 오브젝트·플레이어를 y 순으로 (앞의 것이 뒤를 가린다)
    const drawables = [];
    for (const o of this.objects) {
      if (o.concealed || o.type === 'exit') continue;
      drawables.push({ y: o.y, draw: () => this.drawObject(g, o, cx, cy) });
    }
    drawables.push({ y: this.player.y, draw: () => this.drawPlayer(g, cx, cy) });
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    // 출구 표시는 지형 위에 항상
    for (const o of this.objects) if (o.type === 'exit') this.drawExit(g, o, cx, cy);

    this.renderHud(g, game);
    if (this.dialog) this.renderDialog(g);
    if (this.menu) this.renderMenu(g, game);
  }

  // 스프라이트를 **발끝 기준**으로 그린다.
  // 32×32 칸에 맞춘 픽셀 스프라이트든, 그보다 큰 손그림이든 같은 규칙으로 서게 된다
  // (손그림은 키가 커도 위로만 자란다 — 발 위치가 안 흔들려야 걷는 게 자연스럽다).
  drawUnitSprite(g, set, dir, frame, wx, wy, cx, cy) {
    const list = set[dir];
    const spr = list[frame % list.length];
    const m = set.meta;
    const w = spr.width, h = spr.height;
    const footY = m?.footY ?? h;              // 그림 안에서 발끝이 놓인 y (없으면 맨 아래)
    const x = Math.round(wx - w / 2 - cx);
    const y = Math.round(wy + TILE / 2 - footY - cy);
    g.drawImage(spr, x, y);
  }

  drawPlayer(g, cx, cy) {
    const set = this.heroSprites;
    const dir = this.player.dir;
    // 멈추면 '선 자세' 프레임으로 돌아간다. 0번은 다리가 가장 벌어진 순간이라
    // 그대로 멈추면 걸음을 얼어붙힌 것처럼 보인다 (등록표의 idleFrame 참고).
    const f = this.player.moving
      ? walkFrame(this.player.walkDist, set[dir].length)
      : (set.meta?.idleFrame?.[dir] ?? 0);
    this.drawUnitSprite(g, set, dir, f, this.player.x, this.player.y, cx, cy);
  }

  drawObject(g, o, cx, cy) {
    const sx = Math.round(o.x - TILE / 2 - cx), sy = Math.round(o.y - TILE / 2 - cy);
    if (sx < -TILE || sx > VIEW_W || sy < -TILE || sy > VIEW_H) return;
    const bob = Math.sin(this.t * 2.4 + o.x * 0.05) * 1.5;

    if (o.type === 'symbol') {
      const n = o.sprites[o.dir].length;
      const f = walkFrame(o.walkDist ?? 0, n);
      this.drawUnitSprite(g, o.sprites, o.dir, f, o.x, o.y, cx, cy);
      // 머리 위 표시 — 들켰는지 뿌리쳤는지를 즉시 알려야 "보고 피한다"가 성립한다
      if (o.state === 'chase') {
        drawTextOutlined(g, '!', sx + TILE / 2, sy - 2 + bob, { size: 16, bold: true, fill: PALETTE.red, outline: PALETTE.black });
      } else if (o.state === 'return') {
        drawTextOutlined(g, '?', sx + TILE / 2, sy - 2 + bob, { size: 14, bold: true, fill: PALETTE.gray4, outline: PALETTE.black });
      }
      return;
    }
    if (o.type === 'gather') {
      if (o.depleted) g.globalAlpha = 0.35;
      const art = objectArt(`gather_${o.def.item}`);
      if (art) g.drawImage(art, sx, Math.round(sy)); else drawGatherIcon(g, sx, sy, o.def.item);
      g.globalAlpha = 1;
      return;
    }
    if (o.type === 'chest') {
      const art = objectArt('chest');
      if (art) g.drawImage(art, sx, Math.round(sy + bob * 0.4)); else drawChest(g, sx, sy + bob * 0.4);
      return;
    }
    if (o.type === 'npc') {
      drawNpc(g, sx, sy, o.def.name);
      return;
    }
    if (o.type === 'altar') { drawAltar(g, sx, sy, this.t); return; }
  }

  drawExit(g, o, cx, cy) {
    const sx = Math.round(o.x - TILE / 2 - cx), sy = Math.round(o.y - TILE / 2 - cy);
    if (sx < -TILE || sx > VIEW_W || sy < -TILE || sy > VIEW_H) return;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
    g.globalAlpha = 0.35 + pulse * 0.35;
    g.fillStyle = PALETTE.gold;
    g.fillRect(sx + 2, sy + 2, TILE - 4, TILE - 4);
    g.globalAlpha = 1;
    drawTextOutlined(g, '▶', sx + TILE / 2, sy + TILE / 2 + 5, { size: 14, fill: PALETTE.white, outline: PALETTE.black });
    // 가까이 가면 어디로 가는지 알려준다
    if (Math.hypot(o.x - this.player.x, o.y - this.player.y) < TILE * 2.2) {
      drawTextOutlined(g, o.def.label, sx + TILE / 2, sy - 6, { size: 12, fill: PALETTE.gold, outline: PALETTE.black });
    }
  }

  renderHud(g, game) {
    // 맵 이름 + 지금 서 있는 구간 (안전한지 아닌지가 한눈에 읽혀야 한다)
    drawTextOutlined(g, this.map.name, 16, 26, { size: 15, bold: true, align: 'left', fill: PALETTE.gold, outline: PALETTE.black });
    const z = this.zoneAt(this.player.x, this.player.y);
    drawTextOutlined(g, z ? `⚠ ${z.name}` : '안전 지대', 16, 48,
      { size: 12, bold: true, align: 'left', fill: z ? PALETTE.red : PALETTE.teal, outline: PALETTE.black });
    // 소지 자원
    const r = this.prog.resources;
    const txt = `골드 ${this.prog.gold}   들풀 ${r.herb ?? 0}   나무 ${r.wood ?? 0}   돌 ${r.stone ?? 0}`;
    drawTextOutlined(g, txt, 944, 26, { size: 12, align: 'right', fill: PALETTE.gray4, outline: PALETTE.black });

    // 상호작용 안내
    if (this.prompt) {
      const label = this.prompt.type === 'gather' ? `${this.prompt.def.name} 채집`
        : this.prompt.type === 'chest' ? '상자 열기'
          : this.prompt.type === 'altar' ? `${this.prompt.def.name} 살펴보기`
            : `${this.prompt.def.name}와 대화`;
      const w = Math.max(220, label.length * 14 + 90);
      drawPanel(g, 480 - w / 2, 452, w, 34);
      drawText(g, `${label}   [E]`, 480, 474, { size: 13, align: 'center', fill: PALETTE.white });
    }

    // 조작 안내 (하단 왼쪽, 옅게)
    drawTextOutlined(g, 'WASD 이동 · E 상호작용 · ESC 메뉴', 16, 526, { size: 11, align: 'left', fill: PALETTE.gray2, outline: PALETTE.black });

    if (this.toastT > 0 && this.toastMsg) {
      const a = Math.min(1, this.toastT / 0.4);
      g.globalAlpha = a;
      drawTextOutlined(g, this.toastMsg.text, 480, 96, { size: 18, bold: true, fill: this.toastMsg.color, outline: PALETTE.black });
      g.globalAlpha = 1;
    }
  }

  renderDialog(g) {
    drawPanel(g, 60, 380, 840, 130);
    drawText(g, this.dialog.name, 86, 412, { size: 16, bold: true, fill: PALETTE.gold });
    drawText(g, this.dialog.lines[this.dialog.idx], 86, 452, { size: 14, fill: PALETTE.white });
    const more = this.dialog.idx < this.dialog.lines.length - 1;
    drawText(g, more ? '▼ 계속  [Space]' : '▼ 닫기  [Space]', 874, 492, { size: 11, align: 'right', fill: PALETTE.gray3 });
  }

  renderMenu(g, game) {
    const items = this.menuItems(game);
    const settings = this.menu.page === 'settings';
    g.fillStyle = 'rgba(6, 5, 12, 0.78)';
    g.fillRect(0, 0, 960, 540);
    drawPanel(g, 300, 104, 360, 116 + items.length * 46);
    drawText(g, settings ? '설정' : '일시정지', 480, 146, { size: 20, bold: true, fill: PALETTE.gold, align: 'center' });
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const r = this.menuRowRect(i);
      const sel = this.menu.sel === i;
      g.fillStyle = sel ? PALETTE.navy3 : PALETTE.navy1;
      g.fillRect(r.x, r.y, r.w, r.h);
      drawText(g, it.label, r.x + 16, r.y + 25, { size: 14, fill: sel ? PALETTE.gold : PALETTE.gray4 });
      if (it.value) drawText(g, it.value(game), r.x + r.w - 16, r.y + 25, { size: 14, align: 'right', fill: PALETTE.white });
    }
    drawText(g, settings ? 'ESC 뒤로' : 'ESC 닫기', 480, 168 + items.length * 46 + 24, { size: 11, align: 'center', fill: PALETTE.gray2 });
  }
}

// ----- 오브젝트 아이콘 (코드 생성, 32×32 자리에 직접) -----

function drawGatherIcon(g, x, y, item) {
  if (item === 'wood') {
    g.fillStyle = PALETTE.brownDark; g.fillRect(x + 12, y + 14, 8, 14);
    g.fillStyle = PALETTE.brown; g.fillRect(x + 12, y + 14, 3, 14);
    g.fillStyle = PALETTE.forest;
    for (const [ox, oy] of [[6, 10], [18, 12], [10, 6]]) g.fillRect(x + ox, y + oy, 8, 5);
  } else if (item === 'stone') {
    g.fillStyle = PALETTE.gray1; g.fillRect(x + 8, y + 18, 16, 10);
    g.fillStyle = PALETTE.gray2; g.fillRect(x + 10, y + 14, 12, 6);
    g.fillStyle = PALETTE.gray3; g.fillRect(x + 12, y + 15, 5, 2);
  } else {
    g.fillStyle = PALETTE.greenDark; g.fillRect(x + 14, y + 18, 3, 10);
    g.fillStyle = PALETTE.green;
    for (const [ox, oy, w, h] of [[8, 14, 8, 4], [17, 12, 8, 4], [11, 9, 10, 4]]) g.fillRect(x + ox, y + oy, w, h);
    g.fillStyle = PALETTE.teal; g.fillRect(x + 13, y + 8, 4, 3);
  }
}

function drawChest(g, x, y) {
  g.fillStyle = PALETTE.brownDark; g.fillRect(x + 6, y + 14, 20, 14);
  g.fillStyle = PALETTE.brown; g.fillRect(x + 6, y + 14, 20, 5);
  g.fillStyle = PALETTE.goldDark; g.fillRect(x + 6, y + 18, 20, 2);
  g.fillStyle = PALETTE.gold; g.fillRect(x + 14, y + 18, 4, 6);
  g.fillStyle = PALETTE.black; g.fillRect(x + 6, y + 27, 20, 2);
}

function drawNpc(g, x, y, name) {
  // NPC는 단순 실루엣 — 개별 외형은 M6 VN 초상에서
  g.fillStyle = PALETTE.navy2; g.fillRect(x + 10, y + 14, 12, 14);
  g.fillStyle = PALETTE.tan; g.fillRect(x + 11, y + 6, 10, 9);
  g.fillStyle = PALETTE.brownDark; g.fillRect(x + 10, y + 5, 12, 4);
  g.fillStyle = PALETTE.black; g.fillRect(x + 13, y + 10, 2, 2); g.fillRect(x + 18, y + 10, 2, 2);
  g.fillStyle = PALETTE.goldDark; g.fillRect(x + 10, y + 18, 12, 1);
  drawTextOutlined(g, name, x + 16, y - 2, { size: 11, fill: PALETTE.skyBlue, outline: PALETTE.black });
}

function drawAltar(g, x, y, t) {
  g.fillStyle = PALETTE.gray1; g.fillRect(x + 4, y + 20, 24, 9);
  g.fillStyle = PALETTE.gray2; g.fillRect(x + 8, y + 6, 16, 15);
  g.fillStyle = PALETTE.gray3; g.fillRect(x + 10, y + 8, 4, 11);
  g.fillStyle = PALETTE.forest;
  for (const [ox, oy] of [[9, 16], [20, 13], [12, 10]]) g.fillRect(x + ox, y + oy, 4, 2);
  // 정령 기운 — 아직 잠들어 있어 옅다
  const a = 0.25 + 0.2 * Math.sin(t * 1.6);
  g.globalAlpha = a;
  g.fillStyle = PALETTE.cyan;
  g.fillRect(x + 13, y + 2 - Math.sin(t * 1.2) * 2, 6, 6);
  g.globalAlpha = 1;
}

// ----- 상태 -----

function ensureFieldState(state) {
  if (!state.field) {
    state.field = {
      map: 'dawn_plain', x: MAPS.dawn_plain.spawn.x, y: MAPS.dawn_plain.spawn.y,
      chests: {}, hidden: {}, gather: {}, symbols: {},
      resources: { herb: 0, wood: 0, stone: 0 },
      gold: 0,
    };
  }
  // 옛 세이브 보정 — 없는 키를 채운다 (필드가 M4에서 추가됐다)
  const f = state.field;
  f.chests ??= {}; f.hidden ??= {}; f.gather ??= {}; f.symbols ??= {};
  f.resources ??= { herb: 0, wood: 0, stone: 0 };
  f.gold ??= 0;
  return f;
}

// 주인공의 외형은 캐릭터 정의가 아니라 **직업 킷**에 있다 (logic.js가 전투에서 쓰는 것과 같은 규칙).
// 직업을 아직 안 골랐으면(M6 새 게임 흐름 전) 검사로 본다.
function heroCfg(game) {
  const cls = game.state?.heroClass ?? CHARACTERS.hero?.heroClass ?? 'sword';
  return HERO_KITS[cls]?.spriteCfg ?? HERO_KITS.sword.spriteCfg;
}
