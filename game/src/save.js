// save.js — save / continue via localStorage. One small JSON blob:
// money, respect, mission index, owned weapons, player + car position.
const KEY = 'solmar-bay-v3-save-v1';

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
}

export function writeSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      money: state.money, respect: state.respect,
      missionIndex: state.missionIndex, owned: state.owned,
      px: state.px, pz: state.pz, day: state.day, clockMin: state.clockMin,
      savedAt: Date.now(),
    }));
    return true;
  } catch (e) { return false; }
}

export function readSave() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}
