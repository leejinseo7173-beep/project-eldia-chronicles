// ============================================================
// stages.js — 전투 스테이지 배치 데이터 (절대 규칙 3: 데이터 주도)
// victory: { type: 'annihilation' } | { type: 'boss' } | { type: 'survive', turns: N }
//   - boss: enemies에서 boss: true인 유닛 처치 시 승리
//   - survive: N턴 종료까지 아군 생존 시 승리
// starTurns: ★3 조건(N턴 이내 클리어). 별점 = 클리어 / 전투불능 없음 / N턴 이내.
// allies는 M5 파티 편성 전까지의 프리셋 (치트 콘솔에서 무작위 파티로 교체 가능).
// ============================================================

export const TEST_STAGE_ID = 'test_2v2';

export const STAGES = {
  test_2v2: {
    id: 'test_2v2', name: '새벽별 요새 모의전', level: 3,
    victory: { type: 'annihilation' }, starTurns: 3,
    allies: [
      { characterId: 'hero', slot: 0 },
      { characterId: 'c01', slot: 1 },
    ],
    enemies: [
      // 첫 전투는 한 수 아래로 — 시뮬 3턴·아군 최저 HP 70% (소규모 조우 목표)
      { enemyId: 'skeleton_soldier', slot: 0, level: 2 },
      { enemyId: 'skeleton_soldier', slot: 1, level: 2 },
    ],
  },
  undead_squad: {
    // starTurns는 시뮬 평균 턴에 맞춰 잡는다 — 평균보다 후하면 ★3이 자동으로 붙어
    // 별점이 보상 조건으로서 의미를 잃는다 (측정: 평균 3턴).
    id: 'undead_squad', name: '마왕군 선발대 (4vs5)', level: 3,
    victory: { type: 'annihilation' }, starTurns: 3,
    allies: [
      { characterId: 'hero', slot: 0 },
      { characterId: 'c01', slot: 1 },
      { characterId: 'c02', slot: 2 },
      { characterId: 'c03', slot: 3 },
    ],
    enemies: [
      { enemyId: 'wraith_knight', slot: 0 },
      { enemyId: 'skeleton_soldier', slot: 1 },
      { enemyId: 'shadow_stalker', slot: 2 },
      { enemyId: 'skeleton_archer', slot: 3 },
      { enemyId: 'dark_shaman', slot: 4 },
    ],
  },
  wraith_commander: {
    id: 'wraith_commander', name: '망령 기사장 토벌 (보스만 처치)', level: 3,
    victory: { type: 'boss' }, starTurns: 6,   // 측정: 평균 6.6턴 — 평균보다 한 턴 빠듯하게
    allies: [
      { characterId: 'hero', slot: 0 },
      { characterId: 'c04', slot: 1 },
      { characterId: 'c05', slot: 2 },
      { characterId: 'c08', slot: 3 },
    ],
    enemies: [
      // 보스는 레벨이 아니라 **역할 배수**로 만든다 (balance.js enemyRole).
      // 레벨을 올리면 공격력까지 같이 올라 아군이 즉사한다.
      { enemyId: 'wraith_knight', slot: 0, boss: true, role: 'boss' },
      // 호위는 2기. 3기로 늘리면 잡몹 정리에 턴을 다 쓰다 전투불능이 1명씩 나온다.
      // 주술사를 남긴 건 "힐 우선 제거" 학습을 보스전에서도 이어가기 위함.
      { enemyId: 'skeleton_soldier', slot: 1 },
      { enemyId: 'dark_shaman', slot: 2 },
    ],
  },
  // ----- 필드 심볼 인카운터 (M4) -----
  // 필드에 서 있는 심볼의 겉모습은 **이 스테이지의 첫 적**에서 뽑는다.
  // 보이는 적과 싸우는 적이 어긋나면 심볼 인카운터의 의미가 없다.
  // allies는 프리셋(시뮬용). 실제 플레이는 필드가 game.state.partyIds를 넘긴다.
  field_scout: {
    // kind를 명시하는 이유: 필드 심볼 전투는 탐험 중 부딪히는 잡몹이라 짧아야 정상인데,
    // 시뮬레이터가 적 수만 보고 스토리 전투 기준(3~4턴)으로 재면 영영 불합격이 된다.
    id: 'field_scout', name: '해골 정찰조', level: 2, kind: 'skirmish',
    victory: { type: 'annihilation' }, starTurns: 3,
    // allies 프리셋은 시뮬 전용이지만 **실제 플레이와 같은 4인**이어야 의미가 있다
    allies: [
      { characterId: 'hero', slot: 0 },
      { characterId: 'c01', slot: 1 },
      { characterId: 'c02', slot: 2 },
      { characterId: 'c03', slot: 3 },
    ],
    enemies: [
      { enemyId: 'skeleton_soldier', slot: 0, level: 2 },
      { enemyId: 'skeleton_soldier', slot: 1, level: 2 },
    ],
  },
  field_hunters: {
    id: 'field_hunters', name: '해골 사냥조', level: 3, kind: 'skirmish',
    victory: { type: 'annihilation' }, starTurns: 4,
    allies: [
      { characterId: 'hero', slot: 0 },
      { characterId: 'c01', slot: 1 },
      { characterId: 'c02', slot: 2 },
      { characterId: 'c03', slot: 3 },
    ],
    enemies: [
      { enemyId: 'skeleton_archer', slot: 0, level: 2 },
      { enemyId: 'skeleton_soldier', slot: 1, level: 2 },
      { enemyId: 'skeleton_soldier', slot: 2, level: 2 },
    ],
  },
  field_ambush: {
    id: 'field_ambush', name: '그림자 매복조', level: 3, kind: 'skirmish',
    victory: { type: 'annihilation' }, starTurns: 4,
    allies: [
      { characterId: 'hero', slot: 0 },
      { characterId: 'c01', slot: 1 },
      { characterId: 'c02', slot: 2 },
      { characterId: 'c03', slot: 3 },
    ],
    enemies: [
      { enemyId: 'shadow_stalker', slot: 0, level: 2 },
      { enemyId: 'dark_shaman', slot: 1, level: 2 },
      { enemyId: 'skeleton_soldier', slot: 2, level: 2 },
    ],
  },

  survive_ambush: {
    id: 'survive_ambush', name: '기습 방어전 (5턴 버티기)', level: 3,
    victory: { type: 'survive', turns: 5 }, starTurns: 5,
    allies: [
      { characterId: 'hero', slot: 0 },
      { characterId: 'c09', slot: 1 },
      { characterId: 'c15', slot: 2 },
      { characterId: 'c13', slot: 3 },
    ],
    enemies: [
      // 버티기는 '이길 수 없는 적'이 아니라 '정리하기엔 벅찬 수'로 만든다.
      // 예전 구성(6기 Lv7~8)은 아군이 3~4턴에 전멸해 5턴을 볼 수조차 없었다.
      // 4기 Lv2 = 시뮬 5.7턴·전투불능 2명·아군 최저 HP 41% (전멸 위기 1~2회 목표)
      { enemyId: 'skeleton_soldier', slot: 0, level: 2 },
      { enemyId: 'skeleton_soldier', slot: 1, level: 2 },
      { enemyId: 'skeleton_archer', slot: 2, level: 2 },
      { enemyId: 'skeleton_archer', slot: 3, level: 2 },
    ],
  },
};
