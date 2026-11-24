import * as THREE from 'three';
import { createWorld } from './world.js';
import { createFishing } from './fishing.js';
import './style.css';

const iconModules = import.meta.glob('../node_modules/lucide-static/icons/{waves,volume-2,volume-x,circle-help,book-open,map-pin,sunset,wind,navigation,scan-line,arrow-up-right,fish,x,keyboard,map,lightbulb,anchor,leaf,mountain,droplet,zap,rotate-ccw,circle-check,move-up-right}.svg', { eager: true, query: '?raw', import: 'default' });
const propAssets = import.meta.glob('./models/*.glb', { query: '?url', import: 'default' });
const icons = Object.fromEntries(Object.entries(iconModules).map(([path, svg]) => [path.split('/').at(-1).slice(0, -4), svg]));

const find = (name) => document.querySelector(`[data-${name}]`);
const setIcon = (node, name) => {
  if (node.innerHTML === icons[name]) return;
  node.dataset.icon = name;
  node.innerHTML = icons[name] ?? '';
};
for (const node of document.querySelectorAll('[data-icon]')) setIcon(node, node.dataset.icon);

const stage = find('stage');
const hud = find('hud');
const catchToast = find('catch');
const compass = find('compass');
const help = find('help-dialog');
const journal = find('journal');
const cacheKey = 'mistwater.fishing.catches.v1';
let catches = [];

try {
  const saved = JSON.parse(localStorage.getItem(cacheKey) ?? '[]');
  if (Array.isArray(saved)) catches = saved.filter((entry) => typeof entry?.name === 'string' && Number.isFinite(entry.weight) && Number.isFinite(entry.length));
} catch {
  // Private browsing and cleared storage still allow a session journal.
}

const formatWeight = (value) => `${value.toFixed(2)} kg`;
const formatLength = (value) => `${Math.round(value)} cm`;

function renderJournal() {
  find('count').textContent = catches.length;
  find('total').textContent = `${catches.length} 尾`;
  find('best').textContent = catches.length ? formatWeight(Math.max(...catches.map(({ weight }) => weight))) : '—';
  const rows = catches.map((entry) => {
    const row = document.createElement('div');
    row.className = 'journal-row';
    const name = document.createElement('b');
    name.textContent = entry.name;
    const details = document.createElement('span');
    details.textContent = `${formatWeight(entry.weight)} · ${formatLength(entry.length)}`;
    row.append(name, details);
    return row;
  });
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'journal-empty';
    empty.textContent = '第一尾漁獲會記在這裡。';
    rows.push(empty);
  }
  find('journal-list').replaceChildren(...rows);
}

renderJournal();
find('help').onclick = () => help.showModal();
find('open-journal').onclick = () => journal.showModal();
for (const dialog of [help, journal]) {
  dialog.querySelector('[data-dismiss]').onclick = () => dialog.close();
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    }
  });
}
find('close-catch').onclick = () => { catchToast.hidden = true; };

function makeAudio() {
  let context;
  let output;
  let enabled = true;
  let reelTime = 0;
  const soundButton = find('sound');

  function activate() {
    if (!enabled || !window.AudioContext) return;
    try {
      if (!context) {
        context = new AudioContext();
        output = context.createGain();
        output.gain.value = 0.54;
        output.connect(context.destination);
      }
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch {}
  }

  function tone(start, low, high, duration, volume, type = 'sine') {
    const voice = context.createOscillator();
    voice.type = type;
    voice.frequency.setValueAtTime(low, start);
    voice.frequency.exponentialRampToValueAtTime(high, start + duration);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.001, start);
    envelope.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
    voice.connect(envelope).connect(output);
    voice.start(start);
    voice.stop(start + duration);
  }

  function splash(start, cutoff, duration, volume) {
    const source = context.createBufferSource();
    source.buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const samples = source.buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.22), start + duration);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(volume, start);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter).connect(envelope).connect(output);
    source.start(start);
  }

  function play(name) {
    if (!context || !enabled || context.state !== 'running') return;
    const t = context.currentTime;
    switch (name) {
      case 'cast': splash(t, 1900, 0.36, 0.15); break;
      case 'splash': splash(t, 1100, 0.44, 0.45); tone(t, 155, 70, 0.17, 0.13); break;
      case 'bite': splash(t, 1500, 0.3, 0.45); tone(t, 420, 250, 0.13, 0.14); break;
      case 'hook': tone(t, 135, 78, 0.18, 0.17, 'triangle'); break;
      case 'lost': tone(t, 240, 116, 0.27, 0.12, 'triangle'); break;
      case 'catch':
        [392, 494, 587].forEach((pitch, index) => tone(t + index * 0.12, pitch, pitch * 0.997, 0.31, 0.11, 'triangle'));
        break;
      case 'reel':
        if (t >= reelTime) {
          reelTime = t + 0.085;
          splash(t, 2800, 0.044, 0.12);
        }
        break;
    }
  }

  soundButton.onclick = () => {
    enabled = !enabled;
    setIcon(soundButton.querySelector('[data-icon]'), enabled ? 'volume-2' : 'volume-x');
    soundButton.setAttribute('aria-pressed', enabled);
    soundButton.setAttribute('aria-label', enabled ? '關閉音效' : '開啟音效');
    if (output) output.gain.value = enabled ? 0.54 : 0;
    activate();
  };
  return { activate, play };
}

