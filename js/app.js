// Ancestrales AR — the guardian appears on its printed card (8th Wall image target) and stays
// anchored in the room (8th Wall world tracking / SLAM), rendered with three.js.
//
// Wiring overview:
//   1. three.js is loaded as ES modules (import map in index.html). XR8.Threejs expects a
//      global window.THREE, so a plain copy of the namespace (plus GLTFLoader) is exposed.
//   2. xr.js (8th Wall engine binary) loads async, preloads its SLAM chunk (xr-slam.js, via
//      data-preload-chunks="slam") and fires 'xrloaded' when window.XR8 exists.
//      In parallel the guardian's image target JSON (built by tools/build_image_target.js) is fetched.
//   3. On "Iniciar AR" (a user gesture, required by iOS for camera + motion sensors) the camera
//      pipeline is assembled and XR8.run({canvas}) starts:
//        GlTextureRenderer  draws the camera feed into the canvas
//        Threejs            creates scene / camera / renderer and moves the camera with SLAM
//        XrController       world tracking (SLAM) + image target detection
//        canvas sizer       ours: keeps the canvas at window size
//        app module         ours: scene content, image target events, gestures, UI state
//   4. With SLAM on, image target poses arrive in the same world space as the camera. The first
//      'reality.imagefound' turns the target pose into a world anchor and the guardian appears
//      there. While a target stays in view ('imageupdated') the anchor is refined; when the user
//      points at the card again somewhere else, the guardian glides to the new spot.
//      'imagelost' does not touch the guardian: SLAM keeps it fixed while the user walks around.

import * as THREE_NS from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GUARDIANS, DEFAULT_GUARDIAN } from './guardians.js';

const THREE = Object.assign({}, THREE_NS, { GLTFLoader });
window.THREE = THREE;
window.__appBooted = true;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_USER_SCALE = 0.5;
const MAX_USER_SCALE = 3;
const DRAG_START_PX = 6;
const ROTATE_RADIANS_PER_PX = (Math.PI * 2) / 700;
const XR8_LOAD_TIMEOUT_MS = 45000;
// Responsive scale: SLAM sizes the world so the phone starts this high above the ground. It only
// fixes the units of the world; image target poses and scales come in those same units.
const CAMERA_START_HEIGHT = 1.5;
// Anchor refinement: exponential approach to the latest target pose. 20/s is a ~50 ms time
// constant: it removes frame-to-frame jitter without a visible lag.
const SMOOTHING_RATE = 20;
// Re-anchoring: when the card is seen far from where the guardian stands (it was moved, or SLAM
// drifted), the guardian glides there with a slower ~200 ms time constant instead of jumping.
const GLIDE_RATE = 5;
const REANCHOR_DISTANCE = 0.35; // in figure heights
const REANCHOR_ANGLE = THREE_NS.MathUtils.degToRad(25);
const GLIDE_DONE_DISTANCE = 0.03; // in figure heights
// Upright mode: a target whose normal is within this angle of horizontal (held up, on a wall)
// gets the guardian standing on world up instead of sticking out sideways. Hysteresis avoids
// flipping back and forth around the threshold.
const UPRIGHT_ENTER_DEG = 35;
const UPRIGHT_EXIT_DEG = 42;
// In upright mode the feet stand slightly in front of the target plane so the figure does not
// sink into a wall (in figure heights).
const UPRIGHT_FRONT_OFFSET = 0.15;
// First anchor: a lower-priority target (the bare QR) waits this long in case the full card is
// recognised a moment later, so the guardian does not appear on the QR and then slide away.
const FIRST_ANCHOR_WAIT_MS = 250;
// After "Reiniciar", ignore detections for a moment so the vanish is visible before re-anchoring.
const RESET_COOLDOWN_MS = 700;
// Once anchored, a lower-priority target (the bare QR) may not move the anchor while the full card
// was seen this recently: pulling the card out of view often leaves only its QR in frame for a
// moment, and the guardian should not slide onto it.
const HIGHER_PRIORITY_GRACE_MS = 1500;
// SLAM "LIMITED" for this long (after anchoring) shows the "move slowly" hint.
const LIMITED_HINT_DELAY_MS = 1500;
const ANCHOR_TOAST_MS = 3800;
const APPEAR_MS = 700;
const DISAPPEAR_MS = 300;

const AXIS_X = new THREE_NS.Vector3(1, 0, 0);
const AXIS_Y = new THREE_NS.Vector3(0, 1, 0);
const AXIS_Z = new THREE_NS.Vector3(0, 0, 1);

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const $ = (sel) => document.querySelector(sel);
const screens = Array.from(document.querySelectorAll('[data-screen]'));

function showScreen(name) {
  screens.forEach((el) => { el.hidden = el.dataset.screen !== name; });
  document.body.classList.toggle('is-ar', name === 'ar');
}

function bindText(key, value) {
  document.querySelectorAll(`[data-bind="${key}"]`).forEach((el) => { el.textContent = value; });
}

function el(tag, text) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  return node;
}

/**
 * Shows the shared error/notice screen.
 * @param {{title: string, paragraphs?: string[], steps?: string[], url?: string,
 *          action?: {label: string, onClick: () => void}}} opts
 */
function showError(opts) {
  $('#error-title').textContent = opts.title;
  const body = $('#error-body');
  body.replaceChildren();
  (opts.paragraphs || []).forEach((p) => body.appendChild(el('p', p)));
  if (opts.steps && opts.steps.length) {
    const ol = el('ol');
    opts.steps.forEach((s) => ol.appendChild(el('li', s)));
    body.appendChild(ol);
  }

  const urlBox = $('#error-url');
  urlBox.hidden = !opts.url;
  if (opts.url) $('#error-url-text').textContent = opts.url;

  const retry = $('#btn-retry');
  retry.hidden = !opts.action;
  if (opts.action) {
    retry.textContent = opts.action.label;
    retry.onclick = opts.action.onClick;
  }
  showScreen('error');
}

