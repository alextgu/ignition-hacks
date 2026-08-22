#!/usr/bin/env bash
#
# Generate exactly ONE real World Labs world and watch it land.
#
# Everything the app needs is already wired; this script only supplies the
# key, creates a single event, and polls until Marble finishes. It is
# deliberately one-shot — Marble generation is chargeable, and the app never
# regenerates a world for an event that already has one.
#
# Usage:
#   ./scripts/generate-one-world.sh          # uses the key from .env
#   ./scripts/generate-one-world.sh --setup  # only writes .dev.vars, then exit
#
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-5173}"
DESCRIPTION="${DESCRIPTION:-A cozy birthday dinner with shared plates, somewhere warm with candles and low light}"
LOCATION="${LOCATION:-West Toronto}"

# --- 1. Make the key visible to the Worker -----------------------------------
# `.env` is not read by the Cloudflare dev runtime; miniflare reads `.dev.vars`.
# The key is copied across without ever being printed.
if [ ! -f .env ]; then echo "No .env found — put WLT_API_KEY in it first." >&2; exit 1; fi
KEY="$(grep -E '^(WLT_API_KEY|WORLDLABS_API_KEY|WORLD_LABS_KEY)=' .env | grep -v '=$' | head -1 | cut -d= -f2- | tr -d '"'"'"' ')"
if [ -z "$KEY" ]; then echo "No World Labs key set in .env." >&2; exit 1; fi

if ! grep -q "^WLT_API_KEY=" .dev.vars 2>/dev/null; then
  { echo "WLT_API_KEY=$KEY"; echo "WORLDLABS_TIMEOUT_MS=20000"; } >> .dev.vars
  echo "Wrote .dev.vars (gitignored)."
  echo
  echo "  >>> Restart the dev server now so it picks the key up, then re-run this script."
  echo "      npm run dev"
  exit 0
fi
echo "Key is configured."
[ "${1:-}" = "--setup" ] && exit 0

# --- 2. Confirm the server is up and actually sees the key -------------------
if ! curl -sf -o /dev/null "http://localhost:$PORT/"; then
  echo "No dev server on port $PORT. Run 'npm run dev' first." >&2; exit 1
fi

# --- 3. Create one event ------------------------------------------------------
echo "Creating the event..."
CREATED=$(curl -sf -X POST "http://localhost:$PORT/api/events" \
  -H 'content-type: application/json' \
  -d "{\"description\":\"$DESCRIPTION\",\"location\":\"$LOCATION\",\"groupSize\":6,\"priceMin\":35,\"priceMax\":65,\"timeOptions\":[\"2026-08-28T19:00:00.000Z\"]}")
SLUG=$(printf '%s' "$CREATED" | python3 -c 'import json,sys;print(json.load(sys.stdin)["event"]["publicSlug"])')
echo "  slug:  $SLUG"
echo "  world: http://localhost:$PORT/world/$SLUG"
echo "  guest: http://localhost:$PORT/e/$SLUG"

# A couple of RSVPs so the canvas has lights on it for the screenshot.
n=0
for NAME in "Sam" "Ada" "Ravi"; do
  n=$((n+1))
  curl -sf -X PUT "http://localhost:$PORT/api/events/$SLUG/rsvp" \
    -H 'content-type: application/json' -H "X-SnapPlan-Guest-Id: demo-$n" \
    -d "{\"displayName\":\"$NAME\",\"selectedTimeOptions\":[\"2026-08-28T19:00:00.000Z\"],\"priceResponse\":\"works\"}" \
    -o /dev/null || true
done

# --- 4. Poll until Marble finishes -------------------------------------------
# Each request also drives the server's own throttled poll of the operation.
echo
echo "Generating. Marble usually takes about 5 minutes..."
for i in $(seq 1 60); do
  sleep 15
  curl -sf "http://localhost:$PORT/api/events/$SLUG/world" -o /tmp/snapplan-world.json || continue
  python3 - "$i" /tmp/snapplan-world.json <<'PY'
import json, sys
i = int(sys.argv[1])
with open(sys.argv[2]) as fh:
    d = json.load(fh)
w = d["world"]
mins = (w["elapsedSeconds"] or 0) // 60
print(f"  [{i:>2}] {w['status']:<8} live={str(w['live']):<5} {mins}m elapsed")
if w["status"] == "ready":
    print("\n  READY")
    for k in ("marbleUrl", "panoUrl", "thumbnailUrl", "splatLowUrl", "splatMediumUrl", "caption"):
        if w.get(k):
            print(f"    {k:<15} {w[k]}")
    sys.exit(3)
if w["status"] == "failed":
    print("\n  FAILED - the reason is stored on the event (world_error), never served publicly.")
    sys.exit(4)
PY
  code=$?
  [ $code -eq 3 ] && { echo; echo "Open http://localhost:$PORT/world/$SLUG"; exit 0; }
  [ $code -eq 4 ] && exit 1
done
echo "Still pending after 15 minutes — check the operation directly." >&2
