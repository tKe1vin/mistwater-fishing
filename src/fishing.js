import * as THREE from 'three';

const SPECIES = [
  { name: '彩虹鱒', english: 'Rainbow trout', color: '#b87977', habitat: '冷水・深水區', depth: 7, weight: [0.48, 2.2], length: [30, 58], strength: 0.72 },
  { name: '大口黑鱸', english: 'Largemouth bass', color: '#758a45', habitat: '水草・岸邊', depth: 2.1, weight: [0.62, 3.4], length: [29, 63], strength: 0.82 },
  { name: '黃鱸', english: 'Yellow perch', color: '#cc9a3c', habitat: '淺水・碎石底', depth: 3.5, weight: [0.24, 1.15], length: [19, 38], strength: 0.44 },
  { name: '鏡鯉', english: 'Mirror carp', color: '#aa7b49', habitat: '回水・泥底', depth: 4.8, weight: [1.05, 5.1], length: [35, 75], strength: 0.93 },
];

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const mix = (start, end, amount) => start + (end - start) * amount;
const smooth = (amount) => amount * amount * (3 - 2 * amount);
const TAU = Math.PI * 2;

function createRod(camera) {
  const group = new THREE.Group();
  group.name = 'First-person fly rod';
  camera.add(group);

  const graphite = new THREE.MeshStandardMaterial({ color: '#263c32', roughness: 0.4, metalness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: '#202c27', roughness: 0.5, metalness: 0.5 });
  const alloy = new THREE.MeshStandardMaterial({ color: '#b29c6c', roughness: 0.28, metalness: 0.68 });
  const cork = new THREE.MeshStandardMaterial({ color: '#b58f5d', roughness: 0.9 });
  const corkEdge = new THREE.MeshStandardMaterial({ color: '#6e5945', roughness: 0.93 });
  const cloth = new THREE.MeshStandardMaterial({ color: '#536250', roughness: 1 });
  const leather = new THREE.MeshStandardMaterial({ color: '#927358', roughness: 0.93 });

  function cylinder(material, top, bottom, height, radialSegments = 12) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, radialSegments), material);
    group.add(mesh);
    return mesh;
  }

  const handle = cylinder(cork, 0.045, 0.058, 0.32);
  const trims = Array.from({ length: 5 }, (_, index) =>
    cylinder(index === 0 || index === 4 ? corkEdge : alloy, 0.05, 0.05, index === 0 ? 0.033 : 0.008));
  const reelFoot = cylinder(alloy, 0.024, 0.024, 0.11);
  const reelBody = cylinder(dark, 0.088, 0.088, 0.05, 18);
  const reelSpool = cylinder(alloy, 0.063, 0.063, 0.053, 18);
  const reelCap = cylinder(dark, 0.07, 0.07, 0.01, 18);
  const reelHub = cylinder(alloy, 0.022, 0.022, 0.014, 16);
  const reelKnob = cylinder(dark, 0.014, 0.014, 0.037, 10);
  const reelHoles = Array.from({ length: 7 }, () => cylinder(alloy, 0.007, 0.007, 0.004, 8));
  const sleeve = cylinder(cloth, 0.089, 0.112, 0.28);
  const cuff = cylinder(dark, 0.085, 0.09, 0.044);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), leather);
  hand.scale.set(0.077, 0.096, 0.058);
  group.add(hand);

  const guides = [0.27, 0.43, 0.58, 0.72, 0.84, 0.94].map((parameter, index) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.032 - index * 0.0035, 0.0035, 5, 10), alloy);
    group.add(ring);
    return { parameter, ring };
  });

  const pathSegments = 28;
  const sides = 8;
  const radius = (factor) => mix(0.026, 0.005, factor);
  const vertices = new Float32Array((pathSegments + 1) * sides * 3);
  const normals = new Float32Array(vertices.length);
  const indices = [];
  for (let segment = 0; segment < pathSegments; segment++) {
    for (let side = 0; side < sides; side++) {
      const vertex = segment * sides + side;
      const next = segment * sides + (side + 1) % sides;
      indices.push(vertex, vertex + sides, next, next, vertex + sides, next + sides);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(indices);
  const pole = new THREE.Mesh(geometry, graphite);
  pole.frustumCulled = false;
  group.add(pole);

  const points = [
    new THREE.Vector3(0.39, -0.51, -0.69),
    new THREE.Vector3(0.47, -0.35, -1.15),
    new THREE.Vector3(0.53, -0.15, -1.80),
    new THREE.Vector3(0.54, 0.08, -2.42),
  ];
  const curve = new THREE.CubicBezierCurve3(...points);
  const axisY = new THREE.Vector3(0, 1, 0);
  const axisZ = new THREE.Vector3(0, 0, 1);
  const reelAxis = new THREE.Vector3(1, 0, 0);
  const tangent = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const up = new THREE.Vector3();
  const center = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const reelCenter = new THREE.Vector3();
  const tip = new THREE.Vector3();
  let poseX = 0;
  let poseY = 0;
  let strain = 0;
  let spoolAngle = 0;

  function align(mesh, point, direction, offset = 0) {
    mesh.position.copy(point).addScaledVector(direction, offset);
    mesh.quaternion.setFromUnitVectors(axisY, direction);
  }

  function update(dt, time, state) {
    const swing = state.phase === 'casting' ? Math.sin(Math.min(1, state.phaseAge / 0.37) * Math.PI) : 0;
    const castTug = state.phase === 'charging' ? state.power : 0;
    const pull = state.phase === 'fight' ? state.tension : 0;
    const shake = state.phase === 'bite' ? Math.sin(time * 34) * 0.07 : 0;
    const blend = 1 - Math.exp(-dt * 14);
    poseX = mix(poseX, 0.12 * castTug - 0.25 * swing + shake * 0.18, blend);
    poseY = mix(poseY, 0.78 * castTug + 0.35 * swing + 0.06 * Math.sin(time * 1.45) + shake, blend);
    strain = mix(strain, 0.48 * pull + 0.22 * swing, blend);

    points[1].set(0.47 + poseX * 0.22, -0.35 + poseY * 0.35, -1.15);
    points[2].set(0.53 + poseX * 0.62, -0.15 + poseY * 0.78 - strain * 0.35, -1.8);
    points[3].set(0.54 + poseX, 0.08 + poseY - strain, -2.42 + castTug * 0.16);

    for (let segment = 0; segment <= pathSegments; segment++) {
      const factor = segment / pathSegments;
      curve.getPoint(factor, center);
      curve.getTangent(factor, tangent);
      cross.crossVectors(tangent, axisY).normalize();
      up.crossVectors(cross, tangent).normalize();
      for (let side = 0; side < sides; side++) {
        const angle = TAU * side / sides;
        const index = (segment * sides + side) * 3;
        radial.copy(cross).multiplyScalar(Math.cos(angle)).addScaledVector(up, Math.sin(angle));
        normals[index] = radial.x;
        normals[index + 1] = radial.y;
        normals[index + 2] = radial.z;
        radial.multiplyScalar(radius(factor)).add(center);
        vertices[index] = radial.x;
        vertices[index + 1] = radial.y;
        vertices[index + 2] = radial.z;
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.normal.needsUpdate = true;

    curve.getPoint(0.075, center);
    curve.getTangent(0.075, tangent);
    align(handle, center, tangent);
    const trimOffsets = [-0.15, -0.097, 0.11, 0.14, 0.156];
    trims.forEach((trim, index) => align(trim, center, tangent, trimOffsets[index]));
    align(sleeve, center, tangent, -0.28);
    align(cuff, center, tangent, -0.155);
    hand.position.copy(center).addScaledVector(tangent, -0.077);
    hand.position.x -= 0.047;
    hand.quaternion.setFromUnitVectors(axisY, tangent);
    reelFoot.position.copy(center).addScaledVector(tangent, 0.057);
    reelFoot.position.y -= 0.053;
    reelCenter.copy(reelFoot.position);
    reelCenter.y -= 0.064;
    align(reelBody, reelCenter, reelAxis);
    align(reelSpool, reelCenter, reelAxis, -0.003);
    align(reelCap, reelCenter, reelAxis, -0.027);
    align(reelHub, reelCenter, reelAxis, -0.039);
    if (state.reeling) spoolAngle += dt * 12;
    reelHoles.forEach((hole, index) => {
      const angle = index / reelHoles.length * TAU + spoolAngle;
      align(hole, reelCenter, reelAxis, -0.034);
      hole.position.y += Math.cos(angle) * 0.047;
      hole.position.z += Math.sin(angle) * 0.047;
    });
    align(reelKnob, reelCenter, reelAxis, -0.059);
    reelKnob.position.y += Math.cos(spoolAngle) * 0.052;
    reelKnob.position.z += Math.sin(spoolAngle) * 0.052;

    guides.forEach(({ parameter, ring }) => {
      curve.getPoint(parameter, ring.position);
      curve.getTangent(parameter, tangent);
      ring.position.y -= radius(parameter) * 1.25;
      ring.quaternion.setFromUnitVectors(axisZ, tangent);
    });

    group.updateWorldMatrix(true, false);
    return group.localToWorld(tip.copy(points[3]));
  }

  return { update };
}

function createLure(scene, waterY) {
  const group = new THREE.Group();
  const cream = new THREE.MeshStandardMaterial({ color: '#fff6dc', roughness: 0.34 });
  const orange = new THREE.MeshStandardMaterial({ color: '#fb6549', emissive: '#742718', emissiveIntensity: 0.35, roughness: 0.28 });
  const faceup = new THREE.SphereGeometry(0.104, 16, 10, 0, TAU, 0, Math.PI / 2);
  const facedown = new THREE.SphereGeometry(0.104, 16, 10, 0, TAU, Math.PI / 2, Math.PI / 2);
  const top = new THREE.Mesh(faceup, orange);
  const bottom = new THREE.Mesh(facedown, cream);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.021, 0.12, 8), cream);
  stem.position.y = 0.117;
  group.add(top, bottom, stem);
  group.visible = false;
  scene.add(group);

  const linePositions = new Float32Array(21 * 3);
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage));
  const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: '#fce8bd', transparent: true, opacity: 0.72 }));
  line.frustumCulled = false;
  line.visible = false;
  scene.add(line);

  const rippleGeometry = new THREE.RingGeometry(0.86, 1, 36);
  rippleGeometry.rotateX(-Math.PI / 2);
  const ripples = Array.from({ length: 7 }, () => {
    const mesh = new THREE.Mesh(rippleGeometry, new THREE.MeshBasicMaterial({
      color: '#ecf3d7',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, age: 0, size: 0, life: 0 };
  });
  let nextRipple = 0;

  function ripple(x, z, size = 1, life = 1.4, delay = 0) {
    const slot = ripples[nextRipple];
    nextRipple = (nextRipple + 1) % ripples.length;
    slot.mesh.position.set(x, waterY + 0.037, z);
    slot.size = size;
    slot.age = -delay;
    slot.life = life;
  }

  function update(dt, time, state, tip, destination) {
    const active = ['casting', 'waiting', 'bite', 'fight'].includes(state.phase);
    line.visible = group.visible = active;
    if (active) {
      group.position.copy(destination);
      if (state.phase === 'fight' || state.phase === 'casting') {
        group.rotation.z = Math.sin(time * 13) * 0.18;
      } else {
        group.rotation.z = Math.sin(time * 2.2) * 0.11;
      }

      const lineDistance = tip.distanceTo(destination);
      const slack = state.phase === 'fight'
        ? mix(0.7, 0.015, state.tension)
        : state.phase === 'casting' ? 0.3 : 0.55;
      for (let index = 0; index <= 20; index++) {
        const factor = index / 20;
        const point = index * 3;
        linePositions[point] = mix(tip.x, destination.x, factor);
        linePositions[point + 1] = mix(tip.y, destination.y + 0.14, factor)
          - Math.sin(factor * Math.PI) * slack * Math.min(lineDistance / 6, 1);
        linePositions[point + 2] = mix(tip.z, destination.z, factor);
        if (state.phase !== 'casting') linePositions[point + 1] = Math.max(waterY + 0.018, linePositions[point + 1]);
      }
      lineGeometry.attributes.position.needsUpdate = true;
    }

    for (const slot of ripples) {
      slot.age += dt;
      const amount = slot.age / slot.life;
      slot.mesh.visible = amount >= 0 && amount < 1;
      if (!slot.mesh.visible) continue;
      const scale = 0.13 + amount * slot.size;
      slot.mesh.scale.setScalar(scale);
      slot.mesh.material.opacity = 0.51 * (1 - amount) ** 1.5;
    }
  }

  return { update, ripple };
}

function createFishModel(scene, waterY) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  const scales = new THREE.MeshStandardMaterial({ color: '#b3ae72', metalness: 0.23, roughness: 0.38, flatShading: true });
  const fins = new THREE.MeshStandardMaterial({ color: '#a37e53', roughness: 0.65, flatShading: true, side: THREE.DoubleSide });
  const belly = new THREE.MeshStandardMaterial({ color: '#f2dcb7', metalness: 0.14, roughness: 0.53 });
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: '#18221e', roughness: 0.25 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10), scales);
  body.scale.set(0.47, 0.17, 0.108);
  group.add(body);

  const lower = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), belly);
  lower.scale.set(0.36, 0.102, 0.09);
  lower.position.set(0.03, -0.075, 0);
  group.add(lower);

  function fin(points, material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, material);
  }

  const tail = fin([
    0.04, 0.025, 0, -0.23, 0.16, 0.01, -0.14, 0.005, 0,
    0.04, -0.025, 0, -0.14, 0.005, 0, -0.23, -0.143, 0.01,
  ], fins);
  tail.position.x = -0.39;
  group.add(tail);
  group.add(fin([-0.24, 0.11, 0, -0.16, 0.26, 0.005, 0.16, 0.13, 0], fins));
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 9, 6), eyeMaterial);
    eye.position.set(0.31, 0.048, side * 0.078);
    group.add(eye);
    group.add(fin([0.18, -0.035, side * 0.075, -0.12, -0.13, side * 0.18, 0, -0.1, side * 0.082], fins));
  }
  const facing = new THREE.Vector3();
  const reference = new THREE.Vector3(1, 0, 0);

  function update(time, state, location, tip) {
    const revealing = state.phase === 'caught' && state.phaseAge < 3.4;
    const fighting = state.phase === 'fight' && location.y > waterY + 0.06;
    group.visible = revealing || fighting;
    if (!group.visible) return;

    scales.color.set(state.fish.color);
    fins.color.set(state.fish.color).multiplyScalar(0.73);
    tail.rotation.y = Math.sin(time * (revealing ? 12 : 21)) * 0.51;
    const size = mix(0.76, 1.33, clamp((state.fish.length - 19) / 56));
    group.scale.setScalar(size);
    if (revealing) {
      const reveal = smooth(clamp(state.phaseAge / 0.46));
      group.position.copy(location).lerp(tip, reveal * 0.66);
      group.position.y += Math.sin(reveal * Math.PI * 0.5) * 0.35;
      group.rotation.set(0, time * 0.55, 0.2 + Math.sin(time * 7) * 0.12);
    } else {
      group.position.copy(location);
      group.position.y -= 0.20;
      facing.copy(tip).sub(location).normalize();
      group.quaternion.setFromUnitVectors(reference, facing);
      group.rotateY(Math.sin(time * 7) * 0.42);
    }
  }

  return { update };
}

