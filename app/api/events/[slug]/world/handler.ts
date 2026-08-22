import type { PublicWorldState } from "../../../../../src/features/world/state";

type WorldStateService = {
  getPublicState(slug: string): Promise<PublicWorldState | null>;
};

/**
 * `GET /api/events/{slug}/world` — public canvas state for one event.
 *
 * Reachable by anyone holding the (unlisted) guest link and embedded
 * cross-origin by Base44, so the response is strictly the redacted
 * `PublicWorldState`; the redaction itself lives in
 * `src/features/world/state.ts`.
 *
 * Caching: `no-store`. The payload changes as guests RSVP and as the world
 * finishes generating, and the upstream poll is already throttled server
 * side, so an intermediary cache would only serve stale lanterns.
 */
export function createWorldStateHandler(service: WorldStateService) {
  return async function handleWorldState(request: Request, slug: string) {
    if (request.method !== "GET") {
      return Response.json({ error: "Method not allowed." }, { status: 405 });
    }

    try {
      const state = await service.getPublicState(slug);
      if (!state) {
        return Response.json({ error: "Event not found." }, { status: 404 });
      }
      return Response.json(state, {
        status: 200,
        headers: { "cache-control": "no-store" },
      });
    } catch {
      return Response.json(
        { error: "Unable to load the world right now." },
        { status: 500 },
      );
    }
  };
}
