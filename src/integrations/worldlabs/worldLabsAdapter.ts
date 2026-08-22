import type { WorldLabsConfig } from "./config.ts";
import { buildWorldDisplayName, buildWorldPrompt } from "./promptMapper.ts";
import type { WorldSeed, WorldResult, WorldLabsAdapter } from "./types.ts";
import { fetchJson } from "./httpClient.ts";
import type { GenerateWorldRequest, WorldLabsOperation, WorldLabsWorld } from "./internalApiTypes.ts";

/**
 * Real adapter backed by the World Labs "World API" (Marble).
 *
 * Flow (per https://docs.worldlabs.ai/api):
 *  1. generateWorld -> POST /marble/v1/worlds:generate
 *     Kicks off an async generation "operation" and returns immediately.
 *     Generation itself takes on the order of minutes, so this method does
 *     NOT wait for completion — it returns status "pending" with the
 *     operation id as `externalId` for the caller to poll.
 *  2. getWorldStatus -> GET /marble/v1/operations/{operation_id}
 *     Polls the operation. World Labs operations expire ~1 hour after
 *     creation, comfortably longer than the documented ~5 minute typical
 *     generation time.
 *
 * Every network failure (bad key, timeout, outage, malformed response) is
 * converted into `{ status: "failed", error }` — this adapter never throws,
 * so callers can treat World Labs the same way whether or not it responds.
 */
export class RealWorldLabsAdapter implements WorldLabsAdapter {
  private readonly config: WorldLabsConfig;

  constructor(config: WorldLabsConfig) {
    this.config = config;
  }

  async generateWorld(seed: WorldSeed): Promise<WorldResult> {
    if (!this.config.apiKey) {
      return {
        status: "failed",
        error: "World Labs API key is not configured (WORLDLABS_API_KEY).",
      };
    }

    const body: GenerateWorldRequest = {
      display_name: buildWorldDisplayName(seed),
      model: this.config.model as GenerateWorldRequest["model"],
      world_prompt: {
        type: "text",
        text_prompt: buildWorldPrompt(seed),
      },
    };

    const result = await fetchJson<WorldLabsOperation>(
      `${this.config.baseUrl}/marble/v1/worlds:generate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "WLT-Api-Key": this.config.apiKey,
        },
        body: JSON.stringify(body),
      },
      this.config.timeoutMs
    );

    if (!result.ok) {
      return { status: "failed", error: result.message };
    }

    return operationToWorldResult(result.data);
  }

  async getWorldStatus(externalId: string): Promise<WorldResult> {
    if (!this.config.apiKey) {
      return {
        status: "failed",
        error: "World Labs API key is not configured (WORLDLABS_API_KEY).",
      };
    }

    const result = await fetchJson<WorldLabsOperation>(
      `${this.config.baseUrl}/marble/v1/operations/${encodeURIComponent(externalId)}`,
      {
        method: "GET",
        headers: { "WLT-Api-Key": this.config.apiKey },
      },
      this.config.timeoutMs
    );

    if (!result.ok) {
      return { status: "failed", error: result.message };
    }

    return operationToWorldResult(result.data);
  }
}

function operationToWorldResult(operation: WorldLabsOperation): WorldResult {
  const externalId = operation.operation_id;

  if (!operation.done) {
    return { status: "pending", externalId };
  }

  if (operation.error) {
    return {
      status: "failed",
      externalId,
      error: operation.error.message || "World Labs reported a generation error.",
    };
  }

  if (!operation.response) {
    return {
      status: "failed",
      externalId,
      error: "World Labs marked generation as done but returned no world data.",
    };
  }

  return {
    status: "ready",
    externalId,
    embedUrl: resolveEmbedUrl(operation.response),
    previewImageUrl: operation.response.assets?.thumbnail_url,
  };
}

function resolveEmbedUrl(world: WorldLabsWorld): string | undefined {
  if (world.world_marble_url) return world.world_marble_url;
  if (world.world_id) return `https://marble.worldlabs.ai/world/${world.world_id}`;
  return undefined;
}
