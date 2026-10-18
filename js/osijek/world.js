// The Osijek riverside scene: the Drava promenade (Šetalište kardinala Franje Šepera) seen
// by a pedestrian, with the suspension footbridge, the park, the city skyline and the
// cathedral spire. Units are metres; +x is towards the river, -z is upstream.
import * as THREE from '../vendor/three-0.170.0.module.min.js';

export const WATER_Y = -2.6;
const BRIDGE_Z = -140;
const PYLON_A = 10;     // city-side pylon x
const PYLON_B = 172;    // far-side pylon x
const PYLON_H = 35;

/* ---------------- helpers ---------------- */

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const toonRamp = (() => {
  const t = new THREE.DataTexture(new Uint8Array([60, 125, 190, 255]), 4, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

const matCache = new Map();
export function toon(color, opts = {}) {
  const { unique, ...rest } = opts;
  const key = color + JSON.stringify(rest);
  if (!unique && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp, ...rest });
  if (!unique) matCache.set(key, m);
  return m;
}

// Bakes every plain toon mesh under `group` into one vertex-coloured mesh (fewer draw calls).
// Meshes flagged userData.keep (animated or emissive parts) are left alone.
const bakedMaterials = new Map();
export function bake(group, emissive = null) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const pos = [];
  const nor = [];
  const col = [];
  const gone = [];
  group.traverse((o) => {
    if (!o.isMesh || o.userData.keep || !o.material.isMeshToonMaterial || o.material.emissiveIntensity !== 1 || o.material.map) return;
    if (o.parent !== group && o.parent.userData.keep) return;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const c = o.material.color;
    const n = g.attributes.position.count;
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    for (let i = 0; i < n; i++) col.push(c.r, c.g, c.b);
    gone.push(o);
  });
  if (!gone.length) return null;
  gone.forEach((o) => o.parent.remove(o));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const key = emissive || 'none';
  if (!bakedMaterials.has(key)) {
    bakedMaterials.set(key, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp, emissive: new THREE.Color(emissive || '#000000') }));
  }
  const mesh = new THREE.Mesh(geo, bakedMaterials.get(key));
  group.add(mesh);
  return mesh;
}

function box(w, h, d, color, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function onLayer1(obj) {
  obj.traverse((o) => o.layers.set(1));
  return obj;
}

/* ---------------- water ---------------- */

const WATER_VERT = /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 vRefl;
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vRefl = textureMatrix * w;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const WATER_FRAG = /* glsl */ `
uniform sampler2D tReflect;
uniform float time;
uniform vec3 deep;
uniform vec3 shallow;
uniform vec3 glint;
uniform float glintAmount;
uniform vec3 sunDir;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying vec4 vRefl;
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float dist = length(vWorld - cameraPosition);
  // Ripples: horizontal bands that slide, stronger close to the viewer.
  float band = floor(vWorld.z * 0.9 + sin(vWorld.x * 0.07 + time * 0.6) * 1.5);
  float wob = (hash(vec2(band, floor(time * 3.0))) - 0.5) * 0.012 * (1.0 - smoothstep(20.0, 260.0, dist));
  vec2 uv = vRefl.xy / vRefl.w + vec2(wob, wob * 0.4);
  vec3 refl = texture2D(tReflect, uv).rgb;
  float graze = smoothstep(0.0, 1.0, 1.0 - abs(normalize(cameraPosition - vWorld).y));
  float near = smoothstep(4.0, 40.0, vWorld.x);
  vec3 base = mix(shallow, deep, near);
  vec3 col = mix(base, refl * mix(vec3(1.0), base * 2.2, 0.35), 0.18 + 0.4 * graze);
  // Glints: sparse bright pixels that blink on a slow beat.
  vec2 cell = floor(vWorld.xz * vec2(0.6, 0.25));
  vec3 view = normalize(vWorld - cameraPosition);
  float path = pow(max(dot(reflect(view, vec3(0.0, 1.0, 0.0)), sunDir), 0.0), 60.0);
  float g = step(0.985 - 0.33 * path, hash(cell + floor(time * 1.5)));
  col = mix(col, glint * 0.85, path * 0.35 * glintAmount);
  col += glint * g * glintAmount * (0.35 + 0.65 * graze);
  float f = smoothstep(fogNear, fogFar, dist);
  gl_FragColor = vec4(mix(col, fogColor, f), 1.0);
}
`;

/* ---------------- sky ---------------- */

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;
const SKY_FRAG = /* glsl */ `
uniform vec3 zenith;
uniform vec3 mid;
uniform vec3 horizon;
uniform vec3 glow;
uniform vec3 sunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.14, h));
  col = mix(col, zenith, smoothstep(0.14, 0.7, h));
  float s = max(dot(d, sunDir), 0.0);
  col += glow * pow(s, 8.0) * (1.0 - smoothstep(0.0, 0.5, h));
  if (d.y < 0.0) col = horizon;
  gl_FragColor = vec4(col, 1.0);
}
`;

/* ---------------- canvas sprites ---------------- */

function pixelCanvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function cloudTexture(r) {
  return pixelCanvasTexture(64, 28, (g, w, h) => {
    const blobs = [];
    const n = 4 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) blobs.push([10 + r() * 44, 14 + r() * 6 - 2, 5 + r() * 8]);
    const inside = (x, y, grow) => blobs.some(([bx, by, br]) => (x - bx) ** 2 + ((y - by) * 1.5) ** 2 < (br + grow) ** 2);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!inside(x, y, 0) || y > 21) continue;
        const shade = !inside(x, y - 3, 0) ? '#ffffff' : (!inside(x, y + 3, 0) || y > 18 ? '#c9d3e6' : '#eef2f8');
        g.fillStyle = shade;
        g.fillRect(x, y, 1, 1);
      }
    }
  });
}

