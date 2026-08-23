// ============================================================
// sprites.js — 픽셀아트 유틸 (절대 규칙 7)
// 공용 팔레트 32색 + 속성 강조색 6종, 오프스크린 프리렌더 헬퍼.
// 스프라이트는 로드 시 한 번 생성해 재사용한다 — 매 프레임 픽셀 그리기 금지.
// ============================================================

// 공용 팔레트 32색 (기획서 §16 — 아트 통일성의 핵심)
export const PALETTE = {
  // 남색·무채 기조 (UI 테마: 짙은 남색 + 금색 테두리)
  black: '#0d0b14', ink: '#161327', navy1: '#1c1f3a', navy2: '#283257',
  navy3: '#3c4f82', blue: '#5a7fc4', skyBlue: '#8fb8e8', white: '#f2ecdd',
  gray1: '#3a3a4a', gray2: '#6a6a7d', gray3: '#a5a5b5', gray4: '#d5d2dc',
  // 금·따뜻한 색
  gold: '#f2d251', goldDark: '#c9992e', amber: '#e8a33f',
  red: '#d94a3d', redDark: '#8f2f33', orange: '#e87a3f', peach: '#f2b380',
  yellow: '#f2e28a',
  // 초록·청록
  green: '#4fc978', greenDark: '#2e7d4f', forest: '#1d4a33',
  teal: '#3fbfb0', cyan: '#7fdde8',
  // 보라·분홍
  purple: '#8a4fc9', purpleDark: '#4a2e6b', magenta: '#c95a9a', pink: '#f2a5b8',
  // 갈색
  brown: '#a9743a', brownDark: '#6b4a2e', tan: '#d9b98a',
};

// 속성 강조색 6종 (기획서 §5)
export const ELEMENT_COLORS = {
  fire: PALETTE.red,
  water: PALETTE.blue,
  wind: PALETTE.green,
  earth: PALETTE.brown,
  light: PALETTE.gold,
  dark: PALETTE.purple,
  none: PALETTE.gray3,
};

// 등급색 (회/초/파/보/금)
export const RARITY_COLORS = {
  common: PALETTE.gray3, uncommon: PALETTE.green, rare: PALETTE.blue,
  epic: PALETTE.purple, legendary: PALETTE.gold,
};

// Galmuri 픽셀 폰트 (assets/fonts/ 동봉). 픽셀 폰트는 원본 크기(9px/11px)의
// 정수배에서만 선명하므로, 요청 크기를 가장 가까운 정수배 티어로 스냅한다.
// [최대 요청 px, 실제 렌더 px, 폰트 패밀리]
const FONT_TIERS = [
  [13, 11, 'Galmuri11'],        // 1×11
  [20, 18, 'Galmuri9'],         // 2×9
  [27, 22, 'Galmuri11'],        // 2×11
  [38, 33, 'Galmuri11'],        // 3×11
  [49, 44, 'Galmuri11'],        // 4×11
  [Infinity, 55, 'Galmuri11'],  // 5×11
];

export function font(px, bold = false) {
  for (const [max, size, family] of FONT_TIERS) {
    if (px <= max) return `${bold ? 'bold ' : ''}${size}px ${family}, "Malgun Gothic", monospace`;
  }
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

// draw 콜백으로 그린 내용을 오프스크린 캔버스로 돌려준다
export function prerender(w, h, draw) {
  const [c, g] = makeCanvas(w, h);
  draw(g);
  return c;
}

// 저해상도로 그린 뒤 정수배 확대 (도트가 굵은 픽셀아트용)
export function prerenderScaled(w, h, scale, draw) {
  const small = prerender(w, h, draw);
  return prerender(w * scale, h * scale, (g) => {
    g.imageSmoothingEnabled = false;
    g.drawImage(small, 0, 0, w * scale, h * scale);
  });
}

// 외곽선 있는 텍스트 (제목·팝업용)
export function drawTextOutlined(g, text, x, y, { size = 16, bold = false, fill = PALETTE.white, outline = PALETTE.black, align = 'center', baseline = 'alphabetic' } = {}) {
  g.font = font(size, bold);
  g.textAlign = align;
  g.textBaseline = baseline;
  g.fillStyle = outline;
  for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, -2], [-2, 2], [2, 2]]) {
    g.fillText(text, x + dx, y + dy);
  }
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

export function drawText(g, text, x, y, { size = 16, bold = false, fill = PALETTE.white, align = 'left', baseline = 'alphabetic' } = {}) {
  g.font = font(size, bold);
  g.textAlign = align;
  g.textBaseline = baseline;
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

// ----- 유닛 스프라이트 생성 (64×64 — 로드 시 프리렌더, 절대 규칙 7) -----
//
// 그리는 방식: 사각형 쌓기가 아니라 **고해상도(4배) 벡터 곡선 → 축소 → 팔레트 양자화**.
// 실제 픽셀 아티스트의 작업 방식과 같아서, 망토가 휘고 어깨가 둥글게 나온다.
//   ① 256×256 오프스크린에 베지어/타원으로 인체·장비를 그린다
//   ② 64×64로 면적평균 축소 (부드러운 계조 생성)
//   ③ 각 픽셀을 팔레트 32색 중 가장 가까운 색으로 스냅 (픽셀아트 계조)
//   ④ 실루엣 외곽에 어두운 테두리 1px
// 결과는 로드 시 1회 생성 후 재사용한다.
//
// cfg: {
//   skin, hair, armor, armorDark, cloth,
//   weapon: 'sword'|'lance'|'dagger'|'axe'|'bow'|'staff'|'bone',
//   cape?, trim?, shield?, skeleton?,
// }
export const SPRITE_SIZE = 64;
const WORK = 4;                       // 슈퍼샘플 배수 (256 → 64)

// 팔레트를 RGB 배열로 (양자화용). 스프라이트 음영에 필요한 중간 계조 포함.
const QUANT_COLORS = (() => {
  const list = Object.values(PALETTE);
  return list.map((hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, hex];
  });
})();

