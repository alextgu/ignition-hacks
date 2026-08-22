import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import {
  initializeDatabase,
  type D1SchemaBinding,
} from "./initialize";

function getBinding() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }
  return env.DB;
}

export function getDb() {
  return drizzle(getBinding(), { schema });
}

export function ensureDatabase() {
  return initializeDatabase(getBinding() as D1SchemaBinding);
}
