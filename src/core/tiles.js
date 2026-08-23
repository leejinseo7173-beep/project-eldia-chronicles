// ============================================================
// tiles.js — 필드 타일 32×32 코드 생성 + 맵 통짜 프리렌더 (절대 규칙 7)
//
// 그리기는 여기(core), 배치는 data/maps.js. 타일 문자 → TILES[c].id → 이 파일의 그리기 함수.
//
// 성능 설계:
//   ① 타일 그림은 로드 시 1회 생성해 캐시한다.
//   ② 맵 전체(1280×960)를 **한 장의 오프스크린 캔버스**에 미리 깔아 둔다.
//      매 프레임은 그 캔버스에서 카메라 사각형만 잘라 그리는 drawImage 1회다.
//   ③ 예외는 물결과 드러난 숨김길뿐 — 상태가 변하거나 움직이므로 위에 덧그린다.
//      화면에 보이는 물 타일은 많아야 40장이라 비용이 사실상 0이다.
//
// 무늬의 무작위성은 전부 시드 RNG다 (절대 규칙 5). 같은 맵은 항상 같은 모양으로 깔린다.
// ============================================================

import { PALETTE, makeCanvas, prerender, toneCanvas } from './sprites.js';
import { RNG } from './rng.js';
import { TILES, MAP_W, MAP_H, TILE } from '../data/maps.js';
import { TILE_SHEETS, TILE_ASSETS, TILE_PATTERNS, WATER_ART, TILE_TONE, OBJECT_SHEETS, OBJECT_ASSETS, tileArtEntries, hasTileArt } from '../data/tile_assets.js';

export const WATER_FRAMES = 3;
export const WATER_FRAME_SEC = 0.34;

// ----- 타일 그리기 -----
// 전부 32×32. 팔레트 32색만 쓴다 (기획서 §16 아트 통일성).

