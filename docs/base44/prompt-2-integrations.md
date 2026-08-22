# Prompt 2 — Integrations: World Labs + ElevenLabs backend functions

Run after prompt 1 builds and you can create an event and RSVP.

**The API details below are verified against current vendor documentation.
They are the most important part of this prompt — do not let the builder
substitute its own guesses for these endpoints, headers, or field names.**

Add these secrets in Base44 project settings first. Every one is optional —
the app must work fully with none of them set.

| Secret | Purpose |
|---|---|
| `WORLDLABS_API_KEY` | World Labs / Marble world generation |
| `ELEVENLABS_API_KEY` | ElevenLabs Agents Platform |
| `ELEVENLABS_AGENT_ID` | The one agent you created in their dashboard |
| `ELEVENLABS_AGENT_PHONE_NUMBER_ID` | Twilio number imported into ElevenLabs |

---

Add backend functions for two external services. Both follow the same
non-negotiable rules, and I want these rules honoured exactly.

## Rules for both integrations

1. **A deterministic mock is mandatory.** If the relevant secrets are missing,
   fall back to a mock that produces a realistic, deterministic result. The
   front end must not be able to tell which one ran, and must never show a
   "not configured" error. This is demo insurance — the app has to work with
   zero credentials.
2. **Never throw.** Every failure — timeout, non-2xx, malformed JSON, outage —
   becomes a stored failed status with a readable message. A failing
   integration must never break coordination or RSVP.
3. **Every outbound call gets a timeout** (15s), via `AbortController`.
4. **Never log a secret.** Read them only with `secrets.get()` from
   `base44:runtime`, inside the handler, never at module load.
5. **Do not use `waitUntil()` to place phone calls or start world
   generation.** Base44's own docs say it is best-effort and not guaranteed
   to complete. Both operations return in well under a second, so do them
   inline in the request and poll for the result. `waitUntil()` is acceptable
   only for fire-and-forget logging.
6. Use `base44.asServiceRole.entities` for all writes from backend functions,
   since webhook and polling calls have no user context.
7. Keep vendor-specific request/response types inside the function files.
   Nothing vendor-shaped should reach the front end — only the normalized
   fields on the Event entity.

## Part A — World Labs (the spatial-art scene)

### Function: `generate-world`

Input: `{ event_id }`. Loads the Event, reads its `world_seed`.

**Build the prompt from the seed** (deterministic, one template):

```
A {mood} {eventType} scene: {description}. Set in {location}. Lit and staged
for {timeCharacter}. Scaled and furnished for a group of about {groupSize}
people, with clearly readable spots for each guest to gather. The overall
styling and materials should feel {priceCharacter}. Navigable 3D environment,
coherent layout and lighting, no readable text or logos.
```

**Real path** (when `WORLDLABS_API_KEY` is set):

```
POST https://api.worldlabs.ai/marble/v1/worlds:generate
Headers: WLT-Api-Key: <key>, Content-Type: application/json
Body: {
  "display_name": "<eventType> — <location>",
  "model": "marble-1.1",
  "world_prompt": { "type": "text", "text_prompt": "<prompt above>" }
}
```

Returns an **operation**, not a finished world:
`{ operation_id, done, error, metadata: { progress, world_id }, response? }`.

Store `operation_id` as `world_external_id`, set `world_status` to `pending`,
return immediately. **Generation takes about 5 minutes** — never block on it.

### Function: `poll-world`

Input: `{ event_id }`.

```
GET https://api.worldlabs.ai/marble/v1/operations/{operation_id}
Headers: WLT-Api-Key: <key>
```

- `done: false` → stay `pending`.
- `done: true` with `error` → `world_status = failed`.
- `done: true` with `response` → `world_status = ready`;
  `world_embed_url = response.world_marble_url` (fall back to
  `https://marble.worldlabs.ai/world/{response.world_id}`);
  `world_preview_image_url = response.assets.thumbnail_url`.

Operations expire one hour after creation; treat an expired operation as
`failed` and keep showing the fallback. **Do not auto-regenerate** — the world
is generated once per event, never per RSVP.

### Mock path (no API key)

Return `world_status = ready` immediately with a **self-contained SVG data
URI** as `world_preview_image_url`: a 640x360 gradient whose hue derives
deterministically from a hash of the seed, one dot per expected guest arranged
in a ring, and the event type and location as text. Set `world_embed_url` to a
`data:text/html` page that displays that image full-bleed with a slow drifting
pan and a small badge reading "Preview world". Same seed must always produce
the same image.

### Front end

- Call `generate-world` once, when the event is created. Never on RSVP.
- On the guest and host pages, replace the placeholder hero: show the
  animated fallback while `pending`, then swap in `world_embed_url` when
  `ready`. Cross-fade, don't pop.
- **Render the embed in an `<iframe>` but always show a "View full scene"
  link that opens `world_embed_url` in a new tab.** World Labs does not
  publicly document an iframe-embed contract, so the iframe may be blocked by
  their headers. The new-tab link is the guaranteed path — build both.
- Poll `poll-world` every 15 seconds while `pending`, and stop after 12
  minutes.
- If `failed`, keep the fallback scene silently. Never show an error to guests.

## Part B — ElevenLabs (the voice booking agent)

### The brief

When the host taps **Book venue** on a `ready_to_plan` event, assemble a brief
from the event and its attendees:

