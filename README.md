# Gamepad Combat Targeting Laboratory

A standalone Canvas 2D prototype for evaluating Last Epoch controller targeting. It uses browser-native JavaScript modules, with no build step, gameplay server, installed dependencies, or external assets.

## Run locally

From the project directory, run:

```sh
python3 -m http.server 8080 --directory docs
```

Open http://localhost:8080. Use localhost or an HTTPS deployment for the browser Gamepad API. Connect a standard Xbox-style controller and press a button in the active tab so the browser can expose it. The keyboard fallback works immediately. Click the arena to return keyboard focus after editing a field.

| Action | Keyboard and mouse | Xbox-style controller |
| --- | --- | --- |
| Move | WASD | Left stick |
| Aim | Arrow keys, or hold and move right mouse | Right stick angle |
| Place reticle | Aim, then hold Shift and use ↑/↓, or hold and move right mouse | Stick magnitude in Analog magnitude mode. In Radial travel mode, hold a direction to extend and click the right stick while holding direction to retract. |
| Fireball | 1 | RB |
| Sword Slash | 2 | LB |
| Meteor | 3 | RT |
| Glyph of Dominion | 4 | LT |
| Dodge | Space | A |
| Potion | F | B |
| Pause / resume | P | Menu |

## Evaluate the behavior

- Start with **Alternating movement and casts**. Hold A and →, press 1, and keep both inputs held through the lock. Facing should turn for the cast and return to movement when the lock expires. Repeat with A released to check that cast facing persists when stationary.
- In **Long-range precision** or **Close-range swarm**, compare which enemies Fireball and Sword Slash can acquire. Both use the composite cone and count enemies whose visible bodies overlap its edges. Sword Slash also checks whether the enemy body is within reach at acquisition and overlaps its sweep at execution. Weighted priority still scores enemy centers. The far cone defaults to a 12° angle with its apex 145 px behind the player. The cone starts at the player’s position and widens forward. Change **Far cone angle** and **Far cone apex setback** under **Tuning → Targeting cones**. Set the setback to 0 to put the apex back at the player.
- In **Ground placement**, mark the pads with Meteor or Glyph. The cast commits the reticle’s world position when you press the button. Glyph zones coexist until their individual timers expire.
- In **Hidden enemies**, switch targets among visible idle, aggressive, concealed, and untargetable. The Enemies panel explains each acquisition result for the inspected enemy-targeted skill.
- In **Kiting**, aim back at the approaching group while moving away. Projectiles commit their firing angle when cast, then collide with eligible-for-damage enemies along their actual path.

The arena covers about twice the visible area. All four edges wrap continuously, so movement, aiming, enemies, projectiles, and ground effects carry across the seam. Defeated enemies respawn at their original positions with full health after 5 seconds by default. A countdown appears at the defeat marker and in the Enemies tab. Change the delay in **Tuning → Enemies**. Pausing freezes the countdown.

The Diagnostics tab reports raw stick magnitudes, effective aim, movement and facing, cast state, selected enemy, candidate count, and reticle distance. M marks movement, A marks targeting, and F marks animation facing. Pause freezes the simulation while tuning and changing enemy states. Use **Reset arena** to restore the selected encounter. Tuning is stored in the current browser when available and can be imported or exported as JSON.

## Implementation and limitations

- `input.mjs` handles standard gamepad polling, keyboard and pointer input. `targeting.mjs` contains shared geometry, deterministic selection, hysteresis, and radial calculations.
- `simulation.mjs` manages cast snapshots, player movement, enemies, skills, and scenarios. `render.mjs` draws the player-centered view. `settings.mjs` defines the tuning schema and `app.mjs` binds the interface.
- Enemy rules use simple chase and melee contact attacks. Health is a pressure indicator and reaching zero does not end the scenario. Skill collision uses abstract shapes and there are no terrain obstacles or teleport skill.
- Controller support expects the browser’s standard mapping. The browser or host wrapper may require gamepad access, focus, and activation. Keyboard fallback provides every gameplay action.
