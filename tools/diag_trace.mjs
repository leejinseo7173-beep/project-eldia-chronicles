// 한 판 행동 추적 — 마법사 주인공 undead_squad
import * as L from '../src/battle/logic.js';
import * as AI from '../src/battle/ai.js';

const st = L.createBattleFromStage('undead_squad', { seed: 'trace-1', heroClass: 'mage' });
console.log('아군:', st.units.filter(u => u.side === 'ally').map(u => `${u.defId}(hp${u.stats.maxHp} atk${u.stats.atk} mag${u.stats.mag} def${u.stats.def})`).join(' '));
console.log('적:', st.units.filter(u => u.side === 'enemy').map(u => `${u.defId}(hp${u.stats.maxHp} def${u.stats.def})`).join(' '));
let guard = 0;
while (!st.winner && guard++ < 200 && st.turn <= 6) {
  for (const u of L.livingUnits(st, 'ally')) {
    if (st.winner || !u.alive || u.acted) continue;
    const a = AI.autoAction(st, u);
    if (a.type === 'skill') {
      const foes = () => Object.fromEntries(st.units.filter(x => x.side === 'enemy').map(x => [x.id, x.hp]));
      const before = foes();
      const events = L.executeSkill(st, u.id, a.skillId, a.targetId) ?? [];
      const after = foes();
      const dealt = Object.keys(before).map(k => before[k] - (after[k] ?? 0)).reduce((s, v) => s + v, 0);
      console.log(`T${st.turn} ${u.defId} → ${a.skillId} → ${a.targetId ?? '-'} 피해합 ${dealt}`);
    } else {
      console.log(`T${st.turn} ${u.defId} → ${a.type}`);
    }
    u.acted = true;
  }
  if (!st.winner) {
    L.endPlayerPhase(st);
    if (!st.winner) AI.enemyPhase(st);
    const allies = st.units.filter(u => u.side === 'ally').map(u => `${u.defId}:${u.alive ? u.hp : 'X'}`).join(' ');
    const foes = st.units.filter(u => u.side === 'enemy').map(u => `${u.defId.slice(0, 8)}:${u.alive ? u.hp : 'X'}`).join(' ');
    console.log(`  -- 적 페이즈 후 아군[${allies}] 적[${foes}]`);
  }
}
