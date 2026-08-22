# Base44 build track — read this first

Four prompts to paste into Base44, in order, plus an honest read on the three
feature ideas. Written 2026-08-22.

## Verdict on the three suggestions

I checked all three against Base44's actual docs. **Every platform feature
they reference is real**: Deno runtime with `npm:` imports, `secrets.get()`
and `waitUntil()` from `base44:runtime`, `asServiceRole.entities`,
`.subscribe()` realtime, 5-minute function timeout, and per-function webhook
URLs at `https://<app-domain>/functions/<function-name>`.

That said, they are not equally good hackathon bets.

### 1. Live "air-traffic control" telemetry stream — **BUILD THIS**

The strongest of the three by a wide distance, and it's the one I've written
the most prompt detail for.

- It is the demo. A judge watching a phone negotiate a reservation in real
  time, with lines appearing on every screen in the room at once, is a
  genuinely memorable thirty seconds.
- It's low risk. `.subscribe()` is a first-party feature, and the data it
  streams is exactly what the ElevenLabs adapter already returns
  (`transcript`, `outcome`, `summary`).
- It works with **no credentials at all**, because the mock adapter
  simulates a call over ~12 seconds with the transcript revealed line by
  line. You can rehearse and demo this on a plane.

One correction to the suggested execution: it proposes using a **webhook sink**
as the mechanism. Do the polling version first — a `poll-booking-call`
function that writes `CallEvent` rows. Webhooks need a publicly reachable
URL configured in a third-party dashboard, which is one more thing to break
on demo day, and polling gives you an identical UI for less risk. Add the
webhook after the polling version works, if at all.

### 2. Apple/Google Wallet pass — **DON'T. It has a hard blocker.**

This one looks great on paper and will cost you the hackathon.

`.pkpass` files must be cryptographically signed with a Pass Type ID
certificate from an Apple Developer account. Per Apple and PassKit's own
docs: there is **no alternative** to an Apple Developer account, it costs
**$99/year**, and provisioning takes **1–2 days**. iOS refuses unsigned
passes outright. Google Wallet has a parallel problem: a Google Cloud
service account plus an Issuer account that needs approval.

`passkit-generator` will import fine in a Base44 backend function. It will
then fail at signing time, and you will lose hours discovering that.

**Build the web pass instead.** project.md already asks for exactly this —
"the scene becomes the event's interactive digital pass and keepsake." A
mobile-first pass page at `/pass/:slug` with the world as the backdrop, the
confirmed details, each guest's name, and a **real `.ics` calendar download**
gives you the entire demo beat with zero certificates. `.ics` is a plain
text file, works on every phone, and genuinely lands in the guest's calendar
app. Prompt 3 builds it.

If you have an Apple Developer account already provisioned, revisit this
after everything else works. Not before.

### 3. Quorum engine + payment-splitting graph — **CUT THE SPLITTING**

Two separate things bundled together.

- **The quorum/consensus part** is core product and prompt 1 builds it.
- **The payment-splitting graph minimization is scope creep**, and
  project.md explicitly lists "Payment collection and production billing"
  under non-goals for the first slice. A clever algorithm judges never see
  the point of is worse than nothing — it costs build time and adds a
  screen that distracts from the actual story.
- **The `waitUntil()` part is actively risky.** Base44's docs say
  `waitUntil()` is "best-effort" and "isn't guaranteed to complete or
  retry, so don't rely on it for critical operations." Placing a phone call
  is a critical operation. **Do not initiate calls in `waitUntil()`.** The
  outbound-call request returns in under a second, so just do it inline in
  the request and poll for the result. `waitUntil()` is fine for
  fire-and-forget logging.

The "split the screen and show the Activity Monitor" idea is worth keeping
as a *presentation* choice — it costs nothing and shows real work happening.
Just don't build features solely to populate it.

## The architecture question you need to settle with codex

**Base44 generates the whole app — routes, database, UI.** That is the same
territory the coordination-spine agent owns. Two possibilities:

- **Base44 replaces the hand-built app.** Then codex should stop on
  scaffolding/DB/routes and move to Base44 prompt review and demo polish.
  The `src/integrations/**` modules in this repo become reference
  implementations to port into backend functions (see below).
- **Base44 is a parallel demo track.** Then it needs its own name and
  neither track is finished by Saturday. This is how hackathon teams lose.

Pick one and write it into `SSOT.md`. My read: if you're going Base44, go
all in — it's the faster path to criteria 1–5, which are the ones currently
blocking everything.

### What happens to the TypeScript modules already in this repo

They port, with a small change. Base44 backend functions run **Deno**, which
supports `node:` specifiers, so `node:crypto` and `Buffer` work — but the
import lines need to be explicit (`import { Buffer } from "node:buffer"`).

More useful than the code itself: **the verified API contracts**. AI builders
hallucinate third-party endpoints constantly. Prompt 2 hands Base44 the
exact endpoints, headers, payload fields, and status enums, all verified
against current vendor docs. That's the part worth copying over, and it's why
prompt 2 is written the way it is.

## How to use these prompts

Paste them **one at a time**, in order, and confirm the app builds and runs
between each. One mega-prompt produces mush; staged prompts produce an app.

| # | File | Builds |
|---|---|---|
| 1 | `prompt-1-foundation.md` | Entities, create flow, guest RSVP, host dashboard, quorum |
| 2 | `prompt-2-integrations.md` | World Labs + ElevenLabs backend functions with verified contracts |
| 3 | `prompt-3-telemetry-and-pass.md` | Live call telemetry stream, web pass, `.ics` download |
| 4 | `prompt-4-landing-site.md` | Separate marketing/demo site |

After prompt 1, add your secrets in Base44's project settings before running
prompt 2. Names are in prompt 2's env table.

**Everything must work with no secrets set.** Prompt 2 tells Base44 to build
the mock fallbacks. Verify that before you add real keys — it's your demo
insurance.
