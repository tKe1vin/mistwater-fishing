import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const WATER_Y = 0;
const MAX_WADE_DEPTH = 0.65;
const LAKE_X = 39.5;
const LAKE_Z = 37;
const TAU = Math.PI * 2;
const bounds = { minX: -74, maxX: 73, minZ: -55, maxZ: 55 };
const spawn = { x: 5, z: 37, yaw: 0 };
const spots = [
  { id: 'dock', name: '松木棧橋', x: 5, z: 29, label: '松木棧橋', depth: 3.8, description: '棧橋伸入開闊湖面，適合遠投。' },
  { id: 'inlet', name: '蘆葦淺灣', x: -38.4, z: 19, label: '蘆葦淺灣', depth: 1.8, description: '微風吹過蘆葦，淺水適合短投。' },
  { id: 'rocks', name: '岩岸深潭', x: 37, z: 16.6, label: '岩岸深潭', depth: 6.8, description: '裸岩旁水深變化大，常有大魚巡游。' },
  { id: 'north', name: '北岸松林', x: -5, z: -40, label: '北岸松林', depth: 3.2, description: '松林外的緩坡可沿岸探索，往南拋投會逐漸進入深水。' },
];

const path = [
  [-50, 8], [-45, 13], [-40, 17], [-38, 22], [-36, 28], [-30, 34],
  [-22, 39], [-12, 41], [-3, 40], [5, 39], [14, 40], [23, 37],
  [31, 31], [36, 25], [39, 18], [43.9, 17], [45, 10], [48, 3],
  [50, -8], [45, -21], [39, -30], [30, -39], [19, -43], [7, -44],
  [-5, -40], [-19, -44], [-32, -43], [-43, -36], [-49, -26], [-51, -15],
  [-53, -4], [-50, 8],
];

const sunDirection = new THREE.Vector3(-0.38, 0.155, -0.912).normalize();
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(value, high));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (low, high, value) => {
  const t = clamp((value - low) / (high - low));
  return t * t * (3 - 2 * t);
};

function prng(seed) {
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function groundNoise(x, z) {
  return Math.sin(x * 0.126 + z * 0.048) * 0.52
    + Math.sin(x * 0.28 - z * 0.21) * 0.19
    + Math.cos(x * 0.061 - z * 0.13) * 0.38
    + Math.cos(x * 0.49 + z * 0.39) * 0.08;
}

function angularDistance(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function islandDistance(x, z, cx, cz, rx, rz) {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  const a = Math.atan2(dz, dx);
  return (1 - Math.hypot(dx, dz) + Math.sin(a * 5) * 0.07 + Math.cos(a * 3) * 0.045) * Math.min(rx, rz);
}

function shoreDistance(x, z) {
  const nx = x / LAKE_X;
  const nz = (z + 1) / LAKE_Z;
  const angle = Math.atan2(nz, nx);
  const westPoint = 0.27 * Math.exp(-Math.pow(angularDistance(angle, -2.85) / 0.24, 2));
  const eastPoint = 0.2 * Math.exp(-Math.pow(angularDistance(angle, -0.44) / 0.22, 2));
  const shore = 1 + 0.047 * Math.sin(angle * 3 + 0.4)
    + 0.041 * Math.sin(angle * 5 + 0.85)
    + 0.021 * Math.cos(angle * 9 + 0.3) - westPoint - eastPoint;
  const lakeShore = (Math.hypot(nx, nz) - shore) * 36;
  const willowIsland = islandDistance(x, z, 15.5, -24, 5.0, 3.4);
  const stoneIsland = islandDistance(x, z, -13, -28, 3.8, 2.15);
  return Math.max(lakeShore, willowIsland, stoneIsland);
}

function pathDistance(x, z) {
  let nearest = Infinity;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1];
    const [bx, bz] = path[i];
    const dx = bx - ax;
    const dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz));
    nearest = Math.min(nearest, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return nearest;
}

function groundHeight(x, z) {
  const edge = shoreDistance(x, z);
  if (edge < 0) return edge * 0.33;
  const wide = smooth(0, 11, edge);
  const rises = Math.pow(Math.max(0, edge - 6), 1.12) * 0.034;
  const hill = (Math.max(groundNoise(x - 21, z + 17) + 0.22, 0)) * 2.45;
  const trail = smooth(0.85, 3.8, pathDistance(x, z));
  const rockySlope = 1.4 * Math.exp(-((x - 51) ** 2 / 167 + (z - 12) ** 2 / 258));
  return edge * 0.06 + wide * (hill * lerp(0.39, 1, trail) + rises + rockySlope);
}

function isDock(x, z) {
  return x >= 3.07 && x <= 6.93 && z >= 27.4 && z <= 39.0;
}

function wadeDepthAt(x, z) {
  return isDock(x, z) ? 0 : Math.max(0, WATER_Y - groundHeight(x, z));
}

function isFishWater(x, z) {
  return shoreDistance(x, z) < -0.19;
}

