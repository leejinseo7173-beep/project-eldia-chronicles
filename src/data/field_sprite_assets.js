// ============================================================
// field_sprite_assets.js — 필드 캐릭터 그림 등록표 (절대 규칙 1 개정, 2026-08-03)
//
// 등록된 캐릭터는 **이미지 파일**로 걷고, 없는 캐릭터는 코드 생성본으로 걷는다.
// `sprite_assets.js`(전투)와 같은 구조 — 캐릭터가 하나씩 완성될 때마다 한 줄씩 추가한다.
//
// 지금 쓰는 그림 (사용자 선택 2026-08-03: "정통 JRPG 느낌"):
//   "32x32 RPG Character Sprites" by **Eldiran** — CC0. CREDITS.md 참조.
//   **네이티브 32×32**라 확대가 없다. 이게 중요한 이유: 타일(Ivan Voirol)도 네이티브 32×32라
//   픽셀 밀도가 정확히 맞는다. 16×16을 2배로 늘린 그림을 섞으면 인물만 뭉툭해 보인다
//   (이전 팩에서 실제로 그랬다 — 가장 눈에 띄는 종류의 화풍 불일치다).
//
// 시트 배치 (실측으로 확정)
//   384×672 = 12열 × 21행. **행 = 캐릭터, 열 = 방향×프레임**.
//     열 0~3  아래(정면)  — 상반부에 눈 두 개가 검출된다
//     열 4~7  위(뒷모습)  — 눈이 검출되지 않는다
//     열 8~11 옆모습      — bbox 폭이 26px→16px로 좁아진다
//   옆모습은 대부분의 행이 3프레임(8·9·10)만 있어 [8,9,10,9]로 왕복시킨다.
//   시트에 있는 옆모습은 **한쪽 방향뿐**이라 반대쪽은 `flip: true`로 좌우 반전한다.
//
// 배경은 마젠타 키(255,0,255)다 — 고전 픽셀아트 방식. colorKey로 투명 처리한다.
// ============================================================

const SHEET = 'assets/field/chars_iv/eldiran.png';
const MAGENTA = [255, 0, 255];

export const FIELD_SHEETS = { eldiran: SHEET };

const T = 32;
const f = (cx, cy, flip = false) => ({ sx: cx * T, sy: cy * T, ...(flip ? { flip: true } : {}) });

// 시트의 옆모습이 어느 쪽을 보는지는 형태만으로 못 가린다.
// SIDE_FLIP_LEFT = true면 "시트 원본 = 오른쪽", 왼쪽을 뒤집어 만든다.
// 좌우가 반대로 보이면 이 한 줄만 false로 바꾼다.
const SIDE_FLIP_LEFT = true;

// 한 행(캐릭터)을 4방향 세트로 만든다
function row(cy, { darken = 0.06, desaturate = 0.05 } = {}) {
  const side = [8, 9, 10, 9];
  return {
    sheet: 'eldiran', frameW: T, frameH: T, scale: 1,
    colorKey: MAGENTA, darken, desaturate,
    down: [0, 1, 2, 1].map((cx) => f(cx, cy)),
    up: [4, 5, 6, 5].map((cx) => f(cx, cy)),
    left: side.map((cx) => f(cx, cy, SIDE_FLIP_LEFT)),
    right: side.map((cx) => f(cx, cy, !SIDE_FLIP_LEFT)),
  };
}

// 게임 유닛 → 시트 행. 몸통 대표색으로 골랐다(그림을 직접 볼 수 없어서).
//   r1  회색 갑옷      → 주인공 검사
//   r3  파란 로브      → 주인공 마법사
//   r9  갈색 가죽      → 주인공 궁수
//   r6  흰색          → 해골 병사
//   r7  흰색          → 해골 궁수
//   r5  보라 로브      → 암흑 주술사
//   r11 짙은 보라      → 그림자 살수
//   r10 밝은 회색 갑옷  → 망령 기사
// ----- 손그림 원화 (전투와 같은 방식: 프레임마다 PNG 한 장) -----
//
// 사용자 요청 2026-08-03: **필드도 전투 원화 수준의 퀄리티로 움직이게**.
// 32×32 픽셀아트로는 그 밀도가 안 나온다 — 픽셀이 모자란다. 그래서 크기 제한을 풀고
// 전투와 같은 낱장 원화를 받는 경로를 뚫었다. 발끝 기준으로 그려지므로 키가 커도 된다.
//
// ★현재 상태 — 주인공은 **옆모습만 원화가 있다** (전투가 사이드뷰라 그것만 그렸다).
//   정면·뒷모습이 없어서 임시로 옆모습을 돌려 쓴다. 걷는 퀄리티·크기를 확인하기 위한 것이고,
//   정면/뒷모습 원화가 들어오면 아래 down/up 경로만 갈아끼우면 된다.
//   필요한 그림 목록은 `작화_규격서.md`의 「필드 스프라이트 편」에 있다.
const HS = 'assets/sprites/hero_sword';
// 옆걸음은 전투 walk0~3을 공유했었는데, 전투가 192×128로 올라가며 필드에서 깨졌다
// (2026-08-23 사용자 보고: 거대+발 꺼짐). 변환기가 필드 전용 96×64 사본(walk_side)을
// 따로 뽑는다 — 파일을 분리해 두 화면의 규격이 서로를 다시는 못 깨게 한다.
const heroWalk = (n) => `${HS}/walk_side${n}.png`;

