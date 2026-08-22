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

export type GenerateWorldRequest = {
  display_name: string;
  model: WorldLabsModel;
  world_prompt: {
    type: "text";
    text_prompt: string;
  };
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
