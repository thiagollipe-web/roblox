import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLATFORMS, PAIRS, ribbonPoints, COLLECTIBLES, LANDMARKS, GATE_WIDTHS, type GameState, type Vec3 } from './game';

/** Presentation only: all contacts, pickups and puzzle rules belong to game.ts. */
export function createView(container: HTMLElement) {
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.5 : 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.domElement.setAttribute('aria-label', 'BAINHA: aventura WebGL 3D nos Jardins Suspensos');
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#79d9ff');
  scene.fog = new THREE.Fog('#b9efff', 45, 125);
  const camera = new THREE.PerspectiveCamera(49, 1, .1, 180);
  const light = new THREE.DirectionalLight('#fff4d6', 3.3);
  light.castShadow = true;
  light.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
  light.shadow.camera.left = -20; light.shadow.camera.right = 20;
  light.shadow.camera.top = 24; light.shadow.camera.bottom = -24;
  light.shadow.camera.near = 1; light.shadow.camera.far = 75;
  light.shadow.normalBias = .035; light.shadow.bias = -.00008;
  scene.add(light, light.target, new THREE.HemisphereLight('#e4fbff', '#6b824e', 2.0));

  const mat = (color: string, roughness = .72, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const grass = mat('#72ce36'), grassEdge = mat('#3cac36'), earth = mat('#d9944f'), earthBand = mat('#b76638');
  const path = mat('#ffdf97'), trunk = mat('#a95636'), leaf = mat('#33b963'), leafLight = mat('#80dc44');
  const cream = mat('#fff8dc'), coral = mat('#ff635e', .47), pink = mat('#ff96b5', .58), teal = mat('#15b4b8', .4);
  const blue = mat('#227bac', .45), cyan = mat('#61e6ff', .38), petalBlue = mat('#368de2', .48), dark = mat('#26344e', .48), skin = mat('#ffd5a8', .55);
  const gold = mat('#ffc83e', .28, .25), boot = mat('#ffbd2f', .35), white = mat('#ffffff', .4);
  const cloudMaterial = mat('#ffffff', .9);
  const glow = new THREE.MeshBasicMaterial({ color: '#fff9cb' });
  const ribbonMaterial = new THREE.MeshStandardMaterial({ color: '#ff7c92', emissive: '#f35370', emissiveIntensity: .12, roughness: .4, metalness: .05, side: THREE.DoubleSide });
  const waterMaterial = new THREE.MeshStandardMaterial({ color: '#47dff3', emissive: '#138cae', emissiveIntensity: .15, roughness: .17, metalness: .2 });
  const geometries = new Map<string, THREE.BufferGeometry>();
  const sphereGeometry = new THREE.SphereGeometry(1, 16, 12);
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 16);
  const torusGeometry = new THREE.TorusGeometry(1, .12, 8, 28);
  const up = new THREE.Vector3(0, 1, 0);
  const object = new THREE.Object3D();
  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = scene) {
    const result = new THREE.Mesh(geometry, material);
    result.position.set(x, y, z); result.castShadow = true; result.receiveShadow = true;
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
  const treeCrowns: THREE.Object3D[] = [];
  function tree(x: number, y: number, z: number, scale: number) {
    const root = new THREE.Group(); root.position.set(x, y, z); root.scale.setScalar(scale); scene.add(root);
    cylinder(0, 1.0, 0, .19, 2.0, trunk, root);
    const crown = new THREE.Group(); crown.position.y = 1.9; root.add(crown); treeCrowns.push(crown);
    sphere(0, .5, 0, 1.15, 1.25, 1.1, leaf, crown);
    sphere(-.58, .18, .05, .78, .85, .8, leafLight, crown);
    sphere(.58, .18, .12, .73, .8, .78, leaf, crown);
    sphere(-.12, 1.05, -.02, .77, .7, .73, leafLight, crown);
    sphere(.72, .4, -.62, .16, .18, .16, coral, crown);
    sphere(-.4, .72, -.9, .15, .18, .15, coral, crown);
  }

  // Flower beds are instanced to keep the portrait phone renderer affordable.
  const flowers: {x:number;y:number;z:number;s:number}[] = [];
  for (const p of PLATFORMS) {
    const c = p.center, s = p.size, top = c.y + s.y / 2;
    const thickness = Math.max(s.y, 1.1);
    box(c.x, top - thickness / 2 - .12, c.z, s.x, thickness, s.z, earth, scene, .17);
    box(c.x, top - thickness + .15, c.z, s.x + .02, .3, s.z + .02, earthBand, scene, .1);
    box(c.x, top - .15, c.z, s.x + .16, .3, s.z + .16, grassEdge, scene, .11);
    box(c.x, top - .025, c.z, s.x + .12, .16, s.z + .12, grass, scene, .07);
    // Raised platforms are edged in a sunlit band, making their height easy to read.
    if (s.z < 5.1) box(c.x, top - .43, c.z - s.z / 2 - .012, s.x - .35, .15, .025, path);
    if (s.x >= 9 && s.z >= 8) {
      const tiles = Math.floor(s.z / 1.7);
      for (let j = 0; j < tiles; j++) {
        const stone = box(c.x + Math.sin(j * 1.4) * .25, top + .07, c.z - s.z / 2 + 1 + j * 1.7, 1.6, .045, 1.28, path, scene, .02);
        stone.rotation.y = .07 * Math.sin(j * 3);
      }
      tree(c.x - s.x / 2 + 1.05, top, c.z + s.z * .12, 1.0);
      tree(c.x + s.x / 2 - 1.05, top, c.z - s.z * .25, .78);
      for (let side of [-1, 1]) for (let i = 0; i < 7; i++) {
        flowers.push({ x:c.x + side * (s.x / 2 - .55 - .27 * (i % 3)), y:top + .17, z:c.z - s.z / 2 + .7 + i * (s.z - 1.4) / 7, s:.12 + .04 * (i % 2) });
      }
      // Rounded embedded stones add scale and readable earth strata without textures.
      for (let j = 0; j < 5; j++) sphere(c.x - s.x / 2 + 1 + j * (s.x - 2) / 4, top - .67, c.z - s.z / 2 - .02, .23, .15, .055, path);
    }
  }
  const flowerDots = new THREE.InstancedMesh(sphereGeometry, pink, flowers.length * 4);
  const flowerCenters = new THREE.InstancedMesh(sphereGeometry, gold, flowers.length);
  flowers.forEach((f, i) => {
    for (let j = 0; j < 4; j++) {
      object.position.set(f.x + Math.cos(j * Math.PI / 2) * f.s, f.y, f.z + Math.sin(j * Math.PI / 2) * f.s);
      object.scale.set(f.s, f.s * .52, f.s); object.updateMatrix(); flowerDots.setMatrixAt(i * 4 + j, object.matrix);
    }
    object.position.set(f.x, f.y + .045, f.z); object.scale.setScalar(f.s * .65); object.updateMatrix(); flowerCenters.setMatrixAt(i, object.matrix);
  });
  scene.add(flowerDots, flowerCenters);

  // Side scenery never occupies the playable route. Soft shapes replace the old angular void.
  const backgroundGrass = mat('#51c489'), distantGrass = mat('#4cb6b0');
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1, x = side * (20 + (i * 7) % 18), z = i * 6 - 8;
    const h = 4 + (i % 4) * 2.3, y = -8 + i % 3;
    sphere(x, y, z, 7 + i % 3, h, 6, i % 3 ? backgroundGrass : distantGrass);
    sphere(x, y + h * .58, z, 5 + i % 3, h * .53, 4.5, grass);
    if (i % 4 === 0) tree(x, y + h, z, 1.2);
  }
  const clouds: {root:THREE.Group; x:number; z:number; phase:number}[] = [];
  for (let i = 0; i < 16; i++) {
    const root = new THREE.Group();
    const x = ((i * 23) % 85) - 42, z = i * 9 - 12;
    root.position.set(x, 10 + (i % 5) * 2.3, z); scene.add(root);
    const size = 1.5 + (i % 3) * .5;
    sphere(-size, 0, 0, size * 1.4, size * .65, size * .7, cloudMaterial, root).castShadow = false;
    sphere(0, size * .22, 0, size * 1.1, size * .9, size * .8, cloudMaterial, root).castShadow = false;
    sphere(size, -.08, 0, size, size * .6, size * .65, cloudMaterial, root).castShadow = false;
    clouds.push({root, x, z, phase:i * 1.3});
  }
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
  const scarf = box(0, .96, -.42, .23, .09, .67, coral, avatar, .035); scarf.rotation.x = -.2;
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
  const shadow = mesh(new THREE.CircleGeometry(.48, 32), new THREE.MeshBasicMaterial({color:'#243e3c', transparent:true, opacity:.18, depthWrite:false}), 0, .12, 0);
  shadow.rotation.x = -Math.PI / 2; shadow.castShadow = false; shadow.receiveShadow = false;

  const pickups = COLLECTIBLES.map((c) => {
    const root = new THREE.Group(); root.position.set(c.position.x, c.position.y, c.position.z); scene.add(root);
    const r = c.special ? .34 : .2, rimMat = c.special ? cyan : gold;
    const body = cylinder(0, 0, 0, r * .64, r * 1.25, c.special ? blue : boot, root); body.rotation.z = Math.PI / 2;
    for (const side of [-1, 1]) { const rim = cylinder(side * r * .64, 0, 0, r, r * .2, rimMat, root); rim.rotation.z = Math.PI / 2; }
    const stitch = hoop(0, 0, 0, r * .67, cream, root); stitch.rotation.y = Math.PI / 2;
    if (c.special) { const orbit = hoop(0, 0, 0, .57, glow, root); orbit.rotation.y = Math.PI / 2; orbit.scale.z *= .4; }
    return { c, root, collected:false, pop:0 };
  });
  const anchorGroups: THREE.Group[] = [];
  for (const pair of PAIRS) for (const point of [pair.a, pair.b]) {
    const root = new THREE.Group(); root.position.set(point.x, point.y, point.z); scene.add(root);
    cylinder(0, .06, 0, .48, .16, cream, root);
    const hoopMesh = hoop(0, .54, 0, .34, gold, root); hoopMesh.rotation.y = Math.PI / 2;
    sphere(0, .54, 0, .1, .1, .1, glow, root); anchorGroups.push(root);
  }
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
    const blade = box(side * .2, .35, -.85, .11, .1, .67, cream, enemy, .045); blade.rotation.y = side * .4; blades.push(blade);
    hoop(side * .28, .35, -.53, .16, gold, enemy).rotation.x = Math.PI / 2;
  }
  const cage = new THREE.Group(); cage.position.set(LANDMARKS.enemy.x + 3.1, LANDMARKS.enemy.y, LANDMARKS.enemy.z - 1.8); scene.add(cage);
  cylinder(0, .13, 0, .85, .25, earthBand, cage);
  const cageTop = hoop(0, 1.3, 0, .76, coral, cage); cageTop.rotation.x = Math.PI / 2;
  for(let i=0;i<6;i++){const a=i*Math.PI/3; cylinder(Math.cos(a)*.72,.75,Math.sin(a)*.72,.045,1.25,gold,cage);}

  function gate(point: Vec3, width:number, height:number, color:THREE.Material) {
    const root = new THREE.Group(); root.position.set(point.x,point.y,point.z); scene.add(root);
    for (const side of [-1,1]) {
      cylinder(side*(width/2-.13), height/2, 0, .2, height+.3, earthBand, root);
      sphere(side*(width/2-.13),height+.25,0,.3,.3,.3,cream,root);
    }
    for (let i=0;i<=Math.ceil(width/.75);i++) box(-width/2+i*width/Math.ceil(width/.75),height/2,0,.12,height,.12,color,root,.04);
    box(0,height-.23,0,width,.16,.18,cream,root,.05);
    box(0,.35,0,width,.16,.18,color,root,.05);
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
    petal.rotation.z=-a; petals.push(petal);
  }
  sphere(0,0,-.23,1.22,1.22,.6,gold,flower);
  for(const side of [-1,1]) {
    sphere(side*.4,.12,-.76,.25,.3,.08,white,flower);
    sphere(side*.4,.12,-.84,.12,.18,.04,dark,flower);
    sphere(side*.73,-.31,-.72,.22,.1,.05,coral,flower);
  }
  const guardianSmile = hoop(0,-.43,-.81,.24,dark,flower); guardianSmile.scale.y*=.5;
  const fountain = new THREE.Group(); fountain.position.set(LANDMARKS.goal.x,LANDMARKS.goal.y,LANDMARKS.goal.z); scene.add(fountain);
  cylinder(0,.17,0,1.25,.34,cream,fountain); cylinder(0,.36,0,.98,.16,blue,fountain);
  const water = cylinder(0,1.6,0,.11,2.4,waterMaterial,fountain); water.visible=false;
  const goalSpool = new THREE.Group(); goalSpool.position.y=1.7; fountain.add(goalSpool);
  cylinder(0,0,0,.38,.8,gold,goalSpool);
  cylinder(0,-.43,0,.57,.13,coral,goalSpool); cylinder(0,.43,0,.57,.13,coral,goalSpool);
  hoop(0,0,0,.85,glow,goalSpool).rotation.x=Math.PI/2;

  const ribbon = new THREE.Group(); scene.add(ribbon);
  let ribbonKey = '';
  function refreshRibbon(s:GameState) {
    const key=`${s.pair}/${s.taut}`; if(key===ribbonKey)return; ribbonKey=key;
    while(ribbon.children.length){const item=ribbon.children[0] as THREE.Mesh;ribbon.remove(item);item.geometry.dispose();}
    if(s.pair===null)return;
    const points=ribbonPoints(PAIRS[s.pair],s.taut),positions:number[]=[],indices:number[]=[];
    for(let i=0;i<points.length;i++){
      const p=points[i];positions.push(p.x-1.15,p.y+.035,p.z,p.x+1.15,p.y+.035,p.z);
      if(i<points.length-1){const j=i*2;indices.push(j,j+2,j+1,j+1,j+2,j+3);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    mesh(geometry,ribbonMaterial,0,0,0,ribbon);
    for(const side of [-1,1]){
      const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(p.x+side*1.09,p.y+.075,p.z)));
      mesh(new THREE.TubeGeometry(curve,24,.035,5,false),cream,0,0,0,ribbon);
    }
  }
  const trajectory=new THREE.Group();scene.add(trajectory);
  for(let i=0;i<18;i++){
    const t=i/17,a=LANDMARKS.launch,b=PAIRS[2].b;
    sphere(a.x+(b.x-a.x)*t,a.y+.8+(b.y-a.y)*t+Math.sin(t*Math.PI)*3.1,a.z+(b.z-a.z)*t,.055,.055,.055,glow,trajectory);
  }
  const confetti=new THREE.InstancedMesh(boxGeometry,new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.5}),80);confetti.visible=false;scene.add(confetti);
  for(let i=0;i<80;i++)confetti.setColorAt(i,new THREE.Color(['#ff638d','#ffe16b','#77e6ca','#ffffff'][i%4]));

  // Merge static terrain by material. Animated actors remain individual objects.
  scene.updateMatrixWorld(true);
  const staticBatches = new Map<THREE.Material, {geometry:THREE.BufferGeometry;source:THREE.Mesh}[]>();
  for (const child of [...scene.children]) {
    if (!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh || child === shadow || Array.isArray(child.material)) continue;
    const transformed = child.geometry.clone().applyMatrix4(child.matrixWorld);
    // Rounded boxes are nonindexed, while spheres are indexed. Merge only one format.
    const geometry = transformed.index ? transformed.toNonIndexed() : transformed;
    if (geometry !== transformed) transformed.dispose();
    const entries = staticBatches.get(child.material) ?? [];
    entries.push({geometry,source:child}); staticBatches.set(child.material,entries);
  }
  for (const [material, entries] of staticBatches) {
    const merged = mergeGeometries(entries.map(e => e.geometry), false);
    if (merged) { const batch = mesh(merged, material, 0, 0, 0); batch.castShadow = material !== sun.material; entries.forEach(e => scene.remove(e.source)); }
    entries.forEach(e => e.geometry.dispose());
  }

  const pulse = new THREE.Group(); scene.add(pulse); pulse.visible = false;
  sphere(0, 0, 0, .23, .23, .23, glow, pulse);
  const pulseHalo = hoop(0, 0, 0, .5, gold, pulse);
  pulseHalo.rotation.y = Math.PI / 2;
  let pulsePoints: Vec3[] = [];
  let visualClock = 0;
  let angle=Math.PI,walkClock=0,wasGrounded=true,landing=0,lastPulses=0,pulseAge=99,firstFrame=true;
  const cameraLook = new THREE.Vector3(), cameraDesired=new THREE.Vector3(),lookDesired=new THREE.Vector3();
  let portrait=false;
  function resize(){const w=container.clientWidth||innerWidth,h=container.clientHeight||innerHeight;portrait=w/h<.85;renderer.setSize(w,h);camera.aspect=w/h;camera.fov=portrait?58:49;camera.updateProjectionMatrix();}
  resize();
  function render(s:GameState,options:{dt:number;elapsed:number;started:boolean;aiming:boolean}) {
    const {dt,started,aiming}=options,p=s.position;
    // This clock keeps presentation alive after victory; a paused frame supplies dt=0.
    visualClock += dt;
    const t = visualClock;
    const speed=Math.hypot(s.velocity.x,s.velocity.z),moving=speed>.15;
    walkClock+=dt*speed*2.9;
    if(moving){const target=Math.atan2(s.velocity.x,s.velocity.z);angle+=Math.atan2(Math.sin(target-angle),Math.cos(target-angle))*Math.min(1,dt*14);}
    else if(!started)angle=Math.PI+.28;
    player.position.set(p.x,p.y,p.z);player.rotation.y=angle;
    if(!wasGrounded&&s.grounded)landing=1;
    wasGrounded=s.grounded;landing=Math.max(0,landing-dt*6);
    const step=s.grounded&&moving?Math.sin(walkClock):0;
    avatar.position.y=s.grounded?Math.abs(step)*.035:0;
    avatar.scale.set(1+landing*.13,1-landing*.17,1+landing*.13);
    avatar.rotation.x=s.grounded?(moving?.08:0):-.08;
    limbs[0].rotation.x=s.grounded?step*.62:-.35;limbs[2].rotation.x=s.grounded?-step*.62:.45;
    limbs[1].rotation.x=s.grounded?-step*.55:-.65;limbs[3].rotation.x=s.grounded?step*.55:-.65;
    limbs[1].rotation.z=s.grounded?.09:.45;limbs[3].rotation.z=s.grounded?-.09:-.45;
    scarf.rotation.x=-.2-Math.sin(t*9)*.11-(moving?.22:0);
    eyes.scale.y=Math.sin(t*.8)> .996?.15:1;
    let floor=-8;
    for(const platform of PLATFORMS){const c=platform.center,z=platform.size;if(Math.abs(p.x-c.x)<=z.x/2&&Math.abs(p.z-c.z)<=z.z/2)floor=Math.max(floor,c.y+z.y/2);}
    shadow.visible=floor>-7;shadow.position.set(p.x,floor+.1,p.z);shadow.scale.setScalar(Math.max(.5,1-(p.y-floor)*.09));
    pickups.forEach((item,i)=>{
      const collected=s.collected.includes(item.c.id);
      if(collected&&!item.collected)item.pop=.38;
      if(!collected)item.pop=0;
      item.collected=collected;item.pop=Math.max(0,item.pop-dt);
      item.root.visible=!collected||item.pop>0;
      item.root.position.y=item.c.position.y+Math.sin(t*3+i*.7)*.1+(collected?(1-item.pop/.38)*1.15:0);
      item.root.rotation.y=t*2+i*.7;item.root.rotation.z=Math.sin(t*2+i)*.12;
      item.root.scale.setScalar(collected?item.pop/.38:1);
    });
    treeCrowns.forEach((c,i)=>{c.rotation.z=Math.sin(t*.9+i)*.018;});
    clouds.forEach(c=>{c.root.position.x=c.x+Math.sin(t*.07+c.phase)*2.3;});
    anchorGroups.forEach((a,i)=>{a.children[1].rotation.y=Math.PI/2+Math.sin(t*2+i)*.18;});
    enemy.position.set(s.enemy==='captured'?cage.position.x:LANDMARKS.enemy.x+(s.enemy==='warning'?Math.sin(t*26)*.08:Math.sin(t*1.2)*.18),LANDMARKS.enemy.y+(s.enemy==='captured'?.23:Math.sin(t*5)*.025),s.enemy==='captured'?cage.position.z:LANDMARKS.enemy.z);
    enemy.scale.setScalar(s.enemy==='captured'?.65:1);
    blades.forEach((b,i)=>{b.rotation.y=(i?1:-1)*(s.enemy==='warning'?.65+Math.sin(t*16)*.25:.27);});
    enemyGate.visible=s.enemy!=='captured';bossGate.visible=!s.canalOpen;
    flower.rotation.z=Math.sin(t*1.7)*.06;
    petals.forEach((petal,i)=>{petal.scale.z=s.bossReady?.72+.1*Math.sin(t*6+i):.5;});
    guardian.scale.y=1+Math.sin(t*1.7)*.025;
    goalSpool.rotation.y=t*1.8;goalSpool.position.y=1.7+Math.sin(t*2.3)*.15;water.visible=s.canalOpen;
    launchRing.rotation.z=t*.7;launchRing.material=s.bossReady?glow:gold;
    trajectory.visible=s.pair===2&&s.taut&&(aiming||s.bossReady);
    refreshRibbon(s);
    if (s.pulses !== lastPulses) {
      if (s.pulses > lastPulses && s.pair !== null) {
        pulseAge = 0; pulsePoints = ribbonPoints(PAIRS[s.pair], false);
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
    light.position.set(p.x-12,followY+23,p.z-8);light.target.position.set(p.x,followY,p.z+8);
    renderer.render(scene,camera);
  }
  return {render,resize,renderer};
}
