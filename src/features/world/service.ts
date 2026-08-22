import type {
  AttendeeRecord,
  EventRecord,
  WorldStatePatch,
} from "../events/contracts";
import type { WorldResult } from "../../integrations/worldlabs/types";
import { buildWorldSeed } from "./seed";
import { buildPublicWorldState, type PublicWorldState } from "./state";

/**
 * The app-side half of the World Labs integration: it decides *when* a world
 * is generated and *where* the result is kept. The adapter under
 * `src/integrations/worldlabs` decides how to talk to World Labs, and this
 * file never reaches past its public contract.
 *
 * Two rules shape everything here, both from `project.md`'s "demo
 * reliability matters more than production completeness":
 *
 *  - **Exactly one generation per event.** Marble generation is slow and
 *    chargeable. It starts once, at event creation, and an event that
 *    already has an operation id is never started again — no matter how
 *    many RSVPs arrive or how many times the canvas is opened.
 *  - **World Labs can never break coordination.** Every call is wrapped;
 *    a failure is stored as a failed world and the event goes on working.
 *    Creating an event must not return an HTTP error because an image
 *    model was down.
 */

/** Minimum gap between polls of the same pending operation. */
export const WORLD_POLL_INTERVAL_MS = 10_000;

export type WorldRepository = {
  findEventBySlug(slug: string): Promise<EventRecord | null>;
  listAttendees(eventId: string): Promise<AttendeeRecord[]>;
  updateWorldState(eventId: string, patch: WorldStatePatch): Promise<void>;
};

export type WorldAdapterLike = {
  generateWorld(seed: ReturnType<typeof buildWorldSeed>): Promise<WorldResult>;
  getWorldStatus(externalId: string): Promise<WorldResult>;
};

export type WorldServiceDependencies = {
  repository: WorldRepository;
  /** Lazy so the adapter is built from request-time env, not at import time. */
  adapter: () => WorldAdapterLike;
  now?: () => string;
  pollIntervalMs?: number;
  /** Whether a real World Labs key is configured. Drives honest labelling. */
  isLive?: () => boolean;
};

/** Maps an adapter result onto the columns we persist. */
export function worldResultToPatch(
  result: WorldResult,
  now: string,
): WorldStatePatch {
  const base: WorldStatePatch = {
    worldStatus: result.status,
    worldLastCheckedAt: now,
  };
  if (result.externalId) base.worldExternalId = result.externalId;

  if (result.status === "ready") {
    return {
      ...base,
      worldEmbedUrl: result.embedUrl ?? null,
      worldPreviewImageUrl: result.previewImageUrl ?? null,
      worldPanoUrl: result.assets?.panoUrl ?? null,
      worldSplatLowUrl: result.assets?.splatUrls?.low ?? null,
      worldSplatMediumUrl: result.assets?.splatUrls?.medium ?? null,
      worldCaption: result.assets?.caption ?? null,
      worldError: null,
      worldCompletedAt: now,
    };
  }

  if (result.status === "failed") {
    return {
      ...base,
      // Stored for the host-facing setup message only; never served publicly.
      worldError: result.error ?? "World Labs generation failed.",
      worldCompletedAt: now,
    };
  }

  return base;
}

function applyPatch(event: EventRecord, patch: WorldStatePatch): EventRecord {
  return { ...event, ...patch };
}

export function createWorldService(dependencies: WorldServiceDependencies) {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const pollIntervalMs = dependencies.pollIntervalMs ?? WORLD_POLL_INTERVAL_MS;
  const isLive = dependencies.isLive ?? (() => false);

  /**
   * True when a pending operation is due for another poll. An event that has
   * never been checked is always due; otherwise the stored timestamp gates
   * it, so N simultaneous canvas viewers cause at most one upstream call
   * per interval rather than N.
   */
  function isDueForPoll(event: EventRecord, at: string): boolean {
    if (event.worldStatus !== "pending") return false;
    if (!event.worldExternalId) return false;
    if (!event.worldLastCheckedAt) return true;

    const last = Date.parse(event.worldLastCheckedAt);
    const current = Date.parse(at);
    if (Number.isNaN(last) || Number.isNaN(current)) return true;
    return current - last >= pollIntervalMs;
  }

  return {
    isDueForPoll,

    /**
     * Starts generation for a freshly created event. Idempotent: an event
     * that already carries an operation id is left alone.
     *
     * Returns the patch that was written (or null when nothing was done) so
     * callers can log it; the event row is updated either way.
     */
    async startGeneration(event: EventRecord): Promise<WorldStatePatch | null> {
      if (event.worldExternalId) return null;

      const startedAt = now();
      try {
        const result = await dependencies.adapter().generateWorld(
          buildWorldSeed(event),
        );
        const patch: WorldStatePatch = {
          ...worldResultToPatch(result, startedAt),
          worldStartedAt: startedAt,
        };
        await dependencies.repository.updateWorldState(event.id, patch);
        return patch;
      } catch {
        // Adapters are contractually non-throwing, so reaching here means a
        // bug rather than an outage. Record it and keep the event usable.
        const patch: WorldStatePatch = {
          worldStatus: "failed",
          worldError: "World generation could not be started.",
          worldStartedAt: startedAt,
          worldLastCheckedAt: startedAt,
          worldCompletedAt: startedAt,
        };
        await dependencies.repository
          .updateWorldState(event.id, patch)
          .catch(() => undefined);
        return patch;
      }
    },

    /**
     * Polls a pending operation at most once per interval and persists any
     * new state. Returns the event as it should now be read.
     */
    async refresh(event: EventRecord): Promise<EventRecord> {
      const at = now();
      if (!isDueForPoll(event, at)) return event;

      try {
        const result = await dependencies.adapter().getWorldStatus(
          event.worldExternalId as string,
        );
        const patch = worldResultToPatch(result, at);
        await dependencies.repository.updateWorldState(event.id, patch);
        return applyPatch(event, patch);
      } catch {
        // Don't fail the canvas over a poll. Record the attempt so a broken
        // upstream can't be re-hit on every single request.
        const patch: WorldStatePatch = { worldLastCheckedAt: at };
        await dependencies.repository
          .updateWorldState(event.id, patch)
          .catch(() => undefined);
        return applyPatch(event, patch);
      }
    },

    /**
     * Safety net for events that never got a generation started — events
     * created before this slice shipped, or ones whose creation-time start
     * failed outright. `worldStartedAt` is the guard: it is written on the
     * first attempt whatever the outcome, so a permanently failing world is
     * attempted once, not once per page view.
     */
    async ensureStarted(event: EventRecord): Promise<EventRecord> {
      if (event.worldExternalId || event.worldStartedAt) return event;
      const patch = await this.startGeneration(event);
      return patch ? applyPatch(event, patch) : event;
    },

    /** Everything the embeddable canvas needs, already redacted. */
    async getPublicState(slug: string): Promise<PublicWorldState | null> {
      const found = await dependencies.repository.findEventBySlug(slug);
      if (!found) return null;

      const event = await this.refresh(await this.ensureStarted(found));
      const attendees = await dependencies.repository.listAttendees(event.id);
      return buildPublicWorldState(event, attendees, now(), isLive());
    },
  };
}

export type WorldService = ReturnType<typeof createWorldService>;