const audio = makeAudio();
const phaseInfo = {
  ready: ['準備拋竿', 'fish'],
  charging: ['拋竿蓄力', 'move-up-right'],
  casting: ['浮標飛行中', 'move-up-right'],
  waiting: ['等待魚訊', 'droplet'],
  bite: ['魚上鉤了', 'zap'],
  fight: ['收線拉魚', 'fish'],
  caught: ['成功釣獲', 'circle-check'],
  lost: ['魚線已收回', 'rotate-ccw'],
};
const phaseTitle = find('phase-title');
const phaseText = find('phase-text');
const phaseIcon = find('phase-icon');
const meters = Object.fromEntries(['power', 'tension', 'stamina'].map((name) => [name, document.querySelector(`[data-meter="${name}"]`)]));
let currentPhase;
let catchTimeout;

function updateHud(state) {
  if (currentPhase !== state.phase) {
    currentPhase = state.phase;
    const [title, icon] = phaseInfo[state.phase];
    stage.dataset.phase = state.phase;
    phaseTitle.textContent = title;
    setIcon(phaseIcon, icon);
    find('power').hidden = state.phase !== 'charging';
    find('fight').hidden = state.phase !== 'fight';
    find('telemetry').hidden = !['waiting', 'bite', 'fight'].includes(state.phase);
    find('metrics').hidden = !['charging', 'waiting', 'bite', 'fight'].includes(state.phase);
    if (state.phase === 'charging') catchToast.hidden = true;
  }
  if (phaseText.textContent !== state.message) phaseText.textContent = state.message;
  for (const key of Object.keys(meters)) {
    const value = Math.round(THREE.MathUtils.clamp(state[key], 0, 1) * 100);
    if (meters[key].getAttribute('aria-valuenow') === String(value)) continue;
    meters[key].style.setProperty('--value', `${value}%`);
    meters[key].setAttribute('aria-valuenow', value);
    find(`${key}-text`).textContent = `${value}%`;
  }
  if (!find('telemetry').hidden) {
    find('line-distance').textContent = `魚線 ${state.distance.toFixed(1)} m`;
    find('depth').textContent = `水深 ${state.depth.toFixed(1)} m`;
  }
}

function showCatch(fish) {
  catches.unshift({ name: fish.name, weight: fish.weight, length: fish.length });
  try { localStorage.setItem(cacheKey, JSON.stringify(catches)); } catch {}
  renderJournal();
  find('catch-name').textContent = fish.name;
  find('catch-details').textContent = `${formatWeight(fish.weight)} · ${formatLength(fish.length)}`;
  catchToast.hidden = false;
  clearTimeout(catchTimeout);
  catchTimeout = setTimeout(() => { catchToast.hidden = true; }, 8000);
}

