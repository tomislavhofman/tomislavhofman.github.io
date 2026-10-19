// Clicks, hover labels, speech bubbles, particles and the hidden secrets of the scene.
import * as THREE from '../vendor/three-0.170.0.module.min.js';
import { WATER_Y, makeDuck, makeBoat, rng } from './world.js';
import { catTextures, makeCatSprite, GREY_TABBY } from './sprites.js';

export const SECRETS = {
  daynight: 'Day and night',
  cat: 'The promenade cat',
  hotel: 'Hotel Osijek says hi',
  boat: 'A boat on the Drava',
  birds: 'Birds in the tree',
  ducklings: 'The duck family',
  love: 'Love on the bridge',
  bells: 'The cathedral bells',
  lights: 'Every lamp lit',
  treecat: 'The cat in the tree',
};

const LABELS = {
  tree: 'A tree in the park', lamp: 'Street lamp', bench: 'Bench', bridge: 'Pješački most, the footbridge (1981)',
  cathedral: 'Co-cathedral of St Peter and Paul', duck: 'Duck', sun: 'The sun',
  moon: 'The moon', cat: 'The promenade cat', bush: 'Flower box', hotel: 'Hotel Osijek', water: 'Drava', visitor: 'A curious cat', bollard: 'Mooring bollard',
};

// Footbridge illumination colours, cycled by clicking the bridge ('rainbow' animates).
const BRIDGE_COLORS = ['#ff2f3a', '#ff4fc8', '#3f7bff', '#2fe07a', '#ffc93b', '#ffffff', 'rainbow'];

// Hotel window patterns (7 x 6 heart, drawn top row first).
const HEART_ROWS = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];

function pixelTexture(rows, palette) {
  const h = rows.length;
  const w = rows[0].length;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    g.fillStyle = palette[ch];
    g.fillRect(x, y, 1, 1);
  }));
  const t = new THREE.CanvasTexture(c);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const HEART = pixelTexture(['.rr.rr.', 'rpprrrr', 'rprrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'], { r: '#e8455a', p: '#ffb3c0' });
const NOTE = pixelTexture(['..kkk', '..k.k', '..k.k', '..k..', 'kkk..', 'kkk..'], { k: '#fff4c8' });
const BIRD_A = pixelTexture(['k...k', '.k.k.', '..k..'], { k: '#2a2a33' });
const KITTEN = catTextures(GREY_TABBY);

const BUTTERFLY_A = pixelTexture(['y...y', 'yykyy', '.yky.', 'y.k.y'], { y: '#ffd166', k: '#3a2a1c' });
const BUTTERFLY_B = pixelTexture(['.....', '.yky.', '.yky.', '..k..'], { y: '#ffd166', k: '#3a2a1c' });
const BIRD_B = pixelTexture(['.....', 'kkkkk', '..k..'], { k: '#2a2a33' });

class Particles {
  constructor(scene, size, max) {
    this.max = max;
    this.items = [];
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false }));
    this.points.frustumCulled = false;
    this.points.layers.set(1);
    scene.add(this.points);
  }
  spawn(p, v, color, life, gravity = -9.8, drag = 0.5, flutter = 0) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({ p: p.clone(), v: v.clone(), c: new THREE.Color(color), life, age: 0, gravity, drag, flutter, seed: Math.random() * 10 });
  }
  update(dt) {
    this.items = this.items.filter((it) => (it.age += dt) < it.life);
    this.items.forEach((it, i) => {
      it.v.y += it.gravity * dt;
      it.v.multiplyScalar(1 - it.drag * dt);
      if (it.flutter) it.v.x += Math.sin(it.age * 6 + it.seed) * it.flutter * dt;
      it.p.addScaledVector(it.v, dt);
      const fade = 1 - Math.max(0, (it.age - it.life * 0.6) / (it.life * 0.4));
      this.pos.set([it.p.x, it.p.y, it.p.z], i * 3);
      this.col.set([it.c.r * fade, it.c.g * fade, it.c.b * fade], i * 3);
    });
    const g = this.points.geometry;
    g.setDrawRange(0, this.items.length);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }
}

