// ============================================================
// balance.js — 모든 밸런스 수치의 유일한 조정 지점 (기획서 §14-6, §17)
// 다른 파일에 밸런스 매직 넘버 금지. 필요한 수치는 반드시 여기에 추가한다.
// 수치 출처: 기획서_엘디아연대기.md (A~D단계 확정분). 전부 초기값이며 시뮬로 조정한다.
// ============================================================

export const BALANCE = {

  // ===== 속성 상성 (기획서 §5) =====
  element: {
    advantage: 1.3,      // 유리
    disadvantage: 0.7,   // 불리
    neutral: 1.0,        // 그 외·동속성·무속성
    // 이기는 방향: 불→바람→땅→물→불, 빛↔어둠 상호 유리
    beats: { fire: 'wind', wind: 'earth', earth: 'water', water: 'fire', light: 'dark', dark: 'light' },
  },

  // ===== 치명타 (기획서 §6 — 저RNG: 회피/미스 없음) =====
  crit: {
    multiplier: 1.5,
    perSpeedDiff: 0.01,  // (내 속도 − 상대 속도) × 1%
    min: 0,
    max: 0.5,
    // 직업 기본 치명타율
    classBase: { warrior: 0.07, knight: 0.05, archer: 0.10, mage: 0.05, cleric: 0.05, thief: 0.15 },
    heroBase: { sword: 0.08, mage: 0.05, archer: 0.10 },
    enemyCanCrit: false, // 적→아군 치명타 없음
  },

  // ===== 반격·연계 협공 (기획서 §6) =====
  counter: { power: 0.7 },   // 일반공격 피격 후 생존 시. 스킬·협공 피격은 반격 불가
  assist: {
    power: 0.5,              // 연계 협공: 일반공격의 50% + 속도 비례 보정. 반격·치명 없음
    speedBonusPerPoint: 0.005, // 속도 1당 +0.5%p (속도 10 = 55%)
    markMult: 2.0,           // 표식 대상 협공 위력 2배 (M3)
  },

  // ===== 데미지 공식 (기획서 §6) =====
  damage: {
    minGuaranteeRatio: 0.1,  // 최소 보장 = 공격(마력)의 10%
    floor: 1,                // 최종 데미지 하한 (반올림으로 0이 되는 것 방지)
    // 계산 순서 고정: 계수→상성→방향→치명→방어차감→최소보장→정수 반올림
  },

  // ===== 직업 기준 스탯 (기획서 §7 — Lv1 기준값 + 레벨당 성장. 사이드뷰: 이동력·사거리 없음) =====
  classStats: {
    warrior: { hp: [32, 4.5], atk: [9, 1.5], mag: [3, 0.4], def: [6, 0.9], spd: [6, 0.8] },
    knight:  { hp: [40, 5.5], atk: [7, 1.1], mag: [4, 0.5], def: [9, 1.4], spd: [4, 0.5] },
    archer:  { hp: [26, 3.5], atk: [8, 1.4], mag: [3, 0.4], def: [4, 0.6], spd: [8, 1.1] },
    mage:    { hp: [24, 3.2], atk: [3, 0.4], mag: [10, 1.6], def: [3, 0.5], spd: [5, 0.7] },
    cleric:  { hp: [28, 3.8], atk: [4, 0.6], mag: [8, 1.3], def: [5, 0.7], spd: [5, 0.7] },
    thief:   { hp: [25, 3.4], atk: [8, 1.3], mag: [3, 0.4], def: [3, 0.5], spd: [10, 1.4] },
  },
  heroStats: {
    sword:  { hp: [34, 4.8], atk: [9, 1.4], mag: [4, 0.5], def: [7, 1.0], spd: [7, 0.9] },
    mage:   { hp: [27, 3.6], atk: [4, 0.5], mag: [10, 1.5], def: [4, 0.6], spd: [6, 0.8] },
    archer: { hp: [28, 3.7], atk: [8, 1.4], mag: [3, 0.4], def: [5, 0.7], spd: [8, 1.1] },
  },

  // ===== 보정 계수 (곱연산, 기획서 §7) =====
  gradeMult: { 1: 1.00, 2: 1.05, 3: 1.10 },        // ★등급
  limitBreak: { perStep: 0.03, maxSteps: 5 },       // 한계돌파 +3%/회
  awaken: { perStep: 0.02, maxSteps: 3 },           // 각성 +2%/단계

  // ===== 성장 (기획서 §7) =====
  growth: {
    maxLevel: 60,
    expBase: 25, expPower: 1.5,   // 필요 EXP = floor(25 × Lv^1.5)
  },

  // ===== 적 스탯 (기획서 §8 — TTK 앵커에서 역산. [Lv1 기준, 레벨당 성장]) =====
  // 일반몹 앵커: 동레벨 딜러 2행동(스킬1+일반1) 처치. 아군 생존 = 주인공 기준 4~6대.
  // 해골 병사: 일반공격 정확히 2회 — 나눠 치면 연계 협공이 마무리 (집중 공격 학습)
  // 망령 기사: 고방어(물리 벽) — 마법·스킬 공략 학습. 암흑 주술사: 힐 우선 제거 학습.
  enemyStats: {
    skeleton_soldier: { hp: [12, 2], atk: [14, 1.5], mag: [2, 0.3], def: [3, 0.5], spd: [5, 0.7] },
    skeleton_archer:  { hp: [10, 1.7], atk: [15, 1.6], mag: [2, 0.3], def: [2, 0.4], spd: [7, 0.9] },
    dark_shaman:      { hp: [9, 1.5], atk: [3, 0.4], mag: [12, 1.4], def: [2, 0.4], spd: [5, 0.7] },
    shadow_stalker:   { hp: [11, 1.8], atk: [16, 1.7], mag: [2, 0.3], def: [2, 0.4], spd: [11, 1.2] },
    wraith_knight:    { hp: [18, 3], atk: [12, 1.3], mag: [5, 0.6], def: [6, 0.9], spd: [3, 0.4] },
  },

  // ===== 스킬 수치 (절대 규칙 2 — 계수·쿨·소모 등 밸런스 수치 전부. 정체성은 data/skills.js) =====
  // coef: 스킬계수(치유는 마력 배율) / cool: 쿨타임 / hits: 다단히트 수
  skills: {
    // 주인공 검사
    hero_s_basic: { coef: 1.0 },
    hero_s_a1: { coef: 1.5, cool: 2 },
    hero_s_a2: { cool: 4 },
    // 광역기 원칙: 전체기 계수 = 단일기 대비 60~65%, 2체기 = 80~85% (시뮬 튜닝 — DECISIONS.md)
    hero_s_sacred: { coef: 1.1, cool: 3 },
    // 주인공 마법사
    hero_m_basic: { coef: 1.0 },
    hero_m_a1: { coef: 1.05, cool: 2 },
    hero_m_a2: { cool: 3, cdr: 1 },
    hero_m_sacred: { coef: 1.0, cool: 3 },
    // 주인공 궁수
    hero_a_basic: { coef: 1.0 },
    hero_a_a1: { coef: 1.4, cool: 2 },
    hero_a_a2: { coef: 0.85, cool: 3 },
    hero_a_sacred: { coef: 1.05, cool: 3 },
    // C01 브란
    c01_basic: { coef: 1.0 },
    c01_a1: { cool: 3 },
    c01_a2: { coef: 1.05, cool: 2 },
    // C02 카시안
    c02_basic: { coef: 1.0 },
    c02_a1: { coef: 1.1, cool: 2 },
    c02_a2: { coef: 1.15, cool: 4 },
    // C03 세라핀
    c03_basic: { coef: 1.0 },
    c03_a1: { coef: 2.0, cool: 2, selfHpCostPct: 0.10 },
    c03_a2: { coef: 1.2, cool: 4, selfHpCostPct: 0.15 },
    // C04 녹스
    c04_basic: { coef: 1.0 },
    c04_a1: { coef: 1.5, cool: 3 },
    c04_a2: { coef: 1.6, cool: 2, condCritHpPct: 0.5 },
    // C05 에라
    c05_basic: { coef: 1.0 },
    c05_a1: { coef: 0.95, cool: 3 },
    c05_a2: { coef: 1.8, cool: 2 },
    // C06 리안
    c06_basic: { coef: 1.0 },
    c06_a1: { coef: 0.85, cool: 2, hits: 2 },
    c06_a2: { coef: 0.9, cool: 3 },
    // C07 실피
    c07_basic: { coef: 1.0 },
    c07_a1: { coef: 1.3, cool: 2 },
    c07_a2: { cool: 3 },
    // C08 미엘
    c08_basic: { coef: 1.0 },
    c08_a1: { coef: 1.6, cool: 2 },
    c08_a2: { coef: 0.8, cool: 2 },
    // C09 도르간
    c09_basic: { coef: 1.0 },
    c09_a1: { cool: 3, shieldRatio: 1.0 },
    c09_a2: { coef: 1.3, cool: 2, debuffTurns: 1 },   // 공격 약화 1턴 (기획서 §4)
    // C10 루멘
    c10_basic: { coef: 1.0 },
    c10_a1: { coef: 1.6, cool: 2 },
    c10_a2: { coef: 1.2, cool: 3 },
    // C11 로크
    c11_basic: { coef: 1.0 },
    c11_a1: { coef: 1.8, cool: 2 },
    c11_a2: { coef: 2.3, cool: 3, selfDefDownRatio: 0.2, selfDefDownTurns: 1 },
    // C12 나딘
    c12_basic: { coef: 1.0 },
    c12_a1: { coef: 1.4, cool: 2 },
    c12_a2: { coef: 0.75, cool: 3 },
    // C13 팔크
    c13_basic: { coef: 1.0 },
    c13_a1: { coef: 1.1, cool: 2 },
    c13_a2: { coef: 0.7, cool: 3, hits: 3 },
    // C14 우르사
    c14_basic: { coef: 1.0 },
    c14_a1: { coef: 1.15, cool: 2 },
    c14_a2: { coef: 0.95, cool: 3 },
    // C15 테오
    c15_basic: { coef: 1.0 },
    c15_a1: { coef: 1.2, cool: 3 },
    c15_a2: { cool: 3, shieldRatio: 1.8 },
    // 적 스킬
    e_slash: { coef: 1.0 },
    e_shot: { coef: 1.0 },
    e_power_shot: { coef: 1.4, cool: 3 },
    e_dark_bolt: { coef: 1.0 },
    e_dark_heal: { coef: 1.5, cool: 2 },
    e_dark_bless: { cool: 3 },
    e_backstab: { coef: 1.6, cool: 3 },
    e_taunt_howl: { cool: 3 },
  },

  // ===== 패시브 수치 (정체성은 data/skills.js PASSIVES) =====
  passives: {
    hero_s_p: { teamAtkMagBonus: 0.10 },     // 이끄는 자
    hero_m_p: { onKillCdr: 1 },              // 마력 순환
    hero_a_p: { assistBonus: 0.25 },         // 선봉의 눈
    c01_p: { lowestAllyDmgCut: 0.15 },       // 수호의 불꽃
    c02_p: { vsDebuffedMagic: 0.15 },        // 현자의 통찰
    c03_p: {},                                // 기적 (전투당 1회 — 로직 처리)
    c04_p: {},                                // 그림자 걸음 (처치 시 은신)
    c05_p: { vsBurning: 0.20 },              // 불장난
    c06_p: { spdBonus: 0.20, turns: 3 },     // 바람걸음
    c07_p: { vsSlower: 0.20 },               // 기동 타격
    c08_p: { healBonusLowHp: 0.30, hpThreshold: 0.5 }, // 위기의 용기
    c09_p: { startShieldRatio: 1.2 },        // 굳건한 대지
    c10_p: { vsDark: 0.15 },                 // 파사의 빛
    c11_p: { atkBonusLowHp: 0.20, hpThreshold: 0.5 }, // 투지
    c12_p: { vsSlowed: 0.20 },               // 사냥꾼의 눈
    c13_p: { assistBonus: 0.30 },            // 콤비 사냥
    c14_p: { physCut: 0.10 },                // 바위 피부
    c15_p: { dmgCut: 0.10 },                 // 노련한 발걸음
    c03_special: { minHpFromCost: 1, autoSkipCostHpPct: 0.30 }, // 세라핀 특칙
  },

  // ===== 적 AI (기획서 §8 — 타겟 점수식·성향 가중치) =====
  ai: {
    score: { kill: 100, dmgWeight: 1, elemAdvantage: 15, lowHpRatio: 20 },
    hardFocusBonus: 30,        // 하드: 연계 대상 집중 공격 가중치
    aoeMinTargets: 2,          // 광역기는 2체 이상 생존 시
    healThreshold: 0.6,        // 힐은 아군 60% 이하 시
    // 성향별 가중치 조정 (점수식 항목 배수)
    personality: {
      rush:    { kill: 1.0, dmg: 1.0, elem: 1.0, lowHp: 1.5 },
      sniper:  { kill: 1.0, dmg: 2.0, elem: 1.0, lowHp: 0.5 },
      cunning: { kill: 1.5, dmg: 1.0, elem: 1.0, lowHp: 1.0, squishyBonus: 40 }, // 마법사·성직자 우선
      guard:   { kill: 1.0, dmg: 1.0, elem: 1.0, lowHp: 1.0 },
      support: { kill: 1.0, dmg: 1.0, elem: 1.0, lowHp: 1.0 },
    },
    // 적 행동 순서 (지원 → 사수 → 교활 → 수호 → 돌격)
    actOrder: ['support', 'sniper', 'cunning', 'guard', 'rush'],
  },

  // ===== TTK 앵커 (기획서 §7 — 적 스탯 역산·자동 시뮬 검증 기준) =====
  ttk: {
    normalMobActions: 2,          // 동레벨 일반 몹 = 딜러 2행동
    eliteActions: [4, 6],
    bossTurns: [5, 8],
    allySurviveHits: [4, 6],      // 기사 8+, 마법사 3
    knightSurviveHits: 8,
    mageSurviveHits: 3,
  },

  // ===== 뽑기 (기획서 §9) =====
  gacha: {
    rate3: 0.08, rate2: 0.30, rate1: 0.62,
    pity: 30,                     // 30회 내 ★3 확정, 획득 시 리셋
    limitBreakMax: 5,
  },

  // ===== 장비 강화 (기획서 §10) =====
  enhance: {
    maxLevel: 10,
    mainStatPerLevel: 0.04,                       // 1단계당 주스탯 +4%
    stoneCost: (level) => 2 * level * level,      // 강화석 2×(단계)²
    goldCost: (tier, level) => 50 * tier * level * level, // 골드 50×티어×(단계)²
  },

  // ===== 상태이상 지속·수치 (기획서 §6 — 사이드뷰 정의) =====
  status: {
    burn:   { turns: 2, dotRatio: 0.30 },   // 시전자 공·마 중 높은 쪽 30% 도트
    slow:   { turns: 2, ratio: -0.30 },     // 속도 −30%
    bind:   { turns: 1 },                   // 일반공격 외 행동 불가
    stun:   { turns: 1 },                   // 행동 불가
    atkDown:{ turns: 2, ratio: -0.30 },
    defDown:{ turns: 2, ratio: -0.30 },
    mark:   { turns: 2, assistMult: 2.0 },  // 표식 대상 협공 위력 2배
    taunt:  { turns: 1 },                   // 시전자에게 — 적 단일 공격을 강제
    atkUp:  { turns: 2, ratio: 0.30 },
    ironwall:{ turns: 2, ratio: 0.40 },
    shield: { turns: 3, ratio: 1.50 },      // 마력 150% 흡수막 (스킬별 오버라이드 가능)
    regen:  { turns: 2, ratio: 0.50 },      // 시전자 마력 50%/턴
    haste:  { turns: 2, ratio: 0.30 },      // 속도 +30%
    stealth:{ turns: 1 },                   // 단일 대상 지정 불가 (광역 피격 가능)
  },

  // ===== 난이도 (기획서 §8) =====
  difficulty: {
    hardEnemyStatMult: 1.15,      // 하드: 적 스탯 +15%
  },

  // ===== 경제·거점 (기획서 §12 — M5에서 사용) =====
  base: {
    offlineCapHours: 8,           // 오프라인 정산 최대
    workerBonus: 0.25,            // 일꾼 1명 = +25%
    foodPerPopMin: 0.5,           // 식량 소비 0.5/분/명
    foodShortagePenalty: 0.5,     // 부족 시 생산 −50%
    battleWinProductionMin: 30,   // 전투 승리 = 생산 30분치 즉시 지급
  },

  // ===== 교감 (기획서 §12) =====
  bond: {
    maxLevel: 5,
    statBonus: { 2: 0.03, 4: 0.07 },  // Lv2 +3%, Lv4 +7%
  },

  // ===== 오토 전투 (기획서 §6) =====
  auto: {
    healThreshold: 0.6,           // 힐은 아군 HP 60% 이하 시
    seraphinSelfHpGuard: 0.3,     // 세라핀: 자신 HP 30% 이하면 소모 스킬 금지
  },

  // ===== 전투 소모품 (기획서 §10) =====
  battleItems: {
    maxUsesPerBattle: 3,
  },
};
