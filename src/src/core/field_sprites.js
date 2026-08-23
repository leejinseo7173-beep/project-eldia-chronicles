// ============================================================
// field_sprites.js — 필드용 32×32 캐릭터 스프라이트 (기획서 §17 규격)
//   32×32 × 4방향(아래·위·좌·우) × 걷기 2프레임.
//
// 전투 스프라이트(64×64 사이드뷰)와 **같은 spriteCfg**를 받는다.
// 같은 색·같은 무기를 쓰므로 필드에서 본 인물이 전투에서 그대로 나온다.
//
// 그리는 방식이 전투와 다른 이유: 64×64는 고해상도 벡터 → 축소 → 양자화가 유리하지만,
// 32×32는 인물이 22px 남짓이라 축소하면 이목구비가 뭉개진다. 그래서 **직접 픽셀로** 그린다.
// (절대 규칙 7 — 로드 시 1회 프리렌더 후 재사용하는 건 동일)
// ============================================================

import { PALETTE, prerender, toneCanvas, makeUnitSprites } from './sprites.js';
import { FIELD_SHEETS, FIELD_SPRITE_ASSETS, hasFieldArt } from '../data/field_sprite_assets.js';

export const FIELD_SIZE = 32;
export const WALK_FRAMES = 2;
export const DIRS = ['down', 'up', 'left', 'right'];

const cache = new Map();

// ----- 외부/자체 그림 (등록된 캐릭터만) -----
const sheetImages = new Map();

export function loadFieldSheets(onReady) {
  const keys = Object.keys(FIELD_SHEETS);
  if (!keys.length) return Promise.resolve(false);
  return Promise.all(keys.map((k) => new Promise((res) => {
    const img = new Image();
    img.onload = () => { sheetImages.set(k, img); res(true); };
    img.onerror = () => { console.warn(`[field] 스프라이트 시트 로드 실패: ${FIELD_SHEETS[k]}`); res(false); };
    img.src = FIELD_SHEETS[k];
  }))).then((r) => {
    cache.clear();          // 늦게 온 그림으로 다시 만들게 한다
    if (onReady) onReady();
    return r.some(Boolean);
  });
}

// ----- 손그림 낱장 파일 (전투 스프라이트와 같은 방식) -----
// 시트에서 잘라 쓰는 대신 **프레임마다 PNG 한 장**을 쓴다. 전투가 이미 이 방식이고
// (sprite_assets.js), 원화를 한 장씩 그려 나가는 작업 흐름에 맞다.
// 크기는 자유 — 32×32에 안 갇힌다. 발끝 기준으로 그려지므로 키가 커도 위로만 자란다.
const fileImages = new Map();

export function loadFieldFiles(onReady) {
  const urls = new Set();
  for (const def of Object.values(FIELD_SPRITE_ASSETS)) {
    if (!def.files) continue;
    for (const list of Object.values(def.files)) for (const u of list) urls.add(u);
  }
  if (!urls.size) return Promise.resolve(false);
  return Promise.all([...urls].map((u) => new Promise((res) => {
    const img = new Image();
    img.onload = () => { fileImages.set(u, img); res(true); };
    img.onerror = () => { console.warn(`[field] 원화 로드 실패: ${u}`); res(false); };
    img.src = u;
  }))).then((r) => {
    cache.clear();
    if (onReady) onReady();
    return r.some(Boolean);
  });
}

// 낱장 파일로 한 방향을 만든다. 파일이 하나라도 없으면 null.
//
// ★한 장만 있으면 걷기 2프레임을 만들어 준다.
//   원화를 프레임마다 일관되게 뽑는 건 어렵고 비싸다. 그래서 **서 있는 그림 한 장**만 받아
//   두 번째 프레임을 코드로 만든다: 몸을 1px 내리고 아래쪽(다리)만 1px 눌러
//   무게가 실리는 순간을 흉내낸다. 탑다운 32px 타일 위에서는 이것만으로 걷는 것으로 읽힌다.
//   프레임을 여러 장 주면 당연히 그쪽이 낫다 — 그때는 이 보정이 꺼진다.
function bobFrame(src, w, h, footY) {
  return prerender(w, h, (g) => {
    g.imageSmoothingEnabled = false;
    const legTop = Math.max(0, (footY ?? h) - 14);   // 이 아래를 '다리'로 본다
    g.drawImage(src, 0, 0, w, legTop, 0, 1, w, legTop);            // 상체: 1px 아래로
    g.drawImage(src, 0, legTop, w, h - legTop, 0, legTop + 1, w, h - legTop - 1); // 다리: 1px 눌림
  });
}