export class Interactions {
  constructor({ world, camera, canvas, container, state, scene, setNight }) {
    Object.assign(this, { world, camera, canvas, container, state, scene, setNight });
    this.bridgeBoost = 0;
    this.r = rng(7);
    this.ray = new THREE.Raycaster();
    this.ray.layers.enableAll();
    this.ray.params.Line.threshold = 0.6;
    this.ray.params.Points.threshold = 0.6;
    this.pointer = null;
    this.hovered = null;
    this.counts = {};
    this.sprites = [];
    this.bubbles = [];
    this.timers = [];
    this.small = new Particles(scene, 1, 2200);
    this.big = new Particles(scene, 2, 900);
    this.found = new Set(this.loadFound());

    // Every clickable gets its own materials, so hover highlighting affects only that object.
    for (const c of world.clickables) {
      c.traverse((o) => {
        if (o.isMesh && o.material && o.material.isMeshToonMaterial) {
          o.material = o.material.clone();
          o.userData.baseEmissive = o.material.emissive.clone();
        }
      });
    }

    // Generous invisible hit boxes (layer 3 is never rendered) for small things.
    const HIT = { bench: [0.9, 1.3, 2.4, 0.5], cat: [0.6, 0.45, 0.7, 0.2], duck: [1.5, 1.1, 1.4, 0.3], lamp: [1.0, 6.8, 1.0, 3.3], bush: [3.8, 1.8, 1.8, 0.7] };
    for (const c of world.clickables) {
      const h = HIT[c.userData.kind];
      if (!h) continue;
      const box = new THREE.Mesh(new THREE.BoxGeometry(h[0], h[1], h[2]), new THREE.MeshBasicMaterial());
      box.position.y = h[3];
      box.layers.set(3);
      box.userData.solid = c.userData.kind === 'cat';
      c.add(box);
    }

    this.overlay = document.createElement('div');
    this.overlay.className = 'osijek-overlay';
    container.appendChild(this.overlay);
    this.label = document.createElement('div');
    this.label.className = 'osijek-label';
    this.label.hidden = true;
    this.overlay.appendChild(this.label);

    canvas.addEventListener('pointermove', (e) => { this.pointer = e; });
    canvas.addEventListener('pointerleave', () => { this.pointer = null; this.setHover(null); });
    canvas.addEventListener('click', (e) => this.onClick(e));

    // Ducklings (hidden until the duck family is discovered).
    this.ducklings = [];
    this.trail = [];
    queueMicrotask(() => this.announce());
  }

  /* ---------- secrets ---------- */
  loadFound() {
    try { return JSON.parse(localStorage.getItem('osijek.secrets') || '[]').filter((k) => k in SECRETS); } catch (_) { return []; }
  }
  discover(id) {
    if (this.found.has(id)) return;
    this.found.add(id);
    try { localStorage.setItem('osijek.secrets', JSON.stringify([...this.found])); } catch (_) { /* private mode */ }
    this.announce(id);
  }
  announce(id) {
    this.container.dispatchEvent(new CustomEvent('osijek:secret', {
      detail: { id, label: id ? SECRETS[id] : null, found: this.found.size, total: Object.keys(SECRETS).length },
    }));
  }

