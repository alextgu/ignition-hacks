# Plan-it — Devpost submission draft

**Status: draft.** Anything in `[CONFIRM]` depends on what actually ships —
don't submit those claims until you've seen them work. Nothing here describes
a feature that doesn't exist.

---

## Project name

**Plan-it**

Say it out loud and it's two things at once: *plan it* — the imperative — and
*planet*, which is what every event actually becomes here. World Labs
generates a little world for each plan, guests appear inside it, and it ends up
as the group's keepsake. The pun is the product, and the logo is a planet.

Tagline: **Start with the vague version. Plan-it does the rest.**

*[CONFIRM the domain. `planit.com`, `planitgroup.com` and several App Store
apps already exist, and `planit-co.com` is an event-management company — so
grab a TLD that does the work instead. `plan-it.party` or `planit.party` reads
as one word, fits hangouts and parties, and keeps the planet logo intact.]*

## Inspiration

Somewhere during my internship at an Events AI startup, the CEO mentioned how
it would be cool to have a quick event setup and invite. To be an outstanding
intern and to kill two birds with one stone, I brought my personal experiences
with planning quick events (a hangout, party, corporate event) into this
project.

## What it does

Instead of a traditional group chat where people don't respond, cancel last
minute, and make you feel like the only person who wants the plan to succeed,
Plan-it makes planning events incredibly simple and fun.

Simply go to the admin page and fill in the details — an interactive planit
forms, making the plan. Send the invite link to your friends and they get all
the details in one place, while your planit updates live. Once your planit is
ready, the admin can continue to launch, where an orchestration of agents
books the event and sends the schedule, itinerary and costs to each
individual. For plans that don't get past the planning stage, planit has
fallback loops to modify the event and cater to the user's needs. Once the
event is in action, each user can add photos and details to the planit — a
final planit artifact for the group to reflect on!

## How we built it

Plan-it is a Base44 app with two external services behind it: World Labs
turns the host's description into an explorable world, and ElevenLabs makes
the actual phone call to the venue. Both sit behind a boundary — the app
hands over a `WorldSeed` or an `EventBrief` and gets back a result. It never
sees a vendor endpoint. Each one has a real adapter and a deterministic mock,
and the app picks between them from config, so the whole product runs end to
end with **zero API keys set**. 98 unit tests, every network call mocked.
Nothing in the test suite ever dials a phone.

### World Labs — the planit itself

The host's sentence plus their structured answers become one prompt: the
mood, the event type, the city, the time of day, the price character, and the
group size, which the prompt uses to ask for a room with the right number of
places to gather. That goes to `worlds:generate` on `marble-1.1`, which
returns an operation rather than a world.

Generation takes about five minutes, which shaped the design more than
anything else. The event has to be shareable the instant it's created, so we
generate **once per event** — never on RSVP — behind an animated fallback,
and swap the real scene in when it's ready. Operations expire after an hour,
so an expired one is treated as a failure that silently keeps the fallback;
guests never see a world error. We also reuse the returned thumbnail as the
link preview image, so a planit dropped in a group chat looks intentional.

One thing we couldn't verify: World Labs doesn't publicly document an
iframe-embed contract, so their headers may refuse framing. We render the
iframe *and* always offer a new-tab link, because the guaranteed path has to
exist.

### ElevenLabs — the agent that actually calls

One agent, configured once. Every call gets its context injected at dial time
through dynamic variables and a per-call prompt override, rather than
creating an agent per booking.

The system prompt is generated from the group's real data, and the host's
negotiation range is written into it as **hard limits**: a per-person ceiling
it cannot exceed, no card or payment details, no non-refundable deposits, and
no accepting a time outside what the group agreed unless they marked
themselves flexible. If the venue pushes past those, the agent is instructed
to say it needs to check with the group and end politely. It's also told to
state plainly that it's an AI assistant if anyone asks, and never to claim
otherwise. Call recording is off by default, because recording a restaurant
can require their consent.

Polling the conversation is where the care went. `processing` is not `done` —
the call has hung up but the analysis is still running — so we keep reporting
"wrapping up" instead of showing an empty result. And a finished call is
**never** reported as booked without positive evidence: no analysis, or an
unknown result, comes back as `needs_followup`, and the UI has no path that
renders that as success. Telling a group they have a table when they don't is
the one failure we refused to make possible.

Twilio carries the call, connected through ElevenLabs' native integration.

### Base44 — the app and the live loop

Entities, pages, and Deno backend functions. Secrets come from
`secrets.get()` inside the handler, and all writes from functions use
`asServiceRole` since a polling call has no user context.

The best thing Base44 gave us is the live loop. As the call progresses we
append events to a `CallEvent` entity, and every open screen subscribes to
it — so the whole group watches the negotiation arrive line by line, on their
own phones, at the same time. No refresh, no polling in the UI.

We deliberately did *not* use `waitUntil()` to place the call. Base44
documents it as best-effort with no completion guarantee, and a phone call is
not something you want to *probably* happen. The outbound request returns in
under a second, so it goes inline and we poll for the outcome.

*[CONFIRM: replace with what you actually built — entity names, pages, the
functions you shipped.]*

### Keeping it honest

Everything above works with the mocks too. The simulated call unfolds over
twelve seconds with the transcript appearing line by line, built from the
real brief, so the venue name, the host's name, the party size and the
dietary notes all show up in the dialogue. It's stateless — the brief and
start time are encoded in the id — so it behaves identically after a
redeploy. That's what lets us rehearse the demo on a plane, and it's why a
dead API can't take the presentation down.

## Challenges we ran into

