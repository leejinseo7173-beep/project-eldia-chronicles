// ============================================================
// buildings.js — 거점 시설 13종 정의 (기획서 §12, M5-1)
//
// 데이터 주도(절대 규칙 3): 시설 추가·해금 변경은 이 파일만 고친다.
// 수치(생산량·비용·상한)는 전부 balance.js의 base 섹션 — 여기엔 없다(규칙 2).
//
// kind: 'func'(기능) | 'prod'(방치 생산) | 'house'(인구 상한)
// unlock: 해금 시점 키 — UNLOCK_ORDER의 순서로 비교한다 (기획서 해금 스케줄)
// pos: 전경(960×540)에서의 클릭 상자 겸 그리기 앵커
// slots: 생산 시설의 단계별 일꾼 슬롯 (기획서 §12 표)
// startLv: 새 게임 시작 레벨 (성벽만 1 — 프롤로그에서 이미 서 있다)
// ============================================================

export const UNLOCK_ORDER = ['prologue', 'ch1a', 'ch1b', 'ch2', 'ch3'];

export const BUILDINGS = {
  // ----- 기능 시설 8종 -----
  wall: {
    id: 'wall', name: '성벽', kind: 'func', maxLv: 5, unlock: 'prologue', startLv: 1,
    desc: '챕터 진출 관문. 창고 상한을 넓힌다',
    pos: { x: 300, y: 46, w: 360, h: 64 },
  },
  altar: {
    id: 'altar', name: '소환 제단', kind: 'func', maxLv: 3, unlock: 'prologue',
    desc: '맹세의 증표로 동료를 소환한다',
    scene: 'gacha',            // 건설돼 있으면 Z로 입장 (내용물 씬)
    pos: { x: 96, y: 208, w: 96, h: 76 },
  },
  tavern: {
    id: 'tavern', name: '주점', kind: 'func', maxLv: 3, unlock: 'prologue',
    desc: '서브 퀘스트와 파밍 던전 게시판',
    pos: { x: 760, y: 300, w: 96, h: 76 },
  },
  house: {
    id: 'house', name: '주택가', kind: 'house', maxLv: 3, unlock: 'ch1a',
    desc: '인구 상한을 넓힌다',
    pos: { x: 150, y: 392, w: 110, h: 70 },
  },
  shop: {
    id: 'shop', name: '상점', kind: 'func', maxLv: 3, unlock: 'ch1a',
    desc: '포션·장비·선물 구매',
    scene: 'shop',
    pos: { x: 760, y: 196, w: 96, h: 76 },
  },
  smith: {
    id: 'smith', name: '대장간', kind: 'func', maxLv: 3, unlock: 'ch1b',
    desc: '장비 제작과 강화',
    scene: 'smith',
    pos: { x: 700, y: 392, w: 96, h: 76 },
  },
  camp: {
    id: 'camp', name: '병영', kind: 'func', maxLv: 3, unlock: 'ch2',
    desc: '동료와 교감한다 (대화·선물)',
    scene: 'camp',
    pos: { x: 330, y: 196, w: 96, h: 76 },
  },
  dojo: {
    id: 'dojo', name: '훈련소', kind: 'func', maxLv: 3, unlock: 'ch2',
    desc: '재화로 레벨을 올린다. 레벨 상한 확장',
    scene: 'growth',
    pos: { x: 214, y: 196, w: 96, h: 76 },
  },
  temple: {
    id: 'temple', name: '신전', kind: 'func', maxLv: 3, unlock: 'ch3',
    desc: '동료를 각성시킨다',
    scene: 'growth',        // 육성 화면의 각성 축 — 신전이 서야 각성 버튼이 열린다
    pos: { x: 96, y: 120, w: 96, h: 72 },
  },

  // ----- 생산 시설 5종 (방치형) -----
  lumber: {
    id: 'lumber', name: '벌목장', kind: 'prod', maxLv: 3, unlock: 'ch1a',
    desc: '목재를 생산한다', slots: [2, 4, 6],
    pos: { x: 452, y: 384, w: 96, h: 76 },
  },
  mine: {
    id: 'mine', name: '광산', kind: 'prod', maxLv: 3, unlock: 'ch1b',
    desc: '석재와 철광석을 캔다', slots: [2, 4, 6],
    pos: { x: 580, y: 404, w: 96, h: 60 },
  },
  farm: {
    id: 'farm', name: '농장', kind: 'prod', maxLv: 3, unlock: 'ch2',
    desc: '식량을 기른다', slots: [2, 4, 6],
    pos: { x: 296, y: 404, w: 110, h: 60 },
  },
  spring: {
    id: 'spring', name: '마력샘', kind: 'prod', maxLv: 3, unlock: 'ch3',
    desc: '마정석이 고인다 (가끔 각성석)', slots: null,
    pos: { x: 856, y: 120, w: 76, h: 72 },
  },
};

// 해금 여부 — progress(예: state.progress)와 시설 unlock 키를 순서로 비교
export function isUnlocked(id, progress) {
  const need = UNLOCK_ORDER.indexOf(BUILDINGS[id].unlock);
  const cur = UNLOCK_ORDER.indexOf(progress ?? 'ch1a');
  return cur >= need;
}
