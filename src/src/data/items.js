// ============================================================
// items.js — 소모품 7종 정의 (기획서 §10, M5-6)
//
// 데이터 주도(규칙 3): 정체성(이름·효과 종류)만 여기, 수치는 balance.js items (규칙 2).
// 전투 중 사용 = 행동 소모, 전투당 3회 제한 (balance.battleItems).
// effect: 'heal'(HP% 회복) | 'revive'(부활) | 'cleanse'(디버프 해제) | 'buff'(상태 부여)
// ============================================================

import { BALANCE } from '../balance.js';

export const CONSUMABLES = {
  potion_s:  { id: 'potion_s', name: '회복 포션(소)', effect: 'heal' },
  potion_m:  { id: 'potion_m', name: '회복 포션(중)', effect: 'heal' },
  potion_l:  { id: 'potion_l', name: '회복 포션(대)', effect: 'heal' },
  feather:   { id: 'feather', name: '부활의 깃털', effect: 'revive' },
  cleanse:   { id: 'cleanse', name: '정화의 물약', effect: 'cleanse' },
  atk_tonic: { id: 'atk_tonic', name: '공격의 비약', effect: 'buff', status: 'atkUp' },
  def_tonic: { id: 'def_tonic', name: '방어의 비약', effect: 'buff', status: 'ironwall' },
};

// 설명 문구 — 수치는 balance에서 채워 넣는다 (툴팁 원칙: 수치를 바꾸면 설명이 따라온다)
export function describeConsumable(id) {
  const B = BALANCE.items;
  const c = CONSUMABLES[id];
  switch (c.effect) {
    case 'heal': return `아군 단일 HP ${Math.round(B.healPct[id] * 100)}% 회복`;
    case 'revive': return `쓰러진 아군 부활 (HP ${Math.round(B.revivePct * 100)}%)`;
    case 'cleanse': return '아군 단일 디버프 전부 해제';
    case 'buff': {
      const b = B.buff[id];
      const what = c.status === 'atkUp' ? '공격·마력' : '방어';
      return `아군 단일 ${what} +${Math.round(b.ratio * 100)}% (${b.turns}턴)`;
    }
    default: return '';
  }
}
