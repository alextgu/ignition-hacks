import { env } from "cloudflare:workers";
import type { BookingEnv } from "../../../../src/integrations/elevenlabs/config";
import { createElevenLabsWebhookHandler } from "./handler";

const handle = createElevenLabsWebhookHandler({
  getEnv: () => env as BookingEnv,
});

export async function POST(request: Request) {
  return handle(request);
}