const reload = () => window.location.reload();

// ---------------------------------------------------------------------------
// Guardian selection
// ---------------------------------------------------------------------------

const params = new URLSearchParams(window.location.search);
const requestedKey = (params.get('guardian') || DEFAULT_GUARDIAN).trim().toLowerCase();
const guardian = Object.prototype.hasOwnProperty.call(GUARDIANS, requestedKey) ? GUARDIANS[requestedKey] : null;

function pageUrlFor(key) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('guardian', key);
  return url.toString();
}

// ---------------------------------------------------------------------------
// Device checks
// ---------------------------------------------------------------------------

function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function looksLikeMobile() {
  const uaData = navigator.userAgentData;
  if (uaData && uaData.mobile === true) return true;
  if (/Android|iPhone|iPod|iPad|Mobile/i.test(navigator.userAgent)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1; // iPadOS reports as Mac
}

function showDesktopNotice() {
  showError({
    title: 'Ábrelo en tu celular',
    paragraphs: [
      `Esta experiencia usa la cámara trasera y los sensores de movimiento de un celular para encontrar la tarjeta de ${guardian ? guardian.name : 'tu guardián'}.`,
      'Escanea el código QR de la tarjeta o abre este enlace en el teléfono:',
    ],
    url: window.location.href,
  });
}

function showUnsupportedBrowser(XR8) {
  const allowed = { allowedDevices: XR8.XrConfig.device().MOBILE };
  const reasons = XR8.XrDevice.incompatibleReasons(allowed) || [];
  const details = XR8.XrDevice.incompatibleReasonDetails(allowed) || {};
  const R = XR8.XrDevice.IncompatibilityReasons;
  const os = (XR8.XrDevice.deviceEstimate() || {}).os;

  if (reasons.includes(R.UNSUPPORTED_OS) && !looksLikeMobile()) {
    showDesktopNotice();
    return;
  }
  const steps = [];
  if (details.inAppBrowser) {
    steps.push(`Estás dentro de ${details.inAppBrowser}. Toca el menú (··· o ⋮).`);
    steps.push(os === 'iOS' ? 'Elige «Abrir en Safari».' : 'Elige «Abrir en Chrome» o «Abrir en el navegador».');
  } else if (os === 'iOS') {
    steps.push('Abre este enlace en Safari (iOS 15 o superior).');
  } else {
    steps.push('Abre este enlace en Google Chrome actualizado.');
  }
  showError({
    title: 'Este navegador no es compatible',
    paragraphs: ['El navegador que estás usando no permite la realidad aumentada.'],
    steps,
    url: window.location.href,
  });
}

// ---------------------------------------------------------------------------
// XR8 + image target loading
// ---------------------------------------------------------------------------

function waitForXR8(timeoutMs) {
  return new Promise((resolve, reject) => {
    if (window.XR8) { resolve(window.XR8); return; }
    if (window.__xr8LoadFailed) { reject(new Error('xr8-network')); return; }
    const timer = setTimeout(() => reject(new Error('xr8-timeout')), timeoutMs);
    window.addEventListener('xrloaded', () => { clearTimeout(timer); resolve(window.XR8); }, { once: true });
    window.addEventListener('xr8loaderror', () => { clearTimeout(timer); reject(new Error('xr8-network')); }, { once: true });
  });
}

function showEngineLoadError() {
  showError({
    title: 'No se pudo cargar el motor AR',
    paragraphs: ['Revisa tu conexión a internet y vuelve a intentarlo.'],
    action: { label: 'Reintentar', onClick: reload },
  });
}

/**
 * Fetches every image target JSON of the guardian. Each imagePath
 * ("image-targets/<name>_luminance.jpg") is relative to the page, which is what XR8 resolves
 * it against, so GitHub Pages subpaths keep working.
 */
function loadTargetData() {
  return Promise.all(guardian.targets.map(async (cfg) => {
    const res = await fetch(cfg.data, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`target json ${cfg.data}: HTTP ${res.status}`);
    const data = await res.json();
    if (data.name !== cfg.name || !data.imagePath) {
      throw new Error(`unexpected target json ${cfg.data} (name "${data.name}")`);
    }
    return data;
  }));
}

const targetConfig = (name) => guardian.targets.find((t) => t.name === name) || null;
const maxTargetPriority = () => Math.max(...guardian.targets.map((t) => t.priority));

function showTargetLoadError(err) {
  console.error('[ancestrales] image target failed to load', err);
  showError({
    title: 'No se pudo preparar la tarjeta',
    paragraphs: ['Faltan los datos para reconocer la tarjeta. Revisa tu conexión y vuelve a intentarlo.'],
    action: { label: 'Reintentar', onClick: reload },
  });
}

// ---------------------------------------------------------------------------
// Procedural textures (no image files)
// ---------------------------------------------------------------------------

function makeRadialTexture(stops, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([offset, color]) => g.addColorStop(offset, color));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const shadowTexture = () => makeRadialTexture([
  [0, 'rgba(0,0,0,0.62)'],
  [0.35, 'rgba(0,0,0,0.38)'],
  [0.7, 'rgba(0,0,0,0.1)'],
  [1, 'rgba(0,0,0,0)'],
]);

const glowRingTexture = () => makeRadialTexture([
  [0, 'rgba(143,191,106,0)'],
  [0.58, 'rgba(143,191,106,0)'],
  [0.74, 'rgba(160,205,120,0.85)'],
  [0.8, 'rgba(226,195,90,0.6)'],
  [0.9, 'rgba(143,191,106,0.15)'],
  [1, 'rgba(143,191,106,0)'],
]);

// ---------------------------------------------------------------------------
// Easing / tweens
// ---------------------------------------------------------------------------

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t) => t * t * t;
const easeOutBack = (t) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const tweens = new Set();
function tween(durationMs, onStep, ease = easeOutCubic, onDone = null) {
  const t = { start: performance.now(), durationMs, onStep, ease, onDone };
  tweens.add(t);
  return t;
}
function cancelTween(t) {
  if (t) tweens.delete(t);
}
function runTweens(now) {
  tweens.forEach((t) => {
    const k = clamp((now - t.start) / t.durationMs, 0, 1);
    t.onStep(t.ease(k), k);
    if (k >= 1) {
      tweens.delete(t);
      if (t.onDone) t.onDone();
    }
  });
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

const state = {
  phase: 'idle', // idle | starting | searching | anchored
  xr: null, // {scene, camera, renderer}
  targetData: null, // parsed image target JSONs (one per entry in guardian.targets)
  targetDataPromise: null,
  modelTemplate: null,
  clips: [],
  modelPromise: null,
  anchor: null, // world anchor (smoothed): feet position, up/front axes, scale = figure height
  root: null, // guardian group: user rotation + size + appear animation
  shadow: null,
  ring: null,
  ringBase: 1,
  spirit: null,
  mixer: null,
  // Every target currently in view: name -> latest event detail.
  detections: new Map(),
  // The target that refines the anchor: the highest priority in view; at equal priority the
  // current one stays.
  driverName: null,
  anchored: false,
  // Where the guardian should stand, from the latest pose of the driving target (world space).
  goal: {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    size: 1, // figure height in world units (before the user's pinch)
    upright: false,
  },
  gliding: false,
  firstSeenAt: 0,
  topPrioritySeenAt: 0, // last time a highest-priority target (the card) was in view
  firstAnchorTimer: 0,
  resetUntil: 0,
  resetTimer: 0,
  appear: 0, // 0..1 scale factor of the appear/disappear animation
  appearTween: null,
  userScale: 1,
  userRotation: 0,
  gestureTipShown: false,
  tracking: { status: null, reason: null, limitedSince: 0, hintVisible: false },
  lastFrame: performance.now(),
};

const tmp = {
  pos: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  n: new THREE.Vector3(),
  u: new THREE.Vector3(),
  r: new THREE.Vector3(),
  up: new THREE.Vector3(),
  front: new THREE.Vector3(),
  side: new THREE.Vector3(),
  down: new THREE.Vector3(),
  m: new THREE.Matrix4(),
  scale: new THREE.Vector3(),
};

// ---------------------------------------------------------------------------
// Model loading
// ---------------------------------------------------------------------------

function loadModel() {
  if (state.modelPromise) return state.modelPromise;
  const loader = new GLTFLoader();
  state.modelPromise = new Promise((resolve, reject) => {
    loader.load(
      guardian.model,
      (gltf) => {
        state.modelTemplate = gltf.scene;
        state.clips = gltf.animations || [];
        resolve(gltf);
      },
      (evt) => {
        if (evt.lengthComputable && state.phase === 'starting') {
          $('#loading-sub').textContent = `Invocando a ${guardian.name}… ${Math.round((evt.loaded / evt.total) * 100)} %`;
        }
      },
      (err) => reject(err),
    );
  });
  return state.modelPromise;
}

function showModelError(err) {
  console.error('[ancestrales] model load failed', err);
  showError({
    title: `No pudimos invocar a ${guardian.name}`,
    paragraphs: ['El modelo 3D no se pudo cargar. Revisa tu conexión y vuelve a intentarlo.'],
    action: { label: 'Reintentar', onClick: reload },
  });
}

/**
 * Builds anchor (world pose of the feet; +Y = the guardian's up, +Z = its front; scale = figure
 * height) > root (user rotation/size) > normalized model of height 1 + contact shadow + glow ring
 * + spirit light.
 */
function buildGuardian() {
  const anchor = new THREE.Group();
  anchor.name = 'guardian-anchor';
  anchor.visible = false;

  // Key light lives in the anchor's frame: light comes from above and in front of the figure,
  // whatever the angle of the card it stands on.
  const key = new THREE.DirectionalLight(0xfff0d2, 2.2);
  key.position.set(0.8, 2, 1.4);
  anchor.add(key);
  anchor.add(key.target);

  const root = new THREE.Group();
  root.name = 'guardian-root';
  anchor.add(root);

  const model = state.modelTemplate;
  model.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false; // skinned meshes can be culled wrongly when their bounds are stale
      if (o.material && o.material.map) o.material.map.anisotropy = 4;
    }
  });

  // Normalize: feet on y = 0, centred on x/z, height = 1 (sized by the anchor's scale).
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const height = size.y > 1e-6 ? size.y : 1;
  const k = 1 / height;
  model.position.set(-center.x, -box.min.y, -center.z);
  const pivot = new THREE.Group();
  pivot.scale.setScalar(k);
  pivot.add(model);
  root.add(pivot);

  const footprint = Math.max(size.x, size.z, height * 0.35) * k;

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, toneMapped: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.006;
  shadow.scale.setScalar(footprint * 1.6);
  shadow.renderOrder = 1;
  root.add(shadow);

  const ring = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: glowRingTexture(), transparent: true, depthWrite: false, toneMapped: false,
      blending: THREE.AdditiveBlending, opacity: 0.35,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.01;
  ring.scale.setScalar(footprint * 2.2);
  ring.renderOrder = 2;
  root.add(ring);

  // Faint green light near the feet: the "spirit" glow of the river. Its range and intensity are
  // rescaled every frame (see updateSpiritLight) because world units depend on SLAM's scale.
  const spirit = new THREE.PointLight(0x8fbf6a, 0.35, 2.5, 2);
  spirit.position.set(0, 0.15, 0.25);
  root.add(spirit);

  if (state.clips.length) {
    state.mixer = new THREE.AnimationMixer(model);
    const wanted = (guardian.idleClip || 'idle').toLowerCase();
    const clip = state.clips.find((c) => c.name.toLowerCase() === wanted)
      || state.clips.find((c) => c.name.toLowerCase().includes('idle'))
      || state.clips[0];
    state.mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
    console.info(`[ancestrales] playing clip "${clip.name}"`);
  } else {
    console.info('[ancestrales] model has no animations');
  }

  state.anchor = anchor;
  state.root = root;
  state.shadow = shadow;
  state.ring = ring;
  state.ringBase = ring.scale.x;
  state.spirit = spirit;
  return anchor;
}

