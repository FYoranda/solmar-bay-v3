// weapons.js — 5 weapon slots (fists, bat, pistol, SMG, RPG), shooting,
// ammo, and the gun shop. Numbered slots with LOCKED states for unowned
// weapons; the active slot is highlighted in the HUD.
import * as THREE from 'three';

export const WEAPONS = [
  { name: 'FISTS',  price: 0,    ammo: Infinity, damage: 12, rate: 0.45, range: 3,   auto: false },
  { name: 'BAT',    price: 150,  ammo: Infinity, damage: 25, rate: 0.5,  range: 3.5, auto: false },
  { name: 'PISTOL', price: 600,  ammo: 60,       damage: 22, rate: 0.28, range: 55,  auto: false },
  { name: 'SMG',    price: 1500, ammo: 120,      damage: 14, rate: 0.09, range: 48,  auto: true },
  { name: 'RPG',    price: 3500, ammo: 6,        damage: 120, rate: 1.1, range: 80,  auto: false },
];

export class WeaponSystem {
  constructor(scene) {
    this.scene = scene;
    this.owned = [true, false, false, false, false];
    this.ammo = WEAPONS.map((w) => w.ammo);
    this.slot = 0;               // 0-based active slot
    this.cooldown = 0;
    this.muzzle = null;
    this.tracer = null;
    this.tracerLife = 0;
    // gun shop marker (The Strip)
    this.shop = { x: -60, z: -120, r: 8 };
    const shopGeo = new THREE.CylinderGeometry(3.5, 3.5, 24, 18, 1, true);
    const shopMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    this.shopBeacon = new THREE.Mesh(shopGeo, shopMat);
    this.shopBeacon.position.set(this.shop.x, 12, this.shop.z);
    scene.add(this.shopBeacon);
    // a small shop kiosk
    const kiosk = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 5),
      new THREE.MeshStandardMaterial({ color: 0x2a4a6e, roughness: 0.8 }));
    kiosk.position.set(this.shop.x, 2, this.shop.z - 4);
    kiosk.castShadow = true;
    scene.add(kiosk);
  }

  get weapon() { return WEAPONS[this.slot]; }
  get hasWeapon() { return this.owned[2] || this.owned[3] || this.owned[4]; }

  select(slot) {
    const i = slot - 1;
    if (i < 0 || i >= WEAPONS.length) return false;
    if (!this.owned[i]) return false;
    this.slot = i;
    return true;
  }

  // buy the cheapest unowned weapon the player can afford; returns name or null
  buyNext(money) {
    for (let i = 1; i < WEAPONS.length; i++) {
      if (!this.owned[i] && money >= WEAPONS[i].price) {
        this.owned[i] = true;
        this.ammo[i] = WEAPONS[i].ammo;
        return { index: i, name: WEAPONS[i].name, price: WEAPONS[i].price };
      }
    }
    return null;
  }

  // fire from origin along dir. targets: [{pos, radius, onHit(dmg)}].
  // Returns { fired, hit }.
  fire(dt, origin, dir, targets, audio) {
    this.cooldown -= dt;
    const w = this.weapon;
    if (this.cooldown > 0) return { fired: false };
    if (w.ammo !== Infinity && this.ammo[this.slot] <= 0) return { fired: false, empty: true };
    this.cooldown = w.rate;
    if (w.ammo !== Infinity) this.ammo[this.slot]--;
    if (audio) audio.shoot();
    // melee: short-range arc
    if (w.range <= 4) {
      let hit = false;
      for (const t of targets) {
        if (t.pos.distanceTo(origin) < w.range + t.radius) {
          t.onHit(w.damage); hit = true;
        }
      }
      return { fired: true, hit };
    }
    // hitscan: nearest target within a narrow cone along dir
    let best = null, bestD = w.range;
    for (const t of targets) {
      const to = t.pos.clone().sub(origin);
      const d = to.length();
      if (d > w.range) continue;
      to.normalize();
      if (to.dot(dir) < 0.94) continue;
      if (d < bestD) { bestD = d; best = t; }
    }
    const end = origin.clone().add(dir.clone().multiplyScalar(best ? bestD : w.range));
    this.showTracer(origin, end);
    if (best) {
      best.onHit(w.damage);
      if (audio) audio.hit();
      return { fired: true, hit: true };
    }
    return { fired: true, hit: false };
  }

  showTracer(a, b) {
    if (this.tracer) this.scene.remove(this.tracer);
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    this.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    this.scene.add(this.tracer);
    this.tracerLife = 0.07;
  }

  update(dt) {
    if (this.tracer) {
      this.tracerLife -= dt;
      if (this.tracerLife <= 0) { this.scene.remove(this.tracer); this.tracer = null; }
    }
    this.shopBeacon.rotation.y += dt;
  }
}
