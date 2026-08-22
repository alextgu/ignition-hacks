# Prompt 3 — Live telemetry stream + the event pass

Run after prompt 2 works and you can trigger a (mock) booking call.

This is the demo centrepiece. Build it carefully.

---

Add two features: a live real-time call telemetry stream, and an event pass.

## Part A — Live "air traffic control" telemetry

Right now the booking call state lives on the Event and the UI polls it. I
want the call to broadcast as a **stream of events that every open screen sees
simultaneously**, so a room full of phones watches the negotiation together.

### New entity: `CallEvent`

- `event_id` (string, required)
- `sequence` (number) — monotonically increasing per event, for stable ordering
- `kind` (enum) — `dialing`, `connected`, `agent_line`, `venue_line`,
  `counter_offer`, `confirmed`, `declined`, `needs_followup`, `failed`
- `message` (string) — the human-readable line
- `at_seconds` (number) — offset into the call
- `created_date` (auto timestamp)

### Writing the stream

In `poll-booking-call`, after fetching conversation state, **append
`CallEvent` rows for anything not already recorded** for that event, using
`asServiceRole`. Dedupe on `(event_id, sequence)` so repeated polls never
double-post — this matters, because several clients may poll at once.

Map to events:
- First poll after starting → one `dialing` row: "Dialing {venue_name}…"
- First transcript line seen → `connected`: "Connected — {venue_name} picked up"
- Each transcript line → `agent_line` or `venue_line` from its role, carrying
  the message and `time_in_call_secs`
- A venue line that mentions a different time, a set menu, a minimum spend, or
  a deposit → also emit a `counter_offer` row summarising it, e.g.
  "Counter-offer: 8:15 PM instead of 7:00 PM"
- Terminal state → `confirmed` ("Secured — table for 6, Friday 7:00 PM"),
  `declined`, `needs_followup`, or `failed`

The mock path must produce the same stream on the same timeline, so this is
fully demoable with no credentials.

### Reading the stream — real-time, no refresh

On the host dashboard, subscribe to `CallEvent` with the Base44 SDK's
`.subscribe()` so new rows appear live without polling the UI or refreshing:

```js
const unsubscribe = base44.entities.CallEvent.subscribe((event) => { /* ... */ });
```

Filter client-side to the current `event_id`. Always clean up the
subscription on unmount. On mount, first `filter()` existing rows so a screen
joining late sees the history, then subscribe for new ones.

**Also show this stream on the guest page** while a call is in progress. That
is the whole point — everyone watches at once.

### The telemetry UI

Make it feel like a flight tracker, not a chat log.

- Vertical timeline, newest at the bottom, auto-scrolling.
- Monospace timestamps in the left gutter (`+00:07`).
- Each `kind` gets its own visual treatment: `dialing` pulses; `agent_line`
  and `venue_line` are distinguishable at a glance (different alignment and
  colour, with a small "SnapPlan agent" / venue label); `counter_offer` is a
  bordered amber callout; `confirmed` is a solid success banner.
- A live status pill at the top: "Dialing…", "On the call · 0:14", "Wrapping
  up…", "Secured".
- New rows slide in and briefly highlight.
- On mobile this must be the primary content, full width, comfortable to read.
- When there's no active call, collapse to a compact history of the last call.

## Part B — The event pass (web pass, not Apple Wallet)

**Do not use `passkit-generator` or attempt to generate a `.pkpass` file.**
Apple Wallet passes require a signed Pass Type ID certificate from a paid
Apple Developer account, which we don't have. Build a web pass instead — it
works on every phone, needs no certificates, and is what the product actually
calls for: the scene becomes the event's interactive digital pass and
keepsake.

### New page: `/pass/:public_slug`

Visible once `coordination_status` is `booked`. Mobile-first, designed to be
screenshotted and shown at a door.

- The world scene (or its fallback) as a full-bleed backdrop, dimmed for
  legibility.
- A frosted-glass pass card over it containing:
  - Event title and venue name
  - The confirmed date and time, large and unmistakable
  - Party size
  - The name the reservation is under
  - Any dietary notes carried from the group, as small tags
  - Each attendee's name with their deterministic avatar
  - A short confirmation reference derived from the event id
- **"Add to calendar"** — generate a real `.ics` file client-side and download
  it. Standard VCALENDAR/VEVENT, with `SUMMARY` as the event title,
  `LOCATION` as the venue name, `DTSTART`/`DTEND` from the confirmed time
  (default 2 hours), and `DESCRIPTION` including the party size and the pass
  URL. Correct CRLF line endings and a UID. This must genuinely open in the
  phone's calendar app.
- **"Share"** — uses the Web Share API where available, falling back to
  copying the pass link.
- Open Graph metadata using the world preview image so the pass link previews
  nicely when shared.

Link to the pass from the host dashboard and the guest page once the event is
`booked`, as a prominent "View your pass" button.

### Guard

If the event is not `booked`, the pass page shows a friendly "This event
isn't confirmed yet" state with a link back to the event — never a broken or
half-empty pass.
