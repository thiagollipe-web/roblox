import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLATFORMS, PAIRS, ribbonPoints, COLLECTIBLES, LANDMARKS, GATE_WIDTHS, type GameState, type Vec3 } from './game';

type QualityMode = 'auto' | 'high' | 'low';
type RenderOptions = { dt: number; elapsed: number; started: boolean; aiming: boolean; position?: Vec3; frameMs?: number };

/** Presentation only: all contacts, pickups and puzzle rules belong to game.ts. */
export function createView(container: HTMLElement) {
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.25 : 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.domElement.setAttribute('aria-label', 'BAINHA: aventura WebGL 3D nos Jardins Suspensos');
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  // A tiny local texture supplies a soft horizon without another scene pass.
  const skyData = new Uint8Array(4 * 128);
  const skyBottom = new THREE.Color('#d4f5ff'), skyTop = new THREE.Color('#57c7fa');
  const skyColor = new THREE.Color();
  for (let i = 0; i < 128; i++) {
    skyColor.copy(skyBottom).lerp(skyTop, Math.pow(i / 127, .7)).convertLinearToSRGB();
    skyData[i * 4] = Math.round(skyColor.r * 255); skyData[i * 4 + 1] = Math.round(skyColor.g * 255);
    skyData[i * 4 + 2] = Math.round(skyColor.b * 255); skyData[i * 4 + 3] = 255;
  }
  const sky = new THREE.DataTexture(skyData, 1, 128, THREE.RGBAFormat);
  sky.colorSpace = THREE.SRGBColorSpace; sky.minFilter = sky.magFilter = THREE.LinearFilter; sky.needsUpdate = true;
  scene.background = sky;
  scene.fog = new THREE.Fog('#b9efff', 45, 125);
  const camera = new THREE.PerspectiveCamera(49, 1, .1, 180);
  camera.position.set(8.5, 9, -12); camera.lookAt(0, .9, 5.4);
  const light = new THREE.DirectionalLight('#fff4d6', 3.3);
  light.castShadow = true;
  light.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
  light.shadow.camera.left = -20; light.shadow.camera.right = 20;
  light.shadow.camera.top = 24; light.shadow.camera.bottom = -24;
  light.shadow.camera.near = 1; light.shadow.camera.far = 75;
  light.shadow.normalBias = .035; light.shadow.bias = -.00008;
  scene.add(light, light.target, new THREE.HemisphereLight('#e4fbff', '#6b824e', 2.0));
  light.position.set(-12, 23, -8); light.target.position.set(0, 0, 8);

  const mat = (color: string, roughness = .72, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const grass = mat('#72ce36'), grassEdge = mat('#3cac36'), earth = mat('#d9944f'), earthBand = mat('#b76638');
  const path = mat('#ffdf97'), trunk = mat('#a95636'), leaf = mat('#33b963'), leafLight = mat('#80dc44');
  const cream = mat('#fff8dc'), coral = mat('#ff635e', .47), pink = mat('#ff96b5', .58), teal = mat('#15b4b8', .4);
  const blue = mat('#227bac', .45), cyan = mat('#61e6ff', .38), petalBlue = mat('#368de2', .48), dark = mat('#26344e', .48), skin = mat('#ffd5a8', .55);
  const gold = mat('#ffc83e', .28, .25), boot = mat('#ffbd2f', .35), white = mat('#ffffff', .4);
  const cloudMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const glow = new THREE.MeshBasicMaterial({ color: '#fff9cb' });
  const ribbonMaterial = new THREE.MeshStandardMaterial({ color: '#ff7c92', emissive: '#f35370', emissiveIntensity: .12, roughness: .4, metalness: .05, side: THREE.DoubleSide });
  const waterMaterial = new THREE.MeshStandardMaterial({ color: '#47dff3', emissive: '#138cae', emissiveIntensity: .15, roughness: .17, metalness: .2 });
  const geometries = new Map<string, THREE.BufferGeometry>();
  const sphereGeometry = new THREE.SphereGeometry(1, 16, 12);
  const detailGeometry = new THREE.SphereGeometry(1, 8, 6);
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 16);
  const torusGeometry = new THREE.TorusGeometry(1, .12, 8, 28);
  const up = new THREE.Vector3(0, 1, 0);
  const object = new THREE.Object3D();
  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = scene) {
    const result = new THREE.Mesh(geometry, material);
    result.position.set(x, y, z);
    // Shadows are expensive on WebGL: only substantial nearby shapes opt in.
    result.castShadow = false; result.receiveShadow = false;
    parent.add(result); return result;
  }
  function sphere(x: number, y: number, z: number, sx: number, sy: number, sz: number, material: THREE.Material, parent: THREE.Object3D = scene) {
    const result = mesh(sphereGeometry, material, x, y, z, parent); result.scale.set(sx, sy, sz); return result;
  }
  function box(x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material, parent: THREE.Object3D = scene, rounded = 0) {
    let geometry: THREE.BufferGeometry = boxGeometry;
    if (rounded > 0) {
      const key = `${w}/${h}/${d}/${rounded}`;
      if (!geometries.has(key)) geometries.set(key, new RoundedBoxGeometry(w, h, d, 2, rounded));
      geometry = geometries.get(key)!;
    }
    const result = mesh(geometry, material, x, y, z, parent);
    if (!rounded) result.scale.set(w, h, d);
    return result;
  }
  function cylinder(x: number, y: number, z: number, r: number, h: number, material: THREE.Material, parent: THREE.Object3D = scene) {
    const result = mesh(cylinderGeometry, material, x, y, z, parent); result.scale.set(r, h, r); return result;
  }
  function hoop(x: number, y: number, z: number, r: number, material: THREE.Material, parent: THREE.Object3D = scene) {
    const result = mesh(torusGeometry, material, x, y, z, parent); result.scale.setScalar(r); return result;
  }
  function link(a: THREE.Vector3, b: THREE.Vector3, r: number, material: THREE.Material, parent: THREE.Object3D = scene) {
    const result = cylinder(0, 0, 0, r, a.distanceTo(b), material, parent);
    result.position.copy(a).add(b).multiplyScalar(.5); result.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize()); return result;
  }
  function shadows(root: THREE.Object3D, cast = true, receive = true) {
    root.traverse(child => { if (child instanceof THREE.Mesh) { child.castShadow = cast; child.receiveShadow = receive; } });
  }
  // Merge rigid parts in their parent's coordinates; animated children remain separate.
  function batchRigid(root: THREE.Object3D) {
    const batches = new Map<string, { material: THREE.Material; cast: boolean; receive: boolean; parts: THREE.BufferGeometry[]; sources: THREE.Mesh[] }>();
    for (const child of [...root.children]) {
      if (!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh || child.userData.animated || Array.isArray(child.material)) continue;
      child.updateMatrix();
      const transformed = child.geometry.clone().applyMatrix4(child.matrix);
      const geometry = transformed.index ? transformed.toNonIndexed() : transformed;
      if (geometry !== transformed) transformed.dispose();
      const key = `${child.material.uuid}/${child.castShadow}/${child.receiveShadow}`;
      let batch = batches.get(key);
      if (!batch) { batch = { material: child.material, cast: child.castShadow, receive: child.receiveShadow, parts: [], sources: [] }; batches.set(key, batch); }
      batch.parts.push(geometry); batch.sources.push(child);
    }
    for (const batch of batches.values()) {
      const geometry = mergeGeometries(batch.parts, false);
      if (geometry) {
        const merged = mesh(geometry, batch.material, 0, 0, 0, root);
        merged.castShadow = batch.cast; merged.receiveShadow = batch.receive;
        batch.sources.forEach(source => root.remove(source));
      }
      batch.parts.forEach(part => part.dispose());
    }
  }
  const terrainZones = new Map<number, THREE.Group>();
  function terrainZone(z: number) {
    const key = Math.floor(z / 24);
    if (!terrainZones.has(key)) { const group = new THREE.Group(); scene.add(group); terrainZones.set(key, group); }
    return terrainZones.get(key)!;
  }
  const trees: { base: THREE.Matrix4; near: boolean }[] = [];
  function tree(x: number, y: number, z: number, scale: number, near = true) {
    object.position.set(x, y, z); object.rotation.set(0, 0, 0); object.scale.setScalar(scale); object.updateMatrix();
    trees.push({ base: object.matrix.clone(), near });
  }

  // Flower beds are instanced to keep the portrait phone renderer affordable.
  const flowers: {x:number;y:number;z:number;s:number}[] = [];
  for (const p of PLATFORMS) {
    const c = p.center, s = p.size, top = c.y + s.y / 2;
    const zone = terrainZone(c.z);
    const thickness = Math.max(s.y, 1.1);
    box(c.x, top - thickness / 2 - .12, c.z, s.x, thickness, s.z, earth, zone, .17);
    box(c.x, top - thickness + .15, c.z, s.x + .02, .3, s.z + .02, earthBand, zone, .1);
    box(c.x, top - .15, c.z, s.x + .16, .3, s.z + .16, grassEdge, zone, .11);
    box(c.x, top - .025, c.z, s.x + .12, .16, s.z + .12, grass, zone, .07);
    // Raised platforms are edged in a sunlit band, making their height easy to read.
    if (s.z < 5.1) box(c.x, top - .43, c.z - s.z / 2 - .012, s.x - .35, .15, .025, path, zone);
    if (s.x >= 9 && s.z >= 8) {
      const tiles = Math.floor(s.z / 1.7);
      for (let j = 0; j < tiles; j++) {
        const stone = box(c.x + Math.sin(j * 1.4) * .25, top + .07, c.z - s.z / 2 + 1 + j * 1.7, 1.6, .045, 1.28, path, zone, .02);
        stone.rotation.y = .07 * Math.sin(j * 3);
      }
      tree(c.x - s.x / 2 + 1.05, top, c.z + s.z * .12, 1.0);
      tree(c.x + s.x / 2 - 1.05, top, c.z - s.z * .25, .78);
      for (let side of [-1, 1]) for (let i = 0; i < 7; i++) {
        flowers.push({ x:c.x + side * (s.x / 2 - .55 - .27 * (i % 3)), y:top + .17, z:c.z - s.z / 2 + .7 + i * (s.z - 1.4) / 7, s:.12 + .04 * (i % 2) });
      }
      // Rounded embedded stones add scale and readable earth strata without textures.
      for (let j = 0; j < 5; j++) sphere(c.x - s.x / 2 + 1 + j * (s.x - 2) / 4, top - .67, c.z - s.z / 2 - .02, .23, .15, .055, path, zone);
    }
  }
  for (const zone of terrainZones.values()) { shadows(zone); batchRigid(zone); }
  const flowerDots = new THREE.InstancedMesh(detailGeometry, pink, flowers.length * 4);
  const flowerCenters = new THREE.InstancedMesh(detailGeometry, gold, flowers.length);
  flowers.forEach((f, i) => {
    for (let j = 0; j < 4; j++) {
      object.position.set(f.x + Math.cos(j * Math.PI / 2) * f.s, f.y, f.z + Math.sin(j * Math.PI / 2) * f.s);
      object.scale.set(f.s, f.s * .52, f.s); object.updateMatrix(); flowerDots.setMatrixAt(i * 4 + j, object.matrix);
    }
    object.position.set(f.x, f.y + .045, f.z); object.scale.setScalar(f.s * .65); object.updateMatrix(); flowerCenters.setMatrixAt(i, object.matrix);
  });
  scene.add(flowerDots, flowerCenters);

  // One smooth, vertex-colored silhouette replaces each pair of intersecting hill caps.
  const hillGeometry = new THREE.SphereGeometry(1, 24, 14);
  const hillPositions = hillGeometry.getAttribute('position'), hillColors = new Float32Array(hillPositions.count * 3);
  const hillBottom = new THREE.Color('#38aeaa'), hillTop = new THREE.Color('#9dde67'), hillColor = new THREE.Color();
  for (let i = 0; i < hillPositions.count; i++) {
    const height = THREE.MathUtils.smoothstep(hillPositions.getY(i), .12, .92);
    hillColor.copy(hillBottom).lerp(hillTop, height);
    hillColors.set([hillColor.r, hillColor.g, hillColor.b], i * 3);
  }
  hillGeometry.setAttribute('color', new THREE.BufferAttribute(hillColors, 3));
  const hills = new THREE.InstancedMesh(hillGeometry, new THREE.MeshLambertMaterial({ vertexColors: true, color: '#ffffff' }), 18);
  scene.add(hills);
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1, x = side * (20 + (i * 7) % 18), z = i * 6 - 8;
    const h = 4 + (i % 4) * 2.3, y = -8 + i % 3;
    object.position.set(x, y, z); object.rotation.set(0, 0, 0); object.scale.set(7 + i % 3, h * 1.08, 6); object.updateMatrix();
    hills.setMatrixAt(i, object.matrix);
    if (i % 4 === 0) tree(x, y + h, z, 1.2, false);
  }
  // All crowns move through instance matrices: wind adds no per-tree draw calls.
  const treeParts = [
    { geometry: cylinderGeometry, material: trunk, position: [0, 1, 0], scale: [.19, 2, .19], crown: false },
    { geometry: sphereGeometry, material: leaf, position: [0, .5, 0], scale: [1.15, 1.25, 1.1], crown: true },
    { geometry: sphereGeometry, material: leaf, position: [-.58, .18, .05], scale: [.78, .85, .8], crown: true },
    { geometry: sphereGeometry, material: leaf, position: [.58, .18, .12], scale: [.73, .8, .78], crown: true },
    { geometry: sphereGeometry, material: leaf, position: [-.12, 1.05, -.02], scale: [.77, .7, .73], crown: true },
    { geometry: detailGeometry, material: coral, position: [.72, .4, -.62], scale: [.16, .18, .16], crown: true },
    { geometry: detailGeometry, material: coral, position: [-.4, .72, -.9], scale: [.15, .18, .15], crown: true },
  ];
  const treeBuckets = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material; near: boolean; parts: { tree: number; crown: boolean; local: THREE.Matrix4 }[] }>();
  trees.forEach((tree, index) => treeParts.forEach(part => {
    const key = `${part.material.uuid}/${tree.near}`;
    let bucket = treeBuckets.get(key);
    if (!bucket) { bucket = { geometry: part.geometry, material: part.material, near: tree.near, parts: [] }; treeBuckets.set(key, bucket); }
    object.position.fromArray(part.position); object.rotation.set(0, 0, 0); object.scale.fromArray(part.scale); object.updateMatrix();
    bucket.parts.push({ tree: index, crown: part.crown, local: object.matrix.clone() });
  }));
  const treeBatches = [...treeBuckets.values()].map(bucket => {
    const instances = new THREE.InstancedMesh(bucket.geometry, bucket.material, bucket.parts.length);
    instances.castShadow = bucket.near && bucket.material !== coral; instances.receiveShadow = bucket.near;
    instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage); instances.frustumCulled = false;
    scene.add(instances); return { ...bucket, instances };
  });
  const crownMatrices = trees.map(() => new THREE.Matrix4()), instanceMatrix = new THREE.Matrix4();
  function updateTrees(t: number) {
    trees.forEach((tree, index) => {
      const crown = crownMatrices[index]; crown.makeRotationZ(Math.sin(t * .9 + index) * .018); crown.setPosition(0, 1.9, 0); crown.premultiply(tree.base);
    });
    for (const batch of treeBatches) {
      batch.parts.forEach((part, index) => {
        instanceMatrix.multiplyMatrices(part.crown ? crownMatrices[part.tree] : trees[part.tree].base, part.local);
        batch.instances.setMatrixAt(index, instanceMatrix);
      });
      batch.instances.instanceMatrix.needsUpdate = true;
    }
  }
  updateTrees(0);
  const cloudParts: { x: number; y: number; z: number; sx: number; sy: number; sz: number; phase: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const x = ((i * 23) % 85) - 42, z = i * 9 - 12;
    const y = 10 + (i % 5) * 2.3;
    const size = 1.5 + (i % 3) * .5;
    cloudParts.push({ x: x - size, y, z, sx: size * 1.4, sy: size * .65, sz: size * .7, phase: i * 1.3 },
      { x, y: y + size * .22, z, sx: size * 1.1, sy: size * .9, sz: size * .8, phase: i * 1.3 },
      { x: x + size, y: y - .08, z, sx: size, sy: size * .6, sz: size * .65, phase: i * 1.3 });
  }
  const clouds = new THREE.InstancedMesh(sphereGeometry, cloudMaterial, cloudParts.length);
  clouds.instanceMatrix.setUsage(THREE.DynamicDrawUsage); clouds.frustumCulled = false; scene.add(clouds);
  function updateClouds(t: number) {
    cloudParts.forEach((c, i) => {
      object.position.set(c.x + Math.sin(t * .07 + c.phase) * 2.3, c.y, c.z); object.rotation.set(0, 0, 0);
      object.scale.set(c.sx, c.sy, c.sz); object.updateMatrix(); clouds.setMatrixAt(i, object.matrix);
    });
    clouds.instanceMatrix.needsUpdate = true;
  }
  updateClouds(0);
  const sun = sphere(-28, 28, 95, 4, 4, 4, new THREE.MeshBasicMaterial({color:'#fff4ac',fog:false})); sun.castShadow = false;

  // Iri: a tiny courier with a spool backpack, rounded overalls and a flying coral scarf.
  const player = new THREE.Group(), avatar = new THREE.Group(); scene.add(player); player.add(avatar);
  sphere(0, .65, 0, .37, .42, .27, teal, avatar);
  sphere(0, .73, .22, .23, .24, .09, blue, avatar);
  sphere(-.17, .88, .26, .037, .037, .025, gold, avatar); sphere(.17, .88, .26, .037, .037, .025, gold, avatar);
  sphere(0, 1.22, .025, .38, .37, .33, skin, avatar);
  sphere(-.37, 1.21, .015, .082, .12, .1, skin, avatar); sphere(.37, 1.21, .015, .082, .12, .1, skin, avatar);
  sphere(0, 1.45, -.06, .4, .22, .35, cream, avatar);
  sphere(-.24, 1.35, .04, .16, .25, .25, cream, avatar);
  sphere(.13, 1.49, .2, .24, .15, .19, cream, avatar);
  // Eyes face +z and remain readable in the opening three-quarter view.
  const eyes = new THREE.Group(); avatar.add(eyes);
  for (const side of [-1, 1]) {
    sphere(side * .13, 1.25, .31, .075, .105, .035, white, eyes);
    sphere(side * .13, 1.255, .341, .041, .064, .019, dark, eyes);
    sphere(side * .13 - .009, 1.28, .357, .011, .017, .008, white, eyes);
    sphere(side * .245, 1.15, .272, .065, .036, .027, coral, avatar);
  }
  sphere(0, 1.18, .35, .06, .055, .06, skin, avatar);
  const smile = hoop(0, 1.10, .322, .053, dark, avatar); smile.scale.y *= .47;
  cylinder(0, .98, 0, .3, .13, coral, avatar);
  const scarf = box(0, .96, -.42, .23, .09, .67, coral, avatar, .035); scarf.rotation.x = -.2; scarf.userData.animated = true;
  sphere(0, .78, -.285, .27, .3, .16, blue, avatar);
  const packSpool = cylinder(0, .83, -.43, .17, .3, gold, avatar); packSpool.rotation.z = Math.PI / 2;
  for (const side of [-1, 1]) { const rim = cylinder(side * .18, .83, -.43, .235, .055, cream, avatar); rim.rotation.z = Math.PI / 2; }
  const limbs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * .18, .43, 0); avatar.add(leg);
    sphere(0, -.08, 0, .13, .22, .13, blue, leg);
    sphere(0, -.32, .065, .18, .12, .26, boot, leg); limbs.push(leg);
    const arm = new THREE.Group(); arm.position.set(side * .37, .85, 0); avatar.add(arm);
    sphere(side * .025, -.1, 0, .12, .22, .13, teal, arm);
    sphere(side * .035, -.29, .03, .12, .14, .12, cream, arm); limbs.push(arm);
  }
  // Major character shapes cast shadows; eyes and tiny metal fittings do not.
  avatar.traverse(child => {
    if (child instanceof THREE.Mesh) {
      child.receiveShadow = true;
      child.castShadow = ![gold, dark, white].includes(child.material as THREE.MeshStandardMaterial) && child.parent !== eyes;
    }
  });
  limbs.forEach(batchRigid); batchRigid(eyes); batchRigid(avatar);
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 32;
  const shadowContext = shadowCanvas.getContext('2d')!;
  const shadowGradient = shadowContext.createRadialGradient(16, 16, 2, 16, 16, 16);
  shadowGradient.addColorStop(0, 'rgba(32,59,49,.4)'); shadowGradient.addColorStop(.55, 'rgba(32,59,49,.19)'); shadowGradient.addColorStop(1, 'rgba(32,59,49,0)');
  shadowContext.fillStyle = shadowGradient; shadowContext.fillRect(0, 0, 32, 32);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas); shadowTexture.colorSpace = THREE.SRGBColorSpace;
  const shadow = mesh(new THREE.PlaneGeometry(1.55, 1.55), new THREE.MeshBasicMaterial({map: shadowTexture, transparent:true, opacity:.8, depthWrite:false}), 0, .12, 0);
  shadow.rotation.x = -Math.PI / 2; shadow.castShadow = false; shadow.receiveShadow = false;

  function instances(geometry: THREE.BufferGeometry, material: THREE.Material, count: number) {
    const result = new THREE.InstancedMesh(geometry, material, count);
    result.instanceMatrix.setUsage(THREE.DynamicDrawUsage); result.frustumCulled = false; scene.add(result); return result;
  }
  // Twenty-seven bobbing spools now share six draw calls, without tiny shadow passes.
  const spoolBodyGeometry = cylinderGeometry.clone().scale(.64, 1.25, .64).rotateZ(Math.PI / 2);
  const rimParts = [-1, 1].map(side => cylinderGeometry.clone().scale(1, .2, 1).rotateZ(Math.PI / 2).translate(side * .64, 0, 0));
  const spoolRimGeometry = mergeGeometries(rimParts, false)!; rimParts.forEach(part => part.dispose());
  const stitchGeometry = torusGeometry.clone().scale(.67, .67, .67).rotateY(Math.PI / 2);
  const orbitRadius = .57 / .34;
  const orbitGeometry = torusGeometry.clone().scale(orbitRadius, orbitRadius, orbitRadius * .4).rotateY(Math.PI / 2);
  const regularCount = COLLECTIBLES.filter(c => !c.special).length, specialCount = COLLECTIBLES.length - regularCount;
  const pickupBatches = {
    bodies: instances(spoolBodyGeometry, boot, regularCount), rims: instances(spoolRimGeometry, gold, regularCount),
    specialBodies: instances(spoolBodyGeometry, blue, specialCount), specialRims: instances(spoolRimGeometry, cyan, specialCount),
    stitches: instances(stitchGeometry, cream, COLLECTIBLES.length), orbits: instances(orbitGeometry, glow, specialCount),
  };
  const pickupBatchList = Object.values(pickupBatches);
  let regularIndex = 0, specialIndex = 0;
  const pickups = COLLECTIBLES.map((c, index) => ({ c, index, batchIndex: c.special ? specialIndex++ : regularIndex++, collected: false, pop: 0 }));
  function updatePickups(s: GameState | null, t: number, dt: number) {
    pickups.forEach((item, i) => {
      const collected = s?.collected.includes(item.c.id) ?? false;
      if (collected && !item.collected) item.pop = .38;
      if (!collected) item.pop = 0;
      item.collected = collected; item.pop = Math.max(0, item.pop - dt);
      object.position.set(item.c.position.x, item.c.position.y + Math.sin(t * 3 + i * .7) * .1 + (collected ? (1 - item.pop / .38) * 1.15 : 0), item.c.position.z);
      object.rotation.set(0, t * 2 + i * .7, Math.sin(t * 2 + i) * .12);
      object.scale.setScalar((item.c.special ? .34 : .2) * (collected ? item.pop / .38 : 1)); object.updateMatrix();
      (item.c.special ? pickupBatches.specialBodies : pickupBatches.bodies).setMatrixAt(item.batchIndex, object.matrix);
      (item.c.special ? pickupBatches.specialRims : pickupBatches.rims).setMatrixAt(item.batchIndex, object.matrix);
      pickupBatches.stitches.setMatrixAt(item.index, object.matrix);
      if (item.c.special) pickupBatches.orbits.setMatrixAt(item.batchIndex, object.matrix);
    });
    pickupBatchList.forEach(batch => { batch.instanceMatrix.needsUpdate = true; });
  }
  updatePickups(null, 0, 0);
  const anchorPoints = PAIRS.flatMap(pair => [pair.a, pair.b]);
  const anchorBases = instances(cylinderGeometry, cream, anchorPoints.length);
  const anchorRings = instances(torusGeometry, gold, anchorPoints.length);
  const anchorCenters = instances(detailGeometry, glow, anchorPoints.length);
  anchorPoints.forEach((point, i) => {
    object.position.set(point.x, point.y + .06, point.z); object.rotation.set(0, 0, 0); object.scale.set(.48, .16, .48); object.updateMatrix(); anchorBases.setMatrixAt(i, object.matrix);
    object.position.y = point.y + .54; object.scale.setScalar(.1); object.updateMatrix(); anchorCenters.setMatrixAt(i, object.matrix);
  });
  function updateAnchors(t: number) {
    anchorPoints.forEach((point, i) => {
      object.position.set(point.x, point.y + .54, point.z); object.rotation.set(0, Math.PI / 2 + Math.sin(t * 2 + i) * .18, 0); object.scale.setScalar(.34); object.updateMatrix(); anchorRings.setMatrixAt(i, object.matrix);
    });
    anchorRings.instanceMatrix.needsUpdate = true;
  }
  updateAnchors(0);
  const launch = new THREE.Group(); launch.position.set(LANDMARKS.launch.x, LANDMARKS.launch.y + .09, LANDMARKS.launch.z); scene.add(launch);
  cylinder(0, 0, 0, .9, .12, blue, launch);
  const launchRing = hoop(0, .1, 0, .68, gold, launch); launchRing.rotation.x = Math.PI / 2;
  const launchArrow = new THREE.Shape(); launchArrow.moveTo(0,.55); launchArrow.lineTo(-.35,0); launchArrow.lineTo(-.13,0); launchArrow.lineTo(-.13,-.5); launchArrow.lineTo(.13,-.5); launchArrow.lineTo(.13,0); launchArrow.lineTo(.35,0); launchArrow.closePath();
  const arrow = mesh(new THREE.ShapeGeometry(launchArrow), glow, 0, .17, 0, launch); arrow.rotation.x = -Math.PI / 2;

  const enemy = new THREE.Group(); enemy.position.set(LANDMARKS.enemy.x, LANDMARKS.enemy.y, LANDMARKS.enemy.z); scene.add(enemy);
  sphere(0, .53, 0, .66, .47, .58, blue, enemy);
  sphere(0, .67, .09, .54, .32, .48, teal, enemy);
  box(0, .81, 0, .07, .12, .94, gold, enemy, .03);
  for (const side of [-1, 1]) {
    sphere(side * .23, .61, -.43, .16, .18, .12, white, enemy);
    sphere(side * .23, .61, -.54, .075, .095, .035, dark, enemy);
    for (let i=0;i<3;i++) sphere(side * .6, .14, (i - 1) * .32, .2, .12, .15, dark, enemy);
  }
  const blades: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const blade = box(side * .2, .35, -.85, .11, .1, .67, cream, enemy, .045); blade.rotation.y = side * .4; blade.userData.animated = true; blades.push(blade);
    hoop(side * .28, .35, -.53, .16, gold, enemy).rotation.x = Math.PI / 2;
  }
  enemy.traverse(child => { if (child instanceof THREE.Mesh) { child.receiveShadow = true; child.castShadow = child.material === blue || child.material === teal; } });
  batchRigid(enemy);
  const cage = new THREE.Group(); cage.position.set(LANDMARKS.enemy.x + 3.1, LANDMARKS.enemy.y, LANDMARKS.enemy.z - 1.8); scene.add(cage);
  cylinder(0, .13, 0, .85, .25, earthBand, cage);
  const cageTop = hoop(0, 1.3, 0, .76, coral, cage); cageTop.rotation.x = Math.PI / 2;
  for(let i=0;i<6;i++){const a=i*Math.PI/3; cylinder(Math.cos(a)*.72,.75,Math.sin(a)*.72,.045,1.25,gold,cage);}
  batchRigid(cage);

  function gate(point: Vec3, width:number, height:number, color:THREE.Material) {
    const root = new THREE.Group(); root.position.set(point.x,point.y,point.z); scene.add(root);
    for (const side of [-1,1]) {
      cylinder(side*(width/2-.13), height/2, 0, .2, height+.3, earthBand, root);
      sphere(side*(width/2-.13),height+.25,0,.3,.3,.3,cream,root);
    }
    for (let i=0;i<=Math.ceil(width/.75);i++) box(-width/2+i*width/Math.ceil(width/.75),height/2,0,.12,height,.12,color,root,.04);
    box(0,height-.23,0,width,.16,.18,cream,root,.05);
    box(0,.35,0,width,.16,.18,color,root,.05);
    shadows(root); batchRigid(root);
    return root;
  }
  const enemyGate = gate(LANDMARKS.enemyGate,GATE_WIDTHS.enemy,4,coral);
  const bossGate = gate(LANDMARKS.bossGate,GATE_WIDTHS.boss,4,blue);

  // The guardian is an original walking flower, with petals that open on its pulse window.
  const guardian = new THREE.Group(); guardian.position.set(LANDMARKS.boss.x,LANDMARKS.boss.y,LANDMARKS.boss.z + 1.6); scene.add(guardian);
  cylinder(0,2.1,0,.46,4.2,leaf,guardian);
  for(const side of [-1,1]) {
    const foliage = sphere(side*1.1,1.8,0,1.4,.36,.7,leafLight,guardian); foliage.rotation.z=side*.32;
    sphere(side*.55,.3,-.2,.9,.35,1.0,leaf,guardian);
  }
  const flower = new THREE.Group(); flower.position.set(0,4.0,0); guardian.add(flower);
  const petals: THREE.Object3D[] = [];
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4;
    const petal = sphere(Math.sin(a)*1.65,Math.cos(a)*1.65,0,.85,1.25,.5,i%2?cyan:petalBlue,flower);
    petal.rotation.z=-a; petal.userData.animated = true; petals.push(petal);
  }
  sphere(0,0,-.23,1.22,1.22,.6,gold,flower);
  for(const side of [-1,1]) {
    sphere(side*.4,.12,-.76,.25,.3,.08,white,flower);
    sphere(side*.4,.12,-.84,.12,.18,.04,dark,flower);
    sphere(side*.73,-.31,-.72,.22,.1,.05,coral,flower);
  }
  const guardianSmile = hoop(0,-.43,-.81,.24,dark,flower); guardianSmile.scale.y*=.5;
  shadows(guardian, false, true);
  for (const child of guardian.children) if (child instanceof THREE.Mesh) child.castShadow = true;
  batchRigid(flower); batchRigid(guardian);
  const fountain = new THREE.Group(); fountain.position.set(LANDMARKS.goal.x,LANDMARKS.goal.y,LANDMARKS.goal.z); scene.add(fountain);
  cylinder(0,.17,0,1.25,.34,cream,fountain); cylinder(0,.36,0,.98,.16,blue,fountain);
  const water = cylinder(0,1.6,0,.11,2.4,waterMaterial,fountain); water.visible=false; water.userData.animated = true;
  const goalSpool = new THREE.Group(); goalSpool.position.y=1.7; fountain.add(goalSpool);
  cylinder(0,0,0,.38,.8,gold,goalSpool);
  cylinder(0,-.43,0,.57,.13,coral,goalSpool); cylinder(0,.43,0,.57,.13,coral,goalSpool);
  hoop(0,0,0,.85,glow,goalSpool).rotation.x=Math.PI/2;
  batchRigid(goalSpool); batchRigid(fountain);

  const ribbon = new THREE.Group(); scene.add(ribbon);
  const ribbonSamples = PAIRS.map(pair => ({ loose: ribbonPoints(pair, false), taut: ribbonPoints(pair, true) }));
  const ribbonVariants = new Map<string, THREE.Group>();
  for (const pair of PAIRS) for (const taut of [false, true]) {
    const variant = new THREE.Group(); variant.visible = false; ribbon.add(variant); ribbonVariants.set(`${pair.id}/${taut}`, variant);
    const points = taut ? ribbonSamples[pair.id].taut : ribbonSamples[pair.id].loose;
    const positions: number[] = [], indices: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i]; positions.push(p.x - 1.15, p.y + .035, p.z, p.x + 1.15, p.y + .035, p.z);
      if (i < points.length - 1) { const j = i * 2; indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    mesh(geometry, ribbonMaterial, 0, 0, 0, variant).receiveShadow = true;
    for (const side of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p.x + side * 1.09, p.y + .075, p.z)));
      mesh(new THREE.TubeGeometry(curve, 24, .035, 5, false), cream, 0, 0, 0, variant);
    }
    batchRigid(variant);
  }
  let ribbonKey = '';
  function refreshRibbon(s:GameState) {
    const key=`${s.pair}/${s.taut}`; if(key===ribbonKey)return; ribbonKey=key;
    for (const [variantKey, variant] of ribbonVariants) variant.visible = variantKey === key;
  }
  const trajectory=new THREE.Group();scene.add(trajectory);
  for(let i=0;i<18;i++){
    const t=i/17,a=LANDMARKS.launch,b=PAIRS[2].b;
    mesh(detailGeometry,glow,a.x+(b.x-a.x)*t,a.y+.8+(b.y-a.y)*t+Math.sin(t*Math.PI)*3.1,a.z+(b.z-a.z)*t,trajectory).scale.setScalar(.055);
  }
  batchRigid(trajectory);
  trajectory.visible = false;
  const confetti=new THREE.InstancedMesh(boxGeometry,new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.5}),80);confetti.visible=false;confetti.frustumCulled=false;scene.add(confetti);
  for(let i=0;i<80;i++)confetti.setColorAt(i,new THREE.Color(['#ff638d','#ffe16b','#77e6ca','#ffffff'][i%4]));

  const pulse = new THREE.Group(); scene.add(pulse); pulse.visible = false;
  sphere(0, 0, 0, .23, .23, .23, glow, pulse);
  const pulseHalo = hoop(0, 0, 0, .5, gold, pulse);
  pulseHalo.rotation.y = Math.PI / 2;
  let pulsePoints: Vec3[] = [];
  let visualClock = 0;
  let angle=Math.PI,walkClock=0,wasGrounded=true,landing=0,lastPulses=0,pulseAge=99,firstFrame=true;
  let walkBlend = 0, airBlend = 0, turnBank = 0, jumpStretch = 0;
  const limbTargets = new Float32Array(4);
  let lastDeaths = 0, lastElapsed = 0, lastStarted = false, lastCheckpoint = 0;
  const cameraLook = new THREE.Vector3(), cameraDesired=new THREE.Vector3(),lookDesired=new THREE.Vector3();
  let quality: QualityMode = 'auto', effectiveQuality: 'high' | 'low' = 'high';
  let renderedFrames = 0, qualityChanges = 0, frameTimeMs = 16.67, warmupTime = 0, slowTime = 0;
  let portrait=false;
  function resize(){const w=container.clientWidth||innerWidth,h=container.clientHeight||innerHeight;portrait=w/h<.85;renderer.setSize(w,h);camera.aspect=w/h;camera.fov=portrait?58:49;camera.updateProjectionMatrix();}
  resize();
  const sceneMaterials = new Set<THREE.Material>();
  scene.traverse(child => {
    if (child instanceof THREE.Mesh) {
      if (Array.isArray(child.material)) child.material.forEach(material => sceneMaterials.add(material));
      else sceneMaterials.add(child.material);
    }
  });
  function refreshShadowMaterials() {
    // compileAsync can retain a previous shadow variant's material state. Marking
    // it dirty selects the already compiled program and refreshes its uniforms.
    for (const material of sceneMaterials) material.needsUpdate = true;
  }
  function applyQuality(level: 'high' | 'low') {
    if (effectiveQuality !== level) qualityChanges++;
    effectiveQuality = level;
    const ratio = Math.min(devicePixelRatio, level === 'low' ? 1 : touch ? 1.25 : 1.5);
    if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
    const cast = level === 'high';
    if (light.castShadow !== cast) { light.castShadow = cast; refreshShadowMaterials(); }
    renderer.shadowMap.needsUpdate = true;
    (shadow.material as THREE.MeshBasicMaterial).opacity = level === 'low' ? 1 : .8;
  }
  function setQuality(mode: QualityMode) {
    quality = mode; warmupTime = 0; slowTime = 0; frameTimeMs = 16.67;
    applyQuality(mode === 'low' ? 'low' : 'high');
  }
  function observeFrame(options: RenderOptions) {
    if (!options.started || options.dt <= 0) return;
    const sample = options.frameMs ?? options.dt * 1000;
    if (!Number.isFinite(sample) || sample <= 0) return;
    // Ignore isolated tab/startup stalls; sustained slow frames lower quality only once.
    const seconds = Math.min(sample, 250) / 1000;
    frameTimeMs += (Math.min(sample, 250) - frameTimeMs) * .08;
    warmupTime += seconds;
    if (quality !== 'auto' || effectiveQuality === 'low' || warmupTime < 2.5) return;
    if (frameTimeMs > 29) slowTime += seconds;
    else if (frameTimeMs < 23) slowTime = Math.max(0, slowTime - seconds * 2);
    if (slowTime > 1.75) applyQuality('low');
  }
  function diagnostics() {
    return Object.freeze({ drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      pixelRatio: renderer.getPixelRatio(), quality, effectiveQuality, shadowMode: effectiveQuality === 'high' ? 'dynamic' : 'blob',
      renderedFrames, frameTimeMs: Math.round(frameTimeMs * 100) / 100, qualityChanges, geometryCount: renderer.info.memory.geometries });
  }
  let preparation: Promise<void> | undefined;
  function prepare() {
    return preparation ??= (async () => {
      // Compile both light variants, plus every action material, under the loading screen.
      const variants: THREE.Object3D[] = [...ribbonVariants.values(), pulse, trajectory, confetti, water];
      const visibility = variants.map(item => item.visible);
      variants.forEach(item => { item.visible = true; });
      renderer.initTexture(sky); renderer.initTexture(shadowTexture);
      try {
        for (const cast of [false, true]) {
          light.castShadow = cast;
          await renderer.compileAsync(scene, camera);
          refreshShadowMaterials();
          renderer.render(scene, camera);
        }
      } finally {
        variants.forEach((item, i) => { item.visible = visibility[i]; });
        light.castShadow = effectiveQuality === 'high'; refreshShadowMaterials();
      }
      renderer.render(scene, camera);
    })();
  }
  function render(s:GameState,options:RenderOptions) {
    const {dt,started,aiming}=options,p=options.position ?? s.position;
    const reset = (!lastStarted && started) || options.elapsed < lastElapsed || s.deaths !== lastDeaths || (s.checkpoint === 0 && lastCheckpoint > 0);
    if (reset) {
      firstFrame = true; visualClock = 0; walkClock = 0; walkBlend = 0; airBlend = s.grounded ? 0 : 1;
      turnBank = 0; jumpStretch = 0; landing = 0; wasGrounded = s.grounded; angle = started ? 0 : Math.PI + .28;
      lastPulses = s.pulses; pulseAge = 99;
      pickups.forEach(item => { item.collected = s.collected.includes(item.c.id); item.pop = 0; });
    }
    lastStarted = started; lastElapsed = options.elapsed; lastDeaths = s.deaths; lastCheckpoint = s.checkpoint;
    // This clock keeps presentation alive after victory; a paused frame supplies dt=0.
    visualClock += dt;
    const t = visualClock;
    const speed=Math.hypot(s.velocity.x,s.velocity.z),moving=speed>.15;
    const blend = 1 - Math.exp(-dt * 14), motionBlend = 1 - Math.exp(-dt * 10);
    walkClock+=dt*speed*2.9;
    let turn = 0;
    if(moving){const target=Math.atan2(s.velocity.x,s.velocity.z);turn=Math.atan2(Math.sin(target-angle),Math.cos(target-angle));angle+=turn*blend;}
    else if(!started)angle=Math.PI+.28;
    player.position.set(p.x,p.y,p.z);player.rotation.y=angle;
    if(!wasGrounded&&s.grounded)landing=1;
    wasGrounded=s.grounded;landing=Math.max(0,landing-dt*6);
    walkBlend += ((moving ? Math.min(1, speed / 4.5) : 0) - walkBlend) * motionBlend;
    airBlend += ((s.grounded ? 0 : 1) - airBlend) * blend;
    turnBank += (THREE.MathUtils.clamp(-turn * .15, -.16, .16) * walkBlend - turnBank) * motionBlend;
    jumpStretch += ((s.grounded ? 0 : Math.min(.1, Math.abs(s.velocity.y) * .011)) - jumpStretch) * blend;
    const step = Math.sin(walkClock) * walkBlend * (1 - airBlend);
    avatar.position.y = Math.abs(step) * .035 + (1 - walkBlend) * (1 - airBlend) * Math.sin(t * 2.1) * .012;
    avatar.scale.set(1 + landing * .13 - jumpStretch * .4, 1 - landing * .17 + jumpStretch, 1 + landing * .13 - jumpStretch * .4);
    avatar.rotation.x += ((walkBlend * .08 * (1 - airBlend) - airBlend * .08) - avatar.rotation.x) * blend;
    avatar.rotation.z = turnBank;
    limbTargets[0] = step * .62 - airBlend * .35; limbTargets[1] = -step * .55 - airBlend * .65;
    limbTargets[2] = -step * .62 + airBlend * .45; limbTargets[3] = step * .55 - airBlend * .65;
    for (let i = 0; i < limbs.length; i++) limbs[i].rotation.x += (limbTargets[i] - limbs[i].rotation.x) * blend;
    limbs[1].rotation.z += (.09 + airBlend * .36 - limbs[1].rotation.z) * blend;
    limbs[3].rotation.z += (-.09 - airBlend * .36 - limbs[3].rotation.z) * blend;
    scarf.rotation.x += (-.2 - Math.sin(t * 9) * (.035 + walkBlend * .065) - walkBlend * .24 - airBlend * .15 - scarf.rotation.x) * motionBlend;
    scarf.rotation.z += (turnBank * 1.6 + Math.sin(t * 4) * .025 - scarf.rotation.z) * motionBlend;
    const blinkPhase = (t + 1.1) % 4.3;
    eyes.scale.y = blinkPhase < .17 ? 1 - Math.sin(blinkPhase / .17 * Math.PI) * .9 : 1;
    let floor=-8;
    for(const platform of PLATFORMS){const c=platform.center,z=platform.size;const top=c.y+z.y/2;if(top<=p.y+.3&&Math.abs(p.x-c.x)<=z.x/2&&Math.abs(p.z-c.z)<=z.z/2)floor=Math.max(floor,top);}
    if (s.pair !== null) {
      const pair = PAIRS[s.pair], u = (p.z - pair.a.z) / (pair.b.z - pair.a.z);
      if (u >= 0 && u <= 1 && Math.abs(p.x - pair.a.x) < 1.15) {
        const ribbonY = pair.a.y + (pair.b.y - pair.a.y) * u - (s.taut ? 0 : .6 * Math.sin(u * Math.PI));
        if (ribbonY <= p.y + .3) floor = Math.max(floor, ribbonY + .04);
      }
    }
    shadow.visible=floor>-7;shadow.position.set(p.x,floor+.08,p.z);shadow.scale.setScalar(Math.max(.5,1-(p.y-floor)*.07));
    updatePickups(s,t,dt); updateTrees(t); updateClouds(t); updateAnchors(t);
    enemy.position.set(s.enemy==='captured'?cage.position.x:LANDMARKS.enemy.x+(s.enemy==='warning'?Math.sin(t*26)*.08:Math.sin(t*1.2)*.18),LANDMARKS.enemy.y+(s.enemy==='captured'?.23:Math.sin(t*5)*.025),s.enemy==='captured'?cage.position.z:LANDMARKS.enemy.z);
    enemy.scale.setScalar(s.enemy==='captured'?.65:1);
    blades.forEach((b,i)=>{b.rotation.y=(i?1:-1)*(s.enemy==='warning'?.65+Math.sin(t*16)*.25:.27);});
    enemyGate.visible=s.enemy!=='captured';bossGate.visible=!s.canalOpen;
    flower.rotation.z=Math.sin(t*1.7)*.06;
    petals.forEach((petal,i)=>{const target=s.bossReady?.72+.1*Math.sin(t*6+i):.5;petal.scale.z+=(target-petal.scale.z)*blend;});
    guardian.scale.y=1+Math.sin(t*1.7)*.025;
    goalSpool.rotation.y=t*1.8;goalSpool.position.y=1.7+Math.sin(t*2.3)*.15;water.visible=s.canalOpen;
    launchRing.rotation.z=t*.7;launchRing.material=s.bossReady?glow:gold;
    trajectory.visible=s.pair===2&&s.taut&&(aiming||s.bossReady);
    refreshRibbon(s);
    if (s.pulses !== lastPulses) {
      if (s.pulses > lastPulses && s.pair !== null) {
        pulseAge = 0; pulsePoints = ribbonSamples[s.pair].loose;
      } else { pulseAge = 99; pulsePoints = []; }
      lastPulses = s.pulses;
    }
    pulseAge += dt;
    pulse.visible = pulseAge < .65 && pulsePoints.length > 1;
    if (pulse.visible) {
      const phase = Math.min(1, pulseAge / .6) * (pulsePoints.length - 1);
      const index = Math.min(pulsePoints.length - 2, Math.floor(phase));
      const a = pulsePoints[index], b = pulsePoints[index + 1], mix = phase - index;
      pulse.position.set(a.x + (b.x - a.x) * mix, a.y + (b.y - a.y) * mix + .25, a.z + (b.z - a.z) * mix);
      pulse.scale.setScalar(1 + Math.sin(pulseAge * 24) * .16);
      pulseHalo.rotation.x = t * 8;
    }
    ribbonMaterial.emissiveIntensity = (s.taut ? .28 : .07) + Math.max(0, 1 - pulseAge / .45) * .75;
    confetti.visible=s.won;
    if(s.won){for(let i=0;i<80;i++){const time=(t*.6+i*.077)%1;object.position.set(p.x+Math.sin(i*17.13)*4,p.y+7-time*7,p.z+Math.cos(i*3.72)*4);object.rotation.set(t+i,t*.7+i, t*2+i);object.scale.set(.12,.055,.2);object.updateMatrix();confetti.setMatrixAt(i,object.matrix);}confetti.instanceMatrix.needsUpdate=true;}
    // Follow the feet, with a little forward look. Height changes never hide a landing.
    const followY=Math.max(0,p.y);
    if(started){cameraDesired.set(p.x*.72,followY+(portrait?10.0:7.8),p.z-(portrait?14.3:11.5));lookDesired.set(p.x*.8,followY+1.1,p.z+(portrait?4.8:4.8));}
    else {cameraDesired.set(8.5,9.0,-12);lookDesired.set(0,.9,5.4);}
    const smoothing=firstFrame?1:1-Math.exp(-dt*6);camera.position.lerp(cameraDesired,smoothing);cameraLook.lerp(lookDesired,smoothing);camera.lookAt(cameraLook);firstFrame=false;
    // Snap shadow tracking to a small world grid so subpixel motion does not crawl.
    const texel = 40 / light.shadow.mapSize.x;
    const shadowX = Math.round(p.x / texel) * texel, shadowZ = Math.round(p.z / texel) * texel;
    const shadowY = Math.round(followY / texel) * texel;
    light.position.set(shadowX-12,shadowY+23,shadowZ-8);light.target.position.set(shadowX,shadowY,shadowZ+8);
    renderer.render(scene,camera);
    renderedFrames++; observeFrame(options);
  }
  return {render,resize,renderer,prepare,setQuality,diagnostics};
}
