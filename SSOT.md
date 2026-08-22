# SnapPlan — Single Source of Truth

> **Working title:** SnapPlan is temporary. This document is the authoritative
> operational summary for the hackathon repository at
> `/Users/agu/Desktop/ignition-hacks`.

## Product Goal

SnapPlan moves a small social event from a vague idea to a bookable group
decision. It collects availability and price comfort through one link, creates
a shared spatial-art experience, and hands a confirmed event brief to an
autonomous booking agent.

The hackathon slice is intentionally narrow:

1. A host creates a lightweight event proposal.
2. Guests submit availability and price comfort.
3. The host reviews consensus and locks a decision.
4. World Labs supplies the evolving visual centerpiece.
5. ElevenLabs calls a venue when the event is ready to book.

This is not a full trip planner, large-event ticketing platform, payment
system, or production-grade venue marketplace.

## Repository and Git Rules

- Work directly on `main`.
- Do not create branches or worktrees unless the user explicitly requests one.
- Preserve concurrent changes from the user and other agents.
- Never commit API keys, webhook secrets, phone numbers, or other credentials.
- `project.md` contains the fuller product rationale; this file tracks the
  current implementation and operational truth.

## Current Implementation

The coordination foundation is implemented and deployed.

- Production site: `https://snapplan-temp.it-1ffd660360.chatgpt.site`
- Runtime: React/TypeScript on Sites with Cloudflare D1.
- Final UI: not in this repository; Base44 owns the finished interface.
- Current pages: temporary functional harnesses only.
- Durable models: `events` and `attendees`.
- Guest identity: one editable attendee per event and anonymous browser ID.
- Host security: unguessable management token in the private management URL.
- Event creation returns separate guest and management URLs.
- Management state includes attendee, availability, and price summaries.
- World fields already exist on events: status, embed URL, and preview image.
- Verification baseline: 22 unit tests, the production build, the rendered-HTML
  test, and lint pass with the required Node 22.13-or-newer runtime.

### Stable HTTP Surface

- `POST /api/events` — create an event.
- `GET /api/events/{publicSlug}/rsvp` — load this guest's event and response.
- `PUT /api/events/{publicSlug}/rsvp` — create or update this guest's response.
- `GET /api/manage/{managementToken}` — load private host coordination state.

The exact request and response examples are documented in `README.md`.

## Agent Ownership Boundaries

### Base44 Agent

Owns the finished host, guest, and management UI. It must consume the shared
backend contracts rather than create a second event database. Provider keys
must never be placed in Base44 client code.

### World Labs Agent

Owns `src/integrations/worldlabs/`, world-prompt mapping, asynchronous world
generation, polling, fallbacks, and the browser rendering handoff. World
generation starts once after event creation and must never block RSVPs.

### Coordination and Booking Backend

Owns shared API compatibility, event lock-in, the frozen booking brief,
booking-attempt persistence, ElevenLabs dispatch, signed webhook processing,
and confirmed booking state. This work must not implement final UI.

## Required Integration Contracts

### Base44 Compatibility

The temporary site currently identifies guests with a same-origin HTTP-only
cookie. A separately hosted Base44 UI must not depend on cross-site cookies.
The planned contract is:

- Base44 creates one random anonymous guest ID per browser and persists it.
- RSVP requests send it as `X-SnapPlan-Guest-Id`.
- The backend validates the ID and retains the cookie path as a fallback.
- CORS allows only configured frontend origins.

The final Base44 origin is not known yet and must be configured before final
cross-origin testing.

### Booking Brief

Lock-in freezes the values that the booking agent may use:

- Event and host reference.
- Venue name and phone number.
- Chosen time plus acceptable alternatives.
- Party size.
- Budget or maximum price per person.
- Seating preference.
- Dietary and accessibility notes.
- Maximum time negotiation delta, initially 45 minutes.

The agent may not invent broader permissions or commit outside this brief.

### Booking State

A durable booking attempt must move through explicit states:

`pending -> dispatching -> calling -> booked | failed | needs_host`

Success requires an external confirmation. Store the channel, provider
conversation ID, call ID when available, final time, confirmation code,
transcript summary, notes, and failure reason. Webhook processing must be
signature-verified and idempotent.

### ElevenLabs Agent

Planned temporary name: `SnapPlan Venue Booker`.

- Friendly, concise, and professional.
- Uses runtime event and venue variables.
- Negotiates only inside the approved 45-minute window.
- Confirms seating, dietary requirements, final time, and party size.
- Repeats and records the confirmation code.
- Returns `needs_host` instead of guessing when a counter-offer exceeds scope.
- Never calls a real venue without an explicit host booking action.

ElevenLabs generates the agent ID after creation. Outbound calls also require a
caller phone-number ID connected to ElevenLabs. The user's personal phone is
only the initial test destination unless it has separately been configured as
a verified caller ID.

## Credential Status

Secrets live only in local `.env` and hosted runtime configuration.

- ElevenLabs API key: present locally; not committed.
- ElevenLabs agent ID: not created yet.
- ElevenLabs caller phone-number ID: not confirmed yet.
- ElevenLabs webhook secret: not created yet.
- Test destination number: missing from local `.env`.
- World Labs key: missing from this repository's local `.env`; the World Labs
  integration agent may hold it separately.

## Critical Path

1. Add Base44-safe guest identity and restricted CORS support.
2. Add event lock-in and a validated immutable booking brief.
3. Add durable booking attempts and their state machine.
4. Create the ElevenLabs agent and inspect connected caller numbers.
5. Add outbound-call dispatch and an HMAC-verified post-call webhook.
6. Run a test call only to the configured test destination.
7. Connect Base44 and World Labs work through the documented contracts.
8. Run the complete demo: create -> RSVP -> consensus -> lock -> call -> confirm.

## Current Blockers and Risks

- `ELEVENLABS_TEST_TO_NUMBER` is not present locally.
- A usable ElevenLabs/Twilio caller number has not been confirmed.
- The final Base44 origin is not known, so the production CORS allowlist cannot
  be finalized.
- World generation is asynchronous and can take minutes; the fallback scene is
  mandatory for a reliable demo.
- Online autonomous booking is a provider extension. The real hackathon path
  should prioritize the ElevenLabs venue call and fall back cleanly.

## Demo Completion Checklist

- [x] Durable event and attendee storage.
- [x] Host event creation.
- [x] Separate guest and management links.
- [x] One editable RSVP per anonymous browser.
- [x] Availability and price consensus summary.
- [x] Public deployment of the temporary functional harness.
- [ ] Base44 cross-origin API compatibility.
- [ ] Finished Base44 interface.
- [ ] World Labs generation and dependable fallback.
- [ ] Event lock-in and booking brief.
- [ ] Booking-attempt persistence.
- [ ] ElevenLabs agent and connected caller number.
- [ ] Signed ElevenLabs webhook handling.
- [ ] Test phone call and captured outcome.
- [ ] Complete judged-demo rehearsal.

## Change Record

### 2026-08-22 — Initial repository SSOT

- Recorded the implemented coordination foundation and deployment.
- Separated Base44, World Labs, and booking-backend ownership.
- Defined the Base44 identity boundary and booking state contract.
- Recorded ElevenLabs prerequisites without exposing credentials.
- Identified the shortest remaining path to the hackathon demo.
- Reverified the coordination baseline and recorded the required Node runtime.