const quantCache = new Map();
function quantize(r, g, b) {
  const key = (r >> 2 << 12) | (g >> 2 << 6) | (b >> 2);
  const hit = quantCache.get(key);
  if (hit) return hit;
  let best = null, bd = Infinity;
  for (const c of QUANT_COLORS) {
    // 인지 가중 거리 (녹색에 민감)
    const dr = r - c[0], dg = g - c[1], db = b - c[2];
    const d = dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bd) { bd = d; best = c; }
  }
  quantCache.set(key, best);
  return best;
}

// 외부/자체 그림의 톤을 게임에 맞춘다 (절대 규칙 1 개정 2026-08-03).
//
// ★기본은 **팔레트 스냅을 하지 않는다**. 32색은 코드 생성물과 UI의 통일 규격이지,
//   외부 그림에까지 강제하면 쓰는 의미가 없다 — 실측으로 확인했다:
//   Ninja Adventure 풀·길·물 타일을 32색으로 스냅하니 1024px이 전부 한 색으로 뭉개져
//   잔디 결이 통째로 사라졌다(색수 1). 좋은 그림을 가져와서 도로 뭉개는 셈이다.
//
// 대신 하는 것:
//   ① 명도를 낮춰 "3년 전 함락된 왕국" 톤으로 눌러준다 — UI(짙은 남색·금색)와 붙는 건 이쪽이다
//   ② 채도를 살짝 죽여 원색이 튀지 않게 한다
//   ③ 반투명 가장자리를 잘라 픽셀아트 경계를 유지한다 (절대 규칙 7)
// snap: true를 주면 32색 스냅까지 한다 (코드 생성물과 섞어 쓰는 작은 아이콘 등에만).
// colorKey: 배경으로 쓰인 단색을 투명으로 뺀다 (고전 픽셀아트 시트가 쓰는 마젠타 키 등).
//   [r, g, b] 배열로 주고, tol은 허용 오차.
export function toneCanvas(canvas, { darken = 0, desaturate = 0, snap = false, alphaCut = 128, colorKey = null, keyTol = 24 } = {}) {
  const g = canvas.getContext('2d');
  const img = g.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const k = 1 - darken;
  for (let i = 0; i < d.length; i += 4) {
    if (colorKey && Math.abs(d[i] - colorKey[0]) <= keyTol
      && Math.abs(d[i + 1] - colorKey[1]) <= keyTol
      && Math.abs(d[i + 2] - colorKey[2]) <= keyTol) { d[i + 3] = 0; continue; }
    if (d[i + 3] < alphaCut) { d[i + 3] = 0; continue; }
    d[i + 3] = 255;
    let r = d[i] * k, gg = d[i + 1] * k, b = d[i + 2] * k;
    if (desaturate > 0) {
      const l = 0.30 * r + 0.59 * gg + 0.11 * b;
      r += (l - r) * desaturate; gg += (l - gg) * desaturate; b += (l - b) * desaturate;
    }
    if (snap) {
      const c = quantize(r, gg, b);
      r = c[0]; gg = c[1]; b = c[2];
    }
    d[i] = r | 0; d[i + 1] = gg | 0; d[i + 2] = b | 0;
  }
  g.putImageData(img, 0, 0);
  return canvas;
}

