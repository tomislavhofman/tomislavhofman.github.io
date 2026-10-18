// Clicks, hover labels, speech bubbles, particles and the hidden secrets of the scene.
import * as THREE from '../vendor/three-0.170.0.module.min.js';
import { WATER_Y, makePerson, makeDuck, rng } from './world.js';

export const SECRETS = {
  daynight: 'Day and night',
  hello: 'A friendly hello',
  cat: 'The promenade cat',
  bench: 'A bench for two',
  birds: 'Birds in the tree',
  ducklings: 'The duck family',
  love: 'Love on the bridge',
  bells: 'The cathedral bells',
  lights: 'Every lamp lit',
};

const LABELS = {
  tree: 'A tree on the promenade', lamp: 'Street lamp', bench: 'Bench', bridge: 'Pješački most, the footbridge (1981)',
  cathedral: 'Co-cathedral of St Peter and Paul', person: 'Someone out for a walk', duck: 'Duck', sun: 'The sun',
  moon: 'The moon', cat: 'The promenade cat', bush: 'Flower box',
};

const GREETINGS_DAY = ['Bok!', 'Lijep dan!', 'Hi there!', 'Dobar dan!', 'Hello from Osijek!'];
const GREETINGS_NIGHT = ['Laku noć!', 'Lovely night.', 'Bok!', 'Look at the stars.'];

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
    const HIT = { bench: [0.9, 1.3, 2.4, 0.5], cat: [0.9, 0.9, 1.3, 0.3], duck: [1.5, 1.1, 1.4, 0.3], person: [0.9, 2.0, 0.9, 1.0], lamp: [1.0, 6.8, 1.0, 3.3], bush: [3.8, 1.8, 1.8, 0.7] };
    for (const c of world.clickables) {
      const h = HIT[c.userData.kind];
      if (!h) continue;
      const box = new THREE.Mesh(new THREE.BoxGeometry(h[0], h[1], h[2]), new THREE.MeshBasicMaterial());
      box.position.y = h[3];
      box.layers.set(3);
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
    const hits = this.ray.intersectObjects(this.world.clickables.filter((c) => c.visible), true);
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
    const isHelper = (h) => h.object.layers.mask === 1 << 3;
    const best = hits.find((h) => !isHelper(h) && owner(h)) || hits.find((h) => owner(h));
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
    if (this.couple) {
      this.couple.forEach((p) => this.scene.remove(p));
      this.couple = null;
      return;
    }
    this.couple = [makePerson(this.r, { shirt: '#e86fa5' }), makePerson(this.r, { shirt: '#5bc0de' })];
    this.couple.forEach((p, i) => {
      p.position.copy(bench.position).add(new THREE.Vector3(0.05, -0.32, i ? 0.35 : -0.35));
      p.rotation.y = -Math.PI / 2;
      p.userData.kind = 'person';
      this.scene.add(p);
    });
    this.sprite(HEART, bench.position.clone().add(new THREE.Vector3(0.2, 2.1, 0)), 0.5, new THREE.Vector3(0, 0.5, 0), 3);
    this.discover('bench');
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

  click_person(p) {
    p.userData.pause = 3;
    p.rotation.y = Math.atan2(this.camera.position.x - p.position.x, this.camera.position.z - p.position.z);
    const list = this.state.nightTarget > 0.5 ? GREETINGS_NIGHT : GREETINGS_DAY;
    this.bubble(list[Math.floor(Math.random() * list.length)], p.position.clone().add(new THREE.Vector3(0, 2.1, 0)));
    this.discover('hello');
  }

  click_cat(cat) {
    cat.userData.wagT = 0;
    const lines = ['Mijau.', 'Mrrr…', 'Mijau!', '*purr*'];
    this.bubble(lines[(this.counts.cat - 1) % lines.length], cat.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 1600);
    if (this.counts.cat >= 3) {
      cat.userData.jumpT = 0;
      for (let i = 0; i < 3; i++) this.after(i * 0.3, () => this.sprite(HEART, cat.position.clone().add(new THREE.Vector3(0, 0.7, 0)), 0.22, new THREE.Vector3(0, 0.6, 0), 2));
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
    const cat = this.world.cat;
    if (cat.userData.wagT != null) {
      cat.userData.wagT += dt;
      cat.userData.tail.rotation.z = Math.sin(cat.userData.wagT * 14) * 0.5 * Math.exp(-cat.userData.wagT * 1.5);
      if (cat.userData.wagT > 3) cat.userData.wagT = null;
    }
    if (cat.userData.jumpT != null) {
      cat.userData.jumpT += dt;
      cat.position.y = 0.43 + Math.max(0, Math.sin(Math.min(1, cat.userData.jumpT / 0.5) * Math.PI)) * 0.5;
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
