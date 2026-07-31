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
      { enemyId: 'skeleton_soldier', slot: 0 },
      { enemyId: 'skeleton_soldier', slot: 1 },
    ],
  },
  undead_squad: {
    id: 'undead_squad', name: '마왕군 선발대 (4vs5)', level: 3,
    victory: { type: 'annihilation' }, starTurns: 6,
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
    victory: { type: 'boss' }, starTurns: 5,
    allies: [
      { characterId: 'hero', slot: 0 },
      { characterId: 'c04', slot: 1 },
      { characterId: 'c05', slot: 2 },
      { characterId: 'c08', slot: 3 },
    ],
    enemies: [
      // 보스 역할: 레벨 오버라이드로 정예급 TTK(파티 4~6행동) 역산 (DECISIONS.md)
      { enemyId: 'wraith_knight', slot: 0, boss: true, level: 8 },
      { enemyId: 'skeleton_soldier', slot: 1 },
      { enemyId: 'skeleton_soldier', slot: 2 },
      { enemyId: 'dark_shaman', slot: 3, level: 5 },
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
      // 버티기: 5턴 내 전멸이 불가능한 레벨로 — 생존 자체가 목표가 되게 (DECISIONS.md)
      { enemyId: 'skeleton_soldier', slot: 0, level: 7 },
      { enemyId: 'skeleton_soldier', slot: 1, level: 7 },
      { enemyId: 'skeleton_archer', slot: 2, level: 7 },
      { enemyId: 'skeleton_archer', slot: 3, level: 7 },
      { enemyId: 'shadow_stalker', slot: 4, level: 8 },
      { enemyId: 'dark_shaman', slot: 5, level: 8 },
    ],
  },
};