// Reference size the spirit light was tuned for (the original 0.3 m tall figure).
const SPIRIT_REFERENCE_HEIGHT = 0.3;
const SPIRIT_REFERENCE_INTENSITY = 0.35;

function updateSpiritLight() {
  // Figure height in world units = root's world scale (the model is normalized to height 1).
  const h = state.root.getWorldScale(tmp.scale).x;
  if (!(h > 1e-6)) return;
  const s = h / SPIRIT_REFERENCE_HEIGHT;
  state.spirit.distance = 2.5 * h;
  state.spirit.intensity = SPIRIT_REFERENCE_INTENSITY * s * s; // keeps the look of the 1/d² falloff
}

// ---------------------------------------------------------------------------
// Scene setup (runs once XR8.Threejs has created scene/camera/renderer)
// ---------------------------------------------------------------------------

function initScene() {
  const { scene, camera, renderer } = state.xr;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const hemi = new THREE.HemisphereLight(0xe8eedc, 0x2b3325, 1.6);
  scene.add(hemi);

  // Start the camera at a known height so the responsive SLAM scale is predictable.
  camera.position.set(0, CAMERA_START_HEIGHT, 0);
  window.XR8.XrController.updateCameraProjectionMatrix({
    origin: camera.position,
    facing: camera.quaternion,
  });
}

