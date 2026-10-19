// Entry point for the home-page scene. Exposes start(container) which returns a controller.
import * as THREE from '../vendor/three-0.170.0.module.min.js';
import { PixelPipeline } from './pixel.js';
import { buildWorld, WATER_Y } from './world.js';
import { Interactions } from './interact.js';

const DAY = {
  zenith: '#2f78c8', mid: '#86bce8', horizon: '#f4dfbd', glow: '#ffb06a', fog: '#ecdcc2',
  light: '#ffd7a3', lightI: 2.6, sky: '#c4dcff', ground: '#6b5a40', hemiI: 1.15,
  dir: new THREE.Vector3(0.42, 0.2, -0.89).normalize(), glint: '#fff1c2', glintA: 1, grade: [1.02, 1.0, 0.97],
};
const NIGHT = {
  zenith: '#081226', mid: '#16244a', horizon: '#2b3961', glow: '#4d5d93', fog: '#1d2a47',
  light: '#9fb2e6', lightI: 0.45, sky: '#34457a', ground: '#12141d', hemiI: 0.4,
  dir: new THREE.Vector3(0.3, 0.3, -0.9).normalize(), glint: '#c9d8ff', glintA: 0.45, grade: [0.94, 0.98, 1.08],
};
const DUSK = { horizon: '#f08a6a', glow: '#ff7a5a', fog: '#b98a8a' };

const lerpColor = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

export function osijekNightNow() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zagreb', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === 'hour').value) + Number(parts.find((p) => p.type === 'minute').value) / 60;
  return h < 6.5 || h >= 19.5;
}

