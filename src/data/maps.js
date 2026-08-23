// ============================================================
// maps.js — 필드 맵 데이터 (절대 규칙 3: 데이터 주도)
// 기획서 §13: 지역당 맵 2개, 약 40×30타일. 타일 32×32.
//
// 맵은 **문자 격자**로 쓴다. 한 글자 = 한 타일이라 소스에서 지형이 그대로 보이고,
// 새 맵 추가가 코드 수정 없이 문자열 추가로 끝난다.
// 좌표는 전부 **타일 단위**다 (픽셀 변환은 필드 씬이 한다).
//
// ★ 아래 validateMaps()가 로드 시 행 길이·오브젝트 위치를 전부 검사한다.
//   손으로 쓴 격자는 한 칸 어긋나도 눈에 안 보이므로, 조용히 넘어가지 않게 막는다.
// ============================================================

export const MAP_W = 40;
export const MAP_H = 30;
export const TILE = 32;

// 타일 정의 — 문자 → { id, solid }
// id는 tiles.js가 그림을 만들 때 쓰는 키다 (그리기는 core, 배치는 data).
export const TILES = {
  '.': { id: 'grass', solid: false },
  ',': { id: 'grassTuft', solid: false },   // 풀 변형 — 단조로움 방지
  'f': { id: 'flower', solid: false },
  '=': { id: 'road', solid: false },
  '+': { id: 'bridge', solid: false },
  'T': { id: 'tree', solid: true },
  '#': { id: 'rock', solid: true },
  '~': { id: 'water', solid: true },
  '^': { id: 'cliff', solid: true },
  // 숨김길: 겉보기엔 벽인데 실제로는 통과된다. 밟는 순간 드러나고 세이브에 남는다.
  // solid: false인 이유 — 막아 두면 "밟아서 발견"이 성립하지 않는다. 위장은 렌더에서 한다.
  'H': { id: 'hidden', solid: false, disguise: true },
};

// ----- 1장 맵 ① 새벽별 평원 -----
// 개울(col 20~21)이 맵을 좌우로 가르고 다리(r14~15)로만 건넌다.
// 좌측 = 요새로 돌아가는 길 / 우측 = 잿빛 숲으로 이어진다.
const DAWN_PLAIN_ROWS = [
  //        0         1         2         3
  //        0123456789012345678901234567890123456789
  /*  0 */ '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^',
  /*  1 */ '^...................~~.................^',
  /*  2 */ '^.TTT...............~~...........TTT...^',
  /*  3 */ '^.TTTT..........,...~~..........TTTTT..^',
  /*  4 */ '^..TTT..............~~..........TT.TT..^',
  /*  5 */ '^...T............f..~~..........TTHTT..^',
  /*  6 */ '^...................~~..........TT.TT..^',
  /*  7 */ '^...................~~..........TT.TT..^',
  /*  8 */ '^....,..............~~..............##.^',
  /*  9 */ '^...................~~............####.^',
  /* 10 */ '^...........f.......~~............####.^',
  /* 11 */ '^...................~~..............##.^',
  /* 12 */ '^...................~~.................^',
  /* 13 */ '^...................~~.................^',
  /* 14 */ '^===================++=================^',
  /* 15 */ '^===================++=================^',
  /* 16 */ '^...................~~.................^',
  /* 17 */ '^.....f.............~~.................^',
  /* 18 */ '^...................~~...........,.....^',
  /* 19 */ '^..TT...............~~.................^',
  /* 20 */ '^.TTTT..............~~..............##.^',
  /* 21 */ '^.TTT...........,...~~............####.^',
  /* 22 */ '^..TT...............~~..............##.^',
  /* 23 */ '^...................~~.................^',
  /* 24 */ '^................f..~~..........#####..^',
  /* 25 */ '^...................~~..........#...#..^',
  /* 26 */ '^...................~~..........#...#..^',
  /* 27 */ '^...................~~..........##H##..^',
  /* 28 */ '^...................~~.................^',
  /* 29 */ '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^',
];

