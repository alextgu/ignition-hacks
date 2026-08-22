# SSOT.md — Plan-it single source of truth

**Live build state. Every agent updates this file in the same commit as its
work — see `AGENTS.md` Rule 0.**

- Product spec: `project.md` (stable, don't edit)
- Agent rules: `AGENTS.md`
- Last updated: **2026-08-22** by the integrations agent (World Labs multimodal + render assets)

---

## 0. Base44 is the app layer. The integrations are reused, not rebuilt.

**Settled 2026-08-22.** Confirmed with Simon: the repo attached to the working
session *is* the whole codebase. There is no separate hand-built app — no
`package.json`, no routes, no DB anywhere. Base44 builds the app layer.

An earlier version of this section speculated that codex had app work in
progress elsewhere. That was wrong, and it was wrong for a specific reason
worth recording: **this environment cannot reach the git remote.** Every
`git fetch` fails with `Could not read from remote repository`, so
`origin/main` reads as `2c41876` regardless of what has actually been pushed.
Anything about the remote's real state has to come from a human, not from
`git` in this session.

### What this means for the two tracks

- **App layer (entities, pages, UI, quorum):** built in Base44 from the
  prompts in `docs/base44/`. Nothing to rebuild — none of it existed.
- **Integrations:** the 16 files under `src/integrations/**` are **reused
  verbatim**. They were made runtime-agnostic on 2026-08-22 (no `Buffer`,
  no `node:crypto`, no `process.env` — only `fetch`, `TextEncoder`,
  `btoa`/`atob`, `AbortController`), so they run unchanged on Base44's Deno
  runtime. All 94 tests still pass. `docs/base44/port/integration-bundle.md`
  is those files, generated from the real sources, ready to paste.

Prompt 2 was rewritten to wire these in rather than have Base44 write its own
adapters. Do not let any agent or builder regenerate World Labs or ElevenLabs
client code — the contracts in these modules are verified against current
vendor docs, and a rewrite loses that.

---

## 1. Where the build actually is

| Area | Owner | Status | Updated |
|---|---|---|---|
| App layer (scaffolding, routes, DB, UI) | **Base44** | **Prompts ready** — build not started | 2026-08-22 |
| Persistence / data model (Event, Attendee) | **Base44** (prompt 1) | **Prompts ready** | 2026-08-22 |
| Host creation flow (`/`) | **Base44** (prompt 1) | **Prompts ready** | 2026-08-22 |
| Guest page + RSVP (`/e/{slug}`) | **Base44** (prompt 1) | **Prompts ready** | 2026-08-22 |
| Host dashboard (`/manage/{token}`) | **Base44** (prompt 1) | **Prompts ready** | 2026-08-22 |
| Guest identity / duplicate prevention | **Base44** (prompt 1) | **Prompts ready** | 2026-08-22 |
| World Labs integration | integrations agent | **Done** — text/image/multi-image, render assets exposed, 52 tests green | 2026-08-22 |
| ElevenLabs booking agent | integrations agent | **Done** — real + mock, runtime-agnostic, 65 tests green | 2026-08-22 |
| In-app world viewer (SparkJS, base + walk cameras) | unassigned | **Not started** — spec'd, needs `three` + `@sparkjsdev/spark` | 2026-08-22 |
| Ready-to-plan → booking handoff UI | unassigned | **Not started** | 2026-08-22 |
| Base44 build prompts (4 staged) | integrations agent | **Done** — ready to paste | 2026-08-22 |
| Base44 app build | Simon (on platform) | **Not started** | 2026-08-22 |
| Landing / demo site | Simon (on platform) | **Not started** | 2026-08-22 |

> **This session cannot reach the git remote** (`git fetch` fails), so it
> can never confirm what has been pushed. Treat every remote claim here as
> human-supplied. Confirmed 2026-08-22: the attached folder is the whole
> codebase.

### What a human can actually do right now

Nothing end to end — there is no app yet. What exists is two fully working,
independently tested integration modules that the app can call the moment
routes exist. Both work with **zero credentials configured**.

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

type WorldSeed = {
  description: string; eventType: string; mood: string; location: string;
  timeCharacter: string; groupSize: number; priceCharacter: string;
};

type WorldResult = {
  status: "pending" | "ready" | "failed";
  embedUrl?: string; previewImageUrl?: string; externalId?: string; error?: string;
};

generateWorld(seed: WorldSeed): Promise<WorldResult>
getWorldStatus(externalId: string): Promise<WorldResult>
```

Usage notes for the app:
- Call `generateWorld` **once**, at event creation. Never regenerate per RSVP.
- Real generation takes **~5 minutes**. Store `externalId`, poll in the
  background, show the fallback until `status === "ready"`.
- With no API key, the mock returns `ready` **instantly** with a real
  data-URI preview image and animated embed page. The flow always works.

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
mock. **No `.env.example` exists yet**; the coordination-spine agent should
create one and copy this table into it.

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
| `ELEVENLABS_AGENT_PHONE_NUMBER_ID` | for real calls | — | Twilio number imported into ElevenLabs |
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
| 1 | Host creates an event from a vague idea + constraints | ❌ needs app |
| 2 | Host receives separate guest and management links | ❌ needs app |
| 3 | Multiple guests on different browsers submit availability + price | ❌ needs app |
| 4 | Same browser can't create duplicate attendees | ❌ needs app |
| 5 | Host sees a clear consensus summary | ❌ needs app |
| 6 | Recognizable spatial-art experience with dependable fallback | 🟡 **integration done**, needs UI |
| 7 | Ready-to-plan state with booking/seating/requirements actions | 🟡 **booking integration done**, needs UI |
| 8 | Shared link has event-specific preview text and imagery | ❌ needs app (`previewImageUrl` is ready to use) |

**Critical path to a demo: the coordination spine.** Both sponsor
integrations are done and cannot block anything. Nothing else should be
started until 1–5 work.

---

## 6. Known gaps, risks, and decisions to make

### Blocking
- **Nothing.** The app layer is Base44's job and the prompts are ready. The
  integrations are done and reusable as-is.
- No `package.json` in this repo, by design now — it holds the integration
  modules, their tests, and the docs. Tests run directly:
  `node --experimental-strip-types --test src/integrations/**/__tests__/*.test.ts`.

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

- **To coordination spine:** create `package.json` + `.env.example`, and add
  a `test` script that runs
  `node --experimental-strip-types --test "src/**/__tests__/*.test.ts"`.
- **To coordination spine:** the `Event` model needs `world_external_id` (to
  poll World Labs) and, for the booking slice, `booking_call_external_id`.
  Both are opaque strings — don't parse them.

---

## 7. Commands

```sh
# All integration tests (no network, no credentials needed)
node --experimental-strip-types --test src/integrations/worldlabs/__tests__/*.test.ts
node --experimental-strip-types --test src/integrations/elevenlabs/__tests__/*.test.ts
```

## 8. Changelog

| Date | Agent | Change |
|---|---|---|
| 2026-08-22 | integrations | World Labs: rewrote the prompt mapper to emit renderable spatial language (was abstract mood words Marble can't use); added a deterministic planet render for the load-in/no-key state; added image and multi-image generation modes with `marble-1.1-plus` for expansive scenes; exposed splat URLs, collider mesh, pano, scale and ground-plane offset on `WorldResult` so the app can render with SparkJS. 117 tests green. |
| 2026-08-22 | integrations | Made `src/integrations/**` runtime-agnostic (dropped `Buffer`/`node:crypto`/`process.env` for web standards) so Base44's Deno runtime reuses them verbatim; 94 tests still green. Rewrote prompt 2 to wire them in instead of rebuilding. Added `port/integration-bundle.md`. Settled §0 after confirming the attached folder is the whole codebase. |
| 2026-08-22 | integrations | Base44 track: 4 staged build prompts in `docs/base44/` with verified vendor API contracts embedded. Verified Base44 capabilities; cut Wallet passes (cert blocker) and payment splitting (non-goal); flagged `waitUntil()` misuse. Raised the Base44-vs-hand-built decision as §0. |
| 2026-08-22 | integrations | ElevenLabs booking agent: contract, brief→call-script mapper, real adapter, deterministic simulated call, 65 tests, setup doc. Extracted `shared/httpJson.ts`. Added `SSOT.md` + `AGENTS.md`. |
| 2026-08-22 | integrations | World Labs: contract, prompt mapper, real adapter (Marble World API), deterministic mock, 29 tests, setup doc. |
| 2026-08-22 | — | `project.md` product spec defined. |
