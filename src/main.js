// ============================================================
// main.js — 게임 루프·씬 매니저 (기획서 §17)
// 고정 타임스텝(60Hz) 업데이트 + requestAnimationFrame 렌더.
// 기준 해상도 960×540, 정수배 스케일링 (절대 규칙 7).
// ============================================================

import { Input } from './core/input.js';
import { AudioSystem } from './core/audio.js';
import { loadSettings } from './core/save.js';
import { PALETTE, drawText, drawPanel, loadAssetSprites } from './core/sprites.js';
import { SPRITE_ASSETS } from './data/sprite_assets.js';
import { TitleScene } from './scenes/title.js';
import { SettingsScene } from './scenes/settings.js';
import { PlaceholderScene } from './scenes/placeholder.js';
import { BaseScene } from './scenes/base.js';
import { GachaScene } from './scenes/gacha.js';
import { PartyScene } from './scenes/party.js';
import { GrowthScene } from './scenes/growth.js';
import { SmithScene } from './scenes/smith.js';
import { ShopScene } from './scenes/shop.js';
import { CampScene } from './scenes/camp.js';
import { BattleScene } from './scenes/battle.js';
import { FieldScene } from './scenes/field.js';
import { DevConsole } from './dev/console.js';
import { mapCanvas, waterFrames, hiddenOpenTile, loadTileSheets } from './core/tiles.js';
import { loadFieldSheets, loadFieldFiles } from './core/field_sprites.js';
import { MAPS } from './data/maps.js';

// 필드 자산 예열 — 타일 변형 생성 + 맵 통짜 프리렌더 (절대 규칙 7)
function warmFieldAssets() {
  const bake = () => {
    waterFrames();
    hiddenOpenTile();
    for (const map of Object.values(MAPS)) mapCanvas(map);
  };
  bake();                                  // 먼저 코드 생성본으로 굽는다 (게임이 안 멈춘다)
  // 등록된 타일 그림이 있으면 도착한 뒤 캐시를 비우고 다시 굽는다.
  // 전투 스프라이트가 손그림을 기다리는 방식과 같다 — 로드 전에는 코드 생성본이 보인다.
  loadTileSheets(bake);
  loadFieldSheets();   // 필드 캐릭터 시트
  loadFieldFiles();    // 필드 캐릭터 낱장 원화 (전투와 같은 방식)
}

const BASE_W = 960;
const BASE_H = 540;
const STEP = 1 / 60;
const FADE_DURATION = 0.15;

class Game {
  constructor() {
    this.version = 'v0.1.0 — M1';
    this.canvas = document.getElementById('game');
    this.g = this.canvas.getContext('2d');
    this.g.imageSmoothingEnabled = false;

    this.settings = loadSettings();
    this.audio = new AudioSystem(this.settings);
    this.input = new Input(this.canvas, BASE_W, BASE_H);
    this.input.delegate = this;
    this.dev = new DevConsole();

    this.scenes = {
      title: new TitleScene(),
      settings: new SettingsScene(),
      placeholder: new PlaceholderScene(),
      base: new BaseScene(),
      gacha: new GachaScene(),
      party: new PartyScene(),
      growth: new GrowthScene(),
      smith: new SmithScene(),
      shop: new ShopScene(),
      camp: new CampScene(),
      battle: new BattleScene(),
      field: new FieldScene(),
    };
    this.scene = null;
    this.sceneName = null;

    // 게임 상태 (씬 간 공유)
    this.state = null;
    this.currentSlot = null;

    this.toast = null;                                  // { text, t }
    this.fade = { active: false, phase: 'in', alpha: 0, next: null };
    this.fps = 0;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.acc = 0;
    this.last = performance.now();

    this.applyScale();
    window.addEventListener('resize', () => this.applyScale());

    // 캔버스 fillText는 @font-face 로드를 자동으로 트리거하지 않으므로 명시적으로 로드한다.
    // 매 프레임 다시 그리므로 로드 완료 즉시 다음 프레임부터 픽셀 폰트가 적용된다.
    if (document.fonts && document.fonts.load) {
      Promise.allSettled([
        document.fonts.load('11px Galmuri11'),
        document.fonts.load('bold 11px Galmuri11'),
        document.fonts.load('18px Galmuri9'),
      ]);
    }

    // 손그림 스프라이트 미리 로드 — 전투 진입 시 바로 보이도록.
    // 로드 전에는 코드 생성본이 대신 표시되므로 게임은 멈추지 않는다.
    for (const [key, asset] of Object.entries(SPRITE_ASSETS)) loadAssetSprites(key, asset);

    // 필드 타일·맵은 첫 진입에서 만들면 600ms 가까이 멈춘다. 로드 때 미리 구워 둔다.
    // (스프라이트 에셋과 같은 이유 — 게임이 멈추는 지점을 로딩 쪽으로 몰아 둔다)
    warmFieldAssets();

    this.setScene('title');
    this.fade = { active: true, phase: 'in', alpha: 1, next: null };

    requestAnimationFrame((now) => this.tick(now));
  }

  // ----- 스케일링 -----