// ----- 1장 맵 ② 잿빛 숲 -----
// 중앙 공터에 정령 제단. 공터는 아래쪽 한 곳으로만 들어간다.
const ASHEN_WOOD_ROWS = [
  //        0         1         2         3
  //        0123456789012345678901234567890123456789
  /*  0 */ '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^',
  /*  1 */ '^TTTTTTTTTTT.....................TTTTTT^',
  /*  2 */ '^TTTTTTT......................TTTTTTTTT^',
  /*  3 */ '^TTTTT..........,...................TTT^',
  /*  4 */ '^TTT................................TTT^',
  /*  5 */ '^TT........###........................T^',
  /*  6 */ '^T........#####........................^',
  /*  7 */ '^..........###..................TTT....^',
  /*  8 */ '^.....................f........TTTTT...^',
  /*  9 */ '^..............................TTTTT...^',
  /* 10 */ '^....,..........................TTT....^',
  /* 11 */ '^............TTTTTTTTTTTTTT............^',
  /* 12 */ '^............TT..........TT............^',
  /* 13 */ '^............T............T............^',
  /* 14 */ '^............T............T............^',
  /* 15 */ '^............T............T............^',
  /* 16 */ '^............T............T............^',
  /* 17 */ '^............TT..........TT............^',
  /* 18 */ '^............TTTTTT..TTTTT.............^',
  /* 19 */ '^......................................^',
  /* 20 */ '^..TTT...........................TTT...^',
  /* 21 */ '^.TTTTT.........f...............TTTTT..^',
  /* 22 */ '^..TTT...........................TTT...^',
  /* 23 */ '^........................,.............^',
  /* 24 */ '^..........####........................^',
  /* 25 */ '^..........#..#........................^',
  /* 26 */ '^..........#H##.................TTT....^',
  /* 27 */ '^..............................TTTTT...^',
  /* 28 */ '^......................................^',
  /* 29 */ '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^',
];

// ----- 오브젝트 -----
// 좌표는 타일 단위. 종류별 규격(기획서 §13 챕터 표준 템플릿):
//   심볼 맵당 5~7 / 채집 8~10 / 상자 4~5(1~2개는 숨김) / NPC 2~3 / 제단 1
//
// ★ 위험 구간 (dangerZones) — 사용자 결정 2026-08-03
//   심볼은 **지정된 구간 안에서만** 나오고, 구간 밖으로는 쫓아 나오지 않는다.
//   그래서 길·다리·제단 공터 같은 통로는 항상 안전하고, 싸우고 싶을 때만 구간에 들어가면 된다.
//   초판은 사방에 심볼을 뿌려서 맵의 46~55%가 위험권이었다 — "조금만 움직이면 전투"의 원인.
//   구간은 화면에 옅은 어둠 + 테두리로 보이고, HUD에 현재 구간 이름이 뜬다.
//   좌표는 타일 단위, w/h는 타일 개수.
//
// gather: 시간 리젠 (balance.field.gatherRegenSec)
// chest:  1회성. hidden: true면 숨김길 너머에 있다
// symbol: 적이 보이고 접촉하면 전투. 처치 후 리젠
// npc:    말을 건다 (대사는 여기 데이터로)
// altar:  정령 제단 — M4에서는 배치·진입까지만, 시련 전투는 M5 이후 (사용자 결정 2026-08-03)
// exit:   다른 맵 또는 거점으로

