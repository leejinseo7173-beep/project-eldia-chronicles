// ============================================================
// skills.js — 스킬·패시브 정의 (절대 규칙 3: 데이터 주도)
// 계수·쿨·소모 등 수치는 전부 balance.js의 skills/passives에 (절대 규칙 2).
// 여기는 정체성: 이름·대상 규격·효과 종류·연출 힌트만.
//
// target: enemy(적 단일) | enemies2(대상+HP최저 1체) | enemiesAll(적 전체)
//         | ally(아군 단일) | alliesAll(아군 전체) | self(자신)
// kind: basic(일반) | active(액티브) | sacred(성물)
// 효과 플래그: dmg / heal / shield / cleanse / cdr / magic(마법 데미지)
// melee: 시전 시 대상에게 가로 돌진 (false = 제자리 캐스팅)
// buffs/debuffs: 대상에게 거는 상태 / selfBuffs: 자신에게
// fx: { kind: slash|burst|ring|rain|sparkle|shieldFx|smoke, color: 팔레트 키 }
// ============================================================

export const SKILLS = {
  // ----- 주인공 검사 「선봉에서 이끄는 리더」 -----
  hero_s_basic: { id: 'hero_s_basic', name: '성검 베기', kind: 'basic', target: 'enemy', dmg: true, melee: true, fx: { kind: 'slash', color: 'gold' } },
  hero_s_a1: { id: 'hero_s_a1', name: '용사의 일섬', kind: 'active', target: 'enemy', dmg: true, melee: true, fx: { kind: 'slash', color: 'skyBlue' } },
  hero_s_a2: { id: 'hero_s_a2', name: '고무의 함성', kind: 'active', target: 'alliesAll', buffs: ['atkUp'], fx: { kind: 'ring', color: 'gold' } },
  hero_s_sacred: { id: 'hero_s_sacred', name: '성검 해방', kind: 'sacred', target: 'enemiesAll', dmg: true, fx: { kind: 'burst', color: 'gold' } },

  // ----- 주인공 마법사 「전장을 조율하는 현자」 -----
  hero_m_basic: { id: 'hero_m_basic', name: '마력탄', kind: 'basic', target: 'enemy', dmg: true, magic: true, fx: { kind: 'burst', color: 'purple' } },
  hero_m_a1: { id: 'hero_m_a1', name: '마력 방출', kind: 'active', target: 'enemies2', dmg: true, magic: true, fx: { kind: 'burst', color: 'purple' } },
  hero_m_a2: { id: 'hero_m_a2', name: '마력 공명', kind: 'active', target: 'ally', cdr: true, buffs: ['atkUp'], fx: { kind: 'sparkle', color: 'cyan' } },
  hero_m_sacred: { id: 'hero_m_sacred', name: '성장 해방', kind: 'sacred', target: 'enemiesAll', dmg: true, magic: true, fx: { kind: 'ring', color: 'gold' } },

  // ----- 주인공 궁수 「협공을 설계하는 사수」 -----
  hero_a_basic: { id: 'hero_a_basic', name: '사격', kind: 'basic', target: 'enemy', dmg: true, fx: { kind: 'slash', color: 'green' } },
  hero_a_a1: { id: 'hero_a_a1', name: '정밀 사격', kind: 'active', target: 'enemy', dmg: true, debuffs: ['mark'], fx: { kind: 'slash', color: 'cyan' } },
  hero_a_a2: { id: 'hero_a_a2', name: '화살비', kind: 'active', target: 'enemiesAll', dmg: true, fx: { kind: 'rain', color: 'green' } },
  hero_a_sacred: { id: 'hero_a_sacred', name: '성궁 해방', kind: 'sacred', target: 'enemiesAll', dmg: true, fx: { kind: 'rain', color: 'gold' } },

  // ----- C01 브란 (★3 불 기사) -----
  c01_basic: { id: 'c01_basic', name: '창 찌르기', kind: 'basic', target: 'enemy', dmg: true, melee: true, fx: { kind: 'slash', color: 'red' } },
  c01_a1: { id: 'c01_a1', name: '불굴의 방벽', kind: 'active', target: 'self', selfBuffs: ['taunt', 'ironwall'], fx: { kind: 'shieldFx', color: 'red' } },
  c01_a2: { id: 'c01_a2', name: '작열 돌격창', kind: 'active', target: 'enemies2', dmg: true, melee: true, debuffs: ['burn'], fx: { kind: 'slash', color: 'red' } },

  // ----- C02 카시안 (★3 물 마법사) -----
  c02_basic: { id: 'c02_basic', name: '마력탄', kind: 'basic', target: 'enemy', dmg: true, magic: true, fx: { kind: 'burst', color: 'blue' } },
  c02_a1: { id: 'c02_a1', name: '빙결의 파도', kind: 'active', target: 'enemies2', dmg: true, magic: true, debuffs: ['slow'], fx: { kind: 'burst', color: 'blue' } },
  c02_a2: { id: 'c02_a2', name: '절대영도', kind: 'active', target: 'enemiesAll', dmg: true, magic: true, debuffs: ['slow'], fx: { kind: 'ring', color: 'cyan' } },

  // ----- C03 세라핀 (★3 빛 성직자) -----
  c03_basic: { id: 'c03_basic', name: '성광', kind: 'basic', target: 'enemy', dmg: true, magic: true, fx: { kind: 'burst', color: 'gold' } },
  c03_a1: { id: 'c03_a1', name: '헌신의 빛', kind: 'active', target: 'ally', heal: true, selfHpCost: true, fx: { kind: 'sparkle', color: 'gold' } },
  c03_a2: { id: 'c03_a2', name: '성역', kind: 'active', target: 'alliesAll', heal: true, selfHpCost: true, buffs: ['regen'], includeSelf: true, fx: { kind: 'ring', color: 'gold' } },

  // ----- C04 녹스 (★3 어둠 도적) -----
  c04_basic: { id: 'c04_basic', name: '단검 찌르기', kind: 'basic', target: 'enemy', dmg: true, melee: true, fx: { kind: 'slash', color: 'purple' } },
  c04_a1: { id: 'c04_a1', name: '그림자 습격', kind: 'active', target: 'enemy', dmg: true, melee: true, selfBuffs: ['stealth'], fx: { kind: 'smoke', color: 'purple' } },
  c04_a2: { id: 'c04_a2', name: '급소 찌르기', kind: 'active', target: 'enemy', dmg: true, melee: true, condCrit: true, fx: { kind: 'slash', color: 'magenta' } },

  // ----- C05 에라 (★2 불 마법사) -----
  c05_basic: { id: 'c05_basic', name: '화염탄', kind: 'basic', target: 'enemy', dmg: true, magic: true, fx: { kind: 'burst', color: 'red' } },
  c05_a1: { id: 'c05_a1', name: '화염구', kind: 'active', target: 'enemiesAll', dmg: true, magic: true, debuffs: ['burn'], fx: { kind: 'burst', color: 'orange' } },
  c05_a2: { id: 'c05_a2', name: '집중 화염', kind: 'active', target: 'enemy', dmg: true, magic: true, debuffs: ['burn'], fx: { kind: 'burst', color: 'red' } },

  // ----- C06 리안 (★2 바람 전사) -----
  c06_basic: { id: 'c06_basic', name: '베기', kind: 'basic', target: 'enemy', dmg: true, melee: true, fx: { kind: 'slash', color: 'green' } },
  c06_a1: { id: 'c06_a1', name: '질풍 연격', kind: 'active', target: 'enemy', dmg: true, melee: true, fx: { kind: 'slash', color: 'green' } },
  c06_a2: { id: 'c06_a2', name: '회오리 베기', kind: 'active', target: 'enemiesAll', dmg: true, melee: true, fx: { kind: 'ring', color: 'green' } },

  // ----- C07 실피 (★2 바람 도적) -----
  c07_basic: { id: 'c07_basic', name: '찌르기', kind: 'basic', target: 'enemy', dmg: true, melee: true, fx: { kind: 'slash', color: 'green' } },
  c07_a1: { id: 'c07_a1', name: '기습 찌르기', kind: 'active', target: 'enemy', dmg: true, melee: true, debuffs: ['mark'], fx: { kind: 'slash', color: 'cyan' } },
  c07_a2: { id: 'c07_a2', name: '연막 구슬', kind: 'active', target: 'enemiesAll', debuffs: ['atkDown'], fx: { kind: 'smoke', color: 'gray3' } },

  // ----- C08 미엘 (★2 물 성직자) -----
  c08_basic: { id: 'c08_basic', name: '축복탄', kind: 'basic', target: 'enemy', dmg: true, magic: true, fx: { kind: 'burst', color: 'blue' } },
  c08_a1: { id: 'c08_a1', name: '치유의 물결', kind: 'active', target: 'ally', heal: true, fx: { kind: 'sparkle', color: 'blue' } },
  c08_a2: { id: 'c08_a2', name: '정화', kind: 'active', target: 'ally', heal: true, cleanse: true, fx: { kind: 'sparkle', color: 'cyan' } },

  // ----- C09 도르간 (★2 땅 기사) -----
  c09_basic: { id: 'c09_basic', name: '방패 타격', kind: 'basic', target: 'enemy', dmg: true, melee: true, fx: { kind: 'slash', color: 'brown' } },
  c09_a1: { id: 'c09_a1', name: '대지의 성채', kind: 'active', target: 'self', selfBuffs: ['ironwall'], shield: true, fx: { kind: 'shieldFx', color: 'brown' } },
  c09_a2: { id: 'c09_a2', name: '방패 밀치기', kind: 'active', target: 'enemy', dmg: true, melee: true, debuffs: ['atkDown'], fx: { kind: 'slash', color: 'brown' } },

  // ----- C10 루멘 (★2 빛 궁수) -----
  c10_basic: { id: 'c10_basic', name: '빛의 화살', kind: 'basic', target: 'enemy', dmg: true, fx: { kind: 'slash', color: 'gold' } },
  c10_a1: { id: 'c10_a1', name: '성광의 화살', kind: 'active', target: 'enemy', dmg: true, fx: { kind: 'slash', color: 'gold' } },
  c10_a2: { id: 'c10_a2', name: '꿰뚫는 사격', kind: 'active', target: 'enemies2', dmg: true, fx: { kind: 'slash', color: 'gold' } },

  // ----- C11 로크 (★1 불 전사) -----
  c11_basic: { id: 'c11_basic', name: '도끼 휘두르기', kind: 'basic', target: 'enemy', dmg: true, melee: true, fx: { kind: 'slash', color: 'red' } },
  c11_a1: { id: 'c11_a1', name: '강타', kind: 'active', target: 'enemy', dmg: true, melee: true, fx: { kind: 'slash', color: 'orange' } },
  c11_a2: { id: 'c11_a2', name: '분노의 일격', kind: 'active', target: 'enemy', dmg: true, melee: true, selfDefDown: true, fx: { kind: 'burst', color: 'red' } },

  // ----- C12 나딘 (★1 물 궁수) -----
  c12_basic: { id: 'c12_basic', name: '사격', kind: 'basic', target: 'enemy', dmg: true, fx: { kind: 'slash', color: 'blue' } },
  c12_a1: { id: 'c12_a1', name: '작살 투척', kind: 'active', target: 'enemy', dmg: true, debuffs: ['slow'], fx: { kind: 'slash', color: 'blue' } },
  c12_a2: { id: 'c12_a2', name: '그물 투척', kind: 'active', target: 'enemiesAll', dmg: true, debuffs: ['slow'], fx: { kind: 'rain', color: 'blue' } },

  // ----- C13 팔크 (★1 바람 궁수) -----
  c13_basic: { id: 'c13_basic', name: '사격', kind: 'basic', target: 'enemy', dmg: true, fx: { kind: 'slash', color: 'green' } },
  c13_a1: { id: 'c13_a1', name: '매의 표식', kind: 'active', target: 'enemy', dmg: true, debuffs: ['mark'], fx: { kind: 'slash', color: 'cyan' } },
  c13_a2: { id: 'c13_a2', name: '바람살 연사', kind: 'active', target: 'enemy', dmg: true, fx: { kind: 'rain', color: 'green' } },

  // ----- C14 우르사 (★1 땅 전사) -----
  c14_basic: { id: 'c14_basic', name: '내려찍기', kind: 'basic', target: 'enemy', dmg: true, melee: true, fx: { kind: 'slash', color: 'brown' } },
  c14_a1: { id: 'c14_a1', name: '대지 가르기', kind: 'active', target: 'enemies2', dmg: true, melee: true, fx: { kind: 'burst', color: 'brown' } },
  c14_a2: { id: 'c14_a2', name: '지진 강타', kind: 'active', target: 'enemiesAll', dmg: true, melee: true, debuffs: ['bind'], fx: { kind: 'ring', color: 'brown' } },

  // ----- C15 테오 (★1 땅 성직자) -----
  c15_basic: { id: 'c15_basic', name: '지팡이 타격', kind: 'basic', target: 'enemy', dmg: true, melee: true, fx: { kind: 'slash', color: 'brown' } },
  c15_a1: { id: 'c15_a1', name: '대지의 축복', kind: 'active', target: 'ally', heal: true, buffs: ['regen'], fx: { kind: 'sparkle', color: 'green' } },
  c15_a2: { id: 'c15_a2', name: '수호의 기원', kind: 'active', target: 'ally', shield: true, fx: { kind: 'shieldFx', color: 'teal' } },

  // ----- 적 스킬 (마왕군) -----
  e_slash: { id: 'e_slash', name: '녹슨 칼질', kind: 'basic', target: 'enemy', dmg: true, melee: true, fx: { kind: 'slash', color: 'gray3' } },
  e_shot: { id: 'e_shot', name: '뼈화살', kind: 'basic', target: 'enemy', dmg: true, fx: { kind: 'slash', color: 'gray3' } },
  e_power_shot: { id: 'e_power_shot', name: '관통 사격', kind: 'active', target: 'enemy', dmg: true, fx: { kind: 'slash', color: 'purple' } },
  e_dark_bolt: { id: 'e_dark_bolt', name: '암흑탄', kind: 'basic', target: 'enemy', dmg: true, magic: true, fx: { kind: 'burst', color: 'purple' } },
  e_dark_heal: { id: 'e_dark_heal', name: '어둠의 치유', kind: 'active', target: 'ally', heal: true, fx: { kind: 'sparkle', color: 'purple' } },
  e_dark_bless: { id: 'e_dark_bless', name: '어둠의 축복', kind: 'active', target: 'ally', buffs: ['atkUp'], fx: { kind: 'ring', color: 'purple' } },
  e_backstab: { id: 'e_backstab', name: '그림자 기습', kind: 'active', target: 'enemy', dmg: true, melee: true, fx: { kind: 'smoke', color: 'purple' } },
  e_taunt_howl: { id: 'e_taunt_howl', name: '망령의 포효', kind: 'active', target: 'self', selfBuffs: ['taunt', 'ironwall'], fx: { kind: 'shieldFx', color: 'purple' } },
};

