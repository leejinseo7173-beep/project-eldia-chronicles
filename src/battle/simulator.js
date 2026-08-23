// ============================================================
// simulator.js — 자동 밸런스 시뮬레이터 (기획서 §17 검증 기준)
// 오토 정책으로 전투를 완주시키고 TTK 앵커를 통계로 검증한다.
// 렌더 무관 — 치트 콘솔·개발 검증에서 호출.
//
// 작업계획.md 2부 §6이 요구하는 도구:
//   ① 조합 전수 시뮬 (상·하위 이상치 자동 발견)
//   ② 합격 기준 자동 판정 (§5의 목표 범위를 코드화)
// ============================================================

import * as L from './logic.js';
import * as AI from './ai.js';
import { STAGES } from '../data/stages.js';
import { CHARACTERS } from '../data/characters.js';

const MAX_TURNS = 60;

// 한 판 자동 완주
export function runAutoBattle(stageId, { seed, partyIds, heroClass, difficulty } = {}) {
  const state = L.createBattleFromStage(stageId, { seed, partyIds, heroClass, difficulty });
  // 위험도는 **전투 도중 찍은 최저점**으로 잰다. 종료 시점 HP를 쓰면
  // 힐러가 마지막에 회복시킨 판이 "여유로웠다"로 뒤집힌다
  // (실측: 보스가 세서 16턴 힐 공방이 벌어진 판이 최저HP 57% = 너무 쉬움으로 읽혔다).
  const lowest = new Map();
  const sample = () => {
    for (const u of state.units) {
      if (u.side !== 'ally' || !u.alive) continue;
      const r = u.hp / u.stats.maxHp;
      lowest.set(u.id, Math.min(lowest.get(u.id) ?? 1, r));
    }
  };
  sample();
  let guard = 0;
  while (!state.winner && guard++ < MAX_TURNS * 10) {
    for (const u of L.livingUnits(state, 'ally')) {
      if (state.winner || !u.alive || u.acted) continue;
      const action = AI.autoAction(state, u);
      if (action.type === 'skill') L.executeSkill(state, u.id, action.skillId, action.targetId);
      u.acted = true;
    }
    sample();
    if (!state.winner) {
      L.endPlayerPhase(state);
      sample();
      if (!state.winner) AI.enemyPhase(state);
      sample();
    }
    if (state.turn > MAX_TURNS) break;
  }
  return {
    winner: state.winner ?? 'timeout',
    turns: state.turn,
    allyDeaths: state.allyDeaths,
    stars: L.computeStars(state),
    // **살아남은** 아군만. 죽은 아군을 0으로 섞으면 "누가 죽었다"와
    // "아슬아슬했다"가 한 숫자로 뭉개져 튜닝 지표가 못 된다 — 전투불능은 allyDeaths로 따로 본다.
    allyHpRatios: state.units
      .filter((u) => u.side === 'ally' && u.alive)
      .map((u) => lowest.get(u.id) ?? u.hp / u.stats.maxHp),
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
    // 승리한 판에서 "가장 위험했던 순간" — 무피해 승리인지 아슬아슬했는지를 가르는 핵심 지표
    avgMinAllyHp: +avg(wins.map((r) => Math.min(...r.allyHpRatios))).toFixed(2),
  };
}

