# Ticket 06 Deploy Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the generated Nuxt chat reproducibly previewable and deployable as separate Cloudflare Workers Static Assets and PartyKit cloud-prem services, with safe configuration and complete operator documentation.

**Architecture:** Keep the frontend as an assets-only Worker configured by `wrangler.jsonc`, with `.output/public` as its generated asset directory and Cloudflare SPA fallback enabled. Keep PartyKit as an independent cloud-prem deployment; expose both release commands as package scripts, but never run a real deployment without confirmation. Prove the static host contract with a generated-output Playwright test against local Wrangler.

**Tech Stack:** Nuxt 4, PartyKit, Wrangler 4, Playwright, pnpm, Cloudflare Workers Static Assets.

---

### Task 1: Specify the generated-host preview behavior

**Files:**
- Create: `playwright.deploy.config.ts`
- Create: `tests/deployment/static-assets.spec.ts`

- [ ] **Step 1: Write the failing browser test**

Create a dedicated Playwright project whose web server first generates the Nuxt app and then starts the package's frontend preview command. Assert that `/` returns the home shell and that a canonical `/rooms/<uuid>` navigation returns HTTP 200 with the Room join gate.

- [ ] **Step 2: Run the deployment test and verify it fails**

Run: `pnpm test:deploy`

Expected: failure because the script and Wrangler preview configuration do not exist yet.

### Task 2: Add the Workers Static Assets deployment surface

**Files:**
- Create: `wrangler.jsonc`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add Wrangler 4 and explicit scripts**

Add Wrangler as a development dependency. Add `preview:frontend`, `test:deploy`, `deploy:frontend`, `deploy:frontend:dry-run`, and `deploy:partykit` scripts. The frontend deploy script runs generation before Wrangler; the PartyKit deploy script requires the operator to provide its cloud-prem domain and credentials through the documented CLI/environment contract.

- [ ] **Step 2: Configure assets-only SPA hosting**

Set the Worker name, current compatibility date, `.output/public` asset directory, and `single-page-application` not-found handling in `wrangler.jsonc`. Do not add account IDs, tokens, production origins, or hostnames.

- [ ] **Step 3: Run the deployment test and verify it passes**

Run: `pnpm test:deploy`

Expected: two passing browser checks, proving root and direct Room navigation against local Wrangler.

- [ ] **Step 4: Validate the deploy bundle without changing Cloudflare state**

Run: `pnpm deploy:frontend:dry-run`

Expected: Nuxt generation and Wrangler dry-run succeed without uploading or deploying.

### Task 3: Document independent operation and release safety

**Files:**
- Create: `README.md`
- Modify: `.scratch/partykit-multiplayer-chat/issues/06-deploy-verified-demo.md`

- [ ] **Step 1: Document installation, development, verification, preview, and configuration**

Explain local Nuxt and PartyKit startup, `NUXT_PUBLIC_PARTY_KIT_HOST`, PartyKit's `FRONTEND_ORIGIN`, generated output, the full verification gate, and component-specific diagnosis.

- [ ] **Step 2: Document the two separate deployment workflows**

Describe frontend generation/deployment and PartyKit cloud-prem deployment independently. Keep `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, production hostnames, and endpoints as shell-provided placeholders, and require human confirmation before any real deploy command.

- [ ] **Step 3: Resolve the ticket with evidence**

Check each acceptance criterion, set the ticket status to `resolved`, and append the exact fresh verification results under `## Comments`.

### Task 4: Run the release gate and publish

**Files:**
- Verify all scoped files above.

- [ ] **Step 1: Run fresh release verification**

Run: `pnpm typecheck && pnpm test:unit && pnpm test:e2e && pnpm test:live && pnpm test:deploy && pnpm generate && pnpm deploy:frontend:dry-run`

Expected: every command exits zero; the generated-experience multi-browser suite uses a real local PartyKit server.

- [ ] **Step 2: Inspect scope and secret hygiene**

Run `git diff --check`, inspect the full diff, and search tracked candidate files for credential-like values. Confirm no unrelated untracked files are staged.

- [ ] **Step 3: Commit and push master**

Stage only ticket-06 files, commit with a concise deployment-focused message, verify `master` is still based on `origin/master`, and push `master` to `origin` without force.