export const MAPS = {
  dawn_plain: {
    id: 'dawn_plain',
    name: '새벽별 평원',
    rows: DAWN_PLAIN_ROWS,
    // 거점에서 처음 나왔을 때 서는 자리
    spawn: { x: 3, y: 15 },
    // 길(r14~15)과 다리는 어느 구간에도 안 들어간다 — 요새에서 잿빛 숲까지 싸우지 않고 갈 수 있다
    dangerZones: [
      { x: 4, y: 5, w: 14, h: 7, name: '북쪽 초원' },       // 4~17 × 5~11
      { x: 23, y: 3, w: 10, h: 7, name: '강 건너 언덕' },   // 23~32 × 3~9
      { x: 22, y: 18, w: 12, h: 8, name: '남쪽 덤불' },     // 22~33 × 18~25
    ],
    objects: [
      { type: 'exit', x: 1, y: 14, to: 'base', label: '새벽별 요새로' },
      { type: 'exit', x: 38, y: 15, to: 'ashen_wood', spawn: { x: 3, y: 15 }, label: '잿빛 숲으로' },

      { type: 'gather', x: 5, y: 6, item: 'herb', name: '들풀' },
      { type: 'gather', x: 8, y: 11, item: 'herb', name: '들풀' },
      { type: 'gather', x: 14, y: 4, item: 'wood', name: '마른 가지' },
      { type: 'gather', x: 12, y: 18, item: 'herb', name: '들풀' },
      { type: 'gather', x: 6, y: 24, item: 'wood', name: '마른 가지' },
      { type: 'gather', x: 16, y: 25, item: 'herb', name: '들풀' },
      { type: 'gather', x: 26, y: 8, item: 'stone', name: '강가 돌' },
      { type: 'gather', x: 31, y: 18, item: 'stone', name: '강가 돌' },

      { type: 'chest', x: 11, y: 3, id: 'dp_c1' },
      { type: 'chest', x: 7, y: 22, id: 'dp_c2' },
      { type: 'chest', x: 28, y: 12, id: 'dp_c3' },
      // 숨김길(34,27) 너머 바위 알코브 안
      { type: 'chest', x: 34, y: 25, id: 'dp_c4', hidden: true },

      { type: 'symbol', x: 9, y: 8, stageId: 'field_scout' },      // 북쪽 초원
      { type: 'symbol', x: 15, y: 10, stageId: 'field_hunters' },   // 북쪽 초원
      { type: 'symbol', x: 25, y: 6, stageId: 'field_scout' },      // 강 건너 언덕
      { type: 'symbol', x: 28, y: 20, stageId: 'field_ambush' },    // 남쪽 덤불
      { type: 'symbol', x: 24, y: 23, stageId: 'field_scout' },     // 남쪽 덤불

      {
        type: 'npc', x: 4, y: 17, name: '보초병',
        lines: [
          '요새 밖은 아직 위험합니다. 개울 건너편은 특히요.',
          '다리 말고는 건널 데가 없으니, 급하면 그쪽으로 도세요.',
        ],
      },
      {
        type: 'npc', x: 27, y: 16, name: '길 잃은 상인',
        lines: [
          '아이고, 살았다! 해골 놈들한테 짐수레를 통째로 뺏겼지 뭡니까.',
          '저 바위 틈 어딘가에 숨겨둔 게 있는데… 찾을 수가 있어야지.',
        ],
      },
    ],
  },

  ashen_wood: {
    id: 'ashen_wood',
    name: '잿빛 숲',
    rows: ASHEN_WOOD_ROWS,
    spawn: { x: 3, y: 15 },
    // 이름이 '잿빛'인데 화면이 새벽별 평원과 같은 쨍한 초록이었다 (2026-08-06).
    // 프리렌더 때 한 번 채도를 죽이고 재를 얹는다 — 마왕군에 물든 숲의 톤.
    // (0.55/0.88/0.14로는 여전히 초록이 우세했다 — 실측 후 한 단계 더 눌렀다)
    tone: { saturate: 0.38, brightness: 0.82, ash: 'rgba(128, 124, 138, 0.22)' },
    // 제단 공터(13~26 × 11~18)와 그 진입로는 어느 구간에도 안 들어간다.
    // NPC 정찰병이 "그 근처는 놈들도 안 건드린다"고 말하는 것과 일치시킨다.
    dangerZones: [
      { x: 17, y: 3, w: 13, h: 7, name: '북쪽 고목지대' },   // 17~29 × 3~9
      { x: 4, y: 12, w: 8, h: 7, name: '서쪽 덤불' },        // 4~11 × 12~18
      { x: 28, y: 14, w: 8, h: 8, name: '동쪽 비탈' },       // 28~35 × 14~21
      { x: 13, y: 22, w: 15, h: 7, name: '남쪽 깊은 숲' },   // 13~27 × 22~28
    ],
    objects: [
      { type: 'exit', x: 1, y: 15, to: 'dawn_plain', spawn: { x: 36, y: 15 }, label: '새벽별 평원으로' },

      { type: 'gather', x: 6, y: 4, item: 'wood', name: '마른 가지' },
      { type: 'gather', x: 17, y: 3, item: 'herb', name: '이끼' },
      { type: 'gather', x: 22, y: 8, item: 'herb', name: '이끼' },
      { type: 'gather', x: 8, y: 9, item: 'wood', name: '마른 가지' },
      { type: 'gather', x: 5, y: 10, item: 'stone', name: '이끼 낀 돌' },
      { type: 'gather', x: 28, y: 21, item: 'wood', name: '마른 가지' },
      { type: 'gather', x: 19, y: 23, item: 'herb', name: '이끼' },
      { type: 'gather', x: 9, y: 19, item: 'stone', name: '이끼 낀 돌' },
      { type: 'gather', x: 35, y: 12, item: 'wood', name: '마른 가지' },

      { type: 'chest', x: 16, y: 6, id: 'aw_c1' },   // 바위 무더기 옆
      { type: 'chest', x: 34, y: 4, id: 'aw_c2' },
      { type: 'chest', x: 20, y: 13, id: 'aw_c3' },
      { type: 'chest', x: 6, y: 27, id: 'aw_c4' },
      // 숨김길(12,26) 너머 바위 알코브 안
      { type: 'chest', x: 12, y: 25, id: 'aw_c5', hidden: true },

      { type: 'symbol', x: 20, y: 5, stageId: 'field_hunters' },    // 북쪽 고목지대
      { type: 'symbol', x: 26, y: 8, stageId: 'field_ambush' },     // 북쪽 고목지대
      { type: 'symbol', x: 8, y: 14, stageId: 'field_ambush' },     // 서쪽 덤불
      { type: 'symbol', x: 30, y: 17, stageId: 'field_scout' },     // 동쪽 비탈
      { type: 'symbol', x: 16, y: 23, stageId: 'field_hunters' },   // 남쪽 깊은 숲
      { type: 'symbol', x: 24, y: 26, stageId: 'field_hunters' },   // 남쪽 깊은 숲

      // 정령 제단 — 공터 한가운데. 시련 전투는 M5 이후 (DECISIONS.md 2026-08-03)
      {
        type: 'altar', x: 20, y: 15, name: '바람 정령의 제단',
        lines: [
          '이끼 낀 돌기둥이 낮게 울린다. 바람이 한 방향으로만 분다.',
          '아직은… 응답이 없다. 무언가가 더 필요하다.',
        ],
      },

      {
        type: 'npc', x: 6, y: 19, name: '약초꾼 노파',
        lines: [
          '이 숲은 원래 잿빛이 아니었어. 3년 전 그날부터지.',
          '이끼는 마음껏 가져가. 어차피 사흘이면 다시 자라니까.',
        ],
      },
      {
        type: 'npc', x: 31, y: 23, name: '정찰병',
        lines: [
          '가운데 공터에 제단이 있습니다. 들어가는 길은 남쪽 하나뿐이고요.',
          '그 근처는 놈들도 안 건드리더군요. 이유는 모르겠습니다만.',
        ],
      },
    ],
  },
};

