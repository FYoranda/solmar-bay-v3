// missions.js — 8 story jobs for Jax Marlowe and the crew. Each job has
// stages (reach a marker, a timed checkpoint race, lose the heat, deliver,
// shoot rivals, survive, the big score), a cash + respect reward, and
// dialogue that tells the player what to do next.
import * as THREE from 'three';

export const MISSIONS = [
  {
    title: 'WELCOME TO SOLMAR', cash: 250, respect: 40,
    brief: 'Reach the Calyx Sprint GT parked by the pier.',
    stages: [{ type: 'reach', x: -150, z: 8, r: 6, text: 'Reach the Calyx Sprint GT on the pier.' }],
    say: ['MIRA', 'That orange Calyx is yours. Get in it — E to enter. The city is waiting.'],
  },
  {
    title: 'FIRST WHEELS', cash: 400, respect: 50,
    brief: 'Drive the Calyx to the Strip plaza.',
    stages: [{ type: 'reach', x: -30, z: 30, r: 8, text: 'Drive the Calyx to the Strip plaza.' }],
    say: ['MIRA', 'Nice wheels. Take it to the Strip plaza — show the city what you drive.'],
  },
  {
    title: 'CHECKPOINT RUSH', cash: 900, respect: 80,
    brief: 'Street race: hit all 5 checkpoints before the clock runs out.',
    stages: [
      { type: 'race', x: 60, z: 0, r: 9, time: 75, text: 'Checkpoint 1/5 — race the clock!' },
      { type: 'race', x: 120, z: 120, r: 9, text: 'Checkpoint 2/5' },
      { type: 'race', x: 0, z: 180, r: 9, text: 'Checkpoint 3/5' },
      { type: 'race', x: -120, z: 120, r: 9, text: 'Checkpoint 4/5' },
      { type: 'race', x: -30, z: 30, r: 9, text: 'Checkpoint 5/5 — finish at the plaza!' },
    ],
    say: ['LIO', 'Street race, five gates, seventy-five seconds. Nitro is your friend — Shift. Go!'],
  },
  {
    title: 'LOSE THE HEAT', cash: 700, respect: 70,
    brief: 'The SBPD is on you. Break line of sight and lose them.',
    stages: [{ type: 'lose', text: 'Lose the police — break line of sight for 12 seconds.' }],
    say: ['KIKI', 'Cops are on you! Duck down a side street, get out of sight, and stay hidden.'],
    wanted: 2,
  },
  {
    title: 'THE DROP', cash: 1100, respect: 90,
    brief: 'Deliver the package to Dockside. Keep the car in one piece.',
    stages: [{ type: 'deliver', x: 210, z: 210, r: 9, text: 'Deliver the package to Dockside — keep condition above 30%.' }],
    say: ['MIRA', 'Package in the trunk. Dockside, no scratches — the buyer pays for clean delivery.'],
  },
  {
    title: 'GUN RUN', cash: 1400, respect: 110,
    brief: 'Buy a weapon at the gun shop, then take out 3 rival cars.',
    stages: [
      { type: 'shop', x: -60, z: -120, r: 8, text: 'Visit the gun shop on The Strip and buy a weapon.' },
      { type: 'shoot', count: 3, text: 'Take out 3 rival cars. Aim with F.' },
    ],
    say: ['LIO', 'Rivals are rolling in. Hit the gun shop first — then send them home in pieces.'],
  },
  {
    title: 'HOT PURSUIT', cash: 1800, respect: 130,
    brief: 'Survive a 3-star chase for 60 seconds. Do not get busted.',
    stages: [{ type: 'survive', time: 60, text: 'Survive the 3-star chase — 60 seconds. Do not get busted!' }],
    say: ['KIKI', 'Three stars and a heli. Sixty seconds. Drive like the whole city is watching — it is.'],
    wanted: 3,
  },
  {
    title: 'THE BIG SCORE', cash: 5000, respect: 250,
    brief: 'Hit the armored van at the bank, then escape to the safehouse.',
    stages: [
      { type: 'reach', x: 120, z: -60, r: 8, text: 'Reach the armored van at the Hills bank.' },
      { type: 'reach', x: -140, z: -210, r: 9, text: 'Escape to the Old Town safehouse!' },
    ],
    say: ['MIRA', 'The van, the bank, the getaway. This is the one we retire on. Go.'],
    wanted: 3,
  },
];

