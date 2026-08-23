// ============================================================
// judge_grid.mjs — 주인공 3직업 × 난이도 3단계 = 9칸 격자 판정
// 실행: node tools/judge_grid.mjs [판수]   (기본 150판/스테이지)
// 밸런스 판정의 기본 도구 — 한 칸만 보고 합격 선언 금지 (적킷_설계보관.md)
// ============================================================

import { judgeGrid } from '../src/battle/simulator.js';

const n = Number(process.argv[2]) || 150;
console.log(`9칸 격자 판정 — 스테이지당 ${n}판\n`);
const t0 = Date.now();
const { pass, grid } = judgeGrid(n);

let cur = '';
for (const g of grid) {
  if (g.heroClass !== cur) {
    cur = g.heroClass;
    console.log(`\n== 주인공 ${cur} ==`);
  }
  const mark = g.pass ? 'PASS' : 'FAIL';
  console.log(`  [${g.difficulty.padEnd(6)}] ${g.passed}/${g.total} ${mark}`);
  for (const f of g.fails) console.log(`      - ${f}`);
}
console.log(`\n총평: ${pass ? '전 칸 합격' : '불합격 칸 존재'} (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
process.exit(pass ? 0 : 1);
