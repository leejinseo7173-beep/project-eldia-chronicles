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

// ----- 유닛 스프라이트 생성 (32×32, 4방향 × 2프레임 + 공격 자세 — 로드 시 프리렌더) -----

// cfg: { skin, hair, armor, armorDark, cloth, weapon: 'sword'|'lance'|'bone', shield?, skeleton? }
// frame 1 = 호흡/걷기 프레임 (상체 1px 아래). pose 'attack' = 무기 내지르기 (좌우만)
export function makeUnitSprites(cfg) {
  const drawBody = (g, facing, pose, frame) => {
    const P = PALETTE;
    const px = (c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const dy = frame === 1 ? 1 : 0;   // 상체 호흡 오프셋 (다리는 고정)

    if (facing === 'left') {
      const atk = pose === 'attack';
      const dx = atk ? -2 : 0;        // 공격 자세: 상체를 앞으로 기울임
      // 옆모습 (오른쪽은 미러)
      px(cfg.hair, 12 + dx, 4 + dy, 8, 3);
      px(cfg.skin, 12 + dx, 7 + dy, 7, 6);
      px(cfg.hair, 17 + dx, 6 + dy, 3, 4);
      if (cfg.skeleton) px(P.black, 13 + dx, 9 + dy, 2, 2);
      else px(P.black, 13 + dx, 9 + dy, 1, 1);            // 눈
      px(cfg.armor, 11 + dx, 13 + dy, 9, 9);              // 몸통
      px(cfg.armorDark, 11 + dx, 19 + dy, 9, 2);          // 벨트
      if (cfg.skeleton) { px(cfg.armorDark, 12 + dx, 14 + dy, 7, 1); px(cfg.armorDark, 12 + dx, 16 + dy, 7, 1); px(cfg.armorDark, 12 + dx, 18 + dy, 7, 1); }
      // 다리 (걷기 프레임: 가위꼴)
      if (frame === 1) { px(cfg.cloth, 11, 22, 3, 5); px(cfg.cloth, 17, 22, 3, 5); px(P.black, 11, 27, 3, 1); px(P.black, 17, 27, 3, 1); }
      else { px(cfg.cloth, 12, 22, 3, 5); px(cfg.cloth, 16, 22, 3, 5); px(P.black, 12, 27, 3, 1); px(P.black, 16, 27, 3, 1); }
      if (atk) {
        // 내지른 팔 + 수평 무기
        px(cfg.armorDark, 6, 14 + dy, 5, 2);
        px(cfg.skin, 4, 14 + dy, 2, 2);
        if (cfg.weapon === 'sword') { px(P.gray4, 0, 14 + dy, 10, 2); px(P.goldDark, 4, 13 + dy, 2, 4); }
        if (cfg.weapon === 'lance') { px(P.brown, 0, 14 + dy, 12, 2); px(P.gray4, 0, 13 + dy, 3, 4); }
        if (cfg.weapon === 'bone') { px(P.gray4, 1, 13 + dy, 9, 3); px(P.gray2, 8, 14 + dy, 3, 2); }
        if (cfg.weapon === 'axe') { px(P.brown, 2, 14 + dy, 9, 2); px(P.gray4, 0, 12 + dy, 4, 6); }
        if (cfg.weapon === 'dagger') { px(P.gray4, 3, 14 + dy, 6, 2); px(P.goldDark, 8, 14 + dy, 2, 2); }
        if (cfg.weapon === 'bow') {
          // 시위 당긴 활 + 화살
          px(P.brown, 5, 8 + dy, 2, 14);
          px(P.gray4, 5, 8 + dy, 6, 1); px(P.gray4, 5, 21 + dy, 6, 1);
          px(P.gray4, 0, 14 + dy, 8, 1); px(P.white, 0, 14 + dy, 2, 1);
        }
        if (cfg.weapon === 'staff') { px(P.brown, 0, 14 + dy, 11, 2); px(cfg.armor, 0, 12 + dy, 3, 3); }
        if (cfg.shield) px(cfg.armorDark, 8, 17 + dy, 4, 6);
      } else {
        // 세워 든 무기 (앞쪽)
        if (cfg.weapon === 'sword') { px(P.gray4, 8, 8 + dy, 2, 10); px(P.goldDark, 7, 18 + dy, 4, 2); }
        if (cfg.weapon === 'lance') { px(P.brown, 8, 6 + dy, 2, 16); px(P.gray4, 8, 4 + dy, 2, 2); }
        if (cfg.weapon === 'bone') { px(P.gray4, 8, 9 + dy, 2, 9); px(P.gray2, 7, 18 + dy, 4, 2); }
        if (cfg.weapon === 'axe') { px(P.brown, 8, 8 + dy, 2, 12); px(P.gray4, 6, 8 + dy, 4, 4); }
        if (cfg.weapon === 'dagger') { px(P.gray4, 8, 13 + dy, 2, 6); px(P.goldDark, 7, 18 + dy, 4, 1); }
        if (cfg.weapon === 'bow') { px(P.brown, 7, 7 + dy, 2, 15); px(P.gray4, 8, 7 + dy, 3, 1); px(P.gray4, 8, 21 + dy, 3, 1); }
        if (cfg.weapon === 'staff') { px(P.brown, 8, 6 + dy, 2, 15); px(cfg.armor, 7, 4 + dy, 4, 4); }
        if (cfg.shield) px(cfg.armorDark, 6, 13 + dy, 4, 8);
      }
      return;
    }

    const back = facing === 'up';
    px(cfg.hair, 11, 4 + dy, 10, 3);
    if (back) { px(cfg.hair, 11, 7 + dy, 10, 6); }
    else {
      px(cfg.skin, 12, 7 + dy, 8, 6);
      if (cfg.skeleton) { px(P.black, 13, 9 + dy, 2, 2); px(P.black, 17, 9 + dy, 2, 2); }
      else { px(P.black, 14, 9 + dy, 1, 1); px(P.black, 17, 9 + dy, 1, 1); }
    }
    px(cfg.armor, 11, 13 + dy, 10, 9);
    px(cfg.armorDark, 11, 19 + dy, 10, 2);
    if (cfg.skeleton && !back) { px(cfg.armorDark, 12, 14 + dy, 8, 1); px(cfg.armorDark, 12, 16 + dy, 8, 1); px(cfg.armorDark, 12, 18 + dy, 8, 1); }
    px(cfg.armorDark, 9, 13 + dy, 2, 6); px(cfg.armorDark, 21, 13 + dy, 2, 6);
    if (frame === 1) { px(cfg.cloth, 11, 22, 3, 5); px(cfg.cloth, 18, 22, 3, 5); px(P.black, 11, 27, 3, 1); px(P.black, 18, 27, 3, 1); }
    else { px(cfg.cloth, 12, 22, 3, 5); px(cfg.cloth, 17, 22, 3, 5); px(P.black, 12, 27, 3, 1); px(P.black, 17, 27, 3, 1); }
    if (cfg.weapon === 'sword') { px(P.gray4, 24, 7 + dy, 2, 11); px(P.goldDark, 23, 18 + dy, 4, 2); }
    if (cfg.weapon === 'lance') { px(P.brown, 24, 5 + dy, 2, 17); px(P.gray4, 24, 3 + dy, 2, 2); }
    if (cfg.weapon === 'bone') { px(P.gray4, 24, 9 + dy, 2, 9); px(P.gray2, 23, 18 + dy, 4, 2); }
    if (cfg.weapon === 'axe') { px(P.brown, 24, 8 + dy, 2, 13); px(P.gray4, 23, 8 + dy, 4, 4); }
    if (cfg.weapon === 'dagger') { px(P.gray4, 24, 13 + dy, 2, 6); px(P.goldDark, 23, 18 + dy, 4, 1); }
    if (cfg.weapon === 'bow') { px(P.brown, 24, 6 + dy, 2, 15); px(P.gray4, 24, 6 + dy, 3, 1); px(P.gray4, 24, 20 + dy, 3, 1); }
    if (cfg.weapon === 'staff') { px(P.brown, 24, 5 + dy, 2, 16); px(cfg.armor, 23, 3 + dy, 4, 4); }
    if (cfg.shield && !back) px(cfg.armorDark, 5, 12 + dy, 5, 9);
    if (cfg.shield && back) px(cfg.armorDark, 22, 12 + dy, 5, 9);
  };

  const make = (facing, pose, frame) => prerender(32, 32, (g) => drawBody(g, facing, pose, frame));
  const mirror = (c) => prerender(32, 32, (g) => {
    g.save(); g.translate(32, 0); g.scale(-1, 1); g.imageSmoothingEnabled = false; g.drawImage(c, 0, 0); g.restore();
  });
  const leftIdle = [make('left', 'idle', 0), make('left', 'idle', 1)];
  const leftAttack = make('left', 'attack', 0);
  return {
    idle: {
      down: [make('down', 'idle', 0), make('down', 'idle', 1)],
      up: [make('up', 'idle', 0), make('up', 'idle', 1)],
      left: leftIdle,
      right: leftIdle.map(mirror),
    },
    attack: { left: leftAttack, right: mirror(leftAttack) },
  };
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
