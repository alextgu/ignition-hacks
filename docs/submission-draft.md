# SnapPlan — Devpost submission draft

**Status: draft.** Anything in `[CONFIRM]` depends on what actually ships —
don't submit those claims until you've seen them work. Nothing here describes
a feature that doesn't exist.

---

## Project name

**SnapPlan** — *[CONFIRM: project.md flags this as a working title that may
be renamed. Decide before submitting.]*

Tagline: **From "we should get dinner sometime" to a confirmed reservation,
without the group chat.**

---

## Inspiration

Every group plan dies the same way. Someone says "we should get dinner." Six
people say "I'm free most nights." Forty messages later nobody has picked a
date, one person has quietly decided it's too expensive to say out loud, and
the whole thing evaporates.

The work isn't hard, it's just nobody's job. Someone has to collect everyone's
availability, guess a budget nobody will admit to, and then actually call the
restaurant. That last part is why plans stall at the finish line — the group
agrees, and then no one wants to make the phone call.

We wanted the part after "yes, Friday works" to happen on its own. And we
wanted the plan to feel like something, not like a scheduling poll — so the
event shows up as a place you can look at, not a grid of checkboxes.

---

## What it does

A host types one vague sentence: *"a cozy birthday dinner in Toronto."*

1. **It builds a proposal.** From that sentence plus a few taps — rough area,
   group size, two or three possible nights, a price range — SnapPlan creates
   an event with two links: a public one to drop in the group chat, and a
   private host link.
2. **Guests answer in fifteen seconds.** Name, tap the times that work, and
   one of three buttons on the price: **Works / Flexible / Too much.** No
   account, no login. Reopening the link lets them edit their answer, and the
   same browser can't accidentally double-respond.
3. **The event becomes a place.** The host's description is turned into an
   explorable 3D scene by World Labs' Marble model — a room with the right
   light and the right number of seats — which fills in with guests as they
   join.
4. **It reads the room.** The host dashboard shows availability overlap, price
   comfort, and one plain-language verdict: *"Friday works for five of six,
   nobody flagged the price — this group is ready."*
5. **Then it makes the call.** The host taps **Call venue**, and an ElevenLabs
   voice agent phones the restaurant, asks for the table, handles
   counter-offers, mentions the group's dietary needs, and reads the booking
   back to confirm — all inside limits the host set. Everyone watching the
   link sees the call unfold live, line by line, on their phone.
6. **You get a pass.** Once it's booked, the scene becomes the group's ticket:
   the confirmed time, who's coming, and a calendar file that actually lands
   in your phone's calendar.

The thing we care most about: **it never claims a booking that didn't
happen.** If the venue was ambiguous, or the agent hit a limit it wasn't
allowed to cross, it says "needs your attention" — never "confirmed."

---

## How we built it

**The coordination app** is built on **Base44** — entities, pages, and Deno
backend functions, using its realtime layer to stream the live call to every
open screen at once. *[CONFIRM: describe what you actually built there.]*

**The spatial scenes** come from the **World Labs World API** (Marble). We map
the host's description plus the structured answers into a single prompt, fire
`worlds:generate`, and poll the operation until the world is ready — roughly
five minutes, so it happens in the background while people are still RSVPing.
We store the viewer URL and the thumbnail, and the thumbnail doubles as the
link-preview image when the event gets shared.

**The voice agent** is the **ElevenLabs Agents Platform** over **Twilio**. One
agent is configured once; every call gets its context injected at dial time
through dynamic variables and a per-call prompt override. The system prompt is
generated from the group's actual data, and it encodes the host's negotiation
bounds as hard limits — a per-person ceiling it cannot exceed, no payment
details, no non-refundable deposits, and no accepting a time outside what the
group agreed unless they marked themselves flexible. It's also instructed to
say plainly that it's an AI assistant if anyone asks.

**Both integrations sit behind a boundary.** The app hands over a `WorldSeed`
or an `EventBrief` and gets back a `WorldResult` or a `BookingCallResult`.
Nothing about either vendor's API crosses that line. Each has a real adapter
and a **deterministic mock**, and a factory picks between them from
configuration — so the entire product runs, end to end, with **zero API keys
set**. 98 unit tests, all with mocked network calls; nothing in CI ever dials
a phone.

---

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

## What's next for SnapPlan

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
