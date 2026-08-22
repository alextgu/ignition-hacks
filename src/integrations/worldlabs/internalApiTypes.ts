/**
 * World Labs "World API" (Marble) response/request shapes.
 *
 * These types are deliberately NOT exported from `./index.ts`. Per the
 * integration boundary, no code outside `src/integrations/worldlabs/**`
 * should ever need to know these shapes — only `WorldSeed`/`WorldResult`
 * cross the boundary. Kept intentionally partial: only the fields this
 * adapter actually reads are modeled.
 *
 * Source: World Labs API quickstart (https://docs.worldlabs.ai/api) and
 * the World API announcement (https://www.worldlabs.ai/blog/announcing-the-world-api).
 */

export type WorldLabsModel = "marble-1.1" | "marble-1.1-plus";

/** How an individual image is referenced in a prompt. */
export type WorldLabsImageContent =
  | { source: "uri"; uri: string }
  | { source: "media_asset"; media_asset_id: string };

export type WorldLabsTextPrompt = {
  type: "text";
  text_prompt: string;
};

export type WorldLabsImagePrompt = {
  type: "image";
  image_prompt: WorldLabsImageContent;
  /** Optional steer; World Labs auto-captions when omitted. */
  text_prompt?: string;
  /** "auto" lets them detect an equirectangular panorama. */
  is_pano?: "auto";
};

export type WorldLabsMultiImagePrompt = {
  type: "multi-image";
  /** Up to 8. `azimuth` is degrees clockwise: 0 front, 90 right, 180 back. */
  multi_image_prompt: Array<{
    azimuth: number;
    content: WorldLabsImageContent;
  }>;
  text_prompt?: string;
};

export type WorldLabsPrompt =
  | WorldLabsTextPrompt
  | WorldLabsImagePrompt
  | WorldLabsMultiImagePrompt;

export type GenerateWorldRequest = {
  display_name: string;
  model: WorldLabsModel;
  world_prompt: WorldLabsPrompt;
};

export type WorldLabsErrorObject = {
  code?: string;
  message?: string;
};

export type WorldLabsAssets = {
  thumbnail_url?: string;
  caption?: string;
  imagery?: {
    pano_url?: string;
  };
  splats?: {
    /** Keyed by density, e.g. "100k", "500k", "full_res". */
    spz_urls?: Record<string, string>;
    semantics_metadata?: {
      scale?: number;
      ground_plane_offset?: number;
    };
  };
  mesh?: {
    collider_mesh_url?: string;
    hq_mesh_url?: string;
  };
};

/** Partial shape of the World object returned once generation completes. */
export type WorldLabsWorld = {
  world_id?: string;
  /** Shareable viewer URL, e.g. https://marble.worldlabs.ai/world/{world_id} */
  world_marble_url?: string;
  assets?: WorldLabsAssets;
};

/** Response from `POST /marble/v1/worlds:generate` and the operation-status poll. */
export type WorldLabsOperation = {
  operation_id: string;
  created_at?: string;
  done: boolean;
  error?: WorldLabsErrorObject | null;
  metadata?: {
    progress?: number;
    world_id?: string;
  };
  response?: WorldLabsWorld;
};