function buildMap(world) {
  const canvas = find('map');
  const ctx = canvas.getContext('2d');
  const base = document.createElement('canvas');
  base.width = canvas.width;
  base.height = canvas.height;
  const paper = base.getContext('2d');
  const { width, height } = canvas;
  const { minX, maxX, minZ, maxZ } = world.bounds;
  const scale = Math.min(width / (maxX - minX + 7), height / (maxZ - minZ + 6));
  const cx = (maxX + minX) / 2;
  const cz = (maxZ + minZ) / 2;
  const px = (x) => (x - cx) * scale + width / 2;
  const pz = (z) => (z - cz) * scale + height / 2;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const wx = (x - width / 2) / scale + cx;
      const wz = (y - height / 2) / scale + cz;
      const wet = world.isWater(wx, wz);
      const terrain = world.heightAt(wx, wz);
      const variation = Math.sin(wx * 0.61 + wz * 0.29) + Math.cos(wz * 0.4 - wx * 0.16);
      const contour = Math.abs(terrain / 2.6 - Math.round(terrain / 2.6)) < 0.06;
      paper.fillStyle = wet
        ? `hsl(164 25% ${35 + variation * 1.45 - Math.min(terrain * -1, 15) * 0.48}%)`
        : `hsl(116 14% ${25 + variation * 2.1 + (contour ? 5 : 0) + Math.max(0, 8 - terrain) * 0.32}%)`;
      paper.fillRect(x, y, 2, 2);
    }
  }
  paper.strokeStyle = '#b6c7a83d';
  paper.lineWidth = 1;
  paper.beginPath();
  for (let x = Math.ceil(minX / 20) * 20; x <= maxX; x += 20) {
    paper.moveTo(px(x), 0); paper.lineTo(px(x), height);
  }
  for (let z = Math.ceil(minZ / 20) * 20; z <= maxZ; z += 20) {
    paper.moveTo(0, pz(z)); paper.lineTo(width, pz(z));
  }
  paper.stroke();

  paper.beginPath();
  for (const [x, z] of world.trail) paper.lineTo(px(x), pz(z));
  paper.lineWidth = 2.5;
  paper.strokeStyle = '#ccb48baa';
  paper.setLineDash([6, 4]);
  paper.stroke();
  paper.setLineDash([]);
  const scaleLabel = find('scale');
  scaleLabel.style.width = `${20 * scale / width * 100}%`;

  const spotDetails = {
    dock: ['anchor', '開闊水域'],
    inlet: ['leaf', '蘆葦與淺水'],
    rocks: ['mountain', '岩壁與深水'],
    north: ['map-pin', '松林與緩坡'],
  };
  let selectedSpot;
  const labels = world.spots.map((spot) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'spot';
    element.setAttribute('aria-pressed', 'false');
    element.innerHTML = '<span class="spot-icon" data-icon></span><span class="spot-copy"><span class="spot-name"></span><span class="spot-detail"></span></span><span class="spot-dist"></span>';
    const [icon, details] = spotDetails[spot.id] ?? ['map-pin', '湖岸'];
    setIcon(element.querySelector('[data-icon]'), icon);
    element.querySelector('.spot-name').textContent = spot.name;
    element.querySelector('.spot-detail').textContent = details;
    element.onclick = () => {
      selectedSpot = selectedSpot === spot ? undefined : spot;
      for (const label of labels) label.element.setAttribute('aria-pressed', String(label.spot === selectedSpot));
    };
    find('spots').append(element);
    return { spot, element, distance: element.querySelector('.spot-dist') };
  });

  function paint(position, yaw) {
    const x = px(position.x);
    const z = pz(position.z);
    ctx.drawImage(base, 0, 0);
    if (selectedSpot) {
      ctx.setLineDash([7, 7]);
      ctx.strokeStyle = '#f2cc82b5';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, z);
      ctx.lineTo(px(selectedSpot.x), pz(selectedSpot.z));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const label of labels) {
      const { spot } = label;
      label.distance.textContent = `${Math.round(Math.hypot(spot.x - position.x, spot.z - position.z))} m`;
      ctx.fillStyle = '#edd08b';
      ctx.strokeStyle = '#303d2c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px(spot.x), pz(spot.z), spot === selectedSpot ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(x, z);
    ctx.rotate(-yaw);
    ctx.fillStyle = '#d2f0dc';
    ctx.strokeStyle = '#1d3027';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7, 7);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  return paint;
}

async function loadTripoProp(scene, world) {
  const prop = propAssets['./models/tripo-tackle-box.glb'];
  if (!prop) return;
  try {
    const url = await prop();
    const response = await fetch(url);
    if (!response.ok || response.headers.get('Content-Type')?.includes('text/html')) return;
    const contents = await response.arrayBuffer();
    if (contents.byteLength < 12 || new DataView(contents).getUint32(0, true) !== 0x46546c67) return;
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { scene: model } = await new GLTFLoader().parseAsync(contents, '');
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    if (box.isEmpty() || Math.max(size.x, size.y, size.z) < 1e-6) return;
    const scale = 0.72 / Math.max(size.x, size.y, size.z);
    const center = box.getCenter(new THREE.Vector3());
    const x = 3.52;
    const z = 34.3;
    const anchor = new THREE.Group();
    anchor.position.set(x, world.heightAt(x, z), z);
    model.scale.multiplyScalar(scale);
    model.position.add(new THREE.Vector3(-center.x, -box.min.y, -center.z).multiplyScalar(scale));
    anchor.add(model);
    scene.add(anchor);
  } catch (error) {
    console.warn('無法讀取釣具箱模型', error);
  }
}

