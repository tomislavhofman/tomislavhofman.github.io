// Pixel-art cats in a realistic style: real cat proportions, small eyes, tabby markings, no
// cartoon face. They are drawn at the scene's own pixel size (one texel is about one screen
// pixel at the bollard), so nothing gets lost when the scene is rendered at low resolution.
// The interiors are drawn by hand; the outline and toon shade on the side away from the light
// are added automatically.
import * as THREE from '../vendor/three-0.170.0.module.min.js';

export function pixelTexture(rows, palette) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.' || !palette[ch]) return;
    g.fillStyle = palette[ch];
    g.fillRect(x, y, 1, 1);
  }));
  const t = new THREE.CanvasTexture(c);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// o outline, g fur, d tabby stripes, s fur in shade, w pale fur, v pale fur in shade,
// p inner ear, k pupil, e iris, q iris in shade, n nose. The outline is the same warm dark
// plum the post pass draws around the 3D objects.
export const GREY_TABBY = { o: '#3a2c34', g: '#9a968f', d: '#5f5a57', s: '#7b7772', v: '#bdb6aa', w: '#dcd5c8', p: '#b98a86', k: '#1d1719', e: '#b9b04a', q: '#8e8838', n: '#a8706e' };
export const ORANGE_TABBY = { o: '#3e2b24', g: '#cf8a4f', d: '#9c5b2e', s: '#ad6c3c', v: '#c9b394', w: '#e6d6bb', p: '#c08f86', k: '#1d1719', e: '#c2b14a', q: '#97893a', n: '#b7756c' };

// Front view (sitting): the head is a separate sprite on top of the body, so the face can
// change on its own. Side views face right.
const HEAD = [
  '..o.......o..',
  '.oso.....oso.',
  '.ogpooooopso.',
  'oggpgdgdgpgso',
  'ogggggdggggso',
  'ogdekgggkedso',
  'oggggwnwgggso',
  '.ogggwdwggso.',
  '..ogwwwwwso..',
];
const LOOK_L = [
  '..o.......o..',
  '.oso.....oso.',
  '.ogpooooopso.',
  'oggpgdgdgpgso',
  'ogggggdggggso',
  'ogdkegggkedso',
  'oggggwnwgggso',
  '.ogggwdwggso.',
  '..ogwwwwwso..',
];
const LOOK_R = [
  '..o.......o..',
  '.oso.....oso.',
  '.ogpooooopso.',
  'oggpgdgdgpgso',
  'ogggggdggggso',
  'ogdekgggekdso',
  'oggggwnwgggso',
  '.ogggwdwggso.',
  '..ogwwwwwso..',
];
const BLINK = [
  '..o.......o..',
  '.oso.....oso.',
  '.ogpooooopso.',
  'oggpgdgdgpgso',
  'ogggggdggggso',
  'ogdddgggdddso',
  'oggggwnwgggso',
  '.ogggwdwggso.',
  '..ogwwwwwso..',
];
const HAPPY = [
  '..o.......o..',
  '.oso.....oso.',
  '.ogpooooopso.',
  'oggpgdgdgpgso',
  'ogggggdggggso',
  'ogdddgggdddso',
  'oggggwnwgggso',
  '.ogggwdwggso.',
  '..ogwwwwwso..',
];
const BODY = [
  '......ooooo......',
  '.....ogwwwso.....',
  '....oggwwwgso....',
  '....oggwwwgso....',
  '...odggswsggdo...',
  '...ogggsgsgggso..',
  '..ogdggsgsggdso..',
  '..ogggggsggggso..',
  '..ogdggsgsggdgso.',
  '..oggwwsgswwgggso',
  '...ooooooooooggso',
  '.............ooo.',
];
const PAW = [
  '....o.ooooo......',
  '...ovogwwwso.....',
  '...ogggwwwgso....',
  '....oggwwwgso....',
  '...odggswsggdo...',
  '...oggggggsggso..',
  '..ogdggggsggdso..',
  '..oggggggsgggso..',
  '..ogdggggsggdgso.',
  '..oggggsgswwgggso',
  '...ooooooooooggso',
  '.............ooo.',
];
const LOAF = [
  '..............o...o....',
  '.............oso.oso...',
  '............ogpsogpsoo.',
  '....oooooooooggggggggso',
  '..oogdgdgdgdgggggddggso',
  '.oggggggggggggggggwwwno',
  'oggggggggggggggggwwvvo.',
  'ogggggggggggggwwwwvoo..',
  'osdsdsdsdssssvvvvvo....',
  '.ooooooooooooooooo.....',
];
const WALK_A = [
  '.o....................',
  'oso............o.o....',
  'oso...........ososo...',
  'oso...........ogpgso..',
  '.oso.........ogggggso.',
  '.osoooooooooogggekggso',
  '..ogdgdgdgdgdgggggwwno',
  '..ogggggggggggggggwvo.',
  '..oggggggggggggwwvvo..',
  '..oggsggssssggvwvoo...',
  '..ogsossoooogsosso....',
  '.ogso.ossoogso.osso...',
  '.ovvo..ovvovvo..ovvo..',
  '..oo....oo.oo....oo...',
];
const WALK_B = [
  '.o....................',
  'oso............o.o....',
  'oso...........ososo...',
  'oso...........ogpgso..',
  '.oso.........ogggggso.',
  '.osoooooooooogggekggso',
  '..ogdgdgdgdgdgggggwwno',
  '..ogggggggggggggggwvo.',
  '..oggggggggggggwwvvo..',
  '..osgggssssssswwvoo...',
  '...ogssooooooogsso....',
  '...ogsso.....ogsso....',
  '...ovsvo.....ovsvo....',
  '....ooo.......ooo.....',
];