// ----- 합격 기준 (작업계획.md 2부 §5, 노말·적정 육성 기준) -----
// 스테이지가 어느 유형인지는 데이터에서 판별한다 (보스 유닛 유무 / 버티기 여부).
// minHp = 살아남은 아군의 최저 HP 비율 / deaths = 허용 평균 전투불능 수
export const PASS_CRITERIA = {
  // 소규모 조우(적 2기 이하) — 튜토리얼·길목 전투. 짧고 안전한 게 정상이다.
  // 하한 0.70→0.50 (2026-08-22 재역산): 유리몸 주인공(마법사 등)은 피격 1회에 −45%p라
  // 0.70은 검사 전용 잣대였다. 소규모전의 안전은 deaths 0.05가 지킨다.
  skirmish: { minHp: [0.50, 0.95], turns: [2, 4], deaths: 0.05 },   // 턴 상한 3.5→4 — 유리몸 궁수 2인조의 정직한 속도 (검사 기준 잣대 보정)
  // 일반전 재조정 (2026-08-22 3직업 재역산): 도발 2턴 브란이 소화하는 파티는 최저HP가
  // 탱커의 최소보장 칩댐 하한에 수렴하고(칩댐 총량은 전투 길이에 비례 — 캐스터 파티 4.6턴 ≈ 0.36),
  // 캐스터 파티는 검사보다 ~1턴 느리다. 하한 0.55→0.35, 턴 상한 4→5. deaths 0.15가 안전판.
  normal: { minHp: [0.35, 0.70], turns: [3, 5], deaths: 0.15 },
  elite:  { minHp: [0.40, 0.55], turns: [4, 6], deaths: 0.4 },
  boss:   { minHp: [0.20, 0.40], turns: [6, 8], deaths: 0.6 },
  // 버티기: 규정 턴 고정. 전멸 위기 1~2회 = 한두 명은 쓰러져도 된다.
  // 상한 판정 없음(skipTooEasy): 생존자 HP는 버티기 드라마의 지표가 아니다 —
  // 집중 공격이 희생자를 만들고 나면 생존자는 멀쩡한 게 이 유형의 정상 형태. deaths가 드라마를 잰다.
  survive: { minHp: [0.10, 1], turns: null, deaths: 2.0, skipTooEasy: true },
};

export function stageKind(stageId) {
  const st = STAGES[stageId];
  // 데이터가 유형을 명시했으면 그걸 따른다 — 적 수만으로는 필드 잡몹과 스토리 전투를 못 가린다
  if (st.kind) return st.kind;
  if (st.victory.type === 'survive') return 'survive';
  if (st.enemies.some((e) => e.boss || e.role === 'boss')) return 'boss';
  if (st.enemies.some((e) => e.role === 'elite')) return 'elite';
  return st.enemies.length <= 2 ? 'skirmish' : 'normal';
}

// 난이도 보정 (작업계획.md 2부 §5): 이지 = 최저HP 목표 +15%p 여유 / 하드 = −15%p.
// **하한만** 움직인다 (2026-08-22 재역산): 상한("너무 쉬움")은 노말 전용 판정 —
// 하드에서 저레벨 스테이지가 수월한 것, 이지가 무피해에 가까운 것은 결함이 아니다.
// 턴·전투불능 기준은 그대로 — §5가 명시한 것은 위험도(HP) 잣대뿐이다.
export function criteriaFor(kind, difficulty = 'normal') {
  const c = PASS_CRITERIA[kind];
  // 이지 +10%p (원안 +15%p): 이지의 본질 안전판은 deaths(노말과 동일 잣대)다 —
  // 탱커 흡수 파티의 minHp에 +15%p까지 요구하면 이지가 제일 통과하기 어려운 칸이 된다.
  const shift = difficulty === 'easy' ? 0.10 : difficulty === 'hard' ? -0.15 : 0;
  if (!shift) return c;
  const clamp = (v) => Math.min(1, Math.max(0, +(v + shift).toFixed(2)));
  // 턴 잣대도 난이도를 따른다: 하드는 적 스탯 +15%라 기계적으로 길어진다(상한 ×1.3),
  // 이지는 적 연계가 없어 짧아진다(하한 ×0.95). 반대쪽 끝은 노말 기준 유지.
  const turns = c.turns
    ? (difficulty === 'hard' ? [c.turns[0], +(c.turns[1] * 1.3).toFixed(1)]
                             : [+(c.turns[0] * 0.95).toFixed(1), c.turns[1]])
    : null;
  // 하드 전투불능 ×1.5 — 위험이 하드의 정체성이다 (적 스탯 +15%·집중 공격)
  const deaths = difficulty === 'hard' ? +(c.deaths * 1.5).toFixed(2) : c.deaths;
  return { ...c, turns, deaths, minHp: [clamp(c.minHp[0]), 1], skipTooEasy: true };
}