function fileFrames(def, dir) {
  const list = def.files?.[dir];
  if (!list?.length) return null;
  const base = [];
  for (const u of list) {
    const src = fileImages.get(u);
    if (!src) return null;
    const w = def.drawW ?? src.width;
    const h = def.drawH ?? src.height;
    base.push(prerender(w, h, (g) => {
      g.imageSmoothingEnabled = false;
      if (def.mirror?.includes(dir)) { g.translate(w, 0); g.scale(-1, 1); }
      g.drawImage(src, 0, 0, src.width, src.height, 0, 0, w, h);
    }));
  }
  if (base.length === 1) {
    const c = base[0];
    return [c, bobFrame(c, c.width, c.height, def.footY)];
  }
  return base;
}

// 등록표대로 만든다. 못 만들면 null → 코드 생성본으로 넘어간다.
function artSprites(key) {
  const def = FIELD_SPRITE_ASSETS[key];
  if (!def) return null;

  // ① 낱장 원화 — 네 방향이 **전부** 있어야 채택한다.
  //    반쪽만 원화면 모퉁이를 돌 때마다 화풍이 바뀌어 오히려 더 나쁘다.
  if (def.files) {
    const set = {};
    let ok = true;
    for (const dir of DIRS) {
      const f = fileFrames(def, dir);
      if (!f) { ok = false; break; }
      set[dir] = f;
    }
    if (ok) {
      // 발끝 기준으로 그리기 위한 정보를 같이 실어 보낸다 (32×32에 안 갇힌다)
      set.meta = {
        footY: def.footY ?? null, w: set.down[0].width, h: set.down[0].height,
        idleFrame: def.idleFrame ?? null,   // 멈췄을 때 쓸 프레임 (없으면 0번)
      };
      return set;
    }
  }

  // ② 시트에서 잘라 쓰기
  const img = sheetImages.get(def.sheet);
  if (!img) return null;
  const fw = def.frameW ?? FIELD_SIZE, fh = def.frameH ?? FIELD_SIZE;
  const scale = def.scale ?? Math.round(FIELD_SIZE / fw);
  if (!Number.isInteger(scale) || scale < 1) {
    console.warn('[field] 정수배가 아닌 스케일은 쓸 수 없다', key);
    return null;
  }
  const set = {};
  for (const dir of DIRS) {
    const frames = def[dir];
    if (!frames?.length) return null;      // 한 방향이라도 빠지면 통째로 코드 생성본을 쓴다
    set[dir] = frames.map((f) => toneCanvas(prerender(FIELD_SIZE, FIELD_SIZE, (g) => {
      g.imageSmoothingEnabled = false;
      const dy = FIELD_SIZE - fh * scale;   // 발끝을 칸 아래에 맞춘다
      // 옆모습이 한쪽만 있는 시트가 많다 — 반대쪽은 좌우로 뒤집어 쓴다.
      // 정수 좌표 반전이라 픽셀이 뭉개지지 않는다 (절대 규칙 7).
      if (f.flip) {
        g.translate(FIELD_SIZE, 0);
        g.scale(-1, 1);
      }
      g.drawImage(img, f.sx, f.sy, fw, fh, 0, dy, fw * scale, fh * scale);
    }), { darken: def.darken ?? 0.10, desaturate: def.desaturate ?? 0.12,
           colorKey: def.colorKey ?? null, alphaCut: def.colorKey ? 8 : 128 }));
  }
  return set;
}

// 인물 배치 (32×32 기준, 발끝 y=30)
//   머리 y6~16 / 몸통 y16~25 / 다리 y25~30 / 그림자 y29~31
// 2.5등신 — 32px 안에서 얼굴이 읽히는 최소 비율이다.
const HEAD_TOP = 5, HEAD_H = 11, HEAD_W = 13;
const BODY_TOP = 16, BODY_H = 9, BODY_W = 11;

