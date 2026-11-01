// weld.mjs — 顶点焊接：union-find + 空间哈希 vs 朴素全对偶。
// 输入 positions = Float64Array(3n)。输出 Uint32Array(n)：
//   值 = 该顶点所属聚类，聚类 id 在 0..k-1 连续（i 号顶点的代表 = 首次出现的该类成员）。
export class DSU {
  constructor(n) { this.p = new Int32Array(n); for (let i = 0; i < n; i++) this.p[i] = i; }
  find(x) { let r = x; while (this.p[r] !== r) r = this.p[r]; while (this.p[x] !== r) { const y = this.p[x]; this.p[x] = r; x = y; } return r; }
  union(a, b) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.p[rb] = ra; }
}

function d2(px, py, pz, qx, qy, qz) {
  const dx = px - qx, dy = py - qy, dz = pz - qz;
  return dx * dx + dy * dy + dz * dz;
}

// 输入 dsu 已 union 完(连通分量定形)。输出 Uint32Array(n)：w[i] = 顶点 i 所属聚类 id。
// 聚类 id 与该类的"最小下标成员"绑定：无论 union 树怎么长，输出都逐位一致。
function finish(dsu, n) {
  const rootMin = new Map(); // root -> 该 root 类内的最小原下标
  for (let i = n - 1; i >= 0; i--) {
    const r = dsu.find(i);
    rootMin.set(r, i); // 倒序遍历，最终存的是每个 root 的最小成员
  }
  const idOf = new Map();
  let k = 0;
  // 按"最小成员"升序分配 id，保证分配顺序稳定
  const roots = [...rootMin.entries()].sort((a, b) => a[1] - b[1]);
  for (const [r] of roots) idOf.set(r, k++);
  return new Uint32Array(n).map((_, i) => idOf.get(dsu.find(i)));
}

export function spatialHashWeld(positions, eps) {
  const n = positions.length / 3;
  const dsu = new DSU(n);
  const cell = new Map(); // key -> array of vertex ids in that cell
  const e2 = eps * eps;
  const keyOf = (x, y, z) => (((x * 73856093) ^ (y * 19349663)) ^ (z * 83492791));
  // 入桶：每个顶点放进它的 cell
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(positions[3 * i] / eps);
    const cy = Math.floor(positions[3 * i + 1] / eps);
    const cz = Math.floor(positions[3 * i + 2] / eps);
    const k = keyOf(cx, cy, cz);
    const arr = cell.get(k);
    if (arr) arr.push(i); else cell.set(k, [i]);
  }
  // 对每个顶点，查它自身及 26 邻格，跟所有邻点做距离测试（union 幂等，结果与朴素同闭包）
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(positions[3 * i] / eps);
    const cy = Math.floor(positions[3 * i + 1] / eps);
    const cz = Math.floor(positions[3 * i + 2] / eps);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const jarr = cell.get(keyOf(cx + dx, cy + dy, cz + dz));
          if (!jarr) continue;
          for (let a = 0; a < jarr.length; a++) {
            const j = jarr[a];
            if (j <= i) continue; // 只测一次有序对
            if (d2(positions[3 * i], positions[3 * i + 1], positions[3 * i + 2],
                  positions[3 * j], positions[3 * j + 1], positions[3 * j + 2]) < e2)
              dsu.union(i, j);
          }
        }
  }
  return finish(dsu, n);
}

// 朴素全对偶 O(n^2)：仅做复杂度对照，输出必须与 spatialHash 逐位一致。
export function naiveWeld(positions, eps) {
  const n = positions.length / 3;
  const dsu = new DSU(n);
  const e2 = eps * eps;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (d2(positions[3 * i], positions[3 * i + 1], positions[3 * i + 2],
            positions[3 * j], positions[3 * j + 1], positions[3 * j + 2]) < e2)
        dsu.union(i, j);
  return finish(dsu, n);
}

export default { spatialHashWeld, naiveWeld, DSU };