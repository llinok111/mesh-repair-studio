// main.js — 渲染与交互。只消费 src/core.mjs 的输出，不重算核心逻辑。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { repairMetrics, spatialHashWeld } from './src/core.mjs';

// 组装一个按当前观测的"焊后渲染网格"：把每个顶点的位置换成聚类代表位置，
// 去重退化的三角（角落并到同一顶点时塌成点/边，剔除）。
function buildWeldGeometry(positions, indices, eps) {
  const n = positions.length / 3;
  const weld = spatialHashWeld(positions, eps);
  // 聚类代表位置
  const repPos = new Float64Array(n * 3);
  const repSeen = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = weld[i];
    if (!repSeen[r]) { repSeen[r] = 1; repPos[3 * r] = positions[3 * i]; repPos[3 * r + 1] = positions[3 * i + 1]; repPos[3 * r + 2] = positions[3 * i + 2]; }
  }
  // 三角索引映射到聚类 id
  const T = indices.length / 3;
  const faceSet = new Set();
  const faceList = [];
  for (let t = 0; t < T; t++) {
    let a = weld[indices[3 * t]], b = weld[indices[3 * t + 1]], c = weld[indices[3 * t + 2]];
    if (a === b || b === c || a === c) continue; // 退化
    const key = [a, b, c].sort((x, y) => x - y).join(',');
    if (faceSet.has(key)) continue;
    faceSet.add(key);
    faceList.push(a, b, c);
  }
  return { positions: Float32Array.from(repPos.slice(0, n * 3)), indices: faceList };
}

// 双端一致判定：现场复算的 uniqueVerts 是否等于 node 烘焙的 reference-scan 对应行。
let refScan = [];

const panel = {
  epsVal: document.getElementById('epsVal'),
  verts: document.getElementById('verts'),
  welded: document.getElementById('welded'),
  bEdges: document.getElementById('bEdges'),
  watertight: document.getElementById('watertight'),
  euler: document.getElementById('euler'),
  badge: document.getElementById('badge'),
  chart: document.getElementById('chart'),
};

const eps = [0.001, 0.003, 0.005, 0.007, 0.009, 0.011];

let geo, points, boundaryLines;

function rebuild(epsv) {
  const { positions, indices } = current;
  const eg = buildWeldGeometry(positions, indices, epsv);
  if (geo) { scene.remove(geo); geo.geometry.dispose(); }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.BufferAttribute(eg.positions, 3));
  gg.setIndex(eg.indices);
  gg.computeVertexNormals();
  geo = new THREE.Mesh(gg, mat);
  scene.add(geo);
  label.textContent = `焊接后面数：${eg.indices.length / 3}（ε=${epsv.toFixed(4)}）`;
}

function updatePanel(metrics) {
  panel.epsVal.textContent = metrics.eps.toFixed(4);
  panel.verts.textContent = `${metrics.verticesIn} / ${metrics.uniqueVerts}`;
  panel.welded.textContent = metrics.weldedAway;
  panel.bEdges.textContent = metrics.boundaryEdges;
  panel.watertight.textContent = metrics.watertight ? '是' : '否';
  panel.euler.textContent = metrics.euler;
  // 双端一致：与 node 烘焙的参考行逐字段比对（不只是 uniqueVerts）
  const ref = refScan.findLast((r) => r.eps <= metrics.eps + 1e-9);
  const same = ref && ref.uniqueVerts === metrics.uniqueVerts &&
    ref.weldedAway === metrics.weldedAway &&
    ref.boundaryEdges === metrics.boundaryEdges &&
    ref.euler === metrics.euler &&
    ref.watertight === metrics.watertight;
  panel.badge.textContent = same
    ? `✓ 与 node 逐字段一致（4 项）`
    : `✗ 与 node 不一致　(实 ${metrics.uniqueVerts}/${metrics.boundaryEdges}/${metrics.euler} vs 参 ${ref ? `${ref.uniqueVerts}/${ref.boundaryEdges}/${ref.euler}` : '?'})`;
  panel.badge.className = same ? 'ok' : 'no';
  // 曲线
  drawChart(metrics);
}

function drawChart(metrics) {
  panel.chart.innerHTML = '';
  const all = refScan;
  const max = Math.max(...all.map((r) => r.uniqueVerts));
  for (const r of all) {
    const cur = r.eps === metrics.eps;
    const div = document.createElement('div');
    div.className = 'bar';
    const lab = document.createElement('span');
    lab.className = 'lab';
    lab.textContent = r.eps.toFixed(3);
    const fill = document.createElement('span');
    fill.className = 'fill';
    fill.style.width = `${(r.uniqueVerts / max) * 160}px`;
    if (cur) fill.style.background = '#e0650e';
    const num = document.createElement('span');
    num.textContent = r.uniqueVerts;
    div.append(lab, fill, num);
    panel.chart.appendChild(div);
  }
}

function sliderEps() {
  const s = Number(document.getElementById('epsSlider').value);
  return eps[s] ?? eps[eps.length - 1];
}

let current; // loaded dataset

async function main() {
  const raw = await (await fetch('data/damaged-mesh.json')).json();
  const positions = new Float64Array(raw.positions);
  const indices = new Uint32Array(raw.indices);
  current = { positions, indices };
  refScan = (await (await fetch('data/reference-scan.json')).json()).rows;
  renderSetup();
  document.getElementById('epsSlider').addEventListener('input', onSlide);
  onSlide();
}

// --- three.js ---
let viewer, scene, camera, renderer, controls, mat, label;
function renderSetup() {
  viewer = document.getElementById('viewer');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  camera = new THREE.PerspectiveCamera(50, viewer.clientWidth / viewer.clientHeight, 0.01, 100);
  camera.position.set(0, 0, 7);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(viewer.clientWidth, viewer.clientHeight);
  viewer.appendChild(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dl = new THREE.DirectionalLight(0xffffff, 0.9); dl.position.set(5, 10, 7); scene.add(dl);
  mat = new THREE.MeshStandardMaterial({ color: 0x8fb8e0, side: THREE.DoubleSide, flatShading: true });
  label = document.createElement('div');
  label.style.cssText = 'position:absolute;left:12px;top:10px;background:rgba(0,0,0,.55);color:#fff;padding:4px 10px;border-radius:6px;font:12px monospace;';
  viewer.appendChild(label);
  const tick = () => { requestAnimationFrame(tick); controls.update(); renderer.render(scene, camera); };
  tick();
}

function onSlide() {
  const epsv = sliderEps();
  const metrics = repairMetrics(current.positions, current.indices, epsv);
  rebuild(epsv);
  updatePanel(metrics);
}

main().catch((e) => { console.error(e); panel.badge.textContent = '加载失败：' + e.message; panel.badge.className = 'no'; });