  /* ---------- picking ---------- */
  pick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    // Glow sprites are decoration (and invisible by day), so they never catch a click.
    const hits = this.ray.intersectObjects(this.world.clickables.filter((c) => c.visible), true).filter((h) => !h.object.isSprite);
    // The sun and moon sit far behind the bridge's hit volume, so they win when both are hit.
    const sky = hits.find((h) => h.object === this.world.sunDisc || h.object === this.world.moonDisc);
    if (sky) return { obj: sky.object, point: sky.point };
    // Visible geometry wins over the invisible helper boxes (layer 3); the helpers only
    // catch clicks that land near a small thing without touching it.
    const owner = (h) => {
      let o = h.object;
      while (o && !this.world.clickables.includes(o)) o = o.parent;
      return o;
    };
    // Helpers: invisible hit boxes and 1px cables/points, which would otherwise steal clicks.
    // Sprite animals have no clickable geometry of their own, so their hit box counts as solid.
    const isHelper = (h) => (h.object.layers.mask === 1 << 3 && !h.object.userData.solid) || h.object.isLine || h.object.isPoints;
    const isWater = (h) => h.object === this.world.water;
    const best = hits.find((h) => !isHelper(h) && !isWater(h) && owner(h))
      || hits.find((h) => isHelper(h) && owner(h))
      || hits.find((h) => owner(h));
    return best ? { obj: owner(best), point: best.point } : null;
  }

  setHover(obj) {
    if (this.hovered === obj) return;
    const paint = (o, on) => o && o.traverse((m) => {
      if (m.isMesh && m.userData.baseEmissive) m.material.emissive.copy(m.userData.baseEmissive).add(on ? new THREE.Color(0.16, 0.13, 0.08) : new THREE.Color(0, 0, 0));
    });
    paint(this.hovered, false);
    paint(obj, true);
    this.hovered = obj;
    this.canvas.style.cursor = obj ? 'pointer' : '';
    if (!obj) this.label.hidden = true;
  }

  onClick(e) {
    const hit = this.pick(e);
    if (!hit) return;
    const { obj, point } = hit;
    const kind = obj.userData.kind;
    this.counts[kind] = (this.counts[kind] || 0) + 1;
    const handler = this['click_' + kind];
    if (handler) handler.call(this, obj, point);
  }

  /* ---------- bubbles and sprites ---------- */
  bubble(text, anchor, ms = 2200) {
    const el = document.createElement('div');
    el.className = 'osijek-bubble';
    el.textContent = text;
    this.overlay.appendChild(el);
    const b = { el, anchor: anchor.clone(), until: this.state.time + ms / 1000 };
    this.bubbles.push(b);
    return b;
  }
  sprite(tex, pos, size, vel, life, frames) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.5, depthWrite: false, fog: false }));
    s.position.copy(pos);
    const aspect = tex.image.width / tex.image.height;
    s.scale.set(size * aspect, size, 1);
    s.layers.set(1);
    this.scene.add(s);
    this.sprites.push({ s, vel: vel.clone(), life, age: 0, frames, wobble: Math.random() * 6 });
  }
  after(sec, fn) { this.timers.push({ at: this.state.time + sec, fn }); }

  /* ---------- handlers ---------- */
  click_sun() { this.setNight(true); this.discover('daynight'); }
  click_moon() { this.setNight(false); this.discover('daynight'); }

  click_lamp(lamp) {
    lamp.userData.broken = false;
    lamp.userData.on = !lamp.userData.on;
    const top = lamp.localToWorld(new THREE.Vector3(0, 5.9, 0));
    for (let i = 0; i < 10; i++) this.small.spawn(top, new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3), '#ffd27a', 0.8, -6);
    if (this.state.nightTarget > 0.5 && this.world.lamps.every((l) => l.userData.on)) {
      if (!this.fireworksRunning) this.fireworks();
      this.discover('lights');
    } else if (this.state.nightTarget < 0.5 && lamp.userData.on && !this.counts.lampHint) {
      this.counts.lampHint = 1;
      this.bubble('It looks better at night ☾', top.clone().add(new THREE.Vector3(0, 0.8, 0)));
    }
  }

  click_tree(tree, point) {
    tree.userData.shakeT = 0;
    if (!this.visitor) this.spawnVisitorCat(tree);
    const leafCols = ['#5c9b3f', '#8bc34a', '#c7d36b', '#e0b84a'];
    for (let i = 0; i < 14; i++) {
      const p = point.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2));
      this.small.spawn(p, new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 0.8, (Math.random() - 0.5) * 1.5), leafCols[i % 4], 3.2, -1.2, 0.8, 3);
    }
    if (this.counts.tree >= 4 && !this.found.has('birds')) {
      const top = tree.localToWorld(new THREE.Vector3(0, 5, 0));
      for (let i = 0; i < 7; i++) {
        this.sprite(BIRD_A, top.clone().add(new THREE.Vector3(Math.random() * 2, Math.random() * 1.5, Math.random() * 2)), 0.5,
          new THREE.Vector3(3 + Math.random() * 3, 2.5 + Math.random() * 2, -6 - Math.random() * 4), 7, [BIRD_A, BIRD_B]);
      }
      this.discover('birds');
    }
  }

  click_bush(fb, point) {
    fb.userData.shakeT = 0;
    const cols = ['#c62f2b', '#e3b23c', '#d9622b', '#6f9a3a'];
    for (let i = 0; i < 12; i++) {
      this.small.spawn(point, new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2), cols[i % 4], 2.4, -2.5, 0.8, 2);
    }
    // Now and then a butterfly was sitting in there.
    if (this.counts.bush % 3 === 1) {
      this.sprite(BUTTERFLY_A, point.clone().add(new THREE.Vector3(0, 0.4, 0)), 0.32,
        new THREE.Vector3(-0.6 - Math.random(), 0.8 + Math.random() * 0.5, -1.5 - Math.random()), 6, [BUTTERFLY_A, BUTTERFLY_B]);
    }
  }

  click_duck(duck) {
    duck.userData.diveT = 0;
    this.bubble(Math.random() < 0.85 ? 'Kvak!' : 'Kvak kvak!', duck.position.clone().add(new THREE.Vector3(0, 1, 0)), 1400);
    const p = duck.position.clone();
    for (let i = 0; i < 8; i++) this.small.spawn(p, new THREE.Vector3((Math.random() - 0.5) * 2, 1.5 + Math.random(), (Math.random() - 0.5) * 2), '#d6ecff', 0.7, -9);
    if (this.counts.duck >= 5 && !this.ducklings.length) this.spawnDucklings(duck);
  }

  spawnDucklings(mother) {
    this.mother = mother;
    for (let i = 0; i < 5; i++) {
      const d = makeDuck(this.r, 'hen', 0.45);
      d.position.copy(mother.position);
      this.scene.add(d);
      this.ducklings.push(d);
    }
    this.bubble('Kvak! Kvak! Kvak!', mother.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
    this.discover('ducklings');
  }

  click_bridge(bridge, point) {
    this.bridgeBoost = 1;
    // Like the real footbridge, the lights change colour: each click picks the next one.
    this.bridgeColorIndex = ((this.bridgeColorIndex ?? -1) + 1) % BRIDGE_COLORS.length;
    this.bridgeColor = BRIDGE_COLORS[this.bridgeColorIndex];
    if (this.state.nightTarget < 0.5 && !this.counts.bridgeHint) {
      this.counts.bridgeHint = 1;
      this.bubble('The bridge lights show best at night ☾', point.clone().add(new THREE.Vector3(0, 6, 0)), 2400);
    }
    for (let i = 0; i < 16; i++) this.big.spawn(point, new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 4), '#fff1b0', 1, -8);
    if (this.counts.bridge >= 4 && !this.found.has('love')) {
      for (let i = 0; i < 14; i++) {
        const x = 20 + Math.random() * 140;
        const p = new THREE.Vector3(x, this.world.bridge.deckY(x) + 2, this.world.bridge.z + (Math.random() - 0.5) * 3);
        this.after(i * 0.18, () => this.sprite(HEART, p, 3.2, new THREE.Vector3((Math.random() - 0.5), 3 + Math.random() * 2, 0), 5));
      }
      this.bubble('♥', point.clone().add(new THREE.Vector3(0, 6, 0)), 2600);
      this.discover('love');
    }
  }

  click_bench(bench) {
    const lines = ['Sit for a while.', 'Best view in town.', 'Free seat by the Drava.'];
    this.bubble(lines[(this.counts.bench - 1) % lines.length], bench.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 1800);
  }

  click_hotel() {
    const w = this.world.hotelWindows;
    w.userData.mode = (w.userData.mode || 0) % 3 + 1;   // 1 all on, 2 chase, 3 heart
    w.userData.modeT = 0;
    if (w.userData.mode === 3) {
      this.bubble('♥', this.world.hotel.localToWorld(new THREE.Vector3(0, 80, 9)), 2400);
      this.discover('hotel');
    }
  }

  click_water(water, point) {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      this.small.spawn(point.clone().setY(WATER_Y + 0.05), new THREE.Vector3(Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2), '#e8f4ff', 1.1, 0, 1.5);
    }
    if (this.counts.water >= 3 && !this.boat) {
      this.boat = makeBoat();
      this.boat.position.set(70 + Math.random() * 30, WATER_Y, -330);
      this.scene.add(this.boat);
      this.discover('boat');
    }
  }

  click_cathedral(cat) {
    const top = cat.localToWorld(new THREE.Vector3(0, 80, 30));
    this.bubble('♪ ding · dong ♪', top.clone().add(new THREE.Vector3(0, 8, 0)), 2600);
    for (let i = 0; i < 6; i++) this.after(i * 0.35, () => this.sprite(NOTE, top.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, 0, 0)), 4, new THREE.Vector3((Math.random() - 0.5) * 3, 6, 0), 3));
    for (let i = 0; i < 9; i++) {
      this.sprite(BIRD_A, top.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, -10 + Math.random() * 6, 0)), 2.2,
        new THREE.Vector3(10 + Math.random() * 10, 6 + Math.random() * 6, 6 + Math.random() * 10), 8, [BIRD_A, BIRD_B]);
    }
    this.discover('bells');
  }

  click_cat(cat) {
    const c = cat.userData.sprite;
    cat.userData.happyT = 1.6;
    c.pose('front', c.tex.happy);
    const lines = ['Mijau.', 'Mrrr…', 'Mijau!', '*purr*'];
    this.bubble(lines[(this.counts.cat - 1) % lines.length], cat.position.clone().add(new THREE.Vector3(0, 0.75, 0)), 1600);
    if (this.counts.cat >= 3) {
      cat.userData.jumpT = 0;
      for (let i = 0; i < 3; i++) this.after(i * 0.3, () => this.sprite(HEART, cat.position.clone().add(new THREE.Vector3(0, 0.75, 0)), 0.18, new THREE.Vector3(0, 0.5, 0), 2));
      this.discover('cat');
    }
  }


  fireworks() {
    this.fireworksRunning = true;
    const cols = ['#ff5a5f', '#ffd166', '#06d6a0', '#4cc9f0', '#f72585', '#ffffff', '#b388ff'];
    for (let b = 0; b < 14; b++) {
      this.after(0.35 + b * 0.45, () => {
        const c = new THREE.Vector3(30 + Math.random() * 120, 35 + Math.random() * 30, -120 - Math.random() * 140);
        const col = cols[Math.floor(Math.random() * cols.length)];
        for (let i = 0; i < 120; i++) {
          const v = new THREE.Vector3().randomDirection().multiplyScalar(11 + Math.random() * 3);
          this.small.spawn(c, v, i % 9 ? col : '#ffffff', 1.8 + Math.random() * 0.8, -4, 1.1);
        }
      });
    }
    this.after(7.5, () => { this.fireworksRunning = false; });
    this.bubble('★ Osijek says thank you ★', new THREE.Vector3(80, 50, -150), 5000);
  }

  updateHotel(dt, t) {
    const w = this.world.hotelWindows;
    const { cols, rows, base } = w.userData;
    const night = Math.max(0, (this.state.night - 0.35) / 0.65);
    const mode = w.userData.mode || 0;
    w.userData.modeT = (w.userData.modeT || 0) + dt;
    if (mode && w.userData.modeT > 9) w.userData.mode = 0;   // patterns fade back after a while
    const col = w.geometry.attributes.color;
    for (let row = 0; row < rows; row++) {
      for (let c = 0; c < cols; c++) {
        const i = row * cols + c;
        let on = base[i] ? night : 0;
        if (mode === 1) on = 1;
        if (mode === 2) on = (Math.floor(w.userData.modeT * 10) - row) % 6 === 0 ? 1 : 0.15 * night;
        if (mode === 3) {
          const hr = 17 - row;   // heart sits on floors 12-17, top row first
          on = hr >= 0 && hr < HEART_ROWS.length && HEART_ROWS[hr][c] === 'X' ? 1 : 0.08 * night;
        }
        const warm = mode === 3 ? [1, 0.35, 0.45] : [1, 0.82, 0.45];
        col.setXYZ(i, warm[0] * on, warm[1] * on, warm[2] * on);
      }
    }
    col.needsUpdate = true;
  }

  /* ---------- the cat that falls out of a tree ---------- */
  // The cat is pixel art (sprites.js), not 3D: at this size a sprite is the only way to get
  // a readable face. One texel is 2.3 cm, so she sits about 43 cm tall, like a real cat.
  makeVisitorCat() {
    const cat = makeCatSprite(KITTEN, 0.023);
    const fly = new THREE.Sprite(new THREE.SpriteMaterial({ map: BUTTERFLY_A, transparent: true, alphaTest: 0.5 }));
    fly.scale.set(5 * 0.022, 4 * 0.022, 1);
    fly.layers.set(1);
    fly.visible = false;
    cat.g.add(fly);
    cat.g.userData.kind = 'visitor';
    // Generous hit box: she is small, so make her easy to pet.
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.55), new THREE.MeshBasicMaterial());
    hit.position.y = 0.25;
    hit.layers.set(3);
    hit.userData.solid = true;
    cat.g.add(hit);
    return { ...cat, fly };
  }

  setKittenPose(v, pose, frame) { v.pose(pose, frame); }

  spawnVisitorCat(tree) {
    const cat = this.makeVisitorCat();
    const top = tree.localToWorld(new THREE.Vector3(0, 5.5, 0));
    cat.g.position.copy(top);
    this.scene.add(cat.g);
    this.world.clickables.push(cat.g);
    const b = this.world.bollard.position;
    this.visitor = { ...cat, state: 'fall', vy: 0, t: 0, st: 0, clicks: [], nextBlink: 2, squint: 0, stride: 0,
      base: new THREE.Vector3(b.x - 0.55, 0.045, b.z + 0.1), perch: new THREE.Vector3(b.x, this.world.bollard.userData.top, b.z) };
    this.bubble('Mijau?!', top.clone().add(new THREE.Vector3(0, 1, 0)), 1200);
  }

  // Waypoints from where she lands to the bollard that never cut through the promenade rows.
  // Rows (see world.js): city side at x = -8.4, river side at x = 6.0, repeating every 11.8 m.
  // City-side gaps between the two benches are at z = -14.8 - 11.8k, and both rows only start
  // a few metres up the promenade, so near the viewer (z > -1) the way is open.
  pathToBollard(from, base) {
    const pts = [];
    const z = from.z;
    if (from.x < -9.3) {
      pts.push(new THREE.Vector3(-13.6, 0.045, z));                     // out onto the running track
      if (z < -6) {
        const k = Math.max(0, Math.round((-14.8 - z) / 11.8));
        const gap = -14.8 - 11.8 * k;
        pts.push(new THREE.Vector3(-13.6, 0.045, gap));                 // along the track to a gap
        pts.push(new THREE.Vector3(-3.6, 0.045, gap));                  // through it, onto the asphalt
      }
    }
    pts.push(new THREE.Vector3(Math.min(2.6, Math.max(-3.6, from.x)), 0.045, Math.min(-0.2, Math.max(z, -400))));
    pts.push(new THREE.Vector3(2.6, 0.045, 0.2));                        // along the asphalt to the open end
    pts.push(new THREE.Vector3(base.x, 0.045, 0.2));                     // around the start of the river row
    pts.push(base.clone());
    // Drop points that are behind her or practically on top of each other.
    return pts.filter((p, i) => i === pts.length - 1 || p.distanceTo(i ? pts[i - 1] : from) > 0.3);
  }

  click_bollard() {
    if (this.visitor) return;
    this.bubble('A perfect spot for a cat. Is one hiding in a tree?', this.world.bollard.position.clone().add(new THREE.Vector3(0, 0.9, 0)), 2600);
  }

  click_visitor() {
    const v = this.visitor;
    if (!v || !['play', 'loaf'].includes(v.state)) return;
    const now = this.state.time;
    v.clicks = v.clicks.filter((c) => now - c < 5).concat(now);
    const top = v.g.localToWorld(new THREE.Vector3(0, 0.5, 0));
    // Clicking fast-fast-fast is too much: she gets down and leaves.
    if (v.clicks.filter((c) => now - c < 1.6).length >= 5) {
      this.setVisitorState(v, 'startle');
      this.bubble('Mijau! Too much!', top, 1500);
      return;
    }
    v.squint = 0.9;
    const lines = ['purr…', 'mrrr ♥', 'purrrr', 'mrrp!'];
    this.bubble(lines[v.clicks.length % lines.length], top, 1200);
    this.sprite(HEART, top.clone().add(new THREE.Vector3(0.05, 0.02, 0)), 0.12, new THREE.Vector3(0, 0.18, 0), 1.4);
    // A few gentle pets wake her up and she plays again.
    if (v.state === 'loaf' && v.clicks.length >= 3) this.setVisitorState(v, 'wake');
  }

  setVisitorState(v, state) {
    v.state = state;
    v.st = 0;
    v.fly.visible = state === 'play';
    v.from = v.g.position.clone();
  }

  updateVisitor(dt, t) {
    const v = this.visitor;
    if (!v) return;
    const g = v.g;
    v.t += dt;
    v.st += dt;
    const ease = (k) => k * k * (3 - 2 * k);
    // Lit like the 3D things around her: a little dimmer and warmer by day, moonlit blue at night.
    const tint = new THREE.Color('#e4dccf').lerp(new THREE.Color('#5d678f'), this.state.night);
    v.tint(tint);
    v.fly.material.color.copy(tint);
    v.headSprite.material.rotation = 0;
    g.scale.set(1, 1, 1);

    const screenX = (p) => p.clone().project(this.camera).x;
    // Trot or walk towards a ground point; steps follow the distance actually covered.
    const moveTo = (target, speed, walk) => {
      const d = target.clone().sub(g.position).setY(0);
      const dist = d.length();
      const step = Math.min(dist, speed * dt);
      if (dist > 0.01) g.position.addScaledVector(d.normalize(), step);
      v.stride += step;
      const strideLen = walk ? 0.16 : 0.32;
      const a = Math.floor(v.stride / strideLen) % 2 === 0;
      g.position.y = 0.045 + (walk ? 0 : (a ? 0.012 : 0));
      if (walk === 'front') {
        v.pose('front', KITTEN.head);
        v.bodySprite.material.map = a ? KITTEN.body : KITTEN.paw;
      } else {
        const right = screenX(target) > screenX(g.position);
        v.pose('side', right ? (a ? KITTEN.runA : KITTEN.runB) : (a ? KITTEN.runAL : KITTEN.runBL));
      }
      return dist;
    };
    const arc = (from, to, dur, height) => {
      const k = Math.min(1, v.st / dur);
      g.position.lerpVectors(from, to, ease(k));
      g.position.y += Math.sin(k * Math.PI) * height;
      g.scale.y = 1.08;                                       // stretched in the air
      v.pose('side', screenX(to) >= screenX(from) ? KITTEN.runB : KITTEN.runBL);
      return k >= 1;
    };
    const crouch = (k) => { g.scale.y = 1 - 0.14 * Math.sin(Math.min(1, k) * Math.PI); };
    const face = () => {
      v.nextBlink -= dt;
      if (v.nextBlink < 0) { v.blink = 0.15; v.nextBlink = 2.5 + Math.random() * 3; }
      v.blink = Math.max(0, (v.blink || 0) - dt);
      v.squint = Math.max(0, v.squint - dt);
      // Curious: looks left, back at you, right, back at you.
      const phase = Math.floor(t / 1.1) % 4;
      const gaze = phase === 1 ? KITTEN.lookL : phase === 3 ? KITTEN.lookR : KITTEN.head;
      v.pose('front', v.squint > 0 ? KITTEN.happy : v.blink > 0 ? KITTEN.blink : gaze);
    };

    switch (v.state) {
      case 'fall': {
        v.vy -= 14 * dt;
        g.position.y += v.vy * dt;
        v.pose('side', KITTEN.runB);
        g.scale.y = 1.1;
        if (g.position.y <= 0.045) {
          g.position.y = 0.045;
          for (let i = 0; i < 12; i++) this.small.spawn(g.position, new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2), '#d9cdb5', 0.7, -4);
          v.path = this.pathToBollard(g.position.clone(), v.base);
          this.setVisitorState(v, 'land');
        }
        break;
      }
      case 'land':                                            // soft landing, shake it off
        v.pose('side', KITTEN.loaf);
        crouch(v.st / 0.5);
        if (v.st > 0.5) this.setVisitorState(v, 'trot');
        break;
      case 'trot': {
        // Follow the waypoints around the flower boxes and benches; dash when far, walk when close.
        const wp = v.path[0];
        const toBase = v.base.distanceTo(g.position.clone().setY(0.045));
        const speed = toBase < 1.5 ? 1.0 : toBase < 8 ? 2.4 : toBase < 30 ? 3.6 : 5.5;
        if (moveTo(wp, speed, toBase < 1.5) < 0.05) {
          v.path.shift();
          if (!v.path.length) this.setVisitorState(v, 'eye-up');
        }
        break;
      }
      case 'eye-up':                                          // stops and eyes the bollard
        v.pose('front', KITTEN.lookR);
        if (v.st > 0.8) this.setVisitorState(v, 'crouch-up');
        break;
      case 'crouch-up':
        v.pose('side', KITTEN.loaf);
        crouch(v.st / 0.35);
        if (v.st > 0.35) this.setVisitorState(v, 'jump-up');
        break;
      case 'jump-up':
        if (arc(v.from, v.perch, 0.55, 0.35)) this.setVisitorState(v, 'land-up');
        break;
      case 'land-up':
        g.position.copy(v.perch);
        v.pose('side', KITTEN.loaf);
        crouch(v.st / 0.3);
        if (v.st > 0.3) {
          this.setVisitorState(v, 'play');
          this.discover('treecat');
        }
        break;
      case 'play': {
        // Slow play: watches the butterfly, looks around, now and then bats at it.
        g.position.copy(v.perch);
        face();
        const swipe = Math.sin(v.st * 2.0) > 0.88;
        v.bodySprite.material.map = swipe ? KITTEN.paw : KITTEN.body;
        const a = v.st * 1.1;
        v.fly.position.set(Math.cos(a) * 0.26, 0.6 + Math.sin(a * 2.1) * 0.07, Math.sin(a) * 0.12);
        v.fly.material.map = Math.floor(v.t * 8) % 2 ? BUTTERFLY_A : BUTTERFLY_B;
        if (v.st > 8) this.setVisitorState(v, 'sleepy');
        break;
      }
      case 'sleepy':                                          // heavy blinks before lying down
        g.position.copy(v.perch);
        v.pose('front', Math.floor(v.st / 0.35) % 2 ? KITTEN.blink : KITTEN.head);
        if (v.st > 1.4) this.setVisitorState(v, 'settle');
        break;
      case 'settle':
        g.position.copy(v.perch);
        v.pose('side', KITTEN.loaf);
        g.scale.y = 1.15 - 0.15 * ease(Math.min(1, v.st / 0.5));
        if (v.st > 0.5) this.setVisitorState(v, 'loaf');
        break;
      case 'loaf':                                            // lying down, watching the Drava
        g.position.copy(v.perch);
        v.bodySprite.material.map = KITTEN.body;
        v.pose('side', KITTEN.loaf);
        g.scale.y = 1 + 0.02 * Math.sin(t * 1.6);              // slow breathing
        break;
      case 'wake':                                            // a stretch, then back to play
        g.position.copy(v.perch);
        v.pose('side', KITTEN.loaf);
        g.scale.y = 0.9 + 0.22 * Math.sin(Math.min(1, v.st / 0.6) * Math.PI);
        if (v.st > 0.6) { v.clicks = []; this.setVisitorState(v, 'play'); }
        break;
      case 'startle':                                         // ears back, then down she goes
        g.position.copy(v.perch);
        v.pose('front', KITTEN.blink);
        g.scale.y = 0.94;
        if (v.st > 0.35) this.setVisitorState(v, 'jump-down');
        break;
      case 'jump-down':
        if (arc(v.perch, v.base.clone().add(new THREE.Vector3(-0.2, 0, 0.4)), 0.5, 0.25)) this.setVisitorState(v, 'land-down');
        break;
      case 'land-down':
        v.pose('side', KITTEN.loaf);
        crouch(v.st / 0.3);
        if (v.st > 0.3) this.setVisitorState(v, 'leave');
        break;
      case 'leave': {
        // She strolls towards the viewer and out through the bottom of the screen.
        const fwd = new THREE.Vector3();
        this.camera.getWorldDirection(fwd);
        fwd.y = 0;
        fwd.normalize();
        const goal = this.camera.position.clone().addScaledVector(fwd, 0.4).setY(0.045);
        if (moveTo(goal, 0.9, 'front') < 1.3 || v.st > 25) {
          this.scene.remove(g);
          this.world.clickables.splice(this.world.clickables.indexOf(g), 1);
          if (this.hovered === g) this.setHover(null);
          this.visitor = null;
        }
        break;
      }
      default:
    }
  }

  /* ---------- per-frame ---------- */
  update(dt, t) {
    // Hover (desktop only; touch has no pointermove without a press).
    if (this.pointer && this.pointer.pointerType !== 'touch') {
      const hit = this.pick(this.pointer);
      this.setHover(hit ? hit.obj : null);
      if (hit) {
        const rect = this.container.getBoundingClientRect();
        this.label.hidden = false;
        this.label.textContent = LABELS[hit.obj.userData.kind] || '';
        this.label.style.transform = `translate(${this.pointer.clientX - rect.left + 14}px, ${this.pointer.clientY - rect.top + 16}px)`;
      }
    }

    this.timers = this.timers.filter((tm) => (tm.at <= t ? (tm.fn(), false) : true));
    this.bridgeBoost = Math.max(0, this.bridgeBoost - dt / 4);
    this.small.update(dt);
    this.big.update(dt);

    for (const tr of this.world.trees) {
      if (tr.userData.shakeT == null) continue;
      tr.userData.shakeT += dt;
      tr.userData.shake = 0.1 * Math.sin(tr.userData.shakeT * 38) * Math.exp(-tr.userData.shakeT * 4);
      if (tr.userData.shakeT > 1.5) { tr.userData.shakeT = null; tr.userData.shake = 0; }
    }
    for (const fb of this.world.flowerBoxes) {
      if (fb.userData.shakeT == null) continue;
      fb.userData.shakeT += dt;
      const k = Math.exp(-fb.userData.shakeT * 5);
      fb.userData.bushes.rotation.z = 0.05 * Math.sin(fb.userData.shakeT * 40) * k;
      fb.userData.bushes.scale.y = 1 + 0.06 * Math.sin(fb.userData.shakeT * 30) * k;
      if (fb.userData.shakeT > 1.2) fb.userData.shakeT = null;
    }
    for (const d of this.world.ducks) {
      if (d.userData.diveT == null) { d.userData.dive = 0; continue; }
      d.userData.diveT += dt;
      d.userData.dive = -0.35 * Math.sin(Math.min(1, d.userData.diveT / 0.8) * Math.PI);
      if (d.userData.diveT > 0.8) d.userData.diveT = null;
    }
    // Ducklings follow the mother along her recent path.
    if (this.mother) {
      this.trail.unshift(this.mother.position.clone());
      this.trail.length = Math.min(this.trail.length, 400);
      this.ducklings.forEach((d, i) => {
        const p = this.trail[Math.min(this.trail.length - 1, (i + 1) * 28)];
        if (p.distanceToSquared(d.position) > 1e-6) d.rotation.y = -Math.atan2(p.z - d.position.z, p.x - d.position.x);
        d.position.set(p.x, WATER_Y + Math.sin(t * 3 + i) * 0.02, p.z);
      });
    }
    this.updateHotel(dt, t);
    this.updateVisitor(dt, t);
    if (this.boat) {
      this.boat.position.z += 9 * dt;
      this.boat.position.y = WATER_Y + Math.sin(t * 1.6) * 0.08;
      if (this.boat.position.z > 40) { this.scene.remove(this.boat); this.boat = null; this.counts.water = 0; }
    }

    const cat = this.world.cat;
    cat.userData.sprite.tint(new THREE.Color(1, 1, 1).lerp(new THREE.Color('#6b76a0'), this.state.night));
    if (cat.userData.happyT > 0) {
      cat.userData.happyT -= dt;
      if (cat.userData.happyT <= 0) cat.userData.sprite.pose('side', cat.userData.sprite.tex.loaf);
    }
    if (cat.userData.jumpT != null) {
      cat.userData.jumpT += dt;
      cat.position.y = cat.userData.baseY + Math.max(0, Math.sin(Math.min(1, cat.userData.jumpT / 0.5) * Math.PI)) * 0.4;
      if (cat.userData.jumpT > 0.5) cat.userData.jumpT = null;
    }

    this.sprites = this.sprites.filter((sp) => {
      sp.age += dt;
      if (sp.age >= sp.life) { this.scene.remove(sp.s); sp.s.material.dispose(); return false; }
      sp.s.position.addScaledVector(sp.vel, dt);
      sp.s.position.x += Math.sin(sp.age * 3 + sp.wobble) * dt * 0.4;
      if (sp.frames) sp.s.material.map = sp.frames[Math.floor(sp.age * 8) % sp.frames.length];
      sp.s.material.opacity = 1 - Math.max(0, (sp.age - sp.life * 0.7) / (sp.life * 0.3));
      return true;
    });

    // Bubbles follow their 3D anchor on screen.
    const cRect = this.canvas.getBoundingClientRect();
    const oRect = this.container.getBoundingClientRect();
    this.bubbles = this.bubbles.filter((b) => {
      if (t > b.until) { b.el.remove(); return false; }
      const v = b.anchor.clone().project(this.camera);
      const x = cRect.left - oRect.left + ((v.x + 1) / 2) * cRect.width;
      const y = cRect.top - oRect.top + ((1 - v.y) / 2) * cRect.height;
      b.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
      b.el.style.visibility = v.z < 1 ? 'visible' : 'hidden';
      return true;
    });
  }
}