function ensureGuardian() {
  if (!state.anchor && state.modelTemplate && state.xr) state.xr.scene.add(buildGuardian());
  return state.anchor;
}

// ---------------------------------------------------------------------------
// Anchoring: image target pose (world space, thanks to SLAM) -> where the guardian stands
// ---------------------------------------------------------------------------

/**
 * Turns an image target pose into the guardian's standing pose, written into `out`.
 *
 * 8th Wall image target frame: the image lies in its local XY plane, +Y towards its top edge,
 * +Z out of the printed face; detail.scale = the image's height in world units.
 *
 * - Lying flat-ish (table, tilted in the hand): feet on the target plane at footOffset along its
 *   vertical axis, up = the target's normal, front = towards its bottom edge (the viewer).
 * - Roughly vertical (normal within ~35° of horizontal: held up, on a wall) or facing down:
 *   standing on world up instead, on the target's lowest edge, a little in front of it, facing
 *   out of the printed face. Sticking out sideways from a wall would read as a mistake.
 */
function computeStandPose(detail, cfg, wasUpright, out) {
  const s = detail.scale || 1;
  const widthRatio = detail.scaledWidth && detail.scaledHeight ? detail.scaledWidth / detail.scaledHeight : 0.75;
  const width = s * widthRatio;
  tmp.pos.set(detail.position.x, detail.position.y, detail.position.z);
  tmp.quat.set(detail.rotation.x, detail.rotation.y, detail.rotation.z, detail.rotation.w).normalize();
  const n = tmp.n.copy(AXIS_Z).applyQuaternion(tmp.quat);
  const u = tmp.u.copy(AXIS_Y).applyQuaternion(tmp.quat);
  const r = tmp.r.copy(AXIS_X).applyQuaternion(tmp.quat);

  out.size = width * cfg.heightOnCard;

  // Elevation of the normal above the horizon: 90° = face up on a table, 0° = on a wall.
  const elevation = THREE.MathUtils.radToDeg(Math.asin(clamp(n.y, -1, 1)));
  const upright = elevation < (wasUpright ? UPRIGHT_EXIT_DEG : UPRIGHT_ENTER_DEG);
  out.upright = upright;

  const up = tmp.up;
  const front = tmp.front;
  if (!upright) {
    out.position.copy(tmp.pos).addScaledVector(u, cfg.footOffset * s);
    up.copy(n);
    front.copy(u).negate();
  } else {
    up.copy(AXIS_Y);
    // Face out of the printed face, flattened onto the floor plane.
    front.set(n.x, 0, n.z);
    if (front.lengthSq() < 1e-6) front.set(-u.x, 0, -u.z); // facing straight down: fall back to the bottom edge
    if (front.lengthSq() < 1e-6) front.set(0, 0, 1);
    front.normalize();
    // Lowest edge of the target: world down projected onto the target plane.
    const down = tmp.down.set(0, -1, 0).addScaledVector(n, n.y); // -Y - n * (n · -Y)
    out.position.copy(tmp.pos);
    if (down.lengthSq() > 1e-6) {
      down.normalize();
      const halfExtent = 0.5 * (Math.abs(down.dot(u)) * s + Math.abs(down.dot(r)) * width);
      out.position.addScaledVector(down, halfExtent);
    }
    out.position.addScaledVector(front, UPRIGHT_FRONT_OFFSET * out.size);
  }
  // Orthonormal basis (side, up, front) -> rotation of the guardian's frame.
  const side = tmp.side.crossVectors(up, front).normalize();
  front.crossVectors(side, up).normalize();
  tmp.m.makeBasis(side, up, front);
  out.quaternion.setFromRotationMatrix(tmp.m);
  return out;
}

