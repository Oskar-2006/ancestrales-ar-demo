// Ancestrales AR — the guardian stands on its printed card (8th Wall image target) with three.js.
//
// Wiring overview:
//   1. three.js is loaded as ES modules (import map in index.html). XR8.Threejs expects a
//      global window.THREE, so a plain copy of the namespace (plus GLTFLoader) is exposed.
//   2. xr.js (8th Wall engine binary) loads async and fires 'xrloaded' when window.XR8 exists.
//      In parallel the guardian's image target JSON (built by tools/build_image_target.js) is fetched.
//   3. On "Iniciar AR" (a user gesture) the camera pipeline is assembled and XR8.run({canvas}) starts:
//        GlTextureRenderer  draws the camera feed into the canvas
//        Threejs            creates scene / camera / renderer
//        XrController       image target detection + tracking (world tracking disabled, see startAR)
//        canvas sizer       ours: keeps the canvas at window size
//        app module         ours: scene content, image target events, gestures, UI state
//   4. 'reality.imagefound' / 'imageupdated' / 'imagelost' drive an anchor group that follows the
//      active target (the whole card, or the QR alone); the guardian stands on it with
//      "up" = the target's normal.

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
// Pose smoothing: exponential approach to the latest tracked pose. 20/s is a ~50 ms time
// constant: it removes frame-to-frame jitter but still follows a card moved by hand.
const SMOOTHING_RATE = 20;
// If the card jumps further than this (in card heights) we snap instead of gliding across the screen.
const SNAP_DISTANCE = 0.6;
// Short tracking dropouts (motion blur, a finger over the card) should not make the guardian blink.
const LOST_GRACE_MS = 500;
const APPEAR_MS = 700;
const DISAPPEAR_MS = 300;

// Image target frame (8th Wall): the card lies in the target's local XY plane, +Y towards the
// card's top edge, +Z out of the printed face; 1 unit = the card's height (detail.scale).
// The model's own frame: +Y up, +Z its front. Rotating +90° about X maps model up -> card
// normal and model front -> -Y, i.e. it faces out of the card's bottom edge, towards the viewer.
const STAND_ROTATION_X = Math.PI / 2;

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
      `Esta experiencia usa la cámara trasera de un celular para encontrar la tarjeta de ${guardian ? guardian.name : 'tu guardián'}.`,
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
  phase: 'idle', // idle | starting | searching | tracking
  xr: null, // {scene, camera, renderer}
  targetData: null, // parsed image target JSONs (one per entry in guardian.targets)
  targetDataPromise: null,
  modelTemplate: null,
  clips: [],
  modelPromise: null,
  anchor: null, // follows the card pose (smoothed); scale = card height
  stand: null, // rotates the guardian upright on the card plane
  root: null, // guardian group: user rotation + size
  ring: null,
  ringBase: 1,
  spirit: null,
  mixer: null,
  // Every target currently in view: name -> latest event detail.
  detections: new Map(),
  // The target the guardian stands on: the highest priority in view; at equal priority the first
  // one found stays while it remains in view.
  activeName: null,
  activeConfig: null,
  // Latest pose of the active target.
  target: {
    seen: false, // currently detected (or within the lost grace period)
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: 1,
    widthRatio: 0.75, // card width / card height
  },
  lostTimer: 0,
  appear: 0, // 0..1 scale factor of the appear/disappear animation
  appearTween: null,
  userScale: 1,
  userRotation: 0,
  gestureTipShown: false,
  lastFrame: performance.now(),
};

const tmpVec = new THREE.Vector3();

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
 * Builds anchor (card pose) > stand (upright on the card) > root (user rotation/size) >
 * normalized model of height 1 + contact shadow + glow ring + rim light.
 */
function buildGuardian() {
  const anchor = new THREE.Group();
  anchor.name = 'card-anchor';
  anchor.visible = false;

  const stand = new THREE.Group();
  stand.name = 'card-stand';
  stand.rotation.x = STAND_ROTATION_X;
  // Where the feet stand along the target's vertical axis (target spans -0.5..0.5 in y).
  stand.position.set(0, state.activeConfig ? state.activeConfig.footOffset : 0, 0);
  anchor.add(stand);

  // Key light lives in the card's frame: light comes from above the card and in front of the
  // figure, whatever the card's angle to the phone.
  const key = new THREE.DirectionalLight(0xfff0d2, 2.2);
  key.position.set(0.8, 2, 1.4);
  stand.add(key);
  stand.add(key.target);

  const root = new THREE.Group();
  root.name = 'guardian-root';
  stand.add(root);

  const model = state.modelTemplate;
  model.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false; // skinned meshes can be culled wrongly when their bounds are stale
      if (o.material && o.material.map) o.material.map.anisotropy = 4;
    }
  });

  // Normalize: feet on y = 0, centred on x/z, height = 1 (sized against the card later).
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
  // rescaled every frame (see updateSpiritLight) because the card's world units are not metres.
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
  state.stand = stand;
  state.root = root;
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
  const h = state.root.getWorldScale(tmpVec).x;
  if (!(h > 1e-6)) return;
  const s = h / SPIRIT_REFERENCE_HEIGHT;
  state.spirit.distance = 2.5 * h;
  state.spirit.intensity = SPIRIT_REFERENCE_INTENSITY * s * s; // keeps the look of the 1/d² falloff
}

