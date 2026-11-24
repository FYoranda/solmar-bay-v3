// crew.js — the crew. Three abilities on Q / E / R, each with a cooldown:
// Q (Mira, Driver): swap plates — instantly drops 1 wanted star.
// E (Lio, Mechanic): quick fix — repairs the car to full condition.
// R (Kiki, Lookout): eyes out — marks every police unit and rival on the
// minimap for 12 seconds (and briefly slows police reactions).
export const CREW = [
  { key: 'Q', name: 'MIRA', role: 'Driver · Swap plates', cooldown: 45, desc: 'Drop 1 wanted star' },
  { key: 'E', name: 'LIO', role: 'Mechanic · Quick fix', cooldown: 40, desc: 'Repair car to full' },
  { key: 'R', name: 'KIKI', role: 'Lookout · Eyes out', cooldown: 30, desc: 'Mark all police 12s' },
];

export class CrewSystem {
  constructor() {
    this.timers = [0, 0, 0];
    this.eyesOutUntil = 0;
  }
  // now: seconds (game clock). Returns { ok, name, effect }.
  use(i, now, game) {
    if (i < 0 || i >= CREW.length) return { ok: false };
    if (this.timers[i] > now) return { ok: false, reason: 'cooling down' };
    this.timers[i] = now + CREW[i].cooldown;
    if (i === 0) {
      if (game.police.wanted > 0) game.police.addWanted(-1, 'plates');
      return { ok: true, name: 'SWAP PLATES', effect: 'Wanted −1 star' };
    }
    if (i === 1) {
      if (game.car) game.car.condition = 100;
      return { ok: true, name: 'QUICK FIX', effect: 'Car repaired' };
    }
    this.eyesOutUntil = now + 12;
    return { ok: true, name: 'EYES OUT', effect: 'Police marked on map' };
  }
  remaining(i, now) { return Math.max(0, this.timers[i] - now); }
  eyesOut(now) { return now < this.eyesOutUntil; }
}
