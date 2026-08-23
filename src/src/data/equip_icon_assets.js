// ============================================================
// equip_icon_assets.js — 장비 아이콘 등록표 (M5-4 준비, 2026-08-16)
//
// 임시 외부 에셋 (CC0 — CREDITS.md "장비 아이콘" 항목 참조): 계열당 1장, 34×34.
// 최종 자체 작화가 오면 **여기 경로만 갈아끼운다** (교체 비용 최소화 원칙).
// 티어 팔레트 스왑·등급 테두리색·전설 맥동은 그리는 쪽(코드)이 씌운다 —
// 그림 파일은 항상 "무등급 기본형" 1장만 둔다.
// ============================================================

export const EQUIP_ICONS = {
  // ----- 무기 6계열 (직업 전용) -----
  greatsword: 'assets/equip/greatsword.png',  // 대검 (전사)
  lance:      'assets/equip/lance.png',       // 창방패 (기사)
  bow:        'assets/equip/bow.png',         // 활 (궁수)
  staff:      'assets/equip/staff.png',       // 지팡이 (마법사)
  rod:        'assets/equip/rod.png',         // 성장 (성직자)
  daggers:    'assets/equip/daggers.png',     // 쌍단검 (도적)
  // ----- 방어구 3계열 -----
  heavy:      'assets/equip/heavy.png',       // 중갑 (전사·기사)
  light:      'assets/equip/light.png',       // 경갑 (궁수·도적)
  robe:       'assets/equip/robe.png',        // 로브 (마법사·성직자)
  // ----- 장신구 3종 (공용) -----
  ring:       'assets/equip/ring.png',        // 반지 (공·마)
  necklace:   'assets/equip/necklace.png',    // 목걸이 (HP)
  charm:      'assets/equip/charm.png',       // 부적 (속도)
};
