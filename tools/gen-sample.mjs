// tools/gen-sample.mjs — 用 core/gen.mjs 生成“破损环面网格”data/damaged-mesh.json
// 及用于浏览器现场复算比对的 data/reference-scan.json。
// 固定种子，同一条命令跑两次产物字节完全一致。
import { writeFileSync, mkdirSync } from 'node:fs';
import { makeDamagedTorus } from '../src/core/gen.mjs';
import { repairMetrics } from '../src/core.mjs';

const { positions, indices, meta } = makeDamagedTorus({ Nu: 72, Nv: 36, splitP: 0.12, seed: 0xC0FFEE });

mkdirSync('data', { recursive: true });
writeFileSync('data/damaged-mesh.json', JSON.stringify({
  meta: { genus: 'torus', ...meta, seed: '0xC0FFEE', gen: 'torus-vertex-split' },
  positions: Array.from(positions),
  indices: Array.from(indices),
}));

// 烘焙 node 侧扫描结果（浏览器现场复算必须与其逐位一致）
const epsSet = [0.001, 0.003, 0.005, 0.007, 0.009, 0.011, meta.maxSplitDist * 1.5 + 0.001];
const scan = epsSet.map((eps) => {
  const m = repairMetrics(positions, indices, eps);
  return { eps, uniqueVerts: m.uniqueVerts, weldedAway: m.weldedAway, boundaryEdges: m.boundaryEdges, watertight: m.watertight, euler: m.euler };
});
writeFileSync('data/reference-scan.json', JSON.stringify({ rows: scan }));
console.log(JSON.stringify({ meta, scan: scan.map((r) => r.uniqueVerts) }, null, 2));