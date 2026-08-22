# World Labs Embeddable Canvas Design

**Date:** 2026-08-22  
**Status:** Approved direction; implementation not started  
**Working product name:** SnapPlan

## Objective

Add a dependable World Labs spatial-art experience that Base44 can embed as a
single responsive URL. World Labs Marble 1.1 creates the underlying world once.
SnapPlan then makes that world feel alive through lightweight participant and
event-state layers that do not regenerate the expensive source world.

The finished slice must strengthen the World Labs hackathon submission without
turning the project into a general 3D editor or forcing the Base44 agent to
implement WebGL behavior.

## Product Experience

The visual language is called **Lantern Diorama**:

- Hand-cut-paper and miniature-clay character.
- Deep indigo environment with amber, coral, and mint light.
- Cozy, deliberately small spaces instead of monumental venues.
- Empty places composed into the scene so later participation feels expected.
- Slow particles, restrained camera drift, and gentle light changes.
- No generated text and no attendee, contact, booking, or secret data inside
  the Marble world.

The canvas grows through cheap presentation layers:

1. **Seed** — no RSVPs; the world is quiet, cool, and mostly empty.
2. **Gathering** — every attendee adds one named lantern marker and slightly
   warms the ambience.
3. **Ready** — when the event status becomes `ready`, the lanterns connect into
   a subtle constellation.
4. **Booked** — reserved for the booking slice; a confirmation adds a ticket
   seal and one restrained celebratory pulse.

The source Marble world is generated once. RSVP changes never trigger another
World Labs generation request.

## Chosen Approach

Use Marble 1.1 for text-to-world generation and SparkJS for the custom browser
viewer. Render participant lanterns and event-stage effects as deterministic
SnapPlan-owned layers over the World Labs asset.

This was selected over:

- Embedding the standard Marble share page, which is fast but offers too little
  control over participant growth and interaction.
- Building a fully custom Three.js world, which offers control but weakens the
  World Labs integration and costs more hackathon time.

SparkJS is the World Labs-recommended web renderer for SPZ assets and supports
adding ordinary Three.js content around a splat world.

## Scope

### Included

- World prompt mapping from existing event fields.
- A World Labs provider adapter with a deterministic fake implementation.
- Marble 1.1 generation after event creation.
- D1 persistence for operation, world, asset, status, timing, and error data.
- Throttled operation polling.
- Public world-state API for the unlisted event slug.
- Responsive `/world/{event-slug}` embed route.
- SparkJS loading of low- or medium-resolution SPZ assets.
- Lantern Diorama loading, failure, unsupported-browser, and offline fallback.
- Participant lanterns derived from attendee records.
- Drag/orbit, gentle camera drift, and tappable participant markers.
- Reduced-motion and keyboard-accessible behavior.
- A simple iframe handoff for Base44.

### Excluded

- Final host, RSVP, or management UI.
- Repeated world regeneration after RSVPs.
- Free-form 3D editing.
- Accurate semantic placement of avatars onto generated furniture.
- Physics, multiplayer presence, chat, or games.
- Uploading reference images or videos in this slice.
- High-quality mesh generation.
- Attendee names, dietary notes, phone numbers, email addresses, URLs, or secret
  values in the World Labs prompt.
- Cross-window commands or a complex `postMessage` protocol.

## System Boundaries

### `WorldSeed`

The prompt mapper accepts only non-sensitive creative context:

```ts
type WorldSeed = {
  eventId: string;
  creativeDescription: string;
  generalLocation: string;
  groupSize: number;
  priceCharacter: string;
  timeCharacter: string;
};
```

It returns a generic display name, tags, and one text prompt. The creative
description comes from the host description after stripping obvious phone,
email, and URL patterns. It must not receive attendee names, the raw event
title, management tokens, venue phone numbers, accessibility details, or
dietary notes. The first-slice host form should also tell hosts not to put
personal information in the creative description.

### `WorldProvider`

Provider-specific data stays behind this interface:

```ts
type StartWorldResult = {
  operationId: string;
  done: boolean;
  world?: CompletedWorld;
};

type CompletedWorld = {
  worldId: string;
  marbleUrl: string;
  thumbnailUrl: string | null;
  panoUrl: string | null;
  spz100kUrl: string | null;
  spz500kUrl: string | null;
  spzFullUrl: string | null;
};

interface WorldProvider {
  start(seed: WorldSeed): Promise<StartWorldResult>;
  getOperation(operationId: string): Promise<
    | { state: "pending"; progress: number | null }
    | { state: "ready"; world: CompletedWorld }
    | { state: "failed"; code: string }
  >;
}
```

