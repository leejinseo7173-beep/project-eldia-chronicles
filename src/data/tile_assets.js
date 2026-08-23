// ============================================================
// tile_assets.js — 필드 타일 그림 등록표 (절대 규칙 1 개정, 2026-08-03)
//
// 등록된 타일은 **이미지 파일**을 쓰고, 없는 타일은 코드 생성으로 그린다.
// 로드 시 톤만 맞춘다(명도·채도) — 팔레트 32색 스냅은 하지 않는다. 이유는 sprites.js 주석 참조.
//
// 시트 (사용자 선택 2026-08-03: "정통 JRPG 느낌"):
//   Ivan Voirol — Slates v.2 (CC-BY 4.0) + Basic map 32x32 (CC-BY 3.0)
//   같은 작가의 두 팩. 둘 다 **네이티브 32×32**라 확대가 없다.
//   CC-BY이므로 CREDITS.md 표기가 **의무**다 (개변 사실 포함).
//
// ★셀 좌표는 2026-08-05에 **시트를 눈으로 보고** 전면 재선정했다.
//   이전에는 seam·색수 같은 통계만으로 골랐는데, 통계는 "반복해도 이음새가 없다"만
//   보장하지 "이게 잔디인가"는 보장하지 못한다. 실제로 밭이랑을 잔디로, 실내 벽을 길로,
//   창살 문을 절벽으로 쓰고 있었다 (사용자: "배경이 조잡하다" — 정확한 지적이었다).
//   전체 시트를 격자·좌표 라벨을 붙여 렌더링해 확인했다. 근거는 DECISIONS.md 참조.
//
// base: 아래에 먼저 깔 타일 id. 배경이 투명한 그림(나무·바위·꽃)에 쓴다.
//       tiles.js가 base도 **그림 잔디**로 깐다 (코드 생성 잔디를 깔면 배경이 두 종류가 된다).
// ============================================================

const DIR = 'assets/field/tiles_iv';
const OBJ = 'assets/field/obj';

export const TILE_SHEETS = {
  slates: `${DIR}/slates.png`,       // Slates v.2 — 흙길로만 쓴다
  basic: `${DIR}/basicmap.png`,      // Basic map — 잔디·숲·바위·꽃·돌담·물·다리 (주력)
};

// ----- 필드 오브젝트 아이콘 (상자·채집물) -----
// 이쪽은 Ninja Adventure(CC0) 것을 그대로 쓴다 — 32×32 안의 작은 아이콘이라
// 화풍 이질감이 가장 적게 드러나는 영역이고, 대체할 만한 것이 두 팩에 없다.
export const OBJECT_SHEETS = {
  objChest: `${OBJ}/chest.png`,
  objPlant: `${OBJ}/plant.png`,
  objRock: `${OBJ}/res_rock.png`,
};

export const OBJECT_ASSETS = {
  chest: { sheet: 'objChest', sx: 0, sy: 0, w: 16, h: 16, scale: 2 },
  gather_herb: { sheet: 'objPlant', sx: 0, sy: 0, w: 16, h: 16, scale: 2 },
  gather_stone: { sheet: 'objRock', sx: 0, sy: 0, w: 16, h: 16, scale: 2 },
  gather_wood: { sheet: 'objPlant', sx: 16, sy: 0, w: 16, h: 16, scale: 2 },
};

const T = 32;
// 네이티브 32×32 — 확대 없음(scale 1)
const cell = (sheet, cx, cy, extra = {}) => ({ sheet, sx: cx * T, sy: cy * T, w: T, h: T, scale: 1, ...extra });

