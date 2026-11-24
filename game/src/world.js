// world.js — Solmar Bay: a sun-soaked coastal city at golden hour.
// Builds the ground, sea, sky, roads, buildings, palms, pier, ferris
// wheel and lighthouse, and returns the colliders + district lookups the
// player, cars and police use. All textures are procedural canvas art.
import * as THREE from 'three';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildingTexture(base, lit) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let y = 12; y < h - 12; y += 22) {
      for (let x = 10; x < w - 10; x += 20) {
        g.fillStyle = Math.random() < 0.55 ? lit : 'rgba(20,24,44,0.9)';
        g.fillRect(x, y, 12, 14);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - 10, w, 10);
  });
}

function roadTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#23232e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f5c542';
    g.fillRect(w / 2 - 2, 0, 4, 30); g.fillRect(w / 2 - 2, 64, 4, 30);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(4, 0, 3, h); g.fillRect(w - 7, 0, 3, h);
  });
}

function neonTexture(text, color) {
  return canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = 'rgba(10,10,26,0.92)'; g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = color; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 14;
    g.fillText(text, w / 2, h / 2 + 1);
  });
}

export const DISTRICTS = [
  { name: 'MARINA',     minX: -300, maxX: -140, minZ: -70,  maxZ: 70 },
  { name: 'OLD TOWN',   minX: -140, maxX: -10,  minZ: -300, maxZ: -120 },
  { name: 'THE STRIP',  minX: -140, maxX: 70,   minZ: -120, maxZ: 70 },
  { name: 'HILLS',      minX: -10,  maxX: 300,  minZ: -300, maxZ: -60 },
  { name: 'DOCKSIDE',   minX: 70,   maxX: 300,  minZ: 70,   maxZ: 300 },
  { name: 'BEACHFRONT', minX: -300, maxX: 70,   minZ: 70,   maxZ: 300 },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ) return d.name;
  }
  return 'SOLMAR BAY';
}