// 패시브 정의 (수치는 balance.js의 passives)
export const PASSIVES = {
  hero_s_p: { id: 'hero_s_p', name: '이끄는 자', desc: '아군 전체 공격·마력 +10%' },
  hero_m_p: { id: 'hero_m_p', name: '마력 순환', desc: '적 처치 시 자신 액티브 쿨 1 감소' },
  hero_a_p: { id: 'hero_a_p', name: '선봉의 눈', desc: '자신의 협공 위력 +25%' },
  c01_p: { id: 'c01_p', name: '수호의 불꽃', desc: 'HP 비율이 가장 낮은 아군 받는 피해 −15%' },
  c02_p: { id: 'c02_p', name: '현자의 통찰', desc: '디버프 상태 적에게 마법 피해 +15%' },
  c03_p: { id: 'c03_p', name: '기적', desc: '아군(자신 제외) 전투불능급 피해를 HP 1로 생존 (전투당 1회)' },
  c04_p: { id: 'c04_p', name: '그림자 걸음', desc: '적 처치 시 은신 1턴' },
  c05_p: { id: 'c05_p', name: '불장난', desc: '화상 상태 적에게 피해 +20%' },
  c06_p: { id: 'c06_p', name: '바람걸음', desc: '전투 시작 후 3턴 속도 +20%' },
  c07_p: { id: 'c07_p', name: '기동 타격', desc: '자신보다 속도가 낮은 적에게 피해 +20%' },
  c08_p: { id: 'c08_p', name: '위기의 용기', desc: 'HP 50% 이하 아군 치유 시 치유량 +30%' },
  c09_p: { id: 'c09_p', name: '굳건한 대지', desc: '전투 시작 시 보호막 (마력 120%)' },
  c10_p: { id: 'c10_p', name: '파사의 빛', desc: '어둠 속성 적에게 피해 +15%' },
  c11_p: { id: 'c11_p', name: '투지', desc: 'HP 50% 이하일 때 공격 +20%' },
  c12_p: { id: 'c12_p', name: '사냥꾼의 눈', desc: '둔화 상태 적에게 피해 +20%' },
  c13_p: { id: 'c13_p', name: '콤비 사냥', desc: '자신의 협공 위력 +30%' },
  c14_p: { id: 'c14_p', name: '바위 피부', desc: '받는 물리 피해 −10%' },
  c15_p: { id: 'c15_p', name: '노련한 발걸음', desc: '자신 받는 피해 −10%' },
};
