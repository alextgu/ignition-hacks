import assert from "node:assert/strict";
import test from "node:test";
import { createDatabaseInitializer } from "../db/initialize.ts";

test("initializes the D1 schema once with separate prepared statements", async () => {
  const sql: string[] = [];
  let batches = 0;
  const binding = {
    prepare(statement: string) {
      sql.push(statement);
      return { statement };
    },
    async batch(statements: unknown[]) {
      batches += 1;
      assert.equal(statements.length, 7);
      return [];
    },
  };
  const initialize = createDatabaseInitializer();

  await initialize(binding);
  await initialize(binding);

  assert.equal(batches, 1);
  assert.match(sql[0], /CREATE TABLE IF NOT EXISTS events/i);
  assert.match(sql[1], /CREATE TABLE IF NOT EXISTS attendees/i);
  assert.match(sql[2], /CREATE TABLE IF NOT EXISTS invitations/i);
  assert.match(sql[3], /idx_attendees_event_guest/i);
  assert.match(sql[4], /invitations_token_unique/i);
  assert.match(sql[5], /events_public_slug_unique/i);
  assert.match(sql[6], /events_management_token_unique/i);
});

test("initializes persistent named invitations", async () => {
  const sql: string[] = [];
  const binding = {
    prepare(statement: string) {
      sql.push(statement);
      return { statement };
    },
    async batch() {
      return [];
    },
  };

  await createDatabaseInitializer()(binding);

  const schema = sql.join("\n");
  assert.match(schema, /CREATE TABLE IF NOT EXISTS invitations/i);
  assert.match(schema, /invitation_token/i);
  assert.match(schema, /suggested_name/i);
});

test("adds world columns outside the batch so an applied migration cannot roll back the schema", async () => {
  const sql: string[] = [];
  const runs: string[] = [];
  const binding = {
    prepare(statement: string) {
      sql.push(statement);
      return {
        async run() {
          runs.push(statement);
          // Every deploy after the first hits this: the column is already
          // there. It must not fail initialization.
          throw new Error("duplicate column name: world_external_id");
        },
      };
    },
    async batch() {
      return [];
    },
  };

  await createDatabaseInitializer()(binding);

  const alters = sql.filter((statement) => /ALTER TABLE/i.test(statement));
  assert.ok(alters.length >= 9, "every world column has a migration");
  assert.equal(runs.length, alters.length, "each ALTER runs on its own");
  assert.ok(alters.every((statement) => /ADD COLUMN/i.test(statement)));
  // Backwards compatibility: additive only, never a rename or a drop.
  assert.ok(!sql.some((statement) => /DROP COLUMN|RENAME/i.test(statement)));
  assert.ok(alters.some((statement) => /world_pano_url/.test(statement)));
});