function runGame() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const gl = renderer.getContext();
  const graphicsInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const graphicsName = graphicsInfo ? gl.getParameter(graphicsInfo.UNMASKED_RENDERER_WEBGL) : '';
  const softwareGraphics = /swiftshader|llvmpipe|software rasterizer/i.test(graphicsName);
  renderer.setPixelRatio(softwareGraphics ? 0.64 : Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', '第一人稱湖區視角');
  find('render').append(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 550);
  const world = createWorld(scene);
  const { spawn } = world;
  const position = new THREE.Vector3(spawn.x, world.heightAt(spawn.x, spawn.z) + 1.7, spawn.z);
  let yaw = spawn.yaw ?? 0;
  let pitch = -0.09;
  let started = false;
  let aimDrag;
  let lockPending = false;
  let lockFailed = false;
  let lockWorked = false;
  const keys = new Set();
  const actions = new Set();
  const touch = matchMedia('(pointer: coarse)');
  const lookButton = find('look');
  const lookStatus = find('look-status');
  const mouseLocked = () => document.pointerLockElement === canvas;
  const updateMap = buildMap(world);
  const fishing = createFishing(scene, camera, world, { onState: updateHud, onCatch: showCatch, onSound: audio.play });
  loadTripoProp(scene, world);

  function resize() {
    const { clientWidth, clientHeight } = stage;
    camera.aspect = clientWidth / Math.max(clientHeight, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight, false);
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  function start() {
    if (started) return;
    started = true;
    find('briefing').hidden = true;
    hud.hidden = false;
    stage.classList.add('in-game');
    find('touch').hidden = !touch.matches;
    canvas.focus({ preventScroll: true });
    audio.activate();
    updateLookStatus();
  }

  function buttonDown(source) {
    audio.activate();
    if (actions.has(source)) return;
    actions.add(source);
    if (actions.size === 1) fishing.press();
  }

  function buttonUp(source) {
    if (actions.delete(source) && actions.size === 0) fishing.release();
  }

  function releaseControls() {
    keys.clear();
    if (actions.size) {
      actions.clear();
      if (fishing.getState().phase === 'charging') fishing.cancel();
      else fishing.release();
    }
    aimDrag = undefined;
  }

  function rotate(dx, dy) {
    yaw -= dx * 0.0042;
    tilt(-dy * 0.0042);
  }

  function tilt(delta) {
    pitch = THREE.MathUtils.clamp(pitch + delta, -1.35, 1.25);
  }

  function updateLookStatus() {
    const locked = mouseLocked();
    lookButton.setAttribute('aria-pressed', String(locked));
    lookButton.title = locked ? '釋放滑鼠（Esc）' : '使用滑鼠環視';
    lookButton.setAttribute('aria-label', lookButton.title);
    lookStatus.hidden = !started || touch.matches;
    lookStatus.textContent = locked ? 'Esc 釋放游標' : lockFailed ? '按住右鍵拖曳環視' : '點畫面使用滑鼠環視';
  }

  function lockError() {
    if (!lockPending || mouseLocked()) return;
    lockPending = false;
    // Browsers can reject a new request briefly after the native Escape gesture.
    lockFailed = !lockWorked;
    updateLookStatus();
  }

  function captureMouse() {
    if (mouseLocked() || lockPending) return;
    lockPending = true;
    try {
      if (canvas.requestPointerLock) canvas.requestPointerLock()?.catch(lockError);
      else lockError();
    } catch {
      lockError();
    }
  }

  const accepted = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space', 'KeyR']);
  find('start').onclick = (event) => {
    start();
    if (event.detail > 0 && event.pointerType !== 'touch' && !touch.matches) captureMouse();
  };
  lookButton.onclick = () => {
    start();
    canvas.focus({ preventScroll: true });
    if (mouseLocked()) document.exitPointerLock();
    else captureMouse();
  };
  document.addEventListener('pointerlockchange', () => {
    lockPending = false;
    if (mouseLocked()) {
      lockWorked = true;
      lockFailed = false;
    } else releaseControls();
    updateLookStatus();
  });
  document.addEventListener('pointerlockerror', lockError);
  window.addEventListener('keydown', (event) => {
    if (help.open || journal.open || event.altKey || event.metaKey || event.ctrlKey || !accepted.has(event.code)) return;
    if (!started && event.key === 'Shift') return;
    if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    if (!started) {
      start();
      if (event.code === 'Space') return;
    }
    if (event.code === 'KeyR' && !event.repeat) fishing.cancel();
    else if (event.code === 'Space') buttonDown('keyboard');
    else keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
    if (event.code === 'Space') buttonUp('keyboard');
  });
  window.addEventListener('blur', releaseControls);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseControls();
  });
  for (const opener of [find('open-journal'), find('help')]) {
    opener.addEventListener('click', () => {
      releaseControls();
      if (mouseLocked()) document.exitPointerLock();
    });
  }

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointerdown', (event) => {
    if (mouseLocked()) return;
    if (!started) {
      start();
    }
    canvas.focus({ preventScroll: true });
    if (event.pointerType === 'touch' || event.button === 2) {
      aimDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    } else if (event.button === 0 && lockFailed) {
      buttonDown('pointer');
      canvas.setPointerCapture(event.pointerId);
    }
  });
  canvas.addEventListener('click', (event) => {
    if (!lockFailed && event.detail > 0 && event.pointerType !== 'touch' && !touch.matches) captureMouse();
  });
  canvas.addEventListener('mousedown', (event) => {
    if (mouseLocked() && event.button === 0) buttonDown('mouse');
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) buttonUp('mouse');
  });
  document.addEventListener('mousemove', (event) => {
    if (mouseLocked()) rotate(event.movementX, event.movementY);
  });
  document.addEventListener('pointermove', (event) => {
    if (!mouseLocked() && aimDrag?.id === event.pointerId) {
      rotate(event.clientX - aimDrag.x, event.clientY - aimDrag.y);
      aimDrag.x = event.clientX;
      aimDrag.y = event.clientY;
    }
  });
  function pointerEnded(event) {
    if (aimDrag?.id === event.pointerId) aimDrag = undefined;
    if (event.button === 0 || event.type === 'pointercancel') buttonUp('pointer');
  }
  window.addEventListener('pointerup', pointerEnded);
  window.addEventListener('pointercancel', pointerEnded);

  for (const button of document.querySelectorAll('[data-move], [data-fish-button]')) {
    const code = button.dataset.move;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      if (code) keys.add(code);
      else buttonDown('touch');
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(type, () => {
        if (code) keys.delete(code);
        else buttonUp('touch');
      });
    }
  }

  function walk(dt) {
    yaw += ((keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0)) * dt * 1.65;
    tilt(((keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0)) * dt * 1.15);
    const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
    const strafe = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
    const wading = world.wadeDepthAt(position.x, position.z) > 0.07;
    const running = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = wading ? 2.45 : running ? 7.35 : 4.45;
    const distance = dt * speed / (Math.hypot(forward, strafe) || 1);
    const x = position.x + (-Math.sin(yaw) * forward + Math.cos(yaw) * strafe) * distance;
    const z = position.z + (-Math.cos(yaw) * forward - Math.sin(yaw) * strafe) * distance;
    if (world.canMove(x, position.z)) position.x = x;
    if (world.canMove(position.x, z)) position.z = z;
    const desiredHeight = world.heightAt(position.x, position.z) + 1.7;
    position.y = THREE.MathUtils.damp(position.y, desiredHeight, 14, dt);
  }

  let lastTime = performance.now() / 1000;
  let time = 0;
  let lastMap = -1;
  const directions = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];
  renderer.setAnimationLoop((ms) => {
    const now = ms / 1000;
    const elapsed = THREE.MathUtils.clamp(now - lastTime, 0, 0.30);
    lastTime = now;
    if (!help.open && !journal.open) {
      const steps = Math.max(1, Math.ceil(elapsed / 0.05));
      const dt = elapsed / steps;
      for (let step = 0; step < steps; step++) {
        time += dt;
        if (started) walk(dt);
        camera.position.copy(position);
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
        camera.updateMatrixWorld();
        fishing.update(dt, time, position);
      }
      world.update(time);
    }
    if (time - lastMap > 0.10) {
      lastMap = time;
      updateMap(position, yaw);
      const bearing = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
      compass.textContent = `${directions[Math.round(bearing / 45) % 8]} · ${String(Math.floor(bearing)).padStart(3, '0')}°`;
      const nearest = world.spots.reduce((a, b) => (Math.hypot(a.x - position.x, a.z - position.z) <= Math.hypot(b.x - position.x, b.z - position.z) ? a : b));
      find('current-spot').textContent = Math.hypot(nearest.x - position.x, nearest.z - position.z) < 16 ? nearest.name : '松影湖岸';
      find('coordinate').textContent = `東向 ${Math.round(position.x)} m · 北向 ${Math.round(-position.z)} m`;
    }
    renderer.render(scene, camera);
  });
}

try {
  runGame();
} catch (error) {
  find('error').hidden = false;
  find('start').disabled = true;
  console.error(error);
}