function glowTexture() {
  return pixelCanvasTexture(16, 16, (g) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        const a = d < 2.5 ? 0.9 : d < 4.5 ? 0.45 : d < 7 ? 0.18 : 0;
        if (!a) continue;
        g.fillStyle = `rgba(255,214,140,${a})`;
        g.fillRect(x, y, 1, 1);
      }
    }
  });
}

// Small repeating pixel textures for paving and grass; mipmapped so distance stays calm.
function tileTexture(size, draw, repeatX, repeatY) {
  const t = pixelCanvasTexture(size, size, draw);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = true;
  return t;
}

function pavingTexture(r, repeatX, repeatY) {
  return tileTexture(16, (g) => {
    g.fillStyle = '#ddd0ba';
    g.fillRect(0, 0, 16, 16);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = r() < 0.5 ? '#e6dac6' : '#cfc1aa';
      g.fillRect(Math.floor(r() * 16), Math.floor(r() * 16), 1, 1);
    }
    g.fillStyle = '#bfae95';
    g.fillRect(0, 15, 16, 1);
    g.fillRect(0, 7, 16, 1);
    g.fillRect(7, 0, 1, 7);
    g.fillRect(15, 8, 1, 7);
  }, repeatX, repeatY);
}

function grassTexture(r, base, repeatX, repeatY) {
  return tileTexture(16, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 16, 16);
    for (let i = 0; i < 40; i++) {
      const c = new THREE.Color(base).offsetHSL((r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.14);
      g.fillStyle = '#' + c.getHexString();
      g.fillRect(Math.floor(r() * 16), Math.floor(r() * 16), 1, r() < 0.4 ? 2 : 1);
    }
  }, repeatX, repeatY);
}

/* ---------------- objects ---------------- */

