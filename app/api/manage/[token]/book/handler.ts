import {
  bookingReadinessSummary,
  loadBookingConfig,
  type BookingEnv,
} from "../../../../../src/integrations/elevenlabs/config";
import { dispatchOutboundCall } from "../../../../../src/integrations/elevenlabs/outbound";
import type { EventRecord } from "../../../../../src/features/events/contracts";

type BookService = {
  getManagedEvent(
    token: string,
  ): Promise<{ event: EventRecord } | null>;
};

type BookHandlerOptions = {
  getEnv: () => BookingEnv;
  fetchImpl?: typeof fetch;
};

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

    const config = loadBookingConfig(options.getEnv());
    const readiness = bookingReadinessSummary(config);

    let body: { live?: boolean; toNumber?: string } = {};
    const raw = await request.text();
    if (raw.trim()) {
      try {
        body = JSON.parse(raw) as typeof body;
      } catch {
        return Response.json(
          { error: "Send a valid booking request." },
          { status: 400 },
        );
      }
    }

    const live = body.live === true;
    const toNumber =
      typeof body.toNumber === "string" && body.toNumber.trim()
        ? body.toNumber.trim()
        : config.testToNumber;

    if (!toNumber) {
      return Response.json(
        {
          error:
            "Provide toNumber or set ELEVENLABS_TEST_TO_NUMBER for test calls.",
          readiness,
        },
        { status: 400 },
      );
    }

    const result = await dispatchOutboundCall(
      config,
      {
        toNumber,
        dynamicVariables: {
          event_title: managed.event.title,
          event_location: managed.event.location,
          party_size: String(managed.event.groupSize),
          budget_max: String(managed.event.priceMax),
        },
      },
      { live, fetchImpl: options.fetchImpl },
    );

    if (!result.ok) {
      return Response.json(
        {
          error: result.error,
          missing: result.missing,
          readiness,
        },
        { status: result.status && result.status >= 400 ? result.status : 400 },
      );
    }

    return Response.json({
      booking: result,
      readiness,
      eventId: managed.event.id,
      note:
        result.mode === "dry_run"
          ? "Dry run only. Pass { \"live\": true } after Twilio is linked in ElevenLabs."
          : "Live outbound call dispatched through ElevenLabs Twilio.",
    });
  };
}
