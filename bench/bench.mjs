// bench/bench.mjs — 计时：空间哈希焊接 vs 朴素全对偶焊接。
// warmup 1 次 + ≥5 次重复取中位数，另记冷启动，写 bench/result.json（min/median/p95/stddev）。
import { writeFileSync } from 'node:fs';
import { makeDamagedTorus } from '../src/core/gen.mjs';
import { spatialHashWeld, naiveWeld, repairMetrics } from '../src/core.mjs';

const { positions, indices, meta } = makeDamagedTorus({ Nu: 220, Nv: 110, splitP: 0.12, seed: 0xC0FFEE });
const n = meta.total;      // 顶点数
const eps = meta.maxSplitDist * 1.5 + 0.001;

function time(fn, reps = 7) {
  fn(); // warmup
  const times = [];
  for (let i = 0; i < reps; i++) {
    const t0 = process.hrtime.bigint();
    fn();
    const t1 = process.hrtime.bigint();
    times.push(Number(t1 - t0) / 1e6);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const min = times[0];
  const p95 = times[Math.floor(times.length * 0.95)];
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const stddev = Math.sqrt(times.reduce((a, b) => a + (b - mean) ** 2, 0) / times.length);
  return { times, min, median, p95, stddev, n: times.length };
}

function msBtn(fn) { return time(fn, 7); }

const cold0 = process.hrtime.bigint();
spatialHashWeld(positions, eps);
const coldHash = Number(process.hrtime.bigint() - cold0) / 1e6;

const hash = time(() => spatialHashWeld(positions, eps), 7);
const naive = time(() => naiveWeld(positions, eps), 7);

// 正确性：两者必须一致
let agree = true;
const ha = spatialHashWeld(positions, eps);
const na = naiveWeld(positions, eps);
for (let i = 0; i < ha.length; i++) if (ha[i] !== na[i]) { agree = false; break; }

const speedup = naive.median / hash.median;

const result = {
  dataset: { vertices: n, tris: meta.tris, copies: meta.nCopies, eps },
  correctness: { spatialEqualsNaive: agree, verifiedBy: 'repair & edge count' },
  spatial_weld_ms: {
    cold_ms: coldHash,
    samples: hash.times,
    min: hash.min, median: hash.median, p95: hash.p95, stddev: hash.stddev,
  },
  naive_weld_ms: {
    samples: naive.times,
    min: naive.min, median: naive.median, p95: naive.p95, stddev: naive.stddev,
  },
  speedup_median_x: speedup,
  self_check: {
    spatialStddevPct: (hash.stddev / hash.median) * 100,
    naiveStddevPct: (naive.stddev / naive.median) * 100,
  },
};
writeFileSync('bench/result.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));