// main.js — Solmar Bay. Boots the renderer, owns the game loop and the
// state machine (title / playing / paused / busted / wasted), the
// spring-damper chase camera, car enter + steal, shooting, rival cars,
// pedestrians, drift payouts and the save. Every other system is a module
// with one clear job; this file wires them together.
import * as THREE from 'three';
import { input, bindKeyboard, resetEdgeTriggers, isTouchDevice } from './input.js';
import { audio } from './audio.js';
import { buildWorld, districtAt } from './world.js';
import { Player } from './player.js';
import { Car, TrafficSystem, VEHICLE_TYPES } from './vehicles.js';
import { PoliceSystem } from './police.js';
import { MissionSystem } from './missions.js';
import { WeaponSystem, WEAPONS } from './weapons.js';
import { CrewSystem, CREW } from './crew.js';
import { HUD } from './hud.js';
import { TouchControls } from './touch.js';
import { hasSave, writeSave, readSave, clearSave } from './save.js';

const WORLD = { minX: -300, maxX: 300, minZ: -300, maxZ: 300 };

class Ped {
  constructor(scene, x, z) {
    this.group = new THREE.Group();
    const shirt = new THREE.MeshStandardMaterial({ color: [0x3498db, 0xe67e22, 0x9b59b6, 0x1abc9c][Math.floor(Math.random() * 4)], roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), shirt);
    body.position.y = 1.0; body.castShadow = true; this.group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.8 }));
    head.position.y = 1.58; this.group.add(head);
    this.group.position.set(x, 0, z);
    scene.add(this.group);
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 1.2 + Math.random() * 0.8;
    this.flee = 0;
  }
  update(dt, playerPos, wanted) {
    const d = Math.hypot(this.pos.x - playerPos.x, this.pos.z - playerPos.z);
    if (wanted > 0 && d < 18) this.flee = 2.5;
    if (this.flee > 0) {
      this.flee -= dt;
      this.heading = Math.atan2(this.pos.x - playerPos.x, this.pos.z - playerPos.z);
      this.speed = 4.5;
    } else {
      this.speed = 1.4;
      if (Math.random() < dt * 0.1) this.heading += (Math.random() - 0.5) * 1.2;
    }
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    this.pos.x = Math.max(-295, Math.min(295, this.pos.x));
    this.pos.z = Math.max(-295, Math.min(295, this.pos.z));
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }
}

