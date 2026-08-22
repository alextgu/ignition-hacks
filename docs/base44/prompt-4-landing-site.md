# Prompt 4 — Landing / demo site

Build this as a **separate Base44 app** from the product, so judges can look
around without touching live event data.

---

Build a single-page marketing and demo site for **SnapPlan**, a group event
coordination app that turns a vague idea into a booked reservation.

The product story, in order:

1. **The idea.** A host types something vague — "a cozy birthday dinner in
   Toronto" — and gets back a real proposal.
2. **One link.** Guests tap once to say when they're free and whether the
   price works. No accounts, no group-chat scrollback.
3. **A world, not a form.** The event becomes an explorable 3D scene generated
   from the host's description, which fills in as people join.
4. **It makes the call.** When the group agrees, a voice agent phones the
   venue and negotiates within limits the host set — and everyone watches the
   call happen live, line by line.
5. **The pass.** The scene becomes the group's ticket and keepsake.

## Sections

- **Hero** — the product name, a one-line promise, and one screenshot slot.
  Big type, lots of air, a single primary call to action ("See a live
  event").
- **The problem**, told in three short lines: forty-message threads, six
  people comparing calendars by hand, someone eventually giving up and
  calling the restaurant.
- **How it works** — the five steps above as a horizontal scroll on desktop
  and a vertical stack on mobile, each with an illustration slot and two
  sentences.
- **The live call** — the standout section. A faked but convincing animated
  replay of the telemetry timeline: timestamps ticking, agent and venue lines
  appearing in turn, a counter-offer callout, then a green "Secured" banner.
  It should loop on a delay, and it should be the thing a visitor watches to
  the end. Use realistic dialogue about a table for six on a Friday at 7pm.
- **Built with** — a simple row naming World Labs for the spatial scenes and
  ElevenLabs for the voice agent.
- **Footer** — the team, the hackathon, and a link to the live app.

Leave clearly-labelled placeholder slots for screenshots and a demo video
embed. Don't invent testimonials, logos, press quotes, user counts, or
metrics — no fake social proof anywhere.

## Design

Same visual language as the product so they read as one thing: deep dusk-blue
base, one warm amber accent, generous spacing, large confident type, rounded
cards with soft shadows. Light and dark both supported.

Motion earns its place: content fades up gently as it enters view, the call
replay animates, nothing else moves. No parallax, no autoplaying audio, no
scroll hijacking.

Fast and self-contained: no external image or font CDNs, everything inline.
Must be flawless at 390px wide, and must not scroll horizontally at any
width.
