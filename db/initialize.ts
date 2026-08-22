type PreparedStatement = { run?: () => Promise<unknown> } | unknown;

export type D1SchemaBinding = object & {
  prepare(sql: string): PreparedStatement;
  batch(statements: PreparedStatement[]): Promise<unknown>;
};

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS events (
    id text PRIMARY KEY NOT NULL,
    public_slug text NOT NULL,
    management_token text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    location text NOT NULL,
    group_size integer NOT NULL,
    price_min integer NOT NULL,
    price_max integer NOT NULL,
    time_options_json text NOT NULL,
    status text DEFAULT 'coordinating' NOT NULL,
    world_status text DEFAULT 'pending' NOT NULL,
    world_embed_url text,
    world_preview_image_url text,
    world_external_id text,
    world_pano_url text,
    world_splat_low_url text,
    world_splat_medium_url text,
    world_caption text,
    world_error text,
    world_started_at text,
    world_completed_at text,
    world_last_checked_at text,
    created_at text NOT NULL,
    updated_at text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS attendees (
    id text PRIMARY KEY NOT NULL,
    event_id text NOT NULL,
    guest_id text NOT NULL,
    display_name text NOT NULL,
    selected_time_options_json text NOT NULL,
    price_response text NOT NULL,
    avatar_index integer NOT NULL,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS invitations (
    id text PRIMARY KEY NOT NULL,
    event_id text NOT NULL,
    invitation_token text NOT NULL,
    suggested_name text NOT NULL,
    created_at text NOT NULL,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_attendees_event_guest
    ON attendees(event_id, guest_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS invitations_token_unique
    ON invitations(invitation_token)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS events_public_slug_unique
    ON events(public_slug)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS events_management_token_unique
    ON events(management_token)`,
] as const;

/**
 * Additive column migrations for databases created before a column existed.
 *
 * `CREATE TABLE IF NOT EXISTS` above is a no-op on the deployed database,
 * which already holds real events — so new columns have to arrive as ALTERs.
 * SQLite has no `ADD COLUMN IF NOT EXISTS`, and these run outside the batch
 * on purpose: a batch is atomic, so one "duplicate column name" would roll
 * back the whole schema setup. Run individually, an already-applied ALTER is
 * just an expected error to swallow.
 *
 * Every entry must stay backwards compatible: nullable, no default that
 * changes existing rows, never a rename or a drop.
 */
const migrationStatements = [
  `ALTER TABLE events ADD COLUMN world_external_id text`,
  `ALTER TABLE events ADD COLUMN world_pano_url text`,
  `ALTER TABLE events ADD COLUMN world_splat_low_url text`,
  `ALTER TABLE events ADD COLUMN world_splat_medium_url text`,
  `ALTER TABLE events ADD COLUMN world_caption text`,
  `ALTER TABLE events ADD COLUMN world_error text`,
  `ALTER TABLE events ADD COLUMN world_started_at text`,
  `ALTER TABLE events ADD COLUMN world_completed_at text`,
  `ALTER TABLE events ADD COLUMN world_last_checked_at text`,
] as const;

async function applyMigrations(binding: D1SchemaBinding) {
  for (const statement of migrationStatements) {
    try {
      const prepared = binding.prepare(statement) as {
        run?: () => Promise<unknown>;
      };
      await prepared.run?.();
    } catch {
      // Already applied. This is the normal path on every request after the
      // first deploy, so it must stay silent rather than logged.
    }
  }
}

export function createDatabaseInitializer() {
  const initializations = new WeakMap<object, Promise<void>>();

  return function initializeDatabase(binding: D1SchemaBinding) {
    const existing = initializations.get(binding);
    if (existing) return existing;

    const initialization = binding
      .batch(schemaStatements.map((statement) => binding.prepare(statement)))
      .then(() => applyMigrations(binding))
      .then(() => undefined)
      .catch((error) => {
        initializations.delete(binding);
        throw error;
      });
    initializations.set(binding, initialization);
    return initialization;
  };
}

export const initializeDatabase = createDatabaseInitializer();