- venue name and phone (from the host's input)
- party size = number of attendees who responded
- preferred windows = candidate windows sorted by how many attendees selected
  them, best first
- budget per person = midpoint of the price range
- the host's name, the location
- negotiation bounds: a hard maximum per person (use `price_max`), whether
  time is flexible, whether split seating is acceptable

### The call script

Build a system prompt from the brief. This decides whether the call sounds
competent, so build it carefully. It must include:

- **Role**: a polite, efficient assistant calling on behalf of `{host_name}`
  to book a table at `{venue_name}`.
- **Disclosure**: if asked whether they are a real person, or if the person
  seems confused, state plainly that they are an AI assistant calling on
  behalf of `{host_name}`. Never claim to be human. **Do not omit this.**
- **Goal**: reserve a table for `{party_size}` at `{primary_time}`, with the
  remaining windows listed as ranked alternatives.
- **Hard limits**: never agree to a per-person cost, minimum spend, or
  prix-fixe above the maximum; never give payment or card details; never
  agree to a non-refundable deposit or cancellation fee; don't accept times
  outside the listed options unless the group marked time flexible; keep the
  group seated together unless split seating was allowed.
- **Requests**: any seating preference and dietary needs, framed as
  preferences.
- **Before ending**: read back and confirm the date, time, party size, and
  the name on the reservation.
- **Style**: it's a live phone call — one or two short sentences per turn,
  natural not scripted, never invent availability or prices, and if it
  reaches voicemail leave a short message and hang up.

Format times for speech, e.g. "Friday, September 11 at 7:00 PM", derived from
the wall-clock time in the ISO string.

### Function: `start-booking-call`

Input: `{ event_id }`. Real path (when all three ElevenLabs secrets are set):

```
POST https://api.elevenlabs.io/v1/convai/twilio/outbound-call
Headers: xi-api-key: <key>, Content-Type: application/json
Body: {
  "agent_id": "<ELEVENLABS_AGENT_ID>",
  "agent_phone_number_id": "<ELEVENLABS_AGENT_PHONE_NUMBER_ID>",
  "to_number": "<venue_phone in E.164>",
  "conversation_initiation_client_data": {
    "dynamic_variables": { "venue_name": "...", "party_size": "6", "host_name": "...", "primary_time": "..." },
    "conversation_config_override": {
      "agent": { "prompt": { "prompt": "<system prompt>" }, "first_message": "<opening line>", "language": "en" }
    }
  },
  "call_recording_enabled": false
}
```

Returns `{ success, message, conversation_id, callSid }`. Store
`conversation_id` as `booking_call_external_id`, set `coordination_status` to
`booking`, return immediately.

Two notes:
- `conversation_config_override` requires the **System prompt** and **First
  message** toggles enabled in the agent's Security tab. If ElevenLabs
  rejects the override, retry once sending only `dynamic_variables`.
- Keep `call_recording_enabled` false. Recording a venue can require consent.

### Function: `poll-booking-call`

```
GET https://api.elevenlabs.io/v1/convai/conversations/{conversation_id}
Headers: xi-api-key: <key>
```

Response carries `status`, `transcript[]` (`{ role, message,
time_in_call_secs }`), `analysis` (`{ call_successful, transcript_summary,
data_collection_results }`), and `metadata.call_duration_secs`.

Map status exactly:

| ElevenLabs `status` | App state |
|---|---|
| `initiated` | still dialing |
| `in-progress` | live — surface the partial transcript |
| `processing` | call ended, analysis still running — still not final |
| `done` | complete, derive the outcome |
| `failed` | `coordination_status = booking_failed` |
| anything else | keep polling; never invent a terminal state |

Deriving the outcome when `done`:
- If `analysis.data_collection_results.booking_confirmed` is present, it
  wins: true → `booked`, false → `declined`.
- Otherwise use `analysis.call_successful`: `success` → `booked`,
  `failure` → `declined`, `unknown` → `needs_followup`.
- **No analysis at all → `needs_followup`. Never `booked`.**

Also read `confirmed_time` and `confirmed_party_size` from
`data_collection_results` when present. Set `coordination_status` to `booked`
only when `booking_outcome` is `booked`. Store `analysis.transcript_summary`
as `booking_summary`.

**This is the most important rule in the whole app: a call is never reported
as booked without positive evidence.** `needs_followup` must render as
"needs your attention", never as a confirmed reservation.

### Mock path (secrets missing)

Simulate a call that unfolds over about 12 seconds so the live UI is real and
demoable:
- 0–3s: dialing
- 3–12s: in progress, revealing transcript lines one at a time as time passes
- after 12s: complete, outcome `booked`

Build the transcript from the **actual brief** — the venue name, host name,
party size, spoken time, and dietary notes must appear in the dialogue, so it
reads like a real call rather than a placeholder. Include the venue answering,
the agent asking, the venue checking availability, a dietary exchange if
there are notes, and a read-back confirmation.

Derive progress from elapsed time since the call started, stored on the
event — no in-memory state, so it survives redeploys.

Support a `mock_outcome` override on the event (`booked`, `declined`,
`needs_followup`) so I can demo graceful failure. `declined` and
`needs_followup` need their own coherent transcripts — for `needs_followup`,
the venue demands a set menu and deposit above the approved range and the
agent correctly declines to commit.

### Front end

- Wire **Book venue**: require venue name and phone, show a confirmation
  ("Call The Corner at +1 416 555 0123 on behalf of the group?"), then call
  `start-booking-call`.
- Poll `poll-booking-call` every 2 seconds while dialing or in progress.
- Show state honestly at every stage: dialing / on the call / wrapping up /
  booked / needs your attention / call failed.
- On `booked`, show the confirmed time and party size, the summary, and a
  "Retry" affordance on the failure states.
- Label the button "Call venue" when credentials are configured and "Simulate
  call" when they aren't, but the flow itself must be identical.

Keep the existing visual language: warm paper chrome (`--bg #FAF8F5`,
`--text #1A1714`, `--accent #C2410C`), 17px body, 1.5px borders. The live
call UI gets its full dark treatment in the next prompt — for now a plain
light card showing the current status honestly is enough.
