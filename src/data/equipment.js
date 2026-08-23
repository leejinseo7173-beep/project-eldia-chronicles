// ============================================================
// equipment.js — 장비 12계열·등급·이름표 정의 (기획서 §10, M5-4)
//
// 데이터 주도(규칙 3): 계열·이름 추가는 이 파일만 고친다.
// 수치(주스탯·부옵 범위·비용)는 전부 balance.js의 equip 섹션 (규칙 2).
// 아이콘은 data/equip_icon_assets.js (자체 작화 12종, 2026-08-21).
//
// slot: 'weapon' | 'armor' | 'acc'
// classes: 착용 가능한 동료 classKey / hero: 착용 가능한 주인공 직업
//   (기획서: 무기 6계열 직업 전용, 방어구 3계열, 장신구 공용.
//    주인공은 직업 대응 — 검사=대검·중갑, 궁수=활·경갑, 마법사=지팡이·로브)
// tierNames: T1~T6 기본명 (챕터 테마: 낡은→왕국군→잿불→서리→고대숲→성왕)
// legend: 전설(등급5, T6 정수 제작 한정 — M7) 고유명 + 플레이버
// ============================================================

export const EQUIP_KINDS = {
  // ----- 무기 6계열 -----
  greatsword: {
    id: 'greatsword', name: '대검', slot: 'weapon',
    classes: ['warrior'], hero: ['sword'],
    tierNames: ['낡은 대검', '왕국군 대검', '잿불 대검', '서리 대검', '고목 대검', '성왕의 대검'],
    legend: { name: '파천대검', flavor: '마왕전쟁에서 하늘을 갈랐다는 선왕의 검' },
  },
  lance: {
    id: 'lance', name: '창방패', slot: 'weapon',
    classes: ['knight'], hero: [],
    tierNames: ['녹슨 창방패', '왕국 기사창', '화산암 방패창', '빙벽 창방패', '수호목 창방패', '성왕의 기사창'],
    legend: { name: '철벽성창', flavor: '이 창이 선 전선은 무너진 적이 없다' },
  },
  bow: {
    id: 'bow', name: '활', slot: 'weapon',
    classes: ['archer'], hero: ['archer'],
    tierNames: ['사냥꾼의 활', '왕국군 장궁', '잿깃 활', '서리시위 활', '정령목 활', '성왕의 장궁'],
    legend: { name: '유성궁', flavor: '시위를 놓으면 별똥별이 떨어진다' },
  },
  staff: {
    id: 'staff', name: '지팡이', slot: 'weapon',
    classes: ['mage'], hero: ['mage'],
    tierNames: ['견습 지팡이', '궁정 지팡이', '화염심 지팡이', '얼음결 지팡이', '고대수 지팡이', '성왕의 지팡이'],
    legend: { name: '성진의 지팡이', flavor: '별의 흐름을 읽던 대마법사의 유산' },
  },
  rod: {
    id: 'rod', name: '성장', slot: 'weapon',
    classes: ['cleric'], hero: [],
    tierNames: ['순례자의 성장', '예배당 성장', '재의 성장', '성수의 성장', '숲빛 성장', '성왕의 성장'],
    legend: { name: '정화의 성장', flavor: '역병의 해, 도시 하나를 살려냈다' },
  },
  daggers: {
    id: 'daggers', name: '쌍단검', slot: 'weapon',
    classes: ['thief'], hero: [],
    tierNames: ['무딘 쌍단검', '밀정의 쌍단검', '흑요석 쌍단검', '서리송곳', '가시덩굴 쌍단검', '성왕의 쌍인'],
    legend: { name: '월영쌍인', flavor: '달그림자 속에서만 검신이 보인다' },
  },

  // ----- 방어구 3계열 -----
  heavy: {
    id: 'heavy', name: '중갑', slot: 'armor',
    classes: ['warrior', 'knight'], hero: ['sword'],
    tierNames: ['낡은 흉갑', '왕국군 판금갑', '화산철 중갑', '서리강철 중갑', '고대 수호갑', '성왕의 판금갑'],
    legend: { name: '불괴의 갑주', flavor: '마왕군의 공성도 이 갑주를 뚫지 못했다' },
  },
  light: {
    id: 'light', name: '경갑', slot: 'armor',
    classes: ['archer', 'thief'], hero: ['archer'],
    tierNames: ['여행자 가죽갑', '정찰병 경갑', '도마뱀가죽 경갑', '설표가죽 경갑', '정령실 경갑', '성왕의 경갑'],
    legend: { name: '질풍의 경갑', flavor: '입은 자의 발소리는 바람이 삼킨다' },
  },
  robe: {
    id: 'robe', name: '로브', slot: 'armor',
    classes: ['mage', 'cleric'], hero: ['mage'],
    tierNames: ['해진 로브', '궁정 로브', '잿불 로브', '성에 로브', '포자실 로브', '성왕의 예복'],
    legend: { name: '대현자의 로브', flavor: '일곱 현자 중 마지막 한 명이 남긴 옷' },
  },

  // ----- 장신구 3종 (공용: classes/hero null = 전원) -----
  ring: {
    id: 'ring', name: '반지', slot: 'acc',
    classes: null, hero: null,
    tierNames: ['구리 반지', '은 반지', '홍옥 반지', '청옥 반지', '비취 반지', '성왕의 인장'],
    legend: { name: '서약의 반지', flavor: '옛 왕과 정령이 맹세를 나눈 증표' },
  },
  necklace: {
    id: 'necklace', name: '목걸이', slot: 'acc',
    classes: null, hero: null,
    tierNames: ['나무 목걸이', '은 목걸이', '용암구슬 목걸이', '진주 목걸이', '호박 목걸이', '성왕의 성표'],
    legend: { name: '성자의 성표', flavor: '이름 없는 성자가 걸었던 길을 지킨다' },
  },
  charm: {
    id: 'charm', name: '부적', slot: 'acc',
    classes: null, hero: null,
    tierNames: ['종이 부적', '축복 부적', '재의 부적', '서리 부적', '숲정령 부적', '성왕의 부적'],
    legend: { name: '정령왕의 부적', flavor: '정령왕의 숨결 한 조각이 봉해져 있다' },
  },
};

// 등급 1~5 — prefix가 null이면 고유명(legend) 사용
export const GRADES = {
  1: { key: 'normal', label: '일반', prefix: '', color: 'gray3' },
  2: { key: 'fine', label: '고급', prefix: '정련된 ', color: 'green' },
  3: { key: 'rare', label: '희귀', prefix: '축복받은 ', color: 'skyBlue' },
  4: { key: 'epic', label: '영웅', prefix: '명장의 ', color: 'purple' },
  5: { key: 'legend', label: '전설', prefix: null, color: 'gold' },
};

export const SLOT_LABELS = { weapon: '무기', armor: '방어구', acc: '장신구' };

// 부옵 6종 표기 (수치 범위는 balance.equip.subs)
export const SUB_LABELS = {
  atkPct: '공격 +{v}%', magPct: '마력 +{v}%', hpPct: 'HP +{v}%',
  defPct: '방어 +{v}%', spd: '속도 +{v}', critPct: '치명 +{v}%',
};