function drawFieldUnit(g, cfg, dir, frame) {
  const P = PALETTE;
  const SK = P[cfg.skin] ?? cfg.skin ?? P.peach;
  const HR = P[cfg.hair] ?? cfg.hair ?? P.brownDark;
  const AR = P[cfg.armor] ?? cfg.armor ?? P.navy3;
  const AD = P[cfg.armorDark] ?? cfg.armorDark ?? P.navy2;
  const CL = P[cfg.cloth] ?? cfg.cloth ?? P.gray3;
  const TRIM = P[cfg.trim] ?? cfg.trim ?? P.goldDark;

  const cx = 16;
  const px = (c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };

  // 걷기: 프레임마다 몸 전체가 1px 오르내리고 다리가 엇갈린다
  const bob = frame === 1 ? 1 : 0;
  const step = frame === 1 ? 1 : -1;

  // ----- 그림자 -----
  g.fillStyle = 'rgba(13, 11, 20, 0.42)';
  g.beginPath();
  g.ellipse(cx, 30, 8, 3, 0, 0, Math.PI * 2);
  g.fill();

  // ----- 다리 -----
  const legY = 25 + bob;
  const legColor = cfg.skeleton ? P.gray4 : AD;
  if (dir === 'left' || dir === 'right') {
    // 옆모습: 앞뒤로 벌어진다
    px(legColor, cx - 3 + step * 2, legY, 3, 5);
    px(P.black, cx - 3 + step * 2, legY + 4, 3, 1);
    px(legColor, cx + 1 - step * 2, legY, 3, 5);
    px(P.black, cx + 1 - step * 2, legY + 4, 3, 1);
  } else {
    px(legColor, cx - 4, legY, 3, 5 - (step > 0 ? 1 : 0));
    px(legColor, cx + 2, legY, 3, 5 - (step < 0 ? 1 : 0));
    px(P.black, cx - 4, legY + 4 - (step > 0 ? 1 : 0), 3, 1);
    px(P.black, cx + 2, legY + 4 - (step < 0 ? 1 : 0), 3, 1);
  }

  // ----- 망토 (있으면 몸통 뒤에) -----
  if (cfg.cape) {
    const CP = P[cfg.cape] ?? cfg.cape;
    if (dir === 'up') px(CP, cx - 6, BODY_TOP + bob - 1, 12, 12);
    else if (dir === 'down') { px(CP, cx - 7, BODY_TOP + bob, 2, 10); px(CP, cx + 5, BODY_TOP + bob, 2, 10); }
    else px(CP, dir === 'left' ? cx + 2 : cx - 6, BODY_TOP + bob - 1, 4, 11);
  }

  // ----- 몸통 -----
  const bx = cx - Math.floor(BODY_W / 2);
  const by = BODY_TOP + bob;
  px(AR, bx, by, BODY_W, BODY_H);
  px(AD, bx, by + BODY_H - 2, BODY_W, 2);            // 아래 그늘
  px(AD, dir === 'left' ? bx + BODY_W - 2 : bx, by, 2, BODY_H); // 측면 그늘
  px(TRIM, bx, by + 3, BODY_W, 1);                    // 허리띠
  if (dir === 'down') px(CL, cx - 2, by, 4, 4);       // 앞섶
  if (dir === 'up') px(CL, cx - 2, by + 1, 4, 5);     // 등 장식

  // ----- 팔 -----
  const armY = by + 1;
  const armC = cfg.skeleton ? P.gray4 : AR;
  if (dir === 'left' || dir === 'right') {
    px(armC, dir === 'left' ? bx - 1 : bx + BODY_W, armY + (step > 0 ? 1 : 0), 2, 6);
  } else {
    px(armC, bx - 2, armY + (step > 0 ? 1 : 0), 2, 6);
    px(armC, bx + BODY_W, armY + (step < 0 ? 1 : 0), 2, 6);
  }

  // ----- 머리 -----
  const hx = cx - Math.floor(HEAD_W / 2);
  const hy = HEAD_TOP + bob;
  if (dir === 'up') {
    // 뒷모습 — 얼굴 없이 머리카락만
    px(HR, hx, hy, HEAD_W, HEAD_H);
    px(P.black, hx, hy + HEAD_H - 1, HEAD_W, 1);
  } else {
    px(SK, hx + 1, hy + 2, HEAD_W - 2, HEAD_H - 2);   // 얼굴
    px(HR, hx, hy, HEAD_W, 4);                        // 앞머리
    px(HR, hx, hy, 2, HEAD_H - 3);                    // 옆머리
    px(HR, hx + HEAD_W - 2, hy, 2, HEAD_H - 3);
    if (cfg.skeleton) {
      // 해골: 눈구멍이 크고 비어 있다
      px(P.gray4, hx + 1, hy + 2, HEAD_W - 2, HEAD_H - 2);
      px(P.black, hx + 3, hy + 5, 3, 3);
      px(P.black, hx + HEAD_W - 6, hy + 5, 3, 3);
      px(P.gray2, hx + 4, hy + 9, 5, 1);
    } else if (dir === 'down') {
      px(P.black, hx + 3, hy + 6, 2, 2);
      px(P.black, hx + HEAD_W - 5, hy + 6, 2, 2);
    } else {
      // 옆모습: 눈 하나 + 코 실루엣
      const ex = dir === 'left' ? hx + 3 : hx + HEAD_W - 5;
      px(P.black, ex, hy + 6, 2, 2);
      px(SK, dir === 'left' ? hx : hx + HEAD_W - 1, hy + 6, 1, 2);
    }
  }

  // ----- 무기 (뒤로 멘 실루엣 — 필드에서는 들지 않는다) -----
  const w = cfg.weapon;
  if (w && dir !== 'up') {
    const wx = dir === 'left' ? cx + 4 : dir === 'right' ? cx - 6 : cx + 5;
    if (w === 'bow') {
      px(P.brownDark, wx, by - 3, 1, 13);
      px(P.tan, wx + 1, by - 2, 1, 11);
    } else if (w === 'staff') {
      px(P.brownDark, wx, by - 6, 1, 16);
      px(P.cyan, wx - 1, by - 8, 3, 3);
    } else if (w === 'bone') {
      px(P.gray4, wx, by - 1, 1, 9);
    } else {
      // 검·창·단검·도끼는 등에 사선으로
      px(P.gray3, wx, by - 4, 2, 12);
      px(TRIM, wx, by + 4, 2, 2);
    }
  }
  if (cfg.shield && dir !== 'up') {
    const sx = dir === 'left' ? cx - 8 : cx + 6;
    px(AD, sx, by + 1, 3, 6);
    px(TRIM, sx, by + 3, 3, 1);
  }
}

