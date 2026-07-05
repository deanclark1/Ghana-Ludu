'use strict';

/* =========================================================
   Ghana Ludu — GAME LOGIC (game.js) — STEP 4
   No DOM code in this file. Everything reads/writes gameState.

   The street rules, as played:
   - ROLL BANKING: every 6 banks and you roll again; the combo
     queue is spent value by value once a non-6 lands
   - BLOCKADE: 2+ same-color tokens are a wall. Any opponent
     move that would pass OVER it or land ON it bounces back
     to where it started counting from — value wasted
   - SIDE KICK SWAP: kick an opponent on the parallel cell and
     your striker jumps tracks onto their spot
   - SAFE COLUMNS ARE UNTOUCHABLE: no kicks in or out of them
   - LONE STRIKER RULE: exactly one active token + a combo
     queue — the moment it kicks, the rest of the queue burns
   - PAY ATTENTION: the engine offers ALL moves, including
     traps. Nothing is forced, nothing is flagged. Spotting
     the kick (and the wall) is the player's job.
   ========================================================= */

// ---- House rules ----
const CONFIG = {
  backwardMoves: true,        // Ghana-style backward movement
  backwardOnlyToKick: true,   // backward is for hunting only
  mustKick: false,            // OFF: spotting kicks is the skill of the game
  sideKicks: true,            // parallel-cell kicks
  sideKickSwap: true,         // striker takes the victim's cell
  blockades: true,            // 2+ same-color tokens block opponents
};

// ---- Static board facts ----
const PLAYERS_META = {
  yellow: { startCell: 1,  safeCells: [67, 68, 69, 70, 71], color: '#e7c84d' },
  green:  { startCell: 19, safeCells: [13, 14, 15, 16, 17], color: '#2ecc71' },
  red:    { startCell: 37, safeCells: [31, 32, 33, 34, 35], color: '#e74c3c' },
  blue:   { startCell: 55, safeCells: [49, 50, 51, 52, 53], color: '#3498db' },
};

const TURN_ORDER = ['yellow', 'blue', 'red', 'green'];
const MAX_CELL = 72;

// ---- Parallel cells (side-kick geometry) ----
// Each row of a board arm is [outer, MIDDLE, outer], read straight
// from the board grid in index.html. Side kicks fire between the
// two OUTER cells — but only with a clear line of sight: any token
// standing on the middle cell shields the kick.
// Safe columns themselves stay untouchable (kicks never target the
// middle lane).
const PARALLEL_GROUPS = [
  // Yellow arm (bottom)
  [5, 71, 60], [4, 70, 61], [3, 69, 62], [2, 68, 63], [1, 67, 64], [72, 66, 65],
  // Red arm (top)
  [29, 30, 36], [28, 31, 37], [27, 32, 38], [26, 33, 39], [25, 34, 40], [24, 35, 41],
  // Green arm (left)
  [18, 12, 11], [19, 13, 10], [20, 14, 9], [21, 15, 8], [22, 16, 7], [23, 17, 6],
  // Blue arm (right)
  [42, 53, 59], [43, 52, 58], [44, 51, 57], [45, 50, 56], [46, 49, 55], [47, 48, 54],
];

// outer cell -> { cell: the opposite outer cell, middle: the shield cell }
const PARALLEL_OF = {};
for (const [a, middle, b] of PARALLEL_GROUPS) {
  PARALLEL_OF[a] = { cell: b, middle };
  PARALLEL_OF[b] = { cell: a, middle };
}

// ---- The single source of truth ----
function createGameState() {
  const players = {};
  for (const color of Object.keys(PLAYERS_META)) {
    players[color] = {
      tokens: [1, 2, 3, 4].map(n => ({
        id: `${color}-${n}`,
        position: 0,      // 0 = still in base
        retired: false,
      })),
    };
  }
  return {
    currentPlayer: 'yellow',
    rolledQueue: [],        // banked combo values, spent in order
    isMoving: false,
    awaitingChoice: false,
    gameOver: false,
    winner: null,
    players,
  };
}

// ---- Queries (read state, never change it) ----

