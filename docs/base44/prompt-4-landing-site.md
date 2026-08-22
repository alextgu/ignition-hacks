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

## Design system — use these exact values

The visual direction is **"warm paper, dark line"**: the app is light, warm
and editorial; only the live call panel and the pass backdrop go dark. Do not
build a system-wide dark mode.

The demo is a **recorded video embedded on a website**, so video compression
is the binding constraint. That drives a few hard rules:

- The dark panel is **flat `#0C0A09`, never a gradient** — gradients band
  badly under H.264/VP9.
- **No film grain, noise textures, or glassmorphism blur** over busy content.
- **Borders are 1.5px minimum.** 1px hairlines vanish or shimmer after
  compression.
- **Body text is 17px and nothing goes below 14px anywhere** — a 1440px
  capture embedded at ~800px is scaled to about 55%.
- **Motion is slow and short**: 180ms ease-out for hovers, 240ms for
  entrances, fades and 8px slides only. No springs, no bounces, no continuous
  animation except one slow drift on the world scene. Respect
  `prefers-reduced-motion`.

### Light tokens — app chrome, the default everywhere

```
--bg #FAF8F5   --bg-raised #FFFFFF   --bg-sunken #F2EEE8
--text #1A1714   --text-secondary #5C544B   --text-tertiary #8A8177
--border #E8E2DA   --border-strong #D6CEC2
--accent #C2410C   --accent-hover #9A3412   --accent-bg #FEF1E8
--success #15803D   --warning #B45309   --danger #B91C1C
--shadow: 0 1px 2px rgba(26,23,20,.04), 0 4px 12px rgba(26,23,20,.06)
--shadow-lifted: 0 2px 4px rgba(26,23,20,.05), 0 12px 32px rgba(26,23,20,.10)
```

### Dark tokens — the call panel and pass backdrop ONLY

```
--d-bg #0C0A09 (flat)   --d-surface #1C1917   --d-border #2E2A27
--d-text #FAFAF9   --d-text-secondary #A8A29E
--d-accent #FB923C   --d-success #4ADE80   --d-warning #FBBF24   --d-danger #F87171
```

One accent, one success, one warning. Do not add more colours.

### Type

```
Display   Fraunces, Georgia, serif       — event titles, hero, the pass only
UI        Inter, system-ui, sans-serif   — everything else
Mono      "JetBrains Mono", ui-monospace — timestamps, references, IDs
```

Hero 44/1.1 (32 mobile) · Page title 32/1.2 · Section 24/1.3 · Card title
19/1.4 · **Body 17/1.6** · Small 15/1.5 · Label 14 uppercase .06em tracking ·
Mono 14. Weights 400 body, 600 headings and labels.

The serif display against the sans UI is what makes this read editorial
instead of like a dashboard template. Use Fraunces for titles and the pass
only — never body copy or labels.

### Space and shape

Spacing scale `4 8 12 16 24 32 48 64 96` — be generous, whitespace is most
of the "clean". Radius `10px` panels and cards, `6px` inputs, `999px` pills.
Reading columns max 680px, dashboard max 1080px. Tap targets at least 44px
tall. Support light appearance only — no theme toggle.

### Anti-patterns

No purple/blue gradients, no glassmorphism over busy content, no neon, no
pure `#000` or `#FFF`, no second accent colour, no emoji as UI iconography,
no dark mode toggle, no text drop shadows, no centred long body copy, no
hairline borders on structural elements.

### Specific to the landing site

Same tokens as the product so the two read as one thing.

The **live call replay** section is the centrepiece and should use the dark
call panel treatment exactly as specified above, on flat `--d-bg`. It replays
a scripted timeline on a loop with a pause between cycles: timestamps
ticking, agent and venue lines appearing in turn, a counter-offer callout,
then the green secured bar. Use realistic dialogue about a table for six on a
Friday at 7pm. This is the thing a visitor should watch to the end.

Content fades up 8px as it enters the viewport, once, and then holds. The
call replay animates. Nothing else moves — no parallax, no scroll hijacking,
no autoplaying audio.

Self-contained and fast: inline all CSS and JS, no external image CDNs,
`data:` URIs for any graphics. Google Fonts is acceptable for Fraunces,
Inter, and JetBrains Mono, but give every face a real fallback stack.

Leave clearly-labelled placeholder slots for the demo video embed and
screenshots. No invented testimonials, logos, press quotes, user counts, or
metrics anywhere.

Flawless at 390px wide, and no horizontal scroll at any width.
