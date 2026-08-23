// ============================================================
// fx.js — 전투 연출 수치 (작업계획.md 1부 §7 기술 메모)
//
// 여기 있는 값은 **밸런스가 아니라 연출**이다. 게임의 강약에 영향을 주지 않고
// 손맛·가독성만 바꾼다. 그래서 balance.js가 아니라 이 파일에 모은다.
// (balance.js는 절대 규칙 2에 따라 게임 수치 전용)
// ============================================================

// ----- 원거리 투사체 (skills.js의 shot.kind와 대응) -----
// speed = px/초. 비행 시간을 거리에서 계산하므로 뒷열을 쏘면 실제로 더 오래 난다.
// arc   = 포물선 높이(px, 음수 = 위로 솟음). 화살은 크게, 마법탄은 거의 직선.
// len   = 꼬리를 포함한 길이(px). thick = 굵기(px).
// count/spread/stagger = volley 전용. 여러 발이 세로로 퍼져 잇달아 꽂힌다.
//
// 기준 사거리(앞열↔앞열 ≈ 295px)에서 화살 0.20초 / 마력탄 0.30 / 구슬 0.33이 되게 잡았다.
// 뒷열끼리(≈755px)는 상한에 걸려 0.42로 끊긴다 — 더 길면 턴이 늘어져 손맛이 죽는다.
// sprite: 프리렌더 스프라이트 스타일 (proj_sprites.js — 2026-08-05 고퀄화).
//   'flame' = 불꽃 혀 달린 혜성형 화구 (80×44px, 4프레임 12fps)
//   'energyArrow' = 발광하는 긴 촉의 마력 화살 (60×16px, 2프레임)
//   없으면 예전 사각형 줄무늬로 그린다 (임시 대체 경로 유지).
// embers: 비행 중 뒤로 흘리는 불티. every = 이 거리(px)마다 1개.
// draw: 이 종류만의 예비(당기기) 시간 — 없으면 SHOT_DRAW.
//   활은 "시위를 당긴다"가 보여야 해서 마법 응집보다 길다 (사용자 확인 2026-08-06).
export const PROJECTILES = {
  arrow:  { speed: 1500, arc: -26, len: 24, thick: 3, core: 'white', draw: 0.45,
            sprite: 'energyArrow', embers: { every: 34, dur: 0.34, size: 2 } },
  bolt:   { speed: 1000, arc: -12, len: 16, thick: 6, core: 'white',
            sprite: 'flame', embers: { every: 16, dur: 0.5, size: 3 } },
  orb:    { speed: 900,  arc: -34, len: 12, thick: 8, core: 'white',
            sprite: 'flame', embers: { every: 20, dur: 0.45, size: 3 } },
  volley: { speed: 1250, arc: -64, len: 20, thick: 3, core: 'white', count: 3, spread: 22, stagger: 0.05, draw: 0.45,
            sprite: 'energyArrow', embers: { every: 44, dur: 0.3, size: 2 } },
  // arrowRain = 하늘에서 꽂히는 화살 (화살비·성궁 해방).
  // 가로로 쏜 화살이 착탄에서 비로 바뀌면 인과가 끊긴다(사용자 지적 2026-08-05) —
  // 아예 **대상 머리 위에서 떨어지는 세로 화살**로 쏜다. sky가 그 표식.
  arrowRain: { speed: 950, arc: 0, len: 20, thick: 3, core: 'white', count: 4, spread: 30, stagger: 0.07, draw: 0.45,
               sprite: 'energyArrowDown', sky: { height: 290 },
               embers: { every: 34, dur: 0.28, size: 2 } },
  // wave = 날아가는 검기. 블록 꼬리가 아니라 **초승달**로 그린다 (crescent 규격이 있으면 그쪽).
  wave:   { speed: 1050, arc: 0, len: 34, thick: 10, core: 'white',
            crescent: { r: 36, spread: 1.15, thick: 11, flat: 1.0, grow: 1.15 } },
};

// 스프라이트 투사체 공통 연출 수치
export const PROJ_ART = {
  fps: 12,             // 화구 프레임 속도 — 타오르는 일렁임의 리듬
  emberGravity: 260,   // 불티가 떨어지는 가속 (px/s²)
  emberDriftY: -18,    // 불티 초기 상승 — 살짝 떠올랐다가 떨어져야 불티답다
  glowAlpha: 0.24,     // 스프라이트 밑에 까는 발광 타원의 알파 ('lighter')
  glowScale: 0.62,     // 발광 타원 크기 (스프라이트 높이 대비)
  // 아트 픽셀 1칸을 화면 몇 px로 찍을지. 2로 했더니 "작아서 안 보인다"(사용자 2026-08-05)
  // — 기본 3배, 성물은 4배. 정수 배만 쓴다 (규칙 7).
  // 크기 미세 조정은 proj_sprites.js의 아트 그리드(W·H)로 한다 — 3배 최초판이
  // "너무 크다"고 해서 그리드를 40×22 → 33×19로 줄였다 (99×57).
  basePx: 3,
  sacredPx: 4,
};