  applyScale() {
    const setting = this.settings.screenScale;
    const availW = window.innerWidth;
    const availH = window.innerHeight;
    // 창에 들어가는 최대 정수배 (창이 960×540 미만이면 0)
    const maxFit = Math.min(Math.floor(availW / BASE_W), Math.floor(availH / BASE_H));
    let scale;
    if (setting === 'auto') {
      scale = Math.max(1, maxFit);
    } else {
      // 수동 배율이 창을 초과하면 최대 정수배로 클램프 — 비정수 축소 금지 (절대 규칙 7)
      scale = Math.max(1, Math.min(setting, Math.max(1, maxFit)));
    }
    let cssW = BASE_W * scale;
    let cssH = BASE_H * scale;
    // 1배도 안 들어가는 작은 창에서만 비율 유지 축소 허용 (정수배 예외 — DECISIONS.md 참고)
    const fit = Math.min(availW / cssW, availH / cssH, 1);
    if (fit < 1) {
      cssW = Math.floor(cssW * fit);
      cssH = Math.floor(cssH * fit);
    }
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
  }

  setCursor(cursor) {
    if (this.canvas.style.cursor !== cursor) this.canvas.style.cursor = cursor;
  }

  // ----- 씬 관리 -----

  setScene(name, params = {}) {
    if (this.scene) this.scene.exit(this);
    this.sceneName = name;
    this.scene = this.scenes[name];
    this.scene.enter(this, params);
    this.setCursor('default');
  }

  // 페이드 아웃 → 전환 → 페이드 인. 페이드 중 요청은 드랍하지 않고 목적지를 교체한다
  changeScene(name, params = {}) {
    if (this.fade.active) {
      this.fade.next = { name, params };
      if (this.fade.phase === 'in') this.fade.phase = 'out';
      return;
    }
    this.fade = { active: true, phase: 'out', alpha: 0, next: { name, params } };
  }

  showToast(text) {
    this.toast = { text, t: 2.5 };
  }

  // ----- 루프 -----

  tick(now) {
    const rawDt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;

    this.fpsTime += rawDt;
    if (this.fpsTime >= 0.5) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    this.acc += rawDt;
    let steps = 0;
    while (this.acc >= STEP && steps < 5) {
      this.update(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === 5) this.acc = 0; // 죽음의 나선 방지

    // 로직은 60Hz 고정 — 갱신이 있었던 프레임에만 그린다 (고주사율 모니터에서 동일 화면 중복 그리기 방지)
    if (steps > 0) {
      this.render();
      this.fpsFrames++; // FPS 표시 = 실제 게임 프레임 (목표 60)
    }
    requestAnimationFrame((n) => this.tick(n));
  }

  update(dt) {
    if (this.fade.active) {
      const speed = 1 / FADE_DURATION;
      if (this.fade.phase === 'out') {
        this.fade.alpha += dt * speed;
        if (this.fade.alpha >= 1) {
          this.fade.alpha = 1;
          const { name, params } = this.fade.next;
          this.setScene(name, params);
          this.fade.phase = 'in';
          this.fade.next = null;
        }
      } else {
        this.fade.alpha -= dt * speed;
        if (this.fade.alpha <= 0) {
          this.fade.alpha = 0;
          this.fade.active = false;
        }
      }
    }

    if (this.toast) {
      this.toast.t -= dt;
      if (this.toast.t <= 0) this.toast = null;
    }

    // 플레이 시간은 게임플레이 씬(isGameplay)에서 일괄 누적 — 씬별 중복 구현 금지
    if (this.state && this.scene.isGameplay) {
      this.state.playTimeSec += dt;
    }

    this.scene.update(dt, this);
  }

  render() {
    const g = this.g;
    g.fillStyle = PALETTE.black;
    g.fillRect(0, 0, BASE_W, BASE_H);

    this.scene.render(g, this);

    if (this.toast) {
      const alpha = Math.min(1, this.toast.t / 0.4);
      g.globalAlpha = alpha;
      const w = Math.max(260, this.toast.text.length * 18 + 60); // 토스트 폰트는 18px 티어로 렌더됨
      drawPanel(g, 480 - w / 2, 486, w, 36, { border: PALETTE.goldDark });
      drawText(g, this.toast.text, 480, 510, { size: 14, fill: PALETTE.white, align: 'center' });
      g.globalAlpha = 1;
    }

    this.dev.render(g, this);

    if (this.fade.alpha > 0) {
      g.globalAlpha = this.fade.alpha;
      g.fillStyle = PALETTE.black;
      g.fillRect(0, 0, BASE_W, BASE_H);
      g.globalAlpha = 1;
    }
  }

  // ----- 입력 위임 (Input → 개발 콘솔 → 씬) -----

  onKeyDown(code) {
    this.audio.unlock();
    if (this.dev.handleKey(code, this)) return;
    if (this.fade.active) return;
    this.scene.onKeyDown(code, this);
  }

  onMouseMove(x, y) {
    if (this.dev.open) { this.dev.onMouseMove(x, y, this); return; }
    if (this.fade.active) return;
    this.scene.onMouseMove(x, y, this);
  }

  onMouseDown(x, y, button) {
    this.audio.unlock();
    if (this.dev.open) { this.dev.onMouseDown(x, y, button, this); return; }
    if (this.fade.active) return;
    this.scene.onMouseDown(x, y, button, this);
  }

  onWheel(x, y, dy) {
    if (this.dev.onWheel(x, y, dy, this)) return;
    if (this.fade.active) return;
    if (this.scene.onWheel) this.scene.onWheel(x, y, dy, this);
  }
}

// 개발용 전역 훅 — 치트 콘솔·자동 검증에서 사용 (기획서 §14 디버그 치트)
window.__eldia = new Game();
