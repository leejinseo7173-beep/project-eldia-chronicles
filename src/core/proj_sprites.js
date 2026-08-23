// ============================================================
// proj_sprites.js — 투사체 스프라이트 생성기 (2026-08-05)
//
// 사용자 레퍼런스(픽셀 스킬 이펙트 시트)의 **불꽃 혀가 달린 혜성형 화구**를
// 코드로 굽는다. 이전 투사체(사각형 줄무늬 16px)가 부실했던 이유는 픽셀이
// 모자라서가 아니라 **그리질 않아서**다 — 여기서는 40×22 아트 픽셀을
// 2배 블록(80×44 화면px)으로 키워 디테일을 채운다.
//
// 절대 규칙 7 준수: 로드 시 프레임별로 프리렌더하고 재사용한다.
// 비행 각도는 그리지 않는다(회전 금지) — 수평 스프라이트를 좌우 반전만 한다.
// 랜덤은 전부 시드 RNG(규칙 5). 같은 색은 항상 같은 그림이 나온다.
// ============================================================

import { PALETTE, prerender } from './sprites.js';
import { RNG } from './rng.js';

// 색 램프 — 뜨거운 심(흰색)부터 차가운 가장자리까지.
// 레퍼런스의 화구가 흰→노랑→주황→빨강→암적 순서로 식는 것을 그대로 옮겼다.
// 마지막 색은 테두리(rim) — 픽셀아트가 배경에서 읽히게 하는 어두운 띠.
const P = PALETTE;
const RAMPS = {
  red:    [P.white, P.yellow, P.gold, P.amber, P.orange, P.red, P.redDark],
  orange: [P.white, P.yellow, P.gold, P.amber, P.orange, P.red, P.redDark],
  gold:   [P.white, P.yellow, P.yellow, P.gold, P.amber, P.goldDark, P.brownDark],
  purple: [P.white, P.pink, P.magenta, P.magenta, P.purple, P.purple, P.purpleDark],
  blue:   [P.white, P.cyan, P.cyan, P.skyBlue, P.blue, P.blue, P.navy3],
  cyan:   [P.white, P.cyan, P.cyan, P.teal, P.teal, P.blue, P.navy3],
  green:  [P.white, P.yellow, P.green, P.green, P.greenDark, P.greenDark, P.forest],
};
const rampOf = (key) => RAMPS[key] ?? RAMPS.gold;

// heat(0=심 ~ 1=가장자리) → 램프 색. 1을 살짝 넘는 구간이 rim.
function shade(ramp, heat) {
  if (heat > 1.0) return ramp[6];
  return ramp[Math.min(5, Math.floor(heat * 6))];
}

const cache = new Map();

// ----- 혜성형 화구 (bolt·orb 계열) -----
//
// 구조: 오른쪽 머리(원형 코어) + 왼쪽으로 갈수록 가늘어지는 몸통 +
//       꼬리 뒤에 떨어져 나온 불꽃 혀 3~4개 + 꼬리 속 불티.
// 프레임 4장 — 혀의 위치·꼬리 길이·가장자리 노이즈가 매 프레임 달라
//              12fps로 돌리면 타오르는 것처럼 읽힌다.
export function flameFrames(colorKey, px = 2) {
  const key = `flame:${colorKey}:${px}`;
  if (cache.has(key)) return cache.get(key);

  const ramp = rampOf(colorKey);
  // 40×22(×3배 = 120×66)는 "너무 크다"(사용자) — 33×19(99×57)로. 2배 블록 시절(80×44)과
  // 3배 최초판 사이. 더 줄이려면 여기 그리드를, 더 키우려면 fx.js의 basePx를 만진다.
  const W = 33, H = 19;              // 아트 픽셀
  const HX = 25, HY = 9, HEAD_R = 6.3;
  const FRAMES = 4;
  const rng = new RNG(`proj-flame-${colorKey}`);
  const frames = [];

  for (let f = 0; f < FRAMES; f++) {
    // 프레임별 결정적 노이즈 그리드 — 가장자리를 너덜너덜하게 만든다
    const noise = [];
    for (let i = 0; i < W * H; i++) noise.push((rng.next() - 0.5) * 2);
    const tailX = 3 + rng.int(0, 3);               // 꼬리 끝 (프레임마다 살짝 다름)
    const wob = rng.next() * Math.PI * 2;          // 몸통 물결 위상

    // 떨어져 나온 불꽃 혀 — 꼬리 뒤에서 따라오는 작은 불덩이들
    const licks = [];
    for (let k = 0; k < 4; k++) {
      licks.push({
        x: tailX + 1 + k * 3.6 + rng.next() * 2.5,
        y: HY + (rng.next() - 0.5) * 7,
        r: 1.3 + rng.next() * 1.9,
      });
    }
    // 꼬리 속 불티 (밝은 점)
    const sparks = [];
    for (let k = 0; k < 4; k++) {
      sparks.push({ x: tailX + 3 + rng.next() * 16, y: HY + (rng.next() - 0.5) * 6 });
    }

    frames.push(prerender(W * px, H * px, (g) => {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          // 머리: 원형 코어
          const dHead = Math.hypot(x - HX, (y - HY) * 1.12) / HEAD_R;
          // 몸통: 꼬리로 갈수록 가늘어지는 눈물방울. 척추가 살짝 물결친다.
          let dBody = 9;
          if (x >= tailX && x <= HX) {
            const t = (x - tailX) / (HX - tailX);                 // 0=꼬리끝 1=머리
            const spine = HY + Math.sin(x * 0.55 + wob) * 1.3 * (1 - t);
            const r = 0.8 + Math.pow(t, 0.8) * (HEAD_R - 1.2);
            dBody = Math.abs(y - spine) / r + (1 - t) * 0.18;     // 꼬리끝은 더 차갑게
          }
          let heat = Math.min(dHead, dBody);
          // 떨어져 나온 혀 — 몸통보다 식은 상태(주황부터 시작)
          for (const L of licks) {
            const dL = Math.hypot(x - L.x, y - L.y) / L.r + 0.42;
            if (dL < heat) heat = dL;
          }
          // 가장자리 노이즈 — 꼬리 쪽일수록 강하게 (혀가 갈라지는 느낌)
          heat += noise[y * W + x] * (0.10 + (1 - x / W) * 0.16);
          if (heat > 1.14) continue;                              // 바깥 — 투명
          g.fillStyle = shade(ramp, heat);
          g.fillRect(x * px, y * px, px, px);
        }
      }
      // 불티 — 마지막에 밝은 점을 얹는다
      g.fillStyle = ramp[0];
      for (const s of sparks) g.fillRect(Math.round(s.x) * px, Math.round(s.y) * px, px, px);
    }));
  }

  const out = { frames, w: W * px, h: H * px };
  cache.set(key, out);
  return out;
}