export function start(container, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'osijek-canvas';
  container.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(1);
  renderer.localClippingEnabled = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.3, 2400);
  camera.layers.enable(1);
  const world = buildWorld(scene);
  const pipe = new PixelPipeline(renderer, scene, camera);
  pipe.setWater(world.water, WATER_Y);

  const state = { night: opts.night ? 1 : 0, nightTarget: opts.night ? 1 : 0, time: 0, pixel: 4, running: true, visible: true };

  /* ---------- sizing: integer pixel scale, canvas covers the container ---------- */
  function resize() {
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const ps = Math.max(2, Math.min(6, Math.round(Math.sqrt((cw * ch) / 68000))));
    const w = Math.ceil(cw / ps);
    const h = Math.ceil(ch / ps);
    state.pixel = ps;
    pipe.setSize(w, h);
    canvas.style.width = w * ps + 'px';
    canvas.style.height = h * ps + 'px';
    const aspect = w / h;
    camera.aspect = aspect;
    // Standing on the river-side cobbles, looking upstream along the Drava towards the footbridge.
    if (aspect >= 1) {
      camera.fov = aspect > 2 ? 40 : 47;
      camera.position.set(8.1, 1.7, 6);
      camera.lookAt(22, 9, -140);
    } else {
      // Portrait: keep the promenade, the cathedral and the city-side pylon in view.
      camera.fov = 58;
      camera.position.set(8.4, 1.7, 5.6);
      camera.lookAt(7, 4, -140);
    }
    camera.updateProjectionMatrix();
    render();
  }

  /* ---------- time of day ---------- */
  function applyLighting() {
    const k = state.night;
    const dusk = Math.sin(Math.PI * k) ** 2;
    const sky = world.sky.material.uniforms;
    sky.zenith.value.copy(lerpColor(DAY.zenith, NIGHT.zenith, k));
    sky.mid.value.copy(lerpColor(DAY.mid, NIGHT.mid, k).lerp(new THREE.Color('#c98aa0'), dusk * 0.5));
    sky.horizon.value.copy(lerpColor(DAY.horizon, NIGHT.horizon, k).lerp(new THREE.Color(DUSK.horizon), dusk * 0.8));
    sky.glow.value.copy(lerpColor(DAY.glow, NIGHT.glow, k).lerp(new THREE.Color(DUSK.glow), dusk));
    const dir = DAY.dir.clone().lerp(NIGHT.dir, k).normalize();
    if (k > 0.05 && k < 0.95) dir.y = Math.max(-0.05, dir.y - dusk * 0.25);
    sky.sunDir.value.copy(k < 0.5 ? DAY.dir : NIGHT.dir);

    const fog = lerpColor(DAY.fog, NIGHT.fog, k).lerp(new THREE.Color(DUSK.fog), dusk * 0.7);
    scene.fog.color.copy(fog);
    world.water.material.uniforms.fogColor.value.copy(fog);
    world.water.material.uniforms.glint.value.copy(lerpColor(DAY.glint, NIGHT.glint, k));
    world.water.material.uniforms.sunDir.value.copy(k < 0.5 ? DAY.dir : NIGHT.dir);
    world.water.material.uniforms.glintAmount.value = DAY.glintA + (NIGHT.glintA - DAY.glintA) * k;
    world.water.material.uniforms.deep.value.copy(lerpColor('#3f6f7c', '#14243a', k));
    world.water.material.uniforms.shallow.value.copy(lerpColor('#5d7f6a', '#1a2a33', k));

    world.sun.color.copy(lerpColor(DAY.light, NIGHT.light, k).lerp(new THREE.Color('#ff8a5a'), dusk * 0.6));
    world.sun.intensity = DAY.lightI + (NIGHT.lightI - DAY.lightI) * k;
    world.sun.position.copy(dir).multiplyScalar(200);
    world.hemi.color.copy(lerpColor(DAY.sky, NIGHT.sky, k));
    world.hemi.groundColor.copy(lerpColor(DAY.ground, NIGHT.ground, k));
    world.hemi.intensity = DAY.hemiI + (NIGHT.hemiI - DAY.hemiI) * k;

    world.sunDisc.position.copy(DAY.dir).multiplyScalar(1400);
    world.moonDisc.position.copy(NIGHT.dir).multiplyScalar(1400);
    world.sunDisc.lookAt(0, 0, 0);
    world.moonDisc.lookAt(0, 0, 0);
    world.sunDisc.position.y -= k * 400;
    world.moonDisc.position.y -= (1 - k) * 400;
    world.sunDisc.visible = k < 0.85;
    world.moonDisc.visible = k > 0.15;

    world.stars.material.opacity = k * k;
    // Bridge illumination: a chosen colour (by clicking the bridge) washes the cables and deck at night.
    const lit = bridgeLight();
    world.bridge.cables.material.color.copy(lerpColor('#e3e7e8', lit ? lit.clone().lerp(new THREE.Color('#ffffff'), 0.15) : new THREE.Color('#aab8d8'), k));
    if (deckMat) deckMat.emissive.copy(new THREE.Color('#7a7a74').lerp(lit ? lit.clone().multiplyScalar(0.55) : new THREE.Color('#3a4258'), k));
    world.windows.material.opacity = Math.max(0, k * 1.4 - 0.4);
    pipe.post.uniforms.grade.value.setRGB(...DAY.grade.map((v, i) => v + (NIGHT.grade[i] - v) * k));
    const lampK = Math.max(0, (k - 0.35) / 0.65);
    for (const l of world.lamps) {
      const on = l.userData.on ? 1 : 0;
      // A broken lamp flickers faintly at night, asking to be switched on.
      const flicker = !on && l.userData.broken && lampK > 0.5 && Math.sin(state.time * 23) * Math.sin(state.time * 7.3) > 0.55 ? 0.6 : 0;
      l.userData.glass.material.emissiveIntensity = on * (0.25 + 1.6 * lampK) + flicker;
      l.userData.glow.material.opacity = on * lampK * 0.95;
      if (l.userData.light) l.userData.light.intensity = on * lampK * 9;
    }
  }

  /* ---------- animation ---------- */
  const fx = new Interactions({ world, camera, canvas, container, state, scene, setNight, applyLighting });
  let deckMat = null;
  world.bridge.group.traverse((o) => { if (o.isMesh && o.material.vertexColors) deckMat = o.material; });
  function bridgeLight() {
    const c = fx.bridgeColor;
    if (!c) return null;
    return c === 'rainbow' ? new THREE.Color().setHSL((state.time * 0.08) % 1, 0.85, 0.55) : new THREE.Color(c);
  }

  function update(dt) {
    state.time += dt;
    const t = state.time;
    if (state.night !== state.nightTarget) {
      const step = dt / 2.2;
      state.night = state.nightTarget > state.night ? Math.min(state.nightTarget, state.night + step) : Math.max(state.nightTarget, state.night - step);
    }
    applyLighting();
    world.water.material.uniforms.time.value = t;
    for (const c of world.clouds) {
      c.userData.a += c.userData.speed * dt * 0.1;
      const R = 1350;
      c.position.set(Math.sin(c.userData.a) * Math.cos(c.userData.e) * R, c.position.y, -Math.cos(c.userData.a) * Math.cos(c.userData.e) * R);
      c.lookAt(0, c.position.y * 0.6, 0);
      c.material.color.copy(lerpColor('#ffffff', '#47557d', state.night));
    }
    for (const tr of world.trees) {
      const s = Math.sin(t * 0.9 + tr.userData.phase) * 0.025 + (tr.userData.shake || 0);
      tr.userData.canopy.rotation.z = s;
      tr.userData.canopy.rotation.x = s * 0.5;
    }
    for (const d of world.ducks) {
      d.userData.phase += dt * 0.15;
      const ph = d.userData.phase;
      d.position.x += Math.cos(ph) * dt * 0.35;
      d.position.z += Math.sin(ph * 0.7) * dt * 0.35;
      d.position.x = Math.min(32, Math.max(19, d.position.x));
      d.position.z = Math.min(-18, Math.max(-60, d.position.z));
      d.rotation.y = -Math.atan2(Math.sin(ph * 0.7), Math.cos(ph));
      d.position.y = WATER_Y + Math.sin(t * 2 + ph * 3) * 0.03 + (d.userData.dive || 0);
    }
    // Bridge fairy lights: a slow chase at night, brighter when switched on by click.
    const lights = world.bridge.lights;
    const col = lights.geometry.attributes.color;
    const nightOn = Math.max(0, (state.night - 0.4) / 0.6);
    const boost = fx.bridgeBoost;
    const lit = bridgeLight();
    for (let i = 0; i < col.count; i++) {
      const wave = 0.5 + 0.5 * Math.sin(i * 0.45 - t * (boost > 0 ? 6 : 1.5));
      const v = Math.min(1, (nightOn * (0.35 + 0.65 * wave)) + boost * wave);
      const c = fx.bridgeColor === 'rainbow' ? new THREE.Color().setHSL((i * 0.03 + t * 0.2) % 1, 0.9, 0.55)
        : lit ? lit.clone().lerp(new THREE.Color('#ffffff'), 0.25 * wave)
        : new THREE.Color().setHSL(0.11, 0.8, 0.5 + 0.2 * wave);
      col.setXYZ(i, c.r * v, c.g * v, c.b * v);
    }
    col.needsUpdate = true;
    fx.update(dt, t);
  }

  function render() { pipe.render(); }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (state.running && state.visible) {
      update(opts.reducedMotion ? dt * 0.25 : dt);
      render();
    }
    requestAnimationFrame(frame);
  }

  function setNight(on) {
    state.nightTarget = on ? 1 : 0;
    if (on) for (const l of world.lamps) if (!l.userData.broken) l.userData.on = true;
    container.dispatchEvent(new CustomEvent('osijek:night', { detail: { night: on } }));
  }

  // Start state: lamps on at night, except two that wait for a visitor to switch them on.
  world.lamps.forEach((l, i) => {
    l.userData.broken = i === 0 || i === 1;
    l.userData.on = state.night > 0.5 && !l.userData.broken;
  });
  applyLighting();
  window.addEventListener('resize', resize);
  new IntersectionObserver(([e]) => { state.visible = e.isIntersecting; }).observe(container);
  document.addEventListener('visibilitychange', () => { state.running = !document.hidden; last = performance.now(); });
  resize();
  requestAnimationFrame(frame);

  const api = { setNight, isNight: () => state.nightTarget > 0.5, update, render, state, world, camera, fx, pipe };
  window.__osijek = api;
  return api;
}