export function makeUnitSprites(cfg) {
  const P = PALETTE;
  const TRIM = cfg.trim ?? P.goldDark;
  const CAPE = cfg.cape ?? null;
  const SK = cfg.skin, HR = cfg.hair, AR = cfg.armor, AD = cfg.armorDark, CL = cfg.cloth;

  // ---------- 고해상도 벡터 드로잉 (좌표는 64 기준, 내부에서 ×WORK) ----------
  // 캐릭터는 왼쪽을 본다. 발끝 y=62.
  function drawHiRes(ctx, pose, frame) {
    const g = ctx;
    const S = (v) => v * WORK;
    // 자세 파라미터
    const idle1 = pose === 'idle' && frame === 1;
    const atk = pose === 'attack';
    const hurt = pose === 'hurt';
    const cast = pose === 'cast';
    const breath = idle1 ? 0.8 : 0;
    // 상체 기울기(음수=앞으로) / 상체 y 오프셋
    const lean = atk ? (frame === 0 ? 2.5 : frame === 1 ? -1 : frame === 2 ? -5 : -2.5)
      : hurt ? 5 : cast ? 1.5 : 0;
    const rise = atk && frame === 1 ? -1 : 0;
    const T = breath + rise + (hurt ? -1.5 : 0);
    const L = lean;
    // 다리 벌림 (공격 임팩트에서 앞발 내딛음)
    const stance = atk && frame >= 2 ? 3 : atk && frame === 0 ? -1 : hurt ? 2 : 0;

    const path = (color, fn) => { g.fillStyle = color; g.beginPath(); fn(); g.closePath(); g.fill(); };
    const stroke = (color, w, fn) => {
      g.strokeStyle = color; g.lineWidth = S(w); g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); fn(); g.stroke();
    };
    const M = (x, y) => g.moveTo(S(x), S(y));
    const L2 = (x, y) => g.lineTo(S(x), S(y));
    const Q = (cx, cy, x, y) => g.quadraticCurveTo(S(cx), S(cy), S(x), S(y));
    const C = (c1x, c1y, c2x, c2y, x, y) => g.bezierCurveTo(S(c1x), S(c1y), S(c2x), S(c2y), S(x), S(y));
    const ellipse = (color, cx, cy, rx, ry, rot = 0) => {
      g.fillStyle = color; g.beginPath();
      g.ellipse(S(cx), S(cy), S(rx), S(ry), rot, 0, Math.PI * 2); g.fill();
    };

    if (pose === 'down') { drawDownHiRes(g, S, path, M, L2, Q, C, ellipse, stroke); return; }

    // ===== 1. 망토 (몸 뒤) =====
    if (CAPE) {
      const flow = atk ? 6 : hurt ? 4 : idle1 ? 1.5 : 0;
      const capeDark = shade(CAPE, -0.38);
      // 본체: 어깨에서 시작해 뒤로 흐르는 곡선
      path(capeDark, () => {
        M(34 + L, 25 + T);
        C(42 + L, 26 + T, 46 + flow, 34, 44 + flow, 46);
        C(43 + flow, 52, 40 + flow, 55, 36 + flow, 56);
        L2(30, 52); L2(29 + L, 30 + T);
      });
      // 밝은 면
      path(CAPE, () => {
        M(34 + L, 26 + T);
        C(40 + L, 28 + T, 43 + flow, 34, 41 + flow, 45);
        C(40 + flow, 50, 37 + flow, 53, 34 + flow, 53);
        L2(31, 48); L2(30 + L, 30 + T);
      });
      // 금색 가장자리
      stroke(TRIM, 1.1, () => {
        M(34 + L, 25 + T);
        C(42 + L, 26 + T, 46 + flow, 34, 44 + flow, 46);
        C(43 + flow, 52, 40 + flow, 55, 36 + flow, 56);
      });
      // 어깨 고정구
      ellipse(TRIM, 33 + L, 26 + T, 1.6, 1.6);
    }

    // ===== 2. 뒤쪽 다리 =====
    drawLegHi(g, S, path, M, L2, Q, ellipse, stroke, 36 - stance, true, pose, frame);

    // ===== 3. 몸통 =====
    const bx = 28 + L, by = 26 + T;
    // 허리~가슴 실루엣 (아래가 좁은 갑주)
    path(AD, () => {
      M(bx - 6, by + 2);
      C(bx - 7, by + 8, bx - 6, by + 14, bx - 4, by + 18);
      L2(bx + 7, by + 18);
      C(bx + 9, by + 13, bx + 9, by + 6, bx + 7, by + 1);
      Q(bx + 1, by - 2, bx - 6, by + 2);
    });
    // 판금 하이라이트
    path(shade(AR, 0.10), () => {
      M(bx - 4, by + 3);
      C(bx - 5, by + 8, bx - 4, by + 12, bx - 2.5, by + 15);
      L2(bx + 5, by + 15);
      C(bx + 6.5, by + 11, bx + 6.5, by + 6, bx + 5, by + 2);
      Q(bx + 0.5, by, bx - 4, by + 3);
    });
    path(shade(AR, 0.34), () => {          // 광원(좌상)
      M(bx - 3.5, by + 3.5); Q(bx - 1, by + 2, bx + 1, by + 3);
      L2(bx + 0.5, by + 12); Q(bx - 3, by + 12, bx - 3.5, by + 9);
    });
    if (cfg.skeleton) {
      stroke(AD, 0.9, () => { M(bx - 3, by + 5); L2(bx + 5, by + 5); });
      stroke(AD, 0.9, () => { M(bx - 3, by + 9); L2(bx + 5, by + 9); });
      stroke(AD, 0.9, () => { M(bx - 3, by + 13); L2(bx + 5, by + 13); });
    }
    // 금색 흉갑 장식 (V자)
    stroke(TRIM, 1.0, () => { M(bx - 3, by + 3); Q(bx + 0.5, by + 8, bx + 4, by + 3); });
    stroke(TRIM, 0.9, () => { M(bx - 4, by + 10); L2(bx + 5.5, by + 10); });
    // 벨트
    path(P.brownDark, () => {
      M(bx - 5, by + 16); L2(bx + 8, by + 16); L2(bx + 8, by + 19.5); L2(bx - 5, by + 19.5);
    });
    ellipse(TRIM, bx + 1, by + 17.8, 1.6, 1.3);

    // ===== 4. 앞쪽 다리 =====
    drawLegHi(g, S, path, M, L2, Q, ellipse, stroke, 28 + stance, false, pose, frame);

    // ===== 5. 어깨 견갑 (앞쪽) =====
    path(AD, () => {
      M(bx - 9, by + 1); Q(bx - 10, by + 7, bx - 6, by + 8);
      Q(bx - 3, by + 7, bx - 3.5, by + 1); Q(bx - 6, by - 1.5, bx - 9, by + 1);
    });
    path(shade(AR, 0.15), () => {
      M(bx - 8, by + 1.5); Q(bx - 8.6, by + 6, bx - 6, by + 6.6);
      Q(bx - 4.2, by + 6, bx - 4.6, by + 1.5); Q(bx - 6.3, by, bx - 8, by + 1.5);
    });
    stroke(TRIM, 0.9, () => { M(bx - 9.2, by + 6.5); Q(bx - 6, by + 8.6, bx - 3.2, by + 6.2); });

    // ===== 6. 머리 =====
    const hx = 29 + L, hy = 15 + T;
    // 목
    path(shade(SK, -0.25), () => { M(hx + 1, hy + 8); L2(hx + 6, hy + 8); L2(hx + 6, hy + 12); L2(hx + 1, hy + 12); });
    // 얼굴 (턱선 있는 타원)
    path(SK, () => {
      M(hx - 4, hy - 1);
      C(hx - 5, hy + 4, hx - 3.5, hy + 8, hx + 1, hy + 9.5);
      C(hx + 4.5, hy + 9, hx + 6, hy + 5, hx + 6, hy);
      Q(hx + 1, hy - 3.5, hx - 4, hy - 1);
    });
    path(shade(SK, -0.22), () => {          // 턱·목 그림자
      M(hx - 3, hy + 6.5); Q(hx + 1, hy + 10, hx + 5.5, hy + 6);
      Q(hx + 1, hy + 8.5, hx - 3, hy + 6.5);
    });
    // 머리카락 (뒤 → 앞 순서, 뾰족한 실루엣)
    path(shade(HR, -0.30), () => {
      M(hx - 5, hy + 1);
      C(hx - 6, hy - 5, hx - 1, hy - 9, hx + 4, hy - 8);
      C(hx + 9, hy - 7, hx + 10, hy - 1, hx + 8.5, hy + 5);
      L2(hx + 6, hy + 4); C(hx + 7, hy - 1, hx + 5, hy - 4, hx + 1, hy - 4);
      Q(hx - 3, hy - 3.5, hx - 4, hy + 0.5);
    });
    path(HR, () => {
      M(hx - 4.5, hy + 0.5);
      C(hx - 5, hy - 4, hx - 1, hy - 7.5, hx + 3.5, hy - 6.8);
      C(hx + 8, hy - 6, hx + 8.8, hy - 1, hx + 7.5, hy + 3.5);
      L2(hx + 5.5, hy + 2.5); C(hx + 6, hy - 1, hx + 4, hy - 3, hx + 1, hy - 3);
      Q(hx - 2.5, hy - 2.5, hx - 3.5, hy + 0.5);
    });
    path(shade(HR, 0.30), () => {           // 광원 하이라이트
      M(hx - 2.5, hy - 4.5); Q(hx + 1, hy - 6.5, hx + 4, hy - 5.5);
      Q(hx + 1, hy - 4.5, hx - 2, hy - 2.5);
    });
    // 앞머리 가닥
    path(HR, () => { M(hx - 4.5, hy - 0.5); Q(hx - 3, hy + 3, hx - 4.5, hy + 5); Q(hx - 6, hy + 2, hx - 5.5, hy - 0.5); });
    // 눈
    if (cfg.skeleton) {
      ellipse(P.black, hx - 1.5, hy + 2, 1.6, 1.8);
    } else {
      ellipse(P.black, hx - 1.6, hy + 2.2, 1.15, 1.5);
      ellipse(P.skyBlue, hx - 1.9, hy + 2.0, 0.55, 0.8);
      stroke(shade(HR, -0.4), 0.7, () => { M(hx - 3.2, hy + 0.4); Q(hx - 1.6, hy - 0.2, hx - 0.2, hy + 0.4); });
    }

    // ===== 7. 무기 =====
    drawWeaponHi(g, S, path, M, L2, Q, C, ellipse, stroke, pose, frame, L, T);

    // 방패 (기사)
    if (cfg.shield && !atk) {
      path(AD, () => {
        M(bx - 12, by + 4); Q(bx - 13.5, by + 11, bx - 9.5, by + 15);
        Q(bx - 5.5, by + 11, bx - 7, by + 4); Q(bx - 9.5, by + 2.5, bx - 12, by + 4);
      });
      stroke(TRIM, 0.9, () => { M(bx - 11.5, by + 8); L2(bx - 7.5, by + 8); });
    }
  }

  // 다리 하나 (곡선 실루엣 + 부츠)
  function drawLegHi(g, S, path, M, L2, Q, ellipse, stroke, lx, back, pose, frame) {
    const atk = pose === 'attack';
    const swing = pose === 'idle' ? 0 : atk ? (back ? -1.5 : 1.5) : 0;
    const c = back ? shade(CL, -0.28) : CL;
    const bootC = back ? shade(P.brownDark, -0.2) : P.brownDark;
    const x = lx + swing;
    // 허벅지~정강이
    path(c, () => {
      M(x - 2.5, 44); Q(x - 3.5, 51, x - 2.8, 56); L2(x + 2.8, 56); Q(x + 3.4, 50, x + 2.5, 44);
    });
    path(shade(c, 0.18), () => {
      M(x - 1.8, 45); Q(x - 2.5, 51, x - 2, 55); L2(x + 0.2, 55); Q(x + 0.6, 50, x + 0.4, 45);
    });
    // 부츠
    path(bootC, () => {
      M(x - 3.4, 55); L2(x + 3.4, 55);
      Q(x + 4, 60, x + 3.2, 62); L2(x - 4.6, 62);
      Q(x - 5, 58.5, x - 3.4, 55);
    });
    path(shade(bootC, 0.22), () => {
      M(x - 2.4, 56.5); L2(x + 2.2, 56.5); Q(x + 2.6, 59.5, x + 2, 60.6); L2(x - 3.4, 60.6); Q(x - 3.4, 58, x - 2.4, 56.5);
    });
    stroke(TRIM, 0.9, () => { M(x - 3.3, 55.4); L2(x + 3.3, 55.4); });
  }

  function drawWeaponHi(g, S, path, M, L2, Q, C, ellipse, stroke, pose, frame, L, T) {
    const w = cfg.weapon;
    const atk = pose === 'attack';
    const cast = pose === 'cast';
    const hurt = pose === 'hurt';
    const hx = 22 + L, hy = 36 + T;    // 손 위치

    if (hurt) {                        // 피격: 무기 흘러내림
      stroke(P.gray3, 1.4, () => { M(hx - 1, hy + 4); L2(hx - 9, hy + 12); });
      ellipse(SK, hx, hy + 3, 2, 2);
      return;
    }

    // 팔 (어깨→손)
    stroke(shade(AD, 0.1), 3.2, () => { M(28 + L - 6, 30 + T); Q(hx + 2, hy - 4, hx + 0.5, hy - 0.5); });
    ellipse(SK, hx, hy, 2.1, 2.1);

    const blade = (x0, y0, x1, y1, width, hiltAt) => {
      stroke(P.gray2, width + 0.6, () => { M(x0, y0); L2(x1, y1); });   // 외곽
      stroke(P.gray4, width, () => { M(x0, y0); L2(x1, y1); });
      stroke(P.white, width * 0.4, () => {                               // 날 하이라이트
        M(x0 + (x1 - x0) * 0.15, y0 + (y1 - y0) * 0.15);
        L2(x0 + (x1 - x0) * 0.8, y0 + (y1 - y0) * 0.8);
      });
      if (hiltAt) {                                                      // 금 손잡이·가드
        stroke(TRIM, 2.2, () => { M(hiltAt[0] - 1.8, hiltAt[1] - 1.8); L2(hiltAt[0] + 1.8, hiltAt[1] + 1.8); });
        ellipse(P.cyan, hiltAt[0], hiltAt[1], 0.8, 0.8);
      }
    };

    if (w === 'sword' || w === 'dagger') {
      const len = w === 'sword' ? 20 : 12;
      if (atk && frame === 0) blade(hx + 3, hy - 4, hx + 11, hy - 4 - len, 1.5, [hx + 2, hy - 3]);
      else if (atk && frame === 1) blade(hx - 1, hy - 13, hx - 15, hy - 5, 1.5, [hx, hy - 12]);
      else if (atk) blade(hx - 2, hy + 1, hx - 3 - len, hy + 10, 1.6, [hx - 1, hy]);
      else blade(hx - 2, hy + 2, hx - 2 - len, hy + 2 + len * 0.5, 1.5, [hx - 1, hy + 1]);
    } else if (w === 'lance') {
      const far = atk && frame >= 2 ? 22 : 14;
      stroke(P.brown, 1.6, () => { M(hx + 7, hy + 5); L2(hx - far, hy - 4); });
      path(P.gray4, () => { M(hx - far, hy - 4); L2(hx - far - 5, hy - 6.5); L2(hx - far - 1, hy - 1); });
    } else if (w === 'axe') {
      if (atk && frame === 0) { stroke(P.brown, 1.6, () => { M(hx + 3, hy - 3); L2(hx + 9, hy - 18); }); ellipse(P.gray4, hx + 10, hy - 20, 4, 3.4, 0.6); }
      else if (atk) { stroke(P.brown, 1.6, () => { M(hx - 1, hy + 2); L2(hx - 10, hy + 14); }); ellipse(P.gray4, hx - 12, hy + 16, 4, 3.4, -0.6); }
      else { stroke(P.brown, 1.6, () => { M(hx + 1, hy - 1); L2(hx + 4, hy - 16); }); ellipse(P.gray4, hx + 4.5, hy - 18, 3.8, 3.2, 0.2); }
    } else if (w === 'bow') {
      const pull = atk || cast ? 3 : 0;
      stroke(P.brown, 1.5, () => { M(hx + 1, hy - 13); C(hx - 4, hy - 7, hx - 4, hy + 7, hx + 1, hy + 13); });
      stroke(P.gray3, 0.6, () => { M(hx + 1, hy - 13); L2(hx + 1 + pull, hy); L2(hx + 1, hy + 13); });
      if (pull) stroke(P.gray4, 0.9, () => { M(hx + 2, hy); L2(hx - 12, hy); });
    } else if (w === 'staff') {
      const gx = atk && frame >= 1 ? hx - 9 : hx + 3;
      const gy = atk && frame >= 2 ? hy + 8 : hy - 18;
      stroke(P.brown, 1.5, () => { M(hx + 5, hy + 8); L2(gx, gy); });
      ellipse(shade(AR, 0.2), gx, gy - 1, 2.6, 2.6);
      if (cast || (atk && frame >= 1)) { ellipse(P.cyan, gx, gy - 1, 4, 4); ellipse(P.white, gx, gy - 1, 1.6, 1.6); }
    } else if (w === 'bone') {
      if (atk) stroke(P.gray4, 2.2, () => { M(hx - 1, hy + 1); L2(hx - 14, hy + 8); });
      else stroke(P.gray4, 2.2, () => { M(hx + 1, hy - 2); L2(hx + 3, hy - 15); });
    }
  }

  // 쓰러짐: 옆으로 누운 실루엣
  function drawDownHiRes(g, S, path, M, L2, Q, C, ellipse, stroke) {
    if (CAPE) {
      path(shade(CAPE, -0.38), () => { M(8, 56); Q(18, 46, 34, 50); Q(30, 58, 12, 60); });
      path(CAPE, () => { M(12, 55); Q(20, 49, 31, 52); Q(27, 57, 15, 58); });
      stroke(TRIM, 1.0, () => { M(8, 56); Q(18, 46, 34, 50); });
    }
    path(AD, () => { M(24, 52); Q(34, 48, 44, 52); Q(42, 60, 26, 60); });
    path(shade(AR, 0.12), () => { M(27, 53); Q(34, 50, 41, 53); Q(39, 57.5, 29, 57.5); });
    stroke(TRIM, 0.9, () => { M(27, 55.5); L2(41, 55.5); });
    ellipse(shade(HR, -0.25), 48, 52, 6, 4.6);
    ellipse(HR, 48, 51, 5, 3.6);
    ellipse(SK, 51, 55, 4, 3);
    path(CL, () => { M(14, 54); Q(22, 52, 26, 55); Q(22, 59, 14, 58); });
    ellipse(P.brownDark, 11, 57, 3.4, 2.6);
    if (cfg.weapon === 'sword' || cfg.weapon === 'dagger') {
      stroke(P.gray4, 1.4, () => { M(52, 58); L2(62, 60); });
    }
  }

  // ---------- 정면·후면 (필드용) ----------
  function drawFrontHiRes(g, back, frame) {
    const S = (v) => v * WORK;
    const path = (color, fn) => { g.fillStyle = color; g.beginPath(); fn(); g.closePath(); g.fill(); };
    const stroke = (color, w, fn) => { g.strokeStyle = color; g.lineWidth = S(w); g.lineCap = 'round'; g.beginPath(); fn(); g.stroke(); };
    const M = (x, y) => g.moveTo(S(x), S(y));
    const L2 = (x, y) => g.lineTo(S(x), S(y));
    const Q = (cx, cy, x, y) => g.quadraticCurveTo(S(cx), S(cy), S(x), S(y));
    const C = (a, b, c, d, e, f) => g.bezierCurveTo(S(a), S(b), S(c), S(d), S(e), S(f));
    const ellipse = (color, cx, cy, rx, ry) => { g.fillStyle = color; g.beginPath(); g.ellipse(S(cx), S(cy), S(rx), S(ry), 0, 0, Math.PI * 2); g.fill(); };
    const T = frame === 1 ? 0.8 : 0;
    const step = frame === 1 ? 1.6 : 0;

    if (CAPE) {
      path(shade(CAPE, -0.38), () => { M(22, 26 + T); C(14, 34, 13, 46, 16, 54); L2(48, 54); C(51, 46, 50, 34, 42, 26 + T); });
      path(CAPE, () => { M(24, 28 + T); C(18, 35, 17, 45, 19, 51); L2(45, 51); C(47, 45, 46, 35, 40, 28 + T); });
      stroke(TRIM, 1.0, () => { M(16, 54); L2(48, 54); });
    }
    for (const sgn of [-1, 1]) {
      const x = 32 + sgn * 5 + sgn * step;
      path(sgn < 0 ? CL : shade(CL, -0.15), () => { M(x - 2.6, 44); Q(x - 3.2, 52, x - 2.6, 56); L2(x + 2.6, 56); Q(x + 3.2, 52, x + 2.6, 44); });
      path(P.brownDark, () => { M(x - 3.2, 55); L2(x + 3.2, 55); Q(x + 3.6, 60, x + 3, 62); L2(x - 3, 62); Q(x - 3.6, 60, x - 3.2, 55); });
      stroke(TRIM, 0.9, () => { M(x - 3.1, 55.4); L2(x + 3.1, 55.4); });
    }
    path(AD, () => { M(24, 28 + T); C(22, 34, 22, 40, 24, 45); L2(40, 45); C(42, 40, 42, 34, 40, 28 + T); Q(32, 25 + T, 24, 28 + T); });
    path(shade(AR, 0.12), () => { M(26, 30 + T); C(24.5, 35, 24.5, 39, 26, 43); L2(38, 43); C(39.5, 39, 39.5, 35, 38, 30 + T); Q(32, 27.5 + T, 26, 30 + T); });
    path(shade(AR, 0.32), () => { M(27, 31 + T); Q(30, 29.5 + T, 32, 30 + T); L2(31, 42); Q(27.5, 41.5, 27, 38); });
    stroke(TRIM, 1.0, () => { M(27, 32 + T); Q(32, 38 + T, 37, 32 + T); });
    path(P.brownDark, () => { M(24, 44); L2(40, 44); L2(40, 47.5); L2(24, 47.5); });
    ellipse(TRIM, 32, 45.8, 1.8, 1.4);
    ellipse(AD, 22, 31 + T, 3.4, 4.2); ellipse(AD, 42, 31 + T, 3.4, 4.2);
    // 머리
    path(shade(HR, -0.3), () => { M(25, 20 + T); C(24, 10 + T, 40, 10 + T, 39, 20 + T); Q(32, 17 + T, 25, 20 + T); });
    if (back) { path(HR, () => { M(25.5, 19 + T); C(25, 11 + T, 39, 11 + T, 38.5, 19 + T); C(38, 26 + T, 26, 26 + T, 25.5, 19 + T); }); }
    else {
      path(SK, () => { M(26, 17 + T); C(25, 24 + T, 28, 27 + T, 32, 27.5 + T); C(36, 27 + T, 39, 24 + T, 38, 17 + T); Q(32, 14.5 + T, 26, 17 + T); });
      path(shade(SK, -0.2), () => { M(27, 24 + T); Q(32, 28 + T, 37, 24 + T); Q(32, 26 + T, 27, 24 + T); });
      path(HR, () => { M(25, 18 + T); C(24.5, 11 + T, 39.5, 11 + T, 39, 18 + T); Q(36, 15 + T, 32, 16 + T); Q(28, 15 + T, 25, 18 + T); });
      path(shade(HR, 0.28), () => { M(27, 14.5 + T); Q(31, 12.5 + T, 35, 13.5 + T); Q(31, 14.5 + T, 27, 16.5 + T); });
      if (cfg.skeleton) { ellipse(P.black, 29, 21 + T, 1.8, 2); ellipse(P.black, 35, 21 + T, 1.8, 2); }
      else {
        ellipse(P.black, 29.2, 21 + T, 1.1, 1.4); ellipse(P.black, 34.8, 21 + T, 1.1, 1.4);
        ellipse(P.skyBlue, 29, 20.7 + T, 0.5, 0.7); ellipse(P.skyBlue, 34.6, 20.7 + T, 0.5, 0.7);
      }
    }
    path(shade(SK, -0.15), () => { M(29, 27 + T); L2(35, 27 + T); L2(35, 30 + T); L2(29, 30 + T); });
  }

  // ---------- ② 축소 + ③ 팔레트 양자화 + ④ 외곽선 ----------
  function bake(drawFn) {
    const S = SPRITE_SIZE;
    const [hi, hg] = makeCanvas(S * WORK, S * WORK);
    hg.imageSmoothingEnabled = true;
    drawFn(hg);
    // 면적평균 축소
    const [sm, sg] = makeCanvas(S, S);
    sg.imageSmoothingEnabled = true;
    sg.imageSmoothingQuality = 'high';
    sg.drawImage(hi, 0, 0, S, S);
    // 양자화
    const img = sg.getImageData(0, 0, S, S);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 90) { d[i + 3] = 0; continue; }   // 반투명 가장자리 제거
      d[i + 3] = 255;
      const c = quantize(d[i], d[i + 1], d[i + 2]);
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
    }
    // 외곽선: 알파 경계 픽셀을 어둡게
    const out = new Uint8ClampedArray(d);
    const at = (x, y) => (y * S + x) * 4;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = at(x, y);
      if (d[i + 3] === 0) continue;
      let edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= S || ny >= S || d[at(nx, ny) + 3] === 0) { edge = true; break; }
      }
      if (edge) {
        const c = quantize(d[i] * 0.35, d[i + 1] * 0.35, d[i + 2] * 0.35);
        out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2];
      }
    }
    img.data.set(out);
    sg.putImageData(img, 0, 0);
    return sm;
  }

  const makeSide = (pose, frame) => bake((hg) => drawHiRes(hg, pose, frame));
  const makeFront = (back, frame) => bake((hg) => drawFrontHiRes(hg, back, frame));
  const mirror = (c) => prerender(SPRITE_SIZE, SPRITE_SIZE, (g) => {
    g.save(); g.translate(SPRITE_SIZE, 0); g.scale(-1, 1); g.imageSmoothingEnabled = false; g.drawImage(c, 0, 0); g.restore();
  });

  const leftIdle = [makeSide('idle', 0), makeSide('idle', 1)];
  const leftAttack = [makeSide('attack', 0), makeSide('attack', 1), makeSide('attack', 2), makeSide('attack', 3)];
  const leftCast = makeSide('cast', 0);
  const leftHurt = makeSide('hurt', 0);
  const leftDown = makeSide('down', 0);

  return {
    idle: {
      down: [makeFront(false, 0), makeFront(false, 1)],
      up: [makeFront(true, 0), makeFront(true, 1)],
      left: leftIdle,
      right: leftIdle.map(mirror),
    },
    attack: { left: leftAttack[2], right: mirror(leftAttack[2]) },
    attackFrames: { left: leftAttack, right: leftAttack.map(mirror) },
    cast: { left: leftCast, right: mirror(leftCast) },
    hurt: { left: leftHurt, right: mirror(leftHurt) },
    down: { left: leftDown, right: mirror(leftDown) },
  };
}

