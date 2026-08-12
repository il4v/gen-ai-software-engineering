# Maze Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-file (`homework-5/demo-game/index.html`) browser maze game: recursive-backtracker
random maze generation, 3 selectable difficulties, keyboard movement, move/time HUD, win overlay.

**Architecture:** One HTML file with inline `<style>`, `<canvas>`, and `<script>`. No build step, no
dependencies, no server. Redraw-on-state-change rendering (no continuous animation loop needed — nothing
moves without a keypress).

**Tech Stack:** Vanilla JS, HTML5 Canvas 2D API.

## Global Constraints

- Single file only: `homework-5/demo-game/index.html` — no separate .js/.css files, no external libraries,
  no network requests (spec: Architecture).
- Perfect maze via recursive backtracker, fresh random generation every time, no seed (spec: Maze generation).
- Difficulty sizes exactly: Small 15×15, Medium 25×25, Large 35×35 (spec: Difficulty levels).
- No enemies, fog-of-war, solve/hint button, persistence, sound, or touch controls (spec: Scope boundary).
- This is a throwaway prop app, not a graded homework-5 deliverable — no automated test suite required;
  verification is manual (open in browser, play through).

---

### Task 1: Maze data structure + recursive-backtracker generation

**Files:**
- Create: `homework-5/demo-game/index.html` (this task adds the `<script>` skeleton + generation logic only;
  no rendering yet — verified via `console.log`/manual inspection in the browser dev console)

**Interfaces:**
- Produces: `generateMaze(cols, rows)` → returns a 2D array `grid[row][col]`, each cell an object
  `{ top: bool, right: bool, bottom: bool, left: bool, visited: bool }` where `true` means "wall present."
  All cells start with all 4 walls `true`; generation clears walls between connected cells.
- Produces: `DIFFICULTIES = { small: {cols:15, rows:15}, medium: {cols:25, rows:25}, large: {cols:35, rows:35} }`
  constant.

- [ ] **Step 1: Create the file skeleton**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Maze Runner</title>
<style>
  body { font-family: sans-serif; background: #1e1e2e; color: #eee; display: flex; flex-direction: column; align-items: center; }
  canvas { background: #000; margin-top: 10px; }
</style>
</head>
<body>
<h1>Maze Runner</h1>
<div id="controls">
  <label>Difficulty:
    <select id="difficulty">
      <option value="small">Small</option>
      <option value="medium" selected>Medium</option>
      <option value="large">Large</option>
    </select>
  </label>
  <button id="newMaze">New Maze</button>
  <span id="hud">Moves: 0 | Time: 00:00</span>
</div>
<canvas id="canvas" width="760" height="760"></canvas>
<script>
const DIFFICULTIES = {
  small:  { cols: 15, rows: 15 },
  medium: { cols: 25, rows: 25 },
  large:  { cols: 35, rows: 35 },
};

function generateMaze(cols, rows) {
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push({ top: true, right: true, bottom: true, left: true, visited: false });
    }
    grid.push(row);
  }

  const stack = [];
  let current = { r: 0, c: 0 };
  grid[0][0].visited = true;
  stack.push(current);

  const dirs = [
    { dr: -1, dc: 0, wall: 'top',    opposite: 'bottom' },
    { dr: 1,  dc: 0, wall: 'bottom', opposite: 'top' },
    { dr: 0,  dc: -1, wall: 'left',  opposite: 'right' },
    { dr: 0,  dc: 1,  wall: 'right', opposite: 'left' },
  ];

  while (stack.length > 0) {
    current = stack[stack.length - 1];
    const unvisited = [];
    for (const d of dirs) {
      const nr = current.r + d.dr;
      const nc = current.c + d.dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !grid[nr][nc].visited) {
        unvisited.push({ r: nr, c: nc, dir: d });
      }
    }
    if (unvisited.length === 0) {
      stack.pop();
      continue;
    }
    const next = unvisited[Math.floor(Math.random() * unvisited.length)];
    grid[current.r][current.c][next.dir.wall] = false;
    grid[next.r][next.c][next.dir.opposite] = false;
    grid[next.r][next.c].visited = true;
    stack.push({ r: next.r, c: next.c });
  }

  return grid;
}
</script>
</body>
</html>
```

- [ ] **Step 2: Verify generation manually**

Open `homework-5/demo-game/index.html` in a browser. Open dev console, run:
```js
const g = generateMaze(15, 15);
console.log(g.length === 15 && g[0].length === 15);
console.log(g.every(row => row.every(cell => typeof cell.top === 'boolean')));
```
Expected: both log `true`. Also spot-check `g[0][0]` has at least one wall `false` (it was connected to a
neighbor during generation) unless the grid is 1x1.

- [ ] **Step 3: Commit**

```bash
git add homework-5/demo-game/index.html
git commit -m "feat: add maze generation (recursive backtracker) to maze runner demo"
```

---

### Task 2: Rendering + difficulty selector + New Maze button

**Files:**
- Modify: `homework-5/demo-game/index.html` (append to the existing `<script>` block from Task 1)

**Interfaces:**
- Consumes: `generateMaze(cols, rows)`, `DIFFICULTIES` from Task 1.
- Produces: `let state = { grid, cols, rows, cellSize, player: {r,c}, moves, startTime, elapsedMs, won }`
  (module-level mutable state later tasks read/write).
- Produces: `newGame(difficultyKey)` — regenerates maze and resets `state`, calls `render()`.
- Produces: `render()` — draws the full canvas: walls, player, exit cell.

- [ ] **Step 1: Add state + newGame + render**

```js
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const CANVAS_SIZE = 760;