// 비행 중 반짝이 — 투사체 주변에서 터지는 십자 별빛 (레퍼런스: 푸른 궤적의 별 반짝임)
export const TWINKLE = {
  everyN: 2,          // 불티 N개당 반짝이 1개
  dur: 0.42,
  size: 8,            // 십자 팔 길이(px) — sin 곡선으로 커졌다 작아진다
  jitter: 18,         // 투사체에서 벗어나는 산포 반경
};

// ----- 궁수 고유 스킬 연출 (캐릭터별 이펙트 패스 1번 — 2026-08-06) -----
export const ARCHER_FX = {
  pierce: {            // 정밀 사격·매의 표식 — 관통 섬광 + 과녁 문양
    flashR: 30,        // 가로로 길쭉한 관통 섬광 반지름
    flashAspect: 0.32, // 세로 눌림 (1 = 원)
    reticleR: 26,      // 과녁 바깥 링
    reticleDur: 0.55,  // 과녁이 남는 시간 — 표식이 "찍혔다"를 읽을 시간
    ticks: 4,          // 십자 눈금
  },
  riser: {             // 화살비·성궁 — 발사 순간 하늘로 솟는 화살
    height: 200,       // 이만큼 솟은 뒤 사라진다 (비는 그 뒤 하늘에서)
    dur: 0.22,
  },
  holy: {              // 성궁 해방 착탄 — 금빛 빛기둥
    beamH: 64, beamW: 7,
    beamDur: 0.5,
  },
};

// 발사 시전 오라 — 시위를 당기고 마력을 모으는 동안 시전자 몸 주변에 감긴다.
// (치유의 가호(blessing)가 대상 발밑에 마법진을 까는 것과 짝을 이루는 연출)
export const CAST_AURA = {
  glyphR: 42,         // 발밑 마법진 최종 반지름
  glyphDur: 0.6,
  converge: 9,        // 몸으로 빨려드는 빛 입자
  convergeR: 56,      // 그 입자들이 출발하는 거리
  convergeDur: 0.26,
  wisps: 5,           // 몸 주변에서 떠오르는 빛줄기
  ringR: 34,          // 몸통 높이에서 퍼지는 작은 파동
};

export const SHOT_DRAW = 0.30;      // 시위를 당기거나 마력을 모으는 예비 동작
                                    // (0.22 → 0.30: 궁수 예비가 3박자가 되면서 읽을 시간이 필요)
export const SHOT_RECOVER = 0.16;   // 쏜 뒤 자세를 푸는 잔심
export const SHOT_MIN_FLIGHT = 0.13;
export const SHOT_MAX_FLIGHT = 0.42;

// 투사체가 나가는 총구 위치 (앵커는 발끝이므로 손 높이로 올린다)
export const MUZZLE_UP = 52;
export const MUZZLE_FWD = 26;
export const TARGET_UP = 44;

// ----- 성물·필살기 등급 연출 (작업계획.md 1부 §4 스킬 등급별 차등) -----
// 성물은 일반 스킬과 같은 연출로는 무게가 안 산다.
// 배경을 죽이고 시전자만 남긴 뒤, 빛을 그러모아 한 번에 터뜨린다.
export const SACRED = {
  castDur: 1.05,     // 성물 시전 이벤트 길이 (일반 스킬 0.4)
  dimTo: 0.74,       // 배경이 어두워지는 최대 알파
  dimIn: 0.26,       // 이 비율까지 어두워지고, 이후 서서히 걷힌다
  chargeCount: 24,   // 시전자에게 빨려드는 빛 입자
  chargeR: 96,       // 그 입자들이 출발하는 거리
  releaseAt: 0.56,   // 터지는 시점 (0~1)
  flashDur: 0.24,    // 화면 섬광 길이
  flashPeak: 0.8,    // 섬광 최대 알파
  shake: 0.55,
  freeze: 0.13,      // 터지는 순간 정지 (히트스톱 맛보기 — 전 등급 적용은 계획서 6번)
  projScale: 1.65,   // 성물 투사체 확대 배율
};

