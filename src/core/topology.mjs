import { DSU } from './weld.mjs';
// topology.mjs — 对一个"已焊接"的磨损网格做拓扑统计，全部纯数组/Map 运算。
// 焊接结果 weld：Uint32Array(n)，i → 聚类 id（0..uniqueVerts-1）。
// indices：Uint32Array(3m)，原始三角索引（仍引用原顶点 i，先焊到聚类 id 再用）。

// 返回 { used, boundaryEdges }：used = Map(edgeKey→次数)，boundaryEdges = 单边数。
export function clusterEdges(uniqueVerts, indices, weld) {
  const key = new Map(); // a*nV+b (a<b, irreducible)
  const nV = uniqueVerts;
  const used = new Map();
  for (let t = 0; t < indices.length / 3; t++) {
    const w0 = weld[indices[3 * t]], w1 = weld[indices[3 * t + 1]], w2 = weld[indices[3 * t + 2]];
    const e = (u, v) => (u < v ? u * nV + v : v * nV + u);
    for (const [u, v] of [[w0, w1], [w1, w2], [w2, w0]]) {
      const k = e(u, v);
      used.set(k, (used.get(k) || 0) + 1);
    }
  }
  let boundaryEdges = 0;
  for (const c of used.values()) if (c === 1) boundaryEdges++;
  return { used, boundaryEdges };
}

// 边界环数：沿单条边界边行走（每个顶点度 2 的边界连通段），用量子并行 walk。
export function boundaryLoops(uniqueVerts, used) {
  const nV = uniqueVerts;
  const adj = new Map(); // v -> array of neighbor v on boundary edges
  for (const [k] of used) {
    if (used.get(k) !== 1) continue;
    const a = Math.floor(k / nV), b = k % nV;
    (adj.get(a) || adj.set(a, []).get(a)).push(b);
    (adj.get(b) || adj.set(b, []).get(b)).push(a);
  }
  const seen = new Set();
  let loops = 0;
  for (const v0 of adj.keys()) {
    if (seen.has(v0)) continue;
    // start walk from v0 along any neighbor
    let cur = v0, prev = -1;
    seen.add(v0); loops++;
    for (let guard = 0; guard < 1e7; guard++) {
      const nbrs = adj.get(cur);
      let next = -1;
      for (const w of nbrs) if (w !== prev) { next = w; break; }
      if (next === -1 || next === v0 || seen.has(next)) break;
      seen.add(next); prev = cur; cur = next;
    }
  }
  return loops;
}

// 连通分量数（焊接后点集上，用三角连接）。
export function connectedComponents(uniqueVerts, indices, weld) {
  const nV = uniqueVerts;
  const dsu = new DSU(nV);
  for (let t = 0; t < indices.length / 3; t++) {
    const a = weld[indices[3 * t]], b = weld[indices[3 * t + 1]], c = weld[indices[3 * t + 2]];
    dsu.union(a, b); dsu.union(b, c);
  }
  let comps = 0;
  for (let i = 0; i < nV; i++) if (dsu.find(i) === i) comps++;
  return comps;
}

// 散度定理绝对体积。
export function signedVolume(positions, indices) {
  let vol = 0;
  for (let t = 0; t < indices.length / 3; t++) {
    const a = 3 * indices[3 * t], b = 3 * indices[3 * t + 1], c = 3 * indices[3 * t + 2];
    const x1 = positions[a], y1 = positions[a + 1], z1 = positions[a + 2];
    const x2 = positions[b], y2 = positions[b + 1], z2 = positions[b + 2];
    const x3 = positions[c], y3 = positions[c + 1], z3 = positions[c + 2];
    vol += (x1 * (y2 * z3 - z2 * y3) - y1 * (x2 * z3 - z2 * x3) + z1 * (x2 * y3 - y2 * x3));
  }
  return vol / 6;
}

export default { clusterEdges, boundaryLoops, connectedComponents, signedVolume };