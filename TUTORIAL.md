# Idle Ecologist Contributor Tutorial

This tutorial helps you go from zero context to shipping a small feature in this codebase.

Estimated time: 30 to 45 minutes.

## 1. Run the game locally

Use any static HTTP server (ES modules do not run from file paths).

```bash
sh ./start.sh
```

Then open:

```text
http://localhost:8080
```

## 2. Understand the architecture in 5 minutes

Core split:

- `game.js`: pure simulation engine, save/load, game tick, unlock systems, economy
- `main.js`: DOM rendering and UI event wiring
- `crops.js`: crop definitions and crop growth behavior (`CropType`, `CropInstance`)
- `engine_sanity_test.html`: quick browser-based sanity checks for engine behavior

Mental model:

1. UI reads engine state.
2. UI calls engine methods on user actions.
3. Engine updates internal state on each tick.
4. UI re-renders from current state.

If you keep this boundary clean (UI in `main.js`, logic in `game.js`), changes are easier to test and maintain.

## 3. Trace one gameplay loop end-to-end

Pick a crop zone in the UI and watch what changes.

Where to look:

- Crop growth and harvest behavior: `crops.js`
- Farm zone definitions and scaling math: `game.js`
- Tab rendering and button handlers: `main.js`

Goal: confirm for yourself which file owns each concern before making changes.

## 4. Hands-on exercise: add a new sanity test

Before adding a feature, add a behavior check in `engine_sanity_test.html`.

Good test ideas:

- A save/apply round-trip never produces negative land values.
- A GPS calculation is independent from display speed settings.
- Invalid data in `applyState` is sanitized safely.

Pattern to follow:

```js
run('my behavior stays true', () => {
  const engine = createEngine();
  // arrange
  // act
  // assert (throw Error on failure)
});
```

Open `engine_sanity_test.html` in the browser and confirm PASS output.

## 5. Hands-on exercise: small feature example

Implement this feature:

"Show a short in-season label for each crop in the Crops tab."

Suggested steps:

1. In `main.js`, locate crop row/card rendering.
2. Read the crop seasons from `CROPS[cropId].seasons`.
3. Read current season from engine calendar state (already used in header/time UI).
4. Render one small status label:
   - In season
   - Out of season
5. Keep business rules in engine unchanged unless gameplay must change.

Scope control tips:

- Do not redesign the tab during this exercise.
- Keep CSS changes minimal and local.
- Reuse existing class naming style.

## 6. Verify before you call it done

Run this checklist:

1. Game loads with no console errors.
2. Existing sanity tests still pass.
3. New UI does not break mobile layout.
4. Save/load still works after your change.
5. Your change is isolated to the smallest set of files possible.

## 7. Suggested commit message

```text
feat(ui): show crop season status in crops tab
```

If you touched behavior rules, use `feat(engine): ...` instead.

## 8. Next tutorial levels

After completing this, pick one:

1. Add a new crop unlock path.
2. Add one new conservation/research effect.
3. Add one migration-safe save field and test sanitization in apply/load flow.

---

If you want, we can do this tutorial interactively and implement the season-status feature step by step in your current branch.