function snapAnchorToGoal() {
  const a = state.anchor;
  if (!a) return;
  a.position.copy(state.goal.position);
  a.quaternion.copy(state.goal.quaternion);
  a.scale.setScalar(state.goal.size);
  state.gliding = false;
  applyStandMode();
}

/** Flat on a surface: full contact shadow. Upright at a card's edge: lighter, it has no floor. */
function applyStandMode() {
  if (state.shadow) state.shadow.material.opacity = state.goal.upright ? 0.45 : 1;
}

function applyScale() {
  if (!state.root) return;
  state.root.scale.setScalar(state.userScale * Math.max(state.appear, 0.001));
}

/** Frame-rate independent exponential approach of the anchor to the goal pose. */
function followGoal(dt) {
  const a = state.anchor;
  const g = state.goal;
  const size = Math.max(g.size, 1e-6);
  const dist = a.position.distanceTo(g.position) / size;
  if (!state.gliding && (dist > REANCHOR_DISTANCE || a.quaternion.angleTo(g.quaternion) > REANCHOR_ANGLE)) {
    state.gliding = true;
    console.info('[ancestrales] re-anchoring: gliding to the new target pose');
  } else if (state.gliding && dist < GLIDE_DONE_DISTANCE) {
    state.gliding = false;
  }
  const alpha = 1 - Math.exp(-(state.gliding ? GLIDE_RATE : SMOOTHING_RATE) * dt);
  a.position.lerp(g.position, alpha);
  a.quaternion.slerp(g.quaternion, alpha);
  a.scale.setScalar(a.scale.x + (g.size - a.scale.x) * alpha);
}

/** Bounce in with the ring flash, at the goal pose. */
function spawnGuardian() {
  if (!ensureGuardian()) return; // model still loading: called again once it arrives
  snapAnchorToGoal();
  state.anchor.visible = true;
  state.appear = 0;
  applyScale();
  cancelTween(state.appearTween);
  state.appearTween = tween(APPEAR_MS, (e) => {
    state.appear = e;
    applyScale();
  }, easeOutBack);
  tween(1400, (e) => {
    state.ring.material.opacity = 0.35 + (1 - e) * 0.65;
    state.ring.scale.setScalar(state.ringBase * (0.6 + e * 0.4));
  });
  setPhase('anchored');
  showAnchoredToast();
  console.info('[ancestrales] guardian anchored at', state.goal.position.toArray().map((v) => v.toFixed(3)).join(', '),
    state.goal.upright ? '(upright)' : '(on the target plane)');
}

function vanishGuardian() {
  if (!state.anchor || !state.anchor.visible) return;
  const from = state.appear;
  cancelTween(state.appearTween);
  state.appearTween = tween(DISAPPEAR_MS, (e) => {
    state.appear = from * (1 - e);
    applyScale();
  }, easeInCubic, () => {
    state.anchor.visible = false;
    state.appearTween = null;
  });
}

/** Picks which target in view refines the anchor: highest priority; ties keep the current one. */
function pickDriver() {
  let best = null;
  state.detections.forEach((_, name) => {
    const cfg = targetConfig(name);
    if (!best || cfg.priority > targetConfig(best).priority
        || (cfg.priority === targetConfig(best).priority && name === state.driverName)) best = name;
  });
  return best;
}

/** Feeds the latest detections into the anchor (first anchor, refinement or re-anchoring). */
function updateFromDetections() {
  if (state.phase !== 'searching' && state.phase !== 'anchored') return;
  if (performance.now() < state.resetUntil) return;
  const name = pickDriver();
  if (!name) return;
  if (name !== state.driverName) {
    state.driverName = name;
    console.info('[ancestrales] anchor driven by target:', name);
  }
  const cfg = targetConfig(name);
  if (cfg.priority >= maxTargetPriority()) state.topPrioritySeenAt = performance.now();

  if (!state.anchored) {
    // Card priority for the first anchor: a lower-priority target waits a moment for the card.
    if (cfg.priority < maxTargetPriority()) {
      const now = performance.now();
      if (!state.firstSeenAt) state.firstSeenAt = now;
      const wait = FIRST_ANCHOR_WAIT_MS - (now - state.firstSeenAt);
      if (wait > 0) {
        if (!state.firstAnchorTimer) {
          state.firstAnchorTimer = setTimeout(() => { state.firstAnchorTimer = 0; updateFromDetections(); }, wait + 10);
        }
        return;
      }
    }
    computeStandPose(state.detections.get(name), cfg, false, state.goal);
    state.anchored = true;
    state.firstSeenAt = 0;
    spawnGuardian();
    return;
  }

  if (cfg.priority < maxTargetPriority()
      && performance.now() - state.topPrioritySeenAt < HIGHER_PRIORITY_GRACE_MS) return;
  computeStandPose(state.detections.get(name), cfg, state.goal.upright, state.goal);
  if (state.anchor && state.anchor.visible) applyStandMode();
}

function onImageFound({ detail }) {
  if (!detail || !targetConfig(detail.name)) return;
  console.info('[ancestrales] image found:', detail.name);
  state.detections.set(detail.name, detail);
  updateFromDetections();
}

function onImageUpdated({ detail }) {
  if (!detail || !targetConfig(detail.name)) return;
  state.detections.set(detail.name, detail);
  updateFromDetections();
}

