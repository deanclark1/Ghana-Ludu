'use strict';

/* =========================================================
   Ghana Ludu — UI LAYER (script.js) — STEP 4
   Renders gameState and turns clicks into game actions.
   All rules live in game.js — this file never decides them.

   Flow of a turn (roll banking):
   1. Player rolls. Every 6 banks and they roll again.
   2. First non-6 closes the bank; the queue is spent in order.
   3. For each value: legal moves come from game.js. One option
      auto-plays; several light up gold and the player picks.
   4. Traps resolve on play: bounces walk back, lone-striker
      kicks burn the rest of the queue. No hints, no warnings —
      paying attention IS the game.
   ========================================================= */

// Set to true later if you want a beginner mode that flags kicks.
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
  if (kick.via === 'side') {
    return `SIDE KICK! ${color} jumped tracks onto cell ${kick.cell} and sent ${kick.color} packing 😤`;
  }
  return `${color} kicked ${kick.color} back home! 😈`;
}

// ---- Token selection ----

function highlightChoices(moves) {
  gameState.awaitingChoice = true;
  pendingMoves = moves;

  const byToken = groupMovesByToken(moves);
  for (const [tokenId, tokenMoves] of Object.entries(byToken)) {
    const el = tokenEls[tokenId];
    if (!el) continue;
    el.classList.add('selectable');
    // No red glow unless beginner hints are on: spotting the
    // kick (and the wall) is the player's job.
    if (SHOW_HINTS && tokenMoves.some(m => m.kicks.length > 0)) {
      el.classList.add('selectable-kick');
    }
  }

  setStatus(`${gameState.currentPlayer}, pick a token to move ${gameState.rolledQueue[0]} steps`);
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
function showDirectionChoice(tokenMoves) {
  commentRow.innerHTML = '';
  setStatus('Which way?');

  for (const move of tokenMoves) {
    const btn = document.createElement('button');
    btn.className = 'move-choice';
    const arrow = move.direction === 'forward' ? '➡' : '⬅';
    btn.textContent = `${arrow} ${move.direction} to cell ${move.intendedTo}`;
    btn.addEventListener('click', () => {
      clearChoices();
      playMove(move);
    });
    commentRow.appendChild(btn);
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

// Blocked move: walk up to the wall, then walk back home. Painful
// to watch on purpose.
function animateBounce(move, tokenEl, color, onDone) {
  const outCells = [];
  for (const cell of move.path) {
    if (cell === move.blockedAt) break;
    outCells.push(cell);
  }

  if (outCells.length === 0) {
    // Wall is on the very first step (or a blocked base entry):
    // nowhere to walk, just narrate the bounce.
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

    if (result.queueBurned) {
      setCommentary(`🛑 Lone striker rule! ${color}'s only token kicked — the rest of the combo burns.`);
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

    // This value is spent — move to the next one or end the turn.
    gameState.rolledQueue.shift();
    gameState.isMoving = false;
    processQueue();
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

  // Normal walk; a side-kick swap adds one extra hop across tracks.
  const cells = move.swapTo !== null && move.swapTo !== undefined
    ? [...move.path, move.swapTo]
    : move.path;
  walkCells(tokenEl, cells, color, finish);
}

// ---- Spending the banked queue ----

function endTurn() {
  advanceTurn(gameState);
  updateTurnDisplay();
  displayCurrentPlayer.textContent = `${gameState.currentPlayer}'s turn`;
  setStatus('Roll the dice!');
}

function processQueue() {
  if (gameState.rolledQueue.length === 0) {
    endTurn();
    return;
  }

  const value = gameState.rolledQueue[0];
  const remaining = gameState.rolledQueue.slice(1);
  displayCurrentPlayer.textContent =
    `${gameState.currentPlayer} playing ${value}` +
    (remaining.length ? ` (still banked: ${remaining.join(', ')})` : '');

  const moves = getLegalMoves(gameState, value);

  if (moves.length === 0) {
    setCommentary(`No legal move for the ${value} — value burned.`);
    gameState.rolledQueue.shift();
    processQueue();
    return;
  }

  if (moves.length === 1) {
    playMove(moves[0]);
    return;
  }

  highlightChoices(moves);
}

// ---- Dice ----

function animateDice() {
  dice.classList.remove('roll-animate');
  void dice.offsetWidth;
  dice.classList.add('roll-animate');
  setTimeout(() => dice.classList.remove('roll-animate'), 500);
}

// True while the player is still rolling to grow the combo.
let banking = false;

dice.addEventListener('click', function () {
  if (gameState.gameOver || gameState.isMoving) return;
  if (gameState.awaitingChoice) {
    setStatus(`${gameState.currentPlayer}, pick a glowing token first!`);
    return;
  }
  // Dice only works at the start of a turn or mid-banking —
  // never while the queue is being spent.
  if (gameState.rolledQueue.length > 0 && !banking) return;

  bankRolls();
});

// Banking phase: keep rolling while 6s land, then spend the queue.
function bankRolls() {
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
    banking = true;
    setStatus(`A 6! Banked — roll again to grow the combo 🔥`);
    return;
  }

  banking = false;
  processQueue();
}

// ---- Initial render ----
displayCurrentPlayer.textContent = `${gameState.currentPlayer} is starting the game`;
setStatus('Roll the dice!');
updateTurnDisplay();