function makeTree(r, scale = 1, palette) {
  const g = new THREE.Group();
  const trunkH = (2.4 + r() * 1.2) * scale;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * scale, 0.24 * scale, trunkH, 6), toon('#6b4a35'));
  trunk.position.y = trunkH / 2;
  g.add(trunk);
  const canopy = new THREE.Group();
  const n = 3 + Math.floor(r() * 3);
  const base = palette[Math.floor(r() * palette.length)];
  for (let i = 0; i < n; i++) {
    const rad = (1.3 + r() * 1.1) * scale;
    const c = new THREE.Color(base).offsetHSL((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.08);
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(rad, 1), toon('#' + c.getHexString()));
    const a = (i / n) * Math.PI * 2 + r();
    const off = i === 0 ? 0 : 1.1 * scale;
    blob.position.set(Math.cos(a) * off, trunkH + rad * 0.7 + (i === 0 ? 0.8 * scale : r() * scale), Math.sin(a) * off);
    blob.scale.y = 0.85;
    canopy.add(blob);
  }
  canopy.userData.keep = true;   // the canopy sways on its own, so it is baked separately
  g.add(canopy);
  g.userData.canopy = canopy;
  g.userData.phase = r() * 10;
  return g;
}

function makeLamp() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 4.2, 6), toon('#2f3b3a'));
  pole.position.y = 2.1;
  g.add(pole);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 6), toon('#2f3b3a'));
  base.position.y = 0.25;
  g.add(base);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.34),
    toon('#f4ead2', { emissive: new THREE.Color('#ffcf7a'), emissiveIntensity: 0, unique: true }));
  glass.position.y = 4.45;
  glass.userData.keep = true;
  g.add(glass);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.25, 4), toon('#2f3b3a'));
  cap.position.y = 4.8;
  cap.rotation.y = Math.PI / 4;
  g.add(cap);
  g.userData.glass = glass;
  return g;
}

function makeBench() {
  const g = new THREE.Group();
  const wood = '#a8714a';
  const metal = '#3a3f44';
  box(0.5, 0.08, 1.9, wood, 0, 0.46, 0, g);
  box(0.08, 0.42, 1.9, wood, -0.24, 0.72, 0, g).rotation.z = 0.12;
  for (const z of [-0.8, 0.8]) box(0.45, 0.46, 0.08, metal, 0, 0.23, z, g);
  return g;
}

export function makePerson(r, colors = {}) {
  const g = new THREE.Group();
  const shirts = ['#d9534f', '#f0ad4e', '#5bc0de', '#6f5bd9', '#59b26b', '#e8e2d0', '#e86fa5'];
  const pants = ['#2d3a5a', '#3b3b3b', '#6b5a45', '#283848'];
  const shirt = colors.shirt || shirts[Math.floor(r() * shirts.length)];
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.6, 2, 6), toon(colors.pants || pants[Math.floor(r() * pants.length)]));
  legs.position.y = 0.45;
  g.add(legs);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 2, 6), toon(shirt));
  body.position.y = 1.12;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), toon('#f1c7a1'));
  head.position.y = 1.58;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), toon(['#3b2a20', '#c99a5b', '#1f1a17', '#8a4b2a'][Math.floor(r() * 4)]));
  hair.position.y = 1.6;
  g.add(hair);
  g.userData.body = body;
  return g;
}

export function makeDuck(r, kind = 'mallard', s = 1) {
  const g = new THREE.Group();
  const drake = kind === 'mallard';
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32 * s, 8, 6), toon(drake ? '#b9a58e' : '#8e6b4b'));
  body.scale.set(1.5, 0.75, 0.95);
  body.position.y = 0.12 * s;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17 * s, 8, 6), toon(drake ? '#2f7a4a' : '#7a5a3c'));
  head.position.set(0.36 * s, 0.42 * s, 0);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06 * s, 0.2 * s, 4), toon('#e8a33a'));
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(0.55 * s, 0.4 * s, 0);
  g.add(beak);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1 * s, 0.25 * s, 4), toon(drake ? '#f2efe6' : '#6e4f35'));
  tail.rotation.z = Math.PI / 2 + 0.5;
  tail.position.set(-0.5 * s, 0.25 * s, 0);
  g.add(tail);
  g.userData.phase = r() * 10;
  return g;
}

