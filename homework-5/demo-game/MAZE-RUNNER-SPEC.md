# Maze Runner — Design Spec

**Status**: approved, ready for implementation
**Location**: `homework-5/demo-game/index.html` (single file, no build step, no external dependencies)
**Purpose**: a small playable demo app, committed to the repo, that serves as a believable stand-in project
for generating realistic Jira bug tickets (Homework 5, Task 3). Not itself a graded homework-5 deliverable.

## Overview

A browser-based maze game. The player picks a difficulty, a random maze is generated, and they navigate from
the start cell to the exit using the keyboard. Move count and elapsed time are tracked and shown on winning.

## Architecture

Everything lives in one `index.html`:
- inline `<style>` for layout/visuals
- inline `<canvas>` element for rendering the maze, player, and HUD overlay text
- inline `<script>` containing: maze generation, game state, input handling, render loop

No frameworks, no bundler, no network requests — opens directly in a browser via `file://` or any static
server.

## Maze generation

**Algorithm**: recursive backtracker (randomized depth-first search).
1. Start from a grid of cells, each with all 4 walls intact.
2. Pick a starting cell (top-left), mark visited, push to a stack.
3. Loop: from the current cell, look at unvisited neighbors. If any exist, pick one at random, knock down
   the wall between current and chosen neighbor, mark it visited, push it, make it current. If none exist,
   pop the stack back to the previous cell.
4. Continue until the stack is empty (all cells visited).

This produces a **perfect maze**: exactly one path between any two cells, no loops, long winding corridors —
reads as "complicated" without needing multi-path complexity or branching logic beyond the algorithm itself.

A new random maze is generated (fresh RNG draws, no fixed seed) whenever:
- the difficulty selector changes, or
- the "New Maze" button is clicked (same difficulty, new layout).

## Difficulty levels

| Difficulty | Grid size |
|---|---|
| Small | 15 × 15 cells |
| Medium | 25 × 25 cells |
| Large | 35 × 35 cells |

Cell pixel size scales down as grid size grows so the maze always fits a fixed canvas viewport (e.g. a
760×760px canvas: Small ≈ 50px/cell, Medium = 30px/cell, Large ≈ 21px/cell).

## Components / state

- **Grid/maze data structure**: 2D array of cells, each storing which of its 4 walls are open (generated
  once per game, immutable during play).
- **Player**: current cell position (row, col). Moves one cell per keypress in the direction of an open
  wall; blocked (no-op) if the wall in that direction is closed.
- **Start cell**: top-left (0,0). **Exit cell**: bottom-right (last row, last col), visually highlighted
  (distinct fill color).
- **HUD**: move counter (increments on every accepted move, including moving through already-visited cells —
  no shortest-path tracking), elapsed timer (starts on the player's first move, stops the instant the exit
  is reached, displayed as `mm:ss`).
- **Win state**: on reaching the exit cell, freeze player input, show an overlay with final move count and
  time, plus a "New Maze" button (regenerates at the same difficulty).

## Controls

- Arrow keys or WASD to move (up/down/left/right by one cell).
- On-screen difficulty selector (radio buttons or a `<select>`): Small / Medium / Large.
- "New Maze" button, always visible, regenerates a fresh maze at the current difficulty and resets move
  count/timer/player position.

## Rendering

- Canvas 2D API. Redraw on every state change (move, win, new maze) — no continuous animation loop needed
  since nothing moves without input (simpler than a physics-based game, adequate for this scope).
- Walls drawn as line segments per cell based on the maze data structure.
- Player drawn as a filled circle/square centered in its current cell.
- Exit cell drawn with a distinct fill color, underneath the wall lines.

## Explicit scope boundary (out of scope)

- No enemies, no fog-of-war/limited visibility, no pathfinding hints/solve button.
- No scoring beyond moves + time; no persistence (leaderboard, localStorage) across reloads.
- No mobile/touch controls, no sound.
- No seeded/reproducible mazes — every generation is fully random.

## Known plausible bug surface

(Recorded here because this list is the intended source of later Jira bug tickets — keeping it honest and
specific rather than padding it.)
- Recursive-backtracker implemented with a bounded/incorrect stack could in theory leave a cell unvisited —
  worth a manual check that every generated maze is fully connected (single connected component) before
  relying on this list.
- Timer not stopping/continuing correctly across a New Maze click while a previous game was still in
  progress.
- Move counter not resetting on New Maze or difficulty change.
- Player position not clamped/reset correctly when switching difficulty mid-game (grid dimensions change
  under an existing player position).
- Off-by-one in wall-collision check allowing the player to move through a corner diagonally adjacent cell
  that isn't actually connected.
- Canvas cell-size scaling producing a maze that doesn't fully fit the viewport at Large difficulty if pixel
  math rounds incorrectly.

## Reuse note

This spec is self-contained and reusable independent of Homework 5 — the maze generation algorithm and
difficulty/state design don't depend on anything MCP- or homework-specific.
