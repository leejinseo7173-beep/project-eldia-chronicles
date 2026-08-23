// ============================================================
// enemies.js — 적 정의 (절대 규칙 3: 데이터 주도)
// 스탯은 balance.js(enemyStats), 스킬 수치는 balance.js(skills).
// M3: 공통 마왕군 5종 = AI 5성향 교보재 (기획서 §8).
// 지역 몹·정예·보스는 M4~M7에서 확장.
// ============================================================

export const ENEMIES = {
  skeleton_soldier: {
    id: 'skeleton_soldier', name: '해골 병사', element: 'dark',
    ai: 'rush',              // 돌격형
    assetKey: 'skeleton_soldier',   // 자체 작화 13장 (2026-08-22, 적 1호)
    skills: { basic: 'e_slash', actives: [] },
    spriteCfg: { skin: 'white', hair: 'white', armor: 'white', armorDark: 'gray2', cloth: 'gray3', weapon: 'bone', skeleton: true },
  },
  skeleton_archer: {
    id: 'skeleton_archer', name: '해골 궁수', element: 'dark',
    ai: 'sniper',            // 사수형
    assetKey: 'skeleton_archer',    // 자체 작화 (2026-08-22, 적 2호)
    skills: { basic: 'e_shot', actives: ['e_power_shot'] },
    spriteCfg: { skin: 'white', hair: 'white', armor: 'gray4', armorDark: 'gray2', cloth: 'gray1', weapon: 'bow', skeleton: true },
  },
  dark_shaman: {
    id: 'dark_shaman', name: '암흑 주술사', element: 'dark',
    ai: 'support',           // 지원형
    assetKey: 'dark_shaman',        // 자체 작화 (2026-08-23, 적 3호)
    skills: { basic: 'e_dark_bolt', actives: ['e_dark_heal', 'e_dark_bless'] },
    spriteCfg: { skin: 'gray4', hair: 'purple', armor: 'purpleDark', armorDark: 'ink', cloth: 'purple', weapon: 'staff' },
  },
  shadow_stalker: {
    id: 'shadow_stalker', name: '그림자 살수', element: 'dark',
    ai: 'cunning',           // 교활형 — 유리몸 사냥 학습용
    assetKey: 'shadow_stalker',     // 자체 작화 (2026-08-23, 적 4호)
    skills: { basic: 'e_slash', actives: ['e_backstab'] },
    spriteCfg: { skin: 'gray2', hair: 'ink', armor: 'ink', armorDark: 'black', cloth: 'gray1', weapon: 'dagger' },
  },
  wraith_knight: {
    id: 'wraith_knight', name: '망령 기사', element: 'dark',
    ai: 'guard',             // 수호형 — 물리 벽, 마법 공략 학습용
    assetKey: 'wraith_knight',      // 자체 작화 (2026-08-23, 적 5호 — 마왕군 전원 완성)
    skills: { basic: 'e_slash', actives: ['e_taunt_howl'] },
    spriteCfg: { skin: 'gray4', hair: 'gray2', armor: 'gray2', armorDark: 'gray1', cloth: 'ink', weapon: 'lance', shield: true, skeleton: true },
  },
};
