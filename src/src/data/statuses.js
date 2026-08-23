// ============================================================
// statuses.js — 상태이상 14종 메타 (기획서 §6. 수치는 balance.js의 status)
// 표시: 유닛 아래 한 글자 아이콘 + 남은 턴. 동명 중첩 불가·재적용 갱신.
// 보스는 기절·속박·도발 면역.
// ============================================================

export const STATUSES = {
  // 디버프 8종
  burn:    { id: 'burn', name: '화상', kind: 'debuff', icon: '화', color: 'red' },
  slow:    { id: 'slow', name: '둔화', kind: 'debuff', icon: '둔', color: 'blue' },
  bind:    { id: 'bind', name: '속박', kind: 'debuff', icon: '박', color: 'brown' },
  stun:    { id: 'stun', name: '기절', kind: 'debuff', icon: '절', color: 'yellow' },
  atkDown: { id: 'atkDown', name: '공격 약화', kind: 'debuff', icon: '약', color: 'gray3' },
  defDown: { id: 'defDown', name: '방어 붕괴', kind: 'debuff', icon: '붕', color: 'gray3' },
  mark:    { id: 'mark', name: '표식', kind: 'debuff', icon: '표', color: 'cyan' },
  // 도발: 기획서 분류상 디버프 항목이지만, 시전자 자신에게 걸어 적의 단일 공격을
  // 강제로 끌어오는 상태이므로 구현상 버프(정화 대상 아님)로 처리 (DECISIONS.md)
  taunt:   { id: 'taunt', name: '도발', kind: 'buff', icon: '도', color: 'orange' },
  // 버프 6종
  atkUp:   { id: 'atkUp', name: '공격 강화', kind: 'buff', icon: '강', color: 'gold' },
  ironwall:{ id: 'ironwall', name: '철벽', kind: 'buff', icon: '철', color: 'skyBlue' },
  shield:  { id: 'shield', name: '보호막', kind: 'buff', icon: '막', color: 'teal' },
  regen:   { id: 'regen', name: '재생', kind: 'buff', icon: '재', color: 'green' },
  haste:   { id: 'haste', name: '신속', kind: 'buff', icon: '속', color: 'green' },
  stealth: { id: 'stealth', name: '은신', kind: 'buff', icon: '은', color: 'purple' },
};

// 보스 면역 (기획서 §6)
export const BOSS_IMMUNE = ['stun', 'bind', 'taunt'];
