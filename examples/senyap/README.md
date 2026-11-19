# SENYAP

A first-person pixel horror game, built from this repo's effects and three.js.

You wake in an abandoned house with no end. Collect **5 glowing talismans** (azimat) to open the way out,
before **Bayang**, the thing that lives here, finds you. The game's text is in Malay.

- **WASD / arrows** move, **mouse** looks, **Shift** runs (loud), **F** turns the flashlight on and off.
  On a phone: drag on the left to move, drag on the right to look, and use the LARI / LAMPU buttons.
- Hold the flashlight on Bayang's face to slow it, and long enough to drive it off for a while. It drains the
  battery fast. Batteries lie around the house.
- A lit flashlight lets it see you from much farther away. Running makes noise. The floating eyes tell it
  where you are, and some floorboards have hands under them.

## How it's made

- **three.js r186** draws the house: a carved maze with extra openings, walls as one `InstancedMesh`,
  hand-painted-in-code textures, a camera-mounted `SpotLight` with shadows, candle `PointLight`s and
  exponential fog. It renders at about 230 px tall into a half-float target, and one shader pass adds the
  chromatic split, grain, vignette, fear tint and glitch, then posterizes with a 4x4 Bayer matrix so the 3D
  sits with the pixel art.
- **pixelfx effects live in the world as billboards** (`src/fxsprite.js`): each effect draws into its own
  frame, the color buffer goes on a normal sprite and the light buffer on an additive one, faded at the
  edges. Candles (`fire/candle`), the talismans (`fire/spirit-flame`), the watching eyes
  (`critters/eyeball`, red iris), Bayang's feet (`shadow/shadow-flames`, blood palette), the hands
  (`shadow/grasping-hands`), pickups (`pickups/collect-burst`), the open door (`pickups/loot-beam`) and its
  exit in smoke (`shadow/dark-explosion`).
- **The HUD and the endings are pixelfx frames** drawn over the game: pixel-font text, the battery, the
  jumpscare (`shadow/dark-explosion`, `shadow/necro-skulls`) and the transitions (`transitions/crt-off`,
  `transitions/glitch-wipe`).
- **Every sound is synthesized** with WebAudio (`src/audio.js`): drone and wind, a heartbeat that quickens
  as it gets close, footsteps and creaks, its breathing placed in 3D with an HRTF panner, the screech when the
  light burns it, the scream.

## Build

```bash
cd examples/senyap
npm install
npm run build      # dist/senyap.html (one self-contained page) and dist/index.html + dist/game.js
```

Open `dist/senyap.html` in a browser. Use headphones.
