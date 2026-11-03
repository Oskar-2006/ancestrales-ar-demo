// Ancestrales AR — tap-to-place guardian on top of the 8th Wall engine (XR8) with three.js.
//
// Wiring overview:
//   1. three.js is loaded as ES modules (import map in index.html). XR8.Threejs expects a
//      global window.THREE, so a plain copy of the namespace (plus GLTFLoader) is exposed.
//   2. xr.js (8th Wall engine binary) loads async and fires 'xrloaded' when window.XR8 exists.
//   3. On "Iniciar AR" (a user gesture, required by iOS for camera + motion sensors) the camera
//      pipeline is assembled and XR8.run({canvas}) starts:
//        GlTextureRenderer  draws the camera feed into the canvas
//        Threejs            creates scene / camera / renderer and keeps the camera in sync with SLAM
//        XrController       world tracking (SLAM) + hitTest()
//        canvas sizer       ours: keeps the canvas at window size
//        app module         ours: scene content, placement, gestures, UI state

import * as THREE_NS from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GUARDIANS, DEFAULT_GUARDIAN } from './guardians.js';

const THREE = Object.assign({}, THREE_NS, { GLTFLoader });
window.THREE = THREE;
window.__appBooted = true;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// With scale 'responsive', XR8 assumes the ground plane is at y = 0 and the camera starts at
// this height. ~1.5 m (a phone held at chest height) makes 1 scene unit roughly 1 metre.
const CAMERA_START_HEIGHT = 1.5;
const MIN_USER_SCALE = 0.5;
const MAX_USER_SCALE = 3;
const TAP_MAX_MOVE_PX = 12;
const TAP_MAX_MS = 350;
const ROTATE_RADIANS_PER_PX = (Math.PI * 2) / 700;
const XR8_LOAD_TIMEOUT_MS = 45000;
// If tracking never reports NORMAL (poor light, plain floor) we still allow placement on the
// estimated ground plane after this delay, so the user is never stuck.
const READY_FALLBACK_MS = 7000;
const RETICLE_HIT_INTERVAL_MS = 120;
const MIN_SCAN_MS = 1500;

const HIT_PRIORITY = { DETECTED_SURFACE: 0, ESTIMATED_SURFACE: 1, FEATURE_POINT: 2 };

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
      'Esta experiencia usa la cámara y los sensores de movimiento de un celular.',
      'Escanea el código QR de tu figura o abre este enlace en el teléfono:',
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
// XR8 loading
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
const easeOutBack = (t) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const tweens = new Set();
function tween(durationMs, onStep, ease = easeOutCubic) {
  const t = { start: performance.now(), durationMs, onStep, ease };
  tweens.add(t);
  return t;
}
function runTweens(now) {
  tweens.forEach((t) => {
    const k = clamp((now - t.start) / t.durationMs, 0, 1);
    t.onStep(t.ease(k), k);
    if (k >= 1) tweens.delete(t);
  });
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

const state = {
  phase: 'idle', // idle | starting | scanning | ready | placed
  xr: null, // {scene, camera, renderer}
  modelTemplate: null,
  clips: [],
  modelPromise: null,
  root: null, // placed guardian group
  pivot: null, // normalized model container
  ring: null,
  mixer: null,
  reticle: null,
  userScale: 1,
  appear: 1,
  trackingNormal: false,
  videoAt: 0,
  lastReticleHit: 0,
  lastFrame: performance.now(),
};

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

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

/** Builds the placed guardian: normalized model + contact shadow + glow ring + rim light. */
function buildGuardian() {
  const root = new THREE.Group();
  root.name = 'guardian-root';
  root.visible = false;

  const model = state.modelTemplate;
  model.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false; // skinned meshes can be culled wrongly when their bounds are stale
      if (o.material && o.material.map) o.material.map.anisotropy = 4;
    }
  });

  // Normalize: feet on y = 0, centred on x/z, height = heightMeters.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const height = size.y > 1e-6 ? size.y : 1;
  const k = guardian.heightMeters / height;
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
  shadow.position.y = 0.002;
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
  ring.position.y = 0.003;
  ring.scale.setScalar(footprint * 2.2);
  ring.renderOrder = 2;
  root.add(ring);

  // Faint green light near the feet: the "spirit" glow of the river.
  const spirit = new THREE.PointLight(0x8fbf6a, 0.35, guardian.heightMeters * 2.5, 2);
  spirit.position.set(0, guardian.heightMeters * 0.15, guardian.heightMeters * 0.25);
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

  state.root = root;
  state.pivot = pivot;
  state.ring = ring;
  return root;
}

function buildReticle() {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.055, 0.07, 48),
    new THREE.MeshBasicMaterial({ color: 0xe2c35a, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }),
  );
  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(0.012, 24),
    new THREE.MeshBasicMaterial({ color: 0x8fbf6a, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
  );
  [ring, dot].forEach((m) => { m.rotation.x = -Math.PI / 2; group.add(m); });
  group.visible = false;
  return group;
}

// ---------------------------------------------------------------------------
// Scene setup (runs once XR8.Threejs has created scene/camera/renderer)
// ---------------------------------------------------------------------------

