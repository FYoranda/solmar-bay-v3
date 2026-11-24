// vehicles.js — arcade car physics, traffic, and stealing.
// Progressive steering (ramps toward a speed-sensitive target, never a
// binary snap) + lateral grip (the car carries lateral velocity that the
// road grips: strong normally, loose while drifting). Sliding collision
// via slideMove so grazes keep speed and only near head-on hits cost
// condition. The hero car is the Calyx Sprint GT.
import * as THREE from 'three';
import { slideMove } from './world.js';

export const VEHICLE_TYPES = [
  { name: 'Calyx Sprint GT', color: 0xff5a2a, top: 46, accel: 26, hero: true },
  { name: 'Vireo GT',        color: 0x2a7fff, top: 42, accel: 23 },
  { name: 'Corza Brisa',     color: 0xffd76a, top: 40, accel: 21 },
  { name: 'Mango Coupe',     color: 0x7dff9b, top: 38, accel: 20 },
  { name: 'Dock Hauler',     color: 0x9a9aa8, top: 30, accel: 15 },
  { name: 'Sol Taxi',        color: 0xffe14d, top: 36, accel: 19 },
];

function buildCarMesh(type) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: type.color, roughness: 0.35, metalness: 0.55 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x182233, roughness: 0.15, metalness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x16161e, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glass);
  cabin.position.set(0, 1.1, -0.2); cabin.castShadow = true; g.add(cabin);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.4, 0.7), paint);
  nose.position.set(0, 0.5, 2.35); g.add(nose);
  // headlights / taillights
  for (const sx of [-0.65, 0.65]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
    hl.position.set(sx, 0.62, 2.72); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    tl.position.set(sx, 0.62, -2.24); g.add(tl);
  }
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(wx, 0.36, wz); w.castShadow = true;
    g.add(w); wheels.push(w);
  }
  // hero car gets a spoiler + stripe
  if (type.hero) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.4), dark);
    spoiler.position.set(0, 1.05, -2.1); g.add(spoiler);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 4.4),
      new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 0.4 }));
    stripe.position.set(0, 0.87, 0); g.add(stripe);
  }
  return { group: g, wheels };
}

export class Car {
  constructor(scene, type, x, z, heading) {
    this.type = type;
    const { group, wheels } = buildCarMesh(type);
    this.group = group; this.wheels = wheels;
    scene.add(group);
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading || 0;
    this.speed = 0;              // signed m/s along heading
    this.steer = 0;              // current steering angle (progressive)
    this.steerTarget = 0;
    this.latVel = 0;             // lateral velocity (drift / grip)
    this.condition = 100;
    this.nitro = 100;            // 0..100 meter
    this.drifting = false;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }

  // dt, input, colliders, allowNitro. Returns { driftScore }.
  update(dt, input, colliders, allowNitro) {
    const t = this.type;
    // --- progressive steering: ramp toward a speed-sensitive target ---
    const speedFrac = Math.min(1, Math.abs(this.speed) / t.top);
    const maxSteer = 0.55 - speedFrac * 0.32;   // less lock at speed
    this.steerTarget = -input.strafe * maxSteer;
    const ramp = 1 - Math.exp(-dt * (input.strafe !== 0 ? 7 : 10));
    this.steer += (this.steerTarget - this.steer) * ramp;

    // --- throttle / brake / reverse ---
    const boosting = allowNitro && input.nitro && this.nitro > 0 && input.fwd > 0;
    if (boosting) this.nitro = Math.max(0, this.nitro - dt * 34);
    else this.nitro = Math.min(100, this.nitro + dt * 7);
    const accel = t.accel * (boosting ? 1.9 : 1);
    if (input.fwd > 0) this.speed += accel * dt;
    else if (input.fwd < 0) {
      if (this.speed > 0.5) this.speed -= 34 * dt;      // brake
      else this.speed -= 12 * dt;                        // reverse
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 9 * dt);
    }
    const top = t.top * (boosting ? 1.32 : 1);
    this.speed = Math.max(-14, Math.min(top, this.speed));

    // --- heading from steering (bicycle-ish) ---
    const turnRate = this.steer * (this.speed / 3.2) * (this.speed >= 0 ? 1 : -1);
    this.heading += turnRate * dt;

    // --- lateral grip: velocity splits into forward + lateral ---
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = fz, rz = -fx;
    const fwdV = this.speed;
    // drift when steering hard at speed
    this.drifting = Math.abs(this.steer) > 0.28 && Math.abs(this.speed) > 16;
    const grip = this.drifting ? 1.7 : 7.5;
    this.latVel *= Math.exp(-grip * dt);
    this.latVel += this.steer * this.speed * dt * (this.drifting ? 0.55 : 0.12);
    const vx = fx * fwdV + rx * this.latVel;
    const vz = fz * fwdV + rz * this.latVel;

