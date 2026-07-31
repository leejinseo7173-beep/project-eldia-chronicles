// ============================================================
// characters.js — 아군 캐릭터 정의 (절대 규칙 3: 데이터 주도)
// 스탯은 balance.js(classStats/heroStats/보정), 스킬 수치는 balance.js(skills).
// spriteCfg 색상은 공용 팔레트 32색 키 문자열 (렌더에서 PALETTE[키]로 해석).
// ============================================================

// 주인공: 직업 선택에 따라 키트가 결정된다 (M6 새 게임 흐름에서 선택)
export const HERO_KITS = {
  sword: {
    skills: { basic: 'hero_s_basic', actives: ['hero_s_a1', 'hero_s_a2'], sacred: 'hero_s_sacred' },
    passive: 'hero_s_p',
    spriteCfg: { skin: 'peach', hair: 'tan', armor: 'blue', armorDark: 'navy3', cloth: 'navy2', weapon: 'sword' },
  },
  mage: {
    skills: { basic: 'hero_m_basic', actives: ['hero_m_a1', 'hero_m_a2'], sacred: 'hero_m_sacred' },
    passive: 'hero_m_p',
    spriteCfg: { skin: 'peach', hair: 'tan', armor: 'navy3', armorDark: 'navy2', cloth: 'navy1', weapon: 'staff' },
  },
  archer: {
    skills: { basic: 'hero_a_basic', actives: ['hero_a_a1', 'hero_a_a2'], sacred: 'hero_a_sacred' },
    passive: 'hero_a_p',
    spriteCfg: { skin: 'peach', hair: 'tan', armor: 'greenDark', armorDark: 'forest', cloth: 'brownDark', weapon: 'bow' },
  },
};

