# SnapPlan design system — "warm paper, dark line"

The single source of truth for how SnapPlan looks. Every Base44 prompt in
this folder references this file. Chosen 2026-08-22.

## The idea in one line

The app is **warm paper** — light, calm, editorial, unhurried. When the voice
agent picks up the phone, the interface **goes dark** for that one panel. The
contrast is the point: a quiet planning tool that suddenly turns into a live
operations console for thirty seconds, then hands you back a paper pass.

## Why this palette, given the demo is a video on a website

The deliverable is a recorded demo embedded on the site, which makes **video
compression the binding constraint** — not projector glare, not ambient
light. That leads to a few non-obvious rules, and they matter more than
taste here:

- **Flat colour beats gradients.** H.264/VP9 render large dark gradients as
  visible banding and blocking. The light chrome compresses almost perfectly;
  the dark panel must be **flat `#0C0A09`, not a gradient**, or it will look
  cheap in the recording.
- **No film grain, no noise textures, no glassmorphism blur over busy
  content.** All three are bitrate furnaces — they eat the budget that should
  be going to your text and leave everything soft.
- **Hairlines disappear.** A 1px `#E8E2DA` border survives on a retina
  display and vanishes or shimmers after compression. Use **1.5px minimum**
  for anything structural.
- **Type runs one step larger than usual.** A 1440px capture embedded at
  ~800px is scaled to ~55%. Body text is **17px**, and nothing anywhere goes
  below **14px**.
- **Motion is slow and short.** Fast movement is what compression handles
  worst. 180–260ms ease-out, and no continuous animation except the one
  slow drift on the world scene.
- **The transcript is your captions.** Most people watch embedded video
  muted. The whole point of the telemetry stream is that the call is legible
  with no sound at all — so the on-screen lines carry the story. Treat their
  legibility as the highest-priority thing on the page.

Capture the video at **1920×1080 desktop**, with the mobile views shown as a
phone-shaped viewport inside that frame rather than as a separate vertical
recording.

## Tokens

### Light — app chrome (default everywhere)

```
--bg              #FAF8F5   warm off-white, the paper
--bg-raised       #FFFFFF   cards, inputs
--bg-sunken       #F2EEE8   wells, track backgrounds
--text            #1A1714   near-black, warm
--text-secondary  #5C544B
--text-tertiary   #8A8177   labels, timestamps
--border          #E8E2DA
--border-strong   #D6CEC2
--accent          #C2410C   burnt orange
--accent-hover    #9A3412
--accent-bg       #FEF1E8   tinted fill behind accent content
--success         #15803D
--warning         #B45309
--danger          #B91C1C
--shadow          0 1px 2px rgba(26,23,20,.04), 0 4px 12px rgba(26,23,20,.06)
--shadow-lifted   0 2px 4px rgba(26,23,20,.05), 0 12px 32px rgba(26,23,20,.10)
```

### Dark — the call panel and the pass backdrop only

```
--d-bg            #0C0A09   FLAT. never a gradient.
--d-surface       #1C1917
--d-border        #2E2A27
--d-text          #FAFAF9
--d-text-secondary #A8A29E
--d-accent        #FB923C   the signal colour
--d-success       #4ADE80
--d-warning       #FBBF24   counter-offers
--d-danger        #F87171
```

Every pair above clears WCAG AA. `--text` on `--bg` is ~15:1; `--accent` on
`--bg` is ~5.2:1; `--d-text` on `--d-bg` is ~19:1.

**Do not introduce a system-wide dark mode.** Dark is a deliberate
treatment for two specific surfaces — the live call panel and the pass
backdrop. Everything else stays paper, always. One accent colour, one
success, one warning. Resist adding more.

## Type

```
Display   Fraunces, Georgia, serif        — event titles, hero, the pass
UI        Inter, system-ui, sans-serif    — everything else
Mono      "JetBrains Mono", ui-monospace  — timestamps, references, IDs
```

The serif display against a sans UI is what makes it read editorial rather
than like a dashboard template. Use it only for titles and the pass — never
for body copy or labels.