export function createFishing(scene, camera, world, {
  onState = () => {},
  onCatch = () => {},
  onSound = () => {},
  rng = Math.random,
} = {}) {
  if (!camera.parent) scene.add(camera);
  const waterY = world.waterY ?? 0;
  const isFishWater = (x, z) => world.isFishWater?.(x, z) ?? world.isWater(x, z);
  const rod = createRod(camera);
  const lure = createLure(scene, waterY);
  const fishModel = createFishModel(scene, waterY);
  const target = new THREE.Vector3();
  const bobber = new THREE.Vector3();
  const launch = new THREE.Vector3();
  const hookedPosition = new THREE.Vector3();
  const player = new THREE.Vector3();
  const previousPlayer = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const towardsPlayer = new THREE.Vector3();
  const proposed = new THREE.Vector3();
  const tip = new THREE.Vector3();
  const readyMessage = '按住蓄力，鬆開拋竿。朝湖面瞄準。';

  const state = {
    phase: 'ready', message: readyMessage, power: 0, distance: 0, castDistance: 0,
    depth: 0, stamina: 0, tension: 0, reeling: false, fish: null, phaseAge: 0,
  };

  let activeSpecies;
  let charge = 0;
  let flightTime = 0;
  let flightArc = 0;
  let baitTime = 0;
  let biteWindow = 0;
  let validCast = false;
  let nextRippleTime = 0;
  let nextReelSound = 0;
  let nextUpdate = 0;
  let slackTime = 0;
  let overTension = 0;
  let wobble = 0;

  function getState() {
    return { ...state, fish: state.phase === 'caught' && state.fish ? { ...state.fish } : null };
  }

  function setPhase(phase, message) {
    state.phaseAge = 0;
    state.phase = phase;
    state.message = message;
    onState(getState());
  }

  function reset() {
    Object.assign(state, {
      power: 0, distance: 0, castDistance: 0, depth: 0,
      stamina: 0, tension: 0, fish: null, reeling: false,
    });
    charge = 0;
  }

  function lose(message) {
    state.reeling = false;
    onSound('lost');
    setPhase('lost', message);
  }

  function cancel() {
    if (state.phase === 'ready') return;
    reset();
    setPhase('ready', '已收竿。可以移動並選擇新的釣點。');
  }

  function beginFight() {
    state.tension = 0.36;
    state.stamina = 1;
    state.reeling = true;
    slackTime = overTension = 0;
    nextReelSound = 0;
    hookedPosition.copy(bobber);
    previousPlayer.copy(player);
    lure.ripple(bobber.x, bobber.z, 1.75, 1.1);
    onSound('hook');
    setPhase('fight', '魚已上鉤！收線時留意張力，魚衝刺時鬆手。');
  }

  function press() {
    if (['ready', 'caught', 'lost'].includes(state.phase)) {
      reset();
      setPhase('charging', '繼續按住增加拋投距離，鬆開拋竿。');
    } else if (state.phase === 'bite') {
      beginFight();
    } else if (state.phase === 'fight') {
      state.reeling = true;
    }
  }

  function release() {
    if (state.phase === 'fight') {
      state.reeling = false;
      return;
    }
    if (state.phase !== 'charging') return;

    const origin = camera.getWorldPosition(player);
    camera.getWorldDirection(aim);
    const pitch = aim.y;
    aim.y = 0;
    if (aim.lengthSq() < 0.001) {
      lose('竿尖方向太陡。請面向湖面再拋竿。');
      return;
    }
    aim.normalize();
    const range = mix(8, 37, Math.pow(state.power, 0.85)) * mix(0.74, 1.07, clamp((pitch + 0.7) / 0.9));
    target.copy(origin).addScaledVector(aim, range);
    validCast = world.isWater(target.x, target.z);
    target.y = validCast ? waterY + 0.06 : Math.max(waterY + 0.06, (world.heightAt?.(target.x, target.z) ?? waterY) + 0.06);
    launch.copy(rod.update(1 / 60, 0, state));
    bobber.copy(launch);
    state.castDistance = range;
    state.distance = range;
    flightTime = mix(0.61, 1.22, range / 37);
    flightArc = mix(1.1, 3.5, range / 37);
    onSound('cast');
    setPhase('casting', '浮標飛行中。');
  }

  function chooseFish() {
    const spot = world.spotAt?.(target.x, target.z)?.id;
    const locationWeights = spot === 'dock' ? [1.05, 1.25, 1, 1.24]
      : spot === 'rocks' ? [1.37, 0.81, 1.44, 0.71] : [0.82, 1.55, 1, 1.2];
    const weights = SPECIES.map((species, index) =>
      Math.exp(-Math.abs(state.depth - species.depth) * 0.34) * locationWeights[index] + 0.11);
    let roll = rng() * weights.reduce((total, weight) => total + weight, 0);
    const picked = weights.findIndex((weight) => (roll -= weight) < 0);
    activeSpecies = SPECIES[picked < 0 ? SPECIES.length - 1 : picked];
    const sizeQuantile = rng() ** 1.48;
    const { name, english, color, habitat, weight, length } = activeSpecies;
    return {
      name, english, color, habitat,
      weight: Math.round(mix(...weight, sizeQuantile) * 100) / 100,
      length: Math.round(mix(...length, sizeQuantile)),
    };
  }

  function landCast() {
    if (!validCast) {
      lose('拋投落在陸地。轉向湖面或調整蓄力距離。');
      return;
    }

    state.depth = Math.round((world.depthAt?.(target.x, target.z) ?? 3.2) * 10) / 10;
    state.fish = chooseFish();
    baitTime = mix(5.2, 12.5, rng()) + (state.depth > 8 ? 1.9 : 0);
    biteWindow = mix(1.65, 2.35, rng());
    wobble = rng() * TAU;
    nextRippleTime = 0;
    lure.ripple(target.x, target.z, 1.62, 1.58);
    lure.ripple(target.x, target.z, 1.08, 1.11, 0.10);
    onSound('splash');
    setPhase('waiting', '觀察浮標。浮標被拉入水中時，按下揚竿。');
  }

  function updateFloat(time) {
    const bite = state.phase === 'bite';
    const floatAge = bite ? baitTime + state.phaseAge : state.phaseAge;
    const drift = Math.min(floatAge * 0.041, 0.51);
    proposed.set(
      target.x + Math.sin(floatAge * 0.83 + wobble) * drift + drift * 0.64,
      waterY + 0.079 + Math.sin(time * 2.3 + wobble) * 0.041,
      target.z + Math.cos(floatAge * 0.58 + wobble) * drift * 0.7,
    );
    if (world.isWater(proposed.x, proposed.z)) bobber.copy(proposed);
    if (bite) {
      bobber.y -= 0.18 + Math.sin(state.phaseAge * 21) * 0.12;
      bobber.x += Math.sin(state.phaseAge * 17) * 0.09;
    }
    if (state.phaseAge >= nextRippleTime) {
      lure.ripple(bobber.x, bobber.z, bite ? 1.12 : 0.59, bite ? 0.7 : 1.75);
      nextRippleTime = state.phaseAge + (bite ? 0.26 : 1.62);
    }
  }

  function updateFight(dt) {
    const age = state.phaseAge;
    const surgeWave = Math.sin(age * 2.05 + wobble) * 0.72 + Math.sin(age * 4.1 + wobble * 2) * 0.28;
    const surge = clamp((surgeWave + 0.12) * 1.13);
    const pull = surge * mix(0.51, 1, state.stamina) * activeSpecies.strength;
    const priorDistance = Math.hypot(hookedPosition.x - previousPlayer.x, hookedPosition.z - previousPlayer.z);
    towardsPlayer.set(player.x - hookedPosition.x, 0, player.z - hookedPosition.z);
    const distance = towardsPlayer.length();
    towardsPlayer.normalize();
    const playerStretch = clamp((distance - priorDistance) * 0.092, -0.08, 0.13);
    const tensionRate = state.reeling ? 0.17 + pull * 0.32 : -0.32 + pull * 0.21;
    state.tension = clamp(state.tension + tensionRate * dt + playerStretch);
    const landingPressure = smooth(clamp((1 - state.tension) * 2.7));
    const tiring = state.reeling
      ? (0.14 + pull * 0.04) * mix(0.54, 1, landingPressure)
      : state.tension > 0.22 ? 0.049 + pull * 0.032 : 0.018;
    state.stamina = clamp(state.stamina - tiring * dt);

    overTension = state.tension >= 0.94 ? overTension + dt : Math.max(0, overTension - dt * 2);
    slackTime = state.tension <= 0.065 ? slackTime + dt : Math.max(0, slackTime - dt * 2);
    if (overTension > 0.73) {
      lose('張力過高，魚線斷了。下次魚衝刺時先鬆手。');
      return;
    }
    if (slackTime > 2.8) {
      lose('魚線太鬆，魚脫鉤了。下次保持適量張力。');
      return;
    }

    const sideways = Math.sin(age * 1.43 + wobble) * mix(0.5, 1, state.stamina) * activeSpecies.strength;
    const reelSpeed = state.reeling
      ? mix(2.15, 5.1, 1 - state.stamina) * (1 - pull * 0.48) * mix(0.53, 1, landingPressure)
      : -(0.44 + pull * 2.2);
    const inward = Math.min(reelSpeed * dt, distance - 0.9);
    proposed.copy(hookedPosition).addScaledVector(towardsPlayer, inward);
    proposed.x += towardsPlayer.z * sideways * dt;
    proposed.z -= towardsPlayer.x * sideways * dt;
    if (isFishWater(proposed.x, proposed.z)) {
      hookedPosition.copy(proposed);
    } else if (inward > 0) {
      proposed.copy(hookedPosition).addScaledVector(towardsPlayer, inward);
      if (isFishWater(proposed.x, proposed.z)) hookedPosition.copy(proposed);
    }

    previousPlayer.copy(player);
    state.distance = Math.hypot(hookedPosition.x - player.x, hookedPosition.z - player.z);
    bobber.copy(hookedPosition);
    bobber.y = waterY - 0.06 + Math.max(0, surge - 0.43) * 0.98 + Math.sin(age * 16) * 0.06;

    let reachable = state.distance <= 2.5;
    if (!reachable && state.distance < 4.7) {
      proposed.copy(hookedPosition).addScaledVector(towardsPlayer, Math.min(1.25, state.distance - 1.3));
      reachable = !isFishWater(proposed.x, proposed.z);
    }
    if (state.stamina <= 0.23 && reachable && state.tension > 0.12 && state.tension < 0.94) {
      state.reeling = false;
      lure.ripple(bobber.x, bobber.z, 1.8, 1.3);
      onSound('catch');
      setPhase('caught', '成功起魚！漁獲已加入釣魚紀錄。');
      onCatch({ ...state.fish });
      return;
    }

    if (age >= nextRippleTime && (surge > 0.63 || state.reeling)) {
      lure.ripple(bobber.x, bobber.z, surge > 0.63 ? 1.3 : 0.63, 1.02);
      nextRippleTime = age + (surge > 0.63 ? 0.28 : 0.8);
    }
    if (state.reeling && age >= nextReelSound) {
      onSound('reel');
      nextReelSound = age + 0.34;
    }

    if (state.tension >= 0.79) {
      state.message = '張力過高！放開收線，讓魚拉一段線。';
    } else if (state.tension <= 0.22) {
      state.message = '線鬆了。按住收線，重新拉緊魚線。';
    } else if (state.stamina <= 0.23) {
      state.message = '魚已疲乏。穩定收線，把魚帶到岸邊。';
    } else if (surge > 0.58) {
      state.message = '魚正在衝刺。先穩住魚線，再慢慢收線。';
    } else {
      state.message = '按住收線，張力接近紅區時鬆手。';
    }
  }

  function update(dt, time, position) {
    if (position) player.copy(position);
    else camera.getWorldPosition(player);
    state.phaseAge += dt;

    switch (state.phase) {
      case 'charging':
        charge += dt;
        state.power = clamp(charge / 1.16);
        break;
      case 'casting': {
        const progress = clamp(state.phaseAge / flightTime);
        bobber.lerpVectors(launch, target, progress);
        bobber.y += Math.sin(progress * Math.PI) * flightArc;
        if (progress >= 1) landCast();
        break;
      }
      case 'waiting':
        updateFloat(time);
        if (state.phaseAge >= baitTime) {
          nextRippleTime = 0;
          onSound('bite');
          setPhase('bite', '上鉤了！現在按下揚竿。');
        }
        break;
      case 'bite':
        updateFloat(time);
        if (state.phaseAge >= biteWindow) lose('揚竿慢了一步，魚游走了。');
        break;
      case 'fight':
        updateFight(dt);
        break;
    }

    tip.copy(rod.update(dt, time, state));
    lure.update(dt, time, state, tip, bobber);
    fishModel.update(time, state, bobber, tip);
    if (time >= nextUpdate) {
      onState(getState());
      nextUpdate = time + 0.055;
    }
  }

  onState(getState());
  return { update, press, release, cancel, getState };
}