function getToken(state, tokenId) {
  const color = tokenId.split('-')[0];
  return state.players[color].tokens.find(t => t.id === tokenId);
}

function tokensOnCell(state, cellNumber) {
  const result = [];
  for (const [color, player] of Object.entries(state.players)) {
    for (const token of player.tokens) {
      if (!token.retired && token.position === cellNumber) {
        result.push({ color, tokenId: token.id, cell: cellNumber });
      }
    }
  }
  return result;
}

function countActiveTokens(state, color) {
  return state.players[color].tokens.filter(t => t.position > 0 && !t.retired).length;
}

function countRetired(state, color) {
  return state.players[color].tokens.filter(t => t.retired).length;
}

// A cell is a blockade against `movingColor` if any OTHER single
// color has 2+ tokens standing on it.
function isBlockadeAgainst(state, cellNumber, movingColor) {
  if (!CONFIG.blockades) return false;
  const counts = {};
  for (const t of tokensOnCell(state, cellNumber)) {
    counts[t.color] = (counts[t.color] || 0) + 1;
  }
  return Object.entries(counts).some(
    ([color, count]) => color !== movingColor && count >= 2
  );
}

// Opponents you kick by landing on cellNumber.
// Stacks are untouchable: a victim protected by a 2+ stack of its
// own color is skipped. Side-kick victims come with the swap cell.
function kicksAt(state, cellNumber, movingColor) {
  const kicks = [];

  for (const victim of tokensOnCell(state, cellNumber)) {
    if (victim.color === movingColor) continue;
    kicks.push({ ...victim, via: 'direct' });
  }

  const link = PARALLEL_OF[cellNumber];
  if (CONFIG.sideKicks && link !== undefined) {
    // Line of sight: ANY token on the middle cell (any color,
    // including your own) shields the parallel kick.
    const shielded = tokensOnCell(state, link.middle).length > 0;
    const protectedStack = isBlockadeAgainst(state, link.cell, movingColor);
    if (!shielded && !protectedStack) {
      for (const victim of tokensOnCell(state, link.cell)) {
        if (victim.color === movingColor) continue;
        kicks.push({ ...victim, via: 'side', swapTo: link.cell });
      }
    }
  }

  return kicks;
}

// ---- Movement math ----

// Forward: skips OTHER players' safe columns.
// Backward: skips ALL safe columns (forward-entry only).
function computePath(startCell, steps, direction, playerName) {
  const skipCells = Object.entries(PLAYERS_META)
    .filter(([name]) => direction === 'backward' || name !== playerName)
    .flatMap(([, meta]) => meta.safeCells);

  const step = direction === 'forward' ? 1 : -1;
  const path = [];
  let cell = startCell;
  let moves = steps;

  while (moves > 0) {
    cell += step;
    if (cell > MAX_CELL) cell = 1;
    if (cell < 1) cell = MAX_CELL;
    if (skipCells.includes(cell)) continue;
    path.push(cell);
    moves--;
  }
  return path;
}

// First blockade cell along a path, or null if the way is clear.
// Passing over AND landing on a wall both count — untouchable.
function firstBlockadeOnPath(state, path, movingColor) {
  for (const cell of path) {
    if (isBlockadeAgainst(state, cell, movingColor)) return cell;
  }
  return null;
}

// Build one move object from a computed path, resolving blockades
// and kicks. Blocked moves are still returned — playing one is the
// trap: the token stays where it started and the value burns.
function buildMove(state, token, kind, path, direction, color) {
  const intendedTo = path[path.length - 1];
  const blockedAt = firstBlockadeOnPath(state, path, color);

  if (blockedAt !== null) {
    return {
      tokenId: token.id,
      kind,
      from: token.position,
      to: token.position,     // bounces back — goes nowhere
      intendedTo,             // what the player THOUGHT would happen
      direction,
      path,
      blocked: true,
      blockedAt,
      kicks: [],
    };
  }

  const kicks = kicksAt(state, intendedTo, color);
  const sideKick = kicks.find(k => k.via === 'side');
  const swapTo = CONFIG.sideKickSwap && sideKick ? sideKick.swapTo : null;

  return {
    tokenId: token.id,
    kind,
    from: token.position,
    to: swapTo !== null ? swapTo : intendedTo,  // swap jumps tracks
    intendedTo,
    direction,
    path,
    blocked: false,
    blockedAt: null,
    swapTo,
    kicks,
  };
}