function initScene() {
  const { scene, camera, renderer } = state.xr;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const hemi = new THREE.HemisphereLight(0xe8eedc, 0x2b3325, 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d2, 2.2);
  sun.position.set(1.2, 3, 1.6);
  scene.add(sun);

  state.reticle = buildReticle();
  scene.add(state.reticle);

  // Start the camera at a known height so the SLAM scale matches the scene.
  camera.position.set(0, CAMERA_START_HEIGHT, 0);
  window.XR8.XrController.updateCameraProjectionMatrix({
    origin: camera.position,
    facing: camera.quaternion,
  });
}

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

/** Returns a world point on a real surface under the normalized screen point, or null. */
function hitSurface(nx, ny) {
  let hits = [];
  try {
    hits = window.XR8.XrController.hitTest(nx, ny, ['DETECTED_SURFACE', 'ESTIMATED_SURFACE', 'FEATURE_POINT']) || [];
  } catch (err) {
    hits = [];
  }
  if (hits.length) {
    hits.sort((a, b) => (HIT_PRIORITY[a.type] ?? 9) - (HIT_PRIORITY[b.type] ?? 9) || a.distance - b.distance);
    const p = hits[0].position;
    return new THREE.Vector3(p.x, p.y, p.z);
  }
  // Fallback: the ground plane XR8 assumes at y = 0.
  const { camera } = state.xr;
  raycaster.setFromCamera(new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1)), camera);
  const out = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(groundPlane, out)) return null;
  if (out.distanceTo(camera.position) > 8) return null;
  return out;
}

// ---------------------------------------------------------------------------
// Placement + gestures
// ---------------------------------------------------------------------------

function faceCamera(position) {
  const cam = state.xr.camera.position;
  return Math.atan2(cam.x - position.x, cam.z - position.z);
}

function placeAt(nx, ny) {
  if (state.phase !== 'ready' && state.phase !== 'placed') return;
  const point = hitSurface(nx, ny);
  if (!point) return;

  if (!state.root) state.xr.scene.add(buildGuardian());
  const root = state.root;

  if (state.phase === 'ready') {
    // First appearance: rise from the ground with a soft overshoot and a flash of the ring.
    root.position.copy(point);
    root.rotation.y = faceCamera(point);
    root.visible = true;
    state.appear = 0;
    tween(700, (e) => { state.appear = e; applyScale(); }, easeOutBack);
    tween(1400, (e) => {
      state.ring.material.opacity = 0.35 + (1 - e) * 0.65;
      state.ring.scale.setScalar(state.ring.userData.base * (0.6 + e * 0.4));
    });
    state.ring.userData.base = state.ring.userData.base || state.ring.scale.x;
    setPhase('placed');
    showGestureTip();
  } else {
    const from = root.position.clone();
    tween(380, (e) => root.position.lerpVectors(from, point, e));
  }
}

function applyScale() {
  if (state.root) state.root.scale.setScalar(state.userScale * Math.max(state.appear, 0.001));
}

const pointers = new Map();
let gesture = null;

function pointerDistance() {
  const [a, b] = Array.from(pointers.values());
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function onPointerDown(e) {
  if (!document.body.classList.contains('is-ar')) return;
  e.preventDefault();
  try { e.target.setPointerCapture(e.pointerId); } catch (_) { /* not all targets support capture */ }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 1) {
    gesture = {
      type: 'pending', startX: e.clientX, startY: e.clientY, startT: performance.now(),
      startRot: state.root ? state.root.rotation.y : 0,
    };
  } else if (pointers.size === 2) {
    gesture = { type: 'pinch', startDist: Math.max(pointerDistance(), 1), startScale: state.userScale };
  }
}

function onPointerMove(e) {
  if (!pointers.has(e.pointerId) || !gesture) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (gesture.type === 'pinch' && pointers.size >= 2 && state.phase === 'placed') {
    state.userScale = clamp(gesture.startScale * (pointerDistance() / gesture.startDist), MIN_USER_SCALE, MAX_USER_SCALE);
    applyScale();
    return;
  }
  if (pointers.size === 1 && (gesture.type === 'pending' || gesture.type === 'rotate')) {
    const dx = e.clientX - gesture.startX;
    const dy = e.clientY - gesture.startY;
    if (gesture.type === 'pending' && Math.hypot(dx, dy) > TAP_MAX_MOVE_PX) gesture.type = 'rotate';
    if (gesture.type === 'rotate' && state.root && state.phase === 'placed') {
      state.root.rotation.y = gesture.startRot + dx * ROTATE_RADIANS_PER_PX;
    }
  }
}