**Apple Wallet passes were a trap we nearly walked into.** We planned a proper
`.pkpass` for the confirmed event. Then we read the fine print: passes must be
cryptographically signed with a Pass Type ID certificate from a paid Apple
Developer account, provisioning takes one to two days, and iOS silently
refuses anything unsigned. The npm library imports fine and fails at signing —
we'd have burned hours finding that out at 3am. We built a web pass with a
real `.ics` download instead. It works on every phone, needs no certificates,
and honestly fits the product better.

**"Best-effort" is not the same as "background."** Base44 has a `waitUntil()`
for work that outlives a response, and putting the phone call in it was our
first instinct. Its docs say it isn't guaranteed to complete or retry. Placing
a call is not something you want to *probably* happen — so calls go inline
(the request returns in under a second) and we poll for the outcome.

**Two agents, one repo, silently incompatible.** We had parallel work on the
integrations and the app foundation. The env template said `WLT_API_KEY`; the
integration code read `WORLDLABS_API_KEY`. Git merged both files perfectly
because they never touched the same lines. The failure mode was the nasty
kind: a correctly-filled `.env` reads as empty, the code quietly falls back to
its mock, and the demo looks *completely fine* while never calling the real
API. We now accept every spelling as an alias, and we keep an `SSOT.md` that
every agent has to update in the same commit as its work.

**Node code doesn't run on Deno.** `Buffer`, `node:crypto`, `process.env` —
three small things standing between working code and a platform that couldn't
run it. We rewrote them onto web standards (`TextEncoder`, `btoa`, a pure
FNV-1a hash, injected config) so the same tested modules run in Node, Deno,
and a browser unchanged.

**Making a five-minute API feel instant.** World generation takes ~5 minutes
and its operations expire after an hour. The event has to be shareable the
second it's created, so the scene generates in the background behind an
animated fallback and swaps in when it's ready. We also can't confirm that
World Labs' viewer allows iframe embedding — it isn't documented — so we
render the iframe *and* always offer a new-tab link.

**Never lie about a booking.** The temptation is to treat "the call finished"
as "the table is booked." We made that structurally impossible: without
positive confirmation the result is `needs_followup`, and the UI has no path
that renders that as success.

---

## Accomplishments we're proud of

- **The demo cannot fail from a dead API.** Both integrations have
  deterministic mocks the caller can't distinguish from the real thing. No
  keys, no network, still a complete working product — including a simulated
  call that unfolds over twelve seconds with the transcript appearing line by
  line.
- **The live call is genuinely fun to watch.** Everyone holding the link sees
  the negotiation happen at the same time, on their own phone. It's the moment
  people lean in.
- **The voice agent has real guardrails,** not just a nice prompt. The host's
  price ceiling, time tolerance, and seating rules are hard limits, and it
  will end a call politely rather than exceed them.
- **98 tests, zero live API calls.** We can refactor the integration layer
  with confidence at hour twenty of a hackathon.
- **A clean boundary.** Two sponsor APIs, and the app knows the name of
  neither. Swapping providers would touch one folder.

---

## What we learned

**Read the fine print before you write the code.** Two of our best-sounding
features died on details buried in vendor docs — a signing certificate and the
phrase "best-effort." Ten minutes of reading saved hours of building.

**Mock first, and mock honestly.** Building the deterministic fallback *before*
wiring the real API meant we always had something to show, and it forced the
boundary to be clean. The mock isn't a stub — it's demo insurance, and it's
the thing that let us rehearse.

**AI builders confidently invent APIs.** Handing a builder the verified
endpoints, headers, and status enums produced dramatically better results than
asking it to "integrate with ElevenLabs." Specificity is the whole game.

**Parallel agents need a shared source of truth, and it has to be honest.**
Our `SSOT.md` was accurate about what it *knew* and explicitly flagged what it
didn't — which is what let us catch the env-var mismatch instead of debugging
it live on stage.

**The scariest bug is the one that looks like it works.** A silent fallback to
a mock is worse than a crash. Fail loudly, or don't fail.

---

## What's next for Plan-it

- **Venue discovery.** Right now the host names the restaurant. Next: suggest
  places that fit the group's area, budget, and party size, then call the best
  one — and fall back to the next if the first says no.
- **Real invitations.** Anonymous browser identity stops accidental duplicates
  but not deliberate ones. Per-guest invite links or phone verification would
  fix it properly.
- **Let the agent handle more.** Rescheduling, cancelling, calling ahead about
  a late arrival — all the phone calls nobody wants to make.
- **Splitting the bill.** Deliberately out of scope for this build. Computing
  the minimum set of peer-to-peer transfers so five people don't owe each other
  in a circle is a genuinely interesting graph problem.
- **Living keepsakes.** The world is generated once today. Letting it change
  with the season, the weather, or who actually showed up would make it worth
  revisiting.
- **Native surfaces.** A Messages App Clip so the whole flow happens inside
  the group chat, and a signed Wallet pass once there's a developer account.

---

## Tools & integrations

| | |
|---|---|
| **World Labs — World API (Marble)** | Text-to-3D world generation. `marble-1.1`, `worlds:generate` + operation polling, thumbnail reused as the link-preview image. |
| **ElevenLabs — Agents Platform** | The outbound voice agent. Per-call prompt override and dynamic variables, conversation polling for transcript and post-call analysis. |
| **Twilio** | Telephony for the outbound calls, connected through ElevenLabs' native integration. |
| **Base44** | App platform — entities, pages, Deno backend functions, realtime subscriptions, secret storage. |
| **TypeScript** | The integration layer, written runtime-agnostic so it runs on Node and Deno. |
| **Node test runner** | 98 unit tests, no test framework dependency, all network calls mocked. |

*[CONFIRM: add anything else you actually used — hosting, fonts, the video
tooling.]*
