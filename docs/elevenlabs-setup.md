# ElevenLabs booking-agent setup

This document covers the voice booking agent under
`src/integrations/elevenlabs/`. It is the "booking-agent boundary" from
project.md: the app hands over a confirmed `EventBrief` and gets back a
`BookingCallResult`, and knows nothing about ElevenLabs itself.

## What this integration does

Takes a confirmed event brief (venue, party size, time windows, budget,
seating, dietary notes, negotiation bounds), turns it into a phone-call
script, dials the venue through ElevenLabs' voice agent, and reports back
what the call achieved — including the transcript.

If ElevenLabs is not configured or is unreachable, callers transparently get
a deterministic simulated call instead. The booking flow is therefore always
demoable, with or without credentials.

## Public contract (boundary)

```ts
import { startBookingCall, getBookingCallStatus } from "src/integrations/elevenlabs";

const call = await startBookingCall(brief);   // { status: "pending", externalId }
// ...poll from a status endpoint or background job...
const updated = await getBookingCallStatus(call.externalId!);
// updated.status: "pending" | "in_progress" | "completed" | "failed"
// updated.outcome (when completed): "booked" | "declined" | "needs_followup" | "unknown"
```

Only `EventBrief` and `BookingCallResult` (see
`src/integrations/elevenlabs/types.ts`) cross this boundary. Do not import
`elevenLabsAdapter.ts`, `mockAdapter.ts`, or `internalApiTypes.ts` from
application code — only `index.ts` and `types.ts`.

Two helpers exist for honest UI labelling:

```ts
isLiveCallingConfigured()          // true when real calls are possible
missingBookingAgentCredentials()   // which env vars still need setting
```

Use them to label the button ("Call venue" vs "Simulate call"). They must
never change whether the flow works.

## Required environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ELEVENLABS_API_KEY` | For real calls | — | Secret key, sent as the `xi-api-key` header. **Never commit.** |
| `ELEVENLABS_AGENT_ID` | For real calls | — | Id of the agent created once in the dashboard. |
| `ELEVENLABS_AGENT_PHONE_NUMBER_ID` | For real calls | — | Id of the Twilio number imported into ElevenLabs. |
| `ELEVENLABS_BASE_URL` | No | `https://api.elevenlabs.io` | Override for testing. |
| `ELEVENLABS_TIMEOUT_MS` | No | `15000` | Per-HTTP-call timeout (not call duration). |
| `ELEVENLABS_USE_PROMPT_OVERRIDE` | No | `true` | Send the code-built system prompt + first message per call. Requires Security toggles (below). Set `false` to drive behaviour from the dashboard prompt instead. |
| `ELEVENLABS_CALL_RECORDING_ENABLED` | No | `false` | Ask Twilio to record. Off by default — recording a venue may require consent. |
| `ELEVENLABS_FORCE_MOCK` | No | `false` | Force the simulated call even with credentials present. |
| `ELEVENLABS_MOCK_OUTCOME` | No | — | Force the mock's result: `booked`, `declined`, `needs_followup`, `unknown`. For demoing non-happy paths. |

**All three of the first variables are required together.** If any is
missing, the module falls back to the mock rather than failing at call time —
a half-configured environment still gives a working demo.

Secrets are read only from `process.env`. `describeBookingAgentConfig()`
returns a key-redacted summary for debugging.

## One-time setup

### 1. Get a Twilio number and connect it

ElevenLabs' Twilio integration is **dashboard configuration, not code** —
there is no webhook to host and no TwiML to write.

1. Buy a voice-capable number in Twilio.
2. In the ElevenLabs dashboard → **Phone Numbers**, add the number with your
   Twilio SID and auth token. Prefer a scoped Twilio **API key** SID/secret
   over account-wide credentials.
3. ElevenLabs auto-detects inbound/outbound capability and configures the
   number itself.
4. Copy the resulting phone number id into `ELEVENLABS_AGENT_PHONE_NUMBER_ID`.

### 2. Create one agent

Create a single agent in the dashboard and copy its id into
`ELEVENLABS_AGENT_ID`. We do **not** create an agent per booking — per-call
context is injected at call time instead.

### 3. Enable the Security toggles (only if using prompt override)

With `ELEVENLABS_USE_PROMPT_OVERRIDE=true` (the default), the agent's
**Security** tab must have these toggles enabled:

- **System prompt**
- **First message**

Without them, ElevenLabs rejects the override. If you hit an override-related
error and want to move on quickly, set
`ELEVENLABS_USE_PROMPT_OVERRIDE=false` — dynamic variables are always sent
regardless, so a dashboard prompt using `{{placeholders}}` still works.

### 4. (Optional but recommended) Add data-collection fields

The adapter reads three optional data-collection items from the agent's
post-call analysis, and they make the outcome much more reliable than
`call_successful` alone:

| Field name | Type | Description to give the agent |
|---|---|---|
| `booking_confirmed` | Boolean | Did the venue actually confirm a reservation? |
| `confirmed_time` | String | The ISO-8601 date and time the venue confirmed, if any. |
| `confirmed_party_size` | Number | The number of people the venue confirmed for. |

`booking_confirmed` takes precedence over `call_successful` when both are
present. Without these fields the integration still works — it just reports
`needs_followup` more often, which is the safe direction.

### 5. Dashboard prompt (used when override is off)

If you set `ELEVENLABS_USE_PROMPT_OVERRIDE=false`, paste a prompt into the
dashboard that references the dynamic variables. Available variables:

`event_id`, `venue_name`, `location`, `host_name`, `host_callback_number`,
`party_size`, `primary_time`, `alternate_times`, `all_times`,
`budget_per_person`, `max_price_per_person`, `seating_preference`,
`dietary_notes`, `time_flexible`, `accept_split_seating`.

