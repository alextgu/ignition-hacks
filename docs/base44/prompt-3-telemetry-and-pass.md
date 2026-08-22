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
  colour, with a small "Plan-it agent" / venue label); `counter_offer` is a
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


## Design system — use these exact values

The visual direction is **"warm paper, dark line"**: the app is light, warm
and editorial; only the live call panel and the pass backdrop go dark. Do not
build a system-wide dark mode.

The demo is a **recorded video embedded on a website**, so video compression
is the binding constraint. That drives a few hard rules:

- The dark panel is **flat `#0C0A09`, never a gradient** — gradients band
  badly under H.264/VP9.
- **No film grain, noise textures, or glassmorphism blur** over busy content.
- **Borders are 1.5px minimum.** 1px hairlines vanish or shimmer after
  compression.
- **Body text is 17px and nothing goes below 14px anywhere** — a 1440px
  capture embedded at ~800px is scaled to about 55%.
- **Motion is slow and short**: 180ms ease-out for hovers, 240ms for
  entrances, fades and 8px slides only. No springs, no bounces, no continuous
  animation except one slow drift on the world scene. Respect
  `prefers-reduced-motion`.

### Light tokens — app chrome, the default everywhere

```
--bg #FAF8F5   --bg-raised #FFFFFF   --bg-sunken #F2EEE8
--text #1A1714   --text-secondary #5C544B   --text-tertiary #8A8177
--border #E8E2DA   --border-strong #D6CEC2
--accent #C2410C   --accent-hover #9A3412   --accent-bg #FEF1E8
--success #15803D   --warning #B45309   --danger #B91C1C
--shadow: 0 1px 2px rgba(26,23,20,.04), 0 4px 12px rgba(26,23,20,.06)
--shadow-lifted: 0 2px 4px rgba(26,23,20,.05), 0 12px 32px rgba(26,23,20,.10)
```

### Dark tokens — the call panel and pass backdrop ONLY

```
--d-bg #0C0A09 (flat)   --d-surface #1C1917   --d-border #2E2A27
--d-text #FAFAF9   --d-text-secondary #A8A29E
--d-accent #FB923C   --d-success #4ADE80   --d-warning #FBBF24   --d-danger #F87171
```

One accent, one success, one warning. Do not add more colours.

### Type

```
Display   Fraunces, Georgia, serif       — event titles, hero, the pass only
UI        Inter, system-ui, sans-serif   — everything else
Mono      "JetBrains Mono", ui-monospace — timestamps, references, IDs
```

Hero 44/1.1 (32 mobile) · Page title 32/1.2 · Section 24/1.3 · Card title
19/1.4 · **Body 17/1.6** · Small 15/1.5 · Label 14 uppercase .06em tracking ·
Mono 14. Weights 400 body, 600 headings and labels.

The serif display against the sans UI is what makes this read editorial
instead of like a dashboard template. Use Fraunces for titles and the pass
only — never body copy or labels.

### Space and shape

Spacing scale `4 8 12 16 24 32 48 64 96` — be generous, whitespace is most
of the "clean". Radius `10px` panels and cards, `6px` inputs, `999px` pills.
Reading columns max 680px, dashboard max 1080px. Tap targets at least 44px
tall. Support light appearance only — no theme toggle.

### Anti-patterns

No purple/blue gradients, no glassmorphism over busy content, no neon, no
pure `#000` or `#FFF`, no second accent colour, no emoji as UI iconography,
no dark mode toggle, no text drop shadows, no centred long body copy, no
hairline borders on structural elements.

### Component specs for this prompt

**The call panel.** Full-bleed `--d-bg`, square corners on mobile, `10px` on
desktop.
- Status pill top-left: `--d-accent` dot with a slow 2s pulse while live,
  then `ON THE CALL - 0:14`, elapsed time in mono.
- Timeline newest-at-bottom, auto-scrolling. Fixed-width left gutter holds
  `+00:07` in `--d-text-secondary` mono so the column stays aligned.
- Agent lines: `--d-text`, left aligned, small `--d-accent` triangle prefix,
  a `PLAN-IT AGENT` label on the first one only.
- Venue lines: `--d-text-secondary`, indented 24px, venue name as the label
  on the first one only.
- Counter-offers: own block, `--d-surface` fill, `1.5px --d-warning` left
  edge, `COUNTER-OFFER` label in mono, then the plain-language summary.
- Terminal state: solid full-width bar, `--d-success` secured /
  `--d-danger` failed / `--d-warning` needs attention, outcome at 19px/600.
- New lines fade in and slide up 8px over 240ms. Nothing else moves.

Remember the transcript is doing double duty as **captions** — most people
watch embedded video muted, so the call has to be fully legible with no
sound. Its readability is the highest-priority thing on the page.

**The pass.** World scene full-bleed behind a `#0C0A09` scrim at 55%. Over
it a `--bg` card at `10px` radius with `--shadow-lifted`: event title in
Fraunces 32px, then the confirmed date and time as the single largest element
on screen, then party size, reservation name, dietary tags as pills, guest
avatars in a row, confirmation reference in mono. Built to be screenshotted.

**Avatars.** Deterministic from `avatar_seed`: flat circle from a fixed
six-colour set drawn from the palette, initials in white at weight 600. No
photos, no gradients, no external image services.