// ---------------------------------------------------------------------------
// Scene setup (runs once XR8.Threejs has created scene/camera/renderer)
// ---------------------------------------------------------------------------

function initScene() {
  const { scene, renderer } = state.xr;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const hemi = new THREE.HemisphereLight(0xe8eedc, 0x2b3325, 1.6);
  scene.add(hemi);
}

function ensureGuardian() {
  if (!state.anchor && state.modelTemplate && state.xr) state.xr.scene.add(buildGuardian());
  return state.anchor;
}

// ---------------------------------------------------------------------------
// Image target tracking
// ---------------------------------------------------------------------------

function applyScale() {
  if (!state.root) return;
  // Figure height = target width * heightOnCard (anchor units are target heights).
  const heightOnCard = state.activeConfig ? state.activeConfig.heightOnCard : 1;
  const base = state.target.widthRatio * heightOnCard;
  state.root.scale.setScalar(base * state.userScale * Math.max(state.appear, 0.001));
}

function readTargetPose(detail) {
  const t = state.target;
  t.position.set(detail.position.x, detail.position.y, detail.position.z);
  t.quaternion.set(detail.rotation.x, detail.rotation.y, detail.rotation.z, detail.rotation.w).normalize();
  t.scale = detail.scale || 1;
  if (detail.scaledWidth && detail.scaledHeight) t.widthRatio = detail.scaledWidth / detail.scaledHeight;
}

function snapAnchorToTarget() {
  const a = state.anchor;
  a.position.copy(state.target.position);
  a.quaternion.copy(state.target.quaternion);
  a.scale.setScalar(state.target.scale);
}

/** Bounce in (or resume from a half-finished disappear) with the ring flash. */
function appear() {
  if (!ensureGuardian()) return; // model still loading: called again once it arrives
  const from = state.appear;
  if (!state.anchor.visible || from < 0.05) snapAnchorToTarget();
  state.anchor.visible = true;
  cancelTween(state.appearTween);
  state.appearTween = tween(from < 0.5 ? APPEAR_MS : APPEAR_MS * 0.6, (e) => {
    state.appear = from + (1 - from) * e;
    applyScale();
  }, easeOutBack);
  if (from < 0.5) {
    tween(1400, (e) => {
      state.ring.material.opacity = 0.35 + (1 - e) * 0.65;
      state.ring.scale.setScalar(state.ringBase * (0.6 + e * 0.4));
    });
  }
  setPhase('tracking');
  if (!state.gestureTipShown) {
    state.gestureTipShown = true;
    showGestureTip();
  }
}

function disappear() {
  if (!state.anchor || !state.anchor.visible) {
    setPhase('searching');
    return;
  }
  const from = state.appear;
  cancelTween(state.appearTween);
  state.appearTween = tween(DISAPPEAR_MS, (e) => {
    state.appear = from * (1 - e);
    applyScale();
  }, easeInCubic, () => {
    state.anchor.visible = false;
    state.appearTween = null;
  });
  setPhase('searching');
}

/** Makes `name` (already in state.detections) the target the guardian stands on. */
function activateTarget(name) {
  state.activeName = name;
  state.activeConfig = targetConfig(name);
  readTargetPose(state.detections.get(name));
  if (state.stand) state.stand.position.y = state.activeConfig.footOffset;
  applyScale();
  console.info('[ancestrales] standing on target:', name);
}

function onImageFound({ detail }) {
  if (!detail || !targetConfig(detail.name)) return;
  console.info('[ancestrales] image found:', detail.name);
  state.detections.set(detail.name, detail);

  if (state.activeName === detail.name) {
    // The active target came back (possibly within the lost grace period).
    clearTimeout(state.lostTimer);
    state.lostTimer = 0;
    readTargetPose(detail);
  } else {
    // Another target is active and still in view: keep it unless this one ranks higher
    // (the full card beats the QR alone); at equal rank the first one found stays.
    if (state.activeName && !state.lostTimer
        && targetConfig(detail.name).priority <= state.activeConfig.priority) return;
    // Nothing active, or the active one is about to be dropped: switch to this one.
    const switching = !!state.activeName;
    clearTimeout(state.lostTimer);
    state.lostTimer = 0;
    activateTarget(detail.name);
    if (switching && state.anchor) snapAnchorToTarget();
  }
  state.target.seen = true;
  appear();
}