const px = (g, c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

// 풀 바닥 — 모든 지상 타일의 기본. variant로 점 무늬가 달라진다.
// 점을 아끼면 32×32가 통짜 초록 블록으로 보인다(실측: 노이즈 66px면 94%가 단색).
// 짧은 빗금을 촘촘히 깔아 잔디 결을 만든다.
function drawGrass(g, rng) {
  px(g, PALETTE.greenDark, 0, 0, TILE, TILE);
  for (let i = 0; i < 90; i++) {
    const x = rng.int(0, 31), y = rng.int(0, 31);
    px(g, PALETTE.forest, x, y, rng.int(1, 3), 1);
  }
  for (let i = 0; i < 46; i++) px(g, PALETTE.green, rng.int(0, 31), rng.int(0, 31), 1, 1);
  // 결 방향을 살짝 주는 세로 빗금
  for (let i = 0; i < 12; i++) px(g, PALETTE.forest, rng.int(0, 31), rng.int(0, 29), 1, 2);
}

function drawGrassTuft(g, rng) {
  drawGrass(g, rng);
  for (let i = 0; i < 3; i++) {
    const x = rng.int(6, 25), y = rng.int(10, 26);
    px(g, PALETTE.green, x, y - 4, 1, 5);
    px(g, PALETTE.green, x - 2, y - 2, 1, 3);
    px(g, PALETTE.green, x + 2, y - 3, 1, 4);
  }
}

function drawFlower(g, rng) {
  drawGrass(g, rng);
  const colors = [PALETTE.gold, PALETTE.pink, PALETTE.white];
  for (let i = 0; i < 4; i++) {
    const x = rng.int(5, 26), y = rng.int(6, 26);
    const c = rng.pick(colors);
    px(g, PALETTE.forest, x, y + 1, 1, 3);
    px(g, c, x - 1, y, 3, 1);
    px(g, c, x, y - 1, 1, 3);
  }
}

// 흙길 — 밟혀 다져진 자국
function drawRoad(g, rng) {
  px(g, PALETTE.brownDark, 0, 0, TILE, TILE);
  for (let i = 0; i < 80; i++) px(g, PALETTE.brown, rng.int(0, 31), rng.int(0, 31), rng.int(1, 3), 1);
  for (let i = 0; i < 26; i++) px(g, PALETTE.tan, rng.int(0, 31), rng.int(0, 31), 1, 1);
  for (let i = 0; i < 5; i++) px(g, PALETTE.gray2, rng.int(2, 29), rng.int(2, 29), 2, 2);
}

// 나무 다리 — 가로 판자 + 세로 이음매
function drawBridge(g, rng) {
  px(g, PALETTE.brownDark, 0, 0, TILE, TILE);
  for (let y = 0; y < TILE; y += 6) {
    px(g, PALETTE.brown, 0, y, TILE, 5);
    px(g, PALETTE.brownDark, 0, y + 5, TILE, 1);
  }
  px(g, PALETTE.tan, 0, 0, 2, TILE);
  px(g, PALETTE.tan, 30, 0, 2, TILE);
}

// 나무 — 아래는 풀, 위로 기둥과 수관
//
// 주의할 게 둘 있다:
//   ① 수관을 기둥보다 **나중에, 기둥 높이까지 내려** 그리면 기둥이 통째로 덮인다
//      (실측: 갈색 픽셀이 0개였다). 수관은 y20 위로만 두고 기둥은 그 아래로 뺀다.
//   ② 수관 안쪽을 greenDark로 칠하면 **풀 바닥과 같은 색**이라 나무가 배경에 녹는다.
//      바깥을 forest(어두움)로 잡아 풀보다 어둡게 만들어야 실루엣이 선다.
function drawTree(g, rng) {
  drawGrass(g, rng);
  // 기둥 먼저 (수관에 가려지지 않는 아래쪽)
  px(g, PALETTE.brownDark, 14, 19, 5, 11);
  px(g, PALETTE.brown, 14, 19, 2, 11);
  px(g, PALETTE.black, 12, 29, 9, 2);          // 뿌리 그림자
  // 수관: 세 덩이를 겹쳐 둥글게 (전부 y20 위)
  const blobs = [[16, 10, 10], [9, 14, 7], [23, 14, 7]];
  for (const [cx, cy, r] of blobs) {
    for (let y = -r; y <= r; y++) {
      const w = Math.round(Math.sqrt(Math.max(0, r * r - y * y)));
      px(g, PALETTE.forest, cx - w, cy + y, w * 2, 1);
    }
  }
  // 왼쪽 위에서 빛을 받는 하이라이트
  for (const [cx, cy, r] of blobs) {
    for (let y = -r + 2; y <= 0; y++) {
      const w = Math.round(Math.sqrt(Math.max(0, (r - 3) * (r - 3) - y * y)));
      px(g, PALETTE.greenDark, cx - w - 1, cy + y - 1, w * 2, 1);
    }
  }
  for (let i = 0; i < 14; i++) px(g, PALETTE.green, rng.int(6, 26), rng.int(2, 17), 1, 1);
}

function drawRock(g, rng) {
  drawGrass(g, rng);
  // 사다리꼴 바위 + 윗면 밝게
  for (let y = 0; y < 20; y++) {
    const w = 10 + Math.round(y * 0.7);
    px(g, PALETTE.gray1, 16 - w, 30 - y, w * 2, 1);
  }
  for (let y = 0; y < 8; y++) {
    const w = 6 + Math.round(y * 0.6);
    px(g, PALETTE.gray2, 16 - w, 12 + y, w * 2, 1);
  }
  for (let i = 0; i < 6; i++) px(g, PALETTE.gray3, rng.int(9, 22), rng.int(12, 24), 2, 1);
  px(g, PALETTE.black, 0, 30, TILE, 2);
}

// 물 — 프레임마다 물결 위상이 밀린다
function drawWater(g, rng, frame) {
  px(g, PALETTE.navy2, 0, 0, TILE, TILE);
  for (let y = 0; y < TILE; y++) {
    const s = Math.sin((y + frame * 4) * 0.5);
    px(g, PALETTE.navy3, 0, y, TILE, 1);
    if (s > 0.6) px(g, PALETTE.blue, Math.round(4 + s * 6), y, 12, 1);
    if (s < -0.7) px(g, PALETTE.navy1, Math.round(18 + s * 4), y, 10, 1);
  }
  for (let i = 0; i < 5; i++) px(g, PALETTE.skyBlue, rng.int(0, 30), (rng.int(0, 31) + frame * 5) % 32, 2, 1);
}

// 절벽 — 맵 경계. 위쪽에 밝은 면, 아래로 어두운 결
function drawCliff(g, rng) {
  px(g, PALETTE.ink, 0, 0, TILE, TILE);
  px(g, PALETTE.gray1, 0, 0, TILE, 8);
  px(g, PALETTE.gray2, 0, 0, TILE, 3);
  for (let i = 0; i < 22; i++) px(g, PALETTE.black, rng.int(0, 31), rng.int(8, 31), 2, rng.int(2, 6));
  for (let i = 0; i < 8; i++) px(g, PALETTE.gray1, rng.int(0, 31), rng.int(9, 30), 1, 3);
}

// 드러난 숨김길 — 무너진 바위 틈. 발견 후에만 이 모양으로 덧그린다
function drawHiddenOpen(g, rng) {
  drawGrass(g, rng);
  // 좌우로 갈라진 바위 벽
  for (let y = 0; y < 22; y++) {
    const w = 5 + Math.round(y * 0.25);
    px(g, PALETTE.gray1, 0, 30 - y, w, 1);
    px(g, PALETTE.gray1, TILE - w, 30 - y, w, 1);
  }
  for (let i = 0; i < 6; i++) px(g, PALETTE.gray2, rng.int(0, 5), rng.int(12, 28), 2, 1);
  for (let i = 0; i < 6; i++) px(g, PALETTE.gray2, rng.int(26, 31), rng.int(12, 28), 2, 1);
  // 안쪽 어둠
  px(g, PALETTE.black, 8, 10, 16, 20);
  px(g, PALETTE.ink, 10, 12, 12, 16);
}

const DRAW = {
  grass: drawGrass, grassTuft: drawGrassTuft, flower: drawFlower,
  road: drawRoad, bridge: drawBridge, tree: drawTree, rock: drawRock,
  cliff: drawCliff,
  // 숨김길은 **발견 전에는 바위와 똑같이** 생겨야 한다. 그래야 숨긴 것이다.
  hidden: drawRock,
};

// ----- 외부/자체 타일 그림 로드 (절대 규칙 1 개정 2026-08-03) -----
// 등록된 타일은 그림을 쓰고, 없는 타일은 아래 코드 생성으로 그린다.
// 그림은 비동기로 오므로, 다 오면 캐시를 비워 맵을 다시 굽는다.
const sheetImages = new Map();
let sheetsReady = false;

export function loadTileSheets(onReady) {
  const keys = [...Object.keys(TILE_SHEETS), ...Object.keys(OBJECT_SHEETS)];
  if (!keys.length) { sheetsReady = true; return Promise.resolve(false); }
  return Promise.all(keys.map((k) => new Promise((res) => {
    const img = new Image();
    img.onload = () => { sheetImages.set(k, img); res(true); };
    img.onerror = () => { console.warn(`[tiles] 타일 시트 로드 실패: ${TILE_SHEETS[k]}`); res(false); };
    img.src = TILE_SHEETS[k] ?? OBJECT_SHEETS[k];
  }))).then((r) => {
    sheetsReady = true;
    // 그림이 늦게 왔으면 이미 구워 둔 맵이 코드 생성본이다 — 캐시를 비워 다시 굽게 한다
    invalidateTileCaches();
    if (onReady) onReady();
    return r.some(Boolean);
  });
}

export function invalidateTileCaches() {
  tileCache.clear();
  mapCache.clear();
  waterCache = null;
  hiddenOpenCache = null;
  objCache.clear();
}

// 등록표의 한 항목을 32×32 캔버스로 잘라 낸다 (정수배 확대만 허용 — 절대 규칙 7)
function cutTileArt(entry, rng) {
  const img = sheetImages.get(entry.sheet);
  if (!img) return null;
  const w = entry.w ?? TILE, h = entry.h ?? TILE;
  const scale = entry.scale ?? Math.round(TILE / w);
  if (!Number.isInteger(scale) || scale < 1) {
    console.warn('[tiles] 정수배가 아닌 스케일은 쓸 수 없다', entry);
    return null;
  }
  const c = prerender(TILE, TILE, (g) => {
    g.imageSmoothingEnabled = false;
    // base가 있으면 아래에 먼저 깐다(나무·바위·꽃처럼 배경이 투명한 타일).
    // ★base도 **그림**으로 깐다 — 코드 생성 잔디를 깔면 오브젝트 주변만 배경이 달라져
    //   오브젝트마다 사각형 얼룩이 생긴다. 그림이 없을 때만 코드 생성으로 떨어진다.
    if (entry.base) {
      const bases = tileArtEntries(entry.base);
      const be = bases.length ? bases[rng.int(0, bases.length - 1)] : null;
      const bimg = be && sheetImages.get(be.sheet);
      if (bimg) {
        g.drawImage(bimg, be.sx, be.sy, be.w ?? TILE, be.h ?? TILE, 0, 0, TILE, TILE);
      } else if (DRAW[entry.base]) {
        DRAW[entry.base](g, rng);
      }
    }
    g.drawImage(img, entry.sx, entry.sy, w, h, 0, 0, w * scale, h * scale);
  });
  // 결 넣기 — 이 팩의 바닥 타일은 원래 평평하다(실측: 풀 1024px 중 96%가 한 색).
  // 넓게 깔면 통짜 색면으로 보이므로 **타일 자신의 평균색에서 뽑은** 밝고 어두운 점을 흩뿌린다.
  // 새 색을 들여오지 않으므로 원본 화풍을 해치지 않는다.
  if (entry.speckle) addSpeckle(c, entry.speckle, rng);
  // 톤만 맞춘다 (팔레트 스냅 없음 — 스냅하면 잔디 결이 통째로 사라진다. sprites.js 주석 참조)
  return toneCanvas(c, { darken: TILE_TONE.darken, desaturate: TILE_TONE.desaturate, alphaCut: 128 });
}

function addSpeckle(canvas, n, rng) {
  const g = canvas.getContext('2d');
  const img = g.getImageData(0, 0, TILE, TILE);
  const d = img.data;
  let r = 0, gg = 0, b = 0, k = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; k++; }
  if (!k) return canvas;
  r /= k; gg /= k; b /= k;
  const put = (x, y, m) => {
    if (x < 0 || x >= TILE || y < 0 || y >= TILE) return;
    const i = (y * TILE + x) * 4;
    if (d[i + 3] < 200) return;
    d[i] = Math.min(255, r * m); d[i + 1] = Math.min(255, gg * m); d[i + 2] = Math.min(255, b * m);
  };
  for (let i = 0; i < n; i++) {
    const x = rng.int(0, TILE - 1), y = rng.int(0, TILE - 1);
    const m = rng.chance(0.5) ? 0.86 : 1.12;
    put(x, y, m);
    if (rng.chance(0.45)) put(x + 1, y, m);
  }
  g.putImageData(img, 0, 0);
  return canvas;
}

