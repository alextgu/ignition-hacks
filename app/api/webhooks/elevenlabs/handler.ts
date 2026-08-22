import {
  loadBookingConfig,
  type BookingEnv,
} from "../../../../src/integrations/elevenlabs/config";
import { verifyElevenLabsWebhook } from "../../../../src/integrations/elevenlabs/webhook";

type WebhookHandlerOptions = {
  getEnv: () => BookingEnv;
};

export function createElevenLabsWebhookHandler(options: WebhookHandlerOptions) {
  return async function handleElevenLabsWebhook(request: Request) {
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed." }, { status: 405 });
    }

    const config = loadBookingConfig(options.getEnv());
    const rawBody = await request.text();
    const signature =
      request.headers.get("elevenlabs-signature") ??
      request.headers.get("ElevenLabs-Signature");

    const verified = await verifyElevenLabsWebhook(
      rawBody,
      signature,
      config.webhookSecret,
    );

    if (!verified.ok) {
      return Response.json({ error: verified.error }, { status: 401 });
    }

    const event = verified.event as { type?: string; data?: unknown };
    return Response.json({
      received: true,
      type: event.type ?? null,
      // Persistence lands with the booking-attempt slice.
      persisted: false,
    });
  };
}
