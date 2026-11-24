# Licenses and security

A summary of what Amuse ships and how it protects the person running it. CI repeats the checks
below on every pull request and every push to `main` and `develop`.

## Licenses

- **Amuse** is licensed under Apache-2.0 (`LICENSE`, `NOTICE`).
- **Dependencies.** Every package that ships in the server or the web app bundle is listed with its
  license in `THIRD_PARTY_LICENSES.md`. All are permissive (MIT, ISC, Apache-2.0, BSD-3-Clause,
  MIT-0, 0BSD, Unlicense, and OFL-1.1 for the Inter typeface). `@zone-eu/mailsplit` is dual-licensed
  "MIT OR EUPL-1.1+" and used under MIT. Nothing is GPL, AGPL, SSPL or BUSL.
- **Code and assets.** No third-party source is vendored. The avatar images were generated for this
  project with an AI image model, and the tip images are screenshots of Amuse. Credits and
  attributions (OpenClaw's workspace-file layout, Open-Meteo weather data) are in `NOTICE`.

## Checks

| Check                                            | Command                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| Known vulnerabilities in production dependencies | `pnpm audit --prod`                                              |
| Licenses of shipped packages                     | `pnpm licenses list --prod`                                      |
| Secrets in the tree and history                  | `gitleaks git --redact .`                                        |
| Formatting, types, unit tests, build             | `pnpm format:check && pnpm typecheck && pnpm test && pnpm build` |

The only key-like value in the repository is a deliberate fake (`sk-demo-SECRET-123456`) used by the
end-to-end suite.

## Security design

`SECURITY.md` describes the full model. In short:

- **Local only.** One owner, no login, bound to `127.0.0.1`, with Host, Origin and Sec-Fetch-Site
  checks and JSON-only writes so other websites can't drive the agent.
- **Public network only.** Every agent request, including every connection from its browser, is
  resolved, checked and pinned to a public address.
- **Credentials.** Encrypted at rest, shown to the model only as stand-in tokens, sent only in the
  auth header to the exact host the owner confirmed, and asked about on first use.
- **Approvals.** Payments, form submissions, sends, schedules, instruction-file changes, requests to
  sites the owner didn't name, and memory changes after reading outside content ask the owner.
  Payment detection is a heuristic.
- **Isolation.** Generated pages run in a CSP sandbox with no fetch, no external resources, no
  same-origin access and no navigation to other sites; agent
  code runs in QuickJS WebAssembly; Chromium uses its own sandbox where it can start (not in Docker).

Unit tests in `apps/server/test` cover the network guard, credential binding and substitution,
secret scrubbing, approval classification, the private-data check and the spend cap.