let state = null;

function newGame(difficultyKey) {
  const { cols, rows } = DIFFICULTIES[difficultyKey];
  const grid = generateMaze(cols, rows);
  const cellSize = CANVAS_SIZE / Math.max(cols, rows);
  state = {
    grid, cols, rows, cellSize,
    player: { r: 0, c: 0 },
    moves: 0,
    startTime: null,
    elapsedMs: 0,
    won: false,
  };
  document.getElementById('hud').textContent = 'Moves: 0 | Time: 00:00';
  render();
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const { grid, cols, rows, cellSize, player } = state;

  // exit cell highlight
  ctx.fillStyle = '#2e7d32';
  ctx.fillRect((cols - 1) * cellSize, (rows - 1) * cellSize, cellSize, cellSize);

  // walls
  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cellSize;
      const y = r * cellSize;
      const cell = grid[r][c];
      if (cell.top) { ctx.moveTo(x, y); ctx.lineTo(x + cellSize, y); }
      if (cell.left) { ctx.moveTo(x, y); ctx.lineTo(x, y + cellSize); }
      if (cell.right) { ctx.moveTo(x + cellSize, y); ctx.lineTo(x + cellSize, y + cellSize); }
      if (cell.bottom) { ctx.moveTo(x, y + cellSize); ctx.lineTo(x + cellSize, y + cellSize); }
    }
  }
  ctx.stroke();

  // player
  ctx.fillStyle = '#42a5f5';
  const px = player.c * cellSize + cellSize / 2;
  const py = player.r * cellSize + cellSize / 2;
  ctx.beginPath();
  ctx.arc(px, py, cellSize * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

document.getElementById('difficulty').addEventListener('change', (e) => newGame(e.target.value));
document.getElementById('newMaze').addEventListener('click', () => newGame(document.getElementById('difficulty').value));

newGame('medium');
```

- [ ] **Step 2: Verify manually in browser**

Open the file. Expected: a 25×25 maze renders with visible walls, a blue player dot at top-left, a green
exit cell at bottom-right. Switching the difficulty dropdown regenerates a differently-sized maze.
"New Maze" button regenerates a new layout at the same difficulty.

- [ ] **Step 3: Commit**

```bash
git add homework-5/demo-game/index.html
git commit -m "feat: add maze rendering, difficulty selector, and new-maze control"
```

---

### Task 3: Player movement, collision, HUD (moves + timer), win state

**Files:**
- Modify: `homework-5/demo-game/index.html` (append to the existing `<script>` block from Task 2)

**Interfaces:**
- Consumes: `state`, `render()` from Task 2.
- Produces: `tryMove(dr, dc)` — moves the player if no wall blocks the direction, increments `state.moves`,
  starts the timer on first move, checks win condition.
- Produces: `updateHud()` — writes `Moves: N | Time: mm:ss` into `#hud`, called on a `setInterval` tick while
  a game is in progress and not yet won.

- [ ] **Step 1: Add movement + timer + win logic**

```js
const KEY_TO_DELTA = {
  ArrowUp: { dr: -1, dc: 0, wall: 'top' },
  KeyW:    { dr: -1, dc: 0, wall: 'top' },
  ArrowDown: { dr: 1, dc: 0, wall: 'bottom' },
  KeyS:      { dr: 1, dc: 0, wall: 'bottom' },
  ArrowLeft: { dr: 0, dc: -1, wall: 'left' },
  KeyA:      { dr: 0, dc: -1, wall: 'left' },
  ArrowRight: { dr: 0, dc: 1, wall: 'right' },
  KeyD:       { dr: 0, dc: 1, wall: 'right' },
};

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function updateHud() {
  if (!state) return;
  const elapsed = state.won ? state.elapsedMs
    : (state.startTime ? Date.now() - state.startTime : 0);
  document.getElementById('hud').textContent = `Moves: ${state.moves} | Time: ${formatTime(elapsed)}`;
}

function tryMove(dr, dc, wall) {
  if (!state || state.won) return;
  const { grid, player, cols, rows } = state;
  const cell = grid[player.r][player.c];
  if (cell[wall]) return; // wall blocks this direction

  const nr = player.r + dr;
  const nc = player.c + dc;
  if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return;

  if (state.startTime === null) state.startTime = Date.now();

  player.r = nr;
  player.c = nc;
  state.moves++;

  if (player.r === rows - 1 && player.c === cols - 1) {
    state.won = true;
    state.elapsedMs = Date.now() - state.startTime;
    showWinOverlay();
  }

  updateHud();
  render();
}

document.addEventListener('keydown', (e) => {
  const d = KEY_TO_DELTA[e.code];
  if (d) {
    e.preventDefault();
    tryMove(d.dr, d.dc, d.wall);
  }
});

setInterval(updateHud, 250);

function showWinOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'winOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-size:24px;';
  overlay.innerHTML = `
    <div>You reached the exit!</div>
    <div>Moves: ${state.moves} | Time: ${formatTime(state.elapsedMs)}</div>
    <button id="winNewMaze" style="margin-top:16px;font-size:18px;padding:8px 16px;">New Maze</button>
  `;
  document.body.appendChild(overlay);
  document.getElementById('winNewMaze').addEventListener('click', () => {
    overlay.remove();
    newGame(document.getElementById('difficulty').value);
  });
}
```

- [ ] **Step 2: Update `newGame` to clear any existing win overlay**

Modify the `newGame` function from Task 2 by adding this line at the top of the function body (before
generating the maze):

```js
const existingOverlay = document.getElementById('winOverlay');
if (existingOverlay) existingOverlay.remove();
```

- [ ] **Step 3: Verify manually in browser**

Open the file. Move with arrow keys and WASD — player should move only through open walls, moves counter
should increment, timer should start on first move and update every ~250ms. Navigate to the bottom-right
exit cell — win overlay should appear showing final moves/time, and clicking "New Maze" should remove the
overlay and start a fresh maze with moves/timer reset to 0.

- [ ] **Step 4: Commit**

```bash
git add homework-5/demo-game/index.html
git commit -m "feat: add player movement, HUD timer, and win overlay to maze runner demo"
```

---

### Task 4: Manual QA pass against spec's known bug surface

**Files:**
- Modify: `homework-5/demo-game/index.html` only if a real defect is found and fixed during this pass.

No new interfaces — this task is verification against `homework-5/demo-game/MAZE-RUNNER-SPEC.md`'s "Known
plausible bug surface" section.

- [ ] **Step 1: Check maze connectivity**

In the browser console, run a flood-fill from `(0,0)` over the current `state.grid` and confirm it reaches
every cell (no unreachable pockets):
```js
function isFullyConnected(grid) {
  const rows = grid.length, cols = grid[0].length;
  const seen = new Set(['0,0']);
  const stack = [[0,0]];
  while (stack.length) {
    const [r,c] = stack.pop();
    const cell = grid[r][c];
    const neighbors = [
      [!cell.top, r-1, c], [!cell.bottom, r+1, c],
      [!cell.left, r, c-1], [!cell.right, r, c+1],
    ];
    for (const [open, nr, nc] of neighbors) {
      if (open && nr>=0 && nr<rows && nc>=0 && nc<cols && !seen.has(`${nr},${nc}`)) {
        seen.add(`${nr},${nc}`);
        stack.push([nr,nc]);
      }
    }
  }
  return seen.size === rows*cols;
}
console.log(isFullyConnected(state.grid));
```
Expected: `true`. Repeat for a few regenerated mazes at each difficulty. If `false` ever appears, fix the
generation logic in Task 1 before proceeding — this would be a real bug, not a seeded one.

- [ ] **Step 2: Check timer/move-counter reset behavior**

Win a maze, then click "New Maze" from the win overlay. Confirm moves resets to 0 and timer resets to
`00:00` and does not carry over. Also test switching the difficulty dropdown mid-game (before winning) —
confirm the player position, moves, and timer all reset cleanly for the new grid size.

- [ ] **Step 3: Final commit**

```bash
git add homework-5/demo-game/index.html homework-5/demo-game/MAZE-RUNNER-SPEC.md
git commit -m "chore: manual QA pass on maze runner demo"
```
(Only if Step 1 or Step 2 required a code fix — otherwise no commit needed for this task.)
