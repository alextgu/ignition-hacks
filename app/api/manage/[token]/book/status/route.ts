import { env } from "cloudflare:workers";
import type { EnvLike } from "../../../../../../src/integrations/elevenlabs/config";
import { createBookStatusHandler } from "./handler";

const handle = createBookStatusHandler({
  getEnv: () => env as unknown as EnvLike,
});

export async function GET(request: Request) {
  return handle(request);
}
