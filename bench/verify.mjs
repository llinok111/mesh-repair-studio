// bench/verify.mjs — 行为断言。对 data/damaged-mesh.json 跑一遍修复扫描，断言具体数字。
// 全过 process.exit(0)，否则 exit(1)。
import { readFileSync } from 'node:fs';
import { makeDamagedTorus } from '../src/core/gen.mjs';
import { repairMetrics, computeScan, weldAgree } from '../src/core.mjs';

let fails = 0;
function check(name, cond, detail) {
  if (cond) { console.log(`PASS ${name} :: ${detail}`); }
  else { console.log(`FAIL ${name} :: ${detail}`); fails++; }
}

// 确定性：重跑能复现
const g1 = makeDamagedTorus({ Nu: 72, Nv: 36, splitP: 0.12, seed: 0xC0FFEE });
const g2 = makeDamagedTorus({ Nu: 72, Nv: 36, splitP: 0.12, seed: 0xC0FFEE });
let det = true;
for (let i = 0; i < g1.positions.length; i++) if (g1.positions[i] !== g2.positions[i]) det = false;
for (let i = 0; i < g1.indices.length; i++) if (g1.indices[i] !== g2.indices[i]) det = false;
check('deterministic-gen', det, '两跑字节一致');

// 用样例数据文件
const raw = JSON.parse(readFileSync('data/damaged-mesh.json', 'utf8'));
const pos = new Float64Array(raw.positions);
const idx = new Uint32Array(raw.indices);
const nCopies = raw.meta.nCopies;
const maxSplitDist = raw.meta.maxSplitDist;

// 小 ε（0.001）：几乎不焊，非水密、边界大量
const rTiny = repairMetrics(pos, idx, 0.001);
check('tiny-eps-not-watertight', rTiny.boundaryEdges > 0 && !rTiny.watertight,
  `boundaryEdges=${rTiny.boundaryEdges}`);
check('tiny-eps-no-weld', rTiny.weldedAway === 0, `weldedAway=${rTiny.weldedAway}`);

// 大 ε（> maxSplitDist * 1.5）：全部副本焊回，水密、欧拉=0（单孔环面）
const epsRepair = maxSplitDist * 1.5 + 0.001;
const rRepair = repairMetrics(pos, idx, epsRepair);
check('repair-welds-all', rRepair.weldedAway === nCopies,
  `weldedAway=${rRepair.weldedAway} (expect ${nCopies})`);
check('repair-watertight', rRepair.watertight && rRepair.boundaryEdges === 0,
  `boundaryEdges=${rRepair.boundaryEdges}`);
check('repair-euler-torus', rRepair.euler === 0, `euler=${rRepair.euler} (V-E+F, 单孔环面应为 0)`);
check('repair-connected', rRepair.connectedComponents === 1, `${rRepair.connectedComponents}`);

// 两种焊接算法位级一致
check('weldAgree', weldAgree(pos, 0.001) && weldAgree(pos, epsRepair), 'spatialHash == naive');

// 扫描单调：ε 增大 → uniqueVerts 单调不增
const scan = computeScan(pos, idx, [0.001, 0.005, 0.01, 0.02, epsRepair]);
let mono = true;
for (let i = 1; i < scan.length; i++) if (scan[i].uniqueVerts > scan[i - 1].uniqueVerts) mono = false;
check('scan-monotone', mono, scan.map((s) => s.uniqueVerts).join(','));

// 体积恒定（焊接不改变顶点坐标，只改索引→体积按原始三角算，恒定）
const vols = new Set(scan.map((s) => s.absVolume.toFixed(10)));
check('volume-invariant', vols.size === 1, `absVolume=${scan[0].absVolume.toFixed(6)}`);

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);