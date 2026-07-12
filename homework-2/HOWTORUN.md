# ▶️ How to Run — Customer Support Ticket System

Step-by-step guide to get the application running and verify it works. For full feature/architecture docs see `README.md`, `API_REFERENCE.md`, `ARCHITECTURE.md`, `TESTING_GUIDE.md`.

---

## 1. Prerequisites

- **Node.js** 16.x or higher
- **npm** 8.x or higher

Check what you have:
```bash
node -v
npm -v
```

---

## 2. Install

From the `homework-2/` directory:

```bash
cd homework-2
npm install
```

No `.env` file or external services (database, message queue, etc.) are required — the app stores tickets in an in-memory store and needs no configuration to start.

---

## 3. Start the Server

```bash
npm start
```

Expected output:
```
Ticketing API running on http://localhost:3000
UI available at http://localhost:3000
```

Leave this running in one terminal. Open **http://localhost:3000** in a browser to use the UI, or hit the API directly (see step 5).

For active development with auto-restart on file changes, use `npm run dev` instead (requires `nodemon`, already listed in `devDependencies`).

To stop the server: `Ctrl+C` in the terminal running it.

---

## 4. Run the Tests

In a **second terminal** (the server doesn't need to be running for this — tests boot the app in-process):

```bash
cd homework-2
npm test
```

This runs all 8 test suites (77 tests) and prints a coverage table. Expected summary:

```
Test Suites: 8 passed, 8 total
Tests:       77 passed, 77 total

File          | % Stmts | % Branch | % Funcs | % Lines
--------------|---------|----------|---------|--------
All files     |   93.91 |    88.66 |   92.85 |   94.19
```

> ⚠️ **Known flakiness**: `test_performance.test.js` occasionally fails with an off-by-one count (e.g. 999/1000) under system load — a pre-existing timing sensitivity, not a functional regression. If you see a single failure there, re-run `npm test` once before assuming something's broken.

For a browsable, line-by-line coverage report:
```bash
open coverage/lcov-report/index.html      # macOS
xdg-open coverage/lcov-report/index.html  # Linux
```

Other test commands:
```bash
npm run test:watch                                    # watch mode, reruns on save
npx jest tests/test_ticket_api.test.js                 # a single suite
npx jest -t "returns 207"                              # by test-name pattern
```

---

## 5. Verify the API Manually

With the server running (step 3), from a third terminal:

```bash
# Create a ticket
curl -X POST http://localhost:3000/tickets \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cust-123",
    "customer_email": "user@example.com",
    "customer_name": "John Doe",
    "subject": "Cannot login",
    "description": "I cannot access my account after resetting my password",
    "auto_classify": true
  }'
# -> 201 Created, with category/priority/classification_confidence auto-filled

# List all tickets
curl http://localhost:3000/tickets

# Filter by category and priority
curl "http://localhost:3000/tickets?category=account_access&priority=urgent"

# Bulk import the bundled sample data (50 CSV / 20 JSON / 30 XML tickets)
curl -X POST http://localhost:3000/tickets/import -F "file=@sample_data/sample_tickets.csv"
curl -X POST http://localhost:3000/tickets/import -F "file=@sample_data/sample_tickets.json"
curl -X POST http://localhost:3000/tickets/import -F "file=@sample_data/sample_tickets.xml"

# Bulk import a fully-invalid file (expect 400, with a per-row error summary)
curl -i -X POST http://localhost:3000/tickets/import -F "file=@sample_data/invalid/malformed.csv"
```

Full endpoint list with request/response examples and error formats: **`API_REFERENCE.md`**.

---

## 6. Verify the UI Manually

With the server running, open **http://localhost:3000** and:

1. **Tickets tab** — should load the (initially empty) ticket list.
2. **New Ticket tab** — fill in the required fields (Customer ID/Email/Name, Subject, Description), optionally check "Auto-classify on creation", submit → should show a success message and the new ticket in the list.
3. **Import tab** — upload `sample_data/sample_tickets.csv` → should show an "Imported 50 of 50" summary with no errors.
4. Click a row in the ticket list → opens a detail modal. Try **Run Auto-Classify** (shows category/priority/confidence/reasoning) and **Save Status** (change the dropdown, save, confirm it persists).
5. Delete a ticket from the modal → confirms, closes, and removes it from the list.

A full manual QA checklist (including negative/edge cases) is in **`TESTING_GUIDE.md`**.

---

## Troubleshooting

**Port 3000 already in use**
```bash
PORT=3001 npm start
```
(the app reads `process.env.PORT` if set — otherwise defaults to 3000)

**Jest cache acting up / stale test results**
```bash
npx jest --clearCache
npm test
```

**Import returns "Unsupported file format"**
Only `.csv`, `.json`, and `.xml` extensions are recognized (checked by filename, not content-type).

**Import returns 400 for a file you expected to succeed**
Check the response body: `{ errors: [...] }` means one or more rows failed field validation (see the `error` message per row); a bare `{ error: "..." }` (no `errors` array) means the file itself couldn't be read/parsed at all (wrong format, broken syntax, or JSON that isn't a top-level array). See **`API_REFERENCE.md` § Bulk Import Tickets** for the full status-code matrix (200 / 207 / 400).