// ----- 발광 화살 (arrow·volley 계열) -----
//
// "화살같지 않다"(사용자 2026-08-05)의 답: 화살은 실루엣으로 읽힌다 —
// **삼각 촉 + 가는 축 + 뒤로 누운 깃** 세 부위가 다 있어야 화살이다.
// 거기에 마력 발광(흰 심·색 번짐·꼬리빛)을 입힌다. 레퍼런스: 발광하는 긴 화살.
// facing: 'right'(수평 비행) / 'down'(하늘에서 낙하 — 화살비) / 'up'(하늘로 솟는 발사 화살).
// 런타임 회전은 금지(규칙 7)라, 세로 화살은 **구울 때 90° 돌려** 굽는다.
export function energyArrowFrames(colorKey, px = 2, facing = 'right') {
  const key = `arrow:${colorKey}:${px}:${facing}`;
  if (cache.has(key)) return cache.get(key);

  const ramp = rampOf(colorKey);
  const W = 35, H = 9, HY = 4;       // 40×10 → 35×9 (화구와 같은 이유로 한 뼘 축소)
  const TIP = 33, HEAD_LEN = 11;     // 촉: x 22~33 — 삼각형
  const SHAFT0 = 6;                  // 축: x 6~22
  const FRAMES = 2;                  // 반짝임 2프레임이면 충분 — 비행이 짧다
  const rng = new RNG(`proj-arrow-${colorKey}`);
  const frames = [];
  const down = facing === 'down';
  const up = facing === 'up';
  const vert = down || up;

  for (let f = 0; f < FRAMES; f++) {
    const noise = [];
    for (let i = 0; i < W * H; i++) noise.push((rng.next() - 0.5) * 2);
    // 세로형이면 캔버스를 세로로 잡고, (x,y)를 90° 돌려 찍는다
    frames.push(prerender((vert ? H : W) * px, (vert ? W : H) * px, (g) => {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let heat = 9;
          if (x > TIP - HEAD_LEN && x <= TIP) {
            // 삼각 촉 — 뒤가 넓고 끝이 점. 촉 전체가 뜨겁게(흰~노랑) 타야
            // 멀리서도 "어느 쪽이 앞인지"가 한눈에 읽힌다.
            const t = (x - (TIP - HEAD_LEN)) / HEAD_LEN;          // 0=촉 뒤 1=촉 끝
            const r = 0.3 + (1 - t) * 3.1;                        // 3.4 → 0.3 직선 테이퍼
            heat = (Math.abs(y - HY) / Math.max(0.3, r)) * 0.72 - t * 0.2;
          } else if (x >= SHAFT0 && x <= TIP - HEAD_LEN) {
            // 축 — 가늘지만 **밝게**. 어두우면 촉·깃이 따로 떠서 두 물체로 보인다
            // (실측으로 확인한 실패형 — 셋을 잇는 건 축이다).
            const t = (x - SHAFT0) / (TIP - HEAD_LEN - SHAFT0);
            heat = Math.abs(y - HY) / 1.2 + 0.12 + (1 - t) * 0.16;
          }
          // 깃 — 축 꼬리에서 뒤로 누운 사선 두 갈래 (위·아래).
          // ★촉보다 눈에 띄면 안 된다 — 깃이 삼각형으로 읽히면 방향이 뒤집혀 보인다
          //   (실측으로 확인한 실패형). 짧고·얇고·어둡게.
          if (x >= 2 && x <= SHAFT0 + 4) {
            const back = (SHAFT0 + 4) - x;                        // 0(앞)~9(꼬리끝)
            const spread = back * 0.34;                           // 뒤로 갈수록 벌어짐
            const dUp = Math.abs(y - (HY - 1 - spread));
            const dDn = Math.abs(y - (HY + 1 + spread));
            const dF = Math.min(dUp, dDn);
            if (dF < 1.1) heat = Math.min(heat, 0.66 + dF * 0.3 + back * 0.03);
          }
          heat += noise[y * W + x] * 0.07;
          if (heat > 1.12) continue;
          g.fillStyle = shade(ramp, heat);
          // down: 시계 90° (x,y)→(H-1-y, x) — 촉이 아래. up: 반시계 90° (x,y)→(y, W-1-x) — 촉이 위.
          if (down) g.fillRect((H - 1 - y) * px, x * px, px, px);
          else if (up) g.fillRect(y * px, (W - 1 - x) * px, px, px);
          else g.fillRect(x * px, y * px, px, px);
        }
      }
    }));
  }

  const out = vert
    ? { frames, w: H * px, h: W * px }
    : { frames, w: W * px, h: H * px };
  cache.set(key, out);
  return out;
}