function onImageUpdated({ detail }) {
  if (!detail || !targetConfig(detail.name)) return;
  state.detections.set(detail.name, detail);
  if (detail.name === state.activeName) readTargetPose(detail);
}

function onImageLost({ detail }) {
  if (!detail || !targetConfig(detail.name)) return;
  console.info('[ancestrales] image lost:', detail.name);
  state.detections.delete(detail.name);
  if (detail.name !== state.activeName) return;
  clearTimeout(state.lostTimer);
  state.lostTimer = setTimeout(() => {
    state.lostTimer = 0;
    // Another target still in view (e.g. the QR while the rest of the card is covered): move there.
    const next = Array.from(state.detections.keys())
      .sort((a, b) => targetConfig(b).priority - targetConfig(a).priority)[0];
    if (next) {
      activateTarget(next);
      if (state.anchor) snapAnchorToTarget();
      appear();
      return;
    }
    state.activeName = null;
    state.target.seen = false;
    disappear();
  }, LOST_GRACE_MS);
}

/** Frame-rate independent exponential smoothing towards the last tracked pose. */
function followTarget(dt) {
  const a = state.anchor;
  const t = state.target;
  if (!a || !a.visible || !t.seen) return;
  if (a.position.distanceTo(t.position) > SNAP_DISTANCE * t.scale) {
    snapAnchorToTarget();
    return;
  }
  const alpha = 1 - Math.exp(-SMOOTHING_RATE * dt);
  a.position.lerp(t.position, alpha);
  a.quaternion.slerp(t.quaternion, alpha);
  a.scale.setScalar(a.scale.x + (t.scale - a.scale.x) * alpha);
}

// ---------------------------------------------------------------------------
// Gestures: one finger rotates about the card normal, two fingers scale.
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
// UI phases
// ---------------------------------------------------------------------------

let gestureTipTimer = 0;
function showGestureTip() {
  const tip = $('#gesture-tip');
  tip.hidden = false;
  tip.classList.remove('is-fading');
  clearTimeout(gestureTipTimer);
  gestureTipTimer = setTimeout(() => {
    tip.classList.add('is-fading');
    gestureTipTimer = setTimeout(() => { tip.hidden = true; }, 450);
  }, 5500);
}

function setPhase(phase) {
  state.phase = phase;
  $('#coach').classList.toggle('is-hidden', phase === 'tracking');
  document.body.dataset.phase = phase;
}

/** "Reiniciar": undo the user's rotation and size; replay the entrance or the hint. */
function resetScene() {
  state.userScale = 1;
  state.userRotation = 0;
  applyUserRotation();
  applyScale();
  if (state.phase === 'tracking') {
    state.appear = 0;
    appear();
    showGestureTip();
  } else {
    $('#gesture-tip').hidden = true;
    setPhase('searching');
  }
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
          // The card may already be in view while the model was still downloading.
          if (state.target.seen && state.phase !== 'tracking') appear();
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
      if (!state.anchor || !state.anchor.visible) return;

      followTarget(dt);
      updateSpiritLight();
      if (state.mixer) state.mixer.update(dt);

      // Gentle breathing of the glow ring once the guardian is standing.
      if (state.phase === 'tracking' && tweens.size === 0) {
        state.ring.material.opacity = 0.28 + 0.1 * Math.sin(now / 900);
      }
    },
    onException: (err) => {
      console.error('[ancestrales] XR exception', err);
      if (err && err.type === 'permission') {
        showPermissionDenied();
        return;
      }
      showError({
        title: 'La realidad aumentada se detuvo',
        paragraphs: ['Ocurrió un problema con la cámara. Vuelve a intentarlo.'],
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
    ],
  };
}

function showPermissionDenied() {
  try { window.XR8.stop(); } catch (_) { /* already stopped */ }
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
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

function startAR(XR8) {
  if (state.phase !== 'idle') return;
  state.phase = 'starting';

  showScreen('loading');
  $('#loading-text').textContent = 'Abriendo la cámara…';

  const canvas = $('#ar-canvas');
  bindGestures(canvas);
  $('#btn-reset').addEventListener('click', resetScene);

  // Image targets only, with world tracking (SLAM) off:
  //  - the card may be held in the hand and moved; SLAM only helps content anchored to the room,
  //  - the image tracker gets the whole CPU budget (higher, steadier frame rate on mid phones),
  //  - no SLAM warm-up and no motion-sensor permission (one less iOS prompt that can fail).
  XR8.XrController.configure({
    disableWorldTracking: true,
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

boot();
