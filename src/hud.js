// hud.js — the console-style HUD. Updates every DOM panel from one state
// snapshot per frame, and draws the circular minimap (roads, beach, sea,
// player arrow, police, rivals, mission beacon, gun shop).
const RANKS = [
  { at: 0, name: 'ROOKIE' }, { at: 250, name: 'DOCK HAND' },
  { at: 600, name: 'FIXER' }, { at: 1200, name: 'CREW BOSS' }, { at: 2000, name: 'KINGPIN' },
];
export function rankFor(respect) {
  let r = RANKS[0], next = RANKS[1];
  for (let i = 0; i < RANKS.length; i++) {
    if (respect >= RANKS[i].at) { r = RANKS[i]; next = RANKS[i + 1] || null; }
  }
  return { rank: r, next };
}

export class HUD {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'), jobTitle: $('job-title'), jobObj: $('job-obj'), jobTimer: $('job-timer'),
      jobStage: $('job-stage'), dispatchCount: $('dispatch-count'), dispatchList: $('dispatch-list'),
      money: $('money'), stars: $('stars'), clock: $('clock'), rankLabel: $('rank-label'),
      rankFill: $('rank-fill'), weapons: $('hud-weapons'), crew: $('hud-crew'),
      minimap: $('minimap'), hp: $('hp-fill'), ar: $('ar-fill'), district: $('district'),
      respect: $('respect-label'), dlgFace: $('dlg-face'), dlgWho: $('dlg-who'), dlgSay: $('dlg-say'),
      nitro: $('nitro-fill'), speed: $('speed'), carName: $('car-name'), carCond: $('car-cond'),
      radio: $('radio'), toast: $('hud-toast'),
    };
    this.mm = this.el.minimap.getContext('2d');
    this.toastTimer = 0;
    this.weaponSlots = [];
    for (let i = 0; i < 5; i++) {
      const d = document.createElement('div');
      d.className = 'slot';
      this.el.weapons.appendChild(d);
      this.weaponSlots.push(d);
    }
    this.crewCards = [];
    for (let i = 0; i < 3; i++) {
      const d = document.createElement('div');
      d.className = 'card panel';
      this.el.crew.appendChild(d);
      this.crewCards.push(d);
    }
    this.dialogueUntil = 0;
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  toast(text, ms) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), ms || 2200);
  }

  dialogue(who, say, face) {
    this.el.dlgWho.textContent = who;
    this.el.dlgSay.textContent = say;
    this.el.dlgFace.textContent = face || who.charAt(0);
    this.dialogueUntil = performance.now() + 9000;
  }

  update(s) {
    // mission panel
    if (s.mission) {
      this.el.jobTitle.textContent = `JOB ${s.mission.index + 1}/8 · ${s.mission.title}`;
      this.el.jobObj.textContent = s.mission.obj;
      this.el.jobTimer.textContent = s.mission.timer > 0 ? `⏱ ${Math.ceil(s.mission.timer)}s` : '';
      this.el.jobStage.style.width = `${Math.round(100 * s.mission.stage / s.mission.stageTotal)}%`;
    } else {
      this.el.jobTitle.textContent = 'FREE ROAM · SOLMAR BAY';
      this.el.jobObj.textContent = 'Press M for the next job. Explore, steal, outrun.';
      this.el.jobTimer.textContent = '';
      this.el.jobStage.style.width = '0%';
    }
    // dispatch
    const units = s.dispatch || [];
    this.el.dispatchCount.textContent = `${units.length} UNIT${units.length === 1 ? '' : 'S'} · ${s.wanted}★`;
    this.el.dispatchList.innerHTML = units.slice(0, 5).map((u) =>
      `<div class="unit"><span>${u.callsign}</span><span class="role">${u.role}</span>` +
      `<span class="dist">${u.dist}m</span>` +
      (u.chip ? `<span class="chip ${u.chip}">${u.chipText}</span>` : '') + `</div>`
    ).join('') || '<div class="unit"><span style="color:#7dff9b">NO ACTIVE UNITS</span></div>';
    // money / stars / clock / rank
    this.el.money.textContent = `$${Math.floor(s.money).toLocaleString('en-US')}`;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < s.wanted ? '★' : '<span class="off">★</span>';
    this.el.stars.innerHTML = stars;
    const hh = String(Math.floor(s.clockMin / 60) % 24).padStart(2, '0');
    const mm = String(Math.floor(s.clockMin % 60)).padStart(2, '0');
    this.el.clock.textContent = `${hh}:${mm} · DAY ${s.day}`;
    const { rank, next } = rankFor(s.respect);
    this.el.rankLabel.textContent = `RANK ${RANKS.indexOf(rank) + 1} · ${rank.name}`;
    const prog = next ? (s.respect - rank.at) / (next.at - rank.at) : 1;
    this.el.rankFill.style.width = `${Math.round(100 * Math.min(1, prog))}%`;
    // weapons
    s.weapons.forEach((w, i) => {
      const d = this.weaponSlots[i];
      d.className = 'slot' + (w.active ? ' active' : '') + (w.owned ? '' : ' locked');
      d.innerHTML = `<div class="k">${i + 1}</div><div class="n">${w.owned ? w.name : 'LOCKED'}</div>` +
        `<div class="a">${w.owned ? (w.ammo === Infinity ? '∞' : w.ammo) : '—'}</div>`;
    });
    // crew
    s.crew.forEach((c, i) => {
      const d = this.crewCards[i];
      d.innerHTML = `<span class="key">${c.key}</span><div class="nm">${c.name}</div>` +
        `<div class="rl">${c.role}</div>` +
        `<div class="st ${c.ready ? '' : 'cd'}">${c.ready ? 'READY' : 'COOLDOWN ' + Math.ceil(c.cd) + 's'}</div>`;
    });
    // vitals
    this.el.hp.style.width = `${Math.max(0, Math.min(100, s.hp))}%`;
    this.el.ar.style.width = `${Math.max(0, Math.min(100, s.armour))}%`;
    this.el.district.textContent = s.district;
    this.el.respect.textContent = `RESPECT ${Math.floor(s.respect)} / ${next ? next.at : 'MAX'}`;
    // speedo / nitro / radio
    this.el.speed.textContent = Math.round(s.speedKmh);
    this.el.carName.textContent = s.carName;
    this.el.carCond.textContent = s.carCond !== null ? `CONDITION ${Math.round(s.carCond)}%` : '';
    this.el.nitro.style.width = `${Math.round(s.nitro)}%`;
    this.el.radio.textContent = s.radio;
    this.drawMinimap(s);
  }

  drawMinimap(s) {
    const c = this.mm, W = 150, H = 150;
    const toX = (x) => ((x + 310) / 620) * W;
    const toY = (z) => ((z + 310) / 620) * H;
    c.clearRect(0, 0, W, H);
    // sea + beach (west)
    c.fillStyle = '#164a72'; c.fillRect(0, 0, toX(-220), H);
    c.fillStyle = '#c9a06a'; c.fillRect(toX(-220), 0, toX(-150) - toX(-220), H);
    // land
    c.fillStyle = '#232338'; c.fillRect(toX(-150), 0, W - toX(-150), H);
    // roads
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2;
    for (const x of [-120, -60, 0, 60, 120, 180, 240]) {
      c.beginPath(); c.moveTo(toX(x), 0); c.lineTo(toX(x), H); c.stroke();
    }
    for (const z of [-240, -180, -120, -60, 0, 60, 120, 180, 240]) {
      c.beginPath(); c.moveTo(0, toY(z)); c.lineTo(W, toY(z)); c.stroke();
    }
    // pier
    c.strokeStyle = '#d9b380'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(toX(-210), toY(0)); c.lineTo(toX(-320), toY(0)); c.stroke();
    // gun shop
    c.fillStyle = '#00e5ff';
    c.beginPath(); c.arc(toX(s.shop.x), toY(s.shop.z), 4, 0, Math.PI * 2); c.fill();
    // mission beacon (pulsing)
    if (s.beacon) {
      const p = 0.6 + 0.4 * Math.sin(performance.now() / 180);
      c.fillStyle = `rgba(255,215,106,${p})`;
      c.save(); c.translate(toX(s.beacon.x), toY(s.beacon.z)); c.rotate(Math.PI / 4);
      c.fillRect(-5, -5, 10, 10); c.restore();
    }
    // rivals
    for (const r of s.rivals || []) {
      c.fillStyle = '#ff7a2a';
      c.beginPath(); c.arc(toX(r.x), toY(r.z), 4, 0, Math.PI * 2); c.fill();
    }
    // police (red; all of them when eyes-out, near ones otherwise)
    for (const p of s.police || []) {
      if (!s.eyesOut && p.dist > 130) continue;
      c.fillStyle = '#ff2a2a';
      c.beginPath(); c.arc(toX(p.x), toY(p.z), 3.5, 0, Math.PI * 2); c.fill();
    }
    // traffic ( faint dots )
    for (const t of s.traffic || []) {
      c.fillStyle = 'rgba(255,255,255,0.5)';
      c.fillRect(toX(t.x) - 1.5, toY(t.z) - 1.5, 3, 3);
    }
    // player arrow
    c.save();
    c.translate(toX(s.px), toY(s.pz));
    c.rotate(Math.atan2(Math.sin(s.yaw), Math.cos(s.yaw)) + Math.PI);
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(-5, 6); c.closePath(); c.fill();
    c.restore();
    // north
    c.fillStyle = '#ffd76a'; c.font = 'bold 10px Arial'; c.textAlign = 'center';
    c.fillText('N', W / 2, 11);
  }
}
