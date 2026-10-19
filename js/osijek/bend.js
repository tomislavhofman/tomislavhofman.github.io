// The promenade is not straight: from where the viewer stands the bank bulges into the Drava,
// and towards the footbridge the path swings gently to the left, away from the river.
//
// The world is built in "straight" coordinates (x across the promenade, -z along it) and then
// bent: a straight point (x, y, z) lands at P(s) + x * N(s), where s = -z is the distance
// along the path, P(s) the bent centre line and N(s) its right-hand normal. Widths are kept,
// so every row of flower boxes, the kerbs, the embankment and the far bank follow the curve.
import * as THREE from '../vendor/three-0.170.0.module.min.js';

const TURN = 0.27;        // total left turn in radians (about 15 degrees)
const S0 = 18;            // the curve starts a little ahead of the viewer...
const S1 = 230;           // ...and is complete a bit past the bridge
const STEP = 1;
const S_MIN = -200;
const S_MAX = 3200;

export const heading = (s) => {
  const k = Math.min(1, Math.max(0, (s - S0) / (S1 - S0)));
  return TURN * k * k * (3 - 2 * k);
};

// Centre line, integrated once.
const N = Math.ceil((S_MAX - S_MIN) / STEP) + 1;
const PX = new Float32Array(N);
const PZ = new Float32Array(N);
for (let i = 1; i < N; i++) {
  const th = heading(S_MIN + (i - 0.5) * STEP);
  PX[i] = PX[i - 1] - Math.sin(th) * STEP;
  PZ[i] = PZ[i - 1] - Math.cos(th) * STEP;
}
const i0 = Math.round(-S_MIN / STEP);     // shift so that P(0) is the origin
const ox = PX[i0];
const oz = PZ[i0];

function centre(s) {
  const f = Math.min(N - 1.001, Math.max(0, (s - S_MIN) / STEP));
  const i = Math.floor(f);
  const t = f - i;
  return [PX[i] + (PX[i + 1] - PX[i]) * t - ox, PZ[i] + (PZ[i + 1] - PZ[i]) * t - oz];
}

// Straight coordinates -> world. Returns a new vector.
export function bend(p) {
  const s = -p.z;
  const th = heading(s);
  const [cx, cz] = centre(s);
  return new THREE.Vector3(cx + p.x * Math.cos(th), p.y, cz - p.x * Math.sin(th));
}

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _inv = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _inm = new THREE.Matrix3();

// Bends the vertices (and normals) of a static object in place.
export function bendGeometry(root) {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.geometry || o.isSprite || o.isInstancedMesh) return;
    const g = o.geometry;
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    _inv.copy(o.matrixWorld).invert();
    _nm.getNormalMatrix(o.matrixWorld);
    _inm.getNormalMatrix(_inv);
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const th = heading(-_v.z);
      const w = bend(_v);
      if (nor) {
        _n.fromBufferAttribute(nor, i).applyMatrix3(_nm).applyAxisAngle(THREE.Object3D.DEFAULT_UP, th).applyMatrix3(_inm).normalize();
        nor.setXYZ(i, _n.x, _n.y, _n.z);
      }
      w.applyMatrix4(_inv);
      pos.setXYZ(i, w.x, w.y, w.z);
    }
    pos.needsUpdate = true;
    if (nor) nor.needsUpdate = true;
    g.computeBoundingBox();
    g.computeBoundingSphere();
  });
}

// Moves an object rigidly to its bent place: same shape, turned with the path.
export function bendRigid(o, anchor = o.position) {
  const a = anchor.clone();
  const th = heading(-a.z);
  const m = new THREE.Matrix4().makeTranslation(-a.x, -a.y, -a.z)
    .premultiply(new THREE.Matrix4().makeRotationY(th))
    .premultiply(new THREE.Matrix4().makeTranslation(...bend(a).toArray()));
  o.updateMatrix();
  o.applyMatrix4(m);
}

// Instanced meshes: each instance is moved rigidly.
export function bendInstances(mesh) {
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    m.decompose(p, q, sc);
    const th = heading(-p.z);
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, th));
    m.compose(bend(p), q, sc);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}