The production adapter sends `WORLD_LABS_KEY`, `WLT_API_KEY`, or
`WORLD_LABS_API_KEY` as the `WLT-Api-Key` header, preferring the official
`WLT_API_KEY` name. The environment aliases are temporary compatibility only.

The fake provider is deterministic and produces no external requests. Unit
tests and local demos can use it when the live key is absent or fake mode is
enabled.

## Prompt Contract

Every prompt starts from the same visual grammar so independently generated
events still look like one SnapPlan collection:

> A handcrafted Lantern Diorama: an intimate miniature environment made from
> layered cut paper and soft clay, deep indigo shadows, warm amber practical
> lights, small coral and mint accents, tactile edges, subtle floating dust,
> cozy human scale, open central composition, clearly suggested empty gathering
> places, gentle dreamlike atmosphere, no readable text, no logos, no people.

The mapper then adds the redacted creative description, broad location
character, group size, time character, and price character. It asks for a
navigable space with an uncluttered foreground suitable for SnapPlan's
participant overlay.

World generation uses:

- Model: `marble-1.1`.
- Input: text.
- Permission: public for the unlisted hackathon guest experience.
- Tags: `snapplan`, `lantern-diorama`, plus safe event-type tags.
- Display name: `SnapPlan Lantern` plus a short non-secret event identifier,
  never the raw event title.
- One deterministic seed derived from the event ID, so retries remain visually
  related.

Public permission is acceptable for the hackathon because SnapPlan excludes
known attendee, contact, booking, and secret data from the source prompt and
the event already has an unlisted public guest route. Host-authored creative
text is redacted for obvious contact patterns but cannot guarantee detection of
every personal name, so the form warning is part of this constraint. This
decision must be revisited for a production privacy model.

## Persistence

Extend `events` with nullable fields:

- `world_operation_id`
- `world_id`
- `world_marble_url`
- `world_spz_100k_url`
- `world_spz_500k_url`
- `world_spz_full_url`
- `world_pano_url`
- `world_prompt`
- `world_error_code`
- `world_progress`
- `world_last_checked_at`
- `world_started_at`
- `world_completed_at`

Keep the existing fields:

- `world_status`: `pending | ready | failed`
- `world_embed_url`
- `world_preview_image_url`

For compatibility, `world_embed_url` stores the Marble share URL and
`world_preview_image_url` stores the World Labs thumbnail. The additional
fields preserve the richer renderer inputs without changing existing Base44
contracts.

Only one operation may be associated with an event. The first successful start
wins; repeated start attempts with an existing operation ID are no-ops.

## Generation Lifecycle

1. Persist the event and its guest/management identifiers.
2. Build the privacy-safe `WorldSeed`.
3. Ask the provider to start generation.
4. Store the returned operation ID and start time.
5. Return the event creation response even if World Labs fails or times out.
6. The public world endpoint polls an incomplete operation when its cached
   check is at least ten seconds old.
7. On completion, store all returned assets and mark the event `ready`.
8. On provider failure, store a stable internal error code and mark the event
   `failed`; the public canvas continues using the fallback.

Starting the generation request may add a small amount of event-creation
latency, but it has a strict timeout. A World Labs error must never change a
successful event creation into an HTTP failure.

## Public API

### `GET /api/events/{event-slug}/world`

Returns public, non-secret canvas state:

```ts
type PublicWorldState = {
  event: {
    title: string;
    description: string;
    expectedGroupSize: number;
  };
  world: {
    status: "pending" | "ready" | "failed";
    progress: number | null;
    marbleUrl: string | null;
    thumbnailUrl: string | null;
    panoUrl: string | null;
    spz100kUrl: string | null;
    spz500kUrl: string | null;
  };
  presentation: {
    stage: "seed" | "gathering" | "ready" | "booked";
    attendeeCount: number;
    attendees: Array<{ displayName: string; avatarIndex: number }>;
  };
};
```

The endpoint never returns the full-resolution SPZ URL, management token,
guest identifiers, operation ID, internal error, or provider prompt. It polls
at most once per ten seconds per event and otherwise serves stored state.

The `booked` stage is defined in the response type but remains unused until the
booking slice adds a confirmed booking state.

## Embeddable Canvas

### Route

`GET /world/{event-slug}` renders a responsive, frameable page with no general
site navigation. Base44 embeds this URL directly.

The route contains only:

- The world viewport.
- A small event title.
- Generation/fallback status when relevant.
- Accessible participant-marker details.
- A discreet drag/tap instruction that disappears after interaction.

### Ready world

