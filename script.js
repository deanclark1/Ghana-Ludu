'use strict';

let dice = document.querySelector(".dice");
const dieDisplay = document.querySelector("i");
let displayCurrentPlayer = document.querySelector(".display-current-player");
let displayPlayerStatus = document.querySelector(".player-status");
let playerTurn = document.querySelector(".player-turn");
let playerCommentary = document.querySelector(".commentary");

let tokens = document.querySelectorAll(".yellow-tokens .token");
let currentPosition = 0;

const cells = document.querySelectorAll(".cell");
const cellMap = Array.from(cells).reduce((map, cell) => {
  const match = cell.className.match(/cell-(\d+)/);
  if (match) map[parseInt(match[1])] = cell;
  return map;
}, {});

const diceFaces = [
  "fa-dice-one",
  "fa-dice-two",
  "fa-dice-three",
  "fa-dice-four",
  "fa-dice-five",
  "fa-dice-six"
];

const players = {
  yellow: {
    tokens: document.querySelectorAll(".yellow-tokens .token"),
    safeCells: [67, 68, 69, 70, 71],
    startCell: 1,
    color: "#e7c84d",
    name: "yellow",
    retiredCount: 0
  },
  green: {
    tokens: document.querySelectorAll(".green-tokens .token"),
    safeCells: [13, 14, 15, 16, 17],
    startCell: 19,
    color: "#2ecc71",
    name: "green",
    retiredCount: 0
  },
  red: {
    tokens: document.querySelectorAll(".red-tokens .token"),
    safeCells: [31, 32, 33, 34, 35],
    startCell: 37,
    color: "#e74c3c",
    name: "red",
    retiredCount: 0
  },
  blue: {
    tokens: document.querySelectorAll(".blue-tokens .token"),
    safeCells: [49, 50, 51, 52, 53],
    startCell: 55,
    color: "#3498db",
    name: "blue",
    retiredCount: 0
  }
};

let currentPlayer = "yellow";


displayCurrentPlayer.textContent = `${currentPlayer} Is starting the game`;
displayPlayerStatus.textContent = '';

function highlightCurrentPlayer() {
  // Highlight the current player's home
  const homes = document.querySelectorAll(".home");
  homes.forEach(home => home.classList.remove("player--active")); // Remove from all

  const activeHome = document.querySelector(`.${currentPlayer}-home`);
  if (activeHome) {
    activeHome.classList.add("player--active");
  }
}

function nextPlayer() {
  const order = ["yellow", "blue", "red", "green"];
  const index = order.indexOf(currentPlayer);
  currentPlayer = order[(index + 1) % order.length];
  console.log(`Next player: ${currentPlayer}`);
  playerTurn.textContent = currentPlayer;

  highlightCurrentPlayer();
}

function getNextCellPosition(currentCell, steps, currentPlayer) {
  const allSafeZones = Object.entries(players)
    .filter(([name]) => name !== currentPlayer)
    .flatMap(([_, data]) => data.safeCells);

  let newCell = currentCell;
  let moves = steps;

  while (moves > 0) {
    newCell++;

    // If you pass the board max cell, wrap around
    if (newCell > 72) newCell = 1;

    // Skip if it's a safe cell of another player
    if (allSafeZones.includes(newCell)) {
      console.log(`Skipped safe cell ${newCell}`);
      continue;
    }

    moves--;
  }
  console.log(`Next player: ${currentPlayer}`);

  return newCell;
}


const animateDice = function () {
  dice.classList.add("roll-animate");
  
  setTimeout(() => {
    dice.classList.remove("roll-animate");
  }, 500);

  // Remove animation class
  dice.classList.remove("roll-animate");

  // Trigger reflow
  void dice.offsetWidth;

  // Add animation class
  dice.classList.add("roll-animate");
}

function retireToken(token, player) {
  token.classList.remove("active-token", "active-bg");
  token.classList.add("retired");
  
  token.dataset.position = "retired";

  // Track retirement
  player.retiredCount++;
  console.log(`${player.color} has retired ${player.retiredCount} token(s)`);
  playerCommentary.textContent = `${player.name} has retired ${player.retiredCount} token(s) 🎉`;


  // Check win condition
  if (player.retiredCount === 4) {
    playerCommentary.textContent = `🎉 ${player.name.toUpperCase()} wins the game!`;
    console.log(`${player.name.toUpperCase()} wins the game!!!`);
    declareWinner(player.name);
  }

}

function declareWinner(color) {
  const overlay = document.createElement("div");
  overlay.className = "winner-overlay";
  overlay.innerHTML = `
    <h1 style="color:${color}; text-align:center;"> ${color.toUpperCase()} Wins the Game! </h1>
  `;
  document.body.appendChild(overlay);

  // Stop further moves
  dice.removeEventListener("click", handleDiceRoll);
}

