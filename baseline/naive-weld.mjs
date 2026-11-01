// baseline/naive-weld.mjs — 对照基线：朴素全对偶 O(n^2) 顶点焊接。
// 与 bench/bench.mjs 内联的 naiveWeld 同源，供独立运行复现"慢基线"。
// 用法：node baseline/naive-weld.mjs
import { makeDamagedTorus } from '../src/core/gen.mjs';
import { naiveWeld } from '../src/core.mjs';

const { positions, indices, meta } = makeDamagedTorus({ Nu: 220, Nv: 110, splitP: 0.12, seed: 0xC0FFEE });
const eps = meta.maxSplitDist * 1.5 + 0.001;
const t0 = process.hrtime.bigint();
const out = naiveWeld(positions, eps);
const t1 = process.hrtime.bigint();
const ms = Number(t1 - t0) / 1e6;
const nCopies = meta.nCopies;
const welded = meta.total - new Set(out).size;
console.log(JSON.stringify({ naive_ms: ms, vertices: meta.total, weldedWeeded: welded }, null, 2));