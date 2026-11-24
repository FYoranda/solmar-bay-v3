# Solmar Bay — Make GTA 6

[![make.fun](https://img.shields.io/badge/make.fun-gta6--01-orange)](https://make.fun/bounty/gta6-01)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**Solmar Bay** is a complete open-world crime game for the
[make.fun GTA 6 bounty (gta6-01)](https://make.fun/bounty/gta6-01) — a
sun-soaked coastal city you explore on foot and by car, with traffic and
pedestrians, cars to steal, a wanted level with police who respond, story
missions, combat, crew abilities, a full console-style HUD with a minimap,
and a save system. 100% offline, procedural art and sound, three.js r160
vendored under `game/vendor/`.

## Play

Open `game/index.html` in desktop Chrome (or any static file server).
Keyboard + mouse on desktop; touch controls on mobile.

- **WASD** drive / run · **Space** jump · **E** enter / exit car ·
  **Shift** nitro · **F** shoot · **1–5** weapons · **Q / E / R** crew
  abilities · **Esc** pause.
- Touch: analog joystick (left) + FIRE / JUMP / NITRO / CAR buttons
  (right) + weapon buttons 1–5.
- Start a job from the mission panel, lose the cops to drop your wanted
  level, and bank the cash.

## The city

Santa Maria beach and the ferris-wheel / lighthouse pier, six districts
(Marina, Old Town, The Strip, Dockside, Hills, Beachfront), the hero car
**Calyx Sprint GT**, and a police department that hunts you by name —
callsigns, roles, roadblocks and an Air One helicopter with a spotlight.

## Structure

- `game/index.html` — page, HUD, import map
- `game/src/main.js` — boot, game loop, state machine
- `game/src/world.js` — city, beach, pier, sky, lighting
- `game/src/player.js` — on-foot movement, jump, camera-relative
- `game/src/vehicles.js` — arcade car physics, traffic, stealing
- `game/src/police.js` — wanted system, police AI, helicopter
- `game/src/missions.js` — story jobs, objectives, rewards
- `game/src/weapons.js` — weapons, shooting, gun shop
- `game/src/crew.js` — crew abilities Q/E/R
- `game/src/hud.js` — console HUD, minimap, dialogue
- `game/src/audio.js` — procedural WebAudio
- `game/src/touch.js` — touch controls
- `game/src/input.js` — shared keyboard / touch input state
- `game/src/save.js` — save / continue
- `game/vendor/three.module.min.js` — three.js r160 (vendored)

## License

MIT — see [LICENSE](LICENSE).
