'use strict';

/* =========================================================
   Ghana Ludu — UI LAYER (script.js)
   Renders gameState and turns clicks into game actions.
   All rules live in game.js — this file never decides them.

   Turn flow (per RULES.md v2):
   - Roll credits: a turn starts with one; each 6 grants one
     more. The player may COUNT NOW or ROLL AGAIN — free order.
   - Values are chips. Tap one or more to combine them, then
     "Count N ▶" plays the sum as ONE move on one token
     (e.g. 6+4 = 10 backward for the kick), remaining values
     stay banked for other tokens.
   - Traps stay invisible until played: blockade bounces, and
     the lone-striker GOTCHA — kick with your only token, move
     it again, and the kick silently un-happens.
   ========================================================= */

// Set to true later for a beginner mode that flags kicks.
const SHOW_HINTS = false;

// ---- Element references ----
const dice = document.querySelector('.dice');
const dieDisplay = document.querySelector('.dice i');
const displayCurrentPlayer = document.querySelector('.display-current-player');
const displayPlayerStatus = document.querySelector('.player-status');
const playerTurn = document.querySelector('.player-turn');
const playerCommentary = document.querySelector('.commentary');
const commentRow = document.querySelector('.comment-row');

const diceFaces = [
  'fa-dice-one', 'fa-dice-two', 'fa-dice-three',
  'fa-dice-four', 'fa-dice-five', 'fa-dice-six',
];

const cellMap = Array.from(document.querySelectorAll('.cell')).reduce((map, cell) => {
  const match = cell.className.match(/cell-(\d+)/);
  if (match) map[parseInt(match[1])] = cell;
  return map;
}, {});

const tokenEls = {};
const baseContainers = {};

for (const color of Object.keys(PLAYERS_META)) {
  const container = document.querySelector(`.${color}-tokens`);
  baseContainers[color] = container;
  container.querySelectorAll('.token').forEach((el, i) => {
    const id = `${color}-${i + 1}`;
    el.dataset.tokenId = id;
    tokenEls[id] = el;
    el.addEventListener('click', () => handleTokenClick(id));
  });
}

// ---- The one source of truth ----
const gameState = createGameState();

let pendingMoves = [];
let spendingIndices = null;      // queue slots being spent on the current move
let selectedIndices = new Set(); // chips currently toggled on

// ---- Display helpers ----

function setStatus(text) {
  displayPlayerStatus.textContent = text;
}

function setCommentary(text) {
  playerCommentary.textContent = text;
}

function highlightCurrentPlayer() {
  document.querySelectorAll('.home').forEach(h => h.classList.remove('player--active'));
  const activeHome = document.querySelector(`.${gameState.currentPlayer}-home`);
  if (activeHome) activeHome.classList.add('player--active');
}

function updateTurnDisplay() {
  playerTurn.textContent = gameState.currentPlayer;
  highlightCurrentPlayer();
}

function queueLabel() {
  return gameState.rolledQueue.join(', ');
}

function kickCommentary(color, kick) {
  switch (kick.via) {
    case 'home':
      return `HOME KICK! ${color} invaded ${kick.color}'s home line and dragged them out 😈`;
    case 'side':
      return `SLIDE KICK! ${color} jumped tracks onto cell ${kick.cell} and sent ${kick.color} packing 😤`;
    default:
      return `${color} kicked ${kick.color} back home! 😈`;
  }
}

// Every total reachable by combining one or more banked values.
function allSubsetTotals(values) {
  const totals = new Set();
  const n = values.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) sum += values[i];
    }
    totals.add(sum);
  }
  return [...totals];
}

// ---- Token selection ----

function highlightChoices(moves, total) {
  gameState.awaitingChoice = true;
  pendingMoves = moves;

  const byToken = groupMovesByToken(moves);
  for (const [tokenId, tokenMoves] of Object.entries(byToken)) {
    const el = tokenEls[tokenId];
    if (!el) continue;
    el.classList.add('selectable');
    if (SHOW_HINTS && tokenMoves.some(m => m.kicks.length > 0)) {
      el.classList.add('selectable-kick');
    }
  }

  setStatus(`${gameState.currentPlayer}, pick a token to move ${total} steps`);

  // Let the player recount with different values before committing.
  commentRow.innerHTML = '';
  if (gameState.rolledQueue.length > 1) {
    commentRow.appendChild(makeButton('↩ change values', () => {
      clearChoices();
      spendingIndices = null;
      presentOptions();
    }));
  }
}

