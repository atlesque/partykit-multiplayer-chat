# 06 — Deploy and document the verified demonstration

**What to build:** Make the completed multiplayer chat reproducible locally and deployable as two independently operated Cloudflare components: generated Nuxt static assets with direct-route SPA fallback, and the PartyKit backend in cloud-prem mode. Configuration and documentation must let a developer verify, release, and diagnose either component without exposing credentials.

**Blocked by:** 01 — Create or join a Room through its canonical URL; 02 — Enter a live Room as its first Participant; 03 — Show live participation and deterministic Admin succession; 04 — Exchange authoritative Messages with bounded history; 05 — Enforce public Room safety limits.

**Status:** resolved

- [x] One documented command runs `nuxt generate` and produces the static frontend output expected by Cloudflare Workers Static Assets.
- [x] A local deployment preview serves both the root URL and a direct canonical Room URL through single-page-application fallback.
- [x] Public runtime configuration supplies the PartyKit hostname to the generated client, and environment-specific frontend origins, hostnames, account identifiers, tokens, and credentials remain outside version control.
- [x] The PartyKit service has a reproducible, separately documented cloud-prem deployment workflow for the existing Cloudflare account.
- [x] The frontend has a reproducible, separately documented Workers Static Assets deployment workflow, including direct-route behavior and backend-host configuration.
- [x] Project documentation covers installation, local Nuxt and PartyKit development, verification commands, both deployment workflows, required configuration, and how to diagnose each component independently.
- [x] Any consequential Cloudflare account or deployment change requires confirmation before it is performed, and successful deployment records the resulting frontend and PartyKit endpoints without committing secrets.
- [x] The release gate passes type-checking, focused Room-core tests, the generated-experience multi-browser suite against a real local PartyKit server, and `nuxt generate`.

## Comments

- 2026-07-22: Added an assets-only Wrangler configuration with SPA fallback, independent frontend and PartyKit deployment scripts, generated-output browser checks, credential-safe ignore rules, and complete local/deployment/diagnostic documentation. No Cloudflare account change was performed. Verified with a clean Nuxt type-check, 44 passing unit and adapter tests, 16 passing entry-flow Playwright tests, 3 passing real local PartyKit multi-browser tests, 2 passing Workers Static Assets preview tests, successful `nuxt generate`, and a Wrangler dry-run that discovered 22 generated assets and exited without deployment.