## Official API flow

Sources: [outbound call via Twilio](https://elevenlabs.io/docs/agents-platform/api-reference/twilio/outbound-call),
[get conversation details](https://elevenlabs.io/docs/api-reference/conversations/get),
[Twilio native integration](https://elevenlabs.io/docs/eleven-agents/phone-numbers/twilio-integration/native-integration),
[overrides](https://elevenlabs.io/docs/eleven-agents/customization/personalization/overrides).

1. **Place the call** — `POST https://api.elevenlabs.io/v1/convai/twilio/outbound-call`
   with header `xi-api-key`:
   ```json
   {
     "agent_id": "...",
     "agent_phone_number_id": "...",
     "to_number": "+14165550123",
     "conversation_initiation_client_data": {
       "dynamic_variables": { "party_size": "6", "venue_name": "..." },
       "conversation_config_override": {
         "agent": { "prompt": { "prompt": "..." }, "first_message": "...", "language": "en" }
       }
     },
     "call_recording_enabled": false
   }
   ```
   Returns `{ success, message, conversation_id, callSid }` immediately. The
   phone call then happens asynchronously.
2. **Poll the conversation** — `GET /v1/convai/conversations/{conversation_id}`.
   Status moves through `initiated` → `in-progress` → `processing` → `done`
   (or `failed`). `processing` means the call has ended but post-call
   analysis is still running.
3. **Read the result** — once `done`, the response carries `transcript[]` and
   an `analysis` block with `call_successful`, `transcript_summary`, and any
   configured `data_collection_results`.

Status mapping used by this adapter:

| ElevenLabs | `BookingCallStatus` |
|---|---|
| `initiated` | `pending` |
| `in-progress`, `processing` | `in_progress` (partial transcript surfaced) |
| `done` | `completed` (+ `outcome`) |
| `failed` | `failed` |
| anything unrecognized | `in_progress` — keep polling, never invent a terminal state |

**A completed call is never reported as `booked` without positive
evidence.** No analysis, or `call_successful: "unknown"`, yields
`needs_followup`. This implements project.md's rule that "booking actions
must never appear successful until an external booking path returns
confirmation."

Every network failure — bad key, timeout, outage, malformed JSON, non-2xx —
becomes `{ status: "failed", error }`. Neither method throws.

## Limitations and cautions

- **Real calls cost money and reach real people.** Each call bills ElevenLabs
  credits plus Twilio per-minute charges.
- **Demo-day guidance: point `venuePhoneNumber` at your own phone, not a real
  restaurant.** A live agent calling an actual venue during judging is
  unreliable (IVR menus, hold music, hang-ups) and unfair to the venue. The
  mock is there precisely so the judged flow doesn't depend on a stranger
  answering the phone.
- **AI disclosure.** The generated system prompt instructs the agent to state
  plainly that it is an AI assistant if asked, and never to claim to be
  human. Do not remove this — some jurisdictions require disclosure, and it
  is the right default regardless.
- **Call recording is off by default.** Recording a call with a venue can
  require their consent depending on jurisdiction. Only enable
  `ELEVENLABS_CALL_RECORDING_ENABLED` deliberately.
- **Latency.** Placing the call returns in under a second, but the call
  itself runs for tens of seconds to minutes. Treat it as background work:
  start it, show progress from polling, never block a request on it.
- **Prompt override needs dashboard toggles** (see setup step 3) — the most
  likely first-run error.
- **`processing` is not `done`.** A call that has hung up may still take a
  few seconds before the transcript and analysis appear. The adapter keeps
  reporting `in_progress` through that window rather than reporting an empty
  completed call.
- **Rate limits** are not documented publicly at time of writing; credits
  are the practical constraint.

## Deterministic mock / demo fallback

Active when credentials are incomplete or `ELEVENLABS_FORCE_MOCK=true`. It:

- Places no call and needs no credentials.
- **Simulates a realistic progression.** Status advances on elapsed
  wall-clock time since the call started: `pending` for 3s, `in_progress`
  until 12s, then `completed`. The transcript is revealed line by line as
  time passes, so the UI's live-call view can be demoed for real.
- **Builds the transcript from the actual brief** — the venue name, host
  name, party size, spoken time, and dietary notes all appear in the
  dialogue. It reads like a real call, not a placeholder.
- Is stateless and deterministic: the brief and start time are encoded into
  `externalId`, so it behaves identically across restarts and serverless
  invocations. Same id + same clock → same result.
- Can demo the unhappy paths via `ELEVENLABS_MOCK_OUTCOME=declined` or
  `needs_followup`, which produce their own coherent transcripts and
  summaries.

## Running the tests

```sh
node --experimental-strip-types --test src/integrations/elevenlabs/__tests__/*.test.ts
```

65 tests, using Node's built-in `node:test` — no framework dependency. All
network calls are mocked; nothing here ever dials a phone or hits the API.

## Files in this module

```
src/integrations/elevenlabs/
  types.ts               Public contract: EventBrief, BookingCallResult, BookingAgentAdapter
  config.ts               Environment loading (no secrets logged)
  briefMapper.ts          EventBrief -> system prompt, first message, dynamic variables
  internalApiTypes.ts    ElevenLabs API shapes (NOT exported publicly)
  elevenLabsAdapter.ts    Real adapter (outbound call + conversation polling)
  mockAdapter.ts          Deterministic simulated call
  index.ts                Public entry point / adapter factory
  __tests__/              Unit tests (mocked fetch only, no live calls)

Shared with other integrations:
  src/integrations/shared/httpJson.ts   fetch wrapper: timeout + normalized failures
```
