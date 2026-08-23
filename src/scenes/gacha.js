// ============================================================
// gacha.js(씬) — 소환 제단: 뽑기 화면 (기획서 §9·§12, M5-2)
//
// 수집형 가챠 문법 그대로: 배너 → 소환 → 소환진 발광·나선 수렴 → 등급색
// 방사 섬광(★3 금색 대폭발+흔들림) → 카드 순차 플립 → 결과 그리드.
// 고퀄 패스(사용자 요청 2026-08-06): 성운 배경·육망성 소환진·빛기둥·
// 카드 프레임 리디자인(광택 스윕·픽셀 별·★3 맥동)·장식 버튼.
//
// 로직은 core/gacha.js(순수 모듈) — 이 씬은 연출과 입력만 (규칙 4).
// 무거운 그림(성운·소환진 바닥·카드 프레임)은 전부 프리렌더 (규칙 7).
// 초상은 전투 스프라이트 생성기 재사용 — 원화가 오면 그쪽이 우선.
// ============================================================

import { Scene } from './scene.js';
import { inRect } from '../core/input.js';
import { RNG } from '../core/rng.js';
import { PALETTE, ELEMENT_COLORS, prerender, drawText, drawTextOutlined, drawPanel, makeUnitSprites, sprScale } from '../core/sprites.js';
import { CHARACTERS } from '../data/characters.js';
import { ELEMENT_LABELS } from '../data/strings.js';
import { BALANCE } from '../balance.js';
import * as GA from '../core/gacha.js';
import { ILLUSTS } from '../data/illust_assets.js';

const W = 960, H = 540;
const CX = 480, CY = 330;          // 소환진 중심
const GRADE_COLOR = { 1: PALETTE.gray3, 2: PALETTE.skyBlue, 3: PALETTE.gold };
const GRADE_NAME = { 1: '★', 2: '★★', 3: '★★★' };
const CLASS_LABELS = {
  knight: '기사', warrior: '전사', thief: '도적',
  mage: '마법사', cleric: '성직자', archer: '궁수',
};
const CAST_DUR = 1.25;
const FLASH_DUR = 0.5;

export class GachaScene extends Scene {
  constructor() {
    super();
    this.isGameplay = true;
  }

  enter(game) {
    this.t = 0;
    this.mode = 'idle';          // idle | cast | flash | reveal
    this.results = null;
    this.revealed = 0;
    this.flipT = 0;
    this.best = 1;
    this.shake = 0;
    this.particles = [];
    this.meteor = null;          // 가끔 흐르는 별똥별
    this.mouse = { x: -1, y: -1 };
    this.cut = null;               // ★3 단독 컷신 상태 { r, t }
    GA.ensureGacha(game.state);
    this.loadIllusts();
  }

  // 일러 로드 — 없으면 스프라이트 폴백 (등록표: data/illust_assets.js)
  loadIllusts() {
    this._il = this._il ?? new Map();
    for (const [id, url] of Object.entries(ILLUSTS)) {
      if (this._il.has(id)) continue;
      const img = new Image();
      const entry = { img, ready: false };
      img.onload = () => { entry.ready = true; this._ilCrop = new Map(); };
      img.onerror = () => {};
      img.src = url;
      this._il.set(id, entry);
    }
  }

