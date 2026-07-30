# Security Report — Bug 003 fix review

**Reviewed artifact:** `context/bugs/003/fix-summary.md`
**Primary file changed by this fix:** `src/static/quiz.js` (`showLeaderboard()`, lines 88–93)
**Review date:** 2026-07-30
**Reviewer scope:** read-only review. No files were patched, no code was rewritten.

---

## 1. Verdict on the Bug 003 fix itself

**The reflected/stored XSS is genuinely fixed. No residual XSS finding.**

Verified against the actual working-tree diff (`git diff HEAD -- src/static/quiz.js`), which matches
`fix-summary.md` exactly:

```diff
-    leaderboardList.innerHTML += `<li>${entry.name} — ${entry.score}</li>`;
+    const li = document.createElement("li");
+    li.textContent = `${entry.name} — ${entry.score}`;
+    leaderboardList.appendChild(li);
```

Why this is sound, not just plausible:

- `Node.textContent` assignment never invokes the HTML parser, so `<img src=x onerror=...>`,
  `</li><script>`, and attribute-breaking payloads are all inserted as literal character data.
- The escape is applied at the sink, after the template literal is built, so a payload split across
  `entry.name` and `entry.score` cannot reassemble into markup.
- Non-string `entry.name` / `entry.score` values (from a tampered `leaderboard.json`) are coerced by the
  template literal to strings and still land in `textContent` — no `Symbol.toPrimitive`/`toString`
  trick reaches an HTML context.
- The remaining `leaderboardList.innerHTML = ""` on line 88 is a constant empty string, which is a safe
  use of `innerHTML` (no attacker data flows into it).