function moveToken(token, steps) {

  const player = players[currentPlayer];
  let currentPos = parseInt(token.dataset.position || "0");

  if (currentPos === "retired") {
    console.log(`${player.color} token already retired.`);
    return;
  }



  // If the token is still at home and you roll 6, move to cell 1
  if (currentPos === 0 && steps === 6) {
    currentPos = player.startCell;
    token.dataset.position = currentPos;
    moveTokenToCell(token, currentPos);

    token.classList.add("active-token");
    token.style.background = player.color;
    console.log(`${currentPlayer} moved out to start (cell ${currentPos})`);
  } 
  // If the token is already on board, move forward
  else if (currentPos > 0) {
    const newPos = getNextCellPosition(currentPos, steps, currentPlayer);
    const lastSafeCell = player.safeCells[player.safeCells.length - 1];

    const enteringSafeZone = player.safeCells.includes(newPos);
    console.log(`Is ${currentPlayer} entering safe zone: ${enteringSafeZone}`);

    // ✅ If player is in their safe zone
    if (player.safeCells.includes(currentPos)) {
      const distanceToEnd = lastSafeCell - currentPos;
      if (steps === distanceToEnd + 1) {
        console.log(`${currentPlayer} token retired! 🎉`);
        retireToken(token, player);
        // playerCommentary.textContent = `${currentPlayer} token retired! 🎉`;
        return;
      } else if (steps > distanceToEnd + 1) {
        displayPlayerStatus.textContent = `${currentPlayer} rolled too high (${steps}), cannot move.`;
        return;
      }
    }
    // If a current player's token is stack on top of each other at least 2 stacks, other player's token cannot cross over. only the current player can stack on. others will be stuck till the stack is just one token.
    token.dataset.position = newPos;

    if (currentPos > 72) currentPos = 72; // max limit
    moveTokenToCell(token, newPos);
    token.classList.add("active-token");
    token.style.background = player.color;
    console.log(`${currentPlayer} moved from cell ${currentPos} → ${newPos}`);
  } else {
    console.log("Need a 6 to start!");
  }
}

function moveTokenToCell(token, cellNumber) {
  const targetCell = cellMap[cellNumber];
  
  if (!targetCell) return console.error("Cell not found:", cellNumber);
  
  // Remove token from previous parent
  if (token.parentElement) token.parentElement.removeChild(token);
  targetCell.appendChild(token);

  // Remove old stack classes
  token.classList.remove("stack-1", "stack-2", "stack-3", "stack-4");

  // Stack tokens dynamically
  const tokensInCell = targetCell.querySelectorAll(".token");
  tokensInCell.forEach((t, i) => {
    t.classList.add(`stack-${i + 1}`); // stack-1, stack-2, etc.
  });

}


function handleDiceRoll(result) {
  const player = players[currentPlayer];
  displayCurrentPlayer.textContent = `${currentPlayer} just rolled a ${result}`;

  
  console.log(`${currentPlayer} rolled a ${result}`);


  // Filter tokens that are not retired
  const availableTokens = Array.from(player.tokens).filter(
    t => !t.classList.contains("retired-token")
  );

  if (availableTokens.length === 0) {
    console.log(`${currentPlayer} has no tokens left.`);
    nextPlayer();
    return;
  }

  // Choose which token to move:
  //  - If result = 6 → try to move a token that’s still at home
  //  - Otherwise, move the first one already on board
  let tokenToMove = null;

  if (result === 6) {
    tokenToMove = availableTokens.find(
      t => !t.dataset.position || t.dataset.position === "0"
    );
  }

  if (!tokenToMove) {
    tokenToMove = availableTokens.find(
      t => t.dataset.position && t.dataset.position !== "retired" && parseInt(t.dataset.position) > 0
    );
  }

  if (tokenToMove) {
    moveToken(tokenToMove, result);
  } else {
    console.log(`No movable tokens for ${currentPlayer}. Need a 6 to start.`);
    displayPlayerStatus.textContent = `No movable tokens for ${currentPlayer}. Need a 6 to start.`;
  }

  if (result !== 6) {
    nextPlayer();
  } else {
    displayPlayerStatus.textContent = `${currentPlayer} rolled a ${result}, roll again!`
  }
}
// Todo: Ludu Rules
// 1. Home Kick
// 2. Back Kick
// 3. Forward Kick
// 4. When a current player's token is stack on top at least 2 stacks, other player's token cannot cross over.
// 5. Be able to Select which token to move.

dice.addEventListener('click', function () {
  const result = Math.trunc(Math.random() * 6) + 1;

  // Animate and display dice face
  animateDice();
  dieDisplay.classList.remove(...diceFaces);
  dieDisplay.classList.add(diceFaces[result - 1]);

  // Handle the roll for the current player
  handleDiceRoll(result);
});

