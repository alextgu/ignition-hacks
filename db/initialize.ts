type PreparedStatement = unknown;

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
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_attendees_event_guest
    ON attendees(event_id, guest_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS events_public_slug_unique
    ON events(public_slug)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS events_management_token_unique
    ON events(management_token)`,
] as const;

export function createDatabaseInitializer() {
  const initializations = new WeakMap<object, Promise<void>>();

  return function initializeDatabase(binding: D1SchemaBinding) {
    const existing = initializations.get(binding);
    if (existing) return existing;

    const initialization = binding
      .batch(schemaStatements.map((statement) => binding.prepare(statement)))
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
