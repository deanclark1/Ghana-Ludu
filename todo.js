const list = document.getElementById('todo-list');
const input = document.getElementById('new-task');
const addBtn = document.getElementById('add-task');
const clearBtn = document.getElementById('clear-tasks');

// Default feature ideas (shown only if localStorage is empty)
const defaultTasks = [
  'Forward Kick: Land on an opponent while moving forward to kick them out',
  'Back Kick: Land on an opponent counting backward to kick them out',
  'Slide kick: Land on an opponent on their way home to kick them out',
  'Home kick: Land on a parallel cell with opponent to send them home',
  'Implement stacking rule (2+ tokens block path)',
  'Choose which token to move after rolling',
  'Add animation when sending a token home',
  'Add sound effects for dice rolls and kicks',
  'Allow choosing number of players',
  'Add an AI opponent (play with computer)',
  'Online multiplayer (play with friends)'
];

function createTaskElement(text, done = false) {
  const li = document.createElement('li');
  li.textContent = text;
  li.className = `cursor-pointer bg-white px-3 py-2 rounded-md shadow-sm hover:bg-[#eee] ${done ? 'line-through opacity-60' : ''}`;

  li.addEventListener('click', () => {
    li.classList.toggle('line-through');
    li.classList.toggle('opacity-60');
    saveTasks();
  });

  list.appendChild(li);
}

function addTask() {
  const text = input.value.trim();
  if (!text) return;
  createTaskElement(text);
  input.value = '';
  saveTasks();
}

function saveTasks() {
  const tasks = [...list.children].map(li => ({
    text: li.textContent,
    done: li.classList.contains('line-through')
  }));
  localStorage.setItem('luduFeatures', JSON.stringify(tasks));
}

function loadTasks() {
  const saved = JSON.parse(localStorage.getItem('luduFeatures'));
  if (saved && saved.length > 0) {
    saved.forEach(t => createTaskElement(t.text, t.done));
  } else {
    defaultTasks.forEach(t => createTaskElement(t));
    saveTasks();
  }
}

function clearTasks() {
  if (confirm('Clear all tasks?')) {
    localStorage.removeItem('luduFeatures');
    list.innerHTML = '';
    defaultTasks.forEach(t => createTaskElement(t));
    saveTasks();
  }
}

addBtn.addEventListener('click', addTask);
clearBtn.addEventListener('click', clearTasks);
loadTasks();