// ----- 손그림/AI 스프라이트 로더 -----
// 이미지가 등록된 유닛은 코드 생성 대신 그 파일을 쓴다.
// 로드 완료 전에는 코드 생성본이 표시되므로 게임이 멈추지 않는다.

const assetCache = new Map();

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function mirrorImage(img) {
  const c = prerender(img.width, img.height, (g) => {
    g.save(); g.translate(img.width, 0); g.scale(-1, 1);
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, img.width, img.height);
    g.restore();
  });
  c.assetRes = img.assetRes ?? 1;
  return c;
}

// 에셋 스프라이트 규격: 세로 64×res, 가로는 96×res 기본 — 창처럼 긴 무기는 더 넓어도 된다
// (그리는 쪽이 전부 이미지 실제 크기를 읽는다. 인물은 캔버스 가로 중앙·발끝 y=60×res)
// res 2 (2026-08-23 해상도 2배): 화면 확대율이 ×2였으므로 res 2 에셋은 1:1 정수배로
// 그려진다 — 화면 크기는 res 1과 동일, 픽셀 밀도만 2배. 그리는 쪽은 sprScale로 나눈다.
export const ASSET_W = 96;
export const ASSET_H = 64;

// 그리기 배율 헬퍼 — 원하는 화면 배율 k를 에셋 해상도 배수로 나눈다.
// 코드 생성 캔버스(assetRes 없음)는 그대로 k를 돌려주므로 모든 소비처에 안전하다.
export function sprScale(spr, k = 1) {
  return k / (spr.assetRes ?? 1);
}

