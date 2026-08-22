# World Labs integration setup

This document covers the World Labs ("World API" / Marble) integration living
under `src/integrations/worldlabs/`. It is the only integration point the
rest of the application should need to know about — see "Boundary" below.

## What this integration does

Converts an approved `WorldSeed` (the host's event description plus the
structured mood/location/time/price/group-size fields from project.md) into
a World Labs generation request, starts generation, and exposes polling for
completion. If World Labs is not configured, unreachable, or fails, callers
get a deterministic offline fallback world instead of an error — per
project.md, "World generation must fail gracefully."

## Public contract (boundary)

```ts
import { generateWorld, getWorldStatus } from "src/integrations/worldlabs";

const result = await generateWorld(seed); // { status: "pending", externalId, ... }
// ... later, e.g. from a polling endpoint or background job ...
const updated = await getWorldStatus(result.externalId);
```

`WorldSeed` and `WorldResult` (see `src/integrations/worldlabs/types.ts`) are
the only types that should cross this boundary. Application code must not
import `worldLabsAdapter.ts`, `mockAdapter.ts`, or `internalApiTypes.ts`
directly — only `index.ts` (and `types.ts` for the plain type declarations).

Whether `generateWorld`/`getWorldStatus` hit the real World Labs API or the
built-in deterministic mock is decided once, from environment variables, and
is invisible to the caller either way (this satisfies "the rest of the
application must be able to use the mock without knowing whether World Labs
is configured").

## Required environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `WORLDLABS_API_KEY` | For real generation | — (mock is used if unset) | Secret API key from the World Labs Platform. **Never commit this.** |
| `WORLDLABS_BASE_URL` | No | `https://api.worldlabs.ai` | Override for testing against a staging/mock server. |
| `WORLDLABS_MODEL` | No | `marble-1.1` | Generation model. `marble-1.1-plus` supports larger/outdoor worlds at higher credit cost. |
| `WORLDLABS_TIMEOUT_MS` | No | `15000` | Per-HTTP-call timeout (the generate/poll calls themselves, not total generation time). |
| `WORLDLABS_FORCE_MOCK` | No | `false` | Set to `true` to force the deterministic mock even when an API key is present (useful for demos/offline dev). |

No `.env.example` file exists yet in the repository root; once the main
application creates one, add these same four variables to it. Secrets are
read only from `process.env` — nothing is hardcoded, logged, or persisted.
`describeWorldLabsConfig()` (exported from `index.ts`) returns a safe,
key-redacted summary of the active configuration for debugging.

### Getting an API key

1. Create/sign in to a Marble account at <https://platform.worldlabs.ai/>.
2. Generate a key from the [API Keys page](https://platform.worldlabs.ai/api-keys).
3. Purchase credits from the [billing page](https://platform.worldlabs.ai/billing) — generation is credit-metered.
4. Set `WORLDLABS_API_KEY` in the environment (never in source control).

## Official API flow

Source: World Labs API quickstart (<https://docs.worldlabs.ai/api>) and the
World API announcement (<https://www.worldlabs.ai/blog/announcing-the-world-api>).

1. **Start generation** — `POST https://api.worldlabs.ai/marble/v1/worlds:generate`
   with header `WLT-Api-Key: <key>` and a JSON body:
   ```json
   {
     "display_name": "birthday dinner — Toronto",
     "model": "marble-1.1",
     "world_prompt": { "type": "text", "text_prompt": "..." }
   }
   ```
   This returns an **operation** object immediately
   (`{ operation_id, done, metadata, response? }`); it does not wait for
   generation to finish.
2. **Poll for completion** — `GET /marble/v1/operations/{operation_id}`,
   repeated until `done: true`. World Labs documents typical generation time
   as **about 5 minutes**; operations **expire 1 hour** after creation.
3. **Read the result** — once `done: true`, the same operation response
   includes the completed World object under `response`, with
   `response.assets.thumbnail_url` (preview image) and
   `response.world_marble_url` (shareable viewer link). A separate
   `GET /marble/v1/worlds/{world_id}` endpoint exists to re-fetch a world
   later, but this adapter doesn't need it: the operation response already
   carries everything `WorldResult` needs.

This adapter maps that flow onto the required contract as:

- `generateWorld(seed)` → calls step 1. If the operation is already `done`
  (unlikely, but the API allows it), it returns `status: "ready"` directly;
  otherwise `status: "pending"` with `externalId` set to the `operation_id`.
- `getWorldStatus(externalId)` → calls step 2 with that `operation_id` and
  maps the result the same way.

Every network failure — bad key, timeout, outage, malformed JSON, non-2xx
status — is caught and converted into `{ status: "failed", error }`. Neither
method ever throws, so callers can treat "World Labs is down" the same way
they treat "World Labs returned an error."

## Generation modes — escalating fidelity

`generateWorld` picks the richest mode the seed supports. The app doesn't
choose an endpoint; it just supplies whatever it has.

| Seed carries | Mode sent | Result |
|---|---|---|
| nothing extra | `type: "text"` | A plausible room from the host's description |
| `venuePhoto` | `type: "image"` + `text_prompt` | The **actual venue** from one photo |
| `guestPhotos` (2–8) | `type: "multi-image"` | The room the group was **really in**, from their own photos |

Rules the adapter enforces:

- `guestPhotos` beats `venuePhoto` — photos from the event are always better
  evidence than a listing image.
- A single guest photo degrades to `image` mode rather than sending a
  one-item multi-image request.
- More than 8 guest photos are truncated to 8 (World Labs' documented cap).
- `direction` (`front`/`right`/`back`/`left`) maps to azimuth 0/90/180/270.
  Unlabelled photos are spread evenly around the room.
- `expansive: true` selects `marble-1.1-plus` for outdoor and large scenes.

Images can be a public `uri` or a `mediaAssetId` already uploaded to World
Labs. Uploading via `media-assets:prepare_upload` is **not implemented** —
public URLs only for now.

## Render assets — running our own viewer

A ready `WorldResult` carries an optional `assets` block so the app can render
the world itself instead of only linking out:

```ts
assets?: {
  splatUrls?: { low?: string; medium?: string; full?: string }; // 100k / 500k / full_res
  colliderMeshUrl?: string;   // GLB, raycast to place objects on real geometry
  panoUrl?: string;
  scale?: number;             // from semantics_metadata
  groundPlaneOffset?: number; // where the floor is
  caption?: string;
}
```

This exists for **SparkJS**, World Labs' own THREE.js Gaussian-splat renderer
(`npm i @sparkjsdev/spark`), which their docs call "the recommended way to
render World Labs splat assets in the browser." It reads SPZ directly and
fuses splats with ordinary THREE.js meshes, so guest markers can be real
objects standing in the generated room.

`scale` and `groundPlaneOffset` are the important pair — they're how you place
markers on the actual floor rather than guessing. Load `low` on mobile
(Spark's splat budget is roughly 500K–2.5M depending on device).

Every field is optional and `assets` is absent entirely when World Labs
returns no splats. A missing splat must degrade to the link-out viewer or the
animated fallback — never an error.

## Limitations and open questions

- **Embedding.** World Labs' publicly documented output is a shareable
  viewer URL (`https://marble.worldlabs.ai/world/{world_id}`, exposed as
  `world_marble_url`). The public docs describe this as a link for viewing
  in a browser; they do **not** document an official `<iframe>`-embed
  contract (e.g. required query params, `X-Frame-Options`/CORS behavior for
  cross-origin embedding). This adapter returns that URL as `embedUrl`
  as-is. Before relying on in-page iframe embedding for the guest/host
  pages, verify in a real browser that the URL renders inside an `<iframe>`
  from your domain — if it does not, the frontend should instead open it in
  a new tab/window, which is guaranteed to work.
- **Generation time.** ~5 minutes typical, per World Labs' own docs. This is
  far too slow for a synchronous request — the app must treat world
  generation as background work (kick off at event-creation time per
  project.md, show the animated fallback, and swap in the real embed once
  `getWorldStatus` reports `ready`).
- **Operation expiry.** Operations expire 1 hour after creation. If a poll
  loop can legitimately run longer than that (e.g. a paused serverless
  function), persist `externalId` and be prepared for a `getWorldStatus`
  call on an expired operation to come back as `failed` — treat that the
  same as any other failure (fall back to the mock/animated state; do not
  automatically regenerate, since project.md explicitly says the world
  should not be regenerated after every request).
- **We render splats ourselves via a dependency.** SparkJS + `three` is a
  real addition, not free. Anything that can't do WebGL2 needs the fallback.
- **Multi-image fills in the unseen.** Areas the cameras never covered are
  generated "plausibly", so a reconstruction is a keepsake, not a survey.
  Don't describe it as a replica.
- **Marble does not generate people.** Their docs are explicit that it builds
  environments "rather than focusing on isolated or central objects, such as
  people or animals." The prompt asks for an empty room deliberately; guests
  are added as our own objects.
- **Thumbnails.** `assets.thumbnail_url` is only guaranteed once `done` is
  `true`; there is no separate "preview while pending" image from the API
  itself. The app's own animated/mock fallback fills that gap.
- **Browser/WebGL access.** The Marble viewer renders 3D Gaussian splats,
  which requires WebGL2 in the guest/host browser. No official minimum
  browser version is documented publicly; assume modern evergreen browsers
  only, and keep the animated-fallback path as the guaranteed baseline for
  older or unsupported browsers.
- **Rate limits.** No explicit rate-limit numbers are documented publicly at
  the time of writing. Credits (billing) are the documented constraint.

## Deterministic mock / fallback adapter

When `WORLDLABS_API_KEY` is unset, or `WORLDLABS_FORCE_MOCK=true`, `index.ts`
returns `MockWorldLabsAdapter` instead of the real one. It:

- Never makes a network call and always resolves with `status: "ready"`
  immediately — so local development and demos never depend on World Labs
  being reachable or configured.
- Is fully deterministic: the same `WorldSeed` always produces the same
  `embedUrl`/`previewImageUrl`/`externalId`, derived from a SHA-256 hash of
  the seed (see `mockAdapter.ts`). No server-side state is kept —
  `getWorldStatus` decodes the seed back out of `externalId` and re-derives
  the same result, so it works the same in a single process or across
  serverless invocations.
- Returns a self-contained preview image (`data:image/svg+xml;base64,...`)
  and a self-contained, lightly animated embed page
  (`data:text/html;base64,...`) reflecting the seed's mood/event
  type/location/group size — so the "fallback" is a real, presentable visual
  rather than a placeholder string.

This is the adapter used automatically whenever the real API is not
configured or forced off — it is what project.md refers to as the
"dependable fallback" and "animated fallback."

## Running the tests

Tests live in `src/integrations/worldlabs/__tests__/` and use Node's
built-in test runner (`node:test`) and `node:assert` — no test framework
dependency was added. They mock `global.fetch` and never make a live network
call. Node 22+ can run the TypeScript sources directly via its built-in
type-stripping support:

```sh
node --experimental-strip-types --test src/integrations/worldlabs/__tests__/*.test.ts
```

(On Node 23.6+, the `--experimental-strip-types` flag is on by default and
can be omitted.) If/when the main application adopts a project-wide test
runner (Jest/Vitest/etc.), these files should port over with minimal changes
since they only use `test`/`assert` from `node:*` — no runner-specific APIs.

## Files in this module

```
src/integrations/worldlabs/
  types.ts               Public contract: WorldSeed, WorldResult, WorldLabsAdapter
  config.ts               Environment variable loading (no secrets logged)
  promptMapper.ts          WorldSeed -> World Labs text prompt / display name
  internalApiTypes.ts     World Labs API request/response shapes (NOT exported publicly)
  worldLabsAdapter.ts      Real adapter (World API calls)
  mockAdapter.ts           Deterministic offline adapter
  index.ts                 Public entry point / adapter factory
  __tests__/               Unit tests (mocked fetch only, no live calls)

Shared with other integrations:
  src/integrations/shared/httpJson.ts   fetch wrapper: timeout + normalized failure handling
```
