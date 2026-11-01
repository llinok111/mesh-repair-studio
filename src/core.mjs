// core.mjs — 仓库纯计算入口。纯 ES module，不 import three、不碰 DOM。
// 一个"破损三角网格"（顶点 + 三角索引）的焊接修复与容差 ε 退化扫描：
//   - 核心：按容差 ε 把距离 < ε 的顶点合并（union-find），空间哈希加速。
//   - 输出：每个 ε 的修复统计（uniqueVerts/边界/水密/欧拉/体积）。
//   - 浏览器拖动 ε 现场复算单点 = computeScan 里同一函数，双端位级一致。
import { spatialHashWeld, naiveWeld } from './core/weld.mjs';
import { clusterEdges, boundaryLoops, connectedComponents, signedVolume } from './core/topology.mjs';

// 对单个容差 ε 出全部修复统计。
// positions: Float64Array(3n), indices: Uint32Array(3m), eps: number
export function repairMetrics(positions, indices, eps) {
  const n = positions.length / 3;
  const weld = spatialHashWeld(positions, eps);
  let unique = 0;
  for (let i = 0; i < n; i++) if (weld[i] === i) unique++;
  // uniqueVerts = 聚类数 = 焊后独顶点数
  const seen = new Set();
  for (let i = 0; i < n; i++) seen.add(weld[i]);
  unique = seen.size;
  const { boundaryEdges } = clusterEdges(unique, indices, weld);
  const loops = boundaryLoops(unique, clusterEdges(unique, indices, weld).used);
  const comps = connectedComponents(unique, indices, weld);
  // 欧拉特征：V - E + F。F = 三角数(m)。V 用焊后独顶点 unique。E 用焊接后去重边数。
  const used = clusterEdges(unique, indices, weld).used;
  const nEdges = used.size;
  const nTri = indices.length / 3;
  const euler = unique - nEdges + nTri;
  const absVol = Math.abs(signedVolume(positions, indices));
  return {
    eps,
    verticesIn: n,
    uniqueVerts: unique,
    weldedAway: n - unique,
    boundaryEdges,
    loops,
    watertight: boundaryEdges === 0,
    connectedComponents: comps,
    euler,
    absVolume: absVol,
  };
}

// 一组容差 ε 的扫描曲线（浏览器拖动 ε 现场复算，与这段数组位级一致）。
export function computeScan(positions, indices, epsSet) {
  return epsSet.map((eps) => repairMetrics(positions, indices, eps));
}

// 验证正确性：两种焊接算法输出逐位一致。
export function weldAgree(positions, eps) {
  const a = spatialHashWeld(positions, eps);
  const b = naiveWeld(positions, eps);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export { spatialHashWeld, naiveWeld };