'use strict';

/* =========================================================
   Ghana Ludu — SETUP SCREEN (setup.js)
   Runs before the board. Collects player count, colours,
   who starts, and the rule set — then calls startGame().

   Loaded after game.js (needs PRESETS, DIAGONAL_PAIRS,
   areDiagonal, applyRules) and before script.js.
   ========================================================= */

const setupState = {
  count: 3,
  colours: [],        // chosen, in click order
  starter: null,
  preset: 'street',
};

const setupEl = document.getElementById('setup');
const countRow = document.getElementById('player-count');
const colourRow = document.getElementById('colour-picks');
const starterRow = document.getElementById('starter-picks');
const presetRow = document.getElementById('preset-picks');
const presetBlurb = document.getElementById('preset-blurb');
const colourHint = document.getElementById('colour-hint');
const errorEl = document.getElementById('setup-error');
const startBtn = document.getElementById('start-game');
const advancedBoxes = [...document.querySelectorAll('[data-rule]')];

// ---- Player count ----

countRow.addEventListener('click', e => {
  const btn = e.target.closest('[data-count]');
  if (!btn) return;
  setupState.count = parseInt(btn.dataset.count);
  setupState.colours = [];
  setupState.starter = null;
  render();
});

// ---- Colours ----
// Two players must be diagonally opposite: equal distance to home.

function colourIsPickable(colour) {
  if (setupState.colours.includes(colour)) return true;   // can always deselect
  if (setupState.colours.length >= setupState.count) return false;
  if (setupState.count === 2 && setupState.colours.length === 1) {
    return areDiagonal(setupState.colours[0], colour);
  }
  return true;
}

colourRow.addEventListener('click', e => {
  const btn = e.target.closest('[data-colour]');
  if (!btn) return;
  const colour = btn.dataset.colour;

  if (setupState.colours.includes(colour)) {
    setupState.colours = setupState.colours.filter(c => c !== colour);
    if (setupState.starter === colour) setupState.starter = null;
  } else if (colourIsPickable(colour)) {
    setupState.colours.push(colour);
  }
  render();
});

// ---- Who starts ----

starterRow.addEventListener('click', e => {
  const btn = e.target.closest('[data-starter]');
  if (!btn) return;
  setupState.starter = btn.dataset.starter;
  render();
});

// ---- Rule presets ----

presetRow.addEventListener('click', e => {
  const btn = e.target.closest('[data-preset]');
  if (!btn) return;
  setupState.preset = btn.dataset.preset;
  // Presets set the advanced toggles; the player can still tweak after.
  const rules = PRESETS[setupState.preset].rules;
  advancedBoxes.forEach(box => {
    if (box.dataset.rule in rules) box.checked = rules[box.dataset.rule];
  });
  render();
});

// Tweaking any toggle means you're no longer on a named preset.
advancedBoxes.forEach(box => {
  box.addEventListener('change', () => {
    const rules = PRESETS[setupState.preset].rules;
    const matches = advancedBoxes.every(
      b => !(b.dataset.rule in rules) || b.checked === rules[b.dataset.rule]
    );
    if (!matches) setupState.preset = null;
    render();
  });
});

// ---- Render ----

function render() {
  // Count
  [...countRow.children].forEach(btn => {
    btn.classList.toggle('is-on', parseInt(btn.dataset.count) === setupState.count);
  });

  // Colours
  [...colourRow.children].forEach(btn => {
    const colour = btn.dataset.colour;
    const chosen = setupState.colours.includes(colour);
    btn.classList.toggle('is-on', chosen);
    btn.classList.toggle('is-off', !chosen && !colourIsPickable(colour));
  });

  const need = setupState.count - setupState.colours.length;
  if (setupState.count === 2 && setupState.colours.length === 1) {
    const partner = DIAGONAL_PAIRS
      .find(p => p.includes(setupState.colours[0]))
      .find(c => c !== setupState.colours[0]);
    colourHint.textContent = `— must pair with ${partner} (opposite corners)`;
  } else if (need > 0) {
    colourHint.textContent = `— pick ${need} more`;
  } else {
    colourHint.textContent = '';
  }

  // Starter buttons, in clockwise order
  starterRow.innerHTML = '';
  const chosen = TURN_ORDER.filter(c => setupState.colours.includes(c));
  if (chosen.length === 0) {
    starterRow.innerHTML = '<span class="setup-hint">Pick your colours first</span>';
  } else {
    if (!setupState.starter) setupState.starter = chosen[0];
    for (const colour of chosen) {
      const btn = document.createElement('button');
      btn.className = 'starter-pick';
      btn.dataset.starter = colour;
      btn.innerHTML = `<span class="swatch swatch-${colour}"></span>${colour}`;
      btn.style.textTransform = 'capitalize';
      btn.classList.toggle('is-on', setupState.starter === colour);
      starterRow.appendChild(btn);
    }
  }

  // Presets
  [...presetRow.children].forEach(btn => {
    btn.classList.toggle('is-on', btn.dataset.preset === setupState.preset);
  });
  presetBlurb.textContent = setupState.preset
    ? PRESETS[setupState.preset].blurb
    : 'Custom rules.';

  // Start button
  const ready = setupState.colours.length === setupState.count;
  startBtn.disabled = !ready;
  errorEl.textContent = '';
}

// ---- Start ----

startBtn.addEventListener('click', () => {
  if (setupState.colours.length !== setupState.count) {
    errorEl.textContent = `Pick ${setupState.count} colours to start.`;
    return;
  }
  if (setupState.count === 2 && !areDiagonal(...setupState.colours)) {
    errorEl.textContent = 'Two players must take opposite corners.';
    return;
  }

  // Collect rules from the toggles (they reflect the preset plus tweaks).
  const rules = {};
  advancedBoxes.forEach(box => { rules[box.dataset.rule] = box.checked; });
  applyRules(rules);

  setupEl.classList.add('is-hidden');
  startGame(setupState.colours, setupState.starter);
});

render();