function flipped(t) {
  const f = t.clone();
  f.wrapS = THREE.RepeatWrapping;
  f.repeat.x = -1;
  f.needsUpdate = true;
  return f;
}

export function catTextures(pal) {
  const P = (rows) => pixelTexture(rows, pal);
  const t = {
    head: P(HEAD),
    lookL: P(LOOK_L),
    lookR: P(LOOK_R),
    blink: P(BLINK),
    happy: P(HAPPY),
    body: P(BODY),
    paw: P(PAW),
    loaf: P(LOAF),
    runA: P(WALK_A),
    runB: P(WALK_B),
  };
  t.loafL = flipped(t.loaf);
  t.runAL = flipped(t.runA);
  t.runBL = flipped(t.runB);
  return t;
}

// A cat made of three sprites: body + head (front view; the head can tilt) and a side view.
// T is the size of one texel in metres.
export function makeCatSprite(tex, T) {
  const g = new THREE.Group();
  // Sprites keep the default centre anchor; each one is lifted by half its height so that
  // its bottom edge sits at 'base' (relative to the group origin, which is on the ground).
  const make = (map, base) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, alphaTest: 0.5 }));
    sp.userData.base = base;
    sp.layers.set(1);
    g.add(sp);
    return sp;
  };
  const fit = (sp, map) => {
    sp.material.map = map;
    sp.scale.set(map.image.width * T, map.image.height * T, 1);
    sp.position.y = sp.userData.base + (map.image.height * T) / 2;
  };
  const body = make(tex.body, 0);
  fit(body, tex.body);
  const head = make(tex.head, (tex.body.image.height - 1) * T);
  fit(head, tex.head);
  const side = make(tex.loaf, 0);
  fit(side, tex.loaf);
  side.visible = false;
  const cat = { g, tex, T, bodySprite: body, headSprite: head, sideSprite: side };
  cat.pose = (pose, frame) => {
    const front = pose === 'front';
    body.visible = front;
    head.visible = front;
    side.visible = !front;
    if (front) head.material.map = frame || tex.head;
    else if (side.material.map !== frame) fit(side, frame);
  };
  cat.tint = (color) => { for (const sp of [body, head, side]) sp.material.color.copy(color); };
  return cat;
}