// 정면·뒷모습 걷기 **8프레임** 원화 (2026-08-05 도착).
//   0 접지 → 1 눌림(몸 최저) → 2 통과(몸 최고) → 3 밀어내기 → 4~7 반대 발
//   실측 인물 높이: 정면 58/53/59/58 · 59/52/59/56 — 한 사이클에 물결이 두 번 온다.
//   (한 걸음에 한 번. 걷기가 미끄러져 보이던 원인이 이 물결이 없던 것이었다)
//   변환: `python tools/build_hero_walk16.py` — 캡션 제거·머리 기준 정렬·검 손 고정까지 한다.
const HERO_FRONT = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => `${HS}/walk_down${n}.png`);
const HERO_BACK = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => `${HS}/walk_up${n}.png`);

const heroHandDrawn = {
  files: {
    down: HERO_FRONT,
    up: HERO_BACK,
    // 옆모습 = 전투 walk 원화의 필드 전용 96×64 사본 (tools/build_hero_sword.py가 생성)
    left: [0, 1, 2, 3].map(heroWalk),
    right: [0, 1, 2, 3].map(heroWalk),
  },
  // 원본이 왼쪽을 보므로 오른쪽은 좌우 반전 (전투와 같은 규칙)
  mirror: ['right'],
  // 96×64 안에서 마지막 잉크 행이 y=60이다(전투 옆모습과 동일).
  // footY는 '지면에 닿는 줄'이므로 그 한 줄 아래인 61.
  footY: 61,
  // 멈춰 섰을 때 쓸 프레임. 0번(접지)은 다리가 가장 벌어진 순간이라
  // 가만히 서 있으면 걸음을 멈춘 채 얼어붙은 것처럼 보인다.
  // 2번(통과)은 두 다리가 모인 자세라 그대로 선 자세로 읽힌다.
  idleFrame: { down: 2, up: 2, left: 0, right: 0 },
};

// 적·다른 직업의 원화가 들어올 자리.
// 폴더에 walk_down0~3 / walk_up0~3 / walk_side0~3 을 넣고 아래 주석을 풀면 즉시 교체된다.
// (네 방향이 다 있어야 채택되므로, 준비되기 전에는 켜 두면 안 된다)
function handDrawn(dir) {
  const n = [0, 1, 2, 3];
  return {
    files: {
      down: n.map((i) => `${dir}/walk_down${i}.png`),
      up: n.map((i) => `${dir}/walk_up${i}.png`),
      left: n.map((i) => `${dir}/walk_side${i}.png`),
      right: n.map((i) => `${dir}/walk_side${i}.png`),
    },
    mirror: ['right'],   // 원본이 왼쪽을 본다 (전투와 같은 규칙)
    footY: 62,
  };
}
// 예) skeleton_soldier: { ...row(6), ...handDrawn('assets/sprites/skeleton_soldier') },
void handDrawn;   // 아직 쓰는 곳이 없다 — 원화가 들어오면 위 예시대로 붙인다

// ★적·다른 직업은 **일부러 여기 등록하지 않는다** (2026-08-03).
//   등록하면 Eldiran의 32×32 픽셀 시트를 쓰는데, 주인공 원화(96×64)의 절반 크기라
//   같은 화면에 서면 인물 크기가 안 맞는다. 등록을 비워 두면 `makeFieldSprites`가
//   **전투 스프라이트 생성기(64×64 벡터→축소→양자화)** 로 떨어진다 —
//   크기가 맞고, 전투와 같은 생성기라 화풍도 저절로 일치한다.
//   원화가 들어오면 위의 handDrawn()을 붙여 교체한다.
//
//   Eldiran 시트를 쓰는 경로(row())는 지우지 않았다. 32×32로 돌아갈 일이 생기면
//   아래에 `skeleton_soldier: row(6)` 처럼 한 줄 추가하면 된다.
export const FIELD_SPRITE_ASSETS = {
  hero_sword: { ...row(1), ...heroHandDrawn },
};

export function hasFieldArt(key) {
  return !!key && Object.prototype.hasOwnProperty.call(FIELD_SPRITE_ASSETS, key);
}
