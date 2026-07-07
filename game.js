'use strict';

/* =========================================================
   Ghana Ludu — GAME LOGIC (game.js)
   Implements RULES.md v2 (turn structure + gotcha corrected).
   No DOM code in this file. Design compass: every rule exists
   to prevent tokens from retiring faster.

   Turn structure (corrected):
   - A turn starts with one roll credit. Rolling a 6 grants one
     more. Rolling and counting interleave freely — the player
     may kick with a 6 immediately and take the bonus roll after.

   The Lone Striker gotcha (corrected):
   - A lone active token that kicks and then MOVES AGAIN in the
     same turn has its kick UNDONE — the victim returns to the
     cell it was kicked from. The game does not warn you.
   ========================================================= */

// ---- House rules ----
const CONFIG = {
  backwardMoves: true,        // Ghana-style backward movement
  backwardOnlyToKick: true,   // backward is for hunting only
  mustKick: false,            // spotting kicks is the player's skill
  sideKicks: true,            // slide kicks between parallel cells
  sideKickSwap: true,         // striker slides onto the victim's cell
  homeKicks: true,            // exact-count entry into enemy home lines
  blockades: true,            // 2+ same-colour tokens block opponents
  blockadeBypass: true,       // equal-or-greater counter-wall grants passage
  loneStrikerGotcha: true,    // lone token: kick then move again = kick undone
  optionalKicks: true,        // landing on/beside an opponent offers kick OR no-kick
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

// ---- Parallel cells (slide-kick geometry) ----
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
    rolledQueue: [],   // banked values, spendable in any order
    rollCredits: 1,    // rolls available; each 6 grants one more
    turnKick: null,    // lone-striker kick this turn: { active, tokenId, victims }
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

// Which foreign home line (if any) is this cell part of?
function homeLineOwner(cellNumber, exceptColor) {
  for (const [name, meta] of Object.entries(PLAYERS_META)) {
    if (name !== exceptColor && meta.safeCells.includes(cellNumber)) return name;
  }
  return null;
}

// Size of the strongest enemy wall on a cell (0 = no wall).
function blockadeSizeAgainst(state, cellNumber, movingColor) {
  if (!CONFIG.blockades) return 0;
  const counts = {};
  for (const t of tokensOnCell(state, cellNumber)) {
    counts[t.color] = (counts[t.color] || 0) + 1;
  }
  let size = 0;
  for (const [color, count] of Object.entries(counts)) {
    if (color !== movingColor && count >= 2) size = Math.max(size, count);
  }
  return size;
}

// Opponents kicked by landing on cellNumber.
function kicksAt(state, cellNumber, movingColor) {
  const kicks = [];
  const lineOwner = homeLineOwner(cellNumber, movingColor);

  const occupants = tokensOnCell(state, cellNumber);
  const wall = blockadeSizeAgainst(state, cellNumber, movingColor) > 0;
  if (!wall) {
    for (const victim of occupants) {
      if (victim.color === movingColor) continue;
      kicks.push({ ...victim, via: lineOwner ? 'home' : 'direct' });
    }
  }

  const link = PARALLEL_OF[cellNumber];
  if (CONFIG.sideKicks && link !== undefined) {
    const shielded = tokensOnCell(state, link.middle).length > 0;
    const protectedStack = blockadeSizeAgainst(state, link.cell, movingColor) > 0;
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

function walkCellsPath(startCell, steps, direction, skipCells) {
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

// Normal path: forward skips other players' home lines;
// backward skips ALL home lines (they're forward-entry only).
function computePath(startCell, steps, direction, playerName) {
  const skipCells = Object.entries(PLAYERS_META)
    .filter(([name]) => direction === 'backward' || name !== playerName)
    .flatMap(([, meta]) => meta.safeCells);
  return walkCellsPath(startCell, steps, direction, skipCells);
}

// Home-kick entry path: forward, counting INTO targetColor's line.
function computeEntryPath(startCell, steps, playerName, targetColor) {
  const skipCells = Object.entries(PLAYERS_META)
    .filter(([name]) => name !== playerName && name !== targetColor)
    .flatMap(([, meta]) => meta.safeCells);
  return walkCellsPath(startCell, steps, 'forward', skipCells);
}

// Exit path for a hunter inside a foreign home line: down the line,
// out the entrance, onward along the ring. One continuous count.
function computeExitPath(position, steps, playerName, ownerColor) {
  const ownerSafe = PLAYERS_META[ownerColor].safeCells;
  const entrance = ownerSafe[0] - 1;
  const path = [];
  let cell = position;
  let moves = steps;

  while (moves > 0 && cell > entrance) {
    cell--;
    path.push(cell);
    moves--;
  }
  if (moves > 0) {
    path.push(...computePath(cell, moves, 'forward', playerName));
  }
  return path;
}

// First wall that stops this piece, or null. Includes the BYPASS:
// a wall of N is crossed (never landed on) if the mover has N+
// pieces standing on the cell immediately before it.
function firstBlockadeOnPath(state, startCell, path, movingColor) {
  let prev = startCell;
  for (let i = 0; i < path.length; i++) {
    const cell = path[i];
    const wallSize = blockadeSizeAgainst(state, cell, movingColor);
    if (wallSize > 0) {
      const isLanding = i === path.length - 1;
      const counterWall = tokensOnCell(state, prev)
        .filter(t => t.color === movingColor).length;
      const bypassed =
        CONFIG.blockadeBypass && !isLanding && counterWall >= wallSize;
      if (!bypassed) return cell;
    }
    prev = cell;
  }
  return null;
}

// Build one move object, resolving walls and kicks. Blocked moves
// are still returned — playing one is the trap.
function buildMove(state, token, kind, path, direction, color, extras = {}) {
  const intendedTo = path[path.length - 1];
  const blockedAt = firstBlockadeOnPath(state, token.position, path, color);

  if (blockedAt !== null) {
    return {
      tokenId: token.id,
      kind,
      from: token.position,
      to: token.position,
      intendedTo,
      direction,
      path,
      blocked: true,
      blockedAt,
      swapTo: null,
      kicks: [],
      ...extras,
    };
  }

  const kicks = kicksAt(state, intendedTo, color);
  const sideKick = kicks.find(k => k.via === 'side');
  const swapTo = CONFIG.sideKickSwap && sideKick ? sideKick.swapTo : null;

  return {
    tokenId: token.id,
    kind,
    from: token.position,
    to: swapTo !== null ? swapTo : intendedTo,
    intendedTo,
    direction,
    path,
    blocked: false,
    blockedAt: null,
    swapTo,
    kicks,
    ...extras,
  };
}

// Given a move that carries kicks, produce its no-kick twin: same
// token walking the same path to the same landing cell, but harming
// nobody. For a slide kick, "no kick" also means NOT swapping onto
// the victim's cell — the mover stays on its own landing cell.
function makeNonKickTwin(move) {
  const landing = move.intendedTo; // the mover's own cell, pre-swap
  return {
    ...move,
    to: landing,
    swapTo: null,
    kicks: [],
    declinedKick: true,
  };
}

// Push a move, and if it carries kicks and kicks are optional, also
// push its no-kick twin so the player can choose peace.
function pushWithChoice(moves, move) {
  moves.push(move);
  if (CONFIG.optionalKicks && !move.blocked && move.kicks.length > 0) {
    moves.push(makeNonKickTwin(move));
  }
}

// ---- The heart of the engine ----
function getLegalMoves(state, roll) {
  const color = state.currentPlayer;
  const meta = PLAYERS_META[color];
  const moves = [];

  for (const token of state.players[color].tokens) {
    if (token.retired) continue;

    // Token in base: only a 6 brings it out.
    if (token.position === 0) {
      if (roll === 6) {
        moves.push(buildMove(state, token, 'enter', [meta.startCell], 'forward', color));
      }
      continue;
    }

    // Hunter inside a FOREIGN home line: counting out is its only move.
    const foreignOwner = homeLineOwner(token.position, color);
    if (foreignOwner) {
      const exitPath = computeExitPath(token.position, roll, color, foreignOwner);
      pushWithChoice(
        moves,
        buildMove(state, token, 'move', exitPath, 'forward', color, { exiting: foreignOwner })
      );
      continue;
    }

    // Token in its OWN home line: forward only, exact count to retire.
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
          swapTo: null,
          kicks: [],
        });
      } else if (roll <= distanceToEnd) {
        const path = [];
        for (let i = 1; i <= roll; i++) path.push(token.position + i);
        pushWithChoice(moves, buildMove(state, token, 'move', path, 'forward', color));
      }
      continue;
    }

    // --- Normal ring token ---

    const fwdPath = computePath(token.position, roll, 'forward', color);
    pushWithChoice(moves, buildMove(state, token, 'move', fwdPath, 'forward', color));

    if (CONFIG.backwardMoves) {
      const backPath = computePath(token.position, roll, 'backward', color);
      const backMove = buildMove(state, token, 'move', backPath, 'backward', color);
      const allowed = CONFIG.backwardOnlyToKick
        ? backMove.kicks.length > 0 && !backMove.blocked
        : !backMove.blocked;
      // Backward exists only to hunt, so NO no-kick twin — declining a
      // backward kick just means not making the move.
      if (allowed) moves.push(backMove);
    }

    // Home kicks: exact-count entry into an enemy line, only when the
    // landing cell holds a single kickable enemy piece.
    if (CONFIG.homeKicks) {
      for (const target of Object.keys(PLAYERS_META)) {
        if (target === color) continue;
        const entryPath = computeEntryPath(token.position, roll, color, target);
        const landing = entryPath[entryPath.length - 1];
        if (!PLAYERS_META[target].safeCells.includes(landing)) continue;

        const occupants = tokensOnCell(state, landing);
        const isSingleEnemy =
          occupants.length === 1 && occupants[0].color !== color;
        if (!isSingleEnemy) continue;

        moves.push(
          buildMove(state, token, 'move', entryPath, 'forward', color, {
            homeKick: true,
            hunting: target,
          })
        );
      }
    }
  }

  if (CONFIG.mustKick) {
    const kickMoves = moves.filter(m => m.kicks.length > 0);
    if (kickMoves.length > 0) return kickMoves;
  }

  return moves;
}

