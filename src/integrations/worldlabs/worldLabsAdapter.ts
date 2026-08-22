import type { WorldLabsConfig } from "./config.ts";
import { buildWorldDisplayName, buildWorldPrompt } from "./promptMapper.ts";
import type { WorldSeed, WorldResult, WorldLabsAdapter } from "./types.ts";
import { fetchJson } from "../shared/httpJson.ts";
import type {
  GenerateWorldRequest,
  WorldLabsImageContent,
  WorldLabsOperation,
  WorldLabsPrompt,
  WorldLabsWorld,
} from "./internalApiTypes.ts";
import type { WorldAssets, WorldImageInput } from "./types.ts";

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
      // Expansive outdoor scenes need the larger model; interiors don't.
      model: (seed.expansive
        ? "marble-1.1-plus"
        : this.config.model) as GenerateWorldRequest["model"],
      world_prompt: buildWorldPromptPayload(seed),
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
      { serviceLabel: "World Labs", timeoutMs: this.config.timeoutMs }
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
      { serviceLabel: "World Labs", timeoutMs: this.config.timeoutMs }
    );

    if (!result.ok) {
      return { status: "failed", error: result.message };
    }

    return operationToWorldResult(result.data);
  }
}

/**
 * Chooses the richest generation mode the seed supports.
 *
 * Fidelity escalates as the plan firms up: text is a guess from the host's
 * sentence, a venue photo makes it the real place, and guest photos taken at
 * the event reconstruct the room the group was actually in. Later stages win.
 */
export function buildWorldPromptPayload(seed: WorldSeed): WorldLabsPrompt {
  const textPrompt = buildWorldPrompt(seed);

  const guestPhotos = (seed.guestPhotos ?? []).slice(0, MAX_MULTI_IMAGE);
  if (guestPhotos.length >= 2) {
    return {
      type: "multi-image",
      multi_image_prompt: guestPhotos.map((photo, index) => ({
        azimuth: azimuthFor(photo.direction, index, guestPhotos.length),
        content: toImageContent(photo),
      })),
      text_prompt: textPrompt,
    };
  }

  // A lone guest photo is still better than pure text.
  const single = guestPhotos[0] ?? seed.venuePhoto;
  if (single) {
    return {
      type: "image",
      image_prompt: toImageContent(single),
      text_prompt: textPrompt,
      is_pano: "auto",
    };
  }

  return { type: "text", text_prompt: textPrompt };
}

/** World Labs caps multi-image builds at 8 inputs. */
const MAX_MULTI_IMAGE = 8;

const DIRECTION_AZIMUTH: Record<string, number> = {
  front: 0,
  right: 90,
  back: 180,
  left: 270,
};

/** Falls back to spreading photos evenly around the room when unlabelled. */
function azimuthFor(
  direction: string | undefined,
  index: number,
  total: number
): number {
  if (direction && direction in DIRECTION_AZIMUTH) {
    return DIRECTION_AZIMUTH[direction];
  }
  return Math.round((360 / Math.max(total, 1)) * index);
}

function toImageContent(input: WorldImageInput): WorldLabsImageContent {
  return input.source === "uri"
    ? { source: "uri", uri: input.uri }
    : { source: "media_asset", media_asset_id: input.mediaAssetId };
}

/**
 * Maps the vendor asset block onto our render contract. Everything is
 * optional — World Labs does not guarantee every asset for every world, and
 * a missing splat must degrade to the link-out viewer, not an error.
 */
function mapAssets(world: WorldLabsWorld): WorldAssets | undefined {
  const a = world.assets;
  if (!a) return undefined;

  const spz = a.splats?.spz_urls ?? {};
  const splatUrls = {
    low: spz["100k"],
    medium: spz["500k"],
    full: spz["full_res"],
  };
  const hasSplat = Boolean(splatUrls.low || splatUrls.medium || splatUrls.full);

  const assets: WorldAssets = {};
  if (hasSplat) assets.splatUrls = splatUrls;
  if (a.mesh?.collider_mesh_url) assets.colliderMeshUrl = a.mesh.collider_mesh_url;
  if (a.imagery?.pano_url) assets.panoUrl = a.imagery.pano_url;
  if (a.caption) assets.caption = a.caption;

  const sem = a.splats?.semantics_metadata;
  if (typeof sem?.scale === "number") assets.scale = sem.scale;
  if (typeof sem?.ground_plane_offset === "number") {
    assets.groundPlaneOffset = sem.ground_plane_offset;
  }

  return Object.keys(assets).length > 0 ? assets : undefined;
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

  const ready: WorldResult = {
    status: "ready",
    externalId,
    embedUrl: resolveEmbedUrl(operation.response),
    previewImageUrl: operation.response.assets?.thumbnail_url,
  };
  const assets = mapAssets(operation.response);
  if (assets) ready.assets = assets;
  return ready;
}

function resolveEmbedUrl(world: WorldLabsWorld): string | undefined {
  if (world.world_marble_url) return world.world_marble_url;
  if (world.world_id) return `https://marble.worldlabs.ai/world/${world.world_id}`;
  return undefined;
}