// cfg + 캐시 키. 같은 외형이면 한 번만 만든다.
function cfgKey(cfg) {
  return [cfg.skin, cfg.hair, cfg.armor, cfg.armorDark, cfg.cloth, cfg.weapon,
    cfg.cape ?? '-', cfg.trim ?? '-', cfg.shield ? 's' : '-', cfg.skeleton ? 'k' : '-'].join('|');
}

// { down:[c0,c1], up:[...], left:[...], right:[...] }
// artKey를 주고 그 캐릭터가 등록표에 있으면 그림을, 없으면 코드 생성본을 만든다.
//
// ★코드 생성본은 **전투 스프라이트 생성기(makeUnitSprites)를 그대로 쓴다** (2026-08-03 변경).
//   그쪽은 고해상도(4배) 벡터 곡선 → 면적평균 축소 → 팔레트 양자화 → 외곽선 파이프라인이라
//   64×64에서 망토가 휘고 어깨가 둥글게 나온다. 원래 여기 있던 32×32 직접 픽셀 그리기보다
//   비교가 안 되게 좋고, **전투와 같은 생성기라 필드↔전투 화풍이 저절로 일치한다.**
//   makeUnitSprites는 이미 idle에 4방향(down/up/left/right)을 만들어 두고 있었다.
export function makeFieldSprites(cfg, artKey = null) {
  const key = (artKey && hasFieldArt(artKey) ? `art:${artKey}` : `unit:${cfgKey(cfg)}`);
  if (cache.has(key)) return cache.get(key);

  if (artKey && hasFieldArt(artKey)) {
    const art = artSprites(artKey);
    if (art) { cache.set(key, art); return art; }
    // 그림이 아직 안 왔거나 규격이 틀렸으면 아래 코드 생성본으로 내려간다
  }

  // 전투 생성기의 4방향 세트를 그대로 쓴다 (64×64, 발끝이 아래쪽에 정렬돼 있다)
  if (cfg && (cfg.skin || cfg.armor)) {
    const unit = makeUnitSprites(cfg);
    if (unit?.idle?.down?.length) {
      const set = {
        down: unit.idle.down, up: unit.idle.up,
        left: unit.idle.left, right: unit.idle.right,
        // 64×64 안에서 발끝은 y=62 근처다 (전투 렌더가 py-drawH+8로 그리는 것과 같은 기준)
        meta: { footY: 56, w: 64, h: 64 },
      };
      cache.set(key, set);
      return set;
    }
  }

  const set = {};
  for (const dir of DIRS) {
    set[dir] = [];
    for (let f = 0; f < WALK_FRAMES; f++) {
      set[dir].push(prerender(FIELD_SIZE, FIELD_SIZE, (g) => {
        g.imageSmoothingEnabled = false;
        drawFieldUnit(g, cfg, dir, f);
      }));
    }
  }
  cache.set(key, set);
  return set;
}