export const CHARACTERS = {
  hero: { id: 'hero', name: '아렌', isHero: true, heroClass: 'sword', element: 'none', grade: 0 },

  c01: {
    id: 'c01', name: '브란', classKey: 'knight', element: 'fire', grade: 3,
    skills: { basic: 'c01_basic', actives: ['c01_a1', 'c01_a2'] }, passive: 'c01_p',
    spriteCfg: { skin: 'peach', hair: 'gray3', armor: 'red', armorDark: 'redDark', cloth: 'gray1', weapon: 'lance', shield: true },
  },
  c02: {
    id: 'c02', name: '카시안', classKey: 'mage', element: 'water', grade: 3,
    skills: { basic: 'c02_basic', actives: ['c02_a1', 'c02_a2'] }, passive: 'c02_p',
    spriteCfg: { skin: 'peach', hair: 'gray4', armor: 'navy3', armorDark: 'navy2', cloth: 'navy1', weapon: 'staff' },
  },
  c03: {
    id: 'c03', name: '세라핀', classKey: 'cleric', element: 'light', grade: 3,
    skills: { basic: 'c03_basic', actives: ['c03_a1', 'c03_a2'] }, passive: 'c03_p',
    spriteCfg: { skin: 'peach', hair: 'gold', armor: 'white', armorDark: 'goldDark', cloth: 'gray4', weapon: 'staff' },
  },
  c04: {
    id: 'c04', name: '녹스', classKey: 'thief', element: 'dark', grade: 3,
    skills: { basic: 'c04_basic', actives: ['c04_a1', 'c04_a2'] }, passive: 'c04_p',
    spriteCfg: { skin: 'peach', hair: 'purple', armor: 'purpleDark', armorDark: 'ink', cloth: 'gray1', weapon: 'dagger' },
  },
  c05: {
    id: 'c05', name: '에라', classKey: 'mage', element: 'fire', grade: 2,
    skills: { basic: 'c05_basic', actives: ['c05_a1', 'c05_a2'] }, passive: 'c05_p',
    spriteCfg: { skin: 'peach', hair: 'red', armor: 'orange', armorDark: 'redDark', cloth: 'brownDark', weapon: 'staff' },
  },
  c06: {
    id: 'c06', name: '리안', classKey: 'warrior', element: 'wind', grade: 2,
    skills: { basic: 'c06_basic', actives: ['c06_a1', 'c06_a2'] }, passive: 'c06_p',
    spriteCfg: { skin: 'peach', hair: 'tan', armor: 'green', armorDark: 'greenDark', cloth: 'brownDark', weapon: 'sword' },
  },
  c07: {
    id: 'c07', name: '실피', classKey: 'thief', element: 'wind', grade: 2,
    skills: { basic: 'c07_basic', actives: ['c07_a1', 'c07_a2'] }, passive: 'c07_p',
    spriteCfg: { skin: 'peach', hair: 'green', armor: 'teal', armorDark: 'greenDark', cloth: 'gray1', weapon: 'dagger' },
  },
  c08: {
    id: 'c08', name: '미엘', classKey: 'cleric', element: 'water', grade: 2,
    skills: { basic: 'c08_basic', actives: ['c08_a1', 'c08_a2'] }, passive: 'c08_p',
    spriteCfg: { skin: 'peach', hair: 'brown', armor: 'skyBlue', armorDark: 'blue', cloth: 'gray4', weapon: 'staff' },
  },
  c09: {
    id: 'c09', name: '도르간', classKey: 'knight', element: 'earth', grade: 2,
    skills: { basic: 'c09_basic', actives: ['c09_a1', 'c09_a2'] }, passive: 'c09_p',
    spriteCfg: { skin: 'peach', hair: 'orange', armor: 'brown', armorDark: 'brownDark', cloth: 'gray1', weapon: 'lance', shield: true },
  },
  c10: {
    id: 'c10', name: '루멘', classKey: 'archer', element: 'light', grade: 2,
    skills: { basic: 'c10_basic', actives: ['c10_a1', 'c10_a2'] }, passive: 'c10_p',
    spriteCfg: { skin: 'peach', hair: 'gray4', armor: 'yellow', armorDark: 'goldDark', cloth: 'gray3', weapon: 'bow' },
  },
  c11: {
    id: 'c11', name: '로크', classKey: 'warrior', element: 'fire', grade: 1,
    skills: { basic: 'c11_basic', actives: ['c11_a1', 'c11_a2'] }, passive: 'c11_p',
    spriteCfg: { skin: 'peach', hair: 'brownDark', armor: 'redDark', armorDark: 'brownDark', cloth: 'gray1', weapon: 'axe' },
  },
  c12: {
    id: 'c12', name: '나딘', classKey: 'archer', element: 'water', grade: 1,
    skills: { basic: 'c12_basic', actives: ['c12_a1', 'c12_a2'] }, passive: 'c12_p',
    spriteCfg: { skin: 'peach', hair: 'brown', armor: 'blue', armorDark: 'navy3', cloth: 'brownDark', weapon: 'bow' },
  },
  c13: {
    id: 'c13', name: '팔크', classKey: 'archer', element: 'wind', grade: 1,
    skills: { basic: 'c13_basic', actives: ['c13_a1', 'c13_a2'] }, passive: 'c13_p',
    spriteCfg: { skin: 'peach', hair: 'tan', armor: 'greenDark', armorDark: 'forest', cloth: 'brown', weapon: 'bow' },
  },
  c14: {
    id: 'c14', name: '우르사', classKey: 'warrior', element: 'earth', grade: 1,
    skills: { basic: 'c14_basic', actives: ['c14_a1', 'c14_a2'] }, passive: 'c14_p',
    spriteCfg: { skin: 'peach', hair: 'brownDark', armor: 'tan', armorDark: 'brown', cloth: 'brownDark', weapon: 'axe' },
  },
  c15: {
    id: 'c15', name: '테오', classKey: 'cleric', element: 'earth', grade: 1,
    skills: { basic: 'c15_basic', actives: ['c15_a1', 'c15_a2'] }, passive: 'c15_p',
    spriteCfg: { skin: 'peach', hair: 'white', armor: 'gray3', armorDark: 'gray1', cloth: 'brownDark', weapon: 'staff' },
  },
};
