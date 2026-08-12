#!/usr/bin/env bash
# Zero-manual-step demo of the REST API gateway (specification-challenge.md MLO-C5).
# Starts the API, waits on a real health check (never a fixed sleep), submits 3 fixture
# transactions covering all three terminal states, prints results, tears itself down.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

PORT=8001
BASE_URL="http://127.0.0.1:${PORT}"

python3 -m uvicorn api.server:app --port "$PORT" > /tmp/demo-api.log 2>&1 &
API_PID=$!
trap 'kill "$API_PID" 2>/dev/null || true' EXIT

echo "Starting API gateway (pid $API_PID)..."
until curl -sf "${BASE_URL}/health" > /dev/null 2>&1; do
  sleep 0.2
done
echo "API is up."
echo

echo "=== Submitting demo transactions ==="
for f in demo/txn-settled.json demo/txn-flagged.json demo/txn-rejected.json; do
  echo "--- $f ---"
  curl -s -X POST "${BASE_URL}/transactions" -H "Content-Type: application/json" -d @"$f" \
    | python3 -m json.tool
  echo
done

echo "=== Full results ==="
curl -s "${BASE_URL}/transactions" | python3 -m json.tool

echo
echo "Demo complete."
