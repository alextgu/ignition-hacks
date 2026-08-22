import type { EventRecord } from "../../../../../src/features/events/contracts";
import {
  buildEventBrief,
  resolveDestination,
  type BookRequestBody,
} from "../../../../../src/features/booking/brief";
import {
  describeConfig,
  loadConfig,
  type EnvLike,
} from "../../../../../src/integrations/elevenlabs/config";
import {
  createBookingAgentAdapter,
} from "../../../../../src/integrations/elevenlabs/index";
import type {
  BookingAgentAdapter,
  BookingCallResult,
} from "../../../../../src/integrations/elevenlabs/types";

type BookService = {
  getManagedEvent(token: string): Promise<{ event: EventRecord } | null>;
};

type BookHandlerOptions = {
  getEnv: () => EnvLike;
  createAdapter?: (env: EnvLike) => BookingAgentAdapter;
};

/**
 * Management booking endpoint.
 *
 * Defaults to dry-run. Pass `{ "live": true }` to dispatch through the
 * ElevenLabs adapter (real when credentials are present, mock otherwise).
 * Live destinations are limited to ELEVENLABS_TEST_TO_NUMBER unless
 * confirmRealVenue is explicitly true.
 */
export function createBookHandler(
  service: BookService,
  options: BookHandlerOptions,
) {
  return async function handleBook(request: Request, token: string) {
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed." }, { status: 405 });
    }

    const managed = await service.getManagedEvent(token);
    if (!managed) {
      return Response.json({ error: "Event not found." }, { status: 404 });
    }

    const env = options.getEnv();
    const config = loadConfig(env);
    const readiness = describeConfig(config);

    let body: BookRequestBody = {};
    const raw = await request.text();
    if (raw.trim()) {
      try {
        body = JSON.parse(raw) as BookRequestBody;
      } catch {
        return Response.json(
          { error: "Send a valid booking request." },
          { status: 400 },
        );
      }
    }

    const live = body.live === true;
    const destination = resolveDestination({
      requestedToNumber:
        typeof body.toNumber === "string"
          ? body.toNumber
          : typeof body.venuePhoneNumber === "string"
            ? body.venuePhoneNumber
            : undefined,
      testToNumber: config.testToNumber,
      confirmRealVenue: body.confirmRealVenue,
    });

    if (!destination.ok) {
      return Response.json(
        { error: destination.error, readiness },
        { status: 400 },
      );
    }

    const toNumber = destination.toNumber;
    const brief = buildEventBrief(managed.event, {
      toNumber,
      venueName: body.venueName,
      hostName: body.hostName,
      seatingPreference: body.seatingPreference,
      dietaryNotes: body.dietaryNotes,
    });

    if (!live) {
      return Response.json({
        booking: {
          ok: true,
          mode: "dry_run",
          request: {
            agentId: config.agentId ?? null,
            phoneNumberId: config.agentPhoneNumberId ?? null,
            toNumber,
            brief,
          },
        },
        readiness,
        eventId: managed.event.id,
        note:
          'Dry run only. Pass { "live": true } to dispatch a call (test number by default).',
      });
    }

    const adapter = (options.createAdapter ?? createBookingAgentAdapter)(env);
    const result: BookingCallResult = await adapter.startBookingCall(brief);
    const mode = readiness.usingRealAdapter ? "live" : "mock";

    if (result.status === "failed") {
      return Response.json(
        {
          error: result.error || "Booking call failed to start.",
          booking: { ok: false, mode, call: result },
          readiness,
          eventId: managed.event.id,
        },
        { status: 502 },
      );
    }

    return Response.json({
      booking: {
        ok: true,
        mode,
        call: result,
        request: {
          agentId: config.agentId ?? null,
          phoneNumberId: config.agentPhoneNumberId ?? null,
          toNumber,
        },
      },
      readiness,
      eventId: managed.event.id,
      statusUrl: result.externalId
        ? `/api/manage/${token}/book/status?callId=${encodeURIComponent(result.externalId)}`
        : null,
      note:
        mode === "live"
          ? "Live outbound call dispatched through ElevenLabs Twilio."
          : "Mock call started. Configure ElevenLabs credentials for a real call.",
    });
  };
}
