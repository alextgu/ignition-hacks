"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicWorldState } from "../../../src/features/world/state";

/**
 * The embeddable world canvas.
 *
 * Deliberately dependency-free. World Labs' own renderer (SparkJS) needs
 * `three` plus a WebGL context, and this page's whole job is to be the thing
 * that always renders — inside a cross-origin iframe, on a phone, on a
 * judge's laptop with a tired GPU. So the ready world is drawn from the
 * equirectangular panorama World Labs returns alongside the splats: it is
 * the real generated scene, it pans with a drag, and it degrades to an image
 * rather than to a black rectangle. The splat URLs are carried through the
 * public API for a later SparkJS upgrade.
 *
 * Layered, back to front:
 *   1. The world — panorama, else thumbnail, else the generated planet.
 *   2. Guest lanterns — one per RSVP, ours, never regenerated upstream.
 *   3. Status and attribution.
 */

type Props = {
  slug: string;
  initialState: PublicWorldState;
  /** Server-rendered planet SVG, used whenever there is no ready world. */
  fallbackSvg: string;
};

const POLL_PENDING_MS = 5_000;
const POLL_SETTLED_MS = 20_000;

function usePrefersReducedMotion() {
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

/**
 * Lanterns sit on a fixed screen-space arc rather than on world coordinates.
 *
 * Marble does not tell us where the floor or the table is in a way we could
 * trust for placement, and a marker that lands inside a wall looks broken.
 * An arc is honest about being an overlay and stays legible at 320px.
 */
function lanternPosition(index: number, total: number) {
  if (total === 1) return { left: 50, bottom: 34 };
  const t = index / (total - 1);
  return {
    left: 12 + t * 76,
    bottom: 22 + Math.sin(t * Math.PI) * 16,
  };
}

export function WorldCanvas({ slug, initialState, fallbackSvg }: Props) {
  const [state, setState] = useState(initialState);
  const [offset, setOffset] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [panoFailed, setPanoFailed] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const dragging = useRef<{ pointerId: number; startX: number; startOffset: number } | null>(null);
  // Mirrors `offset` for the pointer handlers, which need the value at the
  // moment a drag starts. Synced after commit rather than during render.
  const offsetRef = useRef(0);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const { world, presentation, event } = state;
  // A generated world is only shown as one when a real key produced it.
  // Without a key the adapter's deterministic fallback is what came back,
  // and the honest thing to render is our own planet, clearly labelled.
  const generated = world.status === "ready" && world.live;
  const panoUrl = panoFailed ? null : world.panoUrl;
  const showPano = generated && Boolean(panoUrl);
  const showThumbnail = generated && !showPano && Boolean(world.thumbnailUrl);

  // Poll for RSVPs and for generation finishing. Faster while pending, then
  // slower — the server throttles its own upstream calls regardless, so this
  // interval only controls how quickly this tab notices.
  useEffect(() => {
    const interval = world.status === "pending" ? POLL_PENDING_MS : POLL_SETTLED_MS;
    let cancelled = false;

    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/events/${slug}/world`, {
          headers: { accept: "application/json" },
        });
        if (!response.ok) return;
        const next = (await response.json()) as PublicWorldState;
        if (!cancelled) setState(next);
      } catch {
        // Offline or mid-deploy. Keep showing the last good state.
      }
    }, interval);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [slug, world.status]);

  // Probe the panorama before trusting it. World Labs asset URLs can expire
  // and a CSS background gives no error hook, so a failed load would leave a
  // blank viewport; this falls back to the thumbnail (then the planet).
  useEffect(() => {
    const url = world.status === "ready" && world.live ? world.panoUrl : null;
    if (!url) return;

    let cancelled = false;
    const probe = new Image();
    probe.onerror = () => {
      if (!cancelled) setPanoFailed(true);
    };
    probe.src = url;
    return () => {
      cancelled = true;
      probe.onerror = null;
    };
  }, [world.status, world.live, world.panoUrl]);

  // Slow automatic drift, so the scene reads as a place rather than a
  // screenshot. Stops on interaction and never starts under reduced motion.
  useEffect(() => {
    if (!showPano || reducedMotion || hasInteracted) return;
    let frame = 0;
    const step = () => {
      setOffset((previous) => previous - 0.18);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [showPano, reducedMotion, hasInteracted]);

  const onPointerDown = useCallback(
    (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
      if (!showPano) return;
      dragging.current = {
        pointerId: pointerEvent.pointerId,
        startX: pointerEvent.clientX,
        startOffset: offsetRef.current,
      };
      pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
      setHasInteracted(true);
    },
    [showPano],
  );

  const onPointerMove = useCallback((pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragging.current;
    if (!drag || drag.pointerId !== pointerEvent.pointerId) return;
    setOffset(drag.startOffset + (pointerEvent.clientX - drag.startX));
  }, []);

  const endDrag = useCallback((pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current?.pointerId === pointerEvent.pointerId) dragging.current = null;
  }, []);

  const onKeyDown = useCallback(
    (keyEvent: React.KeyboardEvent<HTMLDivElement>) => {
      if (!showPano) return;
      if (keyEvent.key !== "ArrowLeft" && keyEvent.key !== "ArrowRight") return;
      keyEvent.preventDefault();
      setHasInteracted(true);
      const delta = keyEvent.key === "ArrowLeft" ? 48 : -48;
      setOffset((previous) => previous + delta);
    },
    [showPano],
  );

  const lanterns = presentation.attendees;
  const statusText = describeStatus(state);

  return (
    <div className={`world-root${reducedMotion ? " is-still" : ""}`}>
      <div
        className={`world-viewport${showPano ? " is-draggable" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        tabIndex={showPano ? 0 : -1}
        role={showPano ? "img" : undefined}
        aria-label={showPano ? `Generated world for ${event.title}. Drag or use arrow keys to look around.` : undefined}
      >
        {showPano ? (
          <div
            className="world-pano"
            style={{
              backgroundImage: `url("${panoUrl}")`,
              backgroundPositionX: `${offset}px`,
            }}
          />
        ) : showThumbnail ? (
          <div
            className="world-still"
            style={{ backgroundImage: `url("${world.thumbnailUrl}")` }}
          />
        ) : (
          <div
            className="world-planet"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: fallbackSvg }}
          />
        )}

        <div className="world-vignette" aria-hidden="true" />

        {lanterns.length > 1 && presentation.stage === "ready" ? (
          <svg className="world-constellation" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {lanterns.slice(0, -1).map((_, index) => {
              const from = lanternPosition(index, lanterns.length);
              const to = lanternPosition(index + 1, lanterns.length);
              return (
                <line
                  key={index}
                  x1={from.left}
                  y1={100 - from.bottom}
                  x2={to.left}
                  y2={100 - to.bottom}
                />
              );
            })}
          </svg>
        ) : null}

        <ul className="world-lanterns">
          {lanterns.map((attendee, index) => {
            const position = lanternPosition(index, lanterns.length);
            return (
              <li
                key={`${attendee.label}-${index}`}
                style={{ left: `${position.left}%`, bottom: `${position.bottom}%` }}
              >
                <button
                  type="button"
                  className={`lantern hue-${attendee.avatarIndex % 8}${active === index ? " is-active" : ""}`}
                  onClick={() => setActive(active === index ? null : index)}
                  aria-expanded={active === index}
                >
                  <span className="lantern-flame" aria-hidden="true" />
                  <span className="lantern-name">{attendee.label}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="world-header">
          <p className="world-title">{event.title}</p>
          <p className="world-sub">
            {presentation.attendeeCount === 0
              ? "No one has answered yet"
              : `${presentation.attendeeCount} of about ${event.groupSize} here`}
          </p>
        </div>

        <div className="world-footer">
          <span className={`world-status status-${world.live ? world.status : "pending"}`}>
            <span className="status-dot" aria-hidden="true" />
            {statusText}
          </span>
          {generated && world.marbleUrl && !world.marbleUrl.startsWith("data:") ? (
            <a className="world-link" href={world.marbleUrl} target="_blank" rel="noreferrer noopener">
              Open the full world
            </a>
          ) : null}
        </div>

        {showPano && !hasInteracted ? (
          <p className="world-hint" aria-hidden="true">Drag to look around</p>
        ) : null}
      </div>

      <style>{CANVAS_CSS}</style>
    </div>
  );
}

/**
 * Honest status text.
 *
 * A world is not ready until World Labs says it is, and a failed generation
 * says so rather than quietly showing the fallback as though it were the
 * real thing.
 */
function describeStatus(state: PublicWorldState): string {
  const { status, live, elapsedSeconds } = state.world;
  if (!live) return "Preview world — World Labs key not configured";
  if (status === "ready") return "World Labs world";
  if (status === "failed") return "Preview world — generation unavailable";
  if (elapsedSeconds !== null && elapsedSeconds > 30) {
    const minutes = Math.floor(elapsedSeconds / 60);
    return minutes >= 1
      ? `Generating with World Labs · ${minutes}m so far`
      : "Generating with World Labs · under a minute so far";
  }
  return "Generating with World Labs · usually about 5 minutes";
}

const CANVAS_CSS = `
.world-root {
  --ink: #0b0a09;
  --paper: #faf9f7;
  position: fixed;
  inset: 0;
  background: var(--ink);
  color: var(--paper);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  overflow: hidden;
}
.world-viewport {
  position: absolute;
  inset: 0;
  overflow: hidden;
  touch-action: none;
}
.world-viewport.is-draggable { cursor: grab; }
.world-viewport.is-draggable:active { cursor: grabbing; }
.world-viewport:focus-visible { outline: 3px solid #f6c177; outline-offset: -3px; }

.world-pano {
  position: absolute;
  inset: 0;
  background-repeat: repeat-x;
  background-size: auto 118%;
  background-position-y: center;
  will-change: background-position;
}
.world-still {
  position: absolute;
  inset: -4%;
  background-size: cover;
  background-position: center;
  animation: world-breathe 24s ease-in-out infinite alternate;
}
.world-planet { position: absolute; inset: 0; }
.world-planet svg { width: 100%; height: 100%; display: block; }

@keyframes world-breathe {
  from { transform: scale(1) translateX(0); }
  to { transform: scale(1.07) translateX(-1%); }
}

.world-vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(120% 80% at 50% 45%, transparent 40%, rgba(8, 7, 6, 0.55) 100%),
    linear-gradient(to bottom, rgba(8, 7, 6, 0.5), transparent 28%, transparent 62%, rgba(8, 7, 6, 0.75));
}

.world-constellation {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.world-constellation line {
  stroke: rgba(246, 193, 119, 0.5);
  stroke-width: 0.25;
  stroke-dasharray: 1.4 1.6;
}

.world-lanterns { position: absolute; inset: 0; margin: 0; padding: 0; list-style: none; }
.world-lanterns li { position: absolute; transform: translateX(-50%); }

.lantern {
  display: grid;
  justify-items: center;
  gap: 0.3rem;
  padding: 0.25rem;
  background: none;
  border: 0;
  cursor: pointer;
  color: inherit;
  font: inherit;
}
.lantern-flame {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: hsl(var(--hue, 38) 92% 68%);
  box-shadow: 0 0 14px 4px hsl(var(--hue, 38) 92% 62% / 0.55);
  animation: world-flicker 3.6s ease-in-out infinite alternate;
}
.hue-0 { --hue: 38; } .hue-1 { --hue: 12; } .hue-2 { --hue: 160; } .hue-3 { --hue: 340; }
.hue-4 { --hue: 200; } .hue-5 { --hue: 55; } .hue-6 { --hue: 280; } .hue-7 { --hue: 95; }

@keyframes world-flicker {
  from { opacity: 0.78; transform: scale(0.94); }
  to { opacity: 1; transform: scale(1.06); }
}

.lantern-name {
  font-size: 0.7rem;
  letter-spacing: 0.02em;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: rgba(10, 9, 8, 0.68);
  border: 1px solid rgba(250, 249, 247, 0.16);
  opacity: 0;
  transform: translateY(-3px);
  transition: opacity 160ms ease, transform 160ms ease;
  white-space: nowrap;
  max-width: 8rem;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lantern:hover .lantern-name,
.lantern:focus-visible .lantern-name,
.lantern.is-active .lantern-name { opacity: 1; transform: translateY(0); }
.lantern:focus-visible { outline: 2px solid #f6c177; outline-offset: 4px; border-radius: 10px; }

.world-header { position: absolute; top: 0; left: 0; right: 0; padding: 0.9rem 1rem; pointer-events: none; }
.world-title { margin: 0; font-size: 0.95rem; font-weight: 600; letter-spacing: 0.01em; }
.world-sub { margin: 0.15rem 0 0; font-size: 0.75rem; opacity: 0.72; }

.world-footer {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  font-size: 0.72rem;
}
.world-status {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  background: rgba(10, 9, 8, 0.66);
  border: 1px solid rgba(250, 249, 247, 0.16);
}
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.status-pending { color: #f6c177; }
.status-ready { color: #8fd4a8; }
.status-failed { color: #e8a0a0; }

.world-link {
  color: var(--paper);
  text-decoration: none;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  border: 1px solid rgba(250, 249, 247, 0.28);
}
.world-link:hover { background: rgba(250, 249, 247, 0.12); }
.world-link:focus-visible { outline: 2px solid #f6c177; outline-offset: 2px; }

.world-hint {
  position: absolute;
  left: 50%;
  bottom: 3.1rem;
  transform: translateX(-50%);
  margin: 0;
  font-size: 0.7rem;
  opacity: 0.6;
  animation: world-fade 5s ease-in-out 3s forwards;
  white-space: nowrap;
}
@keyframes world-fade { to { opacity: 0; } }

@media (max-width: 380px) {
  .world-title { font-size: 0.85rem; }
  .lantern-name { font-size: 0.65rem; max-width: 5rem; }
}

@media (prefers-reduced-motion: reduce) {
  .world-still, .lantern-flame, .world-hint { animation: none; }
}
.world-root.is-still .world-still,
.world-root.is-still .lantern-flame,
.world-root.is-still .world-hint { animation: none; }
`;