// ---- Applying a move: the ONLY place token positions change ----
// Returns what happened so the UI can narrate it. Queue removal is
// handled by the turn flow.
function applyMove(state, move) {
  const token = getToken(state, move.tokenId);
  const color = state.currentPlayer;
  const result = { ...move, kickReverted: false, restored: [] };

  if (move.blocked) {
    // Bounce: piece never left its cell — the gotcha does NOT fire,
    // and any earlier lone-striker kick stands.
    return result;
  }

  // THE GOTCHA: the lone striker kicked earlier this turn and is now
  // moving again — the kick is undone, victims return to their cells.
  // The game never warned you.
  if (
    CONFIG.loneStrikerGotcha &&
    state.turnKick &&
    state.turnKick.active &&
    state.turnKick.tokenId === move.tokenId
  ) {
    for (const victim of state.turnKick.victims) {
      getToken(state, victim.tokenId).position = victim.cell;
      result.restored.push(victim);
    }
    result.kickReverted = true;
    state.turnKick = null;
  }

  // Is THIS move a lone-striker kick? (Entering a new token doesn't
  // count — the rule is about the lone token itself kicking.)
  const loneStrikerKick =
    CONFIG.loneStrikerGotcha &&
    move.kicks.length > 0 &&
    move.kind !== 'enter' &&
    countActiveTokens(state, color) === 1;

  for (const kick of move.kicks) {
    getToken(state, kick.tokenId).position = 0;
  }

  if (move.kind === 'retire') {
    token.retired = true;
  } else {
    token.position = move.to;
  }

  if (loneStrikerKick) {
    state.turnKick = {
      active: true,
      tokenId: move.tokenId,
      victims: move.kicks.map(k => ({ tokenId: k.tokenId, cell: k.cell })),
    };
  }

  if (countRetired(state, color) === 4) {
    state.gameOver = true;
    state.winner = color;
  }

  return result;
}

function advanceTurn(state) {
  state.rolledQueue = [];
  state.rollCredits = 1;
  state.turnKick = null;
  const index = TURN_ORDER.indexOf(state.currentPlayer);
  state.currentPlayer = TURN_ORDER[(index + 1) % TURN_ORDER.length];
  return state.currentPlayer;
}