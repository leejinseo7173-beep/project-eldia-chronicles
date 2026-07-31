// ============================================================
// simulator.js — 자동 밸런스 시뮬레이터 (기획서 §17 검증 기준)
// 오토 정책으로 전투를 완주시키고 TTK 앵커를 통계로 검증한다.
// 렌더 무관 — 치트 콘솔·개발 검증에서 호출.
// ============================================================

import * as L from './logic.js';
import * as AI from './ai.js';

const MAX_TURNS = 60;

// 한 판 자동 완주
export function runAutoBattle(stageId, { seed, partyIds, heroClass, difficulty } = {}) {
  const state = L.createBattleFromStage(stageId, { seed, partyIds, heroClass, difficulty });
  let guard = 0;
  while (!state.winner && guard++ < MAX_TURNS * 10) {
    for (const u of L.livingUnits(state, 'ally')) {
      if (state.winner || !u.alive || u.acted) continue;
      const action = AI.autoAction(state, u);
      if (action.type === 'skill') L.executeSkill(state, u.id, action.skillId, action.targetId);
      u.acted = true;
    }
    if (!state.winner) {
      L.endPlayerPhase(state);
      if (!state.winner) AI.enemyPhase(state);
    }
    if (state.turn > MAX_TURNS) break;
  }
  return {
    winner: state.winner ?? 'timeout',
    turns: state.turn,
    allyDeaths: state.allyDeaths,
    stars: L.computeStars(state),
    allyHpRatios: state.units.filter((u) => u.side === 'ally').map((u) => u.hp / u.stats.maxHp),
  };
}

// N회 반복 통계
export function simulateMany(stageId, n = 100, opts = {}) {
  const results = [];
  let errors = 0;
  for (let i = 0; i < n; i++) {
    try {
      results.push(runAutoBattle(stageId, { ...opts, seed: `sim-${stageId}-${i}` }));
    } catch (e) {
      errors++;
    }
  }
  const wins = results.filter((r) => r.winner === 'ally');
  const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
  return {
    stage: stageId, runs: n, errors,
    winRate: wins.length / Math.max(1, results.length),
    avgTurns: +avg(results.map((r) => r.turns)).toFixed(2),
    maxTurns: Math.max(0, ...results.map((r) => r.turns)),
    avgAllyDeaths: +avg(results.map((r) => r.allyDeaths)).toFixed(2),
    starDist: [0, 1, 2, 3].map((s) => results.filter((r) => r.stars === s).length),
    avgMinAllyHp: +avg(wins.map((r) => Math.min(...r.allyHpRatios))).toFixed(2),
  };
}