- I swept the rest of `src/static/quiz.js` for other injection sinks: the only other DOM writes are
  `questionContainer.innerHTML = ""` (line 36, constant) and `textContent` assignments on lines 44, 51,
  80. There is no `innerHTML +=`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`,
  `new Function`, `setTimeout(string)`, `location`/`href` sink, or `srcdoc` anywhere in the file. No
  second XSS path exists in the changed file.
- `src/static/index.html` is fully static; it contains no server-side template expressions and no
  inline handlers, so nothing there re-opens the hole.

---

## 2. Findings

### HIGH — Unauthenticated 500 on `/api/submit` leaks source code and stack traces via the Werkzeug debugger

- **File:line:** `src/app.py:59–64` (crash sites), amplified by `src/app.py:81` (`debug=True`)
- **Category:** missing input validation → information disclosure (and, with the debugger console,
  potential RCE)
- **Introduced by:** the sibling fix in the same working tree that changed
  `range(len(answers) - 1)` → `range(len(answers))` on `src/app.py:32`. That change removed the
  accidental off-by-one slack that previously absorbed one extra element, so an over-long `answers`
  array now indexes past the end of `questions`.
- **Confirmed by execution** (Flask test client, read-only probe):
  - `POST /api/submit {"name":"x","answers":[0,...×50]}` → **500** (`IndexError` in `compute_score`,
    `src/app.py:33`)
  - `POST /api/submit` with raw body `null` → **500** (`AttributeError: 'NoneType' object has no
    attribute 'get'` at `src/app.py:60`, because `get_json(force=True)` returns `None` for JSON `null`)
- **Why it is a security issue, not just a bug:** the app is started with `app.run(debug=True)`
  (`src/app.py:81`). Any unhandled exception therefore renders the Werkzeug interactive traceback to the
  remote requester — full source snippets, local variable names, absolute filesystem paths, and the
  library versions in use. If the debugger PIN is ever obtained or bypassed (it is derived from
  predictable host data and printed to the console), the same page grants arbitrary Python execution.
  A completely unauthenticated attacker triggers this with a single crafted POST.
- **Remediation:**
  1. Validate the request body before use in `submit()`: reject when `request.get_json(silent=True)`
     is not a `dict`, when `answers` is not a `list`, or when `len(answers) != len(questions)`, and
     return `400` with a generic message instead of raising.
  2. Additionally harden `compute_score` to iterate defensively, e.g. bound the loop by
     `min(len(answers), len(questions))` and compare with an `isinstance(answers[i], int)` guard, so it
     cannot raise regardless of caller.
  3. Never run with `debug=True` outside a trusted local machine — drive it from an env var
     (`app.run(debug=os.environ.get("FLASK_DEBUG") == "1")`) and serve production via a WSGI server with
     `debug` off, plus a `@app.errorhandler(Exception)` that logs internally and returns a generic 500.

### MEDIUM — Unauthenticated, unbounded, unvalidated writes to `leaderboard.json`

- **File:line:** `src/app.py:57–70` (handler), `src/app.py:25–27` (`save_leaderboard`)
- **Category:** missing input validation / resource exhaustion / stored-data integrity
- **Issue:** `/api/submit` requires no authentication, no rate limiting, and no bound on `name` length.
  The `maxlength="40"` on `src/static/index.html:14` is client-side only and trivially bypassed by
  calling the API directly, so `name` may be megabytes of arbitrary text. Every request unconditionally
  appends and rewrites the whole file (`entries.append(...)` then `json.dump`), with no cap on entry
  count and no locking — so concurrent requests can also interleave read-modify-write and corrupt or
  truncate the JSON file. The blast radius is contained (the XSS sink is now safe, and the file is not
  `eval`ed), which is why this is MEDIUM rather than HIGH, but it is a straightforward disk-fill and
  data-integrity DoS.
- **Remediation:** enforce a server-side length cap on `name` (e.g. `name = name[:40]`) and reject
  non-string `name`; cap the persisted list (keep only the top N, e.g. `sorted_leaderboard(entries)[:100]`,
  before writing); write via a temp file + `os.replace` under a lock or `fcntl.flock` for atomicity; and
  add per-IP rate limiting (e.g. `flask-limiter`) on the `POST` route.

### LOW — `/api/submit` is a state-changing POST with no CSRF or origin protection

- **File:line:** `src/app.py:57`
- **Category:** CSRF
- **Issue:** the endpoint mutates server-side state with no CSRF token and no `Origin`/`Referer` check.
  Real impact is limited today because the app has no cookies, sessions, or authentication, so there is
  no ambient authority for an attacker to ride, and `Content-Type: application/json` blocks the
  simple-form cross-origin path. It becomes a genuine CSRF the moment any login or session is added.
- **Remediation:** validate `request.headers.get("Origin")` against an allowlist on state-changing
  routes, and adopt a CSRF token (e.g. `flask-wtf`'s `CSRFProtect`) before introducing sessions or auth.

### LOW — `requirements.txt` pins nothing

- **File:line:** `src/requirements.txt:1` (contents: `flask`)
- **Category:** unsafe / unreproducible dependencies (supply chain)
- **Issue:** an unpinned requirement means any future install silently picks up whatever version is
  current, including a yanked or compromised release, and makes it impossible to audit what is actually
  deployed. Note: the **fix did not add or change any dependency**, and the versions currently installed
  in `src/.venv` are up to date with no known advisories — Flask 3.1.3, Werkzeug 3.1.8, Jinja2 3.1.6,
  MarkupSafe 3.0.3, itsdangerous 2.2.0, click 8.4.2, blinker 1.9.0. So this is hygiene, not an active
  vulnerability.
- **Remediation:** pin with hashes, e.g. generate `requirements.txt` via `pip-compile --generate-hashes`
  (or at minimum `flask==3.1.3`), and add a dependency-audit step (`pip-audit`) to the workflow.

### INFO — Server trusts `answers` as an authoritative score input, but that is by design here

- **File:line:** `src/app.py:61–67`
- **Note:** a client can post any `answers` array to manufacture a leaderboard score; there is no session
  binding a submission to a served quiz. For this trivia app there is nothing of value to protect, so
  this is recorded as informational only. If scores ever matter, issue a server-side quiz session id and
  score only answers submitted against that id.

---

## 3. What I explicitly checked and found clean

| Check | Result |
|---|---|
| XSS in the changed sink (`showLeaderboard`) | **Clean** — `textContent`, parser never invoked |
| Other DOM-XSS sinks in `src/static/quiz.js` | **Clean** — no `innerHTML +=` / `insertAdjacentHTML` / `document.write` / `eval` / `new Function` / string `setTimeout` / URL sinks |
| XSS in `src/static/index.html` | **Clean** — static markup, no template expressions, no inline handlers |
| SQL injection | **N/A** — no database; persistence is `json.load`/`json.dump` |
| Command injection | **Clean** — no `subprocess`, `os.system`, `os.popen`, or shell invocation in `src/app.py` |
| Template injection (SSTI) | **Clean** — no `render_template_string`; only `send_static_file` |
| Log injection | **Clean** — user-controlled `name` is never written to a log or formatted into a log record |
| Path traversal in file handling | **Clean** — `QUESTIONS_PATH` / `LEADERBOARD_PATH` are built from `__file__` with fixed names; no user input reaches a path |
| Hardcoded secrets / keys / credentials | **Clean** — no `SECRET_KEY`, token, password, or API key anywhere in `src/app.py`, `src/static/quiz.js`, or `src/static/index.html` |
| Insecure / non-constant-time comparison of secrets | **N/A** — the only `==` on line 33 compares answer indices, not secrets; no auth or HMAC comparison exists |
| Deserialization of untrusted data | **Clean** — `json.load` only; no `pickle`, `yaml.load`, or `eval` |
| Dependencies introduced by the fix | **None** — frontend-only change; installed versions carry no known advisories |
| Open redirect | **N/A** — no redirect logic |

---

## 4. Disclosure about my own actions

I did not edit, patch, or reformat any source file. However, my read-only verification of the
`/api/submit` edge cases used the Flask test client, and one probe (`answers` as a string, which returns
`200`) caused the handler to append a real entry to `src/static/../leaderboard.json`. As a result
`src/leaderboard.json` now contains one extra row:

```json
{ "name": "x", "score": 0 }
```

I deliberately did not remove it, because my mandate is to modify no files. Please delete that single
entry from `src/leaderboard.json` before committing. (Its presence is itself incidental evidence of the
MEDIUM finding above: an unauthenticated caller can write arbitrary rows into the leaderboard store.)

---

## 5. Summary

| Severity | Count | Findings |
|---|---|---|
| CRITICAL | 0 | — |
| HIGH | 1 | Unauth 500 → Werkzeug debugger source/traceback disclosure (`src/app.py:59–64`, `:81`) |
| MEDIUM | 1 | Unbounded, unvalidated, non-atomic writes to `leaderboard.json` (`src/app.py:57–70`) |
| LOW | 2 | Missing CSRF/origin check; unpinned dependencies |
| INFO | 1 | Client-authoritative scoring (by design) |

**The Bug 003 XSS fix is correct and complete, and introduced no new vulnerability.** The HIGH finding
is not in the Bug 003 change but in code adjacent to it in the same uncommitted working tree — the
`compute_score` loop-bound change — and should be addressed before this branch is merged.
