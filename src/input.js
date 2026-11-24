// input.js — one shared input state. Keyboard, mouse and touch all write
// here; the player, vehicles, weapons and crew only read from here.
// Nothing in the game reads DOM events directly.
export const input = {
  // movement: -1..1 (forward/back, left/right). Keyboard sets -1/0/1,
  // the analog joystick sets a continuous value.
  fwd: 0, strafe: 0,
  // analog joystick output (touch): -1..1 on both axes, magnitude = intent.
  joyX: 0, joyY: 0, joyActive: false,
  // actions (edge-triggered where noted)
  jump: false, jumpPressed: false,
  fire: false, firePressed: false,
  nitro: false, carPressed: false,
  pausePressed: false,
  weaponSlot: 0,          // 1..5 requested by number key / touch button
  crewKey: '',            // 'Q' | 'E' | 'R' requested
  // mouse (camera orbit while driving is optional; kept for future use)
  mouseDX: 0,
};

export function resetEdgeTriggers() {
  input.jumpPressed = false;
  input.firePressed = false;
  input.carPressed = false;
  input.pausePressed = false;
  input.weaponSlot = 0;
  input.crewKey = '';
  input.mouseDX = 0;
}

const keyState = new Set();
let keyHandlerBound = false;

export function bindKeyboard() {
  if (keyHandlerBound) return;
  keyHandlerBound = true;
  const down = (e) => {
    if (e.repeat) { updateKeys(); return; }
    keyState.add(e.code);
    if (e.code === 'Space') { input.jump = true; input.jumpPressed = true; e.preventDefault(); }
    if (e.code === 'KeyF') { input.fire = true; input.firePressed = true; }
    if (e.code === 'KeyE') { input.carPressed = true; }
    if (e.code === 'Escape') { input.pausePressed = true; }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.nitro = true;
    const slot = ['Digit1','Digit2','Digit3','Digit4','Digit5'].indexOf(e.code);
    if (slot >= 0) input.weaponSlot = slot + 1;
    if (e.code === 'KeyQ') input.crewKey = 'Q';
    if (e.code === 'KeyR') input.crewKey = 'R';
    updateKeys();
  };
  const up = (e) => {
    keyState.delete(e.code);
    if (e.code === 'Space') input.jump = false;
    if (e.code === 'KeyF') input.fire = false;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.nitro = false;
    updateKeys();
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', () => { keyState.clear(); input.fwd = 0; input.strafe = 0; input.fire = false; input.nitro = false; });
}

function updateKeys() {
  if (input.joyActive) return; // joystick owns movement while touched
  const f = (keyState.has('KeyW') || keyState.has('ArrowUp') ? 1 : 0)
          - (keyState.has('KeyS') || keyState.has('ArrowDown') ? 1 : 0);
  const s = (keyState.has('KeyD') || keyState.has('ArrowRight') ? 1 : 0)
          - (keyState.has('KeyA') || keyState.has('ArrowLeft') ? 1 : 0);
  input.fwd = f;
  input.strafe = s;
}

// Called by touch.js: joystick drives fwd/strafe continuously.
export function setJoystick(x, y, active) {
  input.joyX = x; input.joyY = y; input.joyActive = active;
  if (active) {
    input.fwd = -y;   // push up = forward
    input.strafe = x;
  } else if (!keyState.size) {
    input.fwd = 0; input.strafe = 0;
  } else {
    updateKeys();
  }
}

export function isTouchDevice() {
  return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
}