- Desktop prefers the 500k SPZ asset.
- Mobile and constrained devices prefer the 100k SPZ asset.
- Full resolution is not loaded in the first slice.
- Camera movement is bounded and starts with a slow automatic drift.
- Pointer drag or touch rotates the view.
- Participant lanterns appear in a stable screen-space arc so their placement
  does not depend on unpredictable generated-world coordinates.
- Tapping or keyboard-activating a lantern reveals the participant name.
- Stage lighting and constellation lines are SnapPlan-owned overlays.

### Fallback

Pending, failed, offline, and unsupported-WebGL states use the same Lantern
Diorama language rather than a spinner or blank card. The fallback is built
from CSS and lightweight canvas effects, not another generated image request.

The fallback shows:

- Layered indigo paper planes.
- A warm central gathering glow.
- The same participant lantern arc.
- Slow dust and light movement.
- Progress text only when real progress exists.

If SPZ loading fails but a panorama or thumbnail exists, use that image behind
the SnapPlan layers before falling back to the fully synthetic background.

### Accessibility and embedding

- The iframe has a meaningful title supplied by Base44.
- Participant markers are real buttons with visible focus states.
- Dragging is optional; all participant details remain keyboard reachable.
- `prefers-reduced-motion` disables camera drift, particles, pulsing, and the
  one-time booked celebration.
- The route remains readable at 320px width.
- Frame-ancestor policy is configurable. It must allow the final Base44 origin
  before cross-origin handoff testing.

## Failure Handling

- Missing key: use fake mode locally or mark live generation unavailable;
  event coordination remains functional.
- Invalid/unsafe prompt: mark `failed`, retain the fallback, and do not expose
  provider policy details publicly.
- Insufficient credits: store `credits_unavailable`, retain the fallback, and
  surface a host-only setup message later.
- Provider timeout or 5xx: mark `failed` for this slice; do not automatically
  create another chargeable operation.
- Poll collision: return cached state while one update wins through repository
  state checks.
- Missing SPZ: use panorama, then thumbnail, then synthetic fallback.
- Renderer error or WebGL unavailable: use the same fallback without breaking
  the iframe route.

## Testing Strategy

Work test-first around the provider boundary and lifecycle.

Unit tests cover:

- Prompt consistency and exclusion of sensitive attendee fields.
- Correct Marble 1.1 generation payload and key header.
- Environment-key alias precedence.
- World Labs pending, ready, failed, malformed, and insufficient-credit
  responses.
- Idempotent generation start.
- Ten-second polling throttle.
- Persistence mapping and status transitions.
- Stage derivation from attendee and event state.
- Public response redaction.

Route and rendering tests cover:

- World API not found and each status response.
- Pending, ready, failed, image fallback, and synthetic fallback markup.
- Participant buttons and reduced-motion hooks.
- Event creation remains successful when the provider throws.

After automated tests pass, make exactly one controlled live generation for a
demo event, poll it to completion, verify the returned assets, and test the
embed route on desktop and mobile widths. Do not generate multiple speculative
worlds while tuning prompts; use the deterministic fallback and provider fake
for iteration.

## Base44 Handoff

Base44 receives one contract:

```html
<iframe
  src="https://snapplan-temp.it-1ffd660360.chatgpt.site/world/EVENT_SLUG"
  title="Interactive event world"
  loading="lazy"
  allow="fullscreen"
></iframe>
```

Base44 owns the surrounding layout, RSVP form, host controls, and responsive
iframe dimensions. It does not receive the World Labs key, operation ID, or raw
provider error and does not need SparkJS.

## Deployment

- Normalize the current local `WORLD_LABS_KEY` into the hosted environment,
  preferably under `WLT_API_KEY`.
- Apply and inspect the D1 migration before deployment.
- Publish through the existing Sites project; never create another Sites
  project.
- Verify the existing event and RSVP routes after the schema change.
- Verify the public iframe response permits the configured Base44 origin.

## Acceptance Criteria

The slice is complete when:

1. Creating an event starts at most one Marble 1.1 operation.
2. Event creation still succeeds when World Labs is unavailable.
3. Operation and asset state survive restarts in D1.
4. The public world API returns no provider secrets or private event fields.
5. `/world/{event-slug}` always renders a coherent Lantern Diorama state.
6. A ready world loads an appropriate SPZ asset through SparkJS.
7. RSVP count changes add participant lanterns without regenerating the world.
8. The ready state displays the participant constellation.
9. Basic orbit/touch and participant selection work without being required to
   understand the event.
10. Reduced-motion, mobile, and WebGL-failure states remain usable.
11. Base44 can embed the canvas using only the event slug.
12. Existing creation, RSVP, and management tests still pass.