// ----- 타일 캐시 -----
// 같은 종류라도 변형을 여러 장 만들어 번갈아 깐다. 한 장만 쓰면 격자무늬가 눈에 띈다.
const VARIANTS = 4;
const tileCache = new Map();

function tileVariants(id) {
  if (tileCache.has(id)) return tileCache.get(id);
  const list = [];

  // ① 등록된 그림이 있으면 그것을 쓴다
  if (hasTileArt(id) && sheetImages.size) {
    const entries = tileArtEntries(id);
    entries.forEach((e, i) => {
      const c = cutTileArt(e, new RNG(`tile-${id}-art-${i}`));
      if (c) list.push(c);
    });
  }
  // ② 없거나 실패하면 코드 생성 (임시 대체)
  if (!list.length) {
    const draw = DRAW[id];
    for (let v = 0; v < VARIANTS; v++) {
      const rng = new RNG(`tile-${id}-${v}`);
      list.push(prerender(TILE, TILE, (g) => draw(g, rng)));
    }
  }
  tileCache.set(id, list);
  return list;
}

let waterCache = null;
export function waterFrames() {
  if (waterCache) return waterCache;
  waterCache = [];
  // 등록된 물 그림이 있으면 그 프레임들을 번갈아 쓴다 (흐르는 느낌은 프레임 교체로)
  if (WATER_ART?.length && sheetImages.size) {
    for (const e of WATER_ART) {
      const c = cutTileArt(e, new RNG('water-art'));
      if (c) waterCache.push(c);
    }
  }
  if (!waterCache.length) {
    for (let f = 0; f < WATER_FRAMES; f++) {
      const rng = new RNG(`tile-water-${f}`);
      waterCache.push(prerender(TILE, TILE, (g) => drawWater(g, rng, f)));
    }
  }
  return waterCache;
}

