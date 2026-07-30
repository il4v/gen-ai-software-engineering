# Security Report — Bug 002 Fix Review

**Reviewer:** Security Vulnerabilities Verifier
**Date:** 2026-07-30
**Input:** `context/bugs/002/fix-summary.md`
**Files reviewed in full:** `src/app.py` (the only file the summary lists as changed), plus its immediate
attack-surface neighbours read for context: `src/static/quiz.js`, `src/requirements.txt`,
`src/leaderboard.json`.

## Scope and verdict

The literal change is a single line — `src/app.py:39`, adding `reverse=True` to the `sorted()` call in
`sorted_leaderboard`. **That change introduces no new vulnerability of its own:** it adds no user-controlled
data to a sink, no new I/O, no new dependency, and no new comparison of secrets. Ordering of an already-public
list is not a confidentiality boundary, and the top-10 slice at `src/app.py:76` still bounds the response size.

However, per scope rule 2 (read the changed file in full, since a fix can expose a vulnerability in adjacent
code), the review of `src/app.py` surfaced findings below. **One is CRITICAL and is actively made more likely
by this fix's own "Manual Verification" instructions**, which tell the operator to start the app with
`python app.py` — the code path that enables the Werkzeug debugger.

---

## Findings

### 1. CRITICAL — Werkzeug interactive debugger enabled, giving remote code execution

**Location:** `src/app.py:81` — `app.run(debug=True, port=5000)`
**Reached by:** `context/bugs/002/fix-summary.md:28` instructs `cd src && python app.py` as the verification
step, so this is the documented way to run the app.

`debug=True` enables the Werkzeug debugger, which exposes an in-browser Python console on any unhandled
exception. Anyone who can reach port 5000 and trigger a traceback can execute arbitrary Python as the app
user. Several findings below (2, 3, 4) are easy ways for an unauthenticated caller to force exactly such a
traceback, so the two chain into unauthenticated RCE. The debugger PIN is a speed bump, not a control, and the
reloader also re-executes code on file change.

**Remediation:** Do not hardcode `debug=True`. Read it from the environment and default to off, e.g. gate on
`os.environ.get("FLASK_DEBUG") == "1"`, and bind explicitly to `127.0.0.1` for local work. For anything beyond
a laptop, run behind a production WSGI server (gunicorn/waitress) with the debugger unconditionally disabled,
and register a generic error handler that returns a plain 500 instead of a traceback.

---

### 2. HIGH — Missing input validation in `compute_score` allows unauthenticated 500 / denial of service

**Location:** `src/app.py:30-35` (`compute_score`), reached from `src/app.py:61-64` (`submit`)

`answers` comes straight from the request body with no validation of type, length, or element type:

- `answers` longer than `questions` → `questions[i]` raises `IndexError`.
- `answers` a JSON object or string → `len()`/indexing behaves unexpectedly or raises `TypeError`.
- `answers` a non-list scalar (e.g. `5`) → `TypeError` on `len()`.

Each is an unhandled exception: a 500 in production, and the **RCE console from finding 1** in the documented
run mode. It is trivially reachable with a single unauthenticated `POST /api/submit`.

**Remediation:** Validate before scoring — require `answers` to be a `list`, reject when
`len(answers) != len(questions)`, and require every element to be an `int` within
`range(len(questions[i]["choices"]))`. Return `400` with a generic message on failure. Iterate with
`zip(answers, questions)` rather than `range(len(answers))` so the questions list bounds the loop.

---

### 3. HIGH — `request.get_json(force=True)` accepts non-object bodies and bypasses Content-Type checking

**Location:** `src/app.py:59` — `data = request.get_json(force=True)`

Two distinct problems:

