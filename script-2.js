'use strict';

let dice = document.querySelector(".dice");
const dieDisplay = document.querySelector("i");
// let tokens = document.querySelectorAll(".yellow-tokens .token");
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
    color: "yellow"
  },
  green: {
    tokens: document.querySelectorAll(".green-tokens .token"),
    safeCells: [13, 14, 15, 16, 17],
    startCell: 19,
    color: "green"
  },
  red: {
    tokens: document.querySelectorAll(".red-tokens .token"),
    safeCells: [31, 32, 33, 34, 35],
    startCell: 37,
    color: "red"
  },
  blue: {
    tokens: document.querySelectorAll(".blue-tokens .token"),
    safeCells: [49, 50, 51, 52, 53],
    startCell: 55,
    color: "blue"
  }
};

let currentPlayer = "yellow";
function nextPlayer() {
  const order = ["yellow", "blue", "red", "green"];
  const index = order.indexOf(currentPlayer);
  currentPlayer = order[(index + 1) % order.length];
  console.log(`Next player: ${currentPlayer}`);
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

function moveToken(token, playerName, dieValue) {
  const player = players[playerName];
  const currentPos = token.dataset.position
    ? parseInt(token.dataset.position)
    : 0;

  let newPos = currentPos;

  // First move out of home
  if (currentPos === 0 && dieValue === 6) {
    newPos = player.startCell;
  } 
  // If already on the board
  else if (currentPos > 0) {
    newPos = getNextCellPosition(currentPos, dieValue, playerName);
  } 
  else {
    console.log(`${playerName} needs a 6 to start`);
    return;
  }

  // Update position and move the token
  const targetCell = document.querySelector(`.cell-${newPos}`);
  if (!targetCell) return console.error("Cell not found:", newPos);

  token.dataset.position = newPos;
  targetCell.appendChild(token);
}

function moveTokenToCell(token, cellNumber) {
  const targetCell = cellMap[cellNumber];
  if (!targetCell) return console.error("Cell not found:", cellNumber);
  token.parentElement.removeChild(token);
  targetCell.appendChild(token);

}

dice.addEventListener('click', function () {
  // Generate random number between 1–6
  const result = Math.trunc(Math.random() * 6) + 1;
  console.log(result);

  // Animate dice roll
  animateDice();

  // Update dice face
  dieDisplay.classList.remove(...diceFaces);
  dieDisplay.classList.add(diceFaces[result - 1]);

  const player = players[currentPlayer];
  const token = player.tokens[0]; // you can later pick which token to move

  moveToken(tokens[0], result);
  // Only switch turn if die is not 6
  if (result !== 6) nextPlayer();
  
})


