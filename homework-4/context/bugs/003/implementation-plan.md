# Bug Context 003 — Reflected XSS via unsanitized player name on the leaderboard (security issue)

## What the issue is

The player-submitted name is rendered into the leaderboard as raw HTML instead of text. A name containing an
HTML/script payload executes in the browser of anyone who views the leaderboard afterward — a stored/reflected
XSS vulnerability (persisted in `leaderboard.json`, executed on every later leaderboard view).

## Where it lives

`src/static/quiz.js`, function `showLeaderboard()`, line 90:

```javascript
leaderboardList.innerHTML += `<li>${entry.name} — ${entry.score}</li>`;   // <-- line 90
```

`entry.name` comes straight from the `GET /api/leaderboard` response — which is exactly what was submitted in
`POST /api/submit`'s `name` field (see `src/app.py`, the `submit()` route: `name = (data.get("name") or
"").strip() or "Anonymous"` — no HTML-escaping or sanitization happens anywhere server-side either). Building
the leaderboard row via `innerHTML` string interpolation means any `<`/`>` in the name is parsed as real HTML
by the browser, not displayed literally.

## How to reproduce

1. Start the app, open `http://localhost:5000`.
2. On the landing screen, enter this as the player name:
   ```
   <img src=x onerror=alert(1)>
   ```
3. Complete the quiz with any answers and submit.
4. Open the leaderboard screen (or navigate to it fresh in a new tab). A JavaScript `alert(1)` fires
   immediately — the payload executed as HTML, not as text.

A non-alerting proof, if preferred: use `<b>test</b>` as the name — it renders **bold** on the leaderboard
instead of showing the literal characters `<b>test</b>`.

## What "fixed" looks like

The player name is inserted as text content, never interpreted as HTML — e.g. build leaderboard `<li>` elements
via `document.createTextNode` / `element.textContent`, or an explicit HTML-escaping helper if `innerHTML`
concatenation is kept for the rest of the row markup. After the fix, submitting the `<img src=x
onerror=alert(1)>` payload and viewing the leaderboard shows the literal text `<img src=x onerror=alert(1)>`
in the list — no alert fires.

## Scope note

No input-length limit, profanity filter, or rate-limiting is in scope — only neutralizing HTML/script
injection in the name field wherever it's displayed. Existing entries already in `leaderboard.json` are
display-only data; no migration of stored data is required, only the render path needs to change. Don't modify
`compute_score` or `sorted_leaderboard` (Bugs 001/002) — unrelated.