class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
    this.camera.position.set(-150, 8, 60);

    this.world = buildWorld(this.scene);
    this.player = new Player(this.scene);
    this.traffic = new TrafficSystem(this.scene, this.world.colliders);
    this.police = new PoliceSystem(this.scene, this.world.colliders);
    this.missions = new MissionSystem(this.scene);
    this.weapons = new WeaponSystem(this.scene);
    this.crew = new CrewSystem();
    this.hud = new HUD();
    this.touch = null;
    this.isTouch = isTouchDevice();
    if (this.isTouch) {
      document.documentElement.classList.add('touch');
      this.touch = new TouchControls();
    }
    bindKeyboard();

    // mouse drag orbits the camera (desktop look-around)
    let dragging = false, lastX = 0, lastY = 0;
    const cv = this.renderer.domElement;
    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') { dragging = true; lastX = e.clientX; lastY = e.clientY; }
    });
    addEventListener('pointermove', (e) => {
      if (!dragging || e.pointerType !== 'mouse') return;
      this.camYaw -= (e.clientX - lastX) * 0.005;
      this.camPitch = Math.max(0.12, Math.min(0.9, this.camPitch + (e.clientY - lastY) * 0.003));
      lastX = e.clientX; lastY = e.clientY;
    });
    addEventListener('pointerup', () => { dragging = false; });

    // parked cars (stealable), hero Calyx first
    this.parked = [];
    const hero = new Car(this.scene, VEHICLE_TYPES[0], this.world.heroCarSpawn.x, this.world.heroCarSpawn.z, Math.PI / 2);
    hero.isHero = true;
    this.parked.push(hero);
    const spots = [[-30, 22, 0], [60, -52, 1], [120, 68, 2], [-90, -180, 3], [180, 180, 4], [30, -120, 5], [-180, 90, 1], [240, -60, 2]];
    for (const [x, z, t] of spots) {
      const c = new Car(this.scene, VEHICLE_TYPES[t], x, z, Math.random() * Math.PI * 2);
      this.parked.push(c);
    }

    // pedestrians
    this.peds = [];
    for (let i = 0; i < 22; i++) {
      this.peds.push(new Ped(this.scene, -140 + Math.random() * 280, -140 + Math.random() * 280));
    }
    this.rivals = [];   // mission-6 rival cars { car, hp }

    // state
    this.state = 'title';   // title | playing | paused | busted | wasted | complete
    this.car = null;        // the car the player is driving (Car or null)
    this.money = 0; this.respect = 0;
    this.hp = 100; this.armour = 0;
    this.clockMin = 18 * 60 + 42; this.day = 1;
    this.gameTime = 0;
    this.camYaw = 0; this.camPitch = 0.32;
    this.camPos = new THREE.Vector3(-150, 8, 60);
    this.camVel = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3(-140, 1.5, 30);
    this.driftBank = 0; this.driftMult = 1; this.driftTimer = 0;
    this.missionActive = false;
    this.saveTimer = 0;

    this.missions.onEvent = (type, data) => this.onMissionEvent(type, data);
    this.setupScreens();
    this.clock = new THREE.Clock();
    addEventListener('resize', () => this.onResize());
    this.loop();
  }

  // ---------- screens ----------
  setupScreens() {
    const $ = (id) => document.getElementById(id);
    $('btn-new').addEventListener('click', () => { audio.ensure(); audio.click(); this.newGame(); });
    const cont = $('btn-continue');
    if (hasSave()) cont.classList.remove('hidden');
    cont.addEventListener('click', () => { audio.ensure(); audio.click(); this.continueGame(); });
    $('btn-resume').addEventListener('click', () => this.resume());
    $('btn-restart').addEventListener('click', () => { this.restartMission(); });
    $('btn-quit').addEventListener('click', () => this.toTitle());
    $('btn-retry').addEventListener('click', () => { this.retryAfterEnd(); });
    $('btn-end-quit').addEventListener('click', () => this.toTitle());
    if (this.touch) this.touch.onAction = (a) => { if (a === 'pause') this.togglePause(); };
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && this.state === 'playing' && !this.missions.active && !this.missions.done) {
        this.missions.startMission(this.missions.index);
        audio.mission();
      }
    });
  }

  newGame() {
    clearSave();
    this.money = 0; this.respect = 0; this.hp = 100; this.armour = 0;
    this.clockMin = 18 * 60 + 42; this.day = 1;
    this.weapons = new WeaponSystem(this.scene);
    this.police.reset();
    this.player.reset(this.world.playerSpawn.x, this.world.playerSpawn.z);
    this.exitCar(true);
    this.missions.index = 0;
    this.missions.startMission(0);
    this.startPlaying();
  }

  continueGame() {
    const s = readSave();
    if (s) {
      this.money = s.money || 0; this.respect = s.respect || 0;
      this.missions.index = s.missionIndex || 0;
      this.clockMin = s.clockMin || 1122; this.day = s.day || 1;
      if (s.owned) s.owned.forEach((o, i) => { if (o) this.weapons.owned[i] = true; });
      this.player.reset(s.px ?? this.world.playerSpawn.x, s.pz ?? this.world.playerSpawn.z);
    }
    this.police.reset();
    this.startPlaying();
    this.hud.dialogue('MIRA', 'Back in Solmar. Press M when you want the next job.', 'M');
  }

  startPlaying() {
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('end-screen').classList.add('hidden');
    document.getElementById('pause-screen').classList.add('hidden');
    this.hud.show();
    this.state = 'playing';
    audio.ensure();
  }

  toTitle() {
    this.state = 'title';
    this.hud.hide();
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('end-screen').classList.add('hidden');
    document.getElementById('title-screen').classList.remove('hidden');
    const cont = document.getElementById('btn-continue');
    if (hasSave()) cont.classList.remove('hidden');
    this.police.reset();
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      document.getElementById('pause-screen').classList.remove('hidden');
      this.saveGame();
    } else if (this.state === 'paused') this.resume();
  }
  resume() {
    document.getElementById('pause-screen').classList.add('hidden');
    this.state = 'playing';
  }
  restartMission() {
    document.getElementById('pause-screen').classList.add('hidden');
    this.police.reset();
    this.player.reset(this.world.playerSpawn.x, this.world.playerSpawn.z);
    this.exitCar(true);
    this.missions.startMission(this.missions.index);
    this.state = 'playing';
  }
  retryAfterEnd() {
    document.getElementById('end-screen').classList.add('hidden');
    this.hp = 100; this.police.reset();
    this.player.reset(this.world.playerSpawn.x, this.world.playerSpawn.z);
    this.exitCar(true);
    this.state = 'playing';
  }

  saveGame() {
    writeSave({
      money: this.money, respect: this.respect, missionIndex: this.missions.index,
      owned: this.weapons.owned, px: this.player.pos.x, pz: this.player.pos.z,
      day: this.day, clockMin: this.clockMin,
    });
  }

  // ---------- mission events ----------
  onMissionEvent(type, data) {
    if (type === 'dialogue') this.hud.dialogue(data.who, data.say);
    if (type === 'missionStart') this.hud.toast(`JOB ${this.missions.index + 1}/8 · ${data.title}`);
    if (type === 'missionComplete') {
      this.money += data.cash; this.respect += data.respect;
      audio.cash(); audio.mission();
      this.hud.toast(`JOB COMPLETE +$${data.cash} · +${data.respect} RESPECT`);
      this.saveGame();
    }
    if (type === 'missionFail') {
      audio.fail();
      this.hud.toast(data);
      this.hud.dialogue('MIRA', 'Job failed. Press M to retry it.', 'M');
    }
    if (type === 'setWanted') this.police.addWanted(data, 'mission');
    if (type === 'spawnRivals') this.spawnRivals(3);
  }

  spawnRivals(n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const x = this.player.pos.x + Math.cos(a) * 55;
      const z = this.player.pos.z + Math.sin(a) * 55;
      const car = new Car(this.scene, { name: 'Rival Runner', color: 0x8e0000, top: 40, accel: 22 },
        Math.max(-290, Math.min(290, x)), Math.max(-290, Math.min(290, z)), 0);
      this.rivals.push({ car, hp: 70 });
    }
    this.hud.toast('RIVAL CARS INBOUND — 3');
  }

  // ---------- car enter / exit / steal ----------
  nearestCar(maxD) {
    const p = this.player.pos;
    let best = null, bestD = maxD;
    const consider = (c) => {
      const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
      if (d < bestD) { bestD = d; best = c; }
    };
    for (const c of this.parked) consider(c);
    for (const c of this.traffic.cars) consider(c);
    return best;
  }

  enterCar(car) {
    if (!car) return;
    // stealing a traffic car in sight of the law draws heat
    const wasTraffic = this.traffic.cars.includes(car);
    if (wasTraffic) {
      this.traffic.cars.splice(this.traffic.cars.indexOf(car), 1);
      if (this.police.wanted > 0 || this.police.units.some((u) => (u.dist ?? 99) < 70)) {
        this.police.addWanted(1, 'theft');
        this.hud.toast('CAR STOLEN — WANTED +1★');
      }
    } else {
      const i = this.parked.indexOf(car);
      if (i >= 0) this.parked.splice(i, 1);
    }
    this.car = car;
    car.speed = 0;
    audio.click();
  }

  exitCar(silent) {
    if (!this.car) return;
    const c = this.car;
    this.player.reset(c.pos.x + Math.sin(c.heading + Math.PI / 2) * 2.5, c.pos.z + Math.cos(c.heading + Math.PI / 2) * 2.5);
    this.player.yaw = c.heading;
    // leave the car parked where it is
    this.parked.push(c);
    this.car = null;
    if (!silent) audio.click();
  }

  // ---------- shooting ----------
  shootTargets() {
    const targets = [];
    for (const r of this.rivals) {
      targets.push({ pos: r.car.pos.clone().setY(1), radius: 2.2, onHit: (d) => this.damageRival(r, d) });
    }
    for (const u of this.police.units) {
      targets.push({ pos: u.pos.clone().setY(1), radius: 2.2, onHit: (d) => this.damagePolice(u, d) });
    }
    for (const t of this.traffic.cars) {
      targets.push({ pos: t.pos.clone().setY(1), radius: 2.2, onHit: (d) => this.damageTraffic(t, d) });
    }
    return targets;
  }

  damageRival(r, d) {
    r.hp -= d;
    if (r.hp <= 0) {
      this.scene.remove(r.car.group);
      this.rivals.splice(this.rivals.indexOf(r), 1);
      this.missions.rivalsDown++;
      this.money += 150;
      audio.crash();
      this.hud.toast('RIVAL DOWN +$150');
    }
  }
  damagePolice(u, d) {
    u.condition = Math.max(0, (u.condition ?? 100) - d);
    if (u.condition <= 0) {
      this.scene.remove(u.group);
      this.police.units.splice(this.police.units.indexOf(u), 1);
      this.police.addWanted(1, 'assault');
      this.hud.toast('UNIT DOWN — WANTED +1★');
    }
  }
  damageTraffic(t, d) {
    t.condition = Math.max(0, t.condition - d);
    if (t.condition <= 0) {
      this.scene.remove(t.group);
      this.traffic.cars.splice(this.traffic.cars.indexOf(t), 1);
      this.police.addWanted(1, 'mayhem');
      this.hud.toast('TRAFFIC DOWN — WANTED +1★');
    }
  }

  fireWeapon() {
    const w = this.weapons.weapon;
    const origin = this.car
      ? this.car.pos.clone().setY(1.2)
      : this.player.pos.clone().setY(1.5);
    const dir = this.car
      ? new THREE.Vector3(Math.sin(this.car.heading), 0, Math.cos(this.car.heading))
      : new THREE.Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw));
    const res = this.weapons.fire(0, origin, dir, this.shootTargets(), audio);
    if (res.fired && !this.car) {
      // firing a gun on the street draws the law
      if (this.police.wanted < 1 && Math.random() < 0.5) this.police.addWanted(1, 'shots');
    }
    return res;
  }

  // ---------- main loop ----------
  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.state === 'playing') this.update(dt);
    this.world.update(dt, this.clock.elapsedTime);
    this.renderer.render(this.scene, this.camera);
    resetEdgeTriggers();
  }

  update(dt) {
    this.gameTime += dt;
    this.clockMin += dt * 0.5;
    if (this.clockMin >= 1440) { this.clockMin -= 1440; this.day++; }

    // pause
    if (input.pausePressed) { this.togglePause(); return; }

    // weapon select
    if (input.weaponSlot) {
      if (this.weapons.select(input.weaponSlot)) audio.click();
      if (this.touch) this.touch.refreshWeapons(this.weaponState());
    }
    // crew abilities
    if (input.crewKey) {
      const idx = { Q: 0, E: 1, R: 2 }[input.crewKey];
      if (idx !== undefined) {
        const r = this.crew.use(idx, this.gameTime, this);
        if (r.ok) { this.hud.toast(`${r.name} — ${r.effect}`); audio.pickup(); }
      }
    }

    // --- enter / exit car ---
    if (input.carPressed) {
      if (this.car) this.exitCar(false);
      else {
        const c = this.nearestCar(5);
        if (c) this.enterCar(c);
      }
    }

    // --- gun shop: stand in the radius to buy ---
    const shop = this.weapons.shop;
    const p = this.player.pos;
    if (!this.car && Math.hypot(p.x - shop.x, p.z - shop.z) < shop.r) {
      const bought = this.weapons.buyNext(this.money);
      if (bought) {
        this.money -= bought.price;
        audio.pickup();
        this.hud.toast(`BOUGHT ${bought.name} — $${bought.price}`);
        if (this.touch) this.touch.refreshWeapons(this.weaponState());
      }
    }

    // --- firing ---
    if (input.fire) {
      const w = this.weapons.weapon;
      if (w.auto || input.firePressed) this.fireWeapon();
    }
    this.weapons.update(dt);

    // --- player / car ---
    const camYaw = this.camYaw;
    if (this.car) {
      const r = this.car.update(dt, input, this.world.colliders, true);
      if (r.crash) { audio.crash(); this.hp = Math.max(0, this.hp - 2); }
      if (r.driftScore > 0) {
        this.driftBank += r.driftScore;
        this.driftMult = Math.min(5, 1 + this.driftBank / 40);
        this.driftTimer = 1.6;
      }
      audio.setEngine(Math.min(1, Math.abs(this.car.speed) / this.car.type.top), true);
    } else {
      this.player.update(dt, input, this.world.colliders, camYaw);
      audio.setEngine(0, false);
    }
    // drift payout when the drift ends
    if (this.driftBank > 0) {
      this.driftTimer -= dt;
      if (this.driftTimer <= 0) {
        const pay = Math.round(this.driftBank * 10 * this.driftMult);
        if (pay > 0) { this.money += pay; this.hud.toast(`DRIFT x${this.driftMult.toFixed(1)} +$${pay}`); audio.cash(); }
        this.driftBank = 0; this.driftMult = 1;
      }
    }

    // --- traffic, peds, rivals ---
    const focusPos = this.car ? this.car.pos : this.player.pos;
    this.traffic.update(dt, focusPos);
    for (const pd of this.peds) pd.update(dt, focusPos, this.police.wanted);
    for (const r of [...this.rivals]) {
      const dx = focusPos.x - r.car.pos.x, dz = focusPos.z - r.car.pos.z;
      const dist = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      let d = wantHeading - r.car.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      r.car.update(dt, { fwd: dist > 6 ? 1 : 0.3, strafe: Math.max(-1, Math.min(1, d * 1.5)), nitro: false }, this.world.colliders, false);
      // ramming the player on foot hurts
      if (!this.car && dist < 2.4) { this.hp = Math.max(0, this.hp - 22 * dt); }
      if (this.car && dist < 3.2) {
        this.car.condition = Math.max(0, this.car.condition - 14 * dt);
        this.hp = Math.max(0, this.hp - 4 * dt);
      }
    }

    // --- police ---
    const speed = this.car ? Math.abs(this.car.speed) : this.player.speed;
    const pr = this.police.update(dt, focusPos, speed, !!this.car, audio);
    if (pr.busted) { this.endRun('busted'); return; }
    // police ramming the player on foot
    if (!this.car) {
      for (const u of this.police.units) {
        if ((u.dist ?? 99) < 2.2) this.hp = Math.max(0, this.hp - 18 * dt);
      }
    }
    if (this.hp <= 0) { this.endRun('wasted'); return; }
    if (this.car && this.car.condition <= 0) {
      this.hud.toast('CAR WRECKED');
      this.exitCar(true);
    }

    // --- missions ---
    this.missions.update(dt, {
      px: focusPos.x, pz: focusPos.z,
      inCar: !!this.car,
      carCondition: this.car ? this.car.condition : undefined,
      wanted: this.police.wanted,
      rivalsDown: this.missions.rivalsDown,
      hasWeapon: this.weapons.hasWeapon,
    });
    if (this.missions.done && this.state === 'playing') {
      this.state = 'complete';
      this.hud.toast('ALL JOBS DONE — SOLMAR BAY IS YOURS');
    }

    // --- camera (spring-damper chase, no snap) ---
    // In a car the chase camera follows the car's heading. On foot the
    // camera yaw is the player's own (mouse drag / touch) — it must NOT
    // auto-follow the player's facing, or camera-relative movement feeds
    // back into itself and the player spins in circles.
    if (this.car) {
      const targetYaw = this.car.heading;
      let dy = targetYaw - this.camYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.camYaw += dy * Math.min(1, dt * 2.2);
    }
    const back = this.car ? 11 : 7.5;
    const height = (this.car ? 4.6 : 3.4) + Math.sin(this.camPitch) * 2.2;
    const tx = focusPos.x - Math.sin(this.camYaw) * back * Math.cos(this.camPitch);
    const tz = focusPos.z - Math.cos(this.camYaw) * back * Math.cos(this.camPitch);
    const ty = focusPos.y + height;
    // spring: accel = k*(target-pos) - c*vel
    const k = 26, c = 9;
    this.camVel.x += ((tx - this.camPos.x) * k - this.camVel.x * c) * dt;
    this.camVel.y += ((ty - this.camPos.y) * k - this.camVel.y * c) * dt;
    this.camVel.z += ((tz - this.camPos.z) * k - this.camVel.z * c) * dt;
    this.camPos.addScaledVector(this.camVel, dt);
    this.camera.position.copy(this.camPos);
    const lookX = focusPos.x + Math.sin(this.camYaw) * 6;
    const lookZ = focusPos.z + Math.cos(this.camYaw) * 6;
    this.lookTarget.x += (lookX - this.lookTarget.x) * Math.min(1, dt * 6);
    this.lookTarget.y += ((focusPos.y + 1.6) - this.lookTarget.y) * Math.min(1, dt * 6);
    this.lookTarget.z += (lookZ - this.lookTarget.z) * Math.min(1, dt * 6);
    this.camera.lookAt(this.lookTarget);
    // nitro FOV kick
    const wantFov = (this.car && input.nitro && this.car.nitro > 0) ? 72 : 62;
    if (Math.abs(this.camera.fov - wantFov) > 0.2) {
      this.camera.fov += (wantFov - this.camera.fov) * Math.min(1, dt * 5);
      this.camera.updateProjectionMatrix();
    }

    // --- HUD ---
    this.hud.update(this.hudState());
    // autosave
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) { this.saveTimer = 20; this.saveGame(); }
  }

  weaponState() {
    return WEAPONS.map((w, i) => ({
      name: w.name, ammo: this.weapons.ammo[i],
      owned: this.weapons.owned[i], active: this.weapons.slot === i,
    }));
  }

  hudState() {
    const focusPos = this.car ? this.car.pos : this.player.pos;
    const speedKmh = this.car ? Math.abs(this.car.speed) * 3.6 : this.player.speed * 3.6;
    const m = this.missions.active ? this.missions.mission : null;
    const stage = this.missions.active ? this.missions.mission.stages[this.missions.stage] : null;
    return {
      money: this.money, wanted: this.police.wanted,
      clockMin: this.clockMin, day: this.day, respect: this.respect,
      mission: this.missions.active && m ? {
        index: this.missions.index, title: m.title,
        obj: stage ? stage.text : '', timer: this.missions.timer,
        stage: this.missions.stage + 1, stageTotal: m.stages.length,
      } : null,
      dispatch: this.police.dispatchRows(),
      weapons: this.weaponState(),
      crew: CREW.map((c, i) => ({
        key: c.key, name: c.name, role: c.role,
        ready: this.crew.remaining(i, this.gameTime) <= 0,
        cd: this.crew.remaining(i, this.gameTime),
      })),
      hp: this.hp, armour: this.armour,
      district: districtAt(focusPos.x, focusPos.z),
      speedKmh,
      carName: this.car ? this.car.type.name : 'ON FOOT',
      carCond: this.car ? this.car.condition : null,
      nitro: this.car ? this.car.nitro : 100,
      radio: audio.radioName(),
      px: focusPos.x, pz: focusPos.z,
      yaw: this.car ? this.car.heading : this.player.yaw,
      beacon: this.missions.markerPos,
      shop: this.weapons.shop,
      police: this.police.units.map((u) => ({ x: u.pos.x, z: u.pos.z, dist: u.dist ?? 99 })),
      rivals: this.rivals.map((r) => ({ x: r.car.pos.x, z: r.car.pos.z })),
      traffic: this.traffic.cars.slice(0, 14).map((c) => ({ x: c.pos.x, z: c.pos.z })),
      eyesOut: this.crew.eyesOut(this.gameTime),
    };
  }

  endRun(kind) {
    this.state = kind;
    audio.busted();
    const end = document.getElementById('end-screen');
    document.getElementById('end-sub').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    document.getElementById('end-title').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    document.getElementById('end-text').textContent = kind === 'busted'
      ? 'The SBPD caught up with you. Your cash is safe — but the heat remembers.'
      : 'You went down in Solmar Bay. The crew will pick you up.';
    end.classList.remove('hidden');
    this.hud.hide();
    this.police.reset();
    this.saveGame();
  }
}

// boot
const game = new Game();
window.__solmar = game;
