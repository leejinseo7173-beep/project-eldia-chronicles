// ============================================================
// save.js — 저장 시스템 (기획서 §15)
// localStorage 슬롯 3 + 슬롯별 자동저장 + 파일 내보내기/가져오기.
// 세이브 포맷은 version 필드로 마이그레이션한다.
// ============================================================

export const SAVE_VERSION = 1;
export const SLOT_COUNT = 3;

const PREFIX = 'eldia';
const SETTINGS_KEY = `${PREFIX}:settings`;
const slotKey = (slot, auto) => `${PREFIX}:save:${slot}${auto ? ':auto' : ''}`;

// ----- 게임 상태 -----

export function createNewGameState(seed) {
  return {
    version: SAVE_VERSION,
    seed,                    // 시드 랜덤 루트 (모든 RNG 스트림의 기반)
    heroName: '아렌',        // 기본명. 이름 입력은 M6 새 게임 흐름에서
    heroClass: null,         // 'sword' | 'mage' | 'archer' — M6에서 선택
    heroGender: null,        // 'm' | 'f' — M6에서 선택
    difficulty: 'normal',
    chapter: 'prologue',
    playTimeSec: 0,
    createdAt: Date.now(),
    savedAt: null,
    // 이후 마일스톤에서 확장: party, roster, inventory, base, quests, story...
  };
}

// 필수 필드 스키마 검증 — 가져오기/로드 시 손상 상태의 유입을 막는다
function isValidState(s) {
  return typeof s.heroName === 'string'
    && (typeof s.seed === 'string' || typeof s.seed === 'number')
    && typeof s.chapter === 'string'
    && Number.isFinite(s.playTimeSec);
}

function migrate(state) {
  if (!state || typeof state !== 'object') return null;
  if (!Number.isInteger(state.version) || state.version > SAVE_VERSION) return null;
  // 향후 버전 상승 시 여기서 순차 마이그레이션
  if (!isValidState(state)) return null;
  return state;
}

// ----- 슬롯 저장/불러오기 -----

export function saveSlot(slot, state, { auto = false } = {}) {
  state.savedAt = Date.now();
  localStorage.setItem(slotKey(slot, auto), JSON.stringify(state));
}

export function loadSlot(slot, { auto = false } = {}) {
  const raw = localStorage.getItem(slotKey(slot, auto));
  if (!raw) return null;
  try {
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

// 이어하기: 수동/자동 중 더 최근 저장본을 돌려준다
export function loadNewest(slot) {
  const manual = loadSlot(slot);
  const auto = loadSlot(slot, { auto: true });
  if (manual && auto) return (auto.savedAt > manual.savedAt) ? auto : manual;
  return manual || auto;
}

export function deleteSlot(slot) {
  localStorage.removeItem(slotKey(slot, false));
  localStorage.removeItem(slotKey(slot, true));
}

export function slotInfo(slot) {
  const s = loadNewest(slot);
  if (!s) return { slot, exists: false };
  return {
    slot,
    exists: true,
    heroName: s.heroName,
    chapter: s.chapter,
    playTimeSec: s.playTimeSec,
    savedAt: s.savedAt,
    hasAuto: !!loadSlot(slot, { auto: true }),
  };
}

export function listSlots() {
  const out = [];
  for (let i = 1; i <= SLOT_COUNT; i++) out.push(slotInfo(i));
  return out;
}

// ----- 파일 내보내기 / 가져오기 -----

export function exportSlot(slot) {
  const manual = loadSlot(slot);
  const auto = loadSlot(slot, { auto: true });
  if (!manual && !auto) throw new Error('내보낼 저장 데이터가 없습니다.');
  const payload = {
    format: 'eldia-chronicles-save',
    version: SAVE_VERSION,
    slot,
    exportedAt: Date.now(),
    manual,
    auto,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `eldia_save_slot${slot}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// 파일 선택 대화상자를 띄워 슬롯에 가져온다. 성공 시 slotInfo 반환.
export function importSlot(slot) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) { reject(new Error('파일이 선택되지 않았습니다.')); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const payload = JSON.parse(reader.result);
          if (payload.format !== 'eldia-chronicles-save') throw new Error('엘디아 연대기 세이브 파일이 아닙니다.');
          if (typeof payload.version !== 'number' || payload.version > SAVE_VERSION) throw new Error('지원하지 않는 세이브 버전입니다.');
          const manual = migrate(payload.manual);
          const auto = migrate(payload.auto);
          if (!manual && !auto) throw new Error('세이브 파일에 유효한 데이터가 없습니다.');
          deleteSlot(slot);
          if (manual) localStorage.setItem(slotKey(slot, false), JSON.stringify(manual));
          if (auto) localStorage.setItem(slotKey(slot, true), JSON.stringify(auto));
          resolve(slotInfo(slot));
        } catch (e) {
          reject(e instanceof Error ? e : new Error('세이브 파일을 읽을 수 없습니다.'));
        }
      };
      reader.onerror = () => reject(new Error('파일을 읽는 중 오류가 발생했습니다.'));
      reader.readAsText(file);
    };
    input.click();
  });
}

// ----- 설정 -----

export const DEFAULT_SETTINGS = {
  bgmVolume: 7,        // 0~10
  seVolume: 7,         // 0~10
  textSpeed: 'normal', // 'slow' | 'normal' | 'fast'
  battleSpeed: 1,      // 1 | 2
  screenScale: 'auto', // 'auto' | 1 | 2 | 3
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