let hiddenOpenCache = null;
export function hiddenOpenTile() {
  if (!hiddenOpenCache) {
    const rng = new RNG('tile-hidden-open');
    hiddenOpenCache = prerender(TILE, TILE, (g) => drawHiddenOpen(g, rng));
  }
  return hiddenOpenCache;
}

// ----- 맵 통짜 프리렌더 -----
// 물은 굽지 않는다(움직이므로). 대신 물 자리에 어두운 바닥만 깔아 두고 매 프레임 덧그린다.
const mapCache = new Map();

export function mapCanvas(map) {
  if (mapCache.has(map.id)) return mapCache.get(map.id);
  const [c, g] = makeCanvas(MAP_W * TILE, MAP_H * TILE);
  const pick = new RNG(`map-${map.id}`);
  // 같은 id 이웃 확인 — 숲 퀼트의 단독 나무 판정에 쓴다
  const sameNeighbor = (x, y, id) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
    const r = map.rows[y + dy];
    return r && TILES[r[x + dx]]?.id === id;
  });
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const def = TILES[map.rows[y][x]];
      if (!def) continue;
      if (def.id === 'water') { px(g, PALETTE.navy1, x * TILE, y * TILE, TILE, TILE); continue; }
      const vs = tileVariants(def.id);
      // ★퀼트 타일(숲): 변형을 랜덤이 아니라 **좌표 패리티**로 고른다.
      //   [좌상,우상,좌하,우하,단독] 순서라 2×2 원본이 이음새 없이 이어진다.
      //   랜덤으로 고르면 조각이 어긋나 숲이 격자 조각보로 보인다.
      let idx;
      if (TILE_PATTERNS[def.id] === '2x2' && vs.length >= 5) {
        idx = sameNeighbor(x, y, def.id) ? (y % 2) * 2 + (x % 2) : 4;
      } else {
        idx = pick.int(0, vs.length - 1);
      }
      g.drawImage(vs[idx], x * TILE, y * TILE);
    }
  }
  // 맵별 색조 (데이터의 tone 필드) — 프리렌더에 한 번만 굽는다.
  // 잿빛 숲: 채도를 죽이고 잿빛 막을 얹는다. 물 애니는 위에 덧그려져 톤을 안 받지만,
  // 어차피 물은 어느 맵에서든 같은 물이라 어색하지 않다.
  if (map.tone) {
    const t = map.tone;
    g.filter = `saturate(${t.saturate ?? 1}) brightness(${t.brightness ?? 1})`;
    g.drawImage(c, 0, 0);
    g.filter = 'none';
    if (t.ash) {
      g.fillStyle = t.ash;
      g.fillRect(0, 0, MAP_W * TILE, MAP_H * TILE);
    }
  }
  mapCache.set(map.id, c);
  return c;
}

// 이 맵의 물 타일 좌표 목록 (매 프레임 덧그릴 대상)
const waterCoordCache = new Map();
export function waterTiles(map) {
  if (waterCoordCache.has(map.id)) return waterCoordCache.get(map.id);
  const list = [];
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (TILES[map.rows[y][x]]?.id === 'water') list.push([x, y]);
    }
  }
  waterCoordCache.set(map.id, list);
  return list;
}

// 필드 오브젝트 아이콘 — 등록돼 있고 그림이 도착했으면 32×32 캔버스를, 없으면 null.
// null이면 field.js가 코드 생성으로 그린다.
const objCache = new Map();
export function objectArt(key) {
  if (objCache.has(key)) return objCache.get(key);
  const e = OBJECT_ASSETS[key];
  const c = e ? cutTileArt(e, new RNG(`obj-${key}`)) : null;
  objCache.set(key, c);
  return c;
}

export function isSolid(map, tx, ty) {
  if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return true;
  return TILES[map.rows[ty][tx]]?.solid ?? true;
}

export function tileAt(map, tx, ty) {
  if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return null;
  return TILES[map.rows[ty][tx]] ?? null;
}
