"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * "View demo pipeline" — the six steps between a sentence and a booked table.
 *
 * This exists because of a real gap in the product rather than as decoration.
 * A live Marble generation measured 338 seconds, so the moment right after a
 * host hits create is dead time they have to sit through. This fills it with
 * the story of what is happening, and doubles as the explainer a judge can
 * watch without waiting for a real event to run.
 *
 * Dependency-free on purpose, matching `app/world/[slug]`: no carousel
 * library, no animation runtime. Auto-advance is a single interval that
 * stops the moment anyone interacts, and never starts under reduced motion.
 *
 * Every claim on these slides describes something that exists. If a step
 * regresses, edit the copy — do not leave a slide describing a feature we no
 * longer have.
 */

const ADVANCE_MS = 7_000;

type SlideKind = "seed" | "world" | "link" | "fill" | "call" | "pass";

type Slide = {
  key: string;
  eyebrow: string;
  title: string;
  body: string;
  meta: string;
  kind: SlideKind;
};

const SLIDES: Slide[] = [
  {
    key: "01",
    eyebrow: "Describe it",
    title: "Start with the vague version",
    body:
      "“A cozy birthday dinner in Toronto.” No date, no venue, no budget. Those are the things Plan-it works out — not things you have to bring.",
    meta: "Host writes one sentence",
    kind: "seed",
  },
  {
    key: "02",
    eyebrow: "World Labs",
    title: "Your planit gets built",
    body:
      "Marble turns that sentence into a real navigable room — the right light, the right materials, the right number of seats. It takes about five minutes, so the link works immediately and the world arrives into it.",
    meta: "marble-1.1 · 338s measured live",
    kind: "world",
  },
  {
    key: "03",
    eyebrow: "One link",
    title: "Everyone gets the same page",
    body:
      "No accounts. Guests tap the times that work and one of three buttons on price. Fifteen seconds, one thumb, and reopening the link edits their answer instead of adding a duplicate.",
    meta: "Works / Flexible / Too much",
    kind: "link",
  },
  {
    key: "04",
    eyebrow: "It fills in",
    title: "The planit comes alive",
    body:
      "Every reply lights the world. The host sees availability overlap, price comfort, and one plain sentence: whether this group is actually ready.",
    meta: "Availability overlap · price comfort",
    kind: "fill",
  },
  {
    key: "05",
    eyebrow: "ElevenLabs",
    title: "It makes the call",
    body:
      "An agent phones the venue inside limits the host set — a price ceiling it cannot cross, no card details, no times the group didn’t agree to. Everyone watches the negotiation arrive line by line.",
    meta: "Live transcript · counter-offers handled",
    kind: "call",
  },
  {
    key: "06",
    eyebrow: "Keepsake",
    title: "You get a pass",
    body:
      "The confirmed time, who came, and a calendar file that actually lands in your phone. Afterwards the group’s own photos can rebuild the room they were really in.",
    meta: "multi-image · up to 8 photos",
    kind: "pass",
  },
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function PipelineSlideshow() {
  const [index, setIndex] = useState(0);
  // Once someone picks a step, stop moving it under them.
  const [held, setHeld] = useState(false);
  const reducedMotion = useReducedMotion();
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (held || reducedMotion) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % SLIDES.length),
      ADVANCE_MS,
    );
    return () => window.clearInterval(timer);
  }, [held, reducedMotion]);

  const select = useCallback((next: number) => {
    setHeld(true);
    setIndex(next);
  }, []);

  // Keep the active tab in view on narrow screens, where the rail scrolls.
  useEffect(() => {
    const rail = railRef.current;
    const tab = rail?.children[index] as HTMLElement | undefined;
    tab?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [index]);

  const onKeyDown = useCallback(
    (keyEvent: React.KeyboardEvent<HTMLDivElement>) => {
      if (keyEvent.key === "ArrowRight") {
        select((index + 1) % SLIDES.length);
      } else if (keyEvent.key === "ArrowLeft") {
        select((index - 1 + SLIDES.length) % SLIDES.length);
      } else {
        return;
      }
      keyEvent.preventDefault();
    },
    [index, select],
  );

  const active = SLIDES[index];

  return (
    <section className="pipeline" aria-labelledby="pipeline-heading">
      <div className="pipeline-head">
        <p className="eyebrow">
          <span />
          View demo pipeline
        </p>
        <h2 id="pipeline-heading">What happens after you hit create</h2>
        <p className="pipeline-sub">
          Six steps, start to keepsake. Every one of them is built — nothing here
          is a mock-up of a feature that doesn’t exist yet.
        </p>
      </div>

      <div
        className="pipeline-rail"
        role="tablist"
        aria-label="Pipeline steps"
        ref={railRef}
        onKeyDown={onKeyDown}
      >
        {SLIDES.map((slide, position) => (
          <button
            key={slide.key}
            type="button"
            role="tab"
            id={`pipeline-tab-${slide.key}`}
            aria-selected={position === index}
            aria-controls={`pipeline-panel-${slide.key}`}
            tabIndex={position === index ? 0 : -1}
            className={[
              "pipeline-tab",
              position === index ? "is-active" : "",
              position < index ? "is-done" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => select(position)}
          >
            <b>{slide.key}</b>
            <span>{slide.eyebrow}</span>
          </button>
        ))}
      </div>

      <div className="pipeline-stage">
        <article
          className="pipeline-slide is-active"
          data-kind={active.kind}
          role="tabpanel"
          id={`pipeline-panel-${active.key}`}
          aria-labelledby={`pipeline-tab-${active.key}`}
          key={active.key}
        >
          <div className="pipeline-copy">
            <p className="pipeline-step">
              Step {active.key} &mdash; {active.eyebrow}
            </p>
            <h3>{active.title}</h3>
            <p>{active.body}</p>
            <p className="pipeline-meta">{active.meta}</p>
          </div>
          <PipelineScene kind={active.kind} />
        </article>
      </div>

      <div className="pipeline-foot">
        <div className="pipeline-progress" aria-hidden="true">
          <i style={{ width: `${((index + 1) / SLIDES.length) * 100}%` }} />
        </div>
        <span className="pipeline-count">
          {active.key} / {String(SLIDES.length).padStart(2, "0")}
        </span>
      </div>
    </section>
  );
}

/**
 * Each scene is a small abstraction of the real screen, not a screenshot.
 * Screenshots go stale silently; these stay honest because they carry no
 * data they could be wrong about.
 */
function PipelineScene({ kind }: { kind: SlideKind }) {
  if (kind === "world") {
    return (
      <div className="pp-scene pp-scene-world" aria-hidden="true">
        <div className="pp-orb" />
        <div className="pp-prog">
          <i style={{ width: "62%" }} />
        </div>
        <span className="pp-progtxt">generating &middot; 3:41</span>
      </div>
    );
  }

  if (kind === "link") {
    return (
      <div className="pp-scene pp-scene-link" aria-hidden="true">
        <div>
          <div className="pp-chip pp-on">Fri 7:00</div>
          <div className="pp-chip">Sat 7:30</div>
          <div className="pp-chip">Sun 6:00</div>
          <div className="pp-three">
            <span className="pp-on">Works</span>
            <span>Flexible</span>
            <span>Too much</span>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "fill") {
    return (
      <div className="pp-scene pp-scene-fill" aria-hidden="true">
        {[1, 1, 1, 0, 1, 2].map((state, position) => (
          <span key={position} className={`pp-dot pp-dot-${state}`} />
        ))}
        <div className="pp-bars">
          <div>
            <i style={{ width: "83%" }} />
          </div>
          <div>
            <i style={{ width: "33%" }} />
          </div>
        </div>
      </div>
    );
  }

  if (kind === "call") {
    return (
      <div className="pp-scene pp-scene-call" aria-hidden="true">
        <div className="pp-ln">
          <b>+00:05</b>
          <span className="pp-ag">Table for six on Friday at seven?</span>
        </div>
        <div className="pp-ln">
          <b>+00:07</b>
          <span className="pp-vn">Seven&rsquo;s tight &mdash; I could do 8:15.</span>
        </div>
        <div className="pp-ln">
          <b>+00:10</b>
          <span className="pp-ag">8:15 works. One vegan, no shellfish?</span>
        </div>
        <div className="pp-won">Secured &middot; table for 6, Fri 8:15</div>
      </div>
    );
  }

  if (kind === "pass") {
    return (
      <div className="pp-scene pp-scene-pass" aria-hidden="true">
        <div className="pp-pass">
          <small>Osteria Rialto</small>
          <strong>Fri Sept 11 &middot; 8:15 PM</strong>
          <span>Table for 6 &middot; under Simon</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pp-scene pp-scene-seed" aria-hidden="true">
      <div className="pp-quote">
        a cozy birthday dinner in&nbsp;Toronto
        <i />
      </div>
    </div>
  );
}
