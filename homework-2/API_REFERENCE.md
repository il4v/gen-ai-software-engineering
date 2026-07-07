# 📖 API Reference — Customer Support Ticket System

> **Audience**: API Consumers (frontend developers, integrators, QA automation)
> **Base URL**: `http://localhost:3000`
> **Content-Type**: `application/json` (unless otherwise noted)

---

## 📑 Table of Contents

- [Data Models](#-data-models)
- [Endpoints](#-endpoints)
  - [Create Ticket](#1-create-a-ticket)
  - [List Tickets](#2-list-tickets)
  - [Get Ticket by ID](#3-get-a-single-ticket)
  - [Update Ticket](#4-update-a-ticket)
  - [Delete Ticket](#5-delete-a-ticket)
  - [Bulk Import](#6-bulk-import-tickets)
  - [Auto-Classify](#7-auto-classify-a-ticket)
- [Error Response Format](#-error-response-format)
- [HTTP Status Codes](#-http-status-codes-used)

---

## 📦 Data Models

### Ticket Object

```json
{
  "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
  "customer_id": "cust-123",
  "customer_email": "user@example.com",
  "customer_name": "John Doe",
  "subject": "Cannot login",
  "description": "I cannot access my account after resetting my password",
  "category": "account_access",
  "priority": "high",
  "status": "new",
  "created_at": "2026-07-06T10:15:30.000Z",
  "updated_at": "2026-07-06T10:15:30.000Z",
  "resolved_at": null,
  "assigned_to": null,
  "tags": ["account", "urgent"],
  "metadata": {
    "source": "web_form",
    "browser": "Chrome",
    "device_type": "desktop"
  },
  "manually_classified": false,
  "classification_confidence": null
}
```

### Field Reference

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | UUID | server-generated | Returned by the API, not accepted on input |
| `customer_id` | string | ✅ | Non-empty |
| `customer_email` | string (email) | ✅ | Must match a valid email pattern |
| `customer_name` | string | ✅ | Non-empty |
| `subject` | string | ✅ | 1–200 characters |
| `description` | string | ✅ | 10–2000 characters |
| `category` | enum | optional | `account_access` \| `technical_issue` \| `billing_question` \| `feature_request` \| `bug_report` \| `other` |
| `priority` | enum | optional | `urgent` \| `high` \| `medium` \| `low` |
| `status` | enum | optional (default `new`) | `new` \| `in_progress` \| `waiting_customer` \| `resolved` \| `closed` |
| `tags` | string[] | optional | Defaults to `[]` |
| `metadata.source` | enum | optional | `web_form` \| `email` \| `api` \| `chat` \| `phone` |
| `metadata.browser` | string | optional | Free text |
| `metadata.device_type` | enum | optional | `desktop` \| `mobile` \| `tablet` |
| `auto_classify` | boolean | optional, input-only | If `true`, runs classification immediately on create/import |
| `classification_confidence` | number (0–1) | server-generated | Set only when auto-classification has run |
| `manually_classified` | boolean | server-generated | `true` once a human overrides `category`/`priority` via `PUT` |

---

## 🔌 Endpoints

### 1. Create a Ticket

Creates a single ticket.

```
POST /tickets
```

**Request Body**

```json
{
  "customer_id": "cust-123",
  "customer_email": "user@example.com",
  "customer_name": "John Doe",
  "subject": "Cannot login",
  "description": "I cannot access my account after resetting my password",
  "auto_classify": true
}
```

**Success Response — `201 Created`**

```json
{
  "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
  "customer_id": "cust-123",
  "customer_email": "user@example.com",
  "customer_name": "John Doe",
  "subject": "Cannot login",
  "description": "I cannot access my account after resetting my password",
  "category": "account_access",
  "priority": "medium",
  "status": "new",
  "created_at": "2026-07-06T10:15:30.000Z",
  "updated_at": "2026-07-06T10:15:30.000Z",
  "resolved_at": null,
  "assigned_to": null,
  "tags": [],
  "metadata": { "source": null, "browser": null, "device_type": null },
  "manually_classified": false,
  "classification_confidence": 0.57
}
```

**Error Response — `400 Bad Request`**

```json
{
  "errors": [
    "customer_email must be a valid email address",
    "description must be 10-2000 characters"
  ]
}
```

**cURL**

```bash
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
```

---

### 2. List Tickets

Returns all tickets, optionally filtered.

```
GET /tickets
```

**Query Parameters** (all optional, combinable)

| Param | Type | Example |
|-------|------|---------|
| `category` | enum | `account_access` |
| `priority` | enum | `urgent` |
| `status` | enum | `in_progress` |

**Success Response — `200 OK`**

```json
[
  {
    "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
    "customer_id": "cust-123",
    "subject": "Cannot login",
    "category": "account_access",
    "priority": "urgent",
    "status": "new",
    "...": "..."
  }
]
```

An empty result set returns `200 OK` with `[]` — never a `404`.

**cURL**

```bash
# All tickets
curl http://localhost:3000/tickets

# Filtered by category, priority, and status combined
curl "http://localhost:3000/tickets?category=account_access&priority=urgent&status=new"
```

---

### 3. Get a Single Ticket

```
GET /tickets/:id
```

**Success Response — `200 OK`**

```json
{
  "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
  "customer_id": "cust-123",
  "customer_email": "user@example.com",
  "customer_name": "John Doe",
  "subject": "Cannot login",
  "description": "I cannot access my account after resetting my password",
  "category": "account_access",
  "priority": "urgent",
  "status": "new",
  "created_at": "2026-07-06T10:15:30.000Z",
  "updated_at": "2026-07-06T10:15:30.000Z",
  "resolved_at": null,
  "assigned_to": null,
  "tags": [],
  "metadata": { "source": null, "browser": null, "device_type": null },
  "manually_classified": false,
  "classification_confidence": null
}
```

**Error Response — `404 Not Found`**

```json
{ "error": "Ticket not found" }
```

**cURL**

```bash
curl http://localhost:3000/tickets/d290f1ee-6c54-4b01-90e6-d701748f0851
```

---

### 4. Update a Ticket

Full replacement update (not a patch) — send the complete ticket body.

```
PUT /tickets/:id
```

**Request Body**

```json
{
  "customer_id": "cust-123",
  "customer_email": "user@example.com",
  "customer_name": "John Doe",
  "subject": "Cannot login",
  "description": "I cannot access my account after resetting my password",
  "category": "account_access",
  "priority": "urgent",
  "status": "resolved",
  "assigned_to": "support_agent_1"
}
```

**Behavior notes**

- Setting `status` to `resolved` for the first time stamps `resolved_at` with the current time.
- Moving away from `resolved`/`closed` clears `resolved_at` back to `null`.
- `manually_classified` is **recomputed on every `PUT`**, not stored cumulatively: it is set to `true` only if *this specific request* changes `category` and/or `priority` away from what is currently stored, and `classification_confidence` is reset to `null` in that same request. **This is a deliberate design choice** — a human override should suppress the next `auto-classify` call from silently overwriting it.
- Because the flag is recomputed rather than persisted, it is **not sticky across requests**: if a later `PUT` is sent with `category`/`priority` matching the ticket's *current* values (i.e. a no-op from the classifier's perspective), `manually_classified` flips back to `false` and the ticket becomes eligible for `auto-classify` again. In other words, the lock only holds until the next update that doesn't itself change `category`/`priority`. There is no separate "unlock" endpoint — this recompute-on-every-PUT behavior is the only mechanism.

**Success Response — `200 OK`**

```json
{
  "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
  "customer_id": "cust-123",
  "customer_email": "user@example.com",
  "customer_name": "John Doe",
  "subject": "Cannot login",
  "description": "I cannot access my account after resetting my password",
  "category": "account_access",
  "priority": "urgent",
  "status": "resolved",
  "created_at": "2026-07-06T10:15:30.000Z",
  "updated_at": "2026-07-06T10:20:11.000Z",
  "resolved_at": "2026-07-06T10:20:11.000Z",
  "assigned_to": "support_agent_1",
  "tags": [],
  "metadata": { "source": null, "browser": null, "device_type": null },
  "manually_classified": true,
  "classification_confidence": null
}
```

**Error Responses**

`404 Not Found`
```json
{ "error": "Ticket not found" }
```

`400 Bad Request`
```json
{ "errors": ["subject must be 1-200 characters"] }
```

**cURL**

```bash
curl -X PUT http://localhost:3000/tickets/d290f1ee-6c54-4b01-90e6-d701748f0851 \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cust-123",
    "customer_email": "user@example.com",
    "customer_name": "John Doe",
    "subject": "Cannot login",
    "description": "I cannot access my account after resetting my password",
    "status": "resolved",
    "assigned_to": "support_agent_1"
  }'
```

---

### 5. Delete a Ticket

```
DELETE /tickets/:id
```

**Success Response — `204 No Content`**

No response body.

**Error Response — `404 Not Found`**

```json
{ "error": "Ticket not found" }
```

**cURL**

```bash
curl -X DELETE http://localhost:3000/tickets/d290f1ee-6c54-4b01-90e6-d701748f0851 -i
```

---

### 6. Bulk Import Tickets

Imports tickets from a CSV, JSON, or XML file. `multipart/form-data` upload, field name **must** be `file`.

```
POST /tickets/import
```

**Format detection**: by file extension (`.csv`, `.json`, `.xml`). File size limit: 10 MB.

**Format-specific notes**

- **CSV**: first row is the header. `tags` is a `|`-delimited string (e.g. `urgent|account`). Metadata columns are flattened as `metadata_source`, `metadata_browser`, `metadata_device_type`.
- **JSON**: body must be a top-level array of ticket objects.
- **XML**: root element `<tickets>`, each ticket in a `<ticket>` element; tags nested as `<tags><tag>...</tag></tags>`.

The response status reflects the outcome of the row-by-row validation, not just whether the file was readable:

| Status | Condition | Meaning |
|--------|-----------|---------|
| `200 OK` | `failed === 0` | Every row imported successfully (includes an empty file: `total: 0`) |
| `207 Multi-Status` | `successful > 0 && failed > 0` | Some rows imported, some failed validation |
| `400 Bad Request` | `total > 0 && successful === 0` | Every row failed validation |

**Success Response — `200 OK`** (all rows valid)

```json
{
  "total": 2,
  "successful": 2,
  "failed": 0,
  "errors": []
}
```

**Partial Success Response — `207 Multi-Status`** (some rows invalid)

```json
{
  "total": 3,
  "successful": 2,
  "failed": 1,
  "errors": [
    { "row": 2, "error": "customer_email must be a valid email address" }
  ]
}
```

**Total Failure Response — `400 Bad Request`** (every row invalid)

```json
{
  "total": 2,
  "successful": 0,
  "failed": 2,
  "errors": [
    { "row": 1, "error": "customer_email must be a valid email address" },
    { "row": 2, "error": "subject is required" }
  ]
}
```

**Error Response — `400 Bad Request`** (no file attached)

```json
{ "error": "No file uploaded" }
```

**Error Response — `400 Bad Request`** (unsupported extension)

```json
{ "error": "Unsupported file format: .txt" }
```

**Error Response — `400 Bad Request`** (file present but unparsable)

```json
{ "error": "Failed to parse CSV: Invalid Record Length: columns length is 5, got 4 on line 3" }
```

> ⚠️ Note both a total-validation-failure and a malformed/unreadable file return `400`, but with different body shapes — a validation failure returns the full `{ total, successful, failed, errors }` summary, while an unreadable file or bad upload returns `{ error: "..." }`. Check for the `errors` array (plural) vs. `error` (singular) to distinguish them programmatically.

**cURL**

```bash
# CSV
curl -X POST http://localhost:3000/tickets/import \
  -F "file=@tests/fixtures/sample_tickets.csv"

# JSON
curl -X POST http://localhost:3000/tickets/import \
  -F "file=@tests/fixtures/sample_tickets.json"

# XML
curl -X POST http://localhost:3000/tickets/import \
  -F "file=@tests/fixtures/sample_tickets.xml"
```

---

### 7. Auto-Classify a Ticket

Runs keyword-based classification against an existing ticket's `subject`/`description`.

```
POST /tickets/:id/auto-classify
```

No request body required.

**Behavior notes**

- If the ticket has **not** been manually classified (`manually_classified: false`), the result is applied and persisted.
- If the ticket **has** been manually classified, the classification still runs and is returned in the response, but the stored ticket is left untouched (the override is preserved).

**Success Response — `200 OK`**

```json
{
  "ticket_id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
  "category": "account_access",
  "priority": "high",
  "confidence": 0.43,
  "reasoning": "Category keywords matched: login, password; Priority keywords matched: important",
  "keywords_found": ["login", "password", "important"]
}
```

**Error Response — `404 Not Found`**

```json
{ "error": "Ticket not found" }
```

**cURL**

```bash
curl -X POST http://localhost:3000/tickets/d290f1ee-6c54-4b01-90e6-d701748f0851/auto-classify
```

---

## ⚠️ Error Response Format

Two shapes are used across the API, depending on the failure type:

**Validation errors** (multiple issues possible) — from create/update/import:

```json
{ "errors": ["<message 1>", "<message 2>"] }
```

**Single-cause errors** (not found, bad upload, unhandled exceptions):

```json
{ "error": "<message>" }
```

Unhandled server exceptions fall through to a generic `500`:

```json
{ "error": "Internal Server Error" }
```

---

## 🔢 HTTP Status Codes Used

| Code | Meaning | Where it appears |
|------|---------|-------------------|
| `200 OK` | Successful read/update/classify, or import where every row succeeded | GET, PUT, import, auto-classify |
| `201 Created` | Ticket created | POST /tickets |
| `204 No Content` | Ticket deleted, no body returned | DELETE /tickets/:id |
| `207 Multi-Status` | Import partially succeeded (some rows valid, some invalid) | POST /tickets/import |
| `400 Bad Request` | Validation failed, missing file, unsupported format, unparsable file, or import where every row failed | POST/PUT/import |
| `404 Not Found` | Ticket ID does not exist | GET/PUT/DELETE/auto-classify by :id |
| `500 Internal Server Error` | Unhandled exception | any endpoint |