function onImageLost({ detail }) {
  if (!detail || !targetConfig(detail.name)) return;
  // The guardian stays where it is: SLAM keeps its world pose fixed while the user moves around.
  console.info('[ancestrales] image lost:', detail.name, state.anchored ? '(guardian stays anchored)' : '');
  if (targetConfig(detail.name).priority >= maxTargetPriority()) state.topPrioritySeenAt = performance.now();
  state.detections.delete(detail.name);
  if (detail.name === state.driverName) state.driverName = null;
  if (!state.detections.size) state.firstSeenAt = 0;
}

function onTrackingStatus({ detail }) {
  if (!detail) return;
  const t = state.tracking;
  if (detail.status !== t.status || detail.reason !== t.reason) {
    console.info('[ancestrales] world tracking:', detail.status, detail.reason || '');
  }
  if (detail.status === 'LIMITED' && t.status !== 'LIMITED') t.limitedSince = performance.now();
  t.status = detail.status;
  t.reason = detail.reason;
}

function updateTrackingHint(now) {
  const t = state.tracking;
  const show = state.anchored && t.status === 'LIMITED' && now - t.limitedSince > LIMITED_HINT_DELAY_MS;
  if (show === t.hintVisible) return;
  t.hintVisible = show;
  $('#tracking-hint').classList.toggle('is-visible', show);
}

// ---------------------------------------------------------------------------
// Gestures: one finger rotates about the guardian's up axis, two fingers scale.
// ---------------------------------------------------------------------------

const pointers = new Map();
let gesture = null;

function pointerDistance() {
  const [a, b] = Array.from(pointers.values());
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function applyUserRotation() {
  if (state.root) state.root.rotation.y = state.userRotation;
}

function onPointerDown(e) {
  if (!document.body.classList.contains('is-ar')) return;
  e.preventDefault();
  try { e.target.setPointerCapture(e.pointerId); } catch (_) { /* not all targets support capture */ }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 1) {
    gesture = { type: 'pending', startX: e.clientX, startRot: state.userRotation, startY: e.clientY };
  } else if (pointers.size === 2) {
    gesture = { type: 'pinch', startDist: Math.max(pointerDistance(), 1), startScale: state.userScale };
  }
}

function onPointerMove(e) {
  if (!pointers.has(e.pointerId) || !gesture) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (gesture.type === 'pinch' && pointers.size >= 2) {
    state.userScale = clamp(gesture.startScale * (pointerDistance() / gesture.startDist), MIN_USER_SCALE, MAX_USER_SCALE);
    applyScale();
    return;
  }
  if (pointers.size === 1 && (gesture.type === 'pending' || gesture.type === 'rotate')) {
    const dx = e.clientX - gesture.startX;
    const dy = e.clientY - gesture.startY;
    if (gesture.type === 'pending' && Math.hypot(dx, dy) > DRAG_START_PX) gesture.type = 'rotate';
    if (gesture.type === 'rotate') {
      state.userRotation = gesture.startRot + dx * ROTATE_RADIANS_PER_PX;
      applyUserRotation();
    }
  }
}

function onPointerUp(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  // After a pinch, ignore the remaining finger until everything is lifted (avoids a jump).
  if (pointers.size === 0) gesture = null;
  else if (gesture && gesture.type === 'pinch') gesture = { type: 'ignore' };
}

function bindGestures(canvas) {
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  // iOS Safari: block page zoom gestures while AR runs.
  ['gesturestart', 'gesturechange'].forEach((type) => document.addEventListener(type, (ev) => {
    if (document.body.classList.contains('is-ar')) ev.preventDefault();
  }));
}

// ---------------------------------------------------------------------------
// UI phases and messages
// ---------------------------------------------------------------------------

/** Fades a message in, keeps it `ms`, fades it out, then runs `next`. */
function flashMessage(elem, ms, next) {
  clearTimeout(elem._timer);
  elem.hidden = false;
  elem.classList.remove('is-fading');
  elem._timer = setTimeout(() => {
    elem.classList.add('is-fading');
    elem._timer = setTimeout(() => {
      elem.hidden = true;
      if (next) next();
    }, 450);
  }, ms);
}

function hideMessage(elem) {
  clearTimeout(elem._timer);
  elem.hidden = true;
  elem.classList.remove('is-fading');
}

function showAnchoredToast() {
  hideMessage($('#gesture-tip'));
  flashMessage($('#anchor-toast'), ANCHOR_TOAST_MS, () => {
    if (!state.gestureTipShown && state.phase === 'anchored') {
      state.gestureTipShown = true;
      flashMessage($('#gesture-tip'), 5500);
    }
  });
}

function setPhase(phase) {
  state.phase = phase;
  $('#coach').classList.toggle('is-hidden', phase === 'anchored');
  document.body.dataset.phase = phase;
}

/** "Reiniciar": remove the guardian, forget the anchor and the user's rotation and size. */
function resetScene() {
  if (state.phase !== 'searching' && state.phase !== 'anchored') return;
  state.anchored = false;
  state.driverName = null;
  state.gliding = false;
  state.firstSeenAt = 0;
  clearTimeout(state.firstAnchorTimer);
  state.firstAnchorTimer = 0;
  state.userScale = 1;
  state.userRotation = 0;
  applyUserRotation();
  vanishGuardian();
  hideMessage($('#anchor-toast'));
  hideMessage($('#gesture-tip'));
  setPhase('searching');
  // A card still in view re-anchors once the vanish has played (imageupdated keeps coming while
  // it moves; the timer covers a card held perfectly still).
  state.resetUntil = performance.now() + RESET_COOLDOWN_MS;
  clearTimeout(state.resetTimer);
  state.resetTimer = setTimeout(updateFromDetections, RESET_COOLDOWN_MS + 20);
  console.info('[ancestrales] reset: anchor cleared');
}

