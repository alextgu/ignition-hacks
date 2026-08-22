# Prompt 1 — Foundation: entities, coordination flow, quorum

Paste everything below the line into Base44. Confirm the app builds and you
can create an event and RSVP before moving to prompt 2.

---

Build a mobile-first group event coordination app called **SnapPlan**. A host
starts with a vague idea like "a cozy birthday dinner in Toronto", shares one
link, and the app collects availability and price comfort from guests until
the group reaches consensus.

Do not build any third-party integrations yet — no voice calls, no 3D world
generation. I will add those in a follow-up. Leave clearly-marked placeholder
state for them as described at the end.

## Entities

**Event**
- `title` (string) — short working title, auto-derived from the description
- `host_description` (long text) — the host's original free-form idea
- `location` (string) — general area or city
- `expected_group_size` (number)
- `candidate_windows` (array of objects) — `{ id, start_iso, end_iso, label }`
- `price_min` (number), `price_max` (number), `currency` (string, default "CAD")
- `public_slug` (string, unique) — short URL-safe random slug, 8 chars
- `manage_token` (string, unique) — unguessable random token, 32 chars
- `coordination_status` (enum) — `collecting`, `ready_to_plan`, `booking`, `booked`, `booking_failed`. Default `collecting`
- `venue_name` (string, optional), `venue_phone` (string, optional)
- `world_status` (enum) — `pending`, `ready`, `failed`. Default `pending`
- `world_embed_url` (string, optional), `world_preview_image_url` (string, optional), `world_external_id` (string, optional)
- `world_seed` (object, optional) — `{ description, eventType, mood, location, timeCharacter, groupSize, priceCharacter }`
- `booking_call_external_id` (string, optional)
- `booking_outcome` (enum, optional) — `booked`, `declined`, `needs_followup`, `unknown`
- `confirmed_time` (string, optional), `confirmed_party_size` (number, optional)
- `booking_summary` (long text, optional)

**Attendee**
- `event_id` (string, required)
- `guest_token` (string, required) — anonymous per-browser identifier
- `display_name` (string, required)
- `selected_window_ids` (array of strings)
- `price_response` (enum) — `works`, `flexible`, `too_much`
- `avatar_seed` (string) — stable string used to render a deterministic avatar

**Enforce uniqueness on `(event_id, guest_token)`.** Submitting again from the
same browser must update that attendee, never create a second row.

## Guest identity

On first visit to a guest page, generate a random `guest_token` and persist it
in `localStorage` under `snapplan_guest_token`. Reuse it on every later visit.
No accounts, no login. Reopening the link restores and lets them edit their
own response. The host is identified only by holding the `manage_token`.

## Pages

### `/` — Host creation

One screen, feels like three questions, not a form.

1. A large friendly textarea: "What are you planning?" with the placeholder
   "a cozy birthday dinner in Toronto". This is the only required field.
2. Then, compactly: general area, approximate group size, 2–4 candidate date
   or time windows (a simple repeatable date + time-of-day picker), and an
   expected price range per person.
3. A live preview card showing the event as guests will see it, updating as
   they type.
4. "Create event" produces the Event, then shows a success screen with **two
   clearly separated links** and a copy button on each:
   - **Guest link** — `/e/{public_slug}` — labelled "Share this in your group chat"
   - **Host link** — `/manage/{manage_token}` — labelled "Private — only you. Save this."

When creating the Event, also derive and store `world_seed` from the inputs:
infer `eventType`, `mood`, `timeCharacter`, and `priceCharacter` as short
lowercase phrases from the description and price range. Set `groupSize` from
`expected_group_size` and copy `description`/`location` across. Nothing
consumes this yet — just populate it.

### `/e/:public_slug` — Guest page (mobile first, low friction)

A guest should be able to finish in under fifteen seconds.

- Event header: title, location, spelled-out candidate windows, price range.
- A hero area reserved for the spatial-art scene. For now render a soft
  animated CSS gradient placeholder whose colours derive deterministically
  from `public_slug`. Keep it in its own component — it gets replaced later.
- Response form:
  1. Name (one text field)
  2. "Which of these work for you?" — multi-select chips for every candidate
     window, select as many as apply
  3. "How's the estimate?" — three big tap targets: **Works** / **Flexible** /
     **Too much**
  4. One submit button
- After submitting: a confirmation state showing their place in the group, the
  current attendee list with avatars, and an "Edit my response" button that
  reopens the form prefilled.
- Show a clear retry state if saving fails. Never silently lose a response.

### `/manage/:manage_token` — Host dashboard

- Response count against `expected_group_size`.
- **Availability overlap**: for each candidate window, how many attendees
  selected it, as a sorted bar list, best window first and visually highlighted.
- **Price comfort**: counts of works / flexible / too much, with a one-line
  plain-language read ("Most of the group is comfortable").
- Attendee list with names and avatars.
- **Quorum banner** — the consensus engine:
  - Compute the best window (most selections, ties broken by earliest start).
  - The event is **ready** when: at least 3 responses OR at least 60% of
    `expected_group_size` have responded, AND the best window has majority
    support among responders, AND no more than 1/3 answered "too much".
  - When not ready, state plainly what's missing: "Waiting on 2 more
    responses" or "No shared time yet — most people can't make Friday."
  - When ready, show a prominent "This group is ready to plan" state with the
    winning window and a **"Mark ready to plan"** button that sets
    `coordination_status` to `ready_to_plan`.
- Once `ready_to_plan`, reveal three next-step actions: **Book venue**,
  **Choose seating**, **Add requirements**. Add fields for `venue_name` and
  `venue_phone` above "Book venue". For now, all three are disabled with the
  note "Connected in the next step" — I'll wire Book venue in prompt 2.
- Distinguish clearly between "no responses yet" and "failed to load".

## Link previews

The guest page must set per-event Open Graph and Twitter card metadata: title
from the event title, description mentioning the location and date options,
and `world_preview_image_url` as the image when present. A link pasted into
iMessage should look deliberate.

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

Capture the video at 1920x1080 desktop. Everything must still be flawless at
390px wide, since guests arrive on phones from a group chat.

## Rules

- Creating an event must never fail because of a missing integration.
- RSVP submission must be idempotent per `(event_id, guest_token)`.
- Never show a booking or a reservation as confirmed anywhere yet.
- Seed the app with one realistic demo event so the pages are never empty.
