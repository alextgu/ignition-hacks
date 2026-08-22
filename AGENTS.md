# AGENTS.md — standing rules for every agent working in this repo

Read this file and `SSOT.md` **before** doing anything else. `project.md` is
the product spec and does not change; `SSOT.md` is the live build state.

**Sites coordination spine note:** for this hackathon deployment repo, prefer
working directly on `main` unless the user explicitly asks for a branch or
worktree. Preserve concurrent changes from other agents before editing.

---

## Rule 0 — Update SSOT.md. Always.

**Every agent updates `SSOT.md` in the same commit as its work.** Not
afterwards, not "when it's finished" — in the commit.

Multiple agents work this repo in parallel and cannot see each other's
context. `SSOT.md` is the only shared memory. An undocumented change is
worse than no change, because the next agent will build on a false picture.

When you touch anything, update:

1. **Module status table** — flip your row's status, set the date.
2. **What works right now** — add what a human can actually do end to end.
3. **Contracts** — if you changed a boundary type, update it here verbatim.
4. **Environment variables** — add any new var, with default and purpose.
5. **Known gaps / next up** — remove what you fixed; add what you discovered.
6. **Demo readiness** — re-check the acceptance criteria you affected.

If you finish a session without editing `SSOT.md`, you did the task wrong.

---

## Rule 1 — Stay in your lane

Check the ownership table in `SSOT.md` before editing. Do not edit files
owned by another agent, even to fix an obvious bug. If you need a change in
someone else's module, write it under **Cross-module requests** in `SSOT.md`
and leave their files alone.

Shared files that anyone may append to (never rewrite wholesale):
`SSOT.md`, `AGENTS.md`, `.env.example`, `README.md`.

`package.json` / lockfiles are owned by the **coordination spine** agent
only. Everyone else: ask in `SSOT.md` first.

## Rule 2 — Work on a branch in a worktree

```sh
git worktree add -b codex/<area> ../ignition-hacks-<area> main
```

Commit only files you own. Merge to `main` with `--ff-only` when green. Never
force-push, never rewrite shared history.

## Rule 3 — Integrations live behind a boundary

Every external service (World Labs, ElevenLabs, anything new) follows the
same shape, and it is not optional:

```
src/integrations/<service>/
  types.ts             Public contract — the ONLY types that cross the boundary
  config.ts            Environment loading; never logs secrets
  internalApiTypes.ts  Vendor request/response shapes — NOT exported publicly
  <service>Adapter.ts  Real adapter
  mockAdapter.ts       Deterministic offline adapter
  index.ts             Public entry point + env-driven factory
  __tests__/           Unit tests with mocked fetch
```

Requirements:

- The app imports **only** `index.ts` and `types.ts`. Vendor types never leak.
- **A deterministic mock is mandatory**, and the factory selects it
  automatically when credentials are missing. The app must never know or care
  which adapter is live.
- **Adapters never throw.** Every failure — timeout, non-2xx, bad JSON,
  outage — becomes a controlled failed result. Use
  `src/integrations/shared/httpJson.ts`, which already does this.
- Every call has a timeout.

## Rule 4 — Secrets

- Read secrets from `process.env` only. Never hardcode, never commit.
- Never log a secret. Provide a `describe*Config()` that returns a redacted
  summary instead, and test that the key does not appear in its output.
- Document every new env var in `SSOT.md` **and** the module's setup doc.

## Rule 5 — Don't invent APIs

Look up the vendor's current official documentation before writing a request.
Do not guess endpoints, field names, or enum values. Cite the doc URL in a
comment or in the module's `docs/<service>-setup.md`. If the docs don't say,
write down that they don't say rather than assuming.

## Rule 6 — Tests, and no new dependencies

- Node's built-in runner. No framework:
  ```sh
  node --experimental-strip-types --test src/**/__tests__/*.test.ts
  ```
- **Never make live API calls in tests.** Mock `globalThis.fetch`.
- Test the two things that actually break: input→request mapping, and
  vendor-response→contract mapping. Plus every failure path.
- **No new runtime dependency without saying why in `SSOT.md` first.** Use
  native `fetch`, `node:crypto`, `node:test`.

### Node's type-stripping gotcha

TypeScript runs directly via `--experimental-strip-types`, which means:

- **Constructor parameter properties are not supported.** Write
  `private readonly x: T;` as a field plus a normal assignment in the
  constructor — `constructor(private readonly x: T) {}` throws at load.
- **Relative imports need the `.ts` extension**: `from "./types.ts"`.
- No enums, no namespaces, no decorators.

## Rule 7 — Demo reliability beats completeness

This is a hackathon. project.md is explicit: "Demo reliability matters more
than production completeness."

- Every external dependency needs a fallback that works offline.
- Never let a failing integration break the coordination flow.
- Never report success that didn't happen. A booking is not booked, and a
  world is not ready, until the external service says so.
- Prefer a smaller thing that always works to a bigger thing that sometimes
  works.

## Rule 8 — Be honest in SSOT.md

Write down what is actually true, including what's broken, faked, or
untested. Mark stubs as stubs. If you don't know another module's status,
write "unknown to this agent" rather than guessing. A confident wrong
`SSOT.md` costs more time than an empty one.