// ---------------------------------------------------------------------------
// Pipeline modules
// ---------------------------------------------------------------------------

/** Keeps the canvas drawing buffer matched to the window (our own replacement for a full-window helper). */
function canvasSizerModule(canvas) {
  const fit = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(window.innerWidth * dpr);
    const h = Math.round(window.innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };
  const onResize = () => requestAnimationFrame(fit);
  return {
    name: 'ancestrales-canvas-sizer',
    onAttach: () => {
      fit();
      window.addEventListener('resize', onResize);
    },
    onDetach: () => window.removeEventListener('resize', onResize),
    onDeviceOrientationChange: onResize,
    onCameraStatusChange: ({ status }) => { if (status === 'hasVideo') fit(); },
  };
}

function appModule() {
  return {
    name: 'ancestrales',
    onStart: () => {
      state.xr = window.XR8.Threejs.xrScene();
      initScene();
      console.info('[ancestrales] XR8 pipeline started, three r' + THREE.REVISION);
    },
    onCameraStatusChange: ({ status, reason }) => {
      console.info('[ancestrales] camera status:', status, reason ? String(reason.name || reason) : '');
      if (status === 'requesting') {
        $('#loading-text').textContent = 'Permite el acceso a la cámara';
      } else if (status === 'hasStream') {
        $('#loading-text').textContent = 'Despertando al guardián…';
      } else if (status === 'hasVideo') {
        showScreen('ar');
        setPhase('searching');
        loadModel().then(() => {
          // The card may have been anchored while the model was still downloading.
          if (state.anchored && (!state.anchor || !state.anchor.visible)) spawnGuardian();
        }).catch(showModelError);
      } else if (status === 'failed') {
        showPermissionDenied();
      }
    },
    onUpdate: () => {
      const now = performance.now();
      const dt = Math.min((now - state.lastFrame) / 1000, 0.1);
      state.lastFrame = now;

      runTweens(now);
      updateTrackingHint(now);
      if (!state.anchor || !state.anchor.visible) return;

      if (state.anchored) followGoal(dt);
      updateSpiritLight();
      if (state.mixer) state.mixer.update(dt);

      // Gentle breathing of the glow ring once the guardian is standing.
      if (state.phase === 'anchored' && tweens.size === 0) {
        state.ring.material.opacity = 0.28 + 0.1 * Math.sin(now / 900);
      }
    },
    onException: (err) => {
      console.error('[ancestrales] XR exception', err);
      if (err && err.type === 'permission') {
        showPermissionDenied(err.permission);
        return;
      }
      showError({
        title: 'La realidad aumentada se detuvo',
        paragraphs: ['Ocurrió un problema con la cámara o los sensores. Vuelve a intentarlo.'],
        action: { label: 'Reintentar', onClick: reload },
      });
    },
    listeners: [
      {
        event: 'reality.imageloading',
        process: ({ detail }) => {
          console.info('[ancestrales] image targets loading:', (detail.imageTargets || []).map((t) => t.name).join(', '));
        },
      },
      {
        event: 'reality.imagescanning',
        process: ({ detail }) => {
          console.info('[ancestrales] image targets scanning:', (detail.imageTargets || []).map((t) => t.name).join(', '));
        },
      },
      { event: 'reality.imagefound', process: onImageFound },
      { event: 'reality.imageupdated', process: onImageUpdated },
      { event: 'reality.imagelost', process: onImageLost },
      { event: 'reality.trackingstatus', process: onTrackingStatus },
    ],
  };
}