export class MissionSystem {
  constructor(scene) {
    this.scene = scene;
    this.index = 0;            // current mission
    this.stage = 0;
    this.active = false;
    this.timer = 0;            // per-stage countdown (race / survive)
    this.rivalsDown = 0;
    this.beacon = null;
    this.beaconMat = new THREE.MeshBasicMaterial({
      color: 0xffd76a, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false,
    });
    this.markerPos = null;
    this.onEvent = null;       // (type, data) => void — HUD/dialogue/sound
  }

  get mission() { return MISSIONS[this.index]; }
  get done() { return this.index >= MISSIONS.length; }

  emit(type, data) { if (this.onEvent) this.onEvent(type, data); }

  setBeacon(x, z) {
    this.clearBeacon();
    const geo = new THREE.CylinderGeometry(3.2, 3.2, 30, 20, 1, true);
    const m = new THREE.Mesh(geo, this.beaconMat);
    m.position.set(x, 15, z);
    this.scene.add(m);
    this.beacon = m;
    this.markerPos = { x, z };
  }
  clearBeacon() {
    if (this.beacon) { this.scene.remove(this.beacon); this.beacon = null; }
    this.markerPos = null;
  }

  startMission(i) {
    this.index = i; this.stage = 0; this.active = true;
    this.rivalsDown = 0; this.timer = 0;
    const m = this.mission;
    if (!m) { this.active = false; return; }
    if (m.wanted) this.emit('setWanted', m.wanted);
    if (m.title === 'GUN RUN') this.emit('spawnRivals', 0);
    this.enterStage();
    this.say(m.say);
    this.emit('missionStart', m);
  }

  enterStage() {
    const s = this.mission.stages[this.stage];
    if (!s) return;
    this.timer = s.time || 0;
    if (s.x !== undefined) this.setBeacon(s.x, s.z);
    else this.clearBeacon();
    this.emit('objective', s.text);
  }

  say(lines) {
    if (lines && lines.length >= 2) this.emit('dialogue', { who: lines[0], say: lines[1] });
  }

  fail(reason) {
    this.active = false;
    this.clearBeacon();
    this.emit('missionFail', reason);
  }

  complete() {
    const m = this.mission;
    this.active = false;
    this.clearBeacon();
    this.emit('missionComplete', { cash: m.cash, respect: m.respect, title: m.title });
    this.index++;
    this.stage = 0;
    if (!this.done) {
      this.emit('dialogue', { who: 'MIRA', say: `Job done — $${m.cash} banked. Next job is ready when you are. Press M for the next job.` });
    } else {
      this.emit('dialogue', { who: 'MIRA', say: 'That is every job, Jax. Solmar Bay is yours now.' });
    }
  }

  // st: { px, pz, inCar, carCondition, wanted, rivalsDown, hasWeapon }
  update(dt, st) {
    if (!this.active || this.done) return;
    const s = this.mission.stages[this.stage];
    if (!s) return;
    if (this.beacon) this.beacon.rotation.y += dt * 1.5;

    if (s.type === 'race' || s.type === 'survive') {
      this.timer -= dt;
      this.emit('timer', Math.max(0, this.timer));
      if (this.timer <= 0) {
        if (s.type === 'race') { this.fail('Out of time — the race is lost.'); return; }
        if (s.type === 'survive') { this.advance(); return; }
      }
    }
    if (s.type === 'survive') {
      if (st.wanted < 3) { this.timer = Math.max(this.timer, 0); }
      return; // completion handled by the timer above
    }
    if (s.type === 'lose') {
      if (st.wanted === 0) { this.advance(); }
      return;
    }
    if (s.type === 'shoot') {
      if (st.rivalsDown >= s.count) this.advance();
      return;
    }
    if (s.type === 'shop') {
      if (st.hasWeapon) this.advance();
      // also allow standing in the shop radius to count as "visited" if they own a gun already
      return;
    }
    if (s.type === 'deliver') {
      if (st.carCondition !== undefined && st.inCar && st.carCondition < 30) {
        this.fail('The package car is wrecked — delivery failed.');
        return;
      }
    }
    // reach / race / deliver: proximity check
    if (s.x !== undefined) {
      const d = Math.hypot(st.px - s.x, st.pz - s.z);
      if (d < s.r) this.advance();
    }
  }

  advance() {
    this.stage++;
    if (this.stage >= this.mission.stages.length) {
      this.complete();
    } else {
      this.enterStage();
      this.emit('stage', this.stage + 1);
    }
  }
}
