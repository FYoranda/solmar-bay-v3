// police.js — the SBPD wanted system. Police are a NAMED tactical system:
// callsigns (TARPON, KITE, CORAL, HALCON, LIMA, CONDOR), live roles
// (PURSUIT, RAMMING, FLANKING, ROADBLOCK, PIT MANEUVER, SPOTLIGHT) and a
// live distance in metres per unit, shown in the dispatch panel. An Air One
// helicopter with a visible spotlight cone joins at 3+ stars.
import * as THREE from 'three';
import { Car, VEHICLE_TYPES } from './vehicles.js';

const CALLSIGNS = ['TARPON', 'KITE', 'CORAL', 'HALCON', 'LIMA', 'CONDOR', 'REEF', 'ORCA'];
const ROLES = ['PURSUIT', 'RAMMING', 'FLANKING', 'ROADBLOCK', 'PIT MANEUVER'];

function buildPoliceMesh() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, metalness: 0.3 });
  const black = new THREE.MeshStandardMaterial({ color: 0x14141c, roughness: 0.5, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), white);
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.3, 1.4), black);
  hood.position.set(0, 0.62, 1.4); g.add(hood);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x182233, roughness: 0.15, metalness: 0.7 }));
  cabin.position.set(0, 1.1, -0.2); g.add(cabin);
  // light bar (flashes red/blue)
  const barL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  barL.position.set(-0.45, 1.45, -0.2); g.add(barL);
  const barR = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.5),
    new THREE.MeshBasicMaterial({ color: 0x2244ff }));
  barR.position.set(0.45, 1.45, -0.2); g.add(barR);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const dark = new THREE.MeshStandardMaterial({ color: 0x16161e, roughness: 0.9 });
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(wx, 0.36, wz); g.add(w);
  }
  return { group: g, barL, barR };
}

class PoliceCar extends Car {
  constructor(scene, callsign, role, x, z, heading) {
    super(scene, VEHICLE_TYPES[1], x, z, heading);
    // swap the civilian body for the police livery
    scene.remove(this.group);
    const { group, barL, barR } = buildPoliceMesh();
    this.group = group; this.barL = barL; this.barR = barR;
    scene.add(group);
    this.group.position.copy(this.pos);
    this.callsign = callsign; this.role = role;
    this.type = { name: 'SBPD Interceptor', color: 0xffffff, top: 44, accel: 24 };
    this.flash = 0;
  }
  update(dt, input, colliders, allowNitro) {
    const r = super.update(dt, input, colliders, allowNitro);
    this.flash += dt * 9;
    const on = Math.sin(this.flash) > 0;
    this.barL.material.color.setHex(on ? 0xff2222 : 0x550000);
    this.barR.material.color.setHex(on ? 0x111166 : 0x2244ff);
    return r;
  }
}

export class PoliceSystem {
  constructor(scene, colliders) {
    this.scene = scene; this.colliders = colliders;
    this.wanted = 0;
    this.units = [];       // PoliceCar[]
    this.heli = null;      // { group, rotor, cone, light }
    this.heliOn = false;
    this.hideTimer = 0;    // seconds no unit can see the player
    this.bustedTimer = 0;
    this.spawnTimer = 0;
    this.nextCallsign = 0;
    this.sirenTimer = 0;
  }

  addWanted(n, reason) {
    const before = this.wanted;
    this.wanted = Math.max(0, Math.min(5, this.wanted + n));
    if (this.wanted > before) this.hideTimer = 0;
    return this.wanted;
  }

  reset() {
    for (const u of this.units) this.scene.remove(u.group);
    this.units = [];
    if (this.heli) { this.scene.remove(this.heli.group); this.heli = null; }
    this.heliOn = false;
    this.wanted = 0; this.hideTimer = 0; this.bustedTimer = 0;
  }

  spawnUnit(playerPos) {
    const callsign = CALLSIGNS[this.nextCallsign % CALLSIGNS.length];
    this.nextCallsign++;
    const role = ROLES[this.units.length % ROLES.length];
    const a = Math.random() * Math.PI * 2;
    const d = 70 + Math.random() * 40;
    const x = Math.max(-290, Math.min(290, playerPos.x + Math.cos(a) * d));
    const z = Math.max(-290, Math.min(290, playerPos.z + Math.sin(a) * d));
    const car = new PoliceCar(this.scene, callsign, role, x, z, 0);
    this.units.push(car);
    return car;
  }