function makeBuilding(r, x, z, w, d, h, wall, roof, parent, windows) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(wall));
  body.position.y = h / 2;
  g.add(body);
  const roofH = Math.min(w, d) * 0.35;
  const shape = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.3, 0), new THREE.Vector2(w / 2 + 0.3, 0), new THREE.Vector2(0, roofH)]);
  const prism = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: d + 0.6, bevelEnabled: false }), toon(roof));
  prism.position.set(0, h, -d / 2 - 0.3);
  g.add(prism);
  g.position.set(x, 0, z);
  g.rotation.y = (r() - 0.5) * 0.15;
  parent.add(g);
  // Window lights for the night (points on the river-facing wall).
  const floors = Math.max(1, Math.floor(h / 3.2));
  const cols = Math.max(1, Math.floor(d / 3));
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      if (r() < 0.45) continue;
      windows.push(new THREE.Vector3(x + w / 2 + 0.05, 1.8 + f * 3.2, z - d / 2 + 1.5 + c * 3));
    }
  }
  return g;
}

/* ---------------- world ---------------- */

export function buildWorld(scene) {
  const r = rng(1981);
  const W = { scene, clickables: [], lamps: [], trees: [], ducks: [], people: [], clouds: [], windows: null };

  /* sky */
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      zenith: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
      glow: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() },
    },
  }));
  sky.renderOrder = -10;
  scene.add(onLayer1(sky));
  W.sky = sky;

  scene.fog = new THREE.Fog(0xcfe0ee, 140, 1100);

  W.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x6b5a40, 1.1);
  scene.add(W.hemi);
  W.sun = new THREE.DirectionalLight(0xffd9a8, 2.4);
  scene.add(W.sun);
  scene.add(W.sun.target);

  // Sun and moon discs sit on the sky dome in the direction of the light.
  W.sunDisc = new THREE.Mesh(new THREE.CircleGeometry(38, 20), new THREE.MeshBasicMaterial({ color: 0xfff1c4, fog: false }));
  W.moonDisc = new THREE.Mesh(new THREE.CircleGeometry(30, 20), new THREE.MeshBasicMaterial({ color: 0xf2f0e6, fog: false }));
  for (const d of [W.sunDisc, W.moonDisc]) { onLayer1(d); scene.add(d); }
  W.sunDisc.userData.kind = 'sun';
  W.moonDisc.userData.kind = 'moon';
  W.clickables.push(W.sunDisc, W.moonDisc);

  /* stars */
  const starPos = [];
  for (let i = 0; i < 500; i++) {
    const a = r() * Math.PI * 2;
    const e = 0.08 + r() * 1.4;
    starPos.push(Math.cos(a) * Math.cos(e) * 1500, Math.sin(e) * 1500, Math.sin(a) * Math.cos(e) * 1500);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  W.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scene.add(onLayer1(W.stars));

  /* ground */
  const ground = new THREE.Group();
  scene.add(ground);
  const plane = (x0, x1, z0, z1, y, color, map) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z0 - z1), map ? new THREE.MeshToonMaterial({ color: 0xffffff, map, gradientMap: toonRamp }) : toon(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    ground.add(m);
    return m;
  };
  plane(-2500, -13, 80, -2500, 0, null, grassTexture(r, '#6fa44a', 1240, 1290));   // park and beyond
  plane(-13, -7, 80, -2500, 0.02, null, grassTexture(r, '#7fb552', 3, 1290));      // grass strip
  plane(-7, -4.6, 80, -2500, 0.04, '#3f86c6');                                     // blue bike lane
  plane(-4.6, 7.3, 80, -2500, 0.04, null, pavingTexture(r, 8, 1720));              // promenade paving
  box(0.5, 0.55, 3000, '#b7ab99', 7.55, 0.27, -1400, ground);  // low river wall
  // Stone embankment sloping down to the water.
  const slope = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(4.4, -WATER_Y), 3000), toon('#9a917f'));
  slope.rotation.x = -Math.PI / 2;
  slope.rotation.y = Math.atan2(-WATER_Y, 4.4);
  slope.position.set(7.8 + 2.2, WATER_Y / 2, -1400);
  ground.add(slope);
  const farSlope = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(6, 3.1), 3000), toon('#8a9a62'));
  farSlope.rotation.x = -Math.PI / 2;
  farSlope.rotation.y = -Math.atan2(3.1, 6);
  farSlope.position.set(175, WATER_Y / 2 + 0.25, -1400);
  ground.add(farSlope);
  plane(178, 2500, 80, -2500, 0.5, null, grassTexture(r, '#79ab4f', 1160, 1290));

  // Railing on the wall: posts + top rail, drawn as 1px lines.
  const railPts = [];
  for (let z = 60; z > -600; z -= 2.5) railPts.push(7.55, 0.55, z, 7.55, 1.05, z);
  railPts.push(7.55, 1.05, 60, 7.55, 1.05, -600);
  const rail = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(railPts, 3)),
    new THREE.LineBasicMaterial({ color: 0x3d4a48, depthWrite: false }));
  scene.add(onLayer1(rail));

  /* water */
  const water = new THREE.Mesh(new THREE.PlaneGeometry(200, 3000), new THREE.ShaderMaterial({
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
    uniforms: {
      tReflect: { value: null }, textureMatrix: { value: null }, time: { value: 0 },
      deep: { value: new THREE.Color('#3f6f7c') }, shallow: { value: new THREE.Color('#5d7f6a') },
      glint: { value: new THREE.Color('#fff2c8') }, glintAmount: { value: 1 }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
      fogColor: { value: new THREE.Color() }, fogNear: { value: 140 }, fogFar: { value: 1100 },
    },
  }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(90, WATER_Y, -1400);
  scene.add(water);
  W.water = water;

  /* trees */
  const greens = ['#4f8f3a', '#5c9b3f', '#447f37', '#6aa548', '#3f7a3f'];
  for (let z = 22; z > -260; z -= 8 + r() * 4) {
    const t = makeTree(r, 1.15 + r() * 0.35, greens);
    t.position.set(-10 + (r() - 0.5) * 1.5, 0, z);
    scene.add(t);
    W.trees.push(t);
  }
  for (let i = 0; i < 70; i++) {
    const t = makeTree(r, 1.1 + r() * 0.6, greens);
    t.position.set(-16 - r() * 55, 0, 25 - r() * 230);
    scene.add(t);
    W.trees.push(t);
  }
  W.trees.forEach((t) => { t.userData.kind = 'tree'; });
  W.clickables.push(...W.trees.filter((t) => t.position.z > -90 && t.position.x > -30));

  // Distant trees (far bank, park depth, horizon) as instances: cheap, not clickable.
  const far = [];
  for (let i = 0; i < 520; i++) far.push([180 + r() * 260, 0.5, 60 - r() * 1300, 1 + r() * 0.8]);
  for (let i = 0; i < 260; i++) far.push([-40 - r() * 220, 0, -230 - r() * 900, 1.1 + r() * 0.8]);
  for (let i = 0; i < 160; i++) far.push([-60 + r() * 360, 0.5, -1000 - r() * 500, 1.6 + r()]);
  const canopyGeo = new THREE.IcosahedronGeometry(2.4, 1);
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.3, 3, 5);
  const canopies = new THREE.InstancedMesh(canopyGeo, toon('#ffffff'), far.length);
  const trunks = new THREE.InstancedMesh(trunkGeo, toon('#6b4a35'), far.length);
  const m4 = new THREE.Matrix4();
  far.forEach(([x, y, z, s], i) => {
    m4.compose(new THREE.Vector3(x, y + 3 * s + 1.6 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.9, s));
    canopies.setMatrixAt(i, m4);
    canopies.setColorAt(i, new THREE.Color(greens[Math.floor(r() * greens.length)]).offsetHSL(0, 0, (r() - 0.5) * 0.06));
    m4.compose(new THREE.Vector3(x, y + 1.5 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(i, m4);
  });
  scene.add(canopies, trunks);

  /* lamps */
  W.glowTex = glowTexture();
  for (let i = 0; i < 22; i++) {
    const z = -12 - i * 20;
    const lamp = makeLamp();
    lamp.position.set(6.1, 0, z);
    scene.add(lamp);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: W.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false }));
    glow.scale.set(1.7, 1.7, 1);
    glow.position.set(0, 4.45, 0);
    lamp.add(onLayer1(glow));
    lamp.userData.glow = glow;
    lamp.userData.on = false;
    lamp.userData.kind = 'lamp';
    if (i < 10) {
      const light = new THREE.PointLight(0xffc06a, 0, 16, 1.6);
      light.position.set(-0.4, 4.2, 0);
      lamp.add(light);
      lamp.userData.light = light;
    }
    W.lamps.push(lamp);
    if (i < 8) W.clickables.push(lamp);
  }

  /* planters */
  const flowerCols = ['#e8505b', '#f7b538', '#f48fb1', '#ffffff', '#b06ad9'];
  W.planters = [];
  for (const z of [-2, -29, -69, -109, -149]) {
    const pl = new THREE.Group();
    W.planters.push(pl);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.75, 0.6, 8), toon('#a39a8c'));
    pot.position.y = 0.3;
    pl.add(pot);
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.05, 8), toon('#4a7a35'));
    soil.position.y = 0.62;
    pl.add(soil);
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 0.7;
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1 + r() * 0.06, 0), toon(i % 3 ? flowerCols[Math.floor(r() * flowerCols.length)] : '#3f8a3a'));
      f.position.set(Math.cos(a) * d, 0.7 + r() * 0.2, Math.sin(a) * d);
      pl.add(f);
    }
    pl.position.set(-3.6, 0, z);
    scene.add(pl);
  }

  /* benches */
  W.benches = [];
  for (const z of [-9, -49, -89]) {
    const b = makeBench();
    b.position.set(4.7, 0, z);
    scene.add(b);
    W.benches.push(b);
  }
  W.benches[0].userData.kind = 'bench';
  W.clickables.push(W.benches[0]);

  /* bridge */
  W.bridge = buildBridge(scene);
  W.clickables.push(W.bridge.group);

  /* skyline */
  const city = new THREE.Group();
  scene.add(city);
  const walls = ['#efe2c4', '#e9c9a0', '#f2d9d0', '#e6e0d6', '#d9c27e', '#f0ead8'];
  const roofs = ['#b5533a', '#c2603f', '#9e4a36', '#a8573f'];
  const windows = [];
  for (let i = 0; i < 70; i++) {
    const x = -55 - r() * 200;
    const z = -150 - r() * 560;
    if (Math.hypot(x + 40, z + 420) < 45) continue;
    makeBuilding(r, x, z, 10 + r() * 14, 10 + r() * 14, 8 + r() * 12, walls[Math.floor(r() * walls.length)], roofs[Math.floor(r() * roofs.length)], city, windows);
  }
  // Riverside blocks near the bridge, and the blue glass hotel tower.
  for (let i = 0; i < 6; i++) makeBuilding(r, -34 - i * 2, -190 - i * 26, 12, 18, 14 + r() * 8, walls[i % walls.length], roofs[i % roofs.length], city, windows);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(16, 58, 16), toon('#5f93c4'));
  tower.position.set(-70, 29, -470);
  city.add(tower);
  for (let f = 0; f < 16; f++) for (let c = 0; c < 4; c++) if (r() < 0.6) windows.push(new THREE.Vector3(-61.9, 3 + f * 3.4, -476 + c * 4));

  // Co-cathedral of St Peter and Paul: red brick nave, 90 m tower and spire.
  const cat = new THREE.Group();
  const brick = '#b0432c';
  box(22, 24, 56, brick, 0, 12, 0, cat);
  const navRoof = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-11.5, 0), new THREE.Vector2(11.5, 0), new THREE.Vector2(0, 12)]), { depth: 56, bevelEnabled: false }), toon('#4f5b57'));
  navRoof.position.set(0, 24, -28);
  cat.add(navRoof);
  box(12, 62, 12, brick, 0, 31, 30, cat);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(7.5, 30, 4), toon('#5c3b30'));
  spire.position.set(0, 77, 30);
  spire.rotation.y = Math.PI / 4;
  cat.add(spire);
  for (const [px, pz] of [[-6, 24], [6, 24], [-6, 36], [6, 36]]) {
    const pin = new THREE.Mesh(new THREE.ConeGeometry(1.2, 8, 4), toon(brick));
    pin.position.set(px, 66, pz);
    cat.add(pin);
  }
  cat.position.set(-40, 0, -420);
  cat.scale.setScalar(1.15);
  cat.rotation.y = 0.2;
  scene.add(cat);
  W.cathedral = cat;
  cat.userData.kind = 'cathedral';
  W.clickables.push(cat);

  const winGeo = new THREE.BufferGeometry().setFromPoints(windows);
  W.windows = new THREE.Points(winGeo, new THREE.PointsMaterial({ color: 0xffd27a, size: 1, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scene.add(onLayer1(W.windows));

  /* clouds */
  for (let i = 0; i < 9; i++) {
    const tex = cloudTexture(r);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, depthWrite: false, fog: false });
    const c = new THREE.Mesh(new THREE.PlaneGeometry(64 * 7, 28 * 7), mat);
    let a = -0.9 + r() * 1.7;
    const e = 0.12 + r() * 0.22;
    if (Math.abs(a - 0.44) < 0.22 && e < 0.34) a += 0.45;   // keep the sun clear
    const R = 1350;
    c.position.set(Math.sin(a) * Math.cos(e) * R, Math.sin(e) * R, -Math.cos(a) * Math.cos(e) * R);
    c.lookAt(0, c.position.y * 0.6, 0);
    c.userData.a = a;
    c.userData.e = e;
    c.userData.speed = 0.004 + r() * 0.006;
    c.renderOrder = -5;
    scene.add(onLayer1(c));
    W.clouds.push(c);
  }

  /* people */
  const walkers = [
    { x: 1.5, z: -14, dir: 1, speed: 1.2 }, { x: 3.2, z: -45, dir: -1, speed: 1.0 },
    { x: -0.5, z: -70, dir: 1, speed: 1.3 }, { x: 2.4, z: -110, dir: -1, speed: 1.1 },
    { x: 0.6, z: -160, dir: 1, speed: 1.0 }, { x: 4.0, z: -25, dir: -1, speed: 0.9 },
  ];
  for (const w of walkers) {
    const p = makePerson(r);
    p.position.set(w.x, 0.04, w.z);
    p.userData.walk = w;
    p.userData.kind = 'person';
    scene.add(p);
    W.people.push(p);
  }
  W.clickables.push(...W.people);

  /* the cat on the river wall */
  const cat2 = new THREE.Group();
  const fur = '#e08a3c';
  const catBody = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), toon(fur));
  catBody.scale.set(1, 1.15, 1.6);
  catBody.position.y = 0.16;
  cat2.add(catBody);
  const catHead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), toon(fur));
  catHead.position.set(0, 0.36, -0.18);
  cat2.add(catHead);
  for (const ex of [-0.06, 0.06]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 4), toon('#c46f28'));
    ear.position.set(ex, 0.48, -0.18);
    cat2.add(ear);
  }
  const catTail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.42, 5), toon('#c46f28'));
  catTail.position.set(0, 0.28, 0.3);
  catTail.rotation.x = -0.6;
  catTail.userData.keep = true;
  cat2.add(catTail);
  cat2.position.set(7.55, 0.55, -13);
  cat2.rotation.y = -2.2;
  cat2.userData.kind = 'cat';
  cat2.userData.tail = catTail;
  scene.add(cat2);
  W.cat = cat2;
  W.clickables.push(cat2);

  /* ducks */
  for (let i = 0; i < 4; i++) {
    const d = makeDuck(r, i % 2 ? 'hen' : 'mallard');
    d.position.set(14 + r() * 6, WATER_Y, -10 - i * 5 - r() * 3);
    d.rotation.y = r() * Math.PI * 2;
    d.userData.kind = 'duck';
    scene.add(d);
    W.ducks.push(d);
  }
  W.clickables.push(...W.ducks);

  /* bake static groups into single meshes */
  for (const t of W.trees) { bake(t.userData.canopy); bake(t); }
  for (const l of W.lamps) bake(l);
  for (const b of W.benches) bake(b);
  for (const p of W.people) bake(p);
  for (const d of W.ducks) bake(d);
  for (const pl of W.planters) bake(pl);
  bake(cat2);
  bake(city);
  bake(cat);
  bake(W.bridge.group, '#7a7a74');

  return W;
}

