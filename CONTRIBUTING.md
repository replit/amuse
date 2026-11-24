# Contributing

Issues and pull requests are welcome. Please run `pnpm typecheck` and `pnpm build` before opening a PR.

For web UI changes, follow the [design system and page layout rules](docs/DESIGN.md).

## Database changes

Edit `lib/db/src/schema/*.ts`, then generate a migration:

```bash
pnpm db:generate
```

Commit the new file in `lib/db/migrations/`. The server applies pending migrations when it starts.

## Checks

```bash
pnpm format:check
pnpm typecheck
pnpm test        # unit tests in apps/server/test; no database, network or API key needed
```

CI runs these on every pull request. Add a unit test for any change to the sentinel, the network
guard, the vault or usage limits.

## End-to-end tests

`tests/e2e/happy-path.mjs` drives a real browser through every core flow: onboarding, chat, memory, web research, artifacts, PDFs, images, goals, reminders, approvals, connectors, the credential vault, spaces, side chats, sandboxed code, subagents, the live browser, podcasts, background work, search, voice mode, usage limits and reset.

It makes real model calls, so it spends API credits. Run it against a **fresh database**, with the server's test hooks and a daily limit turned on:

```bash
createdb amuse_test
DATABASE_URL=postgres://localhost/amuse_test AMUSE_E2E=1 AMUSE_DAILY_LIMIT=100000 pnpm dev
# in another terminal
pnpm test:e2e                      # all flows
STEPS=F01,F02,F03 pnpm test:e2e    # a subset (always include F01 and F02)
```

`AMUSE_E2E=1` mounts test-only routes under `/api/test`. They are never mounted when `NODE_ENV=production`.

`tests/e2e/gifs.mjs` and `tests/e2e/encode-gifs.py` re-record the README GIFs. The voice GIF (G4) plays `tests/e2e/fixtures/voice-turn-*.wav` as the microphone.