// ---- The heart of the engine ----
// Every playable option for this roll value, traps included.
function getLegalMoves(state, roll) {
  const color = state.currentPlayer;
  const meta = PLAYERS_META[color];
  const moves = [];

  for (const token of state.players[color].tokens) {
    if (token.retired) continue;

    // Token still in base: only a 6 brings it out.
    // A stack camped on your start cell bounces you back to base.
    if (token.position === 0) {
      if (roll === 6) {
        moves.push(buildMove(state, token, 'enter', [meta.startCell], 'forward', color));
      }
      continue;
    }

    // Token in its own safe column: forward only, exact count to
    // retire, no kicks possible (untouchable territory).
    if (meta.safeCells.includes(token.position)) {
      const lastSafe = meta.safeCells[meta.safeCells.length - 1];
      const distanceToEnd = lastSafe - token.position;

      if (roll === distanceToEnd + 1) {
        moves.push({
          tokenId: token.id,
          kind: 'retire',
          from: token.position,
          to: 'retired',
          intendedTo: 'retired',
          direction: 'forward',
          path: [],
          blocked: false,
          blockedAt: null,
          kicks: [],
        });
      } else if (roll <= distanceToEnd) {
        const path = [];
        for (let i = 1; i <= roll; i++) path.push(token.position + i);
        moves.push({
          tokenId: token.id,
          kind: 'move',
          from: token.position,
          to: token.position + roll,
          intendedTo: token.position + roll,
          direction: 'forward',
          path,
          blocked: false,
          blockedAt: null,
          kicks: [],
        });
      }
      continue;
    }

    // --- Normal ring token ---

    const fwdPath = computePath(token.position, roll, 'forward', color);
    moves.push(buildMove(state, token, 'move', fwdPath, 'forward', color));

    // Backward exists only to hunt: a blocked backward move can't
    // kick, so it isn't offered at all.
    if (CONFIG.backwardMoves) {
      const backPath = computePath(token.position, roll, 'backward', color);
      const backMove = buildMove(state, token, 'move', backPath, 'backward', color);
      const allowed = CONFIG.backwardOnlyToKick
        ? backMove.kicks.length > 0 && !backMove.blocked
        : !backMove.blocked;
      if (allowed) moves.push(backMove);
    }
  }

  // (mustKick is OFF for this house: all moves offered, none forced.)
  if (CONFIG.mustKick) {
    const kickMoves = moves.filter(m => m.kicks.length > 0);
    if (kickMoves.length > 0) return kickMoves;
  }

  return moves;
}

// ---- Applying a move: the ONLY place token positions change ----
// Returns what happened so the UI can narrate it.
function applyMove(state, move) {
  const token = getToken(state, move.tokenId);
  const color = state.currentPlayer;

  // Lone Striker Rule: exactly one active token, and it kicks,
  // while combo values remain — the rest of the queue burns.
  const loneStriker =
    move.kicks.length > 0 &&
    countActiveTokens(state, color) === 1 &&
    state.rolledQueue.length > 1;

  if (move.blocked) {
    // Bounce: token stays put, value is wasted.
    return { ...move, queueBurned: false };
  }

  for (const kick of move.kicks) {
    getToken(state, kick.tokenId).position = 0;
  }

  if (move.kind === 'retire') {
    token.retired = true;
  } else {
    token.position = move.to; // already the swap cell if side-kicking
  }

  if (loneStriker) {
    state.rolledQueue = state.rolledQueue.slice(0, 1); // only the value being spent survives
  }

  if (countRetired(state, color) === 4) {
    state.gameOver = true;
    state.winner = color;
  }

  return { ...move, queueBurned: loneStriker };
}

function advanceTurn(state) {
  state.rolledQueue = [];
  const index = TURN_ORDER.indexOf(state.currentPlayer);
  state.currentPlayer = TURN_ORDER[(index + 1) % TURN_ORDER.length];
  return state.currentPlayer;
}