# SSOT.md — Plan-it single source of truth

**Live build state. Every agent updates this file in the same commit as its
work — see `AGENTS.md` Rule 0.**

- Product spec: `project.md` (stable, don't edit)
- Agent rules: `AGENTS.md`
- Last updated: **2026-08-22** — current Base44 editor published; corrected
  World Labs planet verified inside the public Plan-it guest experience

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
| Unified + named friend links | coordination spine | **Backend + Base44 public UI deployed** | 2026-08-22 |
| Twilio/ElevenLabs live call path | coordination spine | **Done** — dry-run + live/mock dispatch + status poll | 2026-08-22 |
| World Labs integration | integrations agent | **Deployed + live verified** — miniature event-planetoid composition; text/image/multi-image and render assets retained | 2026-08-22 |
| World Labs wired into app (generate + persist + API + canvas) | coordination spine | **Deployed + live verified** — corrected planet panorama completed in 326s; Base44 public iframe verified | 2026-08-22 |
| ElevenLabs booking agent | integrations agent | **Done** — real + mock | 2026-08-22 |
| Finished Base44 UI | Base44 / Simon | **Done** — current editor published with live API adapter, world iframe/loading state and recap flow | 2026-08-22 |
| In-app world viewer (SparkJS, base + walk cameras) | unassigned | **Not started** — dependency-free panorama canvas ships instead; splat URLs already served | 2026-08-22 |
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
- Creating an event now starts **exactly one** Marble generation, and the
  event is usable immediately whether or not it succeeds.
- The production Sites runtime now has the World Labs key. Events created
  after the 2026-08-22 environment deployment use the real adapter; older
  fallback events remain fallback by the one-generation-per-event guarantee.
- New World Labs events use a miniature event-planetoid composition: an
  elevated view of a circular floating surface with the venue, seating,
  lighting and location cues arranged as small landmarks. The production
  `Sunset Picnic Planet` validation produced this view without an interior.
- The public Base44 guest route embeds that same Sites-owned world iframe,
  shows a loading bar while it initializes, removes the loading state once
  ready, and retains an `Open world` fallback link. A production check of the
  `Sunset Picnic Planet` route rendered the live World Labs canvas with zero
  browser console errors; Base44 has no World Labs credential.
- Open `/world/{slug}` — the embeddable canvas. It shows the generated
  panorama once Marble finishes, the deterministic planet until then, and
  one light per RSVP in every state.
- Read `GET /api/events/{slug}/world` for redacted canvas state.
- See the world on the guest page: `/e/{slug}` embeds the same iframe URL
  Base44 uses, so the handoff contract is exercised on every visit.

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

This original audit covered the coordination slice. Sites version 5 now also
routes event creation through the World Labs boundary and exposes the
event-specific `/world/{slug}` canvas. The booking route dispatches live/mock
calls and polls status, but the ElevenLabs webhook still does not persist
outcomes and a real call still needs an imported phone-number ID.

### Named invitation contract (implemented and deployed)

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

### World Labs — app surface (`src/features/world`, added 2026-08-22)

```ts
// GET /api/events/{slug}/world  ->  PublicWorldState
type PublicWorldState = {
  event: { title: string; description: string; location: string; groupSize: number };
  world: {
    status: "pending" | "ready" | "failed";
    live: boolean;            // a real key produced this world
    marbleUrl: string | null; // link out to the World Labs viewer
    thumbnailUrl: string | null;
    panoUrl: string | null;   // what the canvas renders
    splatLowUrl: string | null;
    splatMediumUrl: string | null;
    caption: string | null;
    elapsedSeconds: number | null;
  };
  presentation: {
    stage: "seed" | "gathering" | "ready" | "booked";
    attendeeCount: number;
    attendees: Array<{ label: string; avatarIndex: number }>;
  };
};
```

`POST /api/events` now also returns `worldUrl`. Base44 needs nothing else:

```html
<iframe src="{worldUrl}" title="Interactive event world" loading="lazy" allow="fullscreen"></iframe>
```

Rules this surface guarantees:

- **One generation per event, ever.** Started at creation, guarded by the
  stored operation id; RSVPs never regenerate.
- **A pending operation is polled at most once per 10s per event**, however
  many people have the canvas open.
- **`live: false` means the canvas must not claim a World Labs world.** It is
  false with no key configured *and* for worlds produced by the offline
  fallback before a key was added (detected by their `data:` asset URLs).
- **Nothing private leaves.** No management token, guest id, operation id,
  provider error, or full-resolution splat URL. Guest names are reduced to a
  first name for the lantern labels.

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
origin plus its editor preview origins. It also stores `WORLDLABS_API_KEY` as
a Sites secret and sets `WORLDLABS_TIMEOUT_MS=20000`. Base44 sends
`X-SnapPlan-Guest-Id` for guest identity; it does not depend on cross-site
cookies and never receives the World Labs credential.

### World Labs

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `WORLDLABS_API_KEY` | for real worlds | — | Secret key (`WLT-Api-Key` header) |
| `WORLDLABS_BASE_URL` | no | `https://api.worldlabs.ai` | Override for tests |
| `WORLDLABS_MODEL` | no | `marble-1.1` | `marble-1.1-plus` for larger scenes |
| `WORLDLABS_TIMEOUT_MS` | no | `15000` | Per-call timeout |
| `WORLDLABS_FORCE_MOCK` | no | `false` | Force the mock |

With no key the app still works end to end: every event gets the
deterministic planet, and the canvas says so rather than claiming a
generated world. Production uses the canonical `WORLDLABS_API_KEY`; local
development may use the supported `WLT_API_KEY` alias. Nothing else changes.

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
| 4a | Named friend link can't create duplicate attendees across browsers | ✅ Sites + Base44 public UI |
| 5 | Host sees a clear consensus summary | ✅ Base44 + Sites |
| 6 | Recognizable spatial-art experience with dependable fallback | ✅ **Live** — `/world/{slug}` renders the generated panorama, planet fallback otherwise |
| 7 | Ready-to-plan state with booking/seating/requirements actions | ✅ Honest pending/dry-run UI |
| 8 | Shared link has event-specific preview text and imagery | ✅ `/e/{slug}` sets OG/Twitter title, description and `previewImageUrl` |

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
- **Resolved for the app-owned canvas:** Base44's public UI embeds the Sites
  `/world/{slug}` route successfully on create success, guest, and host Planet
  views, with an `Open world` fallback link. This does not claim the external
  World Labs viewer URL itself is frameable.
- **The in-app viewer is the big open build.** `WorldResult.assets` now
  carries everything SparkJS needs (splats, collider, scale, ground plane).
  One scene serves both cameras: high and angled down is the base view,
  dropped to eye height is walking through it — a camera animation, not a
  second generation. Costs `three` + `@sparkjsdev/spark` and a render loop.
  See `docs/world-labs-setup.md`.

### Next integration step
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

### World Labs app wiring — what is true after 2026-08-22

- **Planet composition regression fixed and live verified.** The earlier production
  credit exposed that the old mapper explicitly requested a photographic
  restaurant interior, so Marble correctly produced the wrong product visual.
  The mapper now asks for a complete miniature floating event planetoid from
  an elevated three-quarter view, puts event landmarks on its upper surface,
  uses a handcrafted editorial style, and explicitly excludes interior,
  first-person and close-up compositions. Prompt regression tests cover the
  camera, curved silhouette, landmark mapping and exclusions. A fresh
  production generation completed in 326 seconds and visual inspection
  confirmed a circular event diorama with table, lanterns and skyline cues,
  with no room or first-person interior. Completed older worlds remain
  immutable by the one-generation rule.
- **Verified live with one credit.** A fresh production event completed the
  full Marble path in 338 seconds: generate → operation stored → throttled
  polling → panorama, viewer link and caption persisted → canvas ready. The
  earlier local stub coverage still verifies splat persistence and failure
  paths without spending additional credits.
- **Redaction is enforced at the seed, and tested.** The event *title* is
  never sent (hosts put names in titles), and the description is stripped of
  emails, phone numbers, URLs, bare domains and @handles first. A test
  asserts a phone/email/domain description reaches Marble with none of them.
- **First names only** reach the public canvas payload, not full names.
- **Latency:** `POST /api/events` now awaits the generate call. It is a
  queue-and-return endpoint, but consider `WORLDLABS_TIMEOUT_MS=8000` in the
  hosted environment so a slow upstream can't stall event creation. The
  request is awaited on purpose — Cloudflare may cancel a promise that
  outlives its response, so fire-and-forget would silently drop generation.
- **Frameability:** the Worker sets no `X-Frame-Options`/`frame-ancestors`,
  so `/world/{slug}` embeds cross-origin as-is. If a CSP is ever added, it
  must allow the Base44 origin.
- **Still open:** the SparkJS splat viewer. `splatLowUrl`/`splatMediumUrl`
  are already served, so it is an additive upgrade, not a rewrite. The
  panorama canvas needs no dependencies and is the reliable default.

### Cross-module requests
_(Need a change in someone else's files? Write it here instead of editing
them.)_

- **To coordination spine:** add `booking_call_external_id` on events when
  lock-in lands. (`world_external_id` — **done**, with the world columns.)
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
| 2026-08-22 | Base44 / coordination spine | Published the current Base44 editor to `valiant-sync-orbit-plan.base44.app`, including the Sites-owned World Labs iframe, animated loading state, recap flow and 1–4 date support. Production verification loaded `Sunset Picnic Planet` on the public guest route, removed the loading state after iframe readiness, retained the fallback link, and reported zero console errors. No credential was copied into Base44. |
| 2026-08-22 | coordination spine | Published Sites version 6 and spent one credit on `plan-it-demo-sunset-picnic-planet-121e48b5`. It completed in 326 seconds with `live: true`; the panorama and caption show a handcrafted circular floating event diorama with table, lanterns and Toronto cues on its surface, and visual inspection confirmed there is no interior-room composition. |
| 2026-08-22 | integrations | Replaced World Labs' explicit photographic-interior prompt with the approved Plan-it composition: complete miniature floating event planet, elevated three-quarter camera, event landmarks on the upper hemisphere, tactile clay/painted-wood style, and explicit first-person/interior exclusions. Added five prompt regressions and updated the existing mapping expectations; subsequently live-verified in Sites version 6. |
| 2026-08-22 | coordination spine | Spent one World Labs credit on the production demo event `plan-it-demo-rooftop-planet-party-d05d0a02`. The real job completed in 338 seconds with `live: true`, a panorama, Marble viewer link, and caption; no duplicate generation was started. |
| 2026-08-22 | coordination spine | Stored `WORLDLABS_API_KEY` only in the Sites runtime, set the hosted timeout to 20 seconds, and redeployed the existing validated version with environment revision 4. Base44 receives only `worldUrl`; no credential was copied into Base44. No live Marble credit was used. |
| 2026-08-22 | coordination spine | Published Sites version 5 and verified the Base44 editor handoff end to end: create returns `worldUrl`; create success, guest, and host Planet reuse the same app-owned iframe; one RSVP adds state without regenerating; fixtures remain labelled fallbacks. No live Marble credit was used because no hosted key is configured. |
| 2026-08-22 | coordination spine | Hardened the ElevenLabs booking status route: it now validates the private management token before polling a provider call, with regression coverage. The fixed-number live/mock booking contract is unchanged. |
| 2026-08-22 | coordination spine | Wired World Labs into the app: one generation per event at creation, 9 new D1 world columns with additive migrations, `GET /api/events/{slug}/world`, and the embeddable `/world/{slug}` canvas (panorama + guest lanterns, planet fallback, no new dependencies). Added the canvas to `/e/{slug}`. 22 new tests; live path verified against a stubbed Marble API. |
| 2026-08-22 | coordination spine | Live call path: book route dispatches via ElevenLabs adapter, status poll endpoint, manage harness buttons, test-number safety gate. |
| 2026-08-22 | coordination spine | Published Sites version 4 and production-audited named invitation creation, repeat RSVP update, and host recovery. Wired the existing Base44 preview through direct `planitApi` calls; independently verified named prefill, invalid-token fail-closed behavior, and host recovery. Public Base44 publish remains pending approval. |
| 2026-08-22 | coordination spine | Added persistent named friend invitations, host-only link creation/recovery, invitation-owned cross-device RSVP identity, and a query-preserving temporary RSVP harness. Unified links remain supported. |
| 2026-08-22 | merge | Combined origin/main Sites+Base44 live spine with local World Labs multimodal/render-assets work. |
| 2026-08-22 | integrations | World Labs: rewrote the prompt mapper to emit renderable spatial language (was abstract mood words Marble can't use); added a deterministic planet render for the load-in/no-key state; added image and multi-image generation modes with `marble-1.1-plus` for expansive scenes; exposed splat URLs, collider mesh, pano, scale and ground-plane offset on `WorldResult` so the app can render with SparkJS. 117 tests green. |
| 2026-08-22 | coordination spine | Merged Sites app with integrations track. Added Twilio env placeholders, dry-run `POST /api/manage/{token}/book`, and HMAC `POST /api/webhooks/elevenlabs`. Corrected §0: Sites harness is deployed. |
| 2026-08-22 | integrations | Made `src/integrations/**` runtime-agnostic (dropped `Buffer`/`node:crypto`/`process.env` for web standards) so Base44's Deno runtime reuses them verbatim; 94 tests still green. Rewrote prompt 2 to wire them in instead of rebuilding. Added `port/integration-bundle.md`. Settled §0 after confirming the attached folder is the whole codebase. |
| 2026-08-22 | integrations | Base44 track: 4 staged build prompts in `docs/base44/` with verified vendor API contracts embedded. Verified Base44 capabilities; cut Wallet passes (cert blocker) and payment splitting (non-goal); flagged `waitUntil()` misuse. Raised the Base44-vs-hand-built decision as §0. |
| 2026-08-22 | integrations | ElevenLabs booking agent: contract, brief→call-script mapper, real adapter, deterministic simulated call, 65 tests, setup doc. Extracted `shared/httpJson.ts`. Added `SSOT.md` + `AGENTS.md`. |
| 2026-08-22 | integrations | World Labs: contract, prompt mapper, real adapter (Marble World API), deterministic mock, 29 tests, setup doc. |
| 2026-08-22 | — | `project.md` product spec defined. |
