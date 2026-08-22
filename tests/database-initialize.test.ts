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
  assert.equal(sql.length, 7);
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