function buildBridge(scene) {
  const g = new THREE.Group();
  const white = '#eef0ee';
  const deckY = (x) => 1.4 + 6.2 * Math.sin(Math.PI * Math.min(1, Math.max(0, (x + 6) / 192)));
  // Deck in short segments following the arch.
  const segs = 48;
  for (let i = 0; i < segs; i++) {
    const x0 = -6 + (i / segs) * 192;
    const x1 = -6 + ((i + 1) / segs) * 192;
    const y0 = deckY(x0);
    const y1 = deckY(x1);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(len + 0.05, 0.7, 4.4), toon(white));
    seg.position.set((x0 + x1) / 2, (y0 + y1) / 2, BRIDGE_Z);
    seg.rotation.z = Math.atan2(y1 - y0, x1 - x0);
    g.add(seg);
  }
  // Pylons: slender white masts.
  for (const px of [PYLON_A, PYLON_B]) {
    const base = px === PYLON_A ? 0 : 0.5;
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.85, PYLON_H - base, 6), toon(white));
    pylon.position.set(px, base + (PYLON_H - base) / 2, BRIDGE_Z);
    g.add(pylon);
  }
  // Cables: two main cables, hangers and back stays as 1px lines.
  const pts = [];
  const lightPts = [];
  const cableY = (x) => {
    const t = (x - PYLON_A) / (PYLON_B - PYLON_A);
    const low = deckY((PYLON_A + PYLON_B) / 2) + 1.2;
    return low + (PYLON_H - low) * Math.pow(2 * t - 1, 2);
  };
  for (const side of [-1, 1]) {
    const zOff = (x) => side * 2.1 * Math.sin(Math.PI * (x - PYLON_A) / (PYLON_B - PYLON_A)) ** 0.35;
    let prev = null;
    for (let x = PYLON_A; x <= PYLON_B + 0.01; x += 2) {
      const p = [x, cableY(x), BRIDGE_Z + zOff(x)];
      if (prev) pts.push(...prev, ...p);
      prev = p;
      lightPts.push(...p);
      if (x > PYLON_A + 3 && x < PYLON_B - 3 && Math.round(x) % 6 === 0) pts.push(...p, x, deckY(x) + 0.35, BRIDGE_Z + side * 2.1);
    }
    pts.push(PYLON_A, PYLON_H, BRIDGE_Z, -22, 0.2, BRIDGE_Z + side * 3);
    pts.push(PYLON_B, PYLON_H, BRIDGE_Z, 194, 0.7, BRIDGE_Z + side * 3);
    // Handrails.
    for (let i = 0; i < segs; i++) {
      const x0 = -6 + (i / segs) * 192;
      const x1 = -6 + ((i + 1) / segs) * 192;
      pts.push(x0, deckY(x0) + 1.4, BRIDGE_Z + side * 2.2, x1, deckY(x1) + 1.4, BRIDGE_Z + side * 2.2);
    }
  }
  const cables = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)),
    new THREE.LineBasicMaterial({ color: 0xdfe4e6, depthWrite: false }));
  g.add(onLayer1(cables));

  // Fairy lights along the main cables (shown at night / when clicked).
  const lightGeo = new THREE.BufferGeometry();
  lightGeo.setAttribute('position', new THREE.Float32BufferAttribute(lightPts, 3));
  const colors = new Float32Array(lightPts.length);
  lightGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const lights = new THREE.Points(lightGeo, new THREE.PointsMaterial({ size: 1, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 1, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(onLayer1(lights));

  // Invisible hit volume (layer 3 is never rendered) so the thin cables are easy to click.
  const hit = new THREE.Mesh(new THREE.BoxGeometry(PYLON_B - PYLON_A + 30, PYLON_H, 8), new THREE.MeshBasicMaterial());
  hit.position.set((PYLON_A + PYLON_B) / 2, PYLON_H / 2, BRIDGE_Z);
  hit.layers.set(3);
  g.add(hit);

  scene.add(g);
  g.userData.kind = 'bridge';
  return { group: g, lights, cables, deckY, z: BRIDGE_Z };
}
