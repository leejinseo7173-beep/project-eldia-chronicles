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
  // 반격 A안(작업계획.md 2부 §3-2): 위력을 낮추고 **치명을 양쪽 다 없애** 좌우 대칭으로.
  // 예전엔 아군 반격만 치명이 터져서 "가만히 있어도 적이 녹는" 비대칭이 있었다.
  counter: { power: 0.5, canCrit: false },   // 일반공격 피격 후 생존 시. 스킬·협공 피격은 반격 불가
  assist: {
    power: 0.5,              // 연계 협공: 일반공격의 50% + 속도 비례 보정. 반격·치명 없음
    speedBonusPerPoint: 0.005, // 속도 1당 +0.5%p (속도 10 = 55%)
    // 표식 배수는 status.mark.assistMult가 **단일 출처**다 (2026-08-05 감사).
    // 여기 복제해 두면 죽은 손잡이가 된다 — 튜너가 이걸 바꿔도 시뮬이 안 변한다.
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
    mage:    { hp: [24, 3.2], atk: [3, 0.4], mag: [11, 1.6], def: [3, 0.5], spd: [5, 0.7] },  // 기본 +1 — 측정 구간(Lv2~3)에선 성장 소수점이 반올림에 씹힌다 (재역산 2차)
    cleric:  { hp: [31, 4.1], atk: [4, 0.6], mag: [8, 1.3], def: [5, 0.7], spd: [5, 0.7] },  // +3: 사수·교활의 유리몸 사냥에 2턴을 버티도록 (재역산)
    thief:   { hp: [33, 4.2], atk: [8, 1.3], mag: [3, 0.4], def: [3, 0.5], spd: [10, 1.4] },  // +8 누적: 무탱 보스전 최후의 칼끝 (재역산 2차)
  },
  heroStats: {
    sword:  { hp: [34, 4.8], atk: [9, 1.4], mag: [4, 0.5], def: [7, 1.0], spd: [7, 0.9] },
    mage:   { hp: [27, 3.6], atk: [4, 0.5], mag: [11, 2.0], def: [4, 0.6], spd: [6, 0.8] },
    archer: { hp: [28, 3.7], atk: [10, 1.55], mag: [3, 0.4], def: [5, 0.7], spd: [8, 1.1] },  // 기본 10 — 측정 구간(Lv2~3)은 성장보다 기본치가 곡선을 만든다 (재역산 2차)
  },

  // ===== 보정 계수 (곱연산, 기획서 §7) =====
  gradeMult: { 1: 1.00, 2: 1.05, 3: 1.10 },        // ★등급
  limitBreak: { perStep: 0.03, maxSteps: 5 },       // 한계돌파 +3%/회
  awaken: { perStep: 0.02, maxSteps: 3 },           // 각성 +2%/단계

  // ===== 적 스탯 (기획서 §8 — TTK 앵커에서 역산. [Lv1 기준, 레벨당 성장]) =====
  // 일반몹 앵커: 동레벨 딜러 2행동(스킬1+일반1) 처치. 아군 생존 = 주인공 기준 4~6대.
  // 해골 병사: 일반공격 정확히 2회 — 나눠 치면 연계 협공이 마무리 (집중 공격 학습)
  // 망령 기사: 고방어(물리 벽) — 마법·스킬 공략 학습. 암흑 주술사: 힐 우선 제거 학습.
  // HP는 앵커에서 역산한 뒤 다수전 보정을 곱했다 (작업계획.md 2부 §3-1):
  //   ① 앵커 HP = (딜러 스킬150% 피해 + 딜러 일반 피해) × 1.15
  //      딜러 기준 = 주인공 검사(물리)와 마법사 직업(마법)의 평균, 버프 미적용
  //      1.15는 버프·협공 여지를 남겨 1방컷을 막는 보정
  //   ② × 1.68 (다수전 보정) — 앵커는 1:1 기준이라 그대로 두면 4인 파티가
  //      광역기·협공으로 5기를 2턴에 쓸어버린다. 목표(§5 일반 전투 3~4턴)에 맞춘 값.
  // 방어가 이미 피해를 깎으므로 고방어 적은 HP가 낮게 나온다 — 이중 계산을 걷어낸 것이다.
  // 망령 기사는 타격 횟수로는 여전히 가장 단단하다(피격당 피해가 절반 수준).
  enemyStats: {
    skeleton_soldier: { hp: [34, 5.4], atk: [14, 1.5], mag: [2, 0.3], def: [3, 0.5], spd: [5, 0.7] },
    skeleton_archer:  { hp: [39, 5.7], atk: [15, 1.6], mag: [2, 0.3], def: [2, 0.4], spd: [7, 0.9] },
    // 주술사 mag 12→7 (2026-08-22 재역산): mag는 마법 '방어'를 겸하는데(logic 315행)
    // 12면 마법사 파티가 못 뚫는 벽이 된다. 지원몹의 위협은 힐·축복이지 딜이 아니다.
    dark_shaman:      { hp: [39, 5.7], atk: [3, 0.4], mag: [7, 0.9], def: [2, 0.4], spd: [5, 0.7] },
    shadow_stalker:   { hp: [39, 5.7], atk: [16, 1.7], mag: [2, 0.3], def: [2, 0.4], spd: [11, 1.2] },
    wraith_knight:    { hp: [23, 3.7], atk: [12, 1.3], mag: [5, 0.6], def: [6, 0.9], spd: [3, 0.4] },
  },

  // 역할별 배수 (작업계획.md 2부 §3-1). 스테이지가 role로 지정한다.
  //   일반몹 = 딜러 2행동 / 정예 = 파티 협력 4~6행동 / 보스 = 총력전 6~8턴
  // hp와 atk를 **따로** 두는 이유: 레벨 오버라이드로 보스를 만들면 공·방·속이 한꺼번에
  // 올라 아군이 즉사한다. 그래서 턴 수는 hp로, 위압감은 atk로 따로 맞춘다.
  // 보스 hp 11 / atk 1.05 = 시뮬 6.56턴·아군 최저 HP 24% (목표 6~8턴·20~40%).
  // atk는 민감하다 — 1.1만 돼도 최저 HP가 17%로 떨어져 목표 아래로 뚫린다.
  // elite는 아직 검증 전이다 (정예 변종은 작업계획 2부 §5에서 만든다).
  enemyRole: {
    normal: { hp: 1.0, atk: 1.0 },
    elite:  { hp: 2.8, atk: 1.05 },
    boss:   { hp: 11.0, atk: 1.0 },   // 1.05→1.0 (2026-08-22): 무탱 파티 칼끝 생존 5~13%를 20% 선으로
  },

  // ===== 성물 필살기 — 여명 게이지 (docs/성물_필살기_기획.md, 사용자 승인 2026-08-22) =====
  // 전투 시작 0, 이월 없음. 만충 시에만 성물 스킬 사용 가능, 사용하면 0.
  // 체감 목표: 일반전 3~4턴에 1회, 보스전 2회. 턴 기반 충전이라 시드 시뮬 재현성 유지.
  sacred: {
    gaugeMax: 100,
    gaugeStart: 25,       // 시작 여명 — 짧은 전투(2v2·일반전)에도 1회는 닿는 리듬 (T3 전후)
    chargeAct: 25,        // 보유자 행동 (성물 사용 자체는 충전 안 됨)
    chargeHit: 15,        // 보유자 피격 (스킬 타격·협공·반격 — 도트는 제외)
    chargeAllyDown: 40,   // 아군 전투불능 (분노)
    chargeAssist: 8,      // 보유자 협공 참여
  },

  // ===== 스킬 수치 (절대 규칙 2 — 계수·쿨·소모 등 밸런스 수치 전부. 정체성은 data/skills.js) =====
  // coef: 스킬계수(치유는 마력 배율) / cool: 쿨타임 / hits: 다단히트 수
  skills: {
    // 주인공 검사
    hero_s_basic: { coef: 1.0 },
    hero_s_a1: { coef: 1.5, cool: 2 },
    hero_s_a2: { cool: 4 },
    // 광역기 원칙: 전체기 계수 = 단일기 대비 60~65%, 2체기 = 80~85% (시뮬 튜닝 — DECISIONS.md)
    hero_s_sacred: { coef: 2.4 },          // 필살기 — 쿨 대신 여명 게이지 (전 성물 공통)
    // 주인공 마법사
    hero_m_basic: { coef: 1.15 },          // 마법사 정체성 = 순수 화력. 유리몸·저유틸 대가 (재역산)
    hero_m_a1: { coef: 1.4, cool: 2 },     // 2체기 원칙 예외 상향 — 단일 액티브 없는 순수화력 정체성 (재역산 2차)
    hero_m_a2: { cool: 3, cdr: 1 },
    hero_m_sacred: { coef: 2.4 },
    // 주인공 궁수
    hero_a_basic: { coef: 1.0 },
    hero_a_a1: { coef: 1.7, cool: 2 },     // 검사(1.5)보다 높게 — 유리몸·무유틸 대가가 화력 (재역산 2차)
    hero_a_a2: { coef: 0.85, cool: 3 },
    hero_a_sacred: { coef: 2.4 },
    // C01 브란
    c01_basic: { coef: 1.0 },
    c01_a1: { cool: 3, selfBuffTurns: 2 },  // 도발 2턴 (기본 1) — 커버율 33%→66%. 유리몸 보호가 기사 정체성 (재역산)
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
    c09_a1: { cool: 3, shieldRatio: 1.0, shieldStat: 'def' },   // 기사 보호막이 마력 스케일 = 죽은 손잡이 (재역산 2차)
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
    e_dark_heal: { coef: 1.1, cool: 3 },   // 1.5/쿨2는 단독 생존 시 자힐 11/턴 — 저딜 파티가 영원히 못 뚫는 스톨 (2026-08-22 재역산)
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
    c09_p: { startShieldRatio: 1.2, stat: 'def' },   // 굳건한 대지 — 방어 스케일 (기사 정체성)
    c10_p: { vsDark: 0.15 },                 // 파사의 빛
    c11_p: { atkBonusLowHp: 0.20, hpThreshold: 0.5 }, // 투지
    c12_p: { vsSlowed: 0.20 },               // 사냥꾼의 눈
    c13_p: { assistBonus: 0.30 },            // 콤비 사냥
    c14_p: { physCut: 0.10 },                // 바위 피부
    c15_p: { dmgCut: 0.10 },                 // 노련한 발걸음
    c03_special: { minHpFromCost: 1, autoSkipCostHpPct: 0.5 }, // 세라핀 특칙
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

  // ===== 필드 탐험 (기획서 §13 — M4) =====
  // 이동은 픽셀/초. 타일 32px 기준으로 초당 4.4타일 — 40×30 맵을 가로지르는 데 약 9초.
  // 더 느리면 답답하고, 더 빠르면 심볼을 피할 여유가 사라져 회피가 운이 된다.
  field: {
    moveSpeed: 140,             // px/초 (대각 이동은 정규화해 같은 속도)
    // ★걷기 애니메이션은 **시간이 아니라 이동 거리**로 넘긴다.
    //   시간 기준(초당 N프레임)으로 하면 발 딛는 리듬과 실제 이동 속도가 어긋나 미끄러져 보인다.
    //   프레임을 늘려도 이 어긋남은 안 없어진다 — 사용자가 "슬라이딩 같다"고 한 원인 중 하나.
    //   strideCyclePx = 한 사이클(두 걸음)에 실제로 나아가는 거리.
    //   인물 키가 58px이니 한 걸음 32px, 두 걸음 64px가 자연스럽다.
    // 64 → 96 (2026-08-22 "걷기 어색" 재진단): 64는 초당 4.4걸음(조깅 박자)이라
    // 6px 상하 물결이 진동처럼 떨리고, 원화 보폭(~50px)과 이동량(32px/걸음)이 어긋나
    // 발이 미끄러져 보였다. 96 = 초당 2.9걸음, 걸음당 48px — 원화 보폭과 일치.
    strideCyclePx: 96,
    interactRange: 40,          // 상호작용 가능 거리 (px, 중심 간)
    gatherRegenSec: 180,        // 채집 포인트 재생성 (기획서 "시간 리젠")
    symbolRegenSec: 420,        // 처치한 심볼 재출현. 90초는 한 맵을 둘러보는 동안 다시 나와
                                // "잡아도 줄지 않는다"는 느낌을 준다 (사용자 피드백 2026-08-03)
    // 심볼 인카운터 — 기획서 §13의 "적이 보임 / 회피 가능"이 실제로 성립해야 한다.
    // 초판은 사방 150px 감지 + 무한 추격이라 조금만 움직여도 전투가 걸렸다.
    // 셋을 바꿔 "보고 피하는 것"으로 되돌린다: ① 앞쪽만 본다 ② 추격을 포기한다 ③ 전투 직후엔 안 쫓는다
    symbol: {
      sightRange: 132,          // 이 안 + 시야각 안이면 추격 시작
      sightAngle: 150,          // 정면 기준 좌우 합계 각도. 등 뒤로 돌면 못 본다
      nearRange: 46,            // 각도와 무관하게 들키는 거리 (바로 옆은 보인다)
      loseRange: 210,           // 이보다 멀어지면 추격 포기
      chaseMaxSec: 4.5,         // 이 시간 넘게 못 잡으면 스스로 포기한다 (맵 끝까지 안 따라온다)
      chaseSpeed: 108,          // 플레이어(140)보다 느리다 — 달려서 뿌리칠 수 있다
      patrolSpeed: 38,
      patrolRadius: 56,         // 초기 위치 기준 배회 반경. 넓으면 길목까지 흘러나온다
      touchRange: 20,           // 접촉 판정 (전투 진입)
      // 전투에서 돌아온 직후엔 아무도 안 쫓는다. 없으면 복귀 지점에 다른 심볼이 붙어 있을 때
      // 전투가 연달아 터진다 — 사용자가 보고한 "조금 움직이면 전투"의 가장 큰 원인.
      graceSec: 3.0,
    },
    // 채집 산출 (재건 자원 — 재화 격리 원칙: 전투 재화와 분리, 기획서 §11)
    gatherYield: { min: 3, max: 5 },   // 2-4 → 3-5 (건설 재화 체감 상향, 2026-08-06)
    chestGold: { min: 40, max: 90 },
    // 숨김길: 밟으면 드러난다. 발견 상태는 세이브에 남는다
    hiddenRevealSec: 0.35,      // 드러나는 연출 길이
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

  // ===== 교감 (기획서 §12, M5-7) =====
  bond: {
    maxLevel: 5,
    statBonus: { 2: 0.03, 4: 0.07 },  // Lv2 +3%, Lv4 +7% (계단식)
    need: [20, 30, 45, 60],           // Lv1→2 … Lv4→5 필요 포인트
    talkPts: 6,                       // 대화 (1일 1회)
    talkCooldownH: 24,
    giftPts: { match: 20, normal: 8 },// 선물 (1일 1회) — 취향 적중 대폭 (기획서)
    giftCooldownH: 24,
    battleWinPts: 2,                  // 파티 전투 승리 시 참전 동료
    giftGold: 80,                     // 선물 가격 (상점, 6계열 공통)
  },

  // ===== 육성 (기획서 §7 성장 4축, M5-3) =====
  growth: {
    // 필요 EXP = 25 × Lv^1.5 (내림) — 기획서 명시 공식. Lv → Lv+1 비용
    xpCoef: 25,
    xpPow: 1.5,
    maxLevel: 60,
    // 레벨 상한 = base + 훈련소 Lv × perDojoLv (미건설 15 / Lv1 30 / Lv2 45 / Lv3 60)
    // 근거: 훈련소 desc "레벨 상한 확장" — 수치는 기획서에 없어 챕터 페이스에 맞춰 결정
    levelCap: { base: 15, perDojoLv: 15 },
    // 훈련소 골드 레벨업: 비용 = ceil(필요 EXP × goldPerXp)
    // 전투 경험치가 주 경로, 훈련소는 벤치 캐릭 따라잡기·마지막 한 렙 밀기용
    trainGoldPerXp: 0.4,
    // 전투 승리 경험치 = Σ(적 레벨) × xpPerEnemyLv — 참전 전원에게 전액 (JRPG 관례)
    xpPerEnemyLv: 8,
    // 한계돌파 1회 = 그 캐릭터 조각 1개 (중복 1회 = 조각 1 — 등급 무관)
    lbShardCost: 1,
    // 각성 1~3단계 비용(각성석) — 공급이 마력샘 저확률 + 정령의 시련(미구현)뿐이라 보수적으로
    awakenCost: [4, 8, 16],
  },

  // ===== 장비 (기획서 §10, M5-4 — 계열·이름은 data/equipment.js) =====
  equip: {
    // 무기 주스탯 공(마) 티어 1~6 (기획서 표) × 등급 계수
    weaponMain: [6, 9, 12, 15, 18, 21],
    gradeCoef: { 1: 1.00, 2: 1.15, 3: 1.30, 4: 1.50, 5: 1.80 },
    // 방어구 기준 HP·방 (중갑 100%) — 계열 배율은 armorKindMult
    armorHp: [20, 30, 40, 50, 60, 70],
    armorDef: [2, 3, 4, 5, 6, 7],
    armorKindMult: {
      heavy: { hp: 1.0, def: 1.0 },
      light: { hp: 0.85, def: 0.7 },
      robe:  { hp: 0.75, def: 0.5 },
    },
    // 계열 시그니처 (티어별 고정 부가 — 직업 정체성. 작업계획 M5-4 §7)
    sig: {
      lance:   { def: [1, 1, 2, 2, 3, 3] },
      bow:     { critPct: [2, 2, 2, 3, 3, 3] },
      rod:     { hp: [5, 8, 10, 13, 15, 18] },
      daggers: { spd: [1, 1, 2, 2, 3, 3] },
      light:   { spd: [1, 1, 2, 2, 3, 3] },
      robe:    { mag: [1, 2, 2, 3, 3, 4] },
    },
    // 장신구 주스탯 (티어별)
    acc: {
      ring:     { atk: [2, 3, 5, 6, 8, 9], mag: [2, 3, 5, 6, 8, 9] },
      necklace: { hp: [14, 21, 28, 35, 42, 49] },
      charm:    { spd: [2, 3, 4, 5, 6, 7] },
    },
    // 부옵션 — 등급별 개수(일반0·고급0·희귀1·영웅2·전설2) + 종류별 [min, max]
    subCount: { 1: 0, 2: 0, 3: 1, 4: 2, 5: 2 },
    subs: {
      atkPct: [5, 12], magPct: [5, 12], hpPct: [6, 15], defPct: [6, 15],
      spd: [2, 5], critPct: [3, 8],
    },
    // 대장간 제작 — 티어 상한 = 대장간 Lv(1→T2, 2→T4, 3→T6), 비용은 티어별
    craft: {
      tierBySmithLv: [2, 4, 6],
      gold: [60, 120, 240, 420, 700, 1100],
      iron: [4, 8, 14, 22, 34, 50],
      gradeWeights: [60, 30, 10],     // 일반/고급/희귀 — 전설은 정수 제작(M7) 한정
      smithLvRareShift: 3,            // 대장간 Lv당 일반 −3%p → 희귀 +3%p
    },
    // 심볼전(필드 전투) 승리 드랍 — 티어는 스테이지 레벨에서 환산
    drop: {
      equipChance: 0.12,
      gradeWeights: [70, 25, 5],
      stoneMin: 1, stoneMax: 3,       // 강화석
    },
  },

  // ===== 상점 (기획서 §10·§12, M5-5) =====
  shop: {
    // 장비 완제품: 하급 T1·중급 T2, 일반 등급 고정 — 확정 수급의 대가로 제작보다 비싸다
    equipTiers: [1, 2],
    equipPriceMult: 1.6,              // 가격 = 제작 골드 × 배율 (철광석 불요 대신)
    stoneGold: 30,                    // 강화석 1개
    stoneBundle: { count: 10, gold: 260 },
    // 조각 교환: 증표 → 보유 동료 조각 1개 (등급별) — 한돌 순수확률 보완 (DECISIONS 2026-08-15)
    // ★3 완돌 = 4×5 = 증표 20 (천장 30회보다 싸다 — 지정 구매의 정당한 지름길)
    shardBadge: { 1: 1, 2: 2, 3: 4 },
    // 판매가 = 제작 골드 × 등급 계수 × sellRate (내림)
    sellRate: 0.35,
  },

  // ===== 소모품 (기획서 §10, M5-6 — 정체성은 data/items.js) =====
  items: {
    healPct: { potion_s: 0.30, potion_m: 0.60, potion_l: 1.00 },   // 최대 HP 비율 회복
    revivePct: 0.5,                                                // 부활 시 HP
    buff: {
      atk_tonic: { ratio: 0.30, turns: 3 },   // 공격 강화 (atkUp)
      def_tonic: { ratio: 0.40, turns: 3 },   // 철벽 (ironwall)
    },
    prices: {
      potion_s: 40, potion_m: 90, potion_l: 200,
      feather: 300, cleanse: 60, atk_tonic: 80, def_tonic: 80,
    },
  },

  // ===== 오토 전투 (기획서 §6) =====
  auto: {
    healThreshold: 0.6,           // 힐은 아군 HP 60% 이하 시
    surviveGuardHpPct: 0.55,      // 버티기 생존 본능: HP 55% 이하면 공격 대신 웅크림 — 반격 피해라도 아껴 한 턴을 더 산다
    // 세라핀의 소모 스킬 금지선은 passives.c03_special.autoSkipCostHpPct가
    // **단일 출처**다 (2026-08-05 감사). 여기 복제하면 죽은 손잡이가 된다.
  },

  // ===== 전투 소모품 (기획서 §10) =====
  battleItems: {
    maxUsesPerBattle: 3,
  },

  // ===== 뽑기 — 소환 제단 (기획서 §9, M5-2) =====
  gacha: {
    costBadge: 1,              // 1회 = 증표 1
    rates: { 3: 0.08, 2: 0.30, 1: 0.62 },
    // 제단 Lv3: ★2+ 확률 소폭 증가 (기획서 §12 단계 효과)
    ratesAltarLv3: { 3: 0.10, 2: 0.34, 1: 0.56 },
    pityAt: 30,                // 30회 내 ★3 확정 — 획득 시 리셋
    tenPullAltarLv: 2,         // 10연은 제단 Lv2부터 (기획서)
    // 중복 → 그 캐릭터의 조각 (기획서 §9 개정 — 사용자 결정 2026-08-15)
    dupeShard: 1,                                 // 중복 1회 = 조각 1 = 한돌 1회
    // 조각이 남은 돌파 횟수를 이미 채웠으면(완돌 포함) 중복은 골드로 — 죽은 조각 방지
    dupeGoldByGrade: { 1: 150, 2: 400, 3: 1000 },
  },

  // ===== 거점 — 재건·방치 생산 (기획서 §12, M5-1) =====
  base: {
    initPop: 8,               // 시작 인구 (피난민 유입은 스토리 몫 — M6까지 치트)
    workerBonus: 0.25,        // 일꾼 1명당 생산 +25% (합연산)
    offlineCapMin: 480,       // 오프라인 정산 상한 8시간
    foodPerPopMin: 0.5,       // 인구 1명당 식량 소비 /분
    starvingMult: 0.5,        // 식량 0일 때 전 생산 효율
    taxPerPop: 10,            // 세금 = 인구 × 10골드
    taxCooldownH: 24,         // 하루 1회

    // 생산 시설 단계별 분당 생산 (마력샘만 시간당 — production.js가 60분마다 지급)
    prod: {
      lumber: [{ wood: 6 }, { wood: 12 }, { wood: 20 }],
      // 광산 Lv2는 기획서에 없어 보간 (Lv1 석4 → Lv3 석8+철4)
      mine: [{ stone: 4 }, { stone: 6, iron: 2 }, { stone: 8, iron: 4 }],
      farm: [{ food: 5 }, { food: 12 }, { food: 24 }],
      spring: [{ mana: 1 }, { mana: 2 }, { mana: 4 }],
    },
    // 마력샘: 마정석 지급 틱(1시간)마다 각성석이 나올 확률 (시드 RNG)
    springAwakenChance: [0.03, 0.05, 0.08],
    housePopCap: [10, 25, 50],

    // 창고 상한 — 성벽 Lv1~5 (골드는 무제한: 세금 상한이 인플레 방지 장치)
    storage: {
      wood:   [500, 1000, 2000, 4000, 8000],
      stone:  [500, 1000, 2000, 4000, 8000],
      food:   [500, 1000, 2000, 4000, 8000],
      iron:   [100, 200, 400, 800, 1600],
      mana:   [100, 200, 400, 800, 1600],
      awaken: [20, 40, 80, 160, 320],
    },

    // 새 게임 시작 물자 — 왕실이 요새 재건에 내준 밑천 (서사 정합).
    // 이게 없으면 첫 건물조차 채집 10분+ — "건설 자체가 힘들다" (사용자 확인 2026-08-06)
    startKit: { wood: 80, stone: 40, food: 60, gold: 100, badge: 5 },
    // 증표 5개: 뽑기 공급원(스토리·퀘스트)이 M6에서 들어오므로,
    // 그전에도 소환 제단을 체험할 수 있게 첫 물자에 얹는다

    // 증축 비용 — [Lv1 건설, Lv2, Lv3(, Lv4, Lv5)]
    // 산정 원칙 (2026-08-06 재산정 — "얻는 재화에 비해 건설이 힘들다"):
    //   Lv1 = 시작 물자 + 채집 몇 분이면 닿는다 (첫 성취는 빨라야 한다)
    //   Lv2 = 방치 10~20분 분량, Lv3 = 방치 1시간쯤
    //   ★해당 자원의 생산 시설이 해금되기 **전** 티어에는 그 자원을 조금만 요구한다
    //     (석재는 광산이 1장 후반 — 그전 티어가 석재를 많이 부르면 막힌다)
    //   성벽은 챕터 관문이라 예외적으로 크게 (기획서: 성벽 Lv = 챕터 진출 조건)
    cost: {
      lumber: [{ wood: 20, stone: 10 }, { wood: 100, stone: 30, gold: 60 }, { wood: 280, stone: 150, iron: 40, gold: 250 }],
      mine:   [{ wood: 50, stone: 10 }, { wood: 140, stone: 60, gold: 80 }, { wood: 320, stone: 180, iron: 50, gold: 280 }],
      farm:   [{ wood: 60, stone: 30 }, { wood: 150, stone: 80, gold: 80 }, { wood: 320, stone: 200, iron: 50, gold: 280 }],
      spring: [{ wood: 80, stone: 80, gold: 120 }, { wood: 200, stone: 200, gold: 350 }, { wood: 400, stone: 400, iron: 100, gold: 700 }],
      house:  [{ wood: 40, stone: 15 }, { wood: 140, stone: 80, gold: 100 }, { wood: 320, stone: 240, iron: 60, gold: 350 }],
      altar:  [{ wood: 50, stone: 25 }, { wood: 180, stone: 120, gold: 150 }, { wood: 420, stone: 320, iron: 90, gold: 450 }],
      tavern: [{ wood: 60, stone: 25 }, { wood: 180, stone: 110, gold: 150 }, { wood: 400, stone: 280, iron: 80, gold: 400 }],
      shop:   [{ wood: 60, stone: 25 }, { wood: 180, stone: 110, gold: 150 }, { wood: 400, stone: 280, iron: 80, gold: 400 }],
      smith:  [{ wood: 90, stone: 60 }, { wood: 220, stone: 160, gold: 200 }, { wood: 460, stone: 360, iron: 110, gold: 550 }],
      camp:   [{ wood: 80, stone: 50 }, { wood: 200, stone: 140, gold: 180 }, { wood: 440, stone: 320, iron: 90, gold: 450 }],
      dojo:   [{ wood: 90, stone: 60 }, { wood: 220, stone: 160, gold: 200 }, { wood: 460, stone: 340, iron: 100, gold: 500 }],
      temple: [{ wood: 110, stone: 90, gold: 80 }, { wood: 280, stone: 220, gold: 300 }, { wood: 560, stone: 460, iron: 130, gold: 700 }],
      // 성벽은 Lv1 시작 — [0]은 안 쓰인다. Lv2~5 = 2장~종장 관문
      wall:   [{}, { wood: 250, stone: 300, gold: 250 }, { wood: 650, stone: 800, iron: 180, gold: 650, mana: 30 },
               { wood: 1400, stone: 1700, iron: 450, gold: 1400, mana: 80 }, { wood: 2800, stone: 3400, iron: 1100, gold: 2800, mana: 200 }],
    },
  },
};