export const TILE_ASSETS = {
  // 잔디 — Basic map의 잎 무늬 잔디, **(1,2) 한 셀만** 쓴다.
  // ★이 팩은 셀마다 가장자리가 살짝 어둡다(실측 seam -4~-22). 셀을 여러 개 섞으면
  //   그 가장자리들이 격자로 드러난다. seam이 사실상 0인 (1,2)(+1.1) 하나만 깔면
  //   격자가 완전히 사라진다 (single_cell_test 실측). 변형은 스페클로 만든다 —
  //   타일 평균색에서 뽑은 점만 찍으므로 새 색이 안 들어와 화풍이 유지된다.
  grass: [
    cell('basic', 1, 2),
    cell('basic', 1, 2, { speckle: 26 }),
    cell('basic', 1, 2, { speckle: 26 }),
    cell('basic', 1, 2, { speckle: 26 }),
  ],
  // 풀숲 변형 — 같은 셀에 스페클만 진하게. 도드라지는 액센트는 flower가 담당한다.
  grassTuft: [cell('basic', 1, 2, { speckle: 60 }), cell('basic', 1, 2, { speckle: 44 })],
  // 꽃 — 성긴 버전(밀집 버전은 행8·10). 투명 배경이라 잔디를 base로 깐다.
  flower: [
    cell('basic', 1, 9, { base: 'grass' }),
    cell('basic', 2, 9, { base: 'grass' }),
  ],
  // 길 — Slates의 석판 포장(밝기 131~144, 잔디 78과 조화). "함락된 왕국의 옛 가도".
  //   흙(밝기 55)은 잔디 옆에서 검은 띠로 보였고, 모래(밝기 198)는 사막처럼 쨍했다.
  //   셋을 잔디 위에 깔아 비교한 결과다 (road_compare 실측, DECISIONS.md).
  road: [
    cell('slates', 12, 1), cell('slates', 13, 1),
    cell('slates', 14, 1), cell('slates', 12, 2),
  ],
  // 다리 — Basic map 물 구역의 진짜 가로 다리 판자.
  //   판자 틈으로 밝은 물이 비쳐 보이게 그려져 있다 → 물도 같은 팩의 밝은 페어를 쓴다.
  bridge: [cell('basic', 3, 18), cell('basic', 4, 18)],
  // 숲(나무 타일) — 큰 수풀 2×2를 좌표 패리티로 이어 깐다 (tiles.js TILE_PATTERNS).
  //   순서: [좌상, 우상, 좌하, 우하, 단독]. 네 조각 모두 잎이라 군집 가장자리가 안 깨진다.
  //   단독 나무(사방에 숲이 없는 칸)는 작은 수풀 한 그루.
  tree: [
    cell('basic', 2, 12, { base: 'grass' }), cell('basic', 3, 12, { base: 'grass' }),
    cell('basic', 2, 13, { base: 'grass' }), cell('basic', 3, 13, { base: 'grass' }),
    cell('basic', 4, 12, { base: 'grass' }),
  ],
  // 바위 — 채도 낮은 회록 바위 무더기 (행14). 투명 배경 + 잔디 base.
  rock: [
    cell('basic', 0, 14, { base: 'grass' }),
    cell('basic', 1, 14, { base: 'grass' }),
    cell('basic', 2, 14, { base: 'grass' }),
  ],
  // 절벽(맵 경계) — 이끼 낀 회록 돌담. 폐허가 된 왕국의 성벽으로 읽힌다.
  cliff: [cell('basic', 3, 1), cell('basic', 3, 3)],
  // 숨김길은 **발견 전에는 바위와 똑같아야** 한다 → rock 첫 셀과 동일
  hidden: [cell('basic', 0, 14, { base: 'grass' })],
};

// 숲 퀼트 — 이 타일은 변형을 랜덤으로 고르지 않고 (x%2, y%2)로 고른다.
// 2×2 원본이 이음새 없이 이어져 군집이 한 덩어리 숲으로 보인다.
export const TILE_PATTERNS = { tree: '2x2' };

// 물 — **같은 자리의 애니메이션 페어**를 쓴다 (PART 1 ↔ PART 2, 열 +10).
// 실측: (0,16)↔(10,16)은 620px이 다른 진짜 물결 프레임이다.
// 이전에는 서로 다른 무늬 3개를 돌려서 물결이 아니라 그림 점프로 보였다.
export const WATER_ART = [cell('basic', 0, 16), cell('basic', 10, 16)];

// 톤 보정 — 원본이 밝고 쨍하다(잔디 채도가 높다). "함락된 왕국"에 맞게 살짝 누른다.
export const TILE_TONE = { darken: 0.08, desaturate: 0.12 };

export function hasTileArt(id) {
  return Object.prototype.hasOwnProperty.call(TILE_ASSETS, id);
}

export function tileArtEntries(id) {
  const v = TILE_ASSETS[id];
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}