function clearChoices() {
  gameState.awaitingChoice = false;
  pendingMoves = [];
  Object.values(tokenEls).forEach(el =>
    el.classList.remove('selectable', 'selectable-kick')
  );
  commentRow.innerHTML = '';
}

function groupMovesByToken(moves) {
  return moves.reduce((groups, move) => {
    (groups[move.tokenId] = groups[move.tokenId] || []).push(move);
    return groups;
  }, {});
}

function makeButton(label, onClick) {
  const btn = document.createElement('button');
  btn.className = 'move-choice';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function handleTokenClick(tokenId) {
  if (!gameState.awaitingChoice) return;

  const tokenMoves = pendingMoves.filter(m => m.tokenId === tokenId);
  if (tokenMoves.length === 0) return;

  if (tokenMoves.length === 1) {
    const move = tokenMoves[0];
    clearChoices();
    playMove(move);
    return;
  }

  showDirectionChoice(tokenMoves);
}

// Buttons show the INTENDED destination, never the outcome.
// A blocked move looks identical to a clean one — that's the trap.
// When a landing offers kick AND no-kick, both are shown, labelled.
function showDirectionChoice(tokenMoves) {
  commentRow.innerHTML = '';
  setStatus('Choose your move:');

  for (const move of tokenMoves) {
    let label;
    if (move.homeKick) {
      label = `⚔ into ${move.hunting}'s home line (cell ${move.intendedTo})`;
    } else {
      const arrow = move.direction === 'forward' ? '➡' : '⬅';
      const dest = `${arrow} ${move.direction} to cell ${move.intendedTo}`;
      if (move.kicks.length > 0) {
        const via = move.kicks[0].via === 'side' ? 'slide-kick' : 'kick';
        label = `${dest} — ${via} 😈`;
      } else if (move.declinedKick) {
        label = `${dest} — no kick, stay put`;
      } else {
        label = dest;
      }
    }
    commentRow.appendChild(makeButton(label, () => {
      clearChoices();
      playMove(move);
    }));
  }

  if (gameState.rolledQueue.length > 1) {
    commentRow.appendChild(makeButton('↩ change values', () => {
      clearChoices();
      spendingIndices = null;
      presentOptions();
    }));
  }
}

// ---- Token rendering ----

function moveTokenToCell(tokenEl, cellNumber) {
  const targetCell = cellMap[cellNumber];
  if (!targetCell) return console.error('Cell not found:', cellNumber);

  const startRect = tokenEl.getBoundingClientRect();
  const targetRect = targetCell.getBoundingClientRect();
  const deltaX = targetRect.left - startRect.left;
  const deltaY = targetRect.top - startRect.top;

  tokenEl.style.transition = 'transform 0.4s ease';
  tokenEl.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

  setTimeout(() => {
    tokenEl.style.transition = 'none';
    tokenEl.style.transform = 'none';

    if (tokenEl.parentElement) tokenEl.parentElement.removeChild(tokenEl);
    targetCell.appendChild(tokenEl);
    restackCell(targetCell);
  }, 400);
}

function restackCell(cellEl) {
  const tokensInCell = cellEl.querySelectorAll('.token');
  tokensInCell.forEach((t, i) => {
    t.classList.remove('stack-1', 'stack-2', 'stack-3', 'stack-4');
    t.classList.add(`stack-${i + 1}`);
  });
}

function sendTokenToBase(tokenId) {
  const tokenEl = tokenEls[tokenId];
  const color = tokenId.split('-')[0];
  const fromCell = tokenEl.parentElement;

  tokenEl.classList.remove('active-token', 'stack-1', 'stack-2', 'stack-3', 'stack-4');
  tokenEl.style.background = '';
  if (fromCell) fromCell.removeChild(tokenEl);
  baseContainers[color].appendChild(tokenEl);
  if (fromCell && fromCell.classList.contains('cell')) restackCell(fromCell);
}

// The GOTCHA restore: a kicked token walks back onto the cell it
// was kicked from, as if nothing happened.
function restoreTokenToCell(tokenId, cellNumber) {
  const tokenEl = tokenEls[tokenId];
  const color = tokenId.split('-')[0];
  tokenEl.classList.add('active-token');
  tokenEl.style.background = PLAYERS_META[color].color;
  moveTokenToCell(tokenEl, cellNumber);
}

function retireTokenVisual(tokenId) {
  const tokenEl = tokenEls[tokenId];
  tokenEl.classList.remove('active-token');
  tokenEl.classList.add('retired');
}

function showWinnerOverlay(color) {
  const overlay = document.createElement('div');
  overlay.className = 'winner-overlay';
  overlay.innerHTML = `<h1 style="color:${PLAYERS_META[color].color}; text-align:center;">${color.toUpperCase()} Wins the Game!</h1>`;
  document.body.appendChild(overlay);
}

// Walk a list of cells one hop at a time, then call onDone.
function walkCells(tokenEl, cells, color, onDone) {
  if (cells.length === 0) {
    onDone();
    return;
  }
  let step = 0;
  const interval = setInterval(() => {
    moveTokenToCell(tokenEl, cells[step]);
    tokenEl.style.background = PLAYERS_META[color].color;
    step++;
    if (step >= cells.length) {
      clearInterval(interval);
      setTimeout(onDone, 450);
    }
  }, 450);
}

// Blocked move: walk up to the wall, then walk back home.
function animateBounce(move, tokenEl, color, onDone) {
  const outCells = [];
  for (const cell of move.path) {
    if (cell === move.blockedAt) break;
    outCells.push(cell);
  }

  if (outCells.length === 0) {
    onDone();
    return;
  }

  const backCells = outCells.slice(0, -1).reverse();
  backCells.push(move.from);

  walkCells(tokenEl, outCells, color, () => {
    walkCells(tokenEl, backCells, color, onDone);
  });
}

// ---- Playing a move ----
// State changes FIRST (applyMove), then the DOM catches up.
function playMove(move) {
  gameState.isMoving = true;
  const color = gameState.currentPlayer;
  const result = applyMove(gameState, move);
  const tokenEl = tokenEls[move.tokenId];

  const finish = () => {
    if (move.blocked) {
      setCommentary(`❌ ${color} hit a blockade wall at cell ${move.blockedAt}! Bounced back — value wasted.`);
    }

    for (const kick of move.kicks) {
      sendTokenToBase(kick.tokenId);
      setCommentary(kickCommentary(color, kick));
    }

    // THE GOTCHA: the lone striker moved again — its earlier kick
    // silently un-happens; the victim strolls back to its cell.
    if (result.kickReverted) {
      for (const victim of result.restored) {
        restoreTokenToCell(victim.tokenId, victim.cell);
      }
      setCommentary(
        `😱 GOTCHA! ${color} kicked and moved with their only token — the kick doesn't count. Back it goes!`
      );
    }

    if (move.kind === 'retire') {
      retireTokenVisual(move.tokenId);
      setCommentary(`${color} has retired ${countRetired(gameState, color)} token(s) 🎉`);
    }

    if (gameState.gameOver) {
      setCommentary(`${gameState.winner.toUpperCase()} wins the game!`);
      showWinnerOverlay(gameState.winner);
      gameState.isMoving = false;
      return;
    }

    // Remove every value spent on this move (highest index first so
    // splicing doesn't shift the others).
    if (spendingIndices !== null) {
      [...spendingIndices].sort((a, b) => b - a).forEach(i => {
        gameState.rolledQueue.splice(i, 1);
      });
      spendingIndices = null;
    }
    gameState.isMoving = false;
    presentOptions();
  };

  if (move.kind === 'retire') {
    finish();
    return;
  }

  if (move.kind === 'enter') {
    tokenEl.classList.add('active-token');
  }

  if (move.blocked) {
    animateBounce(move, tokenEl, color, finish);
    return;
  }

  // Normal walk; a slide-kick swap adds one extra hop across tracks.
  const cells = move.swapTo !== null && move.swapTo !== undefined
    ? [...move.path, move.swapTo]
    : move.path;
  walkCells(tokenEl, cells, color, finish);
}

// ---- The turn loop: roll and count in any order ----

function endTurn() {
  spendingIndices = null;
  selectedIndices = new Set();
  advanceTurn(gameState);
  updateTurnDisplay();
  displayCurrentPlayer.textContent = `${gameState.currentPlayer}'s turn`;
  setStatus('Roll the dice!');
}

function presentOptions() {
  if (gameState.gameOver) return;
  const queue = gameState.rolledQueue;
  const credits = gameState.rollCredits;

  if (queue.length === 0 && credits === 0) {
    endTurn();
    return;
  }

  if (queue.length === 0) {
    setStatus(`${gameState.currentPlayer}, roll the dice!`);
    return;
  }

  // Playable if ANY value or combination of values has a legal move.
  const anyPlayable = allSubsetTotals(queue).some(
    total => getLegalMoves(gameState, total).length > 0
  );

  if (!anyPlayable) {
    if (credits > 0) {
      setStatus(`${gameState.currentPlayer}: no moves yet — roll again!`);
      return; // values stay banked; a new roll may unlock a combination
    }
    setCommentary(
      `No legal moves for ${gameState.currentPlayer}'s remaining values (${queueLabel()}) — burned.`
    );
    queue.length = 0;
    endTurn();
    return;
  }

  // A single value with no rolls left: no combination choice exists.
  if (queue.length === 1 && credits === 0) {
    spendValues([0]);
    return;
  }

  showValueChips();
}

// Value chips: tap to select one or more, then Count them together.
function showValueChips() {
  gameState.awaitingChoice = false;
  pendingMoves = [];
  selectedIndices = new Set();
  renderChips();
  displayCurrentPlayer.textContent =
    `${gameState.currentPlayer}'s values: ${queueLabel()}`;
  setStatus(
    gameState.rollCredits > 0
      ? `${gameState.currentPlayer}: tap value(s) to count together, or roll again`
      : `${gameState.currentPlayer}: tap value(s) to count together`
  );
}

function renderChips() {
  commentRow.innerHTML = '';

  gameState.rolledQueue.forEach((value, i) => {
    const btn = makeButton(`${value}`, () => {
      if (selectedIndices.has(i)) selectedIndices.delete(i);
      else selectedIndices.add(i);
      renderChips();
    });
    if (selectedIndices.has(i)) {
      btn.style.background = 'var(--gold)';
    }
    commentRow.appendChild(btn);
  });

  if (selectedIndices.size > 0) {
    const total = [...selectedIndices].reduce(
      (sum, i) => sum + gameState.rolledQueue[i], 0
    );
    const go = makeButton(`Count ${total} ▶`, () => {
      spendValues([...selectedIndices]);
    });
    go.style.fontWeight = '800';
    commentRow.appendChild(go);
  }
}

function spendValues(indices) {
  spendingIndices = indices;
  const total = indices.reduce((sum, i) => sum + gameState.rolledQueue[i], 0);
  const others = gameState.rolledQueue.filter((_, i) => !indices.includes(i));
  displayCurrentPlayer.textContent =
    `${gameState.currentPlayer} counting ${total}` +
    (others.length ? ` (still banked: ${others.join(', ')})` : '');

  const moves = getLegalMoves(gameState, total);

  if (moves.length === 0) {
    // Nothing burns — the player just recounts with different values.
    setStatus(`No move for a count of ${total} — pick different values.`);
    spendingIndices = null;
    showValueChips();
    return;
  }

  if (moves.length === 1) {
    commentRow.innerHTML = '';
    playMove(moves[0]);
    return;
  }

  highlightChoices(moves, total);
}

// ---- Dice ----

function animateDice() {
  dice.classList.remove('roll-animate');
  void dice.offsetWidth;
  dice.classList.add('roll-animate');
  setTimeout(() => dice.classList.remove('roll-animate'), 500);
}

dice.addEventListener('click', function () {
  if (gameState.gameOver || gameState.isMoving) return;
  if (gameState.awaitingChoice) {
    setStatus(`${gameState.currentPlayer}, finish your move first!`);
    return;
  }
  if (gameState.rollCredits <= 0) {
    if (gameState.rolledQueue.length > 0) {
      setStatus(`${gameState.currentPlayer}: no rolls left — count your values!`);
    }
    return;
  }

  spendingIndices = null;
  doRoll();
});

function doRoll() {
  gameState.rollCredits--;

  const result = Math.trunc(Math.random() * 6) + 1;
  gameState.rolledQueue.push(result);

  animateDice();
  dieDisplay.classList.remove(...diceFaces);
  dieDisplay.classList.add(diceFaces[result - 1]);

  const color = gameState.currentPlayer;
  displayCurrentPlayer.textContent = `${color} rolled: ${queueLabel()}`;

  // google tag analytics
  gtag('event', 'dice_clicked', {
    event_category: 'gameplay',
    event_label: 'user clicked dice',
  });

  if (result === 6) {
    gameState.rollCredits++;
    setCommentary(`A 6! ${color} may count now or roll again 🔥`);
  }

  presentOptions();
}

// ---- Initial render ----
displayCurrentPlayer.textContent = `${gameState.currentPlayer} is starting the game`;
setStatus('Roll the dice!');
updateTurnDisplay();