# SSOT.md — SnapPlan single source of truth

**Live build state. Every agent updates this file in the same commit as its
work — see `AGENTS.md` Rule 0.**

- Product spec: `project.md` (stable, don't edit)
- Agent rules: `AGENTS.md`
- Last updated: **2026-08-22** by the integrations agent (ElevenLabs module)

---

## 1. Where the build actually is

| Area | Owner | Status | Updated |
|---|---|---|---|
| Project scaffolding, `package.json`, build/test runner | coordination spine (codex) | **Not present on `main`** | 2026-08-22 |
| Persistence / data model (Event, Attendee) | coordination spine (codex) | **Not present on `main`** | 2026-08-22 |
| Host creation flow (`/`) | coordination spine (codex) | **Not present on `main`** | 2026-08-22 |
| Guest page + RSVP (`/e/{slug}`) | coordination spine (codex) | **Not present on `main`** | 2026-08-22 |
| Host dashboard (`/manage/{token}`) | coordination spine (codex) | **Not present on `main`** | 2026-08-22 |
| Guest identity / duplicate prevention | coordination spine (codex) | **Not present on `main`** | 2026-08-22 |
| World Labs integration | integrations agent | **Done** — real + mock, 29 tests green | 2026-08-22 |
| ElevenLabs booking agent | integrations agent | **Done** — real + mock, 65 tests green | 2026-08-22 |
| Spatial-art UI (scene panel, guest overlays) | unassigned | **Not started** | 2026-08-22 |
| Ready-to-plan → booking handoff UI | unassigned | **Not started** | 2026-08-22 |

> Coordination-spine rows say "not present on `main`" because nothing for
> them has landed on `main` yet. Codex may well have work in progress
> elsewhere — **status unknown to this agent.** Codex: please update these
> rows when you land.

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
- **No scaffolding on `main`.** No `package.json`, no framework, no test
  script. Until this lands, the integration modules can only be run via
  `node --experimental-strip-types --test` directly.
- **No `.env.example`.** Coordination spine should create it from §4.

### Needs a decision
- **World Labs iframe embedding is unverified.** The docs don't document an
  official iframe-embed contract (CORS / `X-Frame-Options`) for
  `world_marble_url`. Test it in a browser early. If it won't embed, open it
  in a new tab — plan the UI so either works.
- **Git identity.** Commits so far used a local `user.email` on the
  worktrees because the repo had none configured. Reconcile before judging if
  commit attribution matters.
- **Test runner.** Currently Node's built-in runner with type-stripping and
  no dependencies. If the spine adopts Vitest/Jest, the existing tests port
  over cleanly (they only use `node:test` + `node:assert`).

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
| 2026-08-22 | integrations | ElevenLabs booking agent: contract, brief→call-script mapper, real adapter, deterministic simulated call, 65 tests, setup doc. Extracted `shared/httpJson.ts`. Added `SSOT.md` + `AGENTS.md`. |
| 2026-08-22 | integrations | World Labs: contract, prompt mapper, real adapter (Marble World API), deterministic mock, 29 tests, setup doc. |
| 2026-08-22 | — | `project.md` product spec defined. |