    // --- sliding collision (axis separated) ---
    const before = { x: this.pos.x, z: this.pos.z };
    const res = slideMove(this.pos, vx * dt, vz * dt, 1.5, colliders);
    const hit = res.hit;
    this.pos.x = res.x; this.pos.z = res.z;
    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    const want = Math.hypot(vx * dt, vz * dt);
    let crash = false;
    if (hit && want > 0.01 && moved < want * 0.35) {
      // near head-on: cost speed + condition
      const loss = Math.min(0.7, Math.abs(this.speed) / t.top);
      this.speed *= (1 - loss * 0.55);
      this.condition = Math.max(0, this.condition - loss * 9);
      this.latVel *= 0.4;
      crash = loss > 0.25;
    }
    // drift score: sideways speed while drifting pays
    let driftScore = 0;
    if (this.drifting) driftScore = Math.abs(this.latVel) * dt * 2.2;

    // --- visuals ---
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    const bodyRoll = -this.steer * 0.06;
    this.group.rotation.z = bodyRoll;
    const spin = this.speed * dt / 0.36;
    for (const w of this.wheels) w.rotation.x += spin;
    this.wheels[0].rotation.y = this.steer * 0.7;
    this.wheels[1].rotation.y = this.steer * 0.7;
    return { driftScore, crash, boosting };
  }

  dispose(scene) { scene.remove(this.group); }
}

export class TrafficSystem {
  constructor(scene, colliders) {
    this.scene = scene; this.colliders = colliders;
    this.cars = [];
    this.timer = 0;
    this.roadsX = [-120, -60, 0, 60, 120, 180, 240];
    this.roadsZ = [-240, -180, -120, -60, 0, 60, 120, 180, 240];
    for (let i = 0; i < 10; i++) this.spawn(false);
  }
  spawn(anywhere) {
    const type = VEHICLE_TYPES[1 + Math.floor(Math.random() * (VEHICLE_TYPES.length - 1))];
    const horizontal = Math.random() < 0.5;
    let x, z, heading;
    if (horizontal) {
      z = this.roadsZ[Math.floor(Math.random() * this.roadsZ.length)] + (Math.random() < 0.5 ? -2.5 : 2.5);
      x = -280 + Math.random() * 560;
      heading = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      x = this.roadsX[Math.floor(Math.random() * this.roadsX.length)] + (Math.random() < 0.5 ? -2.5 : 2.5);
      z = -280 + Math.random() * 560;
      heading = Math.random() < 0.5 ? 0 : Math.PI;
    }
    const car = new Car(this.scene, type, x, z, heading);
    car.isTraffic = true;
    car.cruise = 9 + Math.random() * 6;
    this.cars.push(car);
  }
  update(dt, playerPos) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 1.2;
      // keep ~10 traffic cars near the player; recycle far ones
      for (const c of this.cars) {
        if (Math.hypot(c.pos.x - playerPos.x, c.pos.z - playerPos.z) > 260) {
          this.scene.remove(c.group);
          this.cars.splice(this.cars.indexOf(c), 1);
          this.spawn(true);
        }
      }
      while (this.cars.length < 10) this.spawn(true);
    }
    for (const c of this.cars) {
      // cruise along its road, gentle steering to stay on it
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      const aheadX = c.pos.x + fx * 8, aheadZ = c.pos.z + fz * 8;
      let steer = 0;
      const onRoadX = this.roadsX.some((rx) => Math.abs(aheadX - rx) < 5);
      const onRoadZ = this.roadsZ.some((rz) => Math.abs(aheadZ - rz) < 5);
      if (!onRoadX && !onRoadZ) {
        // steer back toward the nearest road axis
        const nx = this.roadsX.reduce((a, b) => Math.abs(b - c.pos.x) < Math.abs(a - c.pos.x) ? b : a);
        const nz = this.roadsZ.reduce((a, b) => Math.abs(b - c.pos.z) < Math.abs(a - c.pos.z) ? b : a);
        const wantHeading = Math.abs(nx - c.pos.x) < Math.abs(nz - c.pos.z)
          ? (nz > c.pos.z ? 0 : Math.PI)
          : (nx > c.pos.x ? Math.PI / 2 : -Math.PI / 2);
        let d = wantHeading - c.heading;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        steer = Math.max(-1, Math.min(1, d * 2));
      }
      const fakeInput = { fwd: 1, strafe: steer, nitro: false };
      c.update(dt, fakeInput, this.colliders, false);
      // keep traffic at cruise speed
      if (c.speed > c.cruise) c.speed = Math.max(c.cruise, c.speed - 20 * dt);
      if (c.speed < c.cruise * 0.6) c.speed += 8 * dt;
    }
  }
}
