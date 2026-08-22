# SSOT.md — Plan-it single source of truth

**Live build state. Every agent updates this file in the same commit as its
work — see `AGENTS.md` Rule 0.**

- Product spec: `project.md` (stable, don't edit)
- Agent rules: `AGENTS.md`
- Last updated: **2026-08-22** — merge of Sites/Base44 live spine + World Labs multimodal/render assets

---

## 0. Two live tracks: Sites coordination spine + Base44 finished UI

**Corrected 2026-08-22.** This repository contains:

1. **Sites coordination spine (deployed)** — vinext/Cloudflare D1 app with
   durable events/attendees, guest RSVP, management summaries, CORS for
   Base44, and booking HTTP wireframes. Production harness:
   `https://snapplan-temp.it-1ffd660360.chatgpt.site`
2. **Integrations modules** under `src/integrations/**` — World Labs +
   ElevenLabs real/mock adapters, reused by Sites routes and pasteable into
   Base44 (`docs/base44/port/integration-bundle.md`).
3. **Base44 finished UI (published)** — owns the polished host/guest/manage
   experience and calls the Sites API through the shared `planitApi` adapter:
   `https://valiant-sync-orbit-plan.base44.app`. Temporary Sites pages are
   harnesses only.

Do not regenerate World Labs or ElevenLabs client code. Extend the existing
contracts.

---

## 1. Where the build actually is

| Area | Owner | Status | Updated |
|---|---|---|---|
| Sites coordination spine (routes, D1, RSVP) | coordination spine | **Done** — deployed harness | 2026-08-22 |
| Persistence / data model (Event, Attendee, Invitation) | coordination spine | **Done** on Sites; Base44 may mirror | 2026-08-22 |
| Host creation / guest RSVP / manage harness | coordination spine | **Done** (temporary UI) | 2026-08-22 |
| Base44-safe guest ID + CORS | coordination spine | **Done** | 2026-08-22 |
| Unified + named friend links | coordination spine | **Backend done** — Base44 wiring pending publish | 2026-08-22 |
| Twilio/ElevenLabs live call path | coordination spine | **Done** — dry-run + live/mock dispatch + status poll | 2026-08-22 |
| World Labs integration | integrations agent | **Done** — text/image/multi-image, render assets exposed | 2026-08-22 |
| ElevenLabs booking agent | integrations agent | **Done** — real + mock | 2026-08-22 |
| Finished Base44 UI | Base44 / Simon | **Done** — published with live API adapter | 2026-08-22 |
| In-app world viewer (SparkJS, base + walk cameras) | unassigned | **Not started** — needs `three` + `@sparkjsdev/spark` | 2026-08-22 |
| Connected Twilio caller number in ElevenLabs | human + ElevenLabs | **Blocked** until number import | 2026-08-22 |
| Event lock-in + booking-attempt persistence | coordination spine | **Not started** | 2026-08-22 |

### What a human can actually do right now

- Create an event, share guest/manage links, collect RSVPs, view consensus on
  the published Plan-it UI or deployed Sites harness.
- Use distinct guest and host/admin routes at
  `https://valiant-sync-orbit-plan.base44.app`; new events persist to D1.
- Reopen an RSVP on the same browser to update the same attendee rather than
  create a duplicate.
- Create recoverable named friend links through the private management API;
  each link restores and updates one response even when opened on another
  device. The unified browser-identity link remains available.
- `POST /api/manage/{token}/book` dry-run by default; `{ "live": true }` dispatches through ElevenLabs (real or mock).
- `GET /api/manage/{token}/book/status?callId=` polls transcript/outcome.
- Live dials are limited to `ELEVENLABS_TEST_TO_NUMBER` unless `confirmRealVenue` is true.
- Verify `POST /api/webhooks/elevenlabs` HMAC signatures when configured.
- Run integration mocks with zero credentials via `src/integrations/**`.

### Production backend connectivity audit (2026-08-22)

The published Base44 UI calls the Sites backend directly; there is no Base44
proxy, duplicate database, or hidden persistence layer. A fresh production
transaction verified this complete path:

`Base44 origin -> Worker CORS -> API route -> event service -> D1 repository`

- `POST /api/events` returned `201` and persisted the event.
- `GET /api/events/{slug}/rsvp` returned public event data without the private
  management token.
- `PUT /api/events/{slug}/rsvp` persisted one attendee under the browser guest
  ID.
- `GET /api/manage/{token}` returned that attendee and the updated consensus
  summary without echoing the token.
- The published Base44 origin received the configured CORS response headers.

This audit covers the currently live coordination slice. It intentionally does
not claim that sponsor integrations are routed yet: `/api/manage/{token}/book`
is still a dry-run/readiness wireframe, the ElevenLabs webhook verifies but does
not persist outcomes, and World Labs generation is not invoked by an app route.

### Named invitation contract (implemented; production publish pending)

- `POST /api/manage/{managementToken}/invitations` accepts
  `{ "names": ["Alex", "Sam"] }` and returns shareable named guest URLs.
- `GET /api/manage/{managementToken}` returns the unified guest URL plus all
  recoverable named invitation URLs without echoing the management token.
- `GET|PUT /api/events/{publicSlug}/rsvp?invite={invitationToken}` resolves the
  invitation before browser identity, pre-fills its suggested name, and upserts
  against a stable invitation-owned attendee identity.
- An invalid or cross-event invitation token returns `404` and never falls back
  to a new anonymous attendee.
- The D1 `invitations` table owns unguessable invitation tokens and cascades
  with its event. The unified link still uses `X-SnapPlan-Guest-Id` or the
  `snapplan_guest_id` cookie.

---

## 2. Module ownership

Do not edit files outside your lane. See `AGENTS.md` Rule 1.

| Path | Owner |
|---|---|
| `src/integrations/worldlabs/**` | integrations agent |
| `src/integrations/elevenlabs/**` | integrations agent |
| `src/integrations/shared/**` | integrations agent |
| `docs/world-labs-setup.md`, `docs/elevenlabs-setup.md` | integrations agent |
| `package.json`, lockfiles, build config | coordination spine (codex) |
| App routes, pages, components | coordination spine (codex) |
| DB schema, migrations, queries | coordination spine (codex) |
| Guest identity, RSVP, dashboard logic | coordination spine (codex) |
| `SSOT.md`, `AGENTS.md`, `README.md`, `.env.example` | shared — append, never rewrite |

---

## 3. Boundary contracts

These are the only surfaces between the app and the integrations. Copy from
here rather than reading the modules.

### World Labs — `src/integrations/worldlabs`

```ts
import { generateWorld, getWorldStatus } from "src/integrations/worldlabs";

type WorldImageInput =
  | { source: "uri"; uri: string }
  | { source: "mediaAsset"; mediaAssetId: string };

type WorldSeed = {
  description: string; eventType: string; mood: string; location: string;
  timeCharacter: string; groupSize: number; priceCharacter: string;
  venuePhoto?: WorldImageInput;
  guestPhotos?: Array<WorldImageInput & { direction?: "front" | "right" | "back" | "left" }>;
  expansive?: boolean;
};

type WorldAssets = {
  splatUrls?: { low?: string; medium?: string; full?: string };
  colliderMeshUrl?: string; panoUrl?: string;
  scale?: number; groundPlaneOffset?: number; caption?: string;
};

type WorldResult = {
  status: "pending" | "ready" | "failed";
  embedUrl?: string; previewImageUrl?: string; externalId?: string;
  assets?: WorldAssets; error?: string;
};

generateWorld(seed: WorldSeed): Promise<WorldResult>
getWorldStatus(externalId: string): Promise<WorldResult>
```

Usage notes for the app:
- Call `generateWorld` **once**, at event creation. Never regenerate per RSVP.
- Optional `venuePhoto` / `guestPhotos` switch to image or multi-image modes;
  `expansive` selects `marble-1.1-plus`.
- Real generation takes **~5 minutes**. Store `externalId`, poll in the
  background, show the fallback until `status === "ready"`.
- When ready, `assets` carries splat / collider / scale data for an in-app
  SparkJS viewer; callers that only need a link can ignore it.
- With no API key, the mock returns `ready` **instantly** with a real
  data-URI planet preview and animated embed page. The flow always works.

### ElevenLabs booking agent — `src/integrations/elevenlabs`

```ts
import { startBookingCall, getBookingCallStatus } from "src/integrations/elevenlabs";

type EventBrief = {
  eventId: string; venueName: string; venuePhoneNumber: string; location: string;
  partySize: number;
  preferredWindows: Array<{ startIso: string; endIso: string }>;
  budgetPerPerson?: number; currency?: string;
  seatingPreference?: string; dietaryNotes?: string[];
  hostName: string; hostCallbackNumber?: string;
  negotiation: {
    maxPricePerPerson?: number; timeFlexible: boolean;
    acceptSplitSeating: boolean; timeToleranceMinutes?: number;
  };
};

type BookingCallResult = {
  status: "pending" | "in_progress" | "completed" | "failed";
  externalId?: string;
  outcome?: "booked" | "declined" | "needs_followup" | "unknown";
  confirmedTime?: string; confirmedPartySize?: number;
  summary?: string;
  transcript?: Array<{ role: "agent" | "user"; message: string; atSeconds: number }>;
  durationSeconds?: number; error?: string;
};

startBookingCall(brief: EventBrief): Promise<BookingCallResult>
getBookingCallStatus(externalId: string): Promise<BookingCallResult>

// For honest UI labelling — must not change whether the flow works:
isLiveCallingConfigured(): boolean
missingBookingAgentCredentials(): string[]
```

Usage notes for the app:
- `startBookingCall` returns immediately; the call runs for tens of seconds.
  Poll `getBookingCallStatus` and render `transcript` live — that live
  transcript is the demo moment worth building UI for.
- **`outcome === "booked"` is the only state that means booked.** Anything
  else, including `needs_followup`, must not render as a confirmed booking.
- With no credentials the mock simulates a call over ~12s
  (`pending` → `in_progress` with a progressively revealed transcript →
  `completed`), built from the real brief. Set
  `ELEVENLABS_MOCK_OUTCOME=declined` to demo graceful failure.

### Both integrations guarantee

- Never throw. Every failure becomes `status: "failed"` with a message.
- Every HTTP call has a timeout.
- Work with zero credentials, via a deterministic mock the caller can't
  distinguish.
- No secret ever reaches a log or an error message.

---

## 4. Environment variables

Nothing is required to run the app — every integration falls back to its
mock. `.env.example` documents both Sites and integration variables.

The Sites deployment sets `PLANIT_ALLOWED_ORIGINS` to the published Base44
origin plus its editor preview origins. Base44 sends `X-SnapPlan-Guest-Id` for
guest identity; it does not depend on cross-site cookies.

### World Labs

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `WORLDLABS_API_KEY` | for real worlds | — | Secret key (`WLT-Api-Key` header) |
| `WORLDLABS_BASE_URL` | no | `https://api.worldlabs.ai` | Override for tests |
| `WORLDLABS_MODEL` | no | `marble-1.1` | `marble-1.1-plus` for larger scenes |
| `WORLDLABS_TIMEOUT_MS` | no | `15000` | Per-call timeout |
| `WORLDLABS_FORCE_MOCK` | no | `false` | Force the mock |

### ElevenLabs

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ELEVENLABS_API_KEY` | for real calls | — | Secret key (`xi-api-key` header) |
| `ELEVENLABS_AGENT_ID` | for real calls | — | Agent created once in the dashboard |
| `ELEVENLABS_AGENT_PHONE_NUMBER_ID` | for real calls | — | Twilio number imported into ElevenLabs (alias: `ELEVENLABS_PHONE_NUMBER_ID`) |
| `ELEVENLABS_WEBHOOK_SECRET` | for signed webhooks | — | HMAC secret for `ElevenLabs-Signature` |
| `ELEVENLABS_TEST_TO_NUMBER` | for harness dry-runs | — | E.164 test destination only |
| `TWILIO_SID` | for ElevenLabs import | — | Twilio Account SID |
| `TWILIO_API_KEY` | for ElevenLabs import | — | Twilio Auth Token / API key secret |
| `ELEVENLABS_BASE_URL` | no | `https://api.elevenlabs.io` | Override for tests |
| `ELEVENLABS_TIMEOUT_MS` | no | `15000` | Per-call timeout |
| `ELEVENLABS_USE_PROMPT_OVERRIDE` | no | `true` | Send code-built prompt per call (needs dashboard Security toggles) |
| `ELEVENLABS_CALL_RECORDING_ENABLED` | no | `false` | Twilio recording — consent-sensitive |
| `ELEVENLABS_FORCE_MOCK` | no | `false` | Force the mock |
| `ELEVENLABS_MOCK_OUTCOME` | no | — | `booked` / `declined` / `needs_followup` / `unknown` |

All three ElevenLabs credentials are needed **together**; any missing one
falls back to the mock rather than failing at call time.

---

## 5. Demo readiness — project.md acceptance criteria

| # | Criterion | State |
|---|---|---|
| 1 | Host creates an event from a vague idea + constraints | ✅ Base44 + Sites |
| 2 | Host receives separate guest and management links | ✅ Base44 + Sites |
| 3 | Multiple guests on different browsers submit availability + price | ✅ Base44 + Sites |
| 4 | Same browser can't create duplicate attendees | ✅ Base44 + Sites |
| 4a | Named friend link can't create duplicate attendees across browsers | ✅ Sites backend; Base44 wiring pending |
| 5 | Host sees a clear consensus summary | ✅ Base44 + Sites |
| 6 | Recognizable spatial-art experience with dependable fallback | ✅ Planetoid fallback; World Labs integration ready |
| 7 | Ready-to-plan state with booking/seating/requirements actions | ✅ Honest pending/dry-run UI |
| 8 | Shared link has event-specific preview text and imagery | ❌ needs app (`previewImageUrl` is ready to use) |

**Critical path to a demo:** event lock-in, durable booking attempts, and a
connected ElevenLabs caller number. The complete create → RSVP → admin story
is already live and verified.

---

## 6. Known gaps, risks, and decisions to make

### Blocking
- Import a Twilio number into ElevenLabs Telephony and set
  `ELEVENLABS_PHONE_NUMBER_ID` before any live demo call.
- Event lock-in + durable booking attempts are still missing on the spine.

### Needs a decision
- **World Labs iframe embedding is unverified.** The docs don't document an
  official iframe-embed contract (CORS / `X-Frame-Options`) for
  `world_marble_url`. Test it early; plan for a new-tab fallback.
- **The in-app viewer is the big open build.** `WorldResult.assets` now
  carries everything SparkJS needs (splats, collider, scale, ground plane).
  One scene serves both cameras: high and angled down is the base view,
  dropped to eye height is walking through it — a camera animation, not a
  second generation. Costs `three` + `@sparkjsdev/spark` and a render loop.
  See `docs/world-labs-setup.md`.

### Next integration step
- Publish the invitation-enabled Sites version, then update Base44's create
  success screen and guest adapter to preserve the `invite` query parameter.
- **Git identity.** Commits so far used a local `user.email` on the
  worktrees because the repo had none configured. Reconcile before judging if
  commit attribution matters.
- **Test runner.** Currently Node's built-in runner with type-stripping and
  no dependencies. If the spine adopts Vitest/Jest, the existing tests port
  over cleanly (they only use `node:test` + `node:assert`).

### Base44 findings (verified 2026-08-22)

All the platform features we planned on are real: Deno runtime with `npm:`
imports, `secrets.get()` and `waitUntil()` from `base44:runtime`,
`asServiceRole.entities`, `.subscribe()` realtime, 5-minute function timeout,
webhooks at `https://<app-domain>/functions/<function-name>`.

Three decisions came out of checking them:

- **Apple/Google Wallet passes are cut.** `.pkpass` files must be signed with
  a Pass Type ID certificate from a paid Apple Developer account ($99/yr,
  1–2 days to provision) — there is no workaround, and iOS rejects unsigned
  passes. Google Wallet needs an approved Issuer account. Replaced with a
  **web pass page + real `.ics` download**, which needs no certificates and
  is closer to what project.md asks for anyway.
- **Payment splitting is cut.** project.md lists payment collection as an
  explicit non-goal for this slice. A graph-minimization settlement engine is
  scope creep that judges won't see the point of.
- **`waitUntil()` must not place phone calls.** Base44's docs say it is
  best-effort and "isn't guaranteed to complete or retry." Placing a call is
  critical; do it inline (it returns in <1s) and poll. `waitUntil()` is for
  logging only.

The live call telemetry stream is the keeper of the three ideas, and it works
with zero credentials because the mock adapter already simulates a call over
~12s with a progressively revealed transcript.

### Watch out for
- Node's `--experimental-strip-types` rejects **constructor parameter
  properties** and requires **`.ts` import extensions**. This has already
  bitten once. See `AGENTS.md` Rule 6.
- **Don't point the voice agent at a real restaurant during judging.** Use
  your own phone or the mock. Live venue calls are unreliable (IVR, hold,
  hang-ups) and unfair to the venue.
- **Never render `needs_followup` as a booking.** Criterion for not
  embarrassing ourselves in front of judges.

### Cross-module requests
_(Need a change in someone else's files? Write it here instead of editing
them.)_

- **To coordination spine:** add `world_external_id` and
  `booking_call_external_id` opaque strings on events when lock-in lands.
- **To integrations:** webhook persistence should update booking attempts once
  the spine adds that table; current route only verifies signatures.
- **Resolved:** `.env.example` and Sites `package.json` now exist on main.

---

## 7. Commands

```sh
# Sites unit tests
npm run test:unit

# Integration module tests (no network, no credentials needed)
node --experimental-strip-types --test src/integrations/worldlabs/__tests__/*.test.ts
node --experimental-strip-types --test src/integrations/elevenlabs/__tests__/*.test.ts
```

## 8. Changelog

| Date | Agent | Change |
|---|---|---|
| 2026-08-22 | coordination spine | Live call path: book route dispatches via ElevenLabs adapter, status poll endpoint, manage harness buttons, test-number safety gate. |
| 2026-08-22 | coordination spine | Added persistent named friend invitations, host-only link creation/recovery, invitation-owned cross-device RSVP identity, and a query-preserving temporary RSVP harness. Unified links remain supported. |
| 2026-08-22 | merge | Combined origin/main Sites+Base44 live spine with local World Labs multimodal/render-assets work. |
| 2026-08-22 | integrations | World Labs: rewrote the prompt mapper to emit renderable spatial language (was abstract mood words Marble can't use); added a deterministic planet render for the load-in/no-key state; added image and multi-image generation modes with `marble-1.1-plus` for expansive scenes; exposed splat URLs, collider mesh, pano, scale and ground-plane offset on `WorldResult` so the app can render with SparkJS. 117 tests green. |
| 2026-08-22 | coordination spine | Merged Sites app with integrations track. Added Twilio env placeholders, dry-run `POST /api/manage/{token}/book`, and HMAC `POST /api/webhooks/elevenlabs`. Corrected §0: Sites harness is deployed. |
| 2026-08-22 | integrations | Made `src/integrations/**` runtime-agnostic (dropped `Buffer`/`node:crypto`/`process.env` for web standards) so Base44's Deno runtime reuses them verbatim; 94 tests still green. Rewrote prompt 2 to wire them in instead of rebuilding. Added `port/integration-bundle.md`. Settled §0 after confirming the attached folder is the whole codebase. |
| 2026-08-22 | integrations | Base44 track: 4 staged build prompts in `docs/base44/` with verified vendor API contracts embedded. Verified Base44 capabilities; cut Wallet passes (cert blocker) and payment splitting (non-goal); flagged `waitUntil()` misuse. Raised the Base44-vs-hand-built decision as §0. |
| 2026-08-22 | integrations | ElevenLabs booking agent: contract, brief→call-script mapper, real adapter, deterministic simulated call, 65 tests, setup doc. Extracted `shared/httpJson.ts`. Added `SSOT.md` + `AGENTS.md`. |
| 2026-08-22 | integrations | World Labs: contract, prompt mapper, real adapter (Marble World API), deterministic mock, 29 tests, setup doc. |
| 2026-08-22 | — | `project.md` product spec defined. |