  ensureHeli() {
    if (this.heli) return;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 6.5),
      new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.5, metalness: 0.4 }));
    body.castShadow = true; g.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 4.5),
      new THREE.MeshStandardMaterial({ color: 0x222233 }));
    tail.position.set(0, 0.3, -5); g.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x111122 }));
    rotor.position.y = 1.1; g.add(rotor);
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x111122 }));
    tailRotor.position.set(0.4, 0.4, -7); g.add(tailRotor);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
    lamp.position.set(0, -0.9, 2.5); g.add(lamp);
    // spotlight cone down to the player
    const cone = new THREE.Mesh(new THREE.ConeGeometry(7, 42, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
    cone.position.y = -21; g.add(cone);
    const spot = new THREE.SpotLight(0xfff2b0, 900, 90, 0.28, 0.5, 1.2);
    spot.position.set(0, -1, 0);
    g.add(spot); g.add(spot.target);
    this.scene.add(g);
    this.heli = { group: g, rotor, cone, spot, angle: 0 };
    this.heliOn = true;
  }

  removeHeli() {
    if (!this.heli) return;
    this.scene.remove(this.heli.group);
    this.heli = null; this.heliOn = false;
  }

  // dt, playerPos, playerSpeed, inCar, audio. Returns { busted }.
  update(dt, playerPos, playerSpeed, inCar, audio) {
    const want = this.wanted;
    // keep the right number of units
    this.spawnTimer -= dt;
    if (this.units.length < want && this.spawnTimer <= 0) {
      this.spawnTimer = 2.5;
      this.spawnUnit(playerPos);
    }
    while (this.units.length > want) {
      const u = this.units.pop();
      this.scene.remove(u.group);
    }
    // helicopter at 3+ stars
    if (want >= 3) this.ensureHeli();
    else if (want < 3) this.removeHeli();

    // siren blips
    this.sirenTimer -= dt;
    if (want > 0 && this.sirenTimer <= 0) {
      this.sirenTimer = 1.6 + Math.random();
      if (audio) audio.sirenBlip();
    }

    let anyNear = false;
    for (const u of this.units) {
      // steer toward the player; role flavours the approach
      const dx = playerPos.x - u.pos.x, dz = playerPos.z - u.pos.z;
      const dist = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      let d = wantHeading - u.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      let steer = Math.max(-1, Math.min(1, d * 1.6));
      // FLANKING: aim at a point offset to the player's side
      if (u.role === 'FLANKING') steer = Math.max(-1, Math.min(1, (d + 0.5) * 1.2));
      // ROADBLOCK: stop ahead of the player instead of chasing
      if (u.role === 'ROADBLOCK' && dist < 26) {
        u.update(dt, { fwd: 0, strafe: 0, nitro: false }, this.colliders, false);
        u.dist = dist; anyNear = anyNear || dist < 14;
        continue;
      }
      const input = { fwd: dist > 7 ? 1 : 0.4, strafe: steer, nitro: false };
      u.update(dt, input, this.colliders, false);
      u.dist = dist;
      if (dist < 14) anyNear = true;
      // ramming the player's car is handled by collision in main (proximity)
    }

    // helicopter follows above the player, spotlight on them
    if (this.heli) {
      const h = this.heli;
      h.angle += dt * 0.35;
      const tx = playerPos.x + Math.cos(h.angle) * 14;
      const tz = playerPos.z + Math.sin(h.angle) * 14;
      h.group.position.x += (tx - h.group.position.x) * Math.min(1, dt * 1.4);
      h.group.position.z += (tz - h.group.position.z) * Math.min(1, dt * 1.4);
      h.group.position.y = 42 + Math.sin(h.angle * 2) * 1.5;
      h.group.rotation.y = Math.atan2(playerPos.x - h.group.position.x, playerPos.z - h.group.position.z);
      h.rotor.rotation.y += dt * 22;
      h.spot.target.position.set(playerPos.x - h.group.position.x, -h.group.position.y, playerPos.z - h.group.position.z);
      h.cone.lookAt(playerPos.x, 0, playerPos.z);
      // keep the cone pointing down at the player
      h.cone.rotation.x = Math.PI;
    }

    // wanted decay: hidden from all units for 12 s drops a star
    if (want > 0) {
      if (!anyNear && (!this.heliOn || want < 3)) {
        this.hideTimer += dt;
        if (this.hideTimer > 12) {
          this.wanted = Math.max(0, this.wanted - 1);
          this.hideTimer = 0;
        }
      } else this.hideTimer = 0;
    }

    // busted: slow + surrounded
    let busted = false;
    if (want > 0 && playerSpeed < 1.6) {
      const near = this.units.filter((u) => (u.dist ?? 99) < (inCar ? 8 : 3.2)).length;
      if ((inCar && near >= 2) || (!inCar && near >= 1)) {
        this.bustedTimer += dt;
        if (this.bustedTimer > 2.5) busted = true;
      } else this.bustedTimer = Math.max(0, this.bustedTimer - dt * 2);
    } else this.bustedTimer = Math.max(0, this.bustedTimer - dt * 2);
    return { busted };
  }

  // rows for the dispatch panel
  dispatchRows() {
    return this.units.map((u) => ({
      callsign: u.callsign, role: u.role,
      dist: Math.round(u.dist ?? 0),
      chip: u.role === 'ROADBLOCK' ? 'road' : (this.heliOn ? 'spot' : ''),
      chipText: u.role === 'ROADBLOCK' ? 'BLOCK' : (this.heliOn ? 'AIR' : 'UNIT'),
    }));
  }
}
