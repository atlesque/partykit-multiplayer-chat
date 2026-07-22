# Room Safety Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce Room capacity, per-Participant rolling Message limits, hostile payload isolation, and configured production origin restrictions.

**Architecture:** Keep authoritative state limits in the framework-independent `RoomCore`, using typed errors and its injected clock. Keep protocol-shape and origin validation at the PartyKit transport boundary, mapping domain errors to stable close codes and recoverable server events.

**Tech Stack:** TypeScript, PartyKit, Vitest, Nuxt 4, Playwright

---

### Task 1: Capacity enforcement

**Files:**
- Modify: `server/room-core.test.ts`
- Modify: `server/room-core.ts`
- Modify: `party/index.test.ts`
- Modify: `party/index.ts`

- [ ] Add a failing core test that connects 50 Participants and expects the next connection to throw `RoomFullError` without changing state.
- [ ] Run `pnpm vitest run server/room-core.test.ts` and confirm the capacity test fails for missing behavior.
- [ ] Add `RoomFullError`, a 50-Participant guard before allocation, and adapter mapping to close code `4002` with `Room is full`.
- [ ] Run the focused core and adapter suites and confirm they pass.

### Task 2: Rolling rate limits

**Files:**
- Modify: `server/room-core.test.ts`
- Modify: `server/room-core.ts`
- Modify: `party/index.test.ts`
- Modify: `party/index.ts`

- [ ] Add failing clock-driven tests for the sixth accepted Message, the exact ten-second boundary, invalid attempts, Participant isolation, and cleanup.
- [ ] Run the focused core test and confirm the new cases fail for missing rate limiting.
- [ ] Add `RateLimitError` and per-Participant accepted timestamps, recording only after Message validation succeeds.
- [ ] Map `RateLimitError` to a recoverable `rate-limited` event and verify the focused suites pass.

### Task 3: Transport hardening and origin restriction

**Files:**
- Modify: `party/index.test.ts`
- Modify: `party/index.ts`

- [ ] Add failing tests for malformed JSON, binary data, unknown and extra fields, authority claims, configured origin mismatch, configured origin acceptance, and missing production configuration.
- [ ] Run the adapter suite and confirm the tests fail for the absent exact-shape and origin rules.
- [ ] Implement exact client-event validation plus local-only unconfigured origin behavior and close origin failures with code `4003`.
- [ ] Run adapter and client tests and confirm valid traffic remains compatible.

### Task 4: Tracker and release verification

**Files:**
- Modify: `.scratch/partykit-multiplayer-chat/issues/05-public-room-safety-limits.md`

- [ ] Run `pnpm test:unit`, `pnpm test:e2e`, `pnpm test:live`, `pnpm typecheck`, and `pnpm generate`.
- [ ] Mark every Ticket 05 acceptance criterion complete and append dated verification evidence.
- [ ] Review the final diff for secrets and unrelated changes, commit the intended files on `master`, and push `master`.