function normalizeImg(img, res = 1) {
  const targetH = ASSET_H * res;
  if (img.height === targetH) { img.assetRes = res; return img; }   // 세로가 맞으면 가로는 자유
  const w = Math.round(img.width * targetH / img.height);
  const c = prerender(w, targetH, (g) => { g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, w, targetH); });
  c.assetRes = res;
  return c;
}

// 반환: { ready: Promise<set|null>, set: set|null }
export function loadAssetSprites(key, asset) {
  if (assetCache.has(key)) return assetCache.get(key);
  const entry = { set: null };
  const names = asset.poses;

  entry.ready = (async () => {
    const wanted = [...new Set(Object.values(names).flat())];
    const loaded = {};
    await Promise.all(wanted.map(async (n) => { loaded[n] = await loadImage(`${asset.dir}/${n}.png`); }));

    const res = asset.res ?? 1;
    const pick = (list, fb) => {
      const src = (list ?? []).map((n) => loaded[n]).filter(Boolean);
      return src.length ? src.map((im) => normalizeImg(im, res)) : (fb ?? null);
    };
    const idleL = pick(names.idle);
    if (!idleL) return null;
    const attackL = pick(names.attack, idleL);
    const walkL = pick(names.walk, idleL);
    const castL = pick(names.cast, [attackL[0]]);
    const hurtL = pick(names.hurt, [idleL[0]]);
    const downL = pick(names.down, [idleL[0]]);

    const nativeIsLeft = (asset.facing ?? 'left') === 'left';
    const pair = (arr) => nativeIsLeft
      ? { left: arr, right: arr.map(mirrorImage) }
      : { left: arr.map(mirrorImage), right: arr };

    const idle = pair(idleL), attack = pair(attackL), walk = pair(walkL);
    const cast = pair(castL), hurt = pair(hurtL), down = pair(downL);
    const mid = (a) => a[Math.min(2, a.length - 1)];

    entry.set = {
      fromAsset: true,
      idle: { left: idle.left, right: idle.right, down: idle.left, up: idle.left },
      walk,
      attack: { left: mid(attack.left), right: mid(attack.right) },
      attackFrames: attack,
      cast: { left: cast.left[0], right: cast.right[0] },
      hurt: { left: hurt.left[0], right: hurt.right[0] },
      down: { left: down.left[0], right: down.right[0] },
    };
    return entry.set;
  })();

  assetCache.set(key, entry);
  return entry;
}

// #rrggbb 색을 밝게(+)/어둡게(-) — 고해상도 단계의 중간 계조용 (최종은 팔레트로 양자화됨)
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const x = amt >= 0 ? v + (255 - v) * amt : v * (1 + amt);
    return Math.max(0, Math.min(255, Math.round(x)));
  });
  return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// UI 패널 (짙은 남색 + 금 테두리 — 왕국 문장 모티프)
export function drawPanel(g, x, y, w, h, { border = PALETTE.goldDark, bg = 'rgba(22, 19, 39, 0.94)' } = {}) {
  g.fillStyle = bg;
  g.fillRect(x, y, w, h);
  g.fillStyle = border;
  g.fillRect(x, y, w, 2);
  g.fillRect(x, y + h - 2, w, 2);
  g.fillRect(x, y, 2, h);
  g.fillRect(x + w - 2, y, 2, h);
  // 모서리 장식
  g.fillStyle = PALETTE.gold;
  for (const [cx, cy] of [[x, y], [x + w - 6, y], [x, y + h - 6], [x + w - 6, y + h - 6]]) {
    g.fillRect(cx, cy, 6, 2);
    g.fillRect(cx, cy, 2, 6);
    g.fillRect(cx + 4, cy + 4, 2, 2);
  }
}
