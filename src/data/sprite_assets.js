// ============================================================
// sprite_assets.js — 손그림/AI 스프라이트 등록표 (절대 규칙 3: 데이터 주도)
//
// 여기에 등록된 유닛은 **이미지 파일**을 쓰고, 없는 유닛은 코드 생성으로 그린다.
// 캐릭터가 하나씩 완성될 때마다 이 표에 한 줄만 추가하면 자동 교체된다.
//
// 파일 규격: 96×64 × res 배 PNG, 투명 배경, **왼쪽을 보는** 그림
//   (오른쪽은 게임이 자동으로 좌우 반전한다)
//   res: 2 = 192×128 고해상도 (2026-08-23 전 세트 이행) — 발끝 y≈120, 몸 기준 116px.
//   화면 확대율(×2)을 sprScale이 res로 나눠 화면 크기는 res 1과 동일하고 밀도만 2배다.
//   무기를 뻗은 포즈가 잘리지 않도록 세로보다 가로를 넓게 쓴다 (가로는 자유 확장).
//   변환은 tools/build_<캐릭터>.py — 세트 공통 배율(idle0 기준) 원칙, 포즈별 높이 맞춤 금지
//     (포즈마다 높이를 맞추면 돌진·쓰러짐 프레임에서 몸이 커졌다 작아진다).
// ============================================================

const DIR = 'assets/sprites';

