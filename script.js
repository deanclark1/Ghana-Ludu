'use strict';

let dice = document.querySelector(".dice");
const dieDisplay = document.querySelector("i");
let tokens = document.querySelectorAll(".yellow-tokens .token");
const cell1 = document.querySelector(".cell-37");


const diceFaces = [
  "fa-dice-one",
  "fa-dice-two",
  "fa-dice-three",
  "fa-dice-four",
  "fa-dice-five",
  "fa-dice-six"
];

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
function moveTokenToStart(token, cell) {
  // Remove token from its current parent
  if (!token || !cell) {
    console.error("Token or cell not found");
    return;
  }

  token.parentElement?.removeChild(token);
  cell.appendChild(token);

  // Append it to the new cell
  cell.appendChild(token);

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
  
  if (result === 6) {
    console.log("Token:", tokens[0]);
    console.log("Cell1:", cell1);
    moveTokenToStart(tokens[0], cell1);
    tokens[0].classList.add("active-token");
    tokens[0].classList.add("active-bg")
  }
})