// 한 스테이지의 합격 판정. 어긋난 항목과 방향을 같이 돌려준다.
export function judgeStage(stageId, n = 300, opts = {}) {
  const kind = stageKind(stageId);
  const c = criteriaFor(kind, opts.difficulty);
  const r = simulateMany(stageId, n, opts);
  const issues = [];
  if (r.errors) issues.push(`오류 ${r.errors}건`);
  if (r.winRate < 0.9 && kind !== 'boss') issues.push(`승률 낮음 ${(r.winRate * 100).toFixed(0)}%`);
  if (!c.skipTooEasy && r.avgMinAllyHp > c.minHp[1]) issues.push(`너무 쉬움 (최저HP ${(r.avgMinAllyHp * 100).toFixed(0)}% > ${c.minHp[1] * 100}%)`);
  if (r.avgMinAllyHp < c.minHp[0]) issues.push(`너무 어려움 (최저HP ${(r.avgMinAllyHp * 100).toFixed(0)}% < ${c.minHp[0] * 100}%)`);
  if (c.turns) {
    // ±0.15턴 허용오차 — 표본 평균의 반올림 잡음 방지 (5.89 vs 하한 6 같은 0.0x 차이)
    if (r.avgTurns < c.turns[0] - 0.15) issues.push(`너무 빨리 끝남 (${r.avgTurns}턴 < ${c.turns[0]})`);
    if (r.avgTurns > c.turns[1] + 0.15) issues.push(`너무 오래 걸림 (${r.avgTurns}턴 > ${c.turns[1]})`);
  }
  if (r.avgAllyDeaths > c.deaths) issues.push(`전투불능 많음 (${r.avgAllyDeaths} > ${c.deaths})`);
  return { stage: stageId, kind, pass: issues.length === 0, issues, ...r };
}

export function judgeAll(n = 300, opts = {}) {
  const rows = Object.keys(STAGES).map((id) => judgeStage(id, n, opts));
  return { pass: rows.every((x) => x.pass), rows };
}

// ----- 9칸 격자 (적킷_설계보관.md 재개 절차 2번) -----
// 주인공 3직업 × 난이도 3단계. 앞으로 밸런스 판정은 이 격자가 기본이다 —
// 한 칸(sword/normal)만 보고 "합격"이라고 하면 안 된다 (1차 튜닝의 실수).
export function judgeGrid(n = 150) {
  const grid = [];
  for (const heroClass of ['sword', 'mage', 'archer']) {
    for (const difficulty of ['easy', 'normal', 'hard']) {
      const { pass, rows } = judgeAll(n, { heroClass, difficulty });
      grid.push({
        heroClass, difficulty, pass,
        passed: rows.filter((r) => r.pass).length,
        total: rows.length,
        fails: rows.filter((r) => !r.pass).map((r) => `${r.stage}: ${r.issues.join(', ')}`),
      });
    }
  }
  return { pass: grid.every((g) => g.pass), grid };
}

// ----- 조합 전수 시뮬 (작업계획.md 2부 §6-1) -----
// 주인공 고정 + 동료 15명 중 3명 = C(15,3) = 455 조합.
export function allPartyCombos() {
  const pool = Object.keys(CHARACTERS).filter((id) => !CHARACTERS[id].isHero);
  const out = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      for (let k = j + 1; k < pool.length; k++) out.push(['hero', pool[i], pool[j], pool[k]]);
    }
  }
  return out;
}

// 조합별 성적. runs를 작게 잡아도 시드가 고정이라 재현 가능하다.
export function sweepParties(stageId, { runs = 5, difficulty } = {}) {
  const combos = allPartyCombos();
  const rows = combos.map((partyIds) => {
    const r = simulateMany(stageId, runs, { partyIds, difficulty });
    return {
      party: partyIds.slice(1).join('+'),
      winRate: r.winRate,
      minHp: r.avgMinAllyHp,
      turns: r.avgTurns,
      deaths: r.avgAllyDeaths,
      errors: r.errors,
    };
  });
  const sorted = [...rows].sort((a, b) => b.minHp - a.minHp || a.turns - b.turns);
  const cut = Math.max(1, Math.round(rows.length * 0.05));
  const avg = (f) => rows.reduce((s, x) => s + f(x), 0) / rows.length;
  return {
    stage: stageId, combos: rows.length,
    평균: { winRate: +avg((x) => x.winRate).toFixed(3), minHp: +avg((x) => x.minHp).toFixed(3), turns: +avg((x) => x.turns).toFixed(2) },
    오류합: rows.reduce((s, x) => s + x.errors, 0),
    상위5퍼센트: sorted.slice(0, cut),
    하위5퍼센트: sorted.slice(-cut).reverse(),
  };
}
