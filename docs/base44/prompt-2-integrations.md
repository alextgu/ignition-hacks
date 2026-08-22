# Prompt 2 — Wire in the existing integrations (do not rebuild them)

Run after prompt 1 builds and you can create an event and RSVP.

**Read this first.** The World Labs and ElevenLabs integrations are already
written and tested — 16 files, 94 passing unit tests, with both vendors' API
contracts verified against their current docs. They use no Node-specific
APIs, so they run unchanged on Base44's Deno runtime.

**Do not have Base44 rebuild them.** This prompt is two steps:

1. Paste `port/integration-bundle.md` and have Base44 create those 16 files
   verbatim.
2. Paste the prompt below, which adds only the thin Base44-specific layer:
   four backend functions that read secrets, call the adapters, and write to
   entities.

Add these secrets in project settings first. **Every one is optional** — with
none of them set, both integrations fall back to deterministic mocks and the
whole app still works. Verify that before adding real keys; it's your demo
insurance.

| Secret | Purpose |
|---|---|
| `WORLDLABS_API_KEY` | World Labs / Marble world generation |
| `ELEVENLABS_API_KEY` | ElevenLabs Agents Platform |
| `ELEVENLABS_AGENT_ID` | The one agent you created in their dashboard |
| `ELEVENLABS_AGENT_PHONE_NUMBER_ID` | Twilio number imported into ElevenLabs |

---

The integration modules under `integrations/` are already complete and
tested. **Do not modify them, do not rewrite their logic, and do not write
your own World Labs or ElevenLabs HTTP client.** Import and call them.

Their public surface is exactly:

```ts
// integrations/worldlabs/index.ts
createWorldLabsAdapter(config): { generateWorld(seed), getWorldStatus(externalId) }
// -> WorldResult { status: "pending"|"ready"|"failed", embedUrl?, previewImageUrl?, externalId?, error? }

// integrations/elevenlabs/index.ts
createBookingAgentAdapter(config): { startBookingCall(brief), getBookingCallStatus(externalId) }
// -> BookingCallResult { status: "pending"|"in_progress"|"completed"|"failed",
//      externalId?, outcome?, confirmedTime?, confirmedPartySize?, summary?,
//      transcript?, durationSeconds?, error? }
```

Both factories take a plain `Record<string, string | undefined>`. Build it
from `secrets.get()`. Neither adapter ever throws — every failure arrives as
a status with a message. If credentials are absent the factory returns a
deterministic mock automatically, and callers cannot tell the difference.

## Add four backend functions

Each one is thin: read secrets, build the adapter, call it, write the result
to the entity with `asServiceRole`. Put no vendor-specific logic in them.

### `generate-world`

Input `{ event_id }`.

1. Load the Event, read its `world_seed`.
2. `createWorldLabsAdapter(config).generateWorld(seed)`.
3. Store `externalId` as `world_external_id` and `status` as `world_status`.
   If it came back `ready` immediately (the mock does), also store
   `embedUrl` and `previewImageUrl`.
4. Return the result.

Call this **once**, when the event is created. Never on RSVP.

### `poll-world`

Input `{ event_id }`. If there's no `world_external_id`, return early.
Otherwise call `getWorldStatus(world_external_id)` and write `world_status`,
`world_embed_url`, `world_preview_image_url` back to the Event.

Real generation takes **about 5 minutes**, and World Labs operations expire
after an hour. Never block a request on it, and never auto-regenerate — one
world per event, for the life of the event.

### `start-booking-call`

Input `{ event_id }`.

1. Load the Event and its Attendees.
2. Assemble the `EventBrief`:
   - `venueName` / `venuePhoneNumber` from the host's input, `location` and
     `eventId` from the Event, `hostName` from the Event
   - `partySize` = number of attendees who responded
   - `preferredWindows` = candidate windows sorted by how many attendees
     selected them, **best first** (the adapter treats index 0 as the primary
     ask and the rest as ranked fallbacks)
   - `budgetPerPerson` = midpoint of the price range, `currency` "CAD"
   - `seatingPreference` and `dietaryNotes` if collected
   - `negotiation`: `maxPricePerPerson` = `price_max`,
     `timeFlexible` = true, `acceptSplitSeating` = false,
     `timeToleranceMinutes` = 30
3. `startBookingCall(brief)`.
4. Store `externalId` as `booking_call_external_id`, set
   `coordination_status` to `booking`.

The adapter builds the call script from the brief — the system prompt, the
opening line, the AI-disclosure instruction, and the negotiation limits are
all already handled. **Do not write your own prompt for the voice agent.**

Do **not** wrap this in `waitUntil()`. Base44 documents `waitUntil()` as
best-effort with no completion guarantee, and placing a call is critical. The
request returns in well under a second, so do it inline.

### `poll-booking-call`

Input `{ event_id }`. Call `getBookingCallStatus(booking_call_external_id)`,
then write back:

- `booking_outcome`, `confirmed_time`, `confirmed_party_size`,
  `booking_summary`
- `coordination_status`: `booked` **only** when `outcome === "booked"`;
  `booking_failed` when `status === "failed"`; otherwise leave it `booking`

**The adapter already guarantees a call is never reported as `booked` without
positive evidence** — no analysis, or an unknown result, comes back as
`needs_followup`. Preserve that. `needs_followup` must render as "needs your
attention", never as a confirmed reservation. This is the most important rule
in the app: never show a booking that didn't happen.

## Front end

**World scene.** Replace prompt 1's placeholder hero. Show the animated
fallback while `world_status` is `pending`, then cross-fade to
`world_embed_url` when `ready`. Poll `poll-world` every 15s while pending,
give up after 12 minutes, and if it fails keep the fallback silently — guests
should never see a world error.

Render the embed in an `<iframe>` **and** always offer a "View full scene"
link that opens `world_embed_url` in a new tab. World Labs doesn't publicly
document an iframe-embed contract, so their headers may block framing. The
new-tab link is the guaranteed path — build both.

**Book venue.** Require venue name and phone, confirm the action ("Call
Osteria Rialto at +1 416 555 0123 on behalf of the group?"), then call
`start-booking-call`. Poll `poll-booking-call` every 2s while the status is
`pending` or `in_progress`. Show each stage honestly: dialing / on the call /
wrapping up / booked / needs your attention / call failed. Offer a retry on
the failure states.

Label the button "Call venue" when credentials are configured and "Simulate
call" when they aren't — but the flow itself must be identical either way.
`isLiveCallingConfigured(config)` is exported for exactly this.

Keep the existing visual language: warm paper chrome (`--bg #FAF8F5`,
`--text #1A1714`, `--accent #C2410C`), 17px body, 1.5px borders. The live call
gets its full dark treatment in prompt 3 — for now a plain light card showing
the current status honestly is enough.
