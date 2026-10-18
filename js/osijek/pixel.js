// Pixel-art render pipeline: the 3D scene is drawn at a low internal resolution, then a
// post pass adds outlines (depth = dark silhouette, normals = light crease), posterizes
// with ordered dithering and is upscaled with nearest-neighbour by CSS.
import * as THREE from '../vendor/three-0.170.0.module.min.js';

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const POST_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform vec4 resolution;      // w, h, 1/w, 1/h
uniform float cameraNear;
uniform float cameraFar;
uniform float levels;
uniform float outlineFade;    // view distance where outlines have faded out
uniform vec3 outlineTint;     // multiplied into dark outlines
uniform vec3 grade;           // final colour grade

float viewZ(vec2 uv) {
  float d = texture2D(tDepth, uv).r;
  return (cameraNear * cameraFar) / ((cameraFar - cameraNear) * d - cameraFar);
}
float depthAt(int x, int y) { return -viewZ(vUv + vec2(x, y) * resolution.zw); }
vec3 normalAt(int x, int y) { return texture2D(tNormal, vUv + vec2(x, y) * resolution.zw).rgb * 2.0 - 1.0; }

float depthEdge(float d) {
  float diff = 0.0;
  diff += clamp(depthAt(1, 0) - d, 0.0, 1e4);
  diff += clamp(depthAt(-1, 0) - d, 0.0, 1e4);
  diff += clamp(depthAt(0, 1) - d, 0.0, 1e4);
  diff += clamp(depthAt(0, -1) - d, 0.0, 1e4);
  return step(0.06 * d + 0.25, diff);
}

float neighbourNormalEdge(int x, int y, float d, vec3 n) {
  float dd = depthAt(x, y) - d;
  vec3 nn = normalAt(x, y);
  float nIndicator = clamp(smoothstep(-0.01, 0.01, dot(n - nn, vec3(1.0, 1.0, 1.0))), 0.0, 1.0);
  float dIndicator = clamp(sign(dd * 0.25 + 0.0025 * d), 0.0, 1.0);
  return (1.0 - dot(n, nn)) * dIndicator * nIndicator;
}
float normalEdge(float d, vec3 n) {
  float i = 0.0;
  i += neighbourNormalEdge(0, -1, d, n);
  i += neighbourNormalEdge(0, 1, d, n);
  i += neighbourNormalEdge(-1, 0, d, n);
  i += neighbourNormalEdge(1, 0, d, n);
  return step(0.12, i);
}

float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return m[i] / 16.0;
}

vec3 toSRGB(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec3 col = texture2D(tColor, vUv).rgb;
  float d = depthAt(0, 0);
  vec3 n = normalAt(0, 0);
  float fade = 1.0 - smoothstep(outlineFade * 0.35, outlineFade, d);
  if (d < cameraFar * 0.95) {
    float de = depthEdge(d) * fade;
    float ne = de > 0.0 ? 0.0 : normalEdge(d, n) * fade;
    col = de > 0.0 ? col * mix(vec3(1.0), outlineTint, de) : col * (1.0 + 0.35 * ne);
  }
  vec3 c = toSRGB(col) * grade;
  float b = bayer4(gl_FragCoord.xy) - 0.5;
  c = floor(c * levels + 0.5 + b * 0.9) / levels;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

export class PixelPipeline {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.width = 1;
    this.height = 1;

    const rt = () => new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    });
    this.colorRT = rt();
    this.colorRT.depthTexture = new THREE.DepthTexture(1, 1);
    this.normalRT = rt();
    this.normalRT.depthTexture = new THREE.DepthTexture(1, 1);
    this.reflectRT = rt();
    this.reflectRT.depthTexture = new THREE.DepthTexture(1, 1);
    this.normalMaterial = new THREE.MeshNormalMaterial();

    this.post = new THREE.ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: this.colorRT.texture },
        tDepth: { value: this.colorRT.depthTexture },
        tNormal: { value: this.normalRT.texture },
        resolution: { value: new THREE.Vector4() },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far },
        levels: { value: 22 },
        outlineFade: { value: 260 },
        outlineTint: { value: new THREE.Color(0.32, 0.26, 0.34) },
        grade: { value: new THREE.Color(1, 1, 1) },
      },
    });
    this.postScene = new THREE.Scene();
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post));
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Mirror camera for the water reflection; water samples reflectRT via textureMatrix.
    this.reflectCamera = new THREE.PerspectiveCamera();
    this.textureMatrix = new THREE.Matrix4();
    this.waterLevel = 0;
    this.water = null;
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  setSize(w, h) {
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.colorRT.setSize(w, h);
    this.normalRT.setSize(w, h);
    this.reflectRT.setSize(w, h);
    this.post.uniforms.resolution.value.set(w, h, 1 / w, 1 / h);
  }

  setWater(mesh, level) {
    this.water = mesh;
    this.waterLevel = level;
    this.clipPlane.constant = -level + 0.05;
    mesh.material.uniforms.tReflect.value = this.reflectRT.texture;
    mesh.material.uniforms.textureMatrix.value = this.textureMatrix;
  }

  renderReflection() {
    const cam = this.camera;
    const rc = this.reflectCamera;
    rc.copy(cam);
    const target = new THREE.Vector3();
    cam.getWorldDirection(target).add(cam.position);
    rc.position.y = 2 * this.waterLevel - cam.position.y;
    target.y = 2 * this.waterLevel - target.y;
    rc.up.set(0, 1, 0);
    rc.lookAt(target);
    rc.updateMatrixWorld();
    rc.projectionMatrix.copy(cam.projectionMatrix);
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);

    this.water.visible = false;
    this.renderer.clippingPlanes = [this.clipPlane];
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.setRenderTarget(this.reflectRT);
    this.renderer.render(this.scene, rc);
    this.renderer.clippingPlanes = [];
    this.water.visible = true;
  }

  render() {
    const r = this.renderer;
    if (this.water) this.renderReflection();

    r.setClearColor(0x000000, 1);
    r.setRenderTarget(this.colorRT);
    r.render(this.scene, this.camera);

    // Normal pass: only layer 0 (solid geometry), so sky, cables and sprites do not outline.
    const mask = this.camera.layers.mask;
    this.camera.layers.set(0);
    this.scene.overrideMaterial = this.normalMaterial;
    const bg = this.scene.background;
    this.scene.background = null;
    r.setRenderTarget(this.normalRT);
    r.setClearColor(0x8080ff, 1);
    r.clear();
    r.render(this.scene, this.camera);
    this.scene.overrideMaterial = null;
    this.scene.background = bg;
    this.camera.layers.mask = mask;

    r.setRenderTarget(null);
    r.render(this.postScene, this.postCamera);
  }
}