// ----- 로드 시 검증 -----
// 손으로 쓴 문자 격자는 한 칸 어긋나도 눈에 안 보인다. 조용히 넘어가면
// "왜 여기가 안 걸어져지" 같은 유령 버그가 되므로, 로드 순간에 터뜨린다.
export function validateMaps() {
  const problems = [];
  for (const [key, map] of Object.entries(MAPS)) {
    if (map.rows.length !== MAP_H) {
      problems.push(`${key}: 행이 ${map.rows.length}개 (${MAP_H}이어야 함)`);
    }
    map.rows.forEach((row, y) => {
      if (row.length !== MAP_W) problems.push(`${key} r${y}: 길이 ${row.length} (${MAP_W}이어야 함)`);
      for (const ch of row) if (!TILES[ch]) problems.push(`${key} r${y}: 알 수 없는 타일 '${ch}'`);
    });

    const at = (x, y) => (map.rows[y] ?? '')[x];
    const solidAt = (x, y) => TILES[at(x, y)]?.solid ?? true;

    if (solidAt(map.spawn.x, map.spawn.y)) problems.push(`${key}: spawn(${map.spawn.x},${map.spawn.y})이 막힌 타일`);

    const seen = new Set();
    for (const o of map.objects) {
      const pos = `${o.x},${o.y}`;
      if (seen.has(pos)) problems.push(`${key}: (${pos})에 오브젝트가 겹침`);
      seen.add(pos);
      if (o.x < 0 || o.x >= MAP_W || o.y < 0 || o.y >= MAP_H) {
        problems.push(`${key}: ${o.type}(${pos})이 맵 밖`);
        continue;
      }
      // 오브젝트는 걸어서 닿을 수 있는 자리에 있어야 한다
      if (solidAt(o.x, o.y)) problems.push(`${key}: ${o.type}(${pos})이 막힌 타일('${at(o.x, o.y)}') 위`);
      if (o.type === 'exit' && !MAPS[o.to] && o.to !== 'base') problems.push(`${key}: exit 대상 '${o.to}'이 없음`);
    }

    // 기획서 §13 챕터 표준 템플릿 — 배치량이 규격을 벗어나면 알려준다
    const count = (t) => map.objects.filter((o) => o.type === t).length;
    const range = (t, lo, hi) => {
      const n = count(t);
      if (n < lo || n > hi) problems.push(`${key}: ${t} ${n}개 (규격 ${lo}~${hi})`);
    };
    range('symbol', 5, 7);
    range('gather', 8, 10);
    range('chest', 4, 5);
    range('npc', 2, 3);
    const hiddenChests = map.objects.filter((o) => o.type === 'chest' && o.hidden).length;
    if (hiddenChests < 1 || hiddenChests > 2) problems.push(`${key}: 숨김 상자 ${hiddenChests}개 (규격 1~2)`);

    // 위험 구간 검사 — 심볼은 반드시 구간 안에 있어야 하고, 통로는 구간 밖이어야 한다.
    // 이게 깨지면 "안전한 길"이라는 설계가 조용히 무너진다.
    const zones = map.dangerZones ?? [];
    const inZone = (x, y) => zones.some((z) => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h);
    if (!zones.length) problems.push(`${key}: dangerZones가 없다 (심볼이 아무 데서나 나온다)`);
    for (const z of zones) {
      if (z.x < 1 || z.y < 1 || z.x + z.w > MAP_W - 1 || z.y + z.h > MAP_H - 1) {
        problems.push(`${key}: 구간 '${z.name}'이 맵 밖으로 나감`);
      }
    }
    for (const o of map.objects) {
      if (o.type === 'symbol' && !inZone(o.x, o.y)) problems.push(`${key}: 심볼(${o.x},${o.y})이 위험 구간 밖`);
      // 출구·제단·NPC는 안전해야 한다 — 말 걸다가 전투가 걸리면 곤란하다
      if ((o.type === 'exit' || o.type === 'altar' || o.type === 'npc') && inZone(o.x, o.y)) {
        problems.push(`${key}: ${o.type}(${o.x},${o.y})이 위험 구간 안`);
      }
    }
    // 길·다리는 통째로 안전해야 한다 (요새↔다음 맵을 싸우지 않고 지날 수 있어야 한다)
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const id = TILES[map.rows[y][x]]?.id;
        if ((id === 'road' || id === 'bridge') && inZone(x, y)) {
          problems.push(`${key}: 통로 타일(${x},${y})이 위험 구간 안`);
        }
      }
    }

    // ★ 도달성 검사 — 지형을 손으로 쓰면 "갈 수 없는 곳에 상자를 둔" 사고가 난다.
    //   눈으로는 절대 안 보이므로 너비 우선 탐색으로 확인한다.
    const flood = (treatHiddenAsWall) => {
      const seen = new Set();
      const q = [[map.spawn.x, map.spawn.y]];
      seen.add(`${map.spawn.x},${map.spawn.y}`);
      while (q.length) {
        const [x, y] = q.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue;
          const k = `${nx},${ny}`;
          if (seen.has(k)) continue;
          const t = TILES[at(nx, ny)];
          if (!t || t.solid) continue;
          if (treatHiddenAsWall && t.disguise) continue;
          seen.add(k);
          q.push([nx, ny]);
        }
      }
      return seen;
    };
    const openAll = flood(false);      // 숨김길을 통과할 수 있을 때
    const openVisible = flood(true);   // 숨김길을 벽으로 볼 때

    for (const o of map.objects) {
      const k = `${o.x},${o.y}`;
      if (!openAll.has(k)) { problems.push(`${key}: ${o.type}(${k})에 걸어서 갈 수 없다`); continue; }
      // 숨김 상자는 "숨김길을 지나야만" 닿아야 의미가 있다.
      // 그냥 걸어가서 주울 수 있으면 숨긴 게 아니다.
      if (o.hidden && openVisible.has(k)) problems.push(`${key}: 숨김 상자(${k})가 숨김길 없이도 닿는다`);
      if (!o.hidden && !openVisible.has(k)) problems.push(`${key}: ${o.type}(${k})이 숨김길 뒤에 갇혔다 (hidden 표시 필요)`);
    }
  }
  return problems;
}