function isWater(x, z) {
  return isFishWater(x, z) && !isDock(x, z);
}

function spotAt(x, z) {
  return spots.reduce((nearest, spot) => (
    Math.hypot(spot.x - x, spot.z - z) < Math.hypot(nearest.x - x, nearest.z - z) ? spot : nearest
  ));
}

function depthAt(x, z) {
  if (shoreDistance(x, z) >= 0) return 0;
  const rightShelf = smooth(13, 33, x) * smooth(0, 16, z) * 4.2;
  const sandbar = smooth(5, 32, -x) * smooth(-8, 23, z) * 2.3;
  return Math.max(0.22, -groundHeight(x, z) * 0.75 + rightShelf - sandbar);
}

const shaderUtilities = `
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1.0,0.0)),f.x),
             mix(hash21(i+vec2(0.0,1.0)),hash21(i+vec2(1.0)),f.x),f.y);
}
float cloud(vec2 p) {
  return noise2(p)*0.58 + noise2(p*2.05)*0.28 + noise2(p*4.15)*0.10 + noise2(p*8.2)*0.04;
}
`;

function buildSky(scene) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uSun: { value: sunDirection }, uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vWorld;
      void main(){
        vWorld = (modelMatrix * vec4(position,1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld,1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vWorld;
      uniform vec3 uSun;
      uniform float uTime;
      ${shaderUtilities}
      void main() {
        vec3 dir = normalize(vWorld - vec3(0., 12., 0.));
        float h = max(dir.y, 0.0);
        float toward = max(dot(dir,uSun), 0.0);
        vec3 sky = mix(vec3(.84,.64,.40),vec3(.20,.37,.52),smoothstep(-.045,.51,dir.y));
        sky = mix(sky, vec3(.36,.52,.62), smoothstep(.37,.81,h)*.38);
        sky += vec3(.22,.105,.039)*pow(toward,8.0) * (1.0-smoothstep(.2,.81,h));
        vec2 p = vec2(atan(dir.x, -dir.z) * 5.1 + uTime*.002, h * 17.2);
        float body = cloud(p + vec2(5.1,1.6));
        float wisps = cloud(p*vec2(1.25,1.63)+vec2(1.7,6.3));
        float wave = smoothstep(.5,.64,body*.74 + wisps*.26);
        float heightFade = smoothstep(-.001,.11,h) * (1.0-smoothstep(.44,.78,h));
        vec3 cloudColor = mix(vec3(.72,.66,.60), vec3(1.0,.83,.61), .38 + .62*pow(toward,6.0));
        sky = mix(sky, cloudColor, wave*heightFade*.85);
        float disc = smoothstep(.99969,.99983,toward);
        sky += vec3(.58,.29,.075)*pow(toward,72.0);
        sky = mix(sky,vec3(1.56,1.27,.84),disc);
        gl_FragColor = vec4(sky,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(397, 38, 20), material);
  sky.position.y = 12;
  sky.renderOrder = -100;
  sky.frustumCulled = false;
  scene.add(sky);
  return material;
}

function terrainColor(x, z, y, random) {
  const sand = new THREE.Color('#bc9e70');
  const wetSand = new THREE.Color('#817865');
  const meadow = new THREE.Color('#77834e');
  const darkGrass = new THREE.Color('#455f43');
  const pineFloor = new THREE.Color('#344b36');
  const gravel = new THREE.Color('#a88f61');
  const edge = shoreDistance(x, z);
  const n = groundNoise(x + 7, z - 5);
  const vegetation = meadow.lerp(darkGrass, smooth(-0.55, 0.74, n));
  vegetation.lerp(pineFloor, smooth(7.8, 21, y + Math.max(0, edge * .33)) * .7);
  const bank = wetSand.lerp(sand, smooth(-0.25, 1.85, edge)).lerp(vegetation, smooth(0.2, 4.2, edge + n * 1.23));
  const trail = 1 - smooth(0.7, 2.35, pathDistance(x, z) + n * 0.43);
  bank.lerp(gravel, trail * smooth(.4, 2.2, edge) * .85);
  return bank.multiplyScalar(0.90 + random * 0.20);
}

function facetedGrid(xRange, zRange, columns, rows, sample, color, seed) {
  const random = prng(seed);
  const points = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= columns; i++) {
      const x = lerp(xRange[0], xRange[1], i / columns);
      const z = lerp(zRange[0], zRange[1], j / rows);
      const jitterX = i === 0 || i === columns ? 0 : (random() - 0.5) * (xRange[1] - xRange[0]) / columns * 0.67;
      const jitterZ = j === 0 || j === rows ? 0 : (random() - 0.5) * (zRange[1] - zRange[0]) / rows * 0.67;
      points.push([x + jitterX, sample(x + jitterX, z + jitterZ), z + jitterZ]);
    }
  }
  const vertices = [];
  const colors = [];
  function triangle(a, b, c) {
    const shade = color((a[0]+b[0]+c[0])/3, (a[2]+b[2]+c[2])/3, (a[1]+b[1]+c[1])/3, random(), a, b, c);
    vertices.push(...a, ...b, ...c);
    colors.push(shade.r, shade.g, shade.b, shade.r, shade.g, shade.b, shade.r, shade.g, shade.b);
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const index = j * (columns + 1) + i;
      const a = points[index];
      const b = points[index + 1];
      const c = points[index + columns + 1];
      const d = points[index + columns + 2];
      if (random() < 0.5) {
        triangle(a, c, b);
        triangle(b, c, d);
      } else {
        triangle(a, c, d);
        triangle(a, d, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function buildGround(scene) {
  const geometry = facetedGrid([-126, 126], [-107, 104], 139, 118, groundHeight, terrainColor, 301);
  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.97,
  }));
  ground.receiveShadow = true;
  scene.add(ground);
}

function mountainHeight(x, z, ridge) {
  let value = 0;
  for (const [cx, cz, height, dx, dz] of ridge) {
    const rx = Math.abs(x - cx) / dx;
    const rz = Math.abs(z - cz) / dz;
    const cone = Math.max(0, 1 - Math.hypot(rx + Math.sin(z * .14 + cx) * .045, rz));
    value = Math.max(value, Math.pow(cone, .84) * height);
  }
  const rough = groundNoise(x * 0.73 + 130, z * .83);
  return Math.max(-8, (value - 4) + rough * smooth(0, 24, value) * 4.8);
}

function buildMountains(scene) {
  const distant = [
    [-143,-164,48,68,47],[-112,-183,70,68,65],[-75,-183,60,60,65],[-34,-177,66,72,68],
    [-3,-181,78,56,68],[26,-192,52,43,62],[57,-186,79,62,64],[100,-167,51,58,53],[143,-156,44,76,57],
  ];
  const foreground = [
    [-151,-93,39,75,58],[-104,-114,60,73,61],[-76,-116,69,55,52],[-55,-118,62,50,52],
    [-26,-112,39,40,44],[-2,-114,30,45,46],[24,-119,51,52,48],[45,-128,77,62,68],
    [65,-120,56,56,62],[87,-111,62,67,57],[128,-94,53,74,54],[150,-77,35,70,56],
  ];
  const foothills = [
    [-117,-43,22,62,41],[-95,-58,31,52,49],[-70,-66,27,43,41],[-45,-71,24,42,37],
    [1,-75,19,48,32],[40,-76,23,41,37],[70,-65,31,54,41],[100,-51,24,58,47],[140,-37,22,73,40],
  ];
  const add = (ridge, limits, hue, secondary, peak, snowline, seed) => {
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    const deep = new THREE.Color(hue);
    const high = new THREE.Color(secondary);
    const snow = new THREE.Color(peak);
    const normal = new THREE.Vector3();
    const u = new THREE.Vector3();
    const v = new THREE.Vector3();
    const light = new THREE.Vector3(-0.57, 0.67, 0.48);
    const color = (x, z, y, random, a, b, c) => {
      u.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      v.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      normal.crossVectors(u, v).normalize();
      const slope = Math.max(-0.3, normal.dot(light));
      const shade = deep.clone().lerp(high, smooth(0, 64, y) * .72 + random * .11);
      const snowCover = smooth(snowline - 4.5, snowline + 8, y + groundNoise(x * 1.7, z * 2.5) * 5 - (1 - normal.y) * 7);
      shade.lerp(snow, snowCover * (0.61 + slope * .36));
      return shade.multiplyScalar(0.86 + slope * 0.25 + random * 0.085);
    };
    const mesh = new THREE.Mesh(facetedGrid([-205, 205], limits, 76, 36, (x, z) => mountainHeight(x, z, ridge), color, seed), material);
    scene.add(mesh);
  };
  add(distant, [-241, -103], '#8c909f', '#a49db1', '#d6ced0', 47, 24);
  add(foreground, [-211, -47], '#596b72', '#859395', '#dbc7b0', 46, 145);
  add(foothills, [-111, 7], '#49615a', '#627b6b', '#b1b9ad', 200, 94);
}

function buildWater(scene) {
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSun: { value: sunDirection } },
    vertexShader: `
      varying vec3 vWorld;
      void main(){
        vWorld = (modelMatrix * vec4(position,1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld,1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vWorld;
      uniform float uTime;
      uniform vec3 uSun;
      ${shaderUtilities}
      float angular(float a,float b) { return atan(sin(a-b),cos(a-b)); }
      float island(vec2 p,vec2 center,vec2 radius) {
        vec2 k = (p-center)/radius;
        float a = atan(k.y,k.x);
        return (1.-length(k)+sin(a*5.)*.07+cos(a*3.)*.045)*min(radius.x,radius.y);
      }
      float shore(vec2 p) {
        vec2 np = vec2(p.x/39.5,(p.y+1.)/37.);
        float a = atan(np.y,np.x);
        float ww=angular(a,-2.85)/.24;
        float ee=angular(a,-.44)/.22;
        float radius=1.+.047*sin(a*3.+.4)+.041*sin(a*5.+.85)+.021*cos(a*9.+.3)-.27*exp(-ww*ww)-.2*exp(-ee*ee);
        float d=(length(np)-radius)*36.;
        d=max(d,island(p,vec2(15.5,-24.),vec2(5.,3.4)));
        return max(d,island(p,vec2(-13.,-28.),vec2(3.8,2.15)));
      }
      void main(){
        vec2 p=vWorld.xz;
        vec3 toEye=normalize(cameraPosition-vWorld);
        float d=shore(p);
        if(d>.10) discard;
        float t=uTime;
        float field=noise2(p*.15+vec2(t*.047,-t*.026));
        float waveA=sin(dot(p,vec2(.69,2.35))+t*1.49+field*2.6);
        float waveB=sin(dot(p,vec2(-1.34,2.86))-t*1.15+field*3.9);
        float waveC=sin(dot(p,vec2(1.82,5.22))+t*2.03);
        float tiny=noise2(p*vec2(1.35,3.65)+vec2(.32*t,-.38*t))-.5;
        vec3 normal=normalize(vec3(.044*waveA-.026*waveB+.022*tiny,1.,.049*waveA+.043*waveB+.016*waveC));
        vec3 reflected=reflect(-toEye,normal);
        float horizon=pow(clamp(1.-toEye.y,0.,1.),3.2);
        float depth=smoothstep(0.,10.,-d);
        vec3 lagoon=mix(vec3(.16,.31,.23),vec3(.028,.122,.132),depth);
        float grain=noise2(p*vec2(.63,1.19))*noise2(p*vec2(3.7,4.9));
        lagoon+=vec3(.013,.021,.013)*(waveA*.27+waveB*.31+waveC*.22+grain*.8);
        vec3 air=mix(vec3(.27,.40,.40),vec3(.60,.52,.37),pow(max(dot(reflected,vec3(-.34,.02,-.94)),0.0),4.0));
        float pineBand=.66+.13*sin(p.x*.31+p.y*.07+waveA*.32)+.08*sin(p.x*.74-waveB*.40);
        float hills=.55+.45*noise2(vec2(reflected.x*11.0+reflected.z*6.3,reflected.y*6.5));
        air *= mix(.80,1.13,hills*pineBand);
        float greenReflections=(1.0-smoothstep(0.0,6.0,-d))*horizon;
        air=mix(air,vec3(.095,.18,.132),greenReflections*.58);
        vec3 color=mix(lagoon,air,.16+horizon*.67);
        float align=max(dot(reflected,uSun),0.);
        float glimmer=pow(align,106.)*smoothstep(.09,.73,noise2(p*vec2(1.8,5.8)+vec2(t*.35,t*.81)));
        float flare=pow(max(dot(normalize(vec3(reflected.x,.105,reflected.z)),uSun),0.),48.);
        color+=vec3(.71,.39,.148)*glimmer + vec3(.155,.078,.023)*flare*horizon;
        float ripple = (waveA*.48+waveB*.39+waveC*.13);
        color+=vec3(.071,.083,.071)*smoothstep(.64,.99,ripple)*(.27+flare*.63);
        float edgeLine = smoothstep(-.31,-.07,d) * (1.-smoothstep(-.067,.085,d));
        color=mix(color, vec3(.48,.51,.35), edgeLine*(.29+.24*waveA));
        float fog = 1.-exp(-length(cameraPosition-vWorld)*.009);
        color=mix(color,vec3(.49,.48,.39), fog*.21);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(95, 88), material);
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(0, WATER_Y, -1);
  scene.add(plane);
  return material;
}

const standard = (color, roughness = 0.92) => new THREE.MeshStandardMaterial({ color, roughness });
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);

function box(parent, material, x, y, z, w, h, d) {
  const mesh = new THREE.Mesh(boxGeometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, d);
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, material, x, y, z, radius, height) {
  const mesh = new THREE.Mesh(cylinderGeometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(radius, height, radius);
  parent.add(mesh);
  return mesh;
}

function foliageGeometry(seed, variant, detailed) {
  const random = prng(seed);
  const layers = variant === 1
    ? [[.22, .52, .74], [.37, .73, .62], [.53, .86, .45], [.67, 1, .32]]
    : [[.19, .52, .86], [.34, .7, .77], [.48, .81, .61], [.63, .9, .48], [.74, 1, .34]];
  const vertices = [];
  const colors = [];
  const sides = detailed ? 8 : 5;
  const palette = ['#99a277', '#93a27a', '#6a8159', '#819c71', '#a2ae82'].map((color) => new THREE.Color(color));
  const centerX = .05 * (random() - .5);
  for (const [base, top, width] of layers) {
    const layerSpin = random() * TAU;
    const rim = [];
    const inner = [];
    for (let i = 0; i < sides; i++) {
      const angle = i * TAU / sides + layerSpin;
      const r = (i % 2 === 0 ? 1.03 : detailed ? .68 : .90) * width * (0.84 + random() * .25);
      rim.push([Math.cos(angle) * r, base + (random() - .66) * .06, Math.sin(angle) * r]);
      inner.push([Math.cos(angle) * r * .56 + centerX * base, lerp(base, top, .36) + random() * .026, Math.sin(angle) * r * .56]);
    }
    const tip = [centerX * top * 2, top, 0];
    const underside = [centerX * base, base + .015, 0];
    const face = (a, b, c, shade) => {
      vertices.push(...a, ...b, ...c);
      const color = palette[Math.floor(random() * palette.length)];
      colors.push(...[color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b].map((value) => value * shade));
    };
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      if (detailed) {
        face(rim[i], inner[i], rim[next], .85);
        face(inner[i], inner[next], rim[next], 1);
        face(inner[i], tip, inner[next], 1.03);
      } else {
        face(rim[i], tip, rim[next], .95);
      }
      face(underside, rim[i], rim[next], .53);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const instanceTransform = new THREE.Object3D();
function instance(mesh, index, x, y, z, sx, sy, sz, rotation, color) {
  instanceTransform.position.set(x, y, z);
  instanceTransform.scale.set(sx, sy, sz);
  instanceTransform.rotation.set(0, rotation, 0);
  instanceTransform.updateMatrix();
  mesh.setMatrixAt(index, instanceTransform.matrix);
  if (color) mesh.setColorAt(index, color);
}

function buildTrees(scene, blockers) {
  const random = prng(97103);
  const trees = [];
  const reserved = [[5, 37, 4], [5, 29, 5], [-38.4, 19, 2.55], [37, 16.6, 3.2], [-5, -40, 2.65]];
  for (let attempt = 0; attempt < 1850; attempt++) {
    const x = lerp(-103, 103, random());
    const z = lerp(-93, 76, random());
    const edge = shoreDistance(x, z);
    if (edge < 1.0 || pathDistance(x, z) < 2.08 || reserved.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r)) continue;
    if (z > 25 && x > -21 && x < 22 && z < 46) continue;
    const grove = groundNoise(x * .82 - 12, z * .73 + 131);
    if (grove < -.3 && random() < .73) continue;
    if (edge < 4.5 && (z > 6 || random() < .3)) continue;
    if (trees.some((tree) => Math.hypot(tree.x - x, tree.z - z) < (edge < 16 ? 2.65 : 2.35))) continue;
    let h = 3.5 + Math.pow(random(), 1.78) * 9.25;
    if (z > -40 && Math.abs(x) < 30 && z < 5) h *= 0.76;
    trees.push({ x, z, h, width: h * (0.19 + random() * .085), rotation: random() * TAU, variant: Math.floor(random() * 3), tint: random() });
  }
  [
    [-31,-5,10],[-29,-7,6.7],[-32,-11,11.0],[-34,-12,7.1],[-31,-14,8.2],
    [26,-17,10.2],[29,-18,8.5],[31,-11,10.5],[26,-13,7.2],[29,-10,7.8],
    [14.1,-25,6.5],[17,-25,5.2],[16,-23.1,4.6],[18.5,-23.8,3.9],
    [13.75,-23.8,3.15],[-12,-28.35,3.7],[-14.7,-28.4,4.9],
    [-10,-39,8.8],[-16,-40,9.5],[-22,-38,9.05],[-3,-37,7.0],[-7,-39,9.36],
    [8,-41,9.1],[13,-40,8.3],[17,-41,11.1],
  ].forEach(([x, z, h]) => {
    if (shoreDistance(x, z) > .28) trees.push({
      x, z, h, width: h * (.219 + random() * .035), rotation: random() * TAU, variant: Math.floor(random() * 3), tint: random(),
    });
  });
  const foliage = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 });
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.58, 1, 1, 7), standard('#6b5840'), trees.length);
  const forestColors = ['#577454', '#466541', '#799064', '#5d7d4b', '#667558', '#75916d'].map((color) => new THREE.Color(color));
  const tiles = new Map();
  for (const tree of trees) {
    const { x, z } = tree;
    const detailed = z > -45 && z < 54 && Math.abs(x) < 54 && (z > 14 || shoreDistance(x,z) < 10);
    const key = [Math.floor(x / 40), Math.floor(z / 37), detailed, tree.variant].join(':');
    if (!tiles.has(key)) tiles.set(key, { detailed, variant: tree.variant, trees: [] });
    tiles.get(key).trees.push(tree);
  }
  const baseGeometries = [false, true].map((detailed) => [0, 1, 2].map((variant) => (
    foliageGeometry(21 + variant * 641, variant, detailed)
  )));
  for (const tile of tiles.values()) {
    const geometry = baseGeometries[Number(tile.detailed)][tile.variant];
    const grove = new THREE.InstancedMesh(geometry, foliage, tile.trees.length);
    tile.trees.forEach(({ x, z, h, width, rotation, tint }, i) => {
      instance(grove, i, x, groundHeight(x, z), z, width, h, width, rotation, forestColors[Math.floor(tint * forestColors.length)]);
    });
    grove.computeBoundingSphere();
    scene.add(grove);
  }
  trees.forEach(({ x, z, h, rotation, tint }, i) => {
    const base = groundHeight(x, z);
    const radius = h * .023 + .036;
    instance(trunk, i, x, base + h * .255, z, radius, h * .52, radius, rotation, new THREE.Color().setScalar(.66 + tint * .33));
    if (x > bounds.minX && x < bounds.maxX && z > bounds.minZ && z < bounds.maxZ) blockers.push({ x, z, r: radius + .24 });
  });
  scene.add(trunk);
}

function buildRocks(scene, blockers) {
  const random = prng(11428);
  const groups = [
    [38.1, 12.9, 1.4, 0.61, 1.4], [39.15, 12.8, 1.66, 0.9, 1.03], [40.3, 12.0, 1.06, 0.65, 0.86],
    [41.15, 10.9, 1.37, 1.06, 1.18], [40.3, 9.15, 1.3, 0.6, 1.24], [42.2, 10.5, 1.22, 0.86, 1.11],
    [38, 14.6, 0.74, 0.42, 0.55], [40, 15.3, .95, 0.72, 0.95],
    [-33,-10,1.38, .65,.9],[-32.1,-8.2,.99,.47,1.1],[21.1,-23.6,1.2,.6,.8],[19.45,-21.6,1.15,.48,.76],
    [-10.8,-28.4,.96,.77,1.18],[-17.0,-28.1,1.25,.48,.83],
  ];
  for (let attempt = 0; attempt < 825; attempt++) {
    const x = lerp(-55, 55, random());
    const z = lerp(-57, 53, random());
    const edge = shoreDistance(x, z);
    if (edge < -0.48 || (edge > 6.0 && (edge > 12 || random() > .19))) continue;
    if (x > 1 && x < 9 && z > 25) continue;
    const size = 0.12 + Math.pow(random(), 2.8) * (z > 7 ? .92 : 1.43);
    const distance = pathDistance(x, z);
    if (distance < 1.13 && size > .22) continue;
    if (Math.hypot(x - 37, z - 16.6) < 2 && size > 0.38) continue;
    groups.push([x, z, size * (0.83 + random() * .56), size * (.37 + random() * .48), size * (.63 + random() * .65)]);
  }
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const material = standard('#ffffff');
  const rocks = new THREE.InstancedMesh(geometry, material, groups.length);
  const tones = ['#8a8a77', '#a19b83', '#6c7969', '#7c8377', '#969887', '#7e7971'].map((color) => new THREE.Color(color));
  groups.forEach(([x, z, rx, ry, rz], i) => {
    const angle = random() * TAU;
    instance(rocks, i, x, groundHeight(x, z) + ry * .19 - .025, z, rx, ry, rz, angle, tones[Math.floor(random() * tones.length)]);
    if (ry > .37 && shoreDistance(x, z) > .4) blockers.push({ x, z, r: Math.min(rx, rz) * .66 + .1 });
  });
  scene.add(rocks);
}

function buildMeadow(scene) {
  const random = prng(827);
  const vertices = [];
  for (let i = 0; i < 6; i++) {
    const px = (random() - .5) * .52;
    const pz = (random() - .5) * .52;
    const height = .39 + random() * .72;
    const bend = (random() - .5) * .71;
    const angle = random() * TAU;
    const dx = Math.cos(angle) * .033;
    const dz = Math.sin(angle) * .033;
    vertices.push(px-dx,0,pz-dz, px+dx,0,pz+dz, px+bend,height,pz+bend*.46);
  }
  const blades = new THREE.BufferGeometry();
  blades.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  blades.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 1 });
  const patches = [];
  for (let j = 0; j < 7550; j++) {
    const x = lerp(-57, 57, random());
    const z = lerp(-54, 52, random());
    const edge = shoreDistance(x, z);
    if (edge < .24 || edge > 16 || pathDistance(x, z) < .97 || (x > 2.6 && x < 7.4 && z > 28 && z < 40)) continue;
    const patch = groundNoise(x + 29, z - 153);
    const nearCoast = smooth(.6, 1.8, edge) * (1 - smooth(8.2, 16, edge));
    if (random() > .64 * nearCoast + .17 + .26 * patch) continue;
    const size = .16 + random() * .47;
    patches.push([x, z, size, nearCoast, random()]);
  }
  const meadow = new THREE.InstancedMesh(blades, material, patches.length);
  const grassColors = ['#8e9654', '#657c45', '#aaa068', '#657a50', '#8d975c', '#b6a369'].map((color) => new THREE.Color(color));
  patches.forEach(([x,z,h, density, tone], i) => {
    instance(meadow, i, x, groundHeight(x,z)-.055, z, .53+h, h*(.75 + .35*density), .53+h, random()*TAU, grassColors[Math.floor(tone * grassColors.length)]);
  });
  scene.add(meadow);

  const reeds = [];
  const clusters = [[-36.5,15.1,3.4,2.5],[-33.8,19.6,3.6,2.1],[-30.2,24.8,2.9,2.4],[-16.0,32.7,4.5,1.8],[12.9,33.8,4.3,1.7],[19.9,31.9,3.7,1.9],[25,26.35,3.0,2.8],[20,-21.5,2.0,1.6]];
  for (const [x, z, dx, dz] of clusters) {
    for (let i = 0; i < 55; i++) {
      const rx = x + (random() - .5) * dx * 2;
      const rz = z + (random() - .5) * dz * 2;
      const edge = shoreDistance(rx, rz);
      if (edge < -0.48 || edge > 2.75) continue;
      reeds.push([rx,rz,.47 + random()*.98,random()]);
    }
  }
  const reedMesh = new THREE.InstancedMesh(blades, material, reeds.length);
  const stalks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.009,.013,1,4), standard('#706746'), reeds.length);
  const heads = new THREE.InstancedMesh(new THREE.CylinderGeometry(.045,.035,1,5), standard('#775637'), reeds.length);
  reeds.forEach(([x,z,h,r], i) => {
    const y = groundHeight(x,z)-.08;
    instance(reedMesh, i, x, y, z, .73+r*.44,h,.73+r*.44,r*TAU, grassColors[Math.floor(r * grassColors.length)]);
    instance(stalks, i, x + .057, y+h*.55, z, 1, h*1.1,1,r*TAU);
    instance(heads, i, x + .057, y+h*1.10, z, 1, .15+r*.11,1,r*TAU);
  });
  scene.add(reedMesh, stalks, heads);
}

function mergeStaticGroup(group) {
  group.updateMatrixWorld(true);
  const byMaterial = new Map();
  group.traverse((object) => {
    if (!object.isMesh) return;
    if (!byMaterial.has(object.material)) byMaterial.set(object.material, []);
    byMaterial.get(object.material).push(object.geometry.clone().applyMatrix4(object.matrixWorld));
  });
  const batch = new THREE.Group();
  for (const [material, clones] of byMaterial) {
    const geometry = mergeGeometries(clones);
    clones.forEach((clone) => clone.dispose());
    batch.add(new THREE.Mesh(geometry, material));
  }
  return batch;
}

function buildDock(scene) {
  const dock = new THREE.Group();
  const wood = ['#a47d53', '#bb9160', '#b98c58', '#99724d', '#c9a577', '#ad8459', '#b9976a', '#a27b54'].map((color) => standard(color));
  const post = standard('#826142');
  const joist = standard('#624631');
  const metal = standard('#58564c', .69);
  const rope = standard('#a19072');
  const random = prng(6434);
  for (let i = 0; i < 29; i++) {
    const z = 27.57 + i * .398;
    const plank = box(dock, wood[Math.floor(random()*wood.length)], 5+(random()-.5)*.045, .48, z, 3.86+(random()-.5)*.12, .14, .382);
    plank.rotation.y = (random()-.5)*.008;
  }
  for (const x of [3.64, 6.36]) box(dock, joist, x, .32, 33.19, .17, .21, 11.59);
  for (const z of [27.62,31.44,34.38,37.55]) {
    box(dock, joist, 5, .23, z, 4.04, .15, .23);
    for (const x of [3.17, 6.83]) {
      const top = z < 34.4 ? .88 : .60;
      box(dock, post, x, -1.04 + top/2, z, .29, top+2.08, .29);
      box(dock, wood[4], x, top-.015, z, .32, .045, .31);
      if (z < 32) {
        for (let n = 0; n < 3; n++) {
          const loop = new THREE.Mesh(new THREE.TorusGeometry(.178,.014,4,9), rope);
          loop.rotation.x = Math.PI/2;
          loop.position.set(x, .63+n*.026, z);
          dock.add(loop);
        }
      }
    }
  }
  for (let i = 0; i < 29; i += 3) {
    for (const x of [3.58, 6.42]) {
      cylinder(dock, metal, x, .553, 27.57 + i * .398, .025, .012);
    }
  }

  for (const [x, z, sign, heading] of [[7.36,38.78,5,0],[-39.6,19.2,1,-.7],[37.8,17.6,3,.46],[-6.6,-41.45,2,Math.PI]]) {
    const signGroup = new THREE.Group();
    signGroup.position.set(x, groundHeight(x,z), z);
    signGroup.rotation.y = heading;
    box(signGroup, post, 0, .67, 0, .13, 1.34, .13);
    box(signGroup, wood[sign], .025, 1.13, -.015, .69, .33, .08);
    box(signGroup, wood[4], .025, 1.30, -.014, .71, .037, .105);
    const marker = box(signGroup, standard('#e2bf80'), .025, 1.13, .032, .105, .105, .013);
    marker.rotation.z = .785;
    scene.add(signGroup);
  }

  const crate = new THREE.Group();
  crate.position.set(7.54, groundHeight(7.54, 35.65), 35.65);
  crate.rotation.y = -.22;
  box(crate, wood[0], 0, .26, 0, .72, .51, .59);
  for (const x of [-.29,.29]) box(crate, wood[4], x, .268, -.306, .095, .52, .052);
  for (const y of [.05,.21,.38,.50]) box(crate, joist, 0,y,-.302,.59,.018,.019);
  dock.add(crate);
  scene.add(mergeStaticGroup(dock));
}

function buildRowboat(scene) {
  const group = new THREE.Group();
  group.position.set(1.49, -.015, 29.76);
  group.rotation.y = -.12;
  const hullMaterial = standard('#765146');
  hullMaterial.side = THREE.DoubleSide;
  const boatTrim = standard('#b89066');
  const canvas = standard('#738d7d');
  const slices = [
    [-1.70, .035, .58],[-1.38,.46,.395],[-.83,.68,.305],[-.15,.77,.278],
    [.52,.71,.29],[1.21,.57,.345],[1.61,.20,.46],[1.72,.045,.51],
  ];
  const positions = [];
  const port = [];
  const starboard = [];
  for (let i = 1; i < slices.length; i++) {
    const [a, aw, ah] = slices[i - 1];
    const [b, bw, bh] = slices[i];
    const triangle = (x, y, z) => positions.push(...x,...y,...z);
    const quad = (w1, w2, w3, w4) => {
      triangle(w1,w2,w3);
      triangle(w1,w3,w4);
    };
    quad([-aw,ah,a],[-aw*.61,-.04,a],[-bw*.61,-.04,b],[-bw,bh,b]);
    quad([aw,ah,a],[bw,bh,b],[bw*.61,-.04,b],[aw*.61,-.04,a]);
    quad([-aw*.61,-.038,a],[aw*.61,-.038,a],[bw*.61,-.038,b],[-bw*.61,-.038,b]);
  }
  for (const [z,w,y] of slices) {
    port.push(new THREE.Vector3(-w,y,z));
    starboard.push(new THREE.Vector3(w,y,z));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();
  group.add(new THREE.Mesh(geometry,hullMaterial));
  for (const edges of [port,starboard]) {
    const path = new THREE.CatmullRomCurve3(edges);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(path,25,.040,5,false),boatTrim));
  }
  for (const [z,w] of [[-.72,1.26],[.27,1.42],[1.03,1.15]]) box(group, boatTrim, 0,.23,z,w,.052,.24);
  for (let i=0;i<7;i++) box(group, boatTrim, (i-3)*.094,.03,.065,.089,.045,2.48);
  box(group, canvas, .13,.295,.33,.32,.042,.17);
  const location = group.position.clone();
  const orientation = group.rotation.clone();
  group.position.set(0,0,0);
  group.rotation.set(0,0,0);
  const mergedBoat = mergeStaticGroup(group);
  mergedBoat.position.copy(location);
  mergedBoat.rotation.copy(orientation);
  scene.add(mergedBoat);
  const tie = new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.32,.43,31.26),new THREE.Vector3(1.75,.29,31.22),
    new THREE.Vector3(2.44,.37,31.39),new THREE.Vector3(3.18,.70,31.43),
  ]);
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(tie,18,.027,5,false),standard('#b9a17d')));
  return mergedBoat;
}

function buildLighting(scene) {
  scene.fog = new THREE.FogExp2('#a3a596', 0.0044);
  const ambient = new THREE.HemisphereLight('#e8ece2', '#ac9173', 2.16);
  const sun = new THREE.DirectionalLight('#ffe1af', 2.4);
  sun.position.set(-44,44,-39);
  const fill = new THREE.DirectionalLight('#b9d1c1', .55);
  fill.position.set(40,25,27);
  scene.add(ambient, sun, fill);
}

export function createWorld(scene) {
  const blockers = [];
  buildLighting(scene);
  const sky = buildSky(scene);
  buildMountains(scene);
  buildGround(scene);
  const water = buildWater(scene);
  buildTrees(scene, blockers);
  buildRocks(scene, blockers);
  buildMeadow(scene);
  buildDock(scene);
  const boat = buildRowboat(scene);
  return {
    waterY: WATER_Y,
    bounds,
    spawn,
    spots,
    trail: path,
    isWater,
    isFishWater,
    depthAt,
    wadeDepthAt,
    spotAt,
    heightAt(x, z) {
      return isDock(x, z) ? .55 : groundHeight(x,z);
    },
    canMove(x, z) {
      if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return false;
      if (isDock(x, z)) return true;
      if (wadeDepthAt(x, z) > MAX_WADE_DEPTH) return false;
      return !blockers.some((obstacle) => (x - obstacle.x) ** 2 + (z - obstacle.z) ** 2 < obstacle.r ** 2);
    },
    update(time) {
      sky.uniforms.uTime.value = time;
      water.uniforms.uTime.value = time;
      boat.position.y = -.015 + Math.sin(time*1.52)*.022;
      boat.rotation.z = Math.sin(time*.93)*.014;
    },
  };
}
