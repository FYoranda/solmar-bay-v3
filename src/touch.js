// touch.js — touch-first controls. Analog joystick (deadzone 0.28,
// multi-touch tracked by pointer identifier so the joystick + JUMP + a
// button can all be held at once), FIRE (hold repeats), JUMP, NITRO, CAR,
// pause, weapon-select buttons 1–5 and crew buttons Q/E/R. The weapons
// row sits ABOVE the action grid (bottom 172px vs the grid's 154px top)
// so a tap on a weapon button can never land on FIRE/JUMP — the overlap
// that made weapon selection impossible in V2.
import { input, setJoystick } from './input.js';

const DEADZONE = 0.28;

export class TouchControls {
  constructor() {
    this.joyId = null;
    this.joyBase = null;
    this.joyEl = document.getElementById('touch-joy');
    this.knobEl = document.getElementById('touch-knob');
    this.weaponBtns = [];
    this.crewBtns = [];
    this.onAction = null; // (action) => void — pause / car / crew handled by main
    this.buildWeapons();
    this.buildCrew();
    this.bind();
  }

  buildWeapons() {
    const wrap = document.getElementById('touch-weapons');
    wrap.innerHTML = '';
    this.weaponBtns = [];
    for (let i = 0; i < 5; i++) {
      const b = document.createElement('div');
      b.className = 'wbtn locked';
      b.innerHTML = `<span class="k">${i + 1}</span><span class="n">—</span>`;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        input.weaponSlot = i + 1;
      }, { passive: false });
      wrap.appendChild(b);
      this.weaponBtns.push(b);
    }
  }

  buildCrew() {
    const wrap = document.getElementById('touch-crew');
    wrap.innerHTML = '';
    this.crewBtns = [];
    for (const k of ['Q', 'E', 'R']) {
      const b = document.createElement('div');
      b.className = 'cbtn'; b.textContent = k;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        input.crewKey = k;
      }, { passive: false });
      wrap.appendChild(b);
      this.crewBtns.push(b);
    }
  }

  bind() {
    // joystick — pointer events with identifier tracking
    const joy = this.joyEl;
    joy.addEventListener('pointerdown', (e) => {
      if (this.joyId !== null) return;
      this.joyId = e.pointerId;
      const r = joy.getBoundingClientRect();
      this.joyBase = { x: r.left + r.width / 2, y: r.top + r.height / 2, rad: r.width / 2 };
      try { joy.setPointerCapture(e.pointerId); } catch (err) { /* synthetic / stale pointer */ }
      this.moveJoy(e);
      e.preventDefault();
    });
    joy.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joyId) return;
      this.moveJoy(e);
      e.preventDefault();
    });
    const endJoy = (e) => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null; this.joyBase = null;
      this.knobEl.style.transform = 'translate(-50%,-50%)';
      setJoystick(0, 0, false);
    };
    joy.addEventListener('pointerup', endJoy);
    joy.addEventListener('pointercancel', endJoy);

    // action buttons (touchstart / touchend, each tracked separately)
    document.querySelectorAll('#touch-buttons .tbtn').forEach((b) => {
      const act = b.dataset.act;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (act === 'fire') { input.fire = true; input.firePressed = true; }
        if (act === 'jump') { input.jump = true; input.jumpPressed = true; }
        if (act === 'nitro') input.nitro = true;
        if (act === 'car') input.carPressed = true;
        if (this.onAction) this.onAction(act);
      }, { passive: false });
      b.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (act === 'fire') input.fire = false;
        if (act === 'jump') input.jump = false;
        if (act === 'nitro') input.nitro = false;
      }, { passive: false });
    });
    const pause = document.getElementById('touch-pause');
    pause.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      input.pausePressed = true;
      if (this.onAction) this.onAction('pause');
    }, { passive: false });
  }

  moveJoy(e) {
    if (!this.joyBase) return;
    let dx = (e.clientX - this.joyBase.x) / this.joyBase.rad;
    let dy = (e.clientY - this.joyBase.y) / this.joyBase.rad;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    // deadzone
    if (Math.hypot(dx, dy) < DEADZONE) { dx = 0; dy = 0; }
    this.knobEl.style.transform = `translate(calc(-50% + ${dx * 34}px), calc(-50% + ${dy * 34}px))`;
    setJoystick(dx, dy, true);
  }

  // refresh weapon buttons from the weapon system (names, locked, active)
  refreshWeapons(weapons) {
    weapons.forEach((w, i) => {
      const b = this.weaponBtns[i];
      if (!b) return;
      b.className = 'wbtn' + (w.active ? ' active' : '') + (w.owned ? '' : ' locked');
      b.querySelector('.n').textContent = w.owned ? w.name : '—';
    });
  }

  refreshCrew(crew) {
    crew.forEach((c, i) => {
      const b = this.crewBtns[i];
      if (b) b.className = 'cbtn' + (c.ready ? '' : ' cd');
    });
  }
}
