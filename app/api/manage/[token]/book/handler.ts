import type { EventRecord } from "../../../../../src/features/events/contracts";
import {
  describeConfig,
  loadConfig,
  shouldUseRealAdapter,
  type EnvLike,
} from "../../../../../src/integrations/elevenlabs/config";

type BookService = {
  getManagedEvent(token: string): Promise<{ event: EventRecord } | null>;
};

type BookHandlerOptions = {
  getEnv: () => EnvLike;
};

/**
 * Management booking wireframe.
 *
 * Defaults to dry-run so Twilio/ElevenLabs credentials can be present without
 * placing a live call. Pass `{ "live": true }` only after the Twilio number is
 * imported into ElevenLabs and a test destination is configured.
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

    const config = loadConfig(options.getEnv());
    const readiness = describeConfig(config);

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

    if (!live) {
      return Response.json({
        booking: {
          ok: true,
          mode: "dry_run",
          request: {
            agentId: config.agentId ?? null,
            phoneNumberId: config.agentPhoneNumberId ?? null,
            toNumber,
          },
        },
        readiness,
        eventId: managed.event.id,
        note:
          'Dry run only. Pass { "live": true } after Twilio is linked in ElevenLabs.',
      });
    }

    if (!shouldUseRealAdapter(config)) {
      return Response.json(
        {
          error: "Live outbound calling is not configured yet.",
          missing: readiness.missingCredentials,
          readiness,
        },
        { status: 400 },
      );
    }

    return Response.json({
      booking: {
        ok: true,
        mode: "ready_for_live",
        request: {
          agentId: config.agentId ?? null,
          phoneNumberId: config.agentPhoneNumberId ?? null,
          toNumber,
        },
      },
      readiness,
      eventId: managed.event.id,
      note:
        "Live credentials look ready. Use src/integrations/elevenlabs startBookingCall with a locked booking brief to place the call.",
    });
  };
}
