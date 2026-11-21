# SENYAP · Hotel Malam

A first-person pixel horror game in seven night shifts, built from this repo's effects and three.js. Play it in
English (the default), Bahasa Malaysia or Bahasa Indonesia; the language picker is on the title screen and
every word, from the HUD and door signs to the notes and subtitles, lives in `src/i18n.js`.

You are the new night security guard at Hotel Seri Malam, an old hotel closed "for renovation". The manager
says there are no guests. The phone in the security post keeps ringing anyway: reports from rooms that have
been empty since a fire in August 1989. Something tall drags a burnt sheet through the corridors. The guard
before you, Pak Din, lasted seven nights and left notes behind.

## The seven nights

| Night | Title | What happens |
| --- | --- | --- |
| 1 | Syif Pertama | Learn the shift: three patrol clocks, a report from room 204 (a tap that won't stop), the report book. The counter bell rings on its own. |
| 2 | Ketukan | Knocking inside the wall of 207 leads to Pak Din's first note. The corridor goes quiet and something stands in the doorway of 209. Steps follow yours. |
| 3 | Langkah | First real meeting: the laundry machine thumps, Bayang comes out to investigate where you can watch it, then patrols floor 2. A spare battery waits in the laundry. |
| 4 | Gelap | The power cuts at 3.17. Pak Din's uniform in 207's bathroom holds the maintenance key; the main switch is on floor 3. Candles (pixelfx) are the only light. |
| 5 | Lif | The CCTV shows something on floor 3 staring at the camera. The lift calls itself to the lobby and speaks, first through its speaker, then from inside the empty cabin. |
| 6 | 317 | A call from room 317, which doesn't exist. Its door appears at the end of floor 3. The report you write finishes itself. |
| 7 | Hotel Malam | You wake on the lobby sofa at 3.17 with your name checked out. Three keys (207, Maintenance, Exit) lead to the service door; the lift is faster, but its bell brings Bayang. |

A prologue (the job advert, Mr Rahman at the service door) comes before night 1. Every day screen has the
manager's message, **what you know so far** and **tonight's goal**, and the pause menu keeps the same journal
plus every note you've found. Winning night 7 plays an epilogue with a twist: Mr Rahman was the guard on the
night of the fire, the only one who ever got out, and getting out means taking his place and hiring the next
guard. The final message on your phone is the welcome text you read on day 1, signed with your name.

Each shift ends with a written report: the patrol clocks you punched and every report from a room, what was
found and what you did. A day screen with a message from the manager comes before the next night.

## Playing

- **Objectives come one at a time, each against the clock.** The current one is bright with a countdown;
  the rest wait, dimmed, and their objects refuse to work ("Not yet. First: ...") so nothing can be skipped.
  A call from a room jumps the queue. Miss a deadline and the objective still has to be done, but the
  **threat** rises (1 to 3): Bayang gets faster, sees further, goes to where you are, and from threat 2 no
  floor is safe even on nights it wasn't hunting. The hotel turns on you too: lights stutter, open doors slam,
  phones ring twice and stop, breathing behind you, and a tall figure standing where the corridor ends.
- **When it catches you:** the sound dies and the screen goes dark while your head turns toward it on its
  own; then its face, a scream, single frames of the face across the whole screen, a neck twisting too far;
  then a hard cut to silence, a flat heart-monitor tone, and your name, whispered. The game-over screen tells
  you what time it is where you are.

- **WASD** move, **mouse** look, **E** or **click** use (doors, phones, clocks, hiding, CCTV), **Shift** run
  (loud), **F** flashlight. On a phone: drag left to move, drag right to look, and the GUNA / LAMPU / LARI
  buttons.
- **Bayang** investigates the last loud sound (running, the counter bell, the lift's bell, a phone left
  ringing), stops there to listen, chases what it sees, then searches where it last saw you. Doors and
  corners break its line of sight. It opens doors as it goes, and follows you up and down the stairs.
- Hold the **flashlight** on its face to slow it, and long enough to drive it off for a while. It drains the
  battery fast.
- **Hide** in wardrobes and lockers. If it watched you get in, it will open the door.
- The **cloth drag** is its one honest cue, and it is always captioned when it's near and out of sight.
- **Pause** has volume, look sensitivity and sound captions. Retrying a night keeps the same hotel; night 7
  saves a checkpoint at the maintenance room.
- Progress, your name and settings are kept in the browser's local storage.

To show a donation link under MASUK, set `data-donate` on `<body>` in `index.html` to the page's URL. It stays
hidden while empty.

## How it's made

- **three.js r186** draws the hotel from ASCII floor plans (`src/data/maps.js`): four floors stacked in one
  scene so the security cameras can look at any of them, walls as one `InstancedMesh` per floor, doors on
  hinges, lifts with lit cabins and sliding doors, furniture that blocks movement and sight. It renders at
  about 230 px tall into a half-float target; one shader pass adds chromatic split, grain, vignette, a fear
  tint, glitch bands, the green CCTV look, then posterizes with a 4x4 Bayer matrix.
- **pixelfx effects live in the hotel** (`src/fxsprite.js`): each draws into its own frame, color on a normal
  sprite and light on an additive one. Rain on the lobby glass (`weather/rain` on flat quads), candles
  (`fire/candle`), keys (`pickups/key-glint`), Bayang's feet (`shadow/shadow-flames`), hands from the tub
  (`shadow/grasping-hands`), the eyes in 317 (`critters/eyeball`), pickups (`pickups/collect-burst`), its
  retreat in smoke (`shadow/dark-explosion`).
- **The HUD, the jumpscare and the transitions are pixelfx frames**: objectives and prompts in the pixel
  font, `ui/quest-complete` at the end of a shift, `shadow/dark-explosion` and `shadow/necro-skulls` when it
  gets you, `transitions/crt-off` and `transitions/glitch-wipe`. Door numbers and signs use the same font.
- **Every sound is synthesized** (`src/audio.js`): rain, light hum, drips and the boiler per area; phones,
  the counter bell, the lift; voices as filtered speech-shaped murmurs (thin on the phone, tinny from the
  lift's speaker, close with a breath after); Bayang's cloth drag and breathing in 3D, muffled through walls
  and floors.
- **The story** (`src/data/story.js`) scripts each night through a small API: tasks, timers, phone calls,
  room reports, items, keys, lights, doors and Bayang's appearances.

## Earphones

The game opens on a card that asks you to wear earphones, in all three languages; its button is also what
lets the browser start sound. Bayang is meant to be heard before it is seen: its cloth drag and breathing are
placed in 3D and muffled through walls and floors, and that only works in earphones.

## Promo clips

`?trailer` turns the game into its own film crew: `src/main.js` steps the real game one fixed frame at a time
through a scripted cut (the earphones card, the lobby in the rain, the CCTV finding it on floor 3, a call from
an empty room, the doorway of 209, the bathroom of 207, room 317, the lift that talks, the chase, the
jumpscare, the title), and the sound engine renders the same synthesized audio offline in step with the
frames. Titles are translated like everything else.

```bash
tools/make-trailer.sh ms     # or en, id -> promo/senyap-trailer-ms.mp4 (16:9) and -vertical.mp4 (9:16)
```

## Build

```bash
cd examples/senyap
npm install
npm run build      # dist/senyap.html (one self-contained page), plus dist/index.html + dist/game.js
```

Open `dist/senyap.html` in a browser. Use headphones.