| Role | Size / line-height | Weight |
|---|---|---|
| Hero | 44 / 1.1 (mobile 32) | 600 |
| Page title | 32 / 1.2 | 600 |
| Section | 24 / 1.3 | 600 |
| Card title | 19 / 1.4 | 600 |
| Body | **17** / 1.6 | 400 |
| Small | 15 / 1.5 | 400 |
| Label | 14 / 1.4, `.06em` tracking, uppercase | 600 |
| Mono | 14 / 1.4 | 500 |

Nothing below 14px. Anywhere.

## Space, shape, motion

- Spacing scale: `4 8 12 16 24 32 48 64 96`. Be generous — whitespace is
  most of the "clean".
- Radius: `10px` cards and panels, `6px` inputs and small controls,
  `999px` pills and chips.
- Borders: **1.5px minimum**. Cards get `1.5px --border` plus `--shadow`,
  never a heavy border alone.
- Max content width `680px` for reading columns, `1080px` for the dashboard.
- Transitions: `180ms ease-out` for hovers, `240ms ease-out` for entrances.
  Fades and 8px slides only — no scale bounces, no springs.
- Respect `prefers-reduced-motion`: drop to instant.

## Key components

**Buttons.** Primary is solid `--accent` with white text, `6px` radius, 12/20
padding, weight 600. Secondary is `--bg-raised` with a `1.5px --border-strong`
border. Tap targets ≥44px tall everywhere.

**Time-window chips.** Pill-shaped, `1.5px --border-strong`, unselected on
`--bg-raised`. Selected fills `--accent-bg` with an `--accent` border and a
small check. Big enough to tap confidently on a phone.

**Price response.** Three side-by-side cards, not a radio list. Selected gets
the `--accent-bg` fill and `--accent` border.

**Availability bars.** Horizontal, `--bg-sunken` track, `--accent` fill, count
in mono to the right. The winning window sits in a raised card with an
`--accent` left edge.

**The call panel.** Full-bleed `--d-bg`, no rounded corners on mobile,
`10px` on desktop. Contents:
- Status pill top-left: a `--d-accent` dot (slow 2s pulse while live) plus
  `ON THE CALL · 0:14`, elapsed time in mono.
- Timeline, newest at the bottom, auto-scrolling. Left gutter holds `+00:07`
  in `--d-text-secondary` mono, fixed width so the column stays aligned.
- Agent lines: `--d-text`, left-aligned, prefixed with a small `--d-accent`
  triangle and a `SNAPPLAN AGENT` label on the first one only.
- Venue lines: `--d-text-secondary`, indented 24px, labelled with the venue
  name on the first one only.
- Counter-offers: their own block, `--d-surface` fill, `1.5px --d-warning`
  left edge, a `⚡ COUNTER-OFFER` label in mono, then the plain-language
  summary.
- Terminal state: a solid full-width bar — `--d-success` for secured,
  `--d-danger` for failed, `--d-warning` for needs-attention — with the
  outcome in 19px weight 600.
- New lines fade and slide up 8px over 240ms. Nothing else moves.

**The pass.** The world scene full-bleed behind a `#0C0A09` scrim at 55%
opacity. Over it, a `--bg`-coloured card at `10px` radius with
`--shadow-lifted`: event title in Fraunces at 32px, then the confirmed date
and time as the largest element on screen, then party size, the reservation
name, dietary tags as pills, guest avatars in a row, and the confirmation
reference in mono. Designed to be screenshotted.

**Avatars.** Deterministic from `avatar_seed`: a flat circle filled from a
fixed six-colour set drawn from the palette, with the guest's initials in
white at weight 600. No photos, no gradients, no external image services.

## Anti-patterns

Do not: use purple-to-blue gradients on anything; use glassmorphism over
busy content; use neon or pure `#000`/`#FFF`; add a second accent colour;
add emoji as UI iconography; add a dark mode toggle; animate anything
continuously except the world scene's slow drift; use drop shadows on text;
centre long body copy; put a hairline border anywhere structural.