export function buildWorld(scene) {
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const updaters = [];
  const group = new THREE.Group(); scene.add(group);

  // ---- sky + light (golden-hour dusk) ----
  scene.background = new THREE.Color(0x2a1a4e);
  scene.fog = new THREE.Fog(0x3a2358, 120, 520);
  const hemi = new THREE.HemisphereLight(0xffb37a, 0x2a1a3e, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xff9a3c, 2.1);
  sun.position.set(-160, 90, -120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 700;
  scene.add(sun);
  // sun disc + glow sprite
  const sunTex = canvasTexture(128, 128, (g, w, h) => {
    const r = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    r.addColorStop(0, 'rgba(255,220,150,1)'); r.addColorStop(0.35, 'rgba(255,150,60,0.9)');
    r.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  });
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, transparent: true, depthWrite: false }));
  sunSprite.position.set(-420, 110, -260); sunSprite.scale.set(260, 260, 1);
  scene.add(sunSprite);

  // ---- ground: city slab + beach + sea ----
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a3a48, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(620, 620), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, 0); ground.receiveShadow = true;
  group.add(ground);
  // beach sand strip (west)
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(70, 620),
    new THREE.MeshStandardMaterial({ color: 0xd9b380, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(-185, 0.05, 0); sand.receiveShadow = true;
  group.add(sand);
  // sea
  const seaMat = new THREE.MeshStandardMaterial({ color: 0x1a5a8a, roughness: 0.25, metalness: 0.35 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(320, 620), seaMat);
  sea.rotation.x = -Math.PI / 2; sea.position.set(-380, 0.02, 0);
  group.add(sea);
  updaters.push((t) => { sea.position.y = 0.02 + Math.sin(t * 0.7) * 0.12; });

  // ---- roads (grid) ----
  const roadTex = roadTexture();
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9 });
  const roadXs = [-120, -60, 0, 60, 120, 180, 240];
  const roadZs = [-240, -180, -120, -60, 0, 60, 120, 180, 240];
  for (const x of roadXs) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(10, 620), roadMat.clone());
    r.material.map = roadTex.clone(); r.material.map.repeat.set(1, 10); r.material.map.needsUpdate = true;
    r.rotation.x = -Math.PI / 2; r.position.set(x, 0.06, 0); r.receiveShadow = true;
    group.add(r);
  }
  for (const z of roadZs) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(620, 10), roadMat.clone());
    r.material.map = roadTex.clone(); r.material.map.repeat.set(10, 1); r.material.map.needsUpdate = true;
    r.rotation.x = -Math.PI / 2; r.position.set(0, 0.06, z); r.receiveShadow = true;
    group.add(r);
  }

  // ---- buildings (blocks between roads) ----
  const facadeMats = [
    new THREE.MeshStandardMaterial({ map: buildingTexture('#5a4a6e', '#ffd76a'), roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ map: buildingTexture('#6e4a3a', '#ff9d6a'), roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ map: buildingTexture('#3a5a6e', '#9fd8ff'), roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ map: buildingTexture('#4a3a5a', '#ff7ad9'), roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ map: buildingTexture('#7a6a4a', '#fff2b0'), roughness: 0.85 }),
  ];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const blockXs = [-150, -90, -30, 30, 90, 150, 210, 270];
  const blockZs = [-270, -210, -150, -90, -30, 30, 90, 150, 210, 270];
  let bi = 0;
  for (const bx of blockXs) {
    for (const bz of blockZs) {
      if (bx < -90) continue; // beach / pier / marina zone stays open
      // skip the strip plaza block (mission start)
      if (bx === -30 && bz === 30) continue;
      const w = 26 + ((bi * 7) % 14);
      const d = 26 + ((bi * 11) % 14);
      const h = 14 + ((bi * 37) % 46) + (bz < -60 ? 18 : 0); // taller in the Hills
      const m = new THREE.Mesh(boxGeo, facadeMats[bi % facadeMats.length]);
      m.position.set(bx, 0, bz); m.scale.set(w, h, d);
      m.castShadow = true; m.receiveShadow = true;
      group.add(m);
      colliders.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });
      // rooftop AC box
      if (bi % 3 === 0) {
        const ac = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x2a2a33, roughness: 1 }));
        ac.position.set(bx + w * 0.2, h, bz); ac.scale.set(4, 2, 4);
        group.add(ac);
      }
      bi++;
    }
  }
  // neon signs on The Strip
  const neons = [
    { text: 'CASINO AZUL', color: '#00e5ff', x: -60, z: -60, y: 26 },
    { text: 'MANGO & RYE', color: '#ff7ad9', x: 0, z: -60, y: 20 },
    { text: 'PIER 9', color: '#ffd76a', x: -120, z: 0, y: 18 },
    { text: 'HOTEL SOL', color: '#7dff9b', x: 60, z: 60, y: 22 },
  ];
  for (const n of neons) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.5),
      new THREE.MeshBasicMaterial({ map: neonTexture(n.text, n.color) }));
    s.position.set(n.x, n.y, n.z);
    group.add(s);
  }

  // ---- palm trees (beachfront + marina) ----
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f8f4e, roughness: 1, side: THREE.DoubleSide });
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 7, 6);
  const leafGeo = new THREE.PlaneGeometry(5, 1.6);
  function palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3.5; trunk.castShadow = true; g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.y = 7.2;
      leaf.rotation.y = (i / 6) * Math.PI * 2;
      leaf.rotation.z = 0.5;
      leaf.translateX(2.2);
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    group.add(g);
    colliders.push({ minX: x - 0.7, maxX: x + 0.7, minZ: z - 0.7, maxZ: z + 0.7 });
  }
  for (let z = -260; z <= 280; z += 34) { palm(-168, z); palm(-152, z + 17); }
  for (let x = -120; x <= 40; x += 40) palm(x, 148);

  // ---- pier (west, into the sea) + ferris wheel + lighthouse ----
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(110, 1.2, 16), woodMat);
  pier.position.set(-265, 0.8, 0); pier.castShadow = true; pier.receiveShadow = true;
  group.add(pier);
  colliders.push({ minX: -320, maxX: -210, minZ: -8, maxZ: -6.5 });
  colliders.push({ minX: -320, maxX: -210, minZ: 6.5, maxZ: 8 });
  // pier posts
  for (let x = -310; x <= -220; x += 15) {
    for (const z of [-7, 7]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3, 6), woodMat);
      post.position.set(x, -0.6, z); group.add(post);
    }
  }
  // ferris wheel at the pier end
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(16, 0.8, 8, 32),
    new THREE.MeshStandardMaterial({ color: 0xff5a7a, emissive: 0x881133, roughness: 0.4 }));
  wheel.add(rim);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 32, 6),
      new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4 }));
    spoke.rotation.z = a; wheel.add(spoke);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 2.4),
      new THREE.MeshStandardMaterial({ color: [0xffd76a, 0x00e5ff, 0xff7ad9, 0x7dff9b][i % 4], roughness: 0.5 }));
    cab.position.set(Math.cos(a) * 16, Math.sin(a) * 16, 0); wheel.add(cab);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x888888 }));
  axle.rotation.x = Math.PI / 2; wheel.add(axle);
  wheel.position.set(-300, 22, -14);
  group.add(wheel);
  updaters.push((t) => { wheel.rotation.z = t * 0.12; });
  // wheel supports
  for (const dz of [-3, 3]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 24, 6),
      new THREE.MeshStandardMaterial({ color: 0x666677 }));
    leg.position.set(-300, 11, -14 + dz); leg.rotation.x = dz > 0 ? 0.35 : -0.35;
    group.add(leg);
  }
  // lighthouse
  const lh = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(3, 4.5, 26, 12),
    new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.8 }));
  tower.position.y = 13; tower.castShadow = true; lh.add(tower);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 5, 12),
    new THREE.MeshStandardMaterial({ color: 0xd43d2a, roughness: 0.8 }));
  stripe.position.y = 13; lh.add(stripe);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
  lamp.position.y = 27; lh.add(lamp);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(6, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
  beam.rotation.z = Math.PI / 2; beam.position.set(30, 27, 0); lh.add(beam);
  lh.position.set(-300, 0.8, 18);
  group.add(lh);
  updaters.push((t) => { lh.rotation.y = t * 0.25; });
  colliders.push({ minX: -305, maxX: -295, minZ: 13, maxZ: 23 });

  // ---- streetlights along roads ----
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x333340, roughness: 0.6, metalness: 0.5 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const poleGeo = new THREE.CylinderGeometry(0.18, 0.25, 7, 6);
  for (const x of roadXs) {
    for (const z of [-210, -90, 30, 150]) {
      const p = new THREE.Mesh(poleGeo, poleMat);
      p.position.set(x + 5.5, 3.5, z); group.add(p);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), bulbMat);
      b.position.set(x + 5.5, 7.1, z); group.add(b);
    }
  }

  // ---- world bounds (invisible walls) ----
  colliders.push({ minX: -318, maxX: -316, minZ: -310, maxZ: 310 });
  colliders.push({ minX: 298, maxX: 300, minZ: -310, maxZ: 310 });
  colliders.push({ minX: -320, maxX: 300, minZ: -308, maxZ: -306 });
  colliders.push({ minX: -320, maxX: 300, minZ: 306, maxZ: 308 });

  return {
    colliders, group, sun,
    // spawn points
    playerSpawn: { x: -140, z: 30 },
    heroCarSpawn: { x: -150, z: 8 },
    update(dt, t) { for (const u of updaters) u(t); },
  };
}

// Axis-separated sliding move: try full move, then x-only, then z-only.
// Returns the new position; grazes keep tangential speed, head-on stops.
export function slideMove(pos, dx, dz, radius, colliders) {
  const hits = (x, z) => {
    for (const c of colliders) {
      if (x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ) return c;
    }
    return null;
  };
  let nx = pos.x + dx, nz = pos.z + dz;
  if (!hits(nx, nz)) return { x: nx, z: nz, hit: null };
  if (!hits(nx, pos.z)) return { x: nx, z: pos.z, hit: hits(nx, pos.z) };
  if (!hits(pos.x, nz)) return { x: pos.x, z: nz, hit: hits(pos.x, nz) };
  return { x: pos.x, z: pos.z, hit: hits(pos.x, pos.z) || hits(nx, nz) };
}
