// core/gen.mjs — 确定性"破损环面"生成（纯函数，无副作用）。
// 同时被 tools/gen-sample.mjs（写小样例数据）与 bench/bench.mjs（造大网格计时）复用。
// 破损 = 顶点分裂：把 selected 顶点的部分三角角引到 <MAX_SPLIT 距离的副本顶点。

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeDamagedTorus({ Nu, Nv, R = 2.0, r = 0.8, splitP = 0.12, seed = 0xC0FFEE }) {
  const rand = mulberry32(seed);
  const n = Nu * Nv;
  const pos = new Float64Array(n * 3);
  for (let u = 0; u < Nu; u++) {
    const theta = (u / Nu) * Math.PI * 2;
    for (let v = 0; v < Nv; v++) {
      const phi = (v / Nv) * Math.PI * 2;
      const i = u * Nv + v;
      pos[3 * i] = (R + r * Math.cos(phi)) * Math.cos(theta);
      pos[3 * i + 1] = (R + r * Math.cos(phi)) * Math.sin(theta);
      pos[3 * i + 2] = r * Math.sin(phi);
    }
  }
  const vertAt = (u, v) => u * Nv + v;
  const tris = [];
  for (let u = 0; u < Nu; u++) {
    const u2 = (u + 1) % Nu;
    for (let v = 0; v < Nv; v++) {
      const v2 = (v + 1) % Nv;
      const a = vertAt(u, v), b = vertAt(u, v2), c = vertAt(u2, v), d = vertAt(u2, v2);
      tris.push([a, b, c], [b, d, c]);
    }
  }
  const T = tris.length;
  const shuffle = [];
  for (let i = 0; i < T; i++) shuffle.push(i);
  for (let i = T - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [shuffle[i], shuffle[j]] = [shuffle[j], shuffle[i]]; }
  const trisShuf = shuffle.map((k) => tris[k]);

  // 顶点分裂
  const incidents = new Map();
  for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) {
    const v = trisShuf[t][k];
    if (!incidents.has(v)) incidents.set(v, []);
    incidents.get(v).push(t * 3 + k);
  }
  const assignment = new Map(); // corner -> vertex id
  const dupOrigin = [];          // 每个副本的原顶点
  let extra = 0;
  for (let v = 0; v < n; v++) {
    if (rand() >= splitP) continue;
    const corners = incidents.get(v);
    if (!corners) continue;
    const nc = corners.filter(() => rand() < 0.5);
    if (nc.length === 0) continue;
    const dup = n + extra;
    extra++;
    dupOrigin.push(v);
    for (const cc of nc) assignment.set(cc, dup);
  }
  // 副本坐标：球内方向 + 半径 [MINBAND, MAX_SPLIT]。
  // 下限 MINBAND 保证副本与原点距离恒 > 0.001（"tiny ε 不焊"断言成立）；
  // 上限 MAX_SPLIT 小于最细网格固有顶点间距，修复 ε 不会误伤真邻居。
  const MINBAND = 0.002, MAX_SPLIT = 0.008;
  const extraPos = new Float64Array(extra * 3);
  for (let e = 0; e < extra; e++) {
    const v = dupOrigin[e];
    let x = rand() * 2 - 1, y = rand() * 2 - 1, z = rand() * 2 - 1;
    let len = Math.sqrt(x * x + y * y + z * z) || 1;
    const rad = MINBAND + rand() * (MAX_SPLIT - MINBAND);
    x = (x / len) * rad; y = (y / len) * rad; z = (z / len) * rad;
    extraPos[3 * e] = pos[3 * v] + x;
    extraPos[3 * e + 1] = pos[3 * v + 1] + y;
    extraPos[3 * e + 2] = pos[3 * v + 2] + z;
  }
  const total = n + extra;
  const posFinal = new Float64Array(total * 3);
  posFinal.set(pos, 0);
  for (let e = 0; e < extra; e++) posFinal[3 * (n + e)] = extraPos[3 * e], posFinal[3 * (n + e) + 1] = extraPos[3 * e + 1], posFinal[3 * (n + e) + 2] = extraPos[3 * e + 2];
  const idxFinal = new Uint32Array(T * 3);
  for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) {
    const key = t * 3 + k;
    const mapped = assignment.get(key);
    idxFinal[t * 3 + k] = mapped !== undefined ? mapped : trisShuf[t][k];
  }
  // 实际最大分裂距离
  let maxSplitDist = 0;
  for (let e = 0; e < extra; e++) {
    const dx = extraPos[3 * e] - pos[3 * dupOrigin[e]];
    const dy = extraPos[3 * e + 1] - pos[3 * dupOrigin[e] + 1];
    const dz = extraPos[3 * e + 2] - pos[3 * dupOrigin[e] + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > maxSplitDist) maxSplitDist = d;
  }
  return { positions: posFinal, indices: idxFinal, meta: { nOrig: n, nCopies: extra, total, tris: T, maxSplitDist } };
}

export default { makeDamagedTorus, mulberry32 };