  // 상반신 크롭 캔버스 (카드 초상 칸 크기별 캐시).
  // 잉크 bbox를 재서 머리~가슴(top 52%)을 cover-fit — 일러는 픽셀 원화라
  // 축소는 부드럽게(smoothing ON) 해야 모레(모아레)가 안 생긴다.
  bustCrop(id, w, h, tall) {
    const e = this._il?.get(id);
    if (!e?.ready) return null;
    this._ilCrop = this._ilCrop ?? new Map();
    const key = `${id}:${w}x${h}:${tall === 'full' ? 2 : tall ? 1 : 0}`;
    if (this._ilCrop.has(key)) return this._ilCrop.get(key);
    const img = e.img;
    if (!e.bbox) {
      const mc = document.createElement('canvas');
      const scale = 200 / img.height;
      mc.width = Math.max(1, Math.round(img.width * scale));
      mc.height = 200;
      const mg = mc.getContext('2d');
      mg.drawImage(img, 0, 0, mc.width, mc.height);
      const d = mg.getImageData(0, 0, mc.width, mc.height).data;
      let l = mc.width, r = 0, t = mc.height, b = 0;
      for (let y = 0; y < mc.height; y++) {
        for (let x = 0; x < mc.width; x++) {
          const i = (y * mc.width + x) * 4;
          if (d[i] < 245 || d[i + 1] < 245 || d[i + 2] < 245) {
            if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
          }
        }
      }
      const inv = 1 / scale;
      e.bbox = { x: l * inv, y: t * inv, w: (r - l + 1) * inv, h: (b - t + 1) * inv };
    }
    const bb = e.bbox;
    // 카드가 크면(단챠) 몸통까지, 작으면(그리드) 머리~가슴
    const srcH = bb.h * (tall === 'full' ? 1 : tall ? 0.78 : 0.52);
    const srcW = tall === 'full' ? bb.w : Math.min(bb.w, srcH * (w / h));
    const sx = bb.x + (bb.w - srcW) / 2;
    const sy = bb.y;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    if (tall === 'full') {
      const fit = Math.min(w / srcW, h / srcH);
      const dw = Math.round(srcW * fit), dh = Math.round(srcH * fit);
      g.drawImage(e.img, sx, sy, srcW, srcH, Math.round((w - dw) / 2), h - dh, dw, dh);
    } else {
      g.drawImage(e.img, sx, sy, srcW, srcH, 0, 0, w, h);
    }
    // 순백 배경 → 투명 — 카드의 등급 후광 위에 인물만 얹힌다
    const idata = g.getImageData(0, 0, w, h);
    const d = idata.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) d[i + 3] = 0;
    }
    g.putImageData(idata, 0, 0);
    this._ilCrop.set(key, c);
    return c;
  }

  portrait(id) {
    this._por = this._por ?? new Map();
    if (!this._por.has(id)) {
      this._por.set(id, makeUnitSprites(CHARACTERS[id].spriteCfg).idle.right[0]);
    }
    return this._por.get(id);
  }

  // ----- 프리렌더 -----

  // 성운 배경: 그라데이션 + 부드러운 성운 덩어리 + 은하수 띠 + 별
  bg() {
    if (this._bg) return this._bg;
    this._bg = prerender(W, H, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#0a0817');
      grad.addColorStop(0.55, '#141133');
      grad.addColorStop(1, '#251d4e');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);

      const rng = new RNG('gacha-nebula');
      const blob = (x, y, r, col, a) => {
        const rg = g.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, col);
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = a;
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = rg;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
      };
      blob(180, 120, 240, '#3a2a6b', 0.55);
      blob(790, 90, 210, '#232a5e', 0.5);
      blob(650, 420, 260, '#4a2e6b', 0.32);
      blob(120, 430, 200, '#1d2a55', 0.4);
      blob(480, 200, 320, '#2a1f52', 0.3);

      // 은하수 — 대각선 미세 점 띠
      for (let i = 0; i < 420; i++) {
        const t = rng.next();
        const x = t * (W + 300) - 150;
        const y = 60 + t * 240 + (rng.next() - 0.5) * 90;
        g.globalAlpha = 0.10 + rng.next() * 0.25;
        g.fillStyle = rng.chance(0.2) ? '#8fb8e8' : '#f2ecdd';
        g.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
      // 별 — 밝기 2단
      for (let i = 0; i < 90; i++) {
        g.globalAlpha = 0.35 + rng.next() * 0.55;
        g.fillStyle = rng.chance(0.15) ? '#7fdde8' : '#f2ecdd';
        const s = rng.chance(0.18) ? 2 : 1;
        g.fillRect(Math.round(rng.next() * W), Math.round(rng.next() * H), s, s);
      }
      g.globalAlpha = 1;
    });
    return this._bg;
  }

  // 소환진 바닥판: 이중 링 + 육망성 + 룬 눈금 자리 (도는 요소는 매 프레임 위에 얹는다)
  circleBase() {
    if (this._cb) return this._cb;
    const CW = 620, CH = 220;
    this._cb = prerender(CW, CH, (g) => {
      const cx = CW / 2, cy = CH / 2;
      const ry = (r) => r * 0.32;
      g.globalCompositeOperation = 'lighter';
      const ring = (r, w, a, col) => {
        g.globalAlpha = a; g.strokeStyle = col; g.lineWidth = w;
        g.beginPath(); g.ellipse(cx, cy, r, ry(r), 0, 0, Math.PI * 2); g.stroke();
      };
      // 바닥 빛무리
      const rg = g.createRadialGradient(cx, cy, 10, cx, cy, 290);
      g.globalAlpha = 0.35;
      rg.addColorStop(0, 'rgba(242, 210, 81, 0.55)');
      rg.addColorStop(0.5, 'rgba(90, 127, 196, 0.18)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.beginPath(); g.ellipse(cx, cy, 290, ry(290), 0, 0, Math.PI * 2); g.fill();
      // 링 — [후광, 몸통, 흰 심] + 안쪽 청색 링
      ring(280, 10, 0.16, PALETTE.gold);
      ring(280, 4, 0.9, PALETTE.gold);
      ring(280, 1, 0.8, PALETTE.white);
      ring(206, 2.5, 0.65, PALETTE.skyBlue);
      ring(132, 2, 0.55, PALETTE.gold);
      // 육망성 — 두 삼각형 (원근 눌림 좌표)
      const tri = (phase, col, a) => {
        g.globalAlpha = a; g.strokeStyle = col; g.lineWidth = 2;
        g.beginPath();
        for (let i = 0; i <= 3; i++) {
          const ang = phase + (i / 3) * Math.PI * 2;
          const x = cx + Math.cos(ang) * 206, y = cy + Math.sin(ang) * ry(206);
          i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        g.stroke();
      };
      tri(-Math.PI / 2, PALETTE.gold, 0.55);
      tri(Math.PI / 2, PALETTE.skyBlue, 0.45);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    });
    return this._cb;
  }

  // 카드 프레임 (등급별 프리렌더): 이중 테두리 + 모서리 장식 + 초상 후광 + 이름 밴드
  cardFrame(grade, w, h) {
    this._cf = this._cf ?? new Map();
    const key = `${grade}:${w}x${h}`;
    if (this._cf.has(key)) return this._cf.get(key);
    const col = GRADE_COLOR[grade];
    const c = prerender(w, h, (g) => {
      // 몸판
      g.fillStyle = 'rgba(14, 11, 28, 0.97)';
      g.fillRect(0, 0, w, h);
      // 초상 구역 후광 (위 55%)
      const rg = g.createRadialGradient(w / 2, h * 0.3, 4, w / 2, h * 0.3, h * 0.42);
      rg.addColorStop(0, col);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = grade === 3 ? 0.4 : grade === 2 ? 0.26 : 0.14;
      g.fillStyle = rg;
      g.fillRect(2, 2, w - 4, Math.round(h * 0.58));
      // 방사선 — ★2 이상은 초상 뒤로 빛살
      if (grade >= 2) {
        g.globalAlpha = grade === 3 ? 0.20 : 0.11;
        g.strokeStyle = col;
        g.lineWidth = 2;
        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2;
          g.beginPath();
          g.moveTo(w / 2, h * 0.3);
          g.lineTo(w / 2 + Math.cos(ang) * w, h * 0.3 + Math.sin(ang) * w);
          g.stroke();
        }
      }
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      // 이름 밴드
      g.fillStyle = 'rgba(8, 6, 18, 0.92)';
      g.fillRect(3, h - 46, w - 6, 43);
      g.fillStyle = col;
      g.fillRect(6, h - 46, w - 12, 1);
      // 이중 테두리
      g.strokeStyle = col; g.lineWidth = 3;
      g.strokeRect(1.5, 1.5, w - 3, h - 3);
      g.strokeStyle = grade === 3 ? PALETTE.yellow : PALETTE.gray4;
      g.lineWidth = 1;
      g.strokeRect(5.5, 5.5, w - 11, h - 11);
      // 모서리 장식 ◆
      g.fillStyle = col;
      for (const [x, y] of [[6, 6], [w - 6, 6], [6, h - 6], [w - 6, h - 6]]) {
        g.beginPath();
        g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y);
        g.closePath(); g.fill();
      }
    });
    this._cf.set(key, c);
    return c;
  }

  // 카드 뒷면 (프리렌더): 문장 + 원 + 별
  cardBack(w, h) {
    this._cbk = this._cbk ?? new Map();
    const key = `${w}x${h}`;
    if (this._cbk.has(key)) return this._cbk.get(key);
    const c = prerender(w, h, (g) => {
      g.fillStyle = 'rgba(16, 13, 34, 0.97)';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = PALETTE.goldDark; g.lineWidth = 3;
      g.strokeRect(1.5, 1.5, w - 3, h - 3);
      g.strokeStyle = PALETTE.navy3; g.lineWidth = 1;
      g.strokeRect(5.5, 5.5, w - 11, h - 11);
      const cx = w / 2, cy = h / 2;
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = PALETTE.gold;
      g.globalAlpha = 0.75;
      g.lineWidth = 2;
      g.beginPath(); g.arc(cx, cy, w * 0.27, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 0.45;
      g.beginPath(); g.arc(cx, cy, w * 0.36, 0, Math.PI * 2); g.stroke();
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.fillStyle = PALETTE.gold;
      this.star(g, cx, cy, w * 0.14, PALETTE.gold);
      g.fillStyle = PALETTE.goldDark;
      for (const [x, y] of [[cx, cy - h * 0.32], [cx, cy + h * 0.32]]) {
        g.beginPath();
        g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y);
        g.closePath(); g.fill();
      }
    });
    this._cbk.set(key, c);
    return c;
  }

  // 픽셀 별 (5각 별 폴리곤) — 텍스트 ★보다 또렷하다
  star(g, cx, cy, r, col) {
    g.fillStyle = col;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const rr = i % 2 === 0 ? r : r * 0.45;
      const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
  }

  // ----- 진행 -----

  update(dt, game) {
    this.t += dt;
    if (this.shake > 0) this.shake -= dt;

    // 별똥별 — 8~14초에 한 번 (연출 전용)
    if (!this.meteor && this.mode === 'idle') {
      this._metAt = this._metAt ?? (this.t + 4);
      if (this.t >= this._metAt) {
        const rng = new RNG(`meteor-${Math.floor(this.t)}`);
        this.meteor = { x: 100 + rng.next() * 600, y: 30 + rng.next() * 80, t: 0 };
        this._metAt = this.t + 8 + rng.next() * 6;
      }
    }
    if (this.meteor) {
      this.meteor.t += dt;
      if (this.meteor.t > 0.7) this.meteor = null;
    }

    for (const p of this.particles) {
      p.life += dt;
      if (p.conv) {
        // 나선 수렴 — 감기면서 빨려든다
        const q = Math.max(0, Math.min(1, p.life / p.dur));
        const e = q * q;
        const ang = p.ang0 + q * 3.4;
        const d = p.d0 * (1 - e);
        p.x = CX + Math.cos(ang) * d;
        p.y = CY + Math.sin(ang) * d * 0.42 - e * 46;   // 끝에서 살짝 떠오른다
      } else {
        p.x += (p.vx ?? 0) * dt;
        p.y += (p.vy ?? 0) * dt;
        if (p.grav) p.vy += p.grav * dt;
      }
    }
    this.particles = this.particles.filter((p) => p.life < p.dur);

    if (this.mode === 'cast' && this.t >= CAST_DUR) {
      this.mode = 'flash';
      this.t = 0;
      game.audio.playSE(this.best === 3 ? 'crit' : 'confirm');
      if (this.best === 3) this.shake = 0.55;
      this.burst(this.best);
    } else if (this.mode === 'flash' && this.t >= FLASH_DUR) {
      this.mode = 'reveal';
      this.t = 0;
      this.revealed = 0;
      this.flipT = 0;
    } else if (this.mode === 'reveal') {
      // ★수동 공개 (블루아카 방식, 사용자 요청 2026-08-06): 자동 넘김 없음 —
      //   클릭/Z로 한 장씩, [C] 모두 공개. flipT는 플립·광택 애니용으로만 흐른다.
      this.flipT += dt;
      if (this.cut) {
        this.cut.t += dt;
      } else {
        // ★3 단독 컷신 (사용자 요청 2026-08-09): 공개된 ★3을 카드+방사광을
        // 먼저 보여준 뒤(0.45초) 한 명씩 상영. 모두 공개 시엔 순서대로 이어진다.
        for (let i = 0; i < this.revealed; i++) {
          const r = this.results[i];
          if (r.grade === 3 && !r.cutSeen && this.flipT >= 0.45) {
            r.cutSeen = true;
            this.cut = { r, t: 0 };
            game.audio.playSE('crit');
            break;
          }
        }
      }
    }
  }

  revealAll(game) {
    if (!this.results || this.revealed >= this.results.length) return;
    this.revealed = this.results.length;
    this.flipT = 1;
    game.audio.playSE(this.best === 3 ? 'crit' : 'confirm');
    for (let i = 0; i < this.results.length; i++) {
      const r = this.results[i];
      if (r.grade >= 2) {
        const pos = this.cardRect(i);
        this.sparkleAt(pos.x + pos.w / 2, pos.y + pos.h / 2, r.grade);
      }
    }
    if (this.best === 3) this.shake = Math.max(this.shake, 0.3);
  }

  advanceReveal(game) {
    const r = this.results[this.revealed];
    this.revealed += 1;
    this.flipT = 0;
    game.audio.playSE(r.grade === 3 ? 'crit' : 'cursor');
    if (r.grade >= 2) {
      const pos = this.cardRect(this.revealed - 1);
      this.sparkleAt(pos.x + pos.w / 2, pos.y + pos.h / 2, r.grade);
      if (r.grade === 3) this.shake = Math.max(this.shake, 0.32);
    }
  }

  burst(grade) {
    const rng = new RNG(`gacha-burst-${grade}`);
    const n = grade === 3 ? 52 : 28;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rng.next() * 0.2;
      const sp = 200 + rng.next() * 300;
      this.particles.push({
        x: CX, y: CY - 40, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.8, grav: 140,
        life: 0, dur: 0.55 + rng.next() * 0.45, size: rng.chance(0.3) ? 5 : 3,
        color: rng.chance(0.35) ? PALETTE.white : GRADE_COLOR[grade],
      });
    }
    for (let i = 0; i < (grade === 3 ? 12 : 6); i++) {   // 반짝이 별
      this.particles.push({
        x: CX - 220 + rng.next() * 440, y: CY - 180 + rng.next() * 240,
        life: -rng.next() * 0.3, dur: 0.6, tw: true, size: 6 + rng.next() * 6,
        color: rng.chance(0.5) ? PALETTE.white : GRADE_COLOR[grade],
      });
    }
  }

  sparkleAt(x, y, grade) {
    const rng = new RNG(`gacha-spark-${Math.round(x)}-${Math.round(y)}`);
    const n = grade === 3 ? 12 : 6;
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: x - 60 + rng.next() * 120, y: y - 84 + rng.next() * 168,
        life: -i * 0.045, dur: 0.55, tw: true, size: 5 + rng.next() * 6,
        color: rng.chance(0.4) ? PALETTE.white : GRADE_COLOR[grade],
      });
    }
  }

  startPull(game, n) {
    const st = game.state;
    if (n === 10 && !GA.canTenPull(st)) {
      game.showToast('10연 소환은 제단 Lv2에서 해금됩니다');
      game.audio.playSE('cancel');
      return;
    }
    const results = GA.draw(st, n);
    if (!results) {
      game.showToast('맹세의 증표가 부족합니다');
      game.audio.playSE('cancel');
      return;
    }
    this.results = results;
    this.lastN = n;
    this.best = Math.max(...results.map((r) => r.grade));
    this.mode = 'cast';
    this.t = 0;
    this.particles = [];
    game.audio.playSE('confirm');
    const rng = new RNG(`gacha-cast-${st.gacha.draws}`);
    for (let i = 0; i < 34; i++) {
      this.particles.push({
        conv: true, ang0: rng.next() * Math.PI * 2, d0: 240 + rng.next() * 240,
        x: -99, y: -99, life: -rng.next() * 0.55, dur: 0.62,
        size: rng.chance(0.3) ? 5 : 3,
        color: rng.chance(0.35) ? PALETTE.white : rng.chance(0.5) ? PALETTE.gold : PALETTE.skyBlue,
      });
    }
  }

  // ----- 입력 -----

  skipOrNext(game) {
    if (this.mode === 'cast') { this.t = CAST_DUR; return; }
    if (this.mode === 'flash') { this.t = FLASH_DUR; return; }
    if (this.mode === 'reveal') {
      if (this.revealed < this.results.length) this.advanceReveal(game);
      else { this.mode = 'idle'; this.results = null; }
    }
  }

  dismissCut(game) {
    this.cut = null;
    this.flipT = 0;                // 다음 ★3 컷신까지 한 박자 쉰다
    game.audio.playSE('cursor');
  }

  onKeyDown(code, game) {
    if (this.mode !== 'idle') {
      if (this.mode === 'reveal' && this.cut) {
        if (this.cut.t > 0.4 && ['KeyZ', 'Enter', 'Space', 'KeyX', 'Escape'].includes(code)) this.dismissCut(game);
        return;
      }
      const done = this.mode === 'reveal' && this.results && this.revealed >= this.results.length;
      if (this.mode === 'reveal' && !done && code === 'KeyC') { this.revealAll(game); return; }
      if (done && code === 'KeyC') { this.again(game); return; }
      if (['KeyZ', 'Enter', 'Space', 'KeyX', 'Escape'].includes(code)) this.skipOrNext(game);
      return;
    }
    if (code === 'Escape' || code === 'KeyX') { game.audio.playSE('cancel'); game.changeScene('base'); return; }
    if (code === 'KeyZ' || code === 'Enter') { this.startPull(game, 1); return; }
    if (code === 'KeyC') { this.startPull(game, 10); return; }
  }

  buttons(game) {
    const ten = GA.canTenPull(game.state);
    return [
      { x: 268, y: 448, w: 200, h: 52, label: '소환 ×1', key: '[Z]', sub: '증표 1', run: () => this.startPull(game, 1) },
      {
        x: 492, y: 448, w: 200, h: 52, label: ten ? '소환 ×10' : '소환 ×10 (잠김)', key: ten ? '[C]' : '',
        sub: ten ? '증표 10' : '제단 Lv2 해금', dim: !ten, run: () => this.startPull(game, 10),
      },
      { x: 852, y: 10, w: 96, h: 26, label: '나가기', key: '[X]', mini: true, run: () => { game.audio.playSE('cancel'); game.changeScene('base'); } },
    ];
  }

  onMouseMove(x, y) { this.mouse = { x, y }; }

  again(game) {
    const n = this.lastN ?? 10;
    this.mode = 'idle';
    this.results = null;
    this.startPull(game, n);
  }

  // 공개 완료 후 하단 버튼 (사용자 요청 2026-08-09: 키 안내 대신 클릭 버튼)
  doneBtns(game) {
    const n = this.lastN ?? 10;
    return [
      { x: W / 2 - 190, y: H - 62, w: 180, h: 44, label: '확인', key: '[Z]', sub: '거점으로',
        run: () => { this.mode = 'idle'; this.results = null; game.audio.playSE('confirm'); } },
      { x: W / 2 + 10, y: H - 62, w: 180, h: 44, label: `다시 뽑기 ×${n}`, key: '[C]', sub: `증표 ${n}`,
        run: () => this.again(game) },
    ];
  }

  revealAllBtn() { return { x: W - 176, y: H - 44, w: 160, h: 30 }; }

  onMouseDown(x, y, button, game) {
    if (this.mode === 'reveal' && this.results) {
      if (this.cut) { if (this.cut.t > 0.4) this.dismissCut(game); return; }
      if (this.revealed >= this.results.length) {
        for (const b of this.doneBtns(game)) {
          if (inRect(x, y, b)) { b.run(); return; }
        }
        return;                    // 완료 화면은 버튼으로만 — 오클릭 이탈 방지
      }
      if (inRect(x, y, this.revealAllBtn())) { this.revealAll(game); return; }
    }
    if (this.mode !== 'idle') { this.skipOrNext(game); return; }
    for (const b of this.buttons(game)) {
      if (inRect(x, y, b)) { b.run(); return; }
    }
  }

  // ----- 그리기 -----

  render(g, game) {
    const st = game.state;
    g.save();
    if (this.shake > 0) {
      const rng = new RNG(`gsh-${Math.floor(this.t * 60)}`);
      g.translate(Math.round((rng.next() - 0.5) * this.shake * 16), Math.round((rng.next() - 0.5) * this.shake * 11));
    }

    g.drawImage(this.bg(), 0, 0);

    // 별똥별
    if (this.meteor) {
      const m = this.meteor, q = m.t / 0.7;
      const mx = m.x + q * 260, my = m.y + q * 120;
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 8; i++) {
        g.globalAlpha = (1 - q) * (1 - i / 8) * 0.8;
        g.fillStyle = i === 0 ? PALETTE.white : PALETTE.skyBlue;
        g.fillRect(Math.round(mx - i * 7), Math.round(my - i * 3.2), i === 0 ? 3 : 2, i === 0 ? 3 : 2);
      }
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }

    // 소환진 — cast 중 밝아지고 커진다
    const castQ = this.mode === 'cast' ? Math.min(1, this.t / CAST_DUR) : 0;
    const cb = this.circleBase();
    const scale = 1 + castQ * 0.12;
    const cw = cb.width * scale, ch = cb.height * scale;
    g.globalAlpha = 0.65 + castQ * 0.35 + Math.sin(this.t * 1.8) * 0.06;
    g.drawImage(cb, CX - cw / 2, CY - ch / 2, cw, ch);
    g.globalAlpha = 1;
    this.drawRunes(g, castQ);
    this.drawPillar(g, castQ);

    // 파티클
    for (const p of this.particles) {
      if (p.life < 0) continue;
      const q = 1 - p.life / p.dur;
      g.globalCompositeOperation = 'lighter';
      if (p.tw) {
        const arm = Math.max(1, Math.round(p.size * Math.sin(Math.PI * (1 - q))));
        g.globalAlpha = 0.9;
        g.fillStyle = p.color;
        g.fillRect(p.x - arm, p.y - 1, arm * 2 + 1, 2);
        g.fillRect(p.x - 1, p.y - arm, 2, arm * 2 + 1);
        g.fillStyle = PALETTE.white;
        g.fillRect(p.x - 1, p.y - 1, 3, 3);
      } else {
        g.globalAlpha = q;
        g.fillStyle = p.color;
        g.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), p.size, p.size);
      }
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }

    if (this.mode === 'idle') this.renderIdle(g, game);
    if (this.mode === 'reveal') this.renderReveal(g, game);

    // 섬광 — 방사 광선 + 전면 플래시
    if (this.mode === 'flash') {
      const q = 1 - this.t / FLASH_DUR;
      const col = GRADE_COLOR[this.best];
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = q * 0.9;
      g.strokeStyle = col;
      for (let i = 0; i < 26; i++) {
        const ang = (i / 26) * Math.PI * 2 + this.t * 2.2;
        const r0 = 40 + (1 - q) * 320;
        g.lineWidth = i % 3 === 0 ? 4 : 2;
        g.beginPath();
        g.moveTo(CX + Math.cos(ang) * r0, CY - 40 + Math.sin(ang) * r0 * 0.8);
        g.lineTo(CX + Math.cos(ang) * (r0 + 240), CY - 40 + Math.sin(ang) * (r0 + 240) * 0.8);
        g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = q;
      g.fillStyle = col;
      g.fillRect(-20, -20, W + 40, H + 40);
      g.globalAlpha = Math.max(0, q - 0.35);
      g.fillStyle = PALETTE.white;
      g.fillRect(-20, -20, W + 40, H + 40);
      g.globalAlpha = 1;
    }
    g.restore();
  }

  // 도는 룬 — 바깥 정방향·안쪽 역방향
  drawRunes(g, castQ) {
    const speed = 0.5 + castQ * 2.4;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2 + this.t * speed;
      g.globalAlpha = 0.85;
      g.fillStyle = PALETTE.white;
      const x = CX + Math.cos(ang) * 280 * (1 + castQ * 0.12);
      const y = CY + Math.sin(ang) * 280 * 0.32 * (1 + castQ * 0.12);
      g.fillRect(Math.round(x) - 2, Math.round(y) - 3, 4, 6);
    }
    for (let i = 0; i < 10; i++) {
      const ang = -(i / 10) * Math.PI * 2 - this.t * speed * 0.7;
      g.globalAlpha = 0.6;
      g.fillStyle = PALETTE.cyan;
      const x = CX + Math.cos(ang) * 132, y = CY + Math.sin(ang) * 132 * 0.32;
      g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }

  // 중심 빛기둥 — 평상시 은은하게, cast에서 하늘까지 솟는다
  drawPillar(g, castQ) {
    const hgt = 120 + castQ * 260;
    const wdt = 26 + castQ * 30;
    const a = 0.14 + castQ * 0.5 + Math.sin(this.t * 2.2) * 0.03;
    const grad = g.createLinearGradient(0, CY - hgt, 0, CY);
    grad.addColorStop(0, 'rgba(242, 236, 221, 0)');
    grad.addColorStop(0.55, 'rgba(242, 210, 81, 0.55)');
    grad.addColorStop(1, 'rgba(242, 236, 221, 0.9)');
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = a;
    g.fillStyle = grad;
    g.fillRect(CX - wdt / 2, CY - hgt, wdt, hgt);
    g.globalAlpha = a * 0.5;
    g.fillRect(CX - wdt * 1.4, CY - hgt * 0.7, wdt * 2.8, hgt * 0.7);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }

  renderIdle(g, game) {
    const st = game.state;
    // 타이틀 + 좌우 장식
    drawTextOutlined(g, '소  환  제  단', W / 2, 54, { size: 26, bold: true, align: 'center', fill: PALETTE.gold, outline: PALETTE.black });
    g.strokeStyle = PALETTE.goldDark;
    g.lineWidth = 1;
    for (const dir of [-1, 1]) {
      const x0 = W / 2 + dir * 130, x1 = W / 2 + dir * 300;
      g.beginPath(); g.moveTo(x0, 48); g.lineTo(x1, 48); g.stroke();
      this.star(g, x1 + dir * 10, 48, 5, PALETTE.gold);
    }
    drawText(g, '맹세의 증표가 새로운 동료를 부른다', W / 2, 80, { size: 11, align: 'center', fill: PALETTE.gray3 });

    // 보유 재화
    drawPanel(g, 12, 10, 190, 32, { border: PALETTE.goldDark });
    this.star(g, 30, 26, 7, PALETTE.gold);
    drawText(g, `${st.resources.badge ?? 0}`, 44, 31, { size: 13, bold: true, fill: PALETTE.gold });
    drawText(g, '맹세의 증표', 118, 31, { size: 9, fill: PALETTE.gray2 });

    // 부유하는 소환 크리스탈 (다이아) + 궤도 입자
    const bob = Math.sin(this.t * 1.5) * 6;
    const cy = 208 + bob;
    g.globalCompositeOperation = 'lighter';
    const rg = g.createRadialGradient(CX, cy, 2, CX, cy, 70);
    rg.addColorStop(0, 'rgba(242, 210, 81, 0.5)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(CX, cy, 70, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
    const dia = (r, col) => {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(CX, cy - r * 1.5); g.lineTo(CX + r, cy); g.lineTo(CX, cy + r * 1.5); g.lineTo(CX - r, cy);
      g.closePath(); g.fill();
    };
    dia(26, PALETTE.goldDark);
    dia(20, PALETTE.gold);
    dia(10, PALETTE.yellow);
    g.fillStyle = PALETTE.white;
    g.fillRect(CX - 3, cy - 22, 3, 10);
    for (let i = 0; i < 3; i++) {                        // 궤도 입자
      const ang = this.t * 1.3 + (i / 3) * Math.PI * 2;
      g.fillStyle = i === 0 ? PALETTE.white : PALETTE.gold;
      g.fillRect(Math.round(CX + Math.cos(ang) * 56) - 2, Math.round(cy + Math.sin(ang) * 20) - 2, 4, 4);
    }

    // 천장 게이지 (제단 Lv2부터 — 기획서)
    if (GA.altarLv(st) >= 2) {
      const left = GA.pityLeft(st);
      const q = 1 - left / BALANCE.gacha.pityAt;
      drawPanel(g, 320, 398, 320, 32, { border: PALETTE.goldDark });
      g.fillStyle = PALETTE.navy1;
      g.fillRect(327, 407, 306, 14);
      const grad2 = g.createLinearGradient(327, 0, 633, 0);
      grad2.addColorStop(0, PALETTE.goldDark);
      grad2.addColorStop(1, PALETTE.gold);
      g.fillStyle = grad2;
      g.fillRect(327, 407, Math.round(306 * q), 14);
      drawTextOutlined(g, `★3 확정까지 ${left}회`, W / 2, 419, { size: 10, align: 'center', fill: PALETTE.white, outline: PALETTE.black });
    }

    // 버튼 — 장식 프레임 + 호버 발광
    for (const b of this.buttons(game)) {
      const hover = inRect(this.mouse.x, this.mouse.y, b);
      if (b.mini) {
        drawPanel(g, b.x, b.y, b.w, b.h, { border: hover ? PALETTE.gold : PALETTE.goldDark });
        drawText(g, `${b.label} ${b.key}`, b.x + b.w / 2, b.y + 17, { size: 10, align: 'center', fill: PALETTE.gray4 });
        continue;
      }
      if (hover && !b.dim) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.18;
        g.fillStyle = PALETTE.gold;
        g.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
      }
      drawPanel(g, b.x, b.y, b.w, b.h, { border: b.dim ? PALETTE.gray2 : PALETTE.goldDark });
      g.strokeStyle = b.dim ? PALETTE.gray1 : PALETTE.gold;
      g.lineWidth = 1;
      g.strokeRect(b.x + 3.5, b.y + 3.5, b.w - 7, b.h - 7);
      const fg = b.dim ? PALETTE.gray2 : PALETTE.white;
      drawText(g, `${b.label}  ${b.key}`, b.x + b.w / 2, b.y + 23, { size: 13, bold: true, align: 'center', fill: fg });
      drawText(g, b.sub, b.x + b.w / 2, b.y + 41, { size: 9, align: 'center', fill: b.dim ? PALETTE.gray2 : PALETTE.gray3 });
      this.star(g, b.x + 16, b.y + b.h / 2, 5, b.dim ? PALETTE.gray2 : PALETTE.gold);
      this.star(g, b.x + b.w - 16, b.y + b.h / 2, 5, b.dim ? PALETTE.gray2 : PALETTE.gold);
    }
    drawText(g, `확률 — ★3 ${Math.round(GA.ratesOf(st)[3] * 100)}% · ★2 ${Math.round(GA.ratesOf(st)[2] * 100)}% · ★1 ${Math.round(GA.ratesOf(st)[1] * 100)}%   |   천장 ${BALANCE.gacha.pityAt}회`,
      W / 2, 524, { size: 9, align: 'center', fill: PALETTE.gray2 });
  }

  cardRect(i) {
    if (this.results.length === 1) return { x: W / 2 - 84, y: 118, w: 168, h: 244 };
    const col = i % 5, row = Math.floor(i / 5);
    return { x: 118 + col * 150, y: 88 + row * 190, w: 134, h: 176 };
  }

  drawCardFace(g, r, rect, flipQ, justRevealed) {
    const { x, y, w, h } = rect;
    const sw = Math.max(4, Math.round(w * Math.abs(flipQ)));
    const cx = x + w / 2;
    const gx = Math.round(cx - sw / 2);
    if (flipQ < 0) {
      g.drawImage(this.cardBack(w, h), gx, y, sw, h);
      return;
    }
    const c = CHARACTERS[r.id];
    const col = GRADE_COLOR[r.grade];
    g.drawImage(this.cardFrame(r.grade, w, h), gx, y, sw, h);
    if (sw < w * 0.7) return;

    // ★3 — 살아 있는 맥동 발광
    if (r.grade === 3) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.25 + Math.sin(this.t * 4) * 0.12;
      g.strokeStyle = PALETTE.gold;
      g.lineWidth = 5;
      g.strokeRect(gx - 2.5, y - 2.5, sw + 5, h + 5);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }

    // 초상 — 일러가 있으면 상반신 크롭, 없으면 전투 스프라이트 폴백 (정수배)
    const tall = h > 200;
    const pw = sw - 14, ph = Math.round(h * 0.55);
    const bust = this.bustCrop(r.id, pw, ph, tall);
    if (bust) {
      g.drawImage(bust, gx + 7, y + 8);
    } else {
      const spr = this.portrait(r.id);
      const scale = sprScale(spr, tall ? 2 : 1);
      const dw = spr.width * scale, dh = spr.height * scale;
      g.imageSmoothingEnabled = false;
      g.drawImage(spr, Math.round(cx - dw / 2), y + (tall ? 30 : 16), dw, dh);
    }

    // 공개 직후 광택 스윕 — 대각선 하이라이트가 카드를 쓸고 지나간다
    if (justRevealed != null && justRevealed < 0.45) {
      const sq = justRevealed / 0.45;
      g.save();
      g.beginPath();
      g.rect(gx, y, sw, h);
      g.clip();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.55 * (1 - sq);
      g.fillStyle = PALETTE.white;
      const sx = gx - h + (sw + h * 2) * sq;
      g.beginPath();
      g.moveTo(sx, y); g.lineTo(sx + 34, y); g.lineTo(sx + 34 - h, y + h); g.lineTo(sx - h, y + h);
      g.closePath(); g.fill();
      g.restore();
      g.globalAlpha = 1;
    }

    // 이름 + 별 (픽셀 별 폴리곤)
    drawTextOutlined(g, c.name, cx, y + h - 26, { size: h > 200 ? 15 : 12, bold: true, align: 'center', fill: PALETTE.white, outline: PALETTE.black });
    const sr = h > 200 ? 8 : 6;
    const gap = sr * 2 + 4;
    const total = (r.grade - 1) * gap;
    for (let i = 0; i < r.grade; i++) this.star(g, cx - total / 2 + i * gap, y + h - 10, sr, col);

    if (r.isNew) {
      g.fillStyle = PALETTE.red;
      g.fillRect(gx + sw - 46, y + 8, 40, 15);
      drawText(g, 'NEW!', gx + sw - 26, y + 19, { size: 9, bold: true, align: 'center', fill: PALETTE.white });
    } else if (r.shard > 0) {
      drawText(g, `조각 +${r.shard}`, cx, y + h - 50, { size: 9, align: 'center', fill: PALETTE.purple });
    } else if (r.gold > 0) {
      drawText(g, `골드 +${r.gold}`, cx, y + h - 50, { size: 9, align: 'center', fill: PALETTE.gold });
    }
    if (r.pity) {
      g.fillStyle = PALETTE.gold;
      g.fillRect(gx + 6, y + 8, 34, 15);
      drawText(g, '천장', gx + 23, y + 19, { size: 9, bold: true, align: 'center', fill: PALETTE.black });
    }
  }

  // ★3 방사 빛살 프리렌더 — 긴·짧은 빛살 교차 + 중심 코어광 (크기별 캐시)
  rayBurst(sz) {
    this._rb = this._rb ?? new Map();
    if (this._rb.has(sz)) return this._rb.get(sz);
    const c = prerender(sz, sz, (g) => {
      const cx = sz / 2, cy = sz / 2, R = sz / 2;
      g.globalCompositeOperation = 'lighter';
      const RAYS = 12;
      for (let i = 0; i < RAYS; i++) {
        const ang = (i / RAYS) * Math.PI * 2;
        const long = i % 2 === 0;
        const len = R * (long ? 1 : 0.6);
        const wHalf = (long ? 0.09 : 0.05) * R;
        const grad = g.createLinearGradient(cx, cy, cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
        grad.addColorStop(0, 'rgba(255, 246, 214, 0.85)');
        grad.addColorStop(0.35, 'rgba(242, 210, 81, 0.45)');
        grad.addColorStop(1, 'rgba(242, 210, 81, 0)');
        g.fillStyle = grad;
        const px = Math.cos(ang + Math.PI / 2), py = Math.sin(ang + Math.PI / 2);
        g.beginPath();
        g.moveTo(cx + px * wHalf, cy + py * wHalf);
        g.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
        g.lineTo(cx - px * wHalf, cy - py * wHalf);
        g.closePath(); g.fill();
      }
      const rg = g.createRadialGradient(cx, cy, 2, cx, cy, R * 0.5);
      rg.addColorStop(0, 'rgba(255, 248, 220, 0.7)');
      rg.addColorStop(0.5, 'rgba(242, 210, 81, 0.26)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, sz, sz);
    });
    this._rb.set(sz, c);
    return c;
  }

  // ★3 공개 후 후광 — 카드 뒤에서 2층 빛살이 역방향으로 돌며 맥동.
  // born(공개 후 경과)이 있으면 등장 팝: 크게 터졌다가 제자리로.
  drawStarBurst(g, rect, i, born) {
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    const sz = Math.round(Math.max(rect.w, rect.h) * 2.1);
    const B = this.rayBurst(sz);
    const pop = born != null ? 1 + 0.35 * Math.max(0, 1 - born / 0.4) : 1;
    const ramp = born != null ? Math.min(1, born / 0.15) : 1;
    const pulse = 0.72 + Math.sin(this.t * 3 + i * 1.7) * 0.16;
    g.save();
    g.globalCompositeOperation = 'lighter';
    // 카드를 감싸는 금빛 아지랑이 — 빛살 사이 틈을 메워 레퍼런스처럼 감싸는 후광
    const r0 = Math.min(rect.w, rect.h) * 0.42, r1 = Math.max(rect.w, rect.h) * 0.85;
    const halo = g.createRadialGradient(cx, cy, r0, cx, cy, r1);
    halo.addColorStop(0, 'rgba(242, 210, 81, 0.55)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = pulse * ramp;
    g.fillStyle = halo;
    g.fillRect(cx - r1, cy - r1, r1 * 2, r1 * 2);
    g.translate(cx, cy);
    g.rotate(this.t * 0.5 + i * 1.3);
    g.globalAlpha = pulse * ramp;
    const s1 = sz * pop;
    g.drawImage(B, -s1 / 2, -s1 / 2, s1, s1);
    g.rotate(-this.t * 0.85);
    g.globalAlpha = pulse * ramp * 0.55;
    const s2 = sz * 0.72 * pop;
    g.drawImage(B, -s2 / 2, -s2 / 2, s2, s2);
    g.restore();
    g.globalAlpha = 1;
  }

  renderReveal(g, game) {
    // 1패스 — ★3 후광은 모든 카드보다 뒤에 깔린다 (사용자 레퍼런스: 블루아카식 방사광)
    for (let i = 0; i < this.results.length; i++) {
      if (this.results[i].grade !== 3) continue;
      if (i < this.revealed - 1) {
        this.drawStarBurst(g, this.cardRect(i), i, null);
      } else if (i === this.revealed - 1 && this.flipT / 0.17 >= 0.55) {
        this.drawStarBurst(g, this.cardRect(i), i, Math.max(0, this.flipT - 0.09));
      }
    }
    for (let i = 0; i < this.results.length; i++) {
      const rect = this.cardRect(i);
      const r = this.results[i];
      if (i < this.revealed - 1) {
        this.drawCardFace(g, r, rect, 1, null);
      } else if (i === this.revealed - 1) {
        const q = Math.min(1, this.flipT / 0.17);
        this.drawCardFace(g, r, rect, -1 + q * 2, this.flipT);
      } else {
        g.drawImage(this.cardBack(rect.w, rect.h), rect.x, rect.y);
        // ★뒷면 등급 예고 (블루아카 방식): ★3은 금빛 맥동, ★2는 은은한 파랑.
        //   "이 중에 금테가 있다"는 기대감이 수동 공개의 재미를 만든다.
        if (r.grade >= 2) {
          const col = GRADE_COLOR[r.grade];
          const pulse = r.grade === 3 ? 0.4 + Math.sin(this.t * 5 + i) * 0.22 : 0.22;
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = pulse;
          g.strokeStyle = col;
          g.lineWidth = r.grade === 3 ? 6 : 3;
          g.strokeRect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4);
          if (r.grade === 3) {
            const rg = g.createRadialGradient(rect.x + rect.w / 2, rect.y + rect.h / 2, 6,
              rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w * 0.8);
            rg.addColorStop(0, 'rgba(242, 210, 81, 0.5)');
            rg.addColorStop(1, 'rgba(0,0,0,0)');
            g.globalAlpha = pulse * 0.8;
            g.fillStyle = rg;
            g.fillRect(rect.x - 14, rect.y - 14, rect.w + 28, rect.h + 28);
          }
          g.globalCompositeOperation = 'source-over';
          g.globalAlpha = 1;
        }
        // 다음에 넘길 카드 — 흰 테 맥동으로 안내
        if (i === this.revealed) {
          g.globalAlpha = 0.5 + Math.sin(this.t * 6) * 0.3;
          g.strokeStyle = PALETTE.white;
          g.lineWidth = 2;
          g.strokeRect(rect.x - 5, rect.y - 5, rect.w + 10, rect.h + 10);
          g.globalAlpha = 1;
        }
      }
    }
    const done = this.revealed >= this.results.length;
    if (this.cut) {                 // 컷신 중엔 하단 UI 숨김 — 오버레이 뒤 비침 방지
      this.drawCutscene(g, game);
      return;
    }
    if (!done) {
      const b = this.revealAllBtn();
      drawPanel(g, b.x, b.y, b.w, b.h, { border: PALETTE.goldDark });
      drawText(g, '모두 공개 [C]', b.x + b.w / 2, b.y + 19, { size: 11, align: 'center', fill: PALETTE.gray4 });
      drawTextOutlined(g, '[Z·클릭] 한 장씩 공개', W / 2, H - 20, { size: 11, align: 'center', fill: PALETTE.gray4, outline: PALETTE.black });
    } else {
      for (const b of this.doneBtns(game)) {
        const hover = inRect(this.mouse.x, this.mouse.y, b);
        if (hover) {
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = 0.16;
          g.fillStyle = PALETTE.gold;
          g.fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
          g.globalCompositeOperation = 'source-over';
          g.globalAlpha = 1;
        }
        drawPanel(g, b.x, b.y, b.w, b.h, { border: hover ? PALETTE.gold : PALETTE.goldDark });
        drawText(g, `${b.label}  ${b.key}`, b.x + b.w / 2, b.y + 19, { size: 12, bold: true, align: 'center', fill: PALETTE.white });
        drawText(g, b.sub, b.x + b.w / 2, b.y + 35, { size: 9, align: 'center', fill: PALETTE.gray3 });
        this.star(g, b.x + 14, b.y + b.h / 2, 4, PALETTE.gold);
        this.star(g, b.x + b.w - 14, b.y + b.h / 2, 4, PALETTE.gold);
      }
    }
  }

  // ★3 단독 컷신 — 전신 일러 + 서약서 프로필 + 자기소개 (블루아카식, 2026-08-09)
  drawCutscene(g, game) {
    const { r, t } = this.cut;
    const c = CHARACTERS[r.id];
    const ease = (q) => 1 - Math.pow(1 - Math.max(0, Math.min(1, q)), 3);

    // 배경 — 어둡게 깔고 흐르는 금빛 대각 광선
    g.fillStyle = 'rgba(8, 6, 22, 0.86)';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const bx = -260 + i * 250 + Math.sin(this.t * 0.6 + i * 1.9) * 24;
      g.globalAlpha = 0.05 + (i % 2) * 0.04;
      g.fillStyle = PALETTE.gold;
      g.beginPath();
      g.moveTo(bx, H); g.lineTo(bx + 320, 0); g.lineTo(bx + 410, 0); g.lineTo(bx + 90, H);
      g.closePath(); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;

    // 캐릭터 — 뒤 방사광 + 전신 일러 (왼쪽에서 슬라이드 인, 일러 없으면 스프라이트 확대)
    const chX = 250, q1 = ease(t / 0.35);
    const B = this.rayBurst(600);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.translate(chX, 270);
    g.rotate(this.t * 0.3);
    g.globalAlpha = 0.75 * q1;
    g.drawImage(B, -300, -300);
    g.rotate(-this.t * 0.52);
    g.globalAlpha = 0.4 * q1;
    g.drawImage(B, -220, -220, 440, 440);
    g.restore();
    g.globalAlpha = q1;
    const ox = Math.round((1 - q1) * -80);
    const art = this.bustCrop(r.id, 360, 480, 'full');
    if (art) {
      g.drawImage(art, chX - 180 + ox, 34);
    } else {
      const spr = this.portrait(r.id);
      g.imageSmoothingEnabled = false;
      const sc = sprScale(spr, 5), dw = spr.width * sc, dh = spr.height * sc;
      g.drawImage(spr, Math.round(chX - dw / 2) + ox, 514 - dh, dw, dh);
    }
    g.globalAlpha = 1;

    // 이름 명판 — 좌하단 사선 패널: ★3 + 이름 + 칭호 + 배지
    const q2 = ease((t - 0.15) / 0.3);
    if (q2 > 0) {
      const nx = 56 + Math.round((1 - q2) * -30);
      g.globalAlpha = q2 * 0.85;
      g.fillStyle = PALETTE.navy1;
      g.beginPath();
      g.moveTo(nx - 16, 316); g.lineTo(nx + 250, 316); g.lineTo(nx + 234, 402); g.lineTo(nx - 32, 402);
      g.closePath(); g.fill();
      g.globalAlpha = q2;
      g.strokeStyle = PALETTE.gold;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(nx - 14, 320); g.lineTo(nx + 246, 320); g.stroke();
      for (let i = 0; i < 3; i++) this.star(g, nx + 12 + i * 22, 336, 8, PALETTE.gold);
      drawTextOutlined(g, c.name, nx + 2, 374, { size: 28, bold: true, fill: PALETTE.white, outline: PALETTE.black });
      drawText(g, c.title ?? '', nx + 4, 394, { size: 11, fill: PALETTE.gold });
      if (r.isNew) {
        g.fillStyle = PALETTE.red;
        g.fillRect(nx + 158, 326, 44, 17);
        drawText(g, 'NEW!', nx + 180, 338, { size: 10, bold: true, align: 'center', fill: PALETTE.white });
      }
      if (r.pity) {
        g.fillStyle = PALETTE.gold;
        g.fillRect(nx + 208, 326, 38, 17);
        drawText(g, '천장', nx + 227, 338, { size: 10, bold: true, align: 'center', fill: PALETTE.black });
      }
      g.globalAlpha = 1;
    }

    // 서약서 프로필 패널 — 오른쪽에서 슬라이드 인 (레퍼런스의 입학원서 포지션)
    const q3 = ease((t - 0.25) / 0.35);
    if (q3 > 0) {
      const px = 566 + Math.round((1 - q3) * 60), py = 58, pw = 340, ph = 336;
      g.globalAlpha = q3;
      drawPanel(g, px, py, pw, ph, { border: PALETTE.goldDark });
      g.strokeStyle = PALETTE.gold;
      g.lineWidth = 1;
      g.strokeRect(px + 5.5, py + 5.5, pw - 11, ph - 11);
      this.star(g, px + pw / 2, py + 24, 7, PALETTE.gold);
      drawText(g, '여 명 의  맹 세 — 서 약 서', px + pw / 2, py + 48, { size: 13, bold: true, align: 'center', fill: PALETTE.gold });
      g.strokeStyle = PALETTE.goldDark;
      g.beginPath(); g.moveTo(px + 24, py + 60); g.lineTo(px + pw - 24, py + 60); g.stroke();
      const rows = [
        ['이름', c.name, PALETTE.white],
        ['칭호', c.title ?? '-', PALETTE.white],
        ['클래스', CLASS_LABELS[c.classKey] ?? '-', PALETTE.white],
        ['속성', ELEMENT_LABELS[c.element] ?? '-', ELEMENT_COLORS[c.element] ?? PALETTE.white],
        ['등급', '★ ★ ★', PALETTE.gold],
      ];
      let ry = py + 74;
      for (const [label, val, col] of rows) {
        drawText(g, label, px + pw / 2, ry + 11, { size: 9, align: 'center', fill: PALETTE.gray2 });
        drawText(g, val, px + pw / 2, ry + 33, { size: 15, bold: true, align: 'center', fill: col });
        ry += 50;
        g.globalAlpha = q3 * 0.45;
        g.strokeStyle = PALETTE.goldDark;
        g.beginPath(); g.moveTo(px + 34, ry - 6); g.lineTo(px + pw - 34, ry - 6); g.stroke();
        g.globalAlpha = q3;
      }
      g.globalAlpha = 1;
    }

    // 자기소개 대사 — 타자기 연출 (집필 지침: 성격이 첫 마디에서 드러난다)
    const q4 = ease((t - 0.42) / 0.28);
    if (q4 > 0 && c.intro) {
      g.globalAlpha = q4;
      drawPanel(g, 48, 436, 864, 72, { border: PALETTE.goldDark });
      drawText(g, c.name, 70, 458, { size: 11, bold: true, fill: PALETTE.gold });
      const shown = c.intro.slice(0, Math.max(0, Math.floor((t - 0.55) * 34)));
      const brk = c.intro.length > 42 ? ((c.intro.lastIndexOf(' ', 42) + 1) || 42) : c.intro.length;
      drawText(g, shown.slice(0, brk), 70, 480, { size: 12, fill: PALETTE.white });
      if (shown.length > brk) drawText(g, shown.slice(brk), 70, 498, { size: 12, fill: PALETTE.white });
      g.globalAlpha = 1;
    }

    if (t > 0.8) {
      g.globalAlpha = 0.45 + Math.sin(this.t * 5) * 0.25;
      drawTextOutlined(g, '[Z·클릭] 계속', W - 96, H - 16, { size: 11, align: 'center', fill: PALETTE.gray4, outline: PALETTE.black });
      g.globalAlpha = 1;
    }

    // 등장 백섬광
    const fl = 1 - Math.min(1, t / 0.26);
    if (fl > 0) {
      g.globalAlpha = fl;
      g.fillStyle = PALETTE.white;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
  }
}