function onPointerUp(e) {
  if (!pointers.has(e.pointerId)) return;
  const wasSingle = pointers.size === 1;
  pointers.delete(e.pointerId);

  if (gesture && gesture.type === 'pending' && wasSingle
      && performance.now() - gesture.startT < TAP_MAX_MS) {
    placeAt(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
  }
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
  const coach = $('#coach');
  const scanIcon = coach.querySelector('.coach__icon--scan');
  const tapIcon = coach.querySelector('.coach__icon--tap');
  const text = $('#coach-text');

  if (phase === 'scanning') {
    coach.classList.remove('is-hidden');
    scanIcon.hidden = false;
    tapIcon.hidden = true;
    text.textContent = 'Mueve el celular despacio para detectar la superficie';
  } else if (phase === 'ready') {
    coach.classList.remove('is-hidden');
    scanIcon.hidden = true;
    tapIcon.hidden = false;
    text.textContent = `Toca para colocar a ${guardian.name}`;
  } else if (phase === 'placed') {
    coach.classList.add('is-hidden');
  }
  document.body.dataset.phase = phase;
}

function maybeReady() {
  if (state.phase !== 'scanning' || !state.modelTemplate) return;
  const elapsed = state.videoAt ? performance.now() - state.videoAt : 0;
  // Keep the scanning hint up briefly even when tracking is already good, so it can be read.
  if ((state.trackingNormal && elapsed > MIN_SCAN_MS) || elapsed > READY_FALLBACK_MS) setPhase('ready');
}

function resetScene() {
  try { window.XR8.XrController.recenter(); } catch (err) { console.warn('[ancestrales] recenter failed', err); }
  if (state.root) state.root.visible = false;
  state.userScale = 1;
  state.appear = 1;
  applyScale();
  $('#gesture-tip').hidden = true;
  state.videoAt = performance.now();
  setPhase('scanning');
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
        state.videoAt = performance.now();
        showScreen('ar');
        setPhase('scanning');
        if (!state.modelTemplate) {
          loadModel().then(maybeReady).catch(showModelError);
        }
      } else if (status === 'failed') {
        showPermissionDenied('camera');
      }
    },
    onUpdate: () => {
      const now = performance.now();
      const dt = Math.min((now - state.lastFrame) / 1000, 0.1);
      state.lastFrame = now;

      runTweens(now);
      if (state.mixer && state.root && state.root.visible) state.mixer.update(dt);

      // Gentle breathing of the glow ring once the guardian is standing.
      if (state.ring && state.phase === 'placed' && tweens.size === 0) {
        state.ring.material.opacity = 0.28 + 0.1 * Math.sin(now / 900);
      }

      // Reticle at screen centre while looking for a spot.
      if (state.reticle && (state.phase === 'scanning' || state.phase === 'ready')) {
        if (now - state.lastReticleHit > RETICLE_HIT_INTERVAL_MS) {
          state.lastReticleHit = now;
          const p = hitSurface(0.5, 0.6);
          state.reticle.visible = !!p && state.phase === 'ready';
          if (p) state.reticle.position.copy(p).add(new THREE.Vector3(0, 0.002, 0));
        }
        state.reticle.rotation.y += dt * 0.6;
      } else if (state.reticle) {
        state.reticle.visible = false;
      }

      maybeReady();
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
        event: 'reality.trackingstatus',
        process: ({ detail }) => {
          console.info('[ancestrales] tracking:', detail.status, detail.reason);
          state.trackingNormal = detail.status === 'NORMAL';
          maybeReady();
        },
      },
    ],
  };
}

function showPermissionDenied(permission) {
  try { window.XR8.stop(); } catch (_) { /* already stopped */ }
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const motion = /motion|orientation/i.test(String(permission || ''));
  if (motion) {
    showError({
      title: 'Necesitamos los sensores de movimiento',
      paragraphs: [`Para que ${guardian.name} se quede quieto en su sitio mientras caminas, el navegador debe poder leer el movimiento del celular.`],
      steps: ios
        ? ['Abre Ajustes › Safari y activa «Movimiento y orientación».', 'Vuelve aquí y toca Reintentar; cuando lo pida, toca «Permitir».']
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

/** iOS 13+ only grants motion sensors from inside a user gesture, so ask right on the tap. */
function requestMotionPermission() {
  const asks = [];
  [window.DeviceMotionEvent, window.DeviceOrientationEvent].forEach((Api) => {
    if (Api && typeof Api.requestPermission === 'function') {
      asks.push(Api.requestPermission().catch(() => 'denied'));
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
    if (results.includes('denied')) console.warn('[ancestrales] motion permission denied');
  });

  const canvas = $('#ar-canvas');
  bindGestures(canvas);
  $('#btn-reset').addEventListener('click', resetScene);

  XR8.XrController.configure({ scale: 'responsive', disableWorldTracking: false });
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
        'Revisa que hayas escaneado el QR de tu figura.',
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

  waitForXR8(XR8_LOAD_TIMEOUT_MS).then((XR8) => {
    const compatible = XR8.XrDevice.isDeviceBrowserCompatible({ allowedDevices: XR8.XrConfig.device().MOBILE });
    if (!compatible) {
      showUnsupportedBrowser(XR8);
      return;
    }
    loadModel().catch(() => { /* reported once AR starts */ });
    btn.disabled = false;
    btn.querySelector('.btn__label').textContent = 'Iniciar AR';
    status.textContent = 'Usa la cámara trasera. Funciona mejor con buena luz.';
    btn.addEventListener('click', () => startAR(XR8), { once: true });
    console.info('[ancestrales] XR8 ready', typeof XR8.version === 'function' ? XR8.version() : '');
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