export const SPRITE_ASSETS = {
  // 주인공 검사 (남) — AI 생성본 변환 적용
  hero_sword: {
    dir: `${DIR}/hero_sword`,
    facing: 'left', res: 2,            // 원본이 바라보는 방향
    poses: {
      idle: ['idle0', 'idle1'],
      attack: ['attack0', 'attack1', 'attack2', 'attack3'],
      walk: ['walk0', 'walk1', 'walk2', 'walk3'],
      cast: ['cast'],
      hurt: ['hurt'],
      down: ['down'],
    },
  },
  // 주인공 궁수 (남) — 캐릭터별 이펙트 패스 1번 (2026-08-05, v2 세트 2026-08-06)
  // v1은 attack2가 "메기기"로 뽑혀 재배열([0,2,1,3])로 돌렸으나,
  // v2 세트 재생성에서 포즈가 발주 의도대로 나와 **파일 순서 = 궁술 순서**가 됐다:
  //   attack0(장전) → attack1(풀 드로우) → attack2(릴리즈, 화살 없음) → attack3(잔심)
  // cast = attack_up(상향 풀 드로우) 재사용 — 화살비·성궁이 하늘로 쏘는 인과의 반쪽
  hero_archer: {
    dir: `${DIR}/hero_archer`,
    facing: 'left', res: 2,
    poses: {
      idle: ['idle0', 'idle1'],
      attack: ['attack0', 'attack1', 'attack2', 'attack3'],
      walk: ['walk0', 'walk1', 'walk2', 'walk3'],
      cast: ['attack_up'],
      hurt: ['hurt'],
      down: ['down'],
    },
  },
  // 브란 (★3 불 기사) — 자체 작화 v2 창+방패 (2026-08-22 재발주분, tools/build_c01.py 변환)
  // 기본공격명 '창 찌르기'와 무기 일치. 캔버스 288×128 (창이 길어 가로 확장 — 엔진은 실크기 대응)
  // 원본 12장: walk3=walk1 재사용(A-B-C-B 보행), attack3=(9)가드 자세 충당
  c01: {
    dir: `${DIR}/c01`,
    facing: 'left', res: 2,
    poses: {
      idle: ['idle0', 'idle1'],
      attack: ['attack0', 'attack1', 'attack2', 'attack3'],
      walk: ['walk0', 'walk1', 'walk2', 'walk3'],
      cast: ['cast'],
      hurt: ['hurt'],
      down: ['down'],
    },
  },
  // 카시안 (★3 물 마법사) — 자체 작화 13장 (2026-08-22, tools/build_c02.py 변환)
  // 새 지침서(픽셀 굵기·4등신 강조) 1호 — 원본 15장 중 재롤 2장 제외
  c02: {
    dir: `${DIR}/c02`,
    facing: 'left', res: 2,
    poses: {
      idle: ['idle0', 'idle1'],
      attack: ['attack0', 'attack1', 'attack2', 'attack3'],
      walk: ['walk0', 'walk1', 'walk2', 'walk3'],
      cast: ['cast'],
      hurt: ['hurt'],
      down: ['down'],
    },
  },
  // 세라핀 (★3 빛 성직자) — 자체 작화 13장 (2026-08-22, tools/build_c03.py 변환)
  // 원본 14장 중 (4) 걷기 재롤 제외. 날개 성장 탓 기준높이 60 보정 (몸 ≈ 주인공 -10%)
  c03: {
    dir: `${DIR}/c03`,
    facing: 'left', res: 2,
    poses: {
      idle: ['idle0', 'idle1'],
      attack: ['attack0', 'attack1', 'attack2', 'attack3'],
      walk: ['walk0', 'walk1', 'walk2', 'walk3'],
      cast: ['cast'],
      hurt: ['hurt'],
      down: ['down'],
    },
  },
  // 망령 기사 — 적 자체 작화 5호 (2026-08-23, tools/build_wraith_knight.py 변환)
  // 캔버스 240×128 (기병창 가로 확장). 원본 14장 중 검 든 (1)은 창 세트 불일치로 제외
  wraith_knight: {
    dir: `${DIR}/wraith_knight`,
    facing: 'left', res: 2,
    poses: {
      idle: ['idle0', 'idle1'],
      attack: ['attack0', 'attack1', 'attack2', 'attack3'],
      walk: ['walk0', 'walk1', 'walk2', 'walk3'],
      cast: ['cast'],
      hurt: ['hurt'],
      down: ['down'],
    },
  },
  // 암흑 주술사 — 적 자체 작화 3호 (2026-08-23, tools/build_dark_shaman.py 변환)
  dark_shaman: {
    dir: `${DIR}/dark_shaman`,
    facing: 'left', res: 2,
    poses: {
      idle: ['idle0', 'idle1'],
      attack: ['attack0', 'attack1', 'attack2', 'attack3'],
      walk: ['walk0', 'walk1', 'walk2', 'walk3'],
      cast: ['cast'],
      hurt: ['hurt'],
      down: ['down'],
    },
  },
  // 그림자 살수 — 적 자체 작화 4호 (2026-08-23, tools/build_shadow_stalker.py 변환)
  shadow_stalker: {
    dir: `${DIR}/shadow_stalker`,
    facing: 'left', res: 2,
    poses: {
      idle: ['idle0', 'idle1'],
      attack: ['attack0', 'attack1', 'attack2', 'attack3'],
      walk: ['walk0', 'walk1', 'walk2', 'walk3'],
      cast: ['cast'],
      hurt: ['hurt'],
      down: ['down'],
    },
  },
  // 해골 궁수 — 적 자체 작화 2호 (2026-08-22, tools/build_skeleton_archer.py 변환)
  // 원본 10장: idle1(호흡)·hurt(젖힘)는 idle0에서 합성, cast(파워샷 강사)는 풀 드로우 재사용
  skeleton_archer: {
    dir: `${DIR}/skeleton_archer`,
    facing: 'left', res: 2,
    poses: {
      idle: ['idle0', 'idle1'],
      attack: ['attack0', 'attack1', 'attack2', 'attack3'],
      walk: ['walk0', 'walk1', 'walk2', 'walk3'],
      cast: ['attack1'],
      hurt: ['hurt'],
      down: ['down'],
    },
  },
  // 해골 병사 — 적 자체 작화 1호 (2026-08-22, tools/build_skeleton_soldier.py 변환)
  // 원본 13장이 지침서 순서·왼쪽 보기 그대로 나온 첫 세트 (플립 0장)
  skeleton_soldier: {
    dir: `${DIR}/skeleton_soldier`,
    facing: 'left', res: 2,
    poses: {
      idle: ['idle0', 'idle1'],
      attack: ['attack0', 'attack1', 'attack2', 'attack3'],
      walk: ['walk0', 'walk1', 'walk2', 'walk3'],
      cast: ['cast'],
      hurt: ['hurt'],
      down: ['down'],
    },
  },
};

// spriteCfg에서 에셋 키를 뽑는다 (캐릭터 정의의 assetKey 우선)
export function assetKeyOf(def) {
  return def?.assetKey ?? null;
}