let permissionScreenShown = false;
/** `permission` is the engine's name for what failed ('devicemotion', 'deviceorientation', 'prompt', 'camera'…). */
function showPermissionDenied(permission) {
  if (permissionScreenShown) return;
  permissionScreenShown = true;
  try { window.XR8.stop(); } catch (_) { /* already stopped */ }
  const ios = isIOS();
  const motion = /motion|orientation|prompt/i.test(String(permission || ''));
  if (motion) {
    showError({
      title: 'Necesitamos los sensores de movimiento',
      paragraphs: [`Para que ${guardian.name} se quede en su sitio mientras te mueves, el navegador tiene que poder leer el movimiento del celular.`],
      steps: ios
        ? ['Toca Reintentar y luego Iniciar AR; cuando Safari pregunte por el movimiento, elige «Permitir».', 'Si ya no aparece la pregunta: cierra esta pestaña de Safari, vuelve a abrir el enlace y toca Iniciar AR.']
        : ['Toca el ícono junto a la dirección de la página.', 'En Permisos, activa «Sensores de movimiento».', 'Toca Reintentar.'],
      action: { label: 'Reintentar', onClick: reload },
    });
    return;
  }
  showError({
    title: 'No pudimos abrir la cámara',
    paragraphs: [`Para ver a ${guardian.name} tienes que permitir el acceso a la cámara trasera. Revisa también que ninguna otra app la esté usando.`],
    steps: ios
      ? ['Abre Ajustes › Safari › Cámara y elige «Permitir».', 'Vuelve aquí y toca Reintentar.']
      : ['Toca el ícono junto a la dirección de la página.', 'En Permisos, activa la Cámara.', 'Toca Reintentar.'],
    action: { label: 'Reintentar', onClick: reload },
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

/**
 * iOS 13+ only grants motion sensors from inside a user gesture, so ask right on the tap.
 * Elsewhere (Android) there is no prompt and this resolves to [] at once.
 */
function requestMotionPermission() {
  const asks = [];
  [window.DeviceMotionEvent, window.DeviceOrientationEvent].forEach((Api) => {
    if (Api && typeof Api.requestPermission === 'function') {
      asks.push(Api.requestPermission().catch((err) => {
        console.warn('[ancestrales] motion permission request failed', err);
        return 'denied';
      }));
    }
  });
  return Promise.all(asks);
}

function startAR(XR8) {
  if (state.phase !== 'idle') return;
  state.phase = 'starting';

  const motion = requestMotionPermission(); // must be called synchronously inside the tap
  showScreen('loading');
  $('#loading-text').textContent = 'Abriendo la cámara…';

  motion.then((results) => {
    if (results.includes('denied')) {
      console.warn('[ancestrales] motion permission denied');
      showPermissionDenied('devicemotion');
    }
  });

  const canvas = $('#ar-canvas');
  bindGestures(canvas);
  $('#btn-reset').addEventListener('click', resetScene);

  // World tracking (SLAM) together with image targets: the card only places the guardian; SLAM
  // then keeps it fixed in the room even when the card leaves the view.
  // scale 'responsive' (the default) is the one that works with image targets in any space: units
  // follow CAMERA_START_HEIGHT and the target's pose/scale come in those same units. 'absolute'
  // (metric) needs an extra calibration walk and adds nothing here, since the guardian is sized
  // from the card anyway.
  XR8.XrController.configure({
    disableWorldTracking: false,
    scale: 'responsive',
    imageTargetData: state.targetData,
  });
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(),
    XR8.XrController.pipelineModule(),
    canvasSizerModule(canvas),
    appModule(),
  ]);

  try {
    XR8.run({
      canvas,
      allowedDevices: XR8.XrConfig.device().MOBILE,
      cameraConfig: { direction: XR8.XrConfig.camera().BACK },
    });
  } catch (err) {
    console.error('[ancestrales] XR8.run failed', err);
    showError({
      title: 'No se pudo iniciar la cámara',
      paragraphs: ['Cierra otras apps que estén usando la cámara y vuelve a intentarlo.'],
      action: { label: 'Reintentar', onClick: reload },
    });
  }
}

function boot() {
  if (!guardian) {
    showError({
      title: 'Guardián no encontrado',
      paragraphs: [
        `El código «${requestedKey}» no corresponde a ningún guardián de Ancestrales.`,
        'Revisa que hayas escaneado el QR de tu tarjeta.',
      ],
      action: { label: 'Ver a El Mohán', onClick: () => { window.location.href = pageUrlFor('mohan'); } },
    });
    return;
  }

  bindText('guardian-name', guardian.name);
  bindText('guardian-tagline', guardian.tagline);
  document.title = `${guardian.name} · Ancestrales AR`;

  if (!looksLikeMobile()) {
    showDesktopNotice();
    return;
  }

  showScreen('start');
  const btn = $('#btn-start');
  const status = $('#start-status');

  state.targetDataPromise = loadTargetData();
  state.targetDataPromise.catch(() => { /* reported below */ });

  waitForXR8(XR8_LOAD_TIMEOUT_MS).then((XR8) => {
    const compatible = XR8.XrDevice.isDeviceBrowserCompatible({ allowedDevices: XR8.XrConfig.device().MOBILE });
    if (!compatible) {
      showUnsupportedBrowser(XR8);
      return;
    }
    loadModel().catch(() => { /* reported once AR starts */ });
    state.targetDataPromise.then((data) => {
      state.targetData = data;
      btn.disabled = false;
      btn.querySelector('.btn__label').textContent = 'Iniciar AR';
      status.textContent = 'Ten a mano la tarjeta. Funciona mejor con buena luz.';
      btn.addEventListener('click', () => startAR(XR8), { once: true });
      console.info('[ancestrales] XR8 ready', typeof XR8.version === 'function' ? XR8.version() : '', '· targets', data.map((d) => d.name).join(', '));
    }).catch(showTargetLoadError);
  }).catch((err) => {
    console.error('[ancestrales] XR8 failed to load', err);
    showEngineLoadError();
  });
}

$('#btn-copy').addEventListener('click', async () => {
  const btn = $('#btn-copy');
  const text = $('#error-url-text').textContent;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Enlace copiado';
  } catch (_) {
    const range = document.createRange();
    range.selectNodeContents($('#error-url-text'));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    btn.textContent = 'Selecciónalo y cópialo';
  }
});

// Test/debug hook: read-only view of the anchoring state (no behaviour depends on it).
window.__ancestrales = {
  get phase() { return state.phase; },
  get anchored() { return state.anchored; },
  get guardianVisible() { return !!(state.anchor && state.anchor.visible); },
  get appear() { return state.appear; },
  get upright() { return state.goal.upright; },
  get anchorPosition() { return state.anchor ? state.anchor.position.toArray() : null; },
  get cameraPosition() { return state.xr ? state.xr.camera.position.toArray() : null; },
  get cameraEulerDeg() {
    if (!state.xr) return null;
    const e = new THREE.Euler().setFromQuaternion(state.xr.camera.quaternion, 'YXZ');
    return [e.x, e.y, e.z].map(THREE.MathUtils.radToDeg);
  },
  get anchorNdc() {
    if (!state.anchor || !state.xr) return null;
    return state.anchor.position.clone().project(state.xr.camera).toArray();
  },
  get detections() { return Array.from(state.detections.keys()); },
  get tracking() { return { ...state.tracking }; },
  computeStandPose: (detail, cfgName, wasUpright = false) => {
    const out = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), size: 1, upright: false };
    computeStandPose(detail, targetConfig(cfgName), wasUpright, out);
    return { position: out.position.toArray(), quaternion: out.quaternion.toArray(), size: out.size, upright: out.upright };
  },
};

boot();
