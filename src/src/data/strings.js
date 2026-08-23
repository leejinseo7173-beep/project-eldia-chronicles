// ============================================================
// strings.js — 공용 표기 문자열 (절대 규칙 3: 데이터 주도)
// 챕터·직업·난이도 등 여러 화면에서 공유하는 라벨을 한 곳에 둔다.
// ============================================================

export const CHAPTER_LABELS = {
  prologue: '프롤로그',
  ch1: '1장 새벽 평원',
  ch2: '2장 잿불 화산령',
  ch3: '3장 서리 호수',
  ch4: '4장 고요의 대삼림',
  ch5: '5장 왕도 폐허',
  final: '종장 마왕성',
};

export const CLASS_LABELS = {
  warrior: '전사', knight: '기사', archer: '궁수',
  mage: '마법사', cleric: '성직자', thief: '도적',
};

export const HERO_CLASS_LABELS = {
  sword: '검사', mage: '마법사', archer: '궁수',
};

export const DIFFICULTY_LABELS = {
  easy: '이지', normal: '노말', hard: '하드',
};

export const ELEMENT_LABELS = {
  fire: '불', water: '물', wind: '바람', earth: '땅',
  light: '빛', dark: '어둠', none: '무속성',
};

// ----- 표기 포맷터 -----

export function formatPlayTime(sec) {
  const total = Math.floor(sec || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분`;
  return `${total}초`;
}

export function formatDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
