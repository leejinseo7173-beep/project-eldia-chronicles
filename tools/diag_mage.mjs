// 진단: 마법사·궁수 주인공이 왜 무너지는가 — 사망자·스킬 사용·피해 기여 집계
import * as L from '../src/battle/logic.js';
import * as AI from '../src/battle/ai.js';

function diag(stageId, heroClass, n = 100) {
  const deaths = {};
  const skillUse = {};
  const dmgBy = {};
  let turns = 0;
  for (let i = 0; i < n; i++) {
    const st = L.createBattleFromStage(stageId, { seed: `diag-${i}`, heroClass });
    let guard = 0;
    while (!st.winner && guard++ < 600) {
      for (const u of L.livingUnits(st, 'ally')) {
        if (st.winner || !u.alive || u.acted) continue;
        const a = AI.autoAction(st, u);
        if (a.type === 'skill') {
          const key = `${u.defId}:${a.skillId}`;
          skillUse[key] = (skillUse[key] ?? 0) + 1;
          const before = st.units.filter((x) => x.side === 'enemy').reduce((s, x) => s + x.hp, 0);
          L.executeSkill(st, u.id, a.skillId, a.targetId);
          const after = st.units.filter((x) => x.side === 'enemy').reduce((s, x) => s + x.hp, 0);
          dmgBy[u.defId] = (dmgBy[u.defId] ?? 0) + (before - after);
        }
        u.acted = true;
      }
      if (!st.winner) {
        L.endPlayerPhase(st);
        if (!st.winner) AI.enemyPhase(st);
      }
      if (st.turn > 60) break;
    }
    turns += st.turn;
    for (const u of st.units) {
      if (u.side === 'ally' && !u.alive) deaths[u.defId] = (deaths[u.defId] ?? 0) + 1;
    }
  }
  console.log(`\n=== ${stageId} / ${heroClass} — 평균 ${(turns / n).toFixed(2)}턴 (${n}판)`);
  console.log('사망률:', Object.entries(deaths).map(([k, v]) => `${k} ${(v / n * 100).toFixed(0)}%`).join('  ') || '없음');
  console.log('스킬 사용(판당):');
  for (const [k, v] of Object.entries(skillUse).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`  ${k}: ${(v / n).toFixed(2)}`);
  }
  console.log('총피해 기여(판당):', Object.entries(dmgBy).map(([k, v]) => `${k} ${(v / n).toFixed(0)}`).join('  '));
}

diag('undead_squad', 'sword');
diag('undead_squad', 'mage');
diag('wraith_commander', 'archer');
diag('wraith_commander', 'sword');