1. **Crash on non-dict JSON.** A body of `[]`, `"x"`, or `null` parses fine, then `data.get(...)` at
   `src/app.py:60-61` raises `AttributeError` → unhandled 500 (and again, finding 1's debugger). Malformed
   non-JSON bodies raise a parse error on the same line.
2. **CSRF surface.** `force=True` makes Flask parse the body regardless of `Content-Type`. That removes the
   incidental protection where a cross-origin JSON POST would need a CORS preflight: an attacker page can
   submit a simple-request form/`fetch` with `text/plain` and have it accepted. There is no CSRF token and no
   origin check on this state-changing endpoint. Impact is limited to writing junk leaderboard entries
   attributed to a victim's browser (no session/identity exists to abuse), so this is a real but low-value
   CSRF — the crash path is the more serious half.

**Remediation:** Use `request.get_json(silent=True)` and explicitly `if not isinstance(data, dict): return
jsonify({"error": "invalid body"}), 400`. Require `Content-Type: application/json` (drop `force=True`). If the
app ever gains sessions or authenticated identity, add CSRF protection (e.g. `Flask-WTF`'s `CSRFProtect`, or a
same-site cookie plus an `Origin` allowlist check).

---

### 4. MEDIUM — `sorted_leaderboard` trusts the on-disk record shape (the changed line)

**Location:** `src/app.py:39` (the line changed by this fix), fed by `src/app.py:18-22` / `src/app.py:75`

The sort key `e["score"]` assumes every entry is a dict containing a numeric `score`. If `leaderboard.json` is
ever hand-edited, partially written, or contains mixed types, the key lambda raises `KeyError` or `TypeError`
and `GET /api/leaderboard` returns 500 — a permanently broken endpoint plus, under finding 1, a debugger
console on a purely `GET` request. `json.load` failing on a truncated file (see finding 6) has the same effect
one frame earlier.

Note this is a pre-existing weakness that `reverse=True` neither introduced nor worsened; it is reported
because it is on the changed line and the fix's own verification steps exercise it.

**Remediation:** Defend the read path: wrap `load_leaderboard` in `try/except (json.JSONDecodeError, OSError)`
returning `[]`, and make the sort tolerant, e.g. filter to
`[e for e in entries if isinstance(e, dict) and isinstance(e.get("score"), (int, float))]` before sorting, or
use `key=lambda e: e.get("score", 0)` combined with that type filter.

---

### 5. MEDIUM — Unbounded, unauthenticated writes to `leaderboard.json` (storage exhaustion)

**Location:** `src/app.py:66-68` (`submit`), with `save_leaderboard` at `src/app.py:25-27`

`POST /api/submit` has no authentication, no rate limiting, and no cap on the number of stored entries.
`name` is only `.strip()`ed (`src/app.py:60`) with no length limit, so a single caller can append megabyte-long
names indefinitely. The file is rewritten in full on every submit, so cost grows quadratically with entry
count: disk fills, and `/api/submit` and `/api/leaderboard` both slow to a crawl. The top-10 slice only bounds
the *response*, never the *storage*.

**Remediation:** Truncate `name` to a sane maximum (e.g. `name[:50]`) and reject non-string names. Cap
retention by keeping only the top N entries before writing, e.g. `save_leaderboard(sorted_leaderboard(entries)
[:100])`. Add per-IP rate limiting (`Flask-Limiter`) on `/api/submit`.

---

### 6. LOW — Non-atomic read-modify-write on `leaderboard.json` risks corruption and lost entries

**Location:** `src/app.py:25-27` (`save_leaderboard`), `src/app.py:66-68`

`load` → `append` → `save` is not atomic and holds no lock. Two concurrent submits interleave and one entry is
silently lost. Worse, `open(path, "w")` truncates immediately, so a crash or kill mid-write leaves a truncated
file that then breaks every subsequent `GET /api/leaderboard` (chains into finding 4). This is an integrity
issue rather than a direct compromise, but it is remotely triggerable by concurrent requests.

**Remediation:** Write to a temporary file in the same directory and `os.replace()` it over the target for
atomicity, and serialise the read-modify-write with a `threading.Lock` (or a file lock such as `fcntl.flock`)
around the load/append/save sequence. A small database (SQLite) would remove the class of problem entirely.

---

### 7. LOW — Unpinned dependency permits a silently different Flask/Werkzeug at install time

**Location:** `src/requirements.txt:1` — `flask`

The requirement is completely unconstrained: no version floor, no ceiling, no hashes. Each install resolves to
whatever the index currently serves, so builds are not reproducible, a compromised or yanked release is picked
up automatically, and there is no floor guaranteeing that known Werkzeug advisories are excluded. This fix did
not add or change a dependency — the finding is reported because rule 3 requires checking dependencies
reachable from the change.

**Remediation:** Pin explicitly, e.g. `flask==3.1.2` (and pin `werkzeug` transitively), ideally via a compiled
lockfile with hashes (`pip-compile --generate-hashes`, or `uv lock`). Add a dependency scanner (`pip-audit` or
Dependabot) to CI.

---

## Checked and found clean

Stated explicitly so the absence of a finding is evidence of a check, not of an omission:

- **SQL injection** — no database, no SQL, no ORM anywhere in `src/app.py`. Not applicable.
- **Command injection** — no `subprocess`, `os.system`, `os.popen`, `eval`, `exec`, or shell invocation in the
  changed file.
- **Template injection** — no `render_template_string` and no Jinja rendering of user input; `src/app.py:44`
  serves a static file via `send_static_file`, and responses are `jsonify` only.
- **Log injection** — the application performs no logging of user-controlled values; there is no `logging`
  call to inject into.
- **Path traversal** — `QUESTIONS_PATH` and `LEADERBOARD_PATH` (`src/app.py:6-8`) are built from
  `__file__` with fixed basenames; no request data reaches a filesystem path.
- **Hardcoded secrets / keys / credentials** — none in `src/app.py`, `src/requirements.txt`, or
  `src/leaderboard.json`. No `app.secret_key`, no API tokens, no passwords. `src/leaderboard.json` holds only
  display names and scores.
- **Insecure / non-constant-time comparison of secrets** — the only comparison introduced or touched is the
  score sort key (`src/app.py:39`) and `answers[i] == questions[i]["answer_index"]` (`src/app.py:33`). Neither
  compares a secret, token, MAC, or password, so `hmac.compare_digest` is not required here; quiz answer keys
  are not a timing-attack target of consequence, and the answer key is already withheld from
  `/api/questions` (`src/app.py:50-53`), which correctly projects only `id`, `question`, and `choices` and
  omits `answer_index`.
- **XSS** — the leaderboard `name` field, the one user-controlled string that round-trips through storage, is
  rendered client-side via `textContent` at `src/static/quiz.js:91` (and question/choice text likewise at
  `:44` and `:50`). No `innerHTML` is assigned user data — the two `innerHTML` writes at `:36` and `:88` are
  constant empty strings used to clear containers. Server responses use `jsonify`, which sets
  `application/json` and escapes correctly, so no HTML sink exists. No XSS present.

## Summary

| # | Severity | Location | Issue |
|---|----------|----------|-------|
| 1 | CRITICAL | `src/app.py:81` | Werkzeug debugger enabled → RCE |
| 2 | HIGH | `src/app.py:30-35` | Unvalidated `answers` → unhandled exception / DoS |
| 3 | HIGH | `src/app.py:59` | `get_json(force=True)` → crash on non-dict body; CSRF surface |
| 4 | MEDIUM | `src/app.py:39` | Sort key trusts on-disk record shape → 500 on malformed data |
| 5 | MEDIUM | `src/app.py:66-68` | Unbounded unauthenticated writes → storage exhaustion |
| 6 | LOW | `src/app.py:25-27` | Non-atomic write → corruption / lost entries |
| 7 | LOW | `src/requirements.txt:1` | Unpinned `flask` dependency |

**Attributable to this fix: none.** The `reverse=True` change at `src/app.py:39` is security-neutral. Findings
1-7 are pre-existing conditions in the changed file and its dependency manifest. The priority action is
finding 1, because the fix's own manual-verification instructions direct the operator to launch the app in
debug mode, and findings 2-4 give an unauthenticated caller a one-request path to the resulting console.

No files were modified in the course of this review.