// ----- 피격 찌그러짐 (작업계획.md 1부 §7 — 넉백·흔들림·팝업의 마지막 조각) -----
// 맞는 순간 발끝을 고정한 채 세로로 눌리고 가로로 퍼졌다가 복원된다.
export const SQUASH = {
  dur: 0.14,   // 지속 (짧아야 탄성으로 읽힌다)
  y: 0.16,     // 세로 눌림 비율
  x: 0.10,     // 가로 퍼짐 비율
};

// ----- 히트스톱 (작업계획.md 1부 §5) -----
// 타격 순간 화면을 멎게 해 무게를 준다. 계획서의 프레임 수 기준(60fps)을 초로 옮긴 값.
// 멎는 것은 이벤트 시계와 파티클뿐 — 화면 연출(섬광·흔들림)은 계속 흘러야 굳어 보이지 않는다.
export const HITSTOP = {
  basic: 4 / 60,
  active: 6 / 60,
  sacred: 10 / 60,
  crit: 10 / 60,
  kill: 14 / 60,
  speedFactor: 0.6,   // 2배속에서도 배속 영향을 이만큼만 받는다 (그대로 절반이면 손맛 소실)
};

// ----- 돌진 모션 곡선 (작업계획.md 1부 §5) -----
// 예비(뒤로 빼기) → 급가속 돌진 → 정지 → 감속 복귀.
// 등속으로 왕복하면 미끄러지듯 보인다. 때리기 직전에 몸을 빼야 힘이 실린다.
export const LUNGE = {
  windupTo: 0.18,    // 이 시점까지 뒤로 뺀다
  windupBack: 0.12,  // 돌진 거리의 이만큼 뒤로
  strikeTo: 0.42,    // 여기서 대상에 도달 (근접 타격 시점과 일치)
  holdTo: 0.68,      // 여기까지 붙어 있는다
};

// ----- 마법 이펙트 (burst·ring·rain 고퀄화 — 작업계획.md 1부 원화 대기 묶음에서 분리) -----
// 참격(SLASH)과 같은 시각 언어를 쓴다: 합성 'lighter' + [후광 → 몸통 → 흰 심] 3겹.
// 단색 사각형만 날리던 이전 버전과 달리, 겹칠수록 밝아져 중심이 하얗게 타오른다.
export const MAGIC = {
  burst: {           // 마법탄 착탄 폭발 — 스킬 대부분이 쓰는 주력
    dur: 0.36,
    flashR: 26,      // 중심 섬광이 퍼지는 최종 반지름
    shards: 10,      // 사방으로 튀는 빛 조각
    shardSpeed: 235,
    ringR: 58,       // 충격파 링 최종 반지름
    ringDur: 0.30,
  },
  ring: {            // 광역 파동·버프 확산
    r0: 10, r1: 66, dur: 0.42,
    thick: 6,        // 몸통 굵기 (후광·흰 심은 여기서 파생)
    sparks: 7,       // 링 위에서 떠오르는 빛알
  },
  rain: {            // 화살비·낙하 계열
    drops: 9,
    spreadX: 88,     // 낙하 지점이 퍼지는 가로 폭
    fallH: 116,      // 이 높이에서 떨어진다
    speed: 470,      // px/초
    stagger: 0.04,   // 방울 간 시간차 — "드르륵" 꽂히는 리듬
    w: 3, h: 20,     // 방울 줄기 굵기·길이
    splashR: 13,     // 착지 섬광 반지름
  },
};

// ----- 참격 궤적 -----
// 칼이 지나간 자리에 남는 초승달. 가운데가 두껍고 양끝이 뾰족하다.
// 발광은 합성 모드 'lighter'로 낸다 — 후광·몸통·심이 겹칠수록 밝아져
// 가운데가 저절로 하얗게 타오른다 (레퍼런스의 흰 심 + 색 번짐).
export const SLASH = {
  r: 44,          // 호의 반지름
  spread: 1.30,   // 호가 덮는 각도 (±라디안, 약 ±75°)
  thick: 12,      // 가장 두꺼운 지점의 굵기
  flat: 0.94,     // 세로 눌림 — 사이드뷰라 살짝만
  dur: 0.34,
  sweep: 0.28,    // 이 비율까지 호가 그려지며 나타난다 (베는 순간)
  grow: 1.22,     // 사라지면서 이만큼 퍼진다
  steps: 30,      // 호를 이 개수의 픽셀 블록으로 그린다
  sparks: 8,      // 튀는 불티
};
