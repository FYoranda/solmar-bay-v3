// player.js — Jax Marlowe on foot. Camera-relative movement, decoupled
// horizontal control (identical on ground and in the air), a 0.12 s coyote
// window and a 0.12 s jump buffer so running jumps never feel frozen.
import * as THREE from 'three';
import { slideMove } from './world.js';

const WALK_SPEED = 7.5;
const SPRINT_SPEED = 11;
const AIR_CONTROL = 0.85;
const GRAVITY = 26;
const JUMP_VEL = 10.5;
const COYOTE = 0.12;
const JUMP_BUFFER = 0.12;

export class Player {
  constructor(scene) {
    this.group = new THREE.Group();
    // body: jacket, head, legs that swing when walking
    const jacket = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.78, 0.36),
      new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.7 }));
    jacket.position.y = 1.02; jacket.castShadow = true;
    this.group.add(jacket);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xe8b88a, roughness: 0.8 }));
    head.position.y = 1.62; head.castShadow = true;
    this.group.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.28, 0.12, 12),
      new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.6 }));
    cap.position.y = 1.82; this.group.add(cap);
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.62, 0.26),
      new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.8 }));
    this.legL.position.set(-0.16, 0.31, 0); this.group.add(this.legL);
    this.legR = this.legL.clone(); this.legR.position.x = 0.16; this.group.add(this.legR);
    this.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(this.group);

    this.pos = new THREE.Vector3(-140, 0, 30);
    this.vy = 0;
    this.yaw = 0;           // facing
    this.grounded = true;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.walkPhase = 0;
    this.moving = false;
    this.speed = 0;
  }

  reset(x, z) {
    this.pos.set(x, 0, z); this.vy = 0; this.yaw = 0;
    this.grounded = true; this.coyote = 0; this.jumpBuffer = 0;
  }

  update(dt, input, colliders, camYaw) {
    // --- jump buffering + coyote ---
    if (input.jumpPressed) this.jumpBuffer = JUMP_BUFFER;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (this.grounded) this.coyote = COYOTE;
    else this.coyote = Math.max(0, this.coyote - dt);

    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vy = JUMP_VEL;
      this.grounded = false; this.coyote = 0; this.jumpBuffer = 0;
    }

    // --- horizontal: camera-relative, decoupled from ground/air ---
    // Camera forward IS (sin(camYaw), cos(camYaw)) — the direction the
    // camera looks (away from the viewer). W must move the player that
    // way (into the screen), not toward the camera.
    const sprint = input.nitro ? SPRINT_SPEED : WALK_SPEED;
    const control = this.grounded ? 1 : AIR_CONTROL;
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);    // camera forward
    const rx = -fz, rz = fx;                                // camera right
    let mx = fx * input.fwd + rx * input.strafe;
    let mz = fz * input.fwd + rz * input.strafe;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const target = sprint * control;
    const step = target * dt;
    const res = slideMove(this.pos, mx * step, mz * step, 0.55, colliders);
    const moved = Math.hypot(res.x - this.pos.x, res.z - this.pos.z);
    this.pos.x = res.x; this.pos.z = res.z;
    this.moving = moved > 0.001;
    this.speed = dt > 0 ? moved / dt : 0;

    // face movement direction smoothly
    if (this.moving) {
      const want = Math.atan2(mx, mz);
      let d = want - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 12);
    }

    // --- vertical: gravity ---
    this.vy -= GRAVITY * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= 0) {
      if (!this.grounded && this.vy < -8) { /* landing thud handled by caller via vy */ }
      this.pos.y = 0; this.vy = 0; this.grounded = true;
    } else {
      this.grounded = false;
    }

    // --- animate ---
    this.walkPhase += this.speed * dt * 1.6;
    const swing = this.moving && this.grounded ? Math.sin(this.walkPhase) * 0.55 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    // slight lean into motion
    this.group.rotation.x = this.moving ? 0.06 : 0;